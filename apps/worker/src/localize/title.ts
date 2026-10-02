/**
 * Turkish title path: translation, not summarisation. Independent of the summary path.
 *
 *   structure split (dataset prefix, column label, trailing publisher kept verbatim)
 *   -> literal translation at temperature 0 with the glossary renderings the source requires
 *   -> deterministic checks: Turkish / no leak, numbers + acronyms, garble, no semantic expansion, entity consistency
 *   -> meaning judge from a different model family
 * Bounded candidates: primary translator, fallback translator (different family), primary again with the rejection reason.
 * The first candidate that passes every check is used; none passes = no title (fail closed).
 */
import type { Env } from '../db/queries';
import { validateTitleTr } from './contract';
import { garbleSignals, preservationIssues } from './evidence';
import { decodeEntities } from './acquire';
import { checkTerminology, glossaryHints, type TerminologyResult } from './terminology';
import { surfaceIssues } from './surface';

export type Runner = (env: Env, model: string, system: string, user: string) => Promise<string>;

export interface TitleCandidate {
  model: string;
  variant: 'literal' | 'corrected';
  text: string;
  rejected: string | null;
}

export interface TitleOutcome {
  titleTr: string | null;
  failure: string | null;
  /** e.g. `translate:primary`, `translate:fallback`, `translate:corrected` */
  path: string | null;
  candidates: TitleCandidate[];
  terminology: TerminologyResult | null;
  judgeCalls: number;
}

export interface PreparedTitle {
  prefix: string;
  core: string;
  suffix: string;
}

const PUBLISHERS =
  'Reuters|AP|AP News|The Associated Press|STAT|BBC|CNN|NPR|Bloomberg|Axios|Fierce Biotech|Fierce Healthcare|Fierce Pharma|MedPage Today|Medscape|Healio|HealthDay|The Guardian|The New York Times|Cleveland Clinic|Mayo Clinic';
const TRAILING_PUBLISHER = new RegExp(`\\s+[-–—|]\\s+(${PUBLISHERS})\\s*$`);

/** Parts of a title that are not translated: dbGaP "New | phs… |" prefix, "STAT+:" label, trailing " - Reuters". */
export function prepareTitle(raw: string): PreparedTitle {
  let core = decodeEntities(raw || '').replace(/\s+/g, ' ').trim();
  let prefix = '';
  let suffix = '';
  const dbgap = core.match(/^New \| (phs\d+\.v\d+\.p\d+) \| (.+)$/i);
  if (dbgap) {
    prefix = `Yeni | ${dbgap[1]} | `;
    core = dbgap[2];
  }
  const label = core.match(/^(STAT\+):\s+(.+)$/);
  if (label) {
    prefix += `${label[1]}: `;
    core = label[2];
  }
  const pub = core.match(TRAILING_PUBLISHER);
  if (pub) {
    suffix = ` - ${pub[1]}`;
    core = core.slice(0, pub.index).trim();
  }
  return { prefix, core, suffix };
}

const TITLE_SYSTEM =
  'You are a professional English-to-Turkish medical translator. Translate the HEADLINE into Turkish faithfully and literally.\n' +
  'Rules:\n' +
  '1. Keep every proper name, organisation, brand, drug, device and procedure name, gene, acronym, code and number exactly as written; Turkish suffixes may be attached with an apostrophe.\n' +
  '2. When REQUIRED TERMS are given, use exactly those Turkish renderings.\n' +
  '3. Do not add, drop, explain, soften, strengthen or reinterpret anything. Do not paraphrase: change only word order and word forms as Turkish grammar requires.\n' +
  '4. Translate every ordinary English word. Keep the headline form: no added period, quotes, brackets or notes.\n' +
  'Output only the Turkish headline on one line.';

function titleUser(core: string, reason: string | null): string {
  const hints = glossaryHints(core);
  return (
    (hints.length ? `REQUIRED TERMS:\n${hints.map((h) => `- ${h}`).join('\n')}\n` : '') +
    (reason ? `A previous translation was rejected (${reason}). Avoid that error.\n` : '') +
    `HEADLINE: ${core.slice(0, 400)}`
  );
}

function firstLine(out: string): string {
  if (/^\s*[\[{]/.test(out)) return '';
  const line = out
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((x) => x.trim())
    .find(Boolean) || '';
  return line.replace(/^(turkish|türkçe|headline|başlık)\s*:\s*/i, '').replace(/^["“'`]+|["”'`]+$/g, '').trim();
}

/** Semantic expansion: the translation explains or adds to the headline instead of translating it. */
export function expansionIssues(core: string, cand: string): string[] {
  const out: string[] = [];
  if (/[()[\]]/.test(cand) && !/[()[\]]/.test(core)) out.push('TITLE_EXPANSION:BRACKETS');
  if (cand.length > core.length * 1.6 + 20) out.push('TITLE_EXPANSION:LENGTH');
  if ((cand.match(/[:;]/g) || []).length > (core.match(/[:;]/g) || []).length + 1) out.push('TITLE_EXPANSION:CLAUSES');
  return out;
}

/** Closed-form check that a Turkish title keeps the meaning of the source title (observed: "measles" rendered as smallpox). */
async function judgeTitle(run: Runner, env: Env, model: string, titleOrig: string, titleTr: string): Promise<boolean> {
  const out = await run(
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

/** Deterministic checks for one candidate (full title against full source title). null = passes. */
export function titleCandidateIssue(
  source: PreparedTitle,
  sourceTitle: string,
  full: string,
  candCore: string,
  reference = ''
): { issue: string | null; terminology: TerminologyResult } {
  const terminology = checkTerminology(source.core, candCore, 'title');
  const issue =
    validateTitleTr(full, sourceTitle) ||
    preservationIssues(sourceTitle, full)[0] ||
    garbleSignals(full)[0] ||
    surfaceIssues(candCore, source.core, reference)[0] ||
    expansionIssues(source.core, candCore)[0] ||
    terminology.issues[0] ||
    null;
  return { issue, terminology };
}

export async function translateTitle(
  run: Runner,
  env: Env,
  sourceTitle: string,
  models: { title: string; title_fallback: string; judge: string },
  /** Sentence-case English text about the item (feed excerpt): tells names from ordinary words for the leak check. */
  reference = ''
): Promise<TitleOutcome> {
  const prep = prepareTitle(sourceTitle);
  const out: TitleOutcome = { titleTr: null, failure: 'TITLE_EMPTY', path: null, candidates: [], terminology: null, judgeCalls: 0 };
  const plan: Array<{ model: string; variant: TitleCandidate['variant']; path: string }> = [
    { model: models.title, variant: 'literal', path: 'translate:primary' },
    ...(models.title_fallback && models.title_fallback !== models.title ? [{ model: models.title_fallback, variant: 'literal' as const, path: 'translate:fallback' }] : []),
    { model: models.title, variant: 'corrected', path: 'translate:corrected' },
  ];
  let lastReason: string | null = null;
  for (const step of plan) {
    let candCore = '';
    try {
      candCore = firstLine(await run(env, step.model, TITLE_SYSTEM, titleUser(prep.core, step.variant === 'corrected' ? lastReason : null)));
    } catch (e) {
      const err = `TITLE_MODEL_ERROR:${String(e).slice(0, 60)}`;
      // A content rejection of an earlier candidate stays the reported reason; an infrastructure error does not hide it.
      lastReason = lastReason || err;
      out.candidates.push({ model: step.model, variant: step.variant, text: '', rejected: err });
      continue;
    }
    const full = `${prep.prefix}${candCore}${prep.suffix}`.trim();
    const { issue, terminology } = candCore ? titleCandidateIssue(prep, sourceTitle, full, candCore, reference) : { issue: 'TITLE_EMPTY', terminology: null };
    out.terminology = terminology;
    if (issue) {
      lastReason = issue;
      out.candidates.push({ model: step.model, variant: step.variant, text: full, rejected: issue });
      continue;
    }
    out.judgeCalls++;
    if (!(await judgeTitle(run, env, models.judge, sourceTitle, full))) {
      lastReason = 'TITLE_MEANING_CHANGED';
      out.candidates.push({ model: step.model, variant: step.variant, text: full, rejected: lastReason });
      continue;
    }
    out.candidates.push({ model: step.model, variant: step.variant, text: full, rejected: null });
    return { ...out, titleTr: full, failure: null, path: step.path };
  }
  return { ...out, failure: lastReason || 'TITLE_EMPTY' };
}
