/**
 * Turkish localization feedback (P5). Feedback is evidence: this module only
 *   1. validates and PERSISTS a human judgement with the provenance of the item it is about, and
 *   2. AGGREGATES stored feedback / localization stats into review signals (`REVIEW_REQUIRED` flags).
 * It never adds, retires or reactivates a source, edits the canonical registry, loosens scope, switches the model or
 * prompt default, mutates lifecycle state or changes editorial rules. Its only write is one INSERT into
 * `localization_feedback`; every change that a flag suggests is an operator decision followed by a bounded canary.
 * Enforced by localization-guardrails.test.mjs.
 */
import { LOCALIZATION_CONTRACT_VERSION } from './evidence';

export const LOCALIZATION_FEEDBACK_CODES = [
  'wrong_translation',
  'garbled_turkish',
  'unsupported_claim',
  'subject_inversion',
  'entity_error',
  'number_error',
  'too_vague',
  'summary_not_useful',
  'foreign_language_leak',
  'title_wrong',
  'summary_wrong',
  'good_translation',
  'good_summary',
] as const;

export type LocalizationFeedbackCode = (typeof LOCALIZATION_FEEDBACK_CODES)[number];

export const POSITIVE_CODES: ReadonlySet<string> = new Set(['good_translation', 'good_summary']);

export function isLocalizationFeedbackCode(v: unknown): v is LocalizationFeedbackCode {
  return typeof v === 'string' && (LOCALIZATION_FEEDBACK_CODES as readonly string[]).includes(v);
}

/** Feedback is a human judgement; machine / automated reviewers are refused (it is not model self-assessment). */
const MACHINE_REVIEWER = /^(machine|auto|automation|llm|model|agent|bot|system|pillar5|learning|feedback)\b/i;

/** Recommendations only: model / prompt / source-type recalibration is an operator change behind a bounded canary. */
export const REVIEW_ACTIONS = [
  'prompt_improvement',
  'model_change',
  'source_type_policy_recalibration',
  'source_specific_extraction_fix',
  'evidence_extractor_fix',
  'source_lifecycle_recanary',
] as const;

export interface LocalizationFeedbackRow {
  id: string;
  item_id: string;
  source_id: string | null;
  feed_id: string | null;
  route: string;
  source_url: string | null;
  source_language: string | null;
  title_model: string | null;
  summary_model: string | null;
  contract_version: string | null;
  evidence_id: string | null;
  validator_json: string | null;
  judge_result: string | null;
  localization_outcome: string | null;
  enrichment_status: string | null;
  produced_at: string | null;
  source_type: string | null;
  title_path: string | null;
  summary_path: string | null;
  failure_reason: string | null;
  feedback_code: string;
  polarity: 'negative' | 'positive';
  note: string | null;
  reviewer: string;
  created_at: string;
}

export type RecordResult =
  | { ok: true; row: LocalizationFeedbackRow }
  | { ok: false; error: 'INVALID_FEEDBACK_CODE' | 'REVIEWER_REQUIRED' | 'MACHINE_REVIEWER_REFUSED' | 'ITEM_NOT_FOUND' };

interface ItemRow {
  id: string;
  route: string;
  feed_id: string | null;
  source_id: string | null;
  canonical_url: string | null;
  enrichment_status: string | null;
  enrichment_json: string | null;
  enriched_at: string | null;
}

/** Provenance snapshot for one item, read from what the localization pipeline stored (enrichment_json.localization). */
export function provenanceOf(item: ItemRow) {
  let loc: Record<string, any> = {};
  try {
    loc = (JSON.parse(item.enrichment_json || '{}') as { localization?: Record<string, any> }).localization || {};
  } catch {
    /* items localized before the provenance block existed carry none: columns stay NULL */
  }
  return {
    source_id: item.source_id || item.feed_id || null,
    feed_id: item.feed_id,
    source_url: item.canonical_url,
    source_language: loc.language ?? null,
    title_model: loc.models?.title ?? null,
    summary_model: loc.models?.summary ?? null,
    contract_version: loc.contract_version ?? null,
    evidence_id: loc.evidence?.id ?? null,
    validator_json: loc.validator ? JSON.stringify(loc.validator) : null,
    judge_result: loc.judge?.verdict ?? null,
    localization_outcome: loc.outcome ?? null,
    enrichment_status: item.enrichment_status,
    produced_at: loc.produced_at ?? item.enriched_at ?? null,
    source_type: loc.source_type ?? null,
    title_path: loc.paths?.title ?? null,
    summary_path: loc.paths?.summary ?? null,
    failure_reason: typeof loc.failure === 'string' ? loc.failure.slice(0, 120) : null,
  };
}

export async function recordLocalizationFeedback(
  db: D1Database,
  input: { item_id: string; code: unknown; note?: string | null; reviewer?: string | null },
  newId: () => string = () => `lfb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
): Promise<RecordResult> {
  if (!isLocalizationFeedbackCode(input.code)) return { ok: false, error: 'INVALID_FEEDBACK_CODE' };
  const reviewer = (input.reviewer || '').trim();
  if (!reviewer) return { ok: false, error: 'REVIEWER_REQUIRED' };
  if (MACHINE_REVIEWER.test(reviewer)) return { ok: false, error: 'MACHINE_REVIEWER_REFUSED' };
  const item = await db
    .prepare(`SELECT id, route, feed_id, source_id, canonical_url, enrichment_status, enrichment_json, enriched_at FROM source_items WHERE id = ?`)
    .bind(input.item_id)
    .first<ItemRow>();
  if (!item) return { ok: false, error: 'ITEM_NOT_FOUND' };
  const p = provenanceOf(item);
  const row: LocalizationFeedbackRow = {
    id: newId(),
    item_id: item.id,
    route: item.route,
    ...p,
    feedback_code: input.code,
    polarity: POSITIVE_CODES.has(input.code) ? 'positive' : 'negative',
    note: input.note ? String(input.note).slice(0, 500) : null,
    reviewer,
    created_at: new Date().toISOString(),
  };
  // The only write of this module.
  await db
    .prepare(
      `INSERT INTO localization_feedback
        (id, item_id, source_id, feed_id, route, source_url, source_language, title_model, summary_model, contract_version, evidence_id,
         validator_json, judge_result, localization_outcome, enrichment_status, produced_at, source_type, title_path, summary_path, failure_reason,
         feedback_code, polarity, note, reviewer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id, row.item_id, row.source_id, row.feed_id, row.route, row.source_url, row.source_language, row.title_model, row.summary_model,
      row.contract_version, row.evidence_id, row.validator_json, row.judge_result, row.localization_outcome, row.enrichment_status,
      row.produced_at, row.source_type, row.title_path, row.summary_path, row.failure_reason,
      row.feedback_code, row.polarity, row.note, row.reviewer, row.created_at
    )
    .run();
  return { ok: true, row };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aggregation + review flags (pure)
// ---------------------------------------------------------------------------------------------------------------------

export interface LocalizationStatRow {
  source_id: string | null;
  language: string | null;
  summary_model: string | null;
  contract_version: string | null;
  source_type?: string | null;
  title_model?: string | null;
  title_path?: string | null;
  summary_path?: string | null;
  failure_reason?: string | null;
  items: number;
  ready: number;
  title_only: number;
  insufficient_evidence: number;
  grounding_failures: number;
  failed: number;
}

export interface Thresholds {
  minFeedback: number;
  errorRate: number;
  foreignLeak: number;
  repeatedTitle: number;
  minItems: number;
  groundingFailureRate: number;
  insufficientEvidenceRate: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minFeedback: 5,
  errorRate: 0.2,
  foreignLeak: 2,
  repeatedTitle: 3,
  minItems: 10,
  groundingFailureRate: 0.4,
  insufficientEvidenceRate: 0.6,
};

export interface ReviewFlag {
  flag: 'REVIEW_REQUIRED';
  subject: { kind: SubjectKind; key: string };
  reasons: string[];
  metrics: Record<string, number>;
  /** Suggestions only: choosing one is an operator decision, and every resulting change passes a bounded canary. */
  suggested_actions: readonly string[];
  automatic_mutation: false;
}

type SubjectKind = 'source' | 'model' | 'title_model' | 'contract_version' | 'language' | 'source_type' | 'title_path' | 'summary_path' | 'failure_reason';
type Dim = 'source_id' | 'summary_model' | 'title_model' | 'contract_version' | 'source_language' | 'source_type' | 'title_path' | 'summary_path' | 'failure_reason';
const DIMS: Dim[] = ['source_id', 'summary_model', 'title_model', 'contract_version', 'source_language', 'source_type', 'title_path', 'summary_path', 'failure_reason'];
const DIM_KIND: Record<Dim, SubjectKind> = {
  source_id: 'source',
  summary_model: 'model',
  title_model: 'title_model',
  contract_version: 'contract_version',
  source_language: 'language',
  source_type: 'source_type',
  title_path: 'title_path',
  summary_path: 'summary_path',
  failure_reason: 'failure_reason',
};

export interface FeedbackAggregate {
  dimension: Dim;
  key: string;
  total: number;
  negative: number;
  positive: number;
  error_rate: number;
  by_code: Record<string, number>;
}

type FeedbackInput = Pick<LocalizationFeedbackRow, 'source_id' | 'summary_model' | 'contract_version' | 'source_language' | 'feedback_code' | 'polarity'> &
  Partial<Pick<LocalizationFeedbackRow, 'title_model' | 'source_type' | 'title_path' | 'summary_path' | 'failure_reason'>>;

export function aggregateLocalizationFeedback(rows: FeedbackInput[]): FeedbackAggregate[] {
  const map = new Map<string, FeedbackAggregate>();
  for (const r of rows) {
    for (const dimension of DIMS) {
      const key = r[dimension];
      if (!key) continue;
      const id = `${dimension}|${key}`;
      const a = map.get(id) || { dimension, key, total: 0, negative: 0, positive: 0, error_rate: 0, by_code: {} };
      a.total++;
      if (r.polarity === 'negative') a.negative++;
      else a.positive++;
      a.by_code[r.feedback_code] = (a.by_code[r.feedback_code] || 0) + 1;
      map.set(id, a);
    }
  }
  return [...map.values()].map((a) => ({ ...a, error_rate: a.total ? Math.round((a.negative / a.total) * 1000) / 1000 : 0 })).sort((x, y) => y.negative - x.negative);
}

const FOREIGN = 'foreign_language_leak';
const TITLE_CODES = ['wrong_translation', 'title_wrong'];
const SEMANTIC = ['unsupported_claim', 'subject_inversion', 'entity_error', 'number_error', 'garbled_turkish', 'summary_wrong'];

/** What a flag may recommend, by the kind of subject it is about (recommendations only, never applied here). */
function actionsFor(dim: Dim, base: readonly string[]): readonly string[] {
  const extra = dim === 'source_type' ? ['source_type_policy_recalibration'] : dim === 'summary_path' ? ['source_type_policy_recalibration', 'prompt_improvement'] : dim === 'title_model' || dim === 'title_path' ? ['model_change', 'prompt_improvement'] : [];
  return [...new Set([...base, ...extra])];
}

const STAT_DIMS: Array<[Dim, keyof LocalizationStatRow]> = [
  ['source_id', 'source_id'],
  ['source_type', 'source_type'],
  ['summary_model', 'summary_model'],
  ['title_model', 'title_model'],
  ['title_path', 'title_path'],
  ['summary_path', 'summary_path'],
];

export function reviewQueue(
  aggregates: FeedbackAggregate[],
  stats: LocalizationStatRow[],
  t: Thresholds = DEFAULT_THRESHOLDS
): ReviewFlag[] {
  const flags = new Map<string, ReviewFlag>();
  const flag = (dim: Dim, key: string, reason: string, metrics: Record<string, number>, base: readonly string[]) => {
    const id = `${dim}|${key}`;
    const actions = actionsFor(dim, base);
    const f = flags.get(id) || { flag: 'REVIEW_REQUIRED' as const, subject: { kind: DIM_KIND[dim], key }, reasons: [], metrics: {}, suggested_actions: actions, automatic_mutation: false as const };
    if (!f.reasons.includes(reason)) f.reasons.push(reason);
    f.suggested_actions = [...new Set([...f.suggested_actions, ...actions])];
    Object.assign(f.metrics, metrics);
    flags.set(id, f);
  };
  for (const a of aggregates) {
    if (a.total < t.minFeedback) continue;
    const semantic = SEMANTIC.reduce((n, c) => n + (a.by_code[c] || 0), 0);
    if (semantic >= 3 && a.error_rate >= t.errorRate) flag(a.dimension, a.key, 'SEMANTIC_ERROR_RATE', { semantic_errors: semantic, error_rate: a.error_rate, feedback: a.total }, ['prompt_improvement', 'model_change', 'source_lifecycle_recanary']);
    if ((a.by_code[FOREIGN] || 0) >= t.foreignLeak) flag(a.dimension, a.key, 'FOREIGN_LANGUAGE_LEAK', { foreign_leaks: a.by_code[FOREIGN], feedback: a.total }, ['prompt_improvement', 'model_change']);
    const titles = TITLE_CODES.reduce((n, c) => n + (a.by_code[c] || 0), 0);
    if (titles >= t.repeatedTitle) flag(a.dimension, a.key, 'REPEATED_TITLE_MISTRANSLATION', { title_errors: titles, feedback: a.total }, ['prompt_improvement', 'model_change', 'source_specific_extraction_fix']);
  }
  for (const [dim, field] of STAT_DIMS) {
    const by = new Map<string, LocalizationStatRow>();
    for (const s of stats) {
      const key = s[field] as string | null | undefined;
      if (!key) continue;
      const m = by.get(key) || { ...s, items: 0, ready: 0, title_only: 0, insufficient_evidence: 0, grounding_failures: 0, failed: 0 };
      m.items += s.items; m.ready += s.ready; m.title_only += s.title_only; m.insufficient_evidence += s.insufficient_evidence; m.grounding_failures += s.grounding_failures; m.failed += s.failed;
      by.set(key, m);
    }
    for (const [key, s] of by) {
      if (s.items < t.minItems) continue;
      const g = s.grounding_failures / s.items;
      const e = s.insufficient_evidence / s.items;
      if (g >= t.groundingFailureRate) flag(dim, key, 'GROUNDING_FAILURE_SPIKE', { grounding_failure_rate: Math.round(g * 1000) / 1000, items: s.items }, ['prompt_improvement', 'model_change', 'evidence_extractor_fix']);
      if (e >= t.insufficientEvidenceRate) flag(dim, key, 'EVIDENCE_INSUFFICIENT', { insufficient_evidence_rate: Math.round(e * 1000) / 1000, items: s.items }, ['source_specific_extraction_fix', 'evidence_extractor_fix', 'source_lifecycle_recanary']);
    }
  }
  return [...flags.values()];
}

/** Failure reasons by source type and model (diagnostic table for the review output; no flag, no mutation). */
export function failureBreakdown(stats: LocalizationStatRow[]): Array<{ source_type: string; summary_model: string; failure_reason: string; items: number }> {
  const map = new Map<string, { source_type: string; summary_model: string; failure_reason: string; items: number }>();
  for (const s of stats) {
    if (!s.failure_reason) continue;
    const k = `${s.source_type || '?'}|${s.summary_model || '?'}|${s.failure_reason}`;
    const m = map.get(k) || { source_type: s.source_type || '?', summary_model: s.summary_model || '?', failure_reason: s.failure_reason, items: 0 };
    m.items += s.items;
    map.set(k, m);
  }
  return [...map.values()].sort((a, b) => b.items - a.items);
}

export const STATS_SQL = `SELECT COALESCE(source_id, feed_id) AS source_id,
  json_extract(enrichment_json, '$.localization.language') AS language,
  json_extract(enrichment_json, '$.localization.models.summary') AS summary_model,
  json_extract(enrichment_json, '$.localization.contract_version') AS contract_version,
  json_extract(enrichment_json, '$.localization.source_type') AS source_type,
  json_extract(enrichment_json, '$.localization.models.title') AS title_model,
  json_extract(enrichment_json, '$.localization.paths.title') AS title_path,
  json_extract(enrichment_json, '$.localization.paths.summary') AS summary_path,
  json_extract(enrichment_json, '$.localization.failure') AS failure_reason,
  COUNT(*) AS items,
  SUM(enrichment_status = 'done') AS ready,
  SUM(enrichment_status = 'title_only') AS title_only,
  SUM(json_extract(enrichment_json, '$.localization.outcome') = 'INSUFFICIENT_EVIDENCE') AS insufficient_evidence,
  SUM(json_extract(enrichment_json, '$.localization.failure') = 'SUMMARY:SUMMARY_UNSUPPORTED') AS grounding_failures,
  SUM(enrichment_status = 'failed') AS failed
FROM source_items
WHERE json_extract(enrichment_json, '$.localization.contract_version') IS NOT NULL
  AND COALESCE(enriched_at, updated_at) >= ?
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9`;

export const FEEDBACK_SQL = `SELECT source_id, summary_model, title_model, contract_version, source_language, source_type, title_path, summary_path, failure_reason, feedback_code, polarity FROM localization_feedback WHERE created_at >= ?`;

export async function loadReviewInputs(db: D1Database, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const fb = await db
    .prepare(FEEDBACK_SQL)
    .bind(since)
    .all<LocalizationFeedbackRow>();
  const st = await db.prepare(STATS_SQL).bind(since).all<LocalizationStatRow>();
  return { feedback: fb.results ?? [], stats: st.results ?? [] };
}

export { LOCALIZATION_CONTRACT_VERSION };
