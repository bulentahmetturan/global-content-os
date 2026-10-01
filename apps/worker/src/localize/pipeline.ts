/**
 * Hybrid Turkish localization pipeline (production contract, 2026-10-02).
 *
 *   language gate -> Turkish title (own path, own validation) -> extractive evidence -> grounded 1-2 sentence summary
 *   -> contract validation -> grounding judge -> outcome
 *
 * The title and the summary are independent: a failed summary never discards a valid Turkish title, and the source
 * excerpt is never the summary. When evidence is missing the summary is not attempted (fail closed).
 * No database access here: callers store the result (enrich.ts) or just measure it (lifecycle canary endpoint).
 */
import type { Env } from '../db/queries';
import { detectItemLanguage, type Language } from './language';
import { trimToSentences, validateSummaryTr, validateTitleTr } from './contract';
import { assessEvidence, garbleSignals, inventedNumbers, LOCALIZATION_CONTRACT_VERSION, preservationIssues, type EvidenceAssessment } from './evidence';

export interface Models {
  title: string;
  summary: string;
  judge: string;
}

export const DEFAULT_MODELS: Models = {
  title: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  summary: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  judge: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

type ModelEnv = { ENRICH_MODEL?: string; ENRICH_MODEL_TITLE?: string; ENRICH_MODEL_SUMMARY?: string; ENRICH_MODEL_JUDGE?: string };

/**
 * Model defaults live in code and in operator-set Worker vars only. Nothing in the feedback path writes either:
 * a model change is a reviewed commit/deploy (P5 guardrail, localization-guardrails.test.mjs).
 */
export function modelsFor(env: unknown): Models {
  const e = env as ModelEnv;
  return {
    title: e.ENRICH_MODEL_TITLE || e.ENRICH_MODEL || DEFAULT_MODELS.title,
    summary: e.ENRICH_MODEL_SUMMARY || e.ENRICH_MODEL || DEFAULT_MODELS.summary,
    judge: e.ENRICH_MODEL_JUDGE || e.ENRICH_MODEL || DEFAULT_MODELS.judge,
  };
}

export type ItemOutcome = 'NOT_REQUIRED' | 'READY' | 'TITLE_ONLY' | 'INSUFFICIENT_EVIDENCE' | 'FAILED';

export interface LocalizeInput {
  title: string;
  excerpt: string;
}

export interface LocalizationResult {
  contract_version: string;
  language: Language;
  outcome: ItemOutcome;
  /** Present for READY / TITLE_ONLY / INSUFFICIENT_EVIDENCE; never a title that failed validation. */
  titleTr: string | null;
  /** Present only for READY. */
  summaryTr: string | null;
  failure: string | null;
  evidence: { id: string; sufficient: boolean; reason: string | null; passages: number };
  validator: { title: string | null; summary: string | null; preservation: string[]; garble: string[] };
  judge: { verdict: 'SUPPORTED' | 'UNSUPPORTED' | 'SKIPPED'; attempts: number };
  models: Models;
  attempts: { title: number; summary: number };
  produced_at: string;
}

type Ai = { run: (model: string, args: Record<string, unknown>) => Promise<unknown> };

function textFromAi(out: unknown): string {
  if (typeof out === 'string') return out.trim();
  if (!out || typeof out !== 'object') return String(out ?? '');
  const o = out as Record<string, unknown>;
  if (typeof o.response === 'string') return o.response.trim();
  if (typeof o.result === 'string') return o.result.trim();
  const choice = (o.choices as Array<{ message?: { content?: string | null } }> | undefined)?.[0];
  if (typeof choice?.message?.content === 'string') return choice.message.content.trim();
  if (o.response && typeof o.response === 'object') {
    const inner = o.response as Record<string, unknown>;
    if (typeof inner.response === 'string') return inner.response.trim();
  }
  return JSON.stringify(out);
}

export async function runModel(env: Env, model: string, system: string, user: string): Promise<string> {
  const ai = (env as unknown as { AI?: Ai }).AI;
  if (!ai) throw new Error('AI_BINDING_MISSING');
  const out = await ai.run(model, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 500,
    temperature: 0.1,
  });
  const text = textFromAi(out);
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return text;
}

function firstJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = (fence?.[1] || text).trim();
  const a = c.indexOf('{');
  const b = c.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(c.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const TITLE_SYSTEM =
  'Translate the title into natural Turkish. Keep organisation, product, drug, publication and person names, acronyms, codes and numbers exactly as in the source (place names may be translated). ' +
  'Do not add, remove or reinterpret information. Return ONLY the Turkish title on one line: no quotes, no JSON, no explanation.';

async function generateTitle(env: Env, model: string, title: string, strict: boolean): Promise<string> {
  const out = await runModel(
    env,
    model,
    strict ? `${TITLE_SYSTEM} Your previous answer was rejected: leave no English words except proper names, and keep every number and acronym.` : TITLE_SYSTEM,
    title.slice(0, 400)
  );
  if (/^\s*[\[{]/.test(out)) return '';
  const line = out.split('\n').map((x) => x.trim()).find(Boolean) || '';
  return line.replace(/^["“'`]+|["”'`]+$/g, '').trim();
}

/** Closed-form check that a Turkish title keeps the meaning of the source title (observed: "measles" rendered as smallpox). */
async function judgeTitle(env: Env, model: string, titleOrig: string, titleTr: string): Promise<boolean> {
  const out = await runModel(
    env,
    model,
    'You are a strict bilingual (English-Turkish) medical translation checker. Compare the Turkish TITLE with the English SOURCE TITLE. ' +
      'Answer WRONG if the Turkish title changes the meaning, swaps or loses a disease, drug, organisation, person, number or quantity, reverses who did what to whom, or mistranslates a technical term. ' +
      'Also answer WRONG if any ordinary English word (not a proper name, acronym or code) is left untranslated in the Turkish title. ' +
      'Answer CORRECT only if the Turkish title says the same thing as the source title. Reply with exactly one word: CORRECT or WRONG.',
    `SOURCE TITLE: ${titleOrig}\nTURKISH TITLE: ${titleTr}\n\nAnswer:`
  );
  return /^\W*CORRECT\b/i.test(out.trim());
}

function summarySystem(strict: boolean): string {
  return `Sen bir Türkçe editörsün. Sadece EVIDENCE bölümündeki cümlelere dayan.
SADECE geçerli JSON döndür: {"gistTr":"..."}.
Kurallar:
- gistTr: içeriğin asıl özünü anlatan 1-2 tam Türkçe cümle (toplam en fazla ~250 karakter, en az 8 kelime), nokta ile biter.
- EVIDENCE'da olmayan hiçbir olgu, sayı, kurum, eylem, sonuç, neden veya yorum ekleme. Çevirmen gibi değil, özetleyen editör gibi yaz; metni kopyalama.
- Özne ve eylemin yönünü kaynaktaki gibi koru (kim kime ne yaptı); özne/nesneyi ters çevirme, artış/azalışı tersine çevirme.
- Sayıları, kurum/ürün/ilaç adlarını ve kısaltmaları aynen koru.
- Türkçe yaz; İngilizce kelime bırakma (özel adlar hariç).
- Emin değilsen veya EVIDENCE özet çıkarmaya yetmiyorsa {"gistTr":""} döndür.${
    strict ? '\n- ÖNCEKİ DENEME GEÇERSİZDİ: daha kısa ve daha temkinli yaz, yalnız EVIDENCE\'da açıkça yazılanı söyle.' : ''
  }`;
}

async function generateSummary(env: Env, model: string, titleOrig: string, ev: EvidenceAssessment, strict: boolean): Promise<string> {
  const raw = await runModel(env, model, summarySystem(strict), `ORIGINAL_TITLE: ${titleOrig}\nEVIDENCE:\n${ev.passages.map((p) => `- ${p}`).join('\n')}\n\nJSON:`);
  const g = firstJson(raw)?.gistTr;
  return typeof g === 'string' ? trimToSentences(g.trim()) : '';
}

/** Closed-form entailment question; fail closed on anything but an explicit SUPPORTED. */
async function judgeGrounded(env: Env, model: string, titleOrig: string, ev: EvidenceAssessment, gistTr: string): Promise<boolean> {
  const out = await runModel(
    env,
    model,
    'You are a strict fact checker. Compare a Turkish SUMMARY with its English SOURCE (title and evidence sentences). ' +
      'Answer UNSUPPORTED if the SUMMARY states any fact, result, action, number, actor or cause that the SOURCE does not state, or contradicts the SOURCE. ' +
      'Check who did what to whom: UNSUPPORTED if subject and object are swapped, or if the direction of a change or effect is reversed. ' +
      'Also UNSUPPORTED if the SUMMARY presents something as an observed finding or as something people do, when the SOURCE only names a topic, a guide or an analysis. ' +
      'Answer SUPPORTED only if every claim in the SUMMARY is stated by the SOURCE. Reply with exactly one word: SUPPORTED or UNSUPPORTED.',
    `SOURCE TITLE: ${titleOrig}\nSOURCE EVIDENCE:\n${ev.passages.map((p) => `- ${p}`).join('\n')}\nSUMMARY (Turkish): ${gistTr}\n\nAnswer:`
  );
  return /^\W*SUPPORTED\b/i.test(out.trim());
}

export async function localizeItem(env: Env, input: LocalizeInput, now: () => string = () => new Date().toISOString()): Promise<LocalizationResult> {
  const models = modelsFor(env);
  const title = (input.title || '').trim();
  const language = detectItemLanguage(title, input.excerpt || '');
  const base: LocalizationResult = {
    contract_version: LOCALIZATION_CONTRACT_VERSION,
    language,
    outcome: 'FAILED',
    titleTr: null,
    summaryTr: null,
    failure: null,
    evidence: { id: '', sufficient: false, reason: null, passages: 0 },
    validator: { title: null, summary: null, preservation: [], garble: [] },
    judge: { verdict: 'SKIPPED', attempts: 0 },
    models,
    attempts: { title: 0, summary: 0 },
    produced_at: now(),
  };
  // 1. Turkish source: no translation.
  if (language === 'tr') return { ...base, outcome: 'NOT_REQUIRED' };

  // 2. Turkish title (independent of the summary).
  let titleTr: string | null = null;
  let titleFail = 'TITLE_EMPTY';
  for (const strict of [false, true]) {
    base.attempts.title++;
    const cand = await generateTitle(env, models.title, title, strict);
    const bad = validateTitleTr(cand, title);
    const pres = preservationIssues(title, cand);
    const garble = garbleSignals(cand);
    base.validator.title = bad;
    base.validator.preservation = pres;
    base.validator.garble = garble;
    if (!bad && !pres.length && !garble.length) {
      if (await judgeTitle(env, models.judge, title, cand)) {
        titleTr = cand;
        break;
      }
      titleFail = 'TITLE_MEANING_CHANGED';
      base.validator.title = titleFail;
      continue;
    }
    titleFail = bad || pres[0] || garble[0];
  }
  if (!titleTr) return { ...base, outcome: 'FAILED', failure: `TITLE:${titleFail}` };
  base.titleTr = titleTr;

  // 3. Extractive evidence: no evidence, no summary.
  const ev = assessEvidence(title, input.excerpt || '');
  base.evidence = { id: ev.id, sufficient: ev.sufficient, reason: ev.reason, passages: ev.passages.length };
  if (!ev.sufficient) return { ...base, outcome: 'INSUFFICIENT_EVIDENCE', failure: `EVIDENCE:${ev.reason}` };

  // 4-6. Grounded summary, contract validation, grounding judge (bounded: two attempts).
  const evidenceText = ev.passages.join(' ');
  let failure = 'SUMMARY_EMPTY';
  for (const strict of [false, true]) {
    base.attempts.summary++;
    const gist = await generateSummary(env, models.summary, title, ev, strict);
    if (!gist) {
      failure = 'SUMMARY_ABSTAINED';
      continue;
    }
    const bad = validateSummaryTr(gist, { titleOrig: title, titleTr, excerpt: evidenceText });
    const invented = inventedNumbers(`${title} ${evidenceText}`, gist);
    const garble = garbleSignals(gist);
    base.validator.summary = bad || invented[0] || garble[0] || null;
    if (bad || invented.length || garble.length) {
      failure = bad || invented[0] || garble[0];
      continue;
    }
    base.judge.attempts++;
    if (!(await judgeGrounded(env, models.judge, title, ev, gist))) {
      base.judge.verdict = 'UNSUPPORTED';
      failure = 'SUMMARY_UNSUPPORTED';
      continue;
    }
    base.judge.verdict = 'SUPPORTED';
    return { ...base, outcome: 'READY', summaryTr: gist, failure: null };
  }
  return { ...base, outcome: 'TITLE_ONLY', failure: `SUMMARY:${failure}` };
}
