/**
 * Independent audit of a localization result, used by the lifecycle localization canary (never in the hot path).
 * Deterministic checks re-run on the FINAL outputs (including the terminology guard), plus a model from a family that
 * neither generated nor judged them. Anything unparsable is reported as `error` (the lifecycle treats it as
 * "canary unavailable", never as a pass).
 */
import type { Env } from '../db/queries';
import { englishLeaks, foreignScript } from './contract';
import { garbleSignals, inventedNumbers, preservationIssues } from './evidence';
import { runModel, type LocalizationResult } from './pipeline';
import { checkTerminology } from './terminology';

export const DEFAULT_AUDIT_MODEL = '@cf/openai/gpt-oss-120b';

export interface AuditResult {
  english_leak: boolean;
  foreign_script: boolean;
  numeric_error: boolean;
  entity_error: boolean;
  garbled: boolean;
  unsupported_claim: boolean;
  subject_inversion: boolean;
  title_wrong: boolean;
  /** Deterministic terminology findings (ENTITY_SUBSTITUTION / ENTITY_INTRODUCED / ENTITY_NOT_RENDERED / DRUG_MISSING). */
  terminology_issues: string[];
  auditor_model: string;
  error?: string;
}

const AUDIT_SYSTEM =
  'You audit a Turkish localization of an English item. You get the SOURCE title, SOURCE evidence sentences, the Turkish TITLE and (optionally) the Turkish SUMMARY. ' +
  'Return ONLY JSON with boolean fields: ' +
  '{"title_wrong": the Turkish title changes or loses the meaning of the source title, ' +
  '"unsupported_claim": the summary states anything the evidence does not state, ' +
  '"subject_inversion": subject/object or the direction of an effect/change is reversed in the title or summary, ' +
  '"entity_error": a name, organisation, product, disease, drug, device, procedure, imaging method or acronym is wrong or replaced by a different one, ' +
  '"number_error": a number is wrong, missing where the source states it, or invented, ' +
  '"garbled": the Turkish is ungrammatical, nonsensical, misspelled or contains non-Turkish words}. ' +
  'Be strict: when unsure, answer true.';

function parseFlags(text: string): Record<string, boolean> | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
    const keys = ['title_wrong', 'unsupported_claim', 'subject_inversion', 'entity_error', 'number_error', 'garbled'];
    if (!keys.every((k) => typeof o[k] === 'boolean')) return null;
    return Object.fromEntries(keys.map((k) => [k, o[k] as boolean]));
  } catch {
    return null;
  }
}

export async function auditLocalization(env: Env, input: { title: string; excerpt: string }, r: LocalizationResult): Promise<AuditResult> {
  const model = (env as { ENRICH_MODEL_AUDIT?: string }).ENRICH_MODEL_AUDIT || DEFAULT_AUDIT_MODEL;
  const texts = [r.titleTr, r.summaryTr].filter(Boolean) as string[];
  const spans = r.evidence?.spans || [];
  const sourceText = `${input.title} ${spans.join(' ')}`;
  const terminology_issues = [
    ...(r.titleTr ? checkTerminology(input.title, r.titleTr, 'title').issues : []),
    ...(r.summaryTr ? checkTerminology(sourceText, r.summaryTr, 'summary').issues : []),
  ];
  const out: AuditResult = {
    english_leak: texts.some((t) => englishLeaks(t).length > 0),
    foreign_script: texts.some((t) => foreignScript(t)),
    numeric_error: (r.titleTr ? preservationIssues(input.title, r.titleTr).some((i) => i.startsWith('NUMBER')) : false) ||
      (r.summaryTr ? inventedNumbers(sourceText, r.summaryTr).length > 0 : false),
    entity_error: (r.titleTr ? preservationIssues(input.title, r.titleTr).some((i) => i.startsWith('ENTITY')) : false) || terminology_issues.length > 0,
    garbled: texts.some((t) => garbleSignals(t).length > 0),
    unsupported_claim: false,
    subject_inversion: false,
    title_wrong: false,
    terminology_issues,
    auditor_model: model,
  };
  if (!r.titleTr) return out;
  try {
    const raw = await runModel(
      env,
      model,
      AUDIT_SYSTEM,
      `SOURCE TITLE: ${input.title}\nSOURCE EVIDENCE:\n${spans.map((p) => `- ${p}`).join('\n') || '(none)'}\nTURKISH TITLE: ${r.titleTr}\nTURKISH SUMMARY: ${r.summaryTr || '(none)'}\n\nJSON:`
    );
    const f = parseFlags(raw);
    if (!f) return { ...out, error: 'AUDIT_UNPARSABLE' };
    out.title_wrong = f.title_wrong;
    out.unsupported_claim = f.unsupported_claim;
    out.subject_inversion = f.subject_inversion;
    out.entity_error = out.entity_error || f.entity_error;
    out.numeric_error = out.numeric_error || f.number_error;
    out.garbled = out.garbled || f.garbled;
  } catch (e) {
    return { ...out, error: `AUDIT_ERROR:${String(e).slice(0, 80)}` };
  }
  return out;
}
