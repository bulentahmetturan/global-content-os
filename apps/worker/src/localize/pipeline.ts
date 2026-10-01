/**
 * Turkish localization pipeline (contract tr-loc/2026-10-02.2).
 *
 *   language gate -> Turkish title (translation path, title.ts) -> evidence acquisition (acquire.ts) -> 2-5 extractive spans
 *   -> source-type summary policy -> grounded 1-2 sentence summary -> contract + terminology validation -> grounding judge
 *
 * The title and the summary are independent: a failed summary never discards a valid Turkish title, and the source
 * excerpt is never the summary. Without adequate evidence the summary is not attempted (INSUFFICIENT_EVIDENCE).
 * No database access here: callers store the result (enrich.ts) or just measure it (lifecycle canary endpoint).
 */
import type { Env } from '../db/queries';
import { detectItemLanguage, type Language } from './language';
import { trimToSentences, validateSummaryTr } from './contract';
import { assessEvidenceSources, garbleSignals, inventedNumbers, LOCALIZATION_CONTRACT_VERSION, type EvidenceAssessment } from './evidence';
import { acquireEvidence, type EvidenceKind } from './acquire';
import { classifySourceType, type SourceType } from './source-type';
import { summaryPolicy } from './summary-policy';
import { checkTerminology } from './terminology';
import { translateTitle, type TitleCandidate } from './title';

export interface Models {
  title: string;
  title_fallback: string;
  summary: string;
  judge: string;
}

export const DEFAULT_MODELS: Models = {
  title: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  title_fallback: '@cf/qwen/qwen3.8-27b',
  summary: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // Judges come from a different model family than the generators: a same-family judge shares the generator's blind spots
  // (observed: it accepted measles rendered as smallpox and an untranslated English word).
  judge: '@cf/mistralai/mistral-small-3.1-24b-instruct',
};

type ModelEnv = { ENRICH_MODEL?: string; ENRICH_MODEL_TITLE?: string; ENRICH_MODEL_TITLE_FALLBACK?: string; ENRICH_MODEL_SUMMARY?: string; ENRICH_MODEL_JUDGE?: string };

/**
 * Model defaults live in code and in operator-set Worker vars only. Nothing in the feedback path writes either:
 * a model change is a reviewed commit/deploy (P5 guardrail, localization-guardrails.test.mjs).
 */
export function modelsFor(env: unknown): Models {
  const e = env as ModelEnv;
  return {
    title: e.ENRICH_MODEL_TITLE || e.ENRICH_MODEL || DEFAULT_MODELS.title,
    title_fallback: e.ENRICH_MODEL_TITLE_FALLBACK || DEFAULT_MODELS.title_fallback,
    summary: e.ENRICH_MODEL_SUMMARY || e.ENRICH_MODEL || DEFAULT_MODELS.summary,
    judge: e.ENRICH_MODEL_JUDGE || e.ENRICH_MODEL || DEFAULT_MODELS.judge,
  };
}

export type ItemOutcome = 'NOT_REQUIRED' | 'READY' | 'TITLE_ONLY' | 'INSUFFICIENT_EVIDENCE' | 'FAILED';

export interface LocalizeInput {
  title: string;
  excerpt: string;
  url?: string | null;
  feed?: string | null;
  route?: string | null;
}

export interface LocalizeOptions {
  now?: () => string;
  /** Network for evidence acquisition; null = feed excerpt only. Defaults to the global fetch. */
  fetchImpl?: ((url: string, init?: RequestInit) => Promise<Response>) | null;
}

export interface LocalizationResult {
  contract_version: string;
  language: Language;
  source_type: SourceType;
  outcome: ItemOutcome;
  /** Present for READY / TITLE_ONLY / INSUFFICIENT_EVIDENCE; never a title that failed validation. */
  titleTr: string | null;
  /** Present only for READY. */
  summaryTr: string | null;
  failure: string | null;
  /** How each part was produced: title `translate:primary|fallback|corrected`, summary `grounded:<source_type>` or `none:<reason>`. */
  paths: { title: string | null; summary: string | null };
  evidence: { id: string; sufficient: boolean; reason: string | null; passages: number; kind: EvidenceKind | null; origin: string | null; spans: string[] };
  validator: { title: string | null; summary: string | null; preservation: string[]; garble: string[]; terminology: { title: string | null; summary: string | null } };
  judge: { verdict: 'SUPPORTED' | 'UNSUPPORTED' | 'SKIPPED'; attempts: number };
  title_candidates: TitleCandidate[];
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
    temperature: 0,
  });
  const text = textFromAi(out).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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

function summarySystem(type: SourceType, strict: boolean): string {
  return `Sen bir Türkçe editörsün. Sadece EVIDENCE bölümündeki cümlelere dayan.
SADECE geçerli JSON döndür: {"gistTr":"..."}.
Ortak kurallar:
- gistTr: içeriğin asıl özünü anlatan 1-2 tam Türkçe cümle (toplam en fazla ~250 karakter, en az 8 kelime), nokta ile biter.
- EVIDENCE'da olmayan hiçbir olgu, sayı, kurum, hastalık, ilaç, cihaz, işlem, eylem, sonuç, neden veya yorum ekleme. Metni kopyalama.
- Özne ve eylemin yönünü kaynaktaki gibi koru (kim kime ne yaptı); artış/azalışı tersine çevirme.
- Sayıları, kurum/ürün/ilaç/cihaz adlarını, tıbbi terimleri ve kısaltmaları aynen koru; bir terimi başka bir terimle değiştirme.
- Türkçe yaz; İngilizce kelime bırakma (özel adlar hariç).
- Emin değilsen veya EVIDENCE özet çıkarmaya yetmiyorsa {"gistTr":""} döndür.
Bu içerik türüne özel kurallar:
${summaryPolicy(type).focus}${strict ? '\n- ÖNCEKİ DENEME GEÇERSİZDİ: daha kısa ve daha temkinli yaz, yalnız EVIDENCE\'da açıkça yazılanı söyle.' : ''}`;
}

async function generateSummary(env: Env, model: string, type: SourceType, titleOrig: string, ev: EvidenceAssessment, strict: boolean): Promise<string> {
  const raw = await runModel(env, model, summarySystem(type, strict), `ORIGINAL_TITLE: ${titleOrig}\nEVIDENCE:\n${ev.passages.map((p) => `- ${p}`).join('\n')}\n\nJSON:`);
  const g = firstJson(raw)?.gistTr;
  return typeof g === 'string' ? trimToSentences(g.trim()) : '';
}

/** Closed-form entailment question with the source-type rules; fail closed on anything but an explicit SUPPORTED. */
async function judgeGrounded(env: Env, model: string, type: SourceType, titleOrig: string, ev: EvidenceAssessment, gistTr: string): Promise<boolean> {
  const out = await runModel(
    env,
    model,
    'You are a strict fact checker. Compare a Turkish SUMMARY with its English SOURCE (title and evidence sentences). ' +
      'Answer UNSUPPORTED if the SUMMARY states any fact, result, action, number, actor or cause that the SOURCE does not state, or contradicts the SOURCE. ' +
      'Check who did what to whom: UNSUPPORTED if subject and object are swapped, or if the direction of a change or effect is reversed. ' +
      'UNSUPPORTED if a disease, drug, device, procedure or other technical term is replaced by a different one. ' +
      'Also UNSUPPORTED if the SUMMARY presents something as an observed finding or as something people do, when the SOURCE only names a topic, a guide or an analysis. ' +
      `${summaryPolicy(type).judge} ` +
      'Answer SUPPORTED only if every claim in the SUMMARY is stated by the SOURCE. Reply with exactly one word: SUPPORTED or UNSUPPORTED.',
    `SOURCE TITLE: ${titleOrig}\nSOURCE EVIDENCE:\n${ev.passages.map((p) => `- ${p}`).join('\n')}\nSUMMARY (Turkish): ${gistTr}\n\nAnswer:`
  );
  return /^\W*SUPPORTED\b/i.test(out.trim());
}

export async function localizeItem(env: Env, input: LocalizeInput, opts: LocalizeOptions | (() => string) = {}): Promise<LocalizationResult> {
  const o: LocalizeOptions = typeof opts === 'function' ? { now: opts } : opts;
  const now = o.now || (() => new Date().toISOString());
  const models = modelsFor(env);
  const title = (input.title || '').trim();
  const language = detectItemLanguage(title, input.excerpt || '');
  const source_type = classifySourceType({ title, feed: input.feed, route: input.route, url: input.url });
  const base: LocalizationResult = {
    contract_version: LOCALIZATION_CONTRACT_VERSION,
    language,
    source_type,
    outcome: 'FAILED',
    titleTr: null,
    summaryTr: null,
    failure: null,
    paths: { title: null, summary: null },
    evidence: { id: '', sufficient: false, reason: null, passages: 0, kind: null, origin: null, spans: [] },
    validator: { title: null, summary: null, preservation: [], garble: [], terminology: { title: null, summary: null } },
    judge: { verdict: 'SKIPPED', attempts: 0 },
    title_candidates: [],
    models,
    attempts: { title: 0, summary: 0 },
    produced_at: now(),
  };
  // 1. Turkish source: no translation.
  if (language === 'tr') return { ...base, outcome: 'NOT_REQUIRED', paths: { title: 'source:turkish', summary: 'source:turkish' } };

  // 2. Turkish title: translation path, independent of the summary.
  const t = await translateTitle(runModel, env, title, models);
  base.title_candidates = t.candidates;
  base.attempts.title = t.candidates.length;
  base.validator.title = t.candidates.at(-1)?.rejected ?? null;
  base.validator.terminology.title = t.terminology?.verdict ?? null;
  if (!t.titleTr) return { ...base, outcome: 'FAILED', failure: `TITLE:${t.failure}`, paths: { title: null, summary: null } };
  const titleTr = t.titleTr;
  base.titleTr = titleTr;
  base.paths.title = t.path;

  // 3. Evidence: source text only (article > abstract > publisher excerpt > metadata), 2-5 verbatim spans.
  const fetchImpl = o.fetchImpl === undefined ? (typeof fetch === 'function' ? fetch : null) : o.fetchImpl;
  const sources = await acquireEvidence({ title, excerpt: input.excerpt || '', url: input.url }, fetchImpl);
  const ev = assessEvidenceSources(title, sources);
  base.evidence = { id: ev.id, sufficient: ev.sufficient, reason: ev.reason, passages: ev.passages.length, kind: ev.kind, origin: ev.origin, spans: ev.passages };
  if (!ev.sufficient) return { ...base, outcome: 'INSUFFICIENT_EVIDENCE', failure: `EVIDENCE:${ev.reason}`, paths: { title: t.path, summary: `none:${ev.reason}` } };

  // 4-6. Grounded summary under the source-type policy, validation, grounding judge (bounded: two attempts).
  const evidenceText = ev.passages.join(' ');
  let failure = 'SUMMARY_EMPTY';
  for (const strict of [false, true]) {
    base.attempts.summary++;
    const gist = await generateSummary(env, models.summary, source_type, title, ev, strict);
    if (!gist) {
      failure = 'SUMMARY_ABSTAINED';
      continue;
    }
    const bad = validateSummaryTr(gist, { titleOrig: title, titleTr, excerpt: evidenceText });
    const invented = inventedNumbers(`${title} ${evidenceText}`, gist);
    const garble = garbleSignals(gist);
    const term = checkTerminology(`${title} ${evidenceText}`, gist, 'summary');
    base.validator.terminology.summary = term.verdict;
    const reason = bad || invented[0] || garble[0] || term.issues[0] || null;
    base.validator.summary = reason;
    if (reason) {
      failure = reason;
      continue;
    }
    base.judge.attempts++;
    if (!(await judgeGrounded(env, models.judge, source_type, title, ev, gist))) {
      base.judge.verdict = 'UNSUPPORTED';
      failure = 'SUMMARY_UNSUPPORTED';
      continue;
    }
    base.judge.verdict = 'SUPPORTED';
    return { ...base, outcome: 'READY', summaryTr: gist, failure: null, paths: { title: t.path, summary: `grounded:${source_type}` } };
  }
  return { ...base, outcome: 'TITLE_ONLY', failure: `SUMMARY:${failure}`, paths: { title: t.path, summary: `rejected:${source_type}` } };
}
