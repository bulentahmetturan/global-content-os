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

export const REVIEW_ACTIONS = [
  'prompt_improvement',
  'model_change',
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
         validator_json, judge_result, localization_outcome, enrichment_status, produced_at, feedback_code, polarity, note, reviewer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id, row.item_id, row.source_id, row.feed_id, row.route, row.source_url, row.source_language, row.title_model, row.summary_model,
      row.contract_version, row.evidence_id, row.validator_json, row.judge_result, row.localization_outcome, row.enrichment_status,
      row.produced_at, row.feedback_code, row.polarity, row.note, row.reviewer, row.created_at
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
  subject: { kind: 'source' | 'model' | 'contract_version' | 'language'; key: string };
  reasons: string[];
  metrics: Record<string, number>;
  /** Suggestions only: choosing one is an operator decision, and every resulting change passes a bounded canary. */
  suggested_actions: readonly string[];
  automatic_mutation: false;
}

type Dim = 'source_id' | 'summary_model' | 'contract_version' | 'source_language';
const DIM_KIND: Record<Dim, ReviewFlag['subject']['kind']> = { source_id: 'source', summary_model: 'model', contract_version: 'contract_version', source_language: 'language' };

export interface FeedbackAggregate {
  dimension: Dim;
  key: string;
  total: number;
  negative: number;
  positive: number;
  error_rate: number;
  by_code: Record<string, number>;
}

export function aggregateLocalizationFeedback(rows: Array<Pick<LocalizationFeedbackRow, 'source_id' | 'summary_model' | 'contract_version' | 'source_language' | 'feedback_code' | 'polarity'>>): FeedbackAggregate[] {
  const map = new Map<string, FeedbackAggregate>();
  for (const r of rows) {
    for (const dimension of ['source_id', 'summary_model', 'contract_version', 'source_language'] as Dim[]) {
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

export function reviewQueue(
  aggregates: FeedbackAggregate[],
  stats: LocalizationStatRow[],
  t: Thresholds = DEFAULT_THRESHOLDS
): ReviewFlag[] {
  const flags = new Map<string, ReviewFlag>();
  const flag = (dim: Dim, key: string, reason: string, metrics: Record<string, number>, actions: readonly string[]) => {
    const id = `${dim}|${key}`;
    const f = flags.get(id) || { flag: 'REVIEW_REQUIRED' as const, subject: { kind: DIM_KIND[dim], key }, reasons: [], metrics: {}, suggested_actions: actions, automatic_mutation: false as const };
    if (!f.reasons.includes(reason)) f.reasons.push(reason);
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
  const bySource = new Map<string, LocalizationStatRow>();
  for (const s of stats) {
    if (!s.source_id) continue;
    const m = bySource.get(s.source_id) || { ...s, items: 0, ready: 0, title_only: 0, insufficient_evidence: 0, grounding_failures: 0, failed: 0 };
    m.items += s.items; m.ready += s.ready; m.title_only += s.title_only; m.insufficient_evidence += s.insufficient_evidence; m.grounding_failures += s.grounding_failures; m.failed += s.failed;
    bySource.set(s.source_id, m);
  }
  for (const [source, s] of bySource) {
    if (s.items < t.minItems) continue;
    const g = s.grounding_failures / s.items;
    const e = s.insufficient_evidence / s.items;
    if (g >= t.groundingFailureRate) flag('source_id', source, 'GROUNDING_FAILURE_SPIKE', { grounding_failure_rate: Math.round(g * 1000) / 1000, items: s.items }, ['prompt_improvement', 'model_change', 'evidence_extractor_fix']);
    if (e >= t.insufficientEvidenceRate) flag('source_id', source, 'EVIDENCE_INSUFFICIENT', { insufficient_evidence_rate: Math.round(e * 1000) / 1000, items: s.items }, ['source_specific_extraction_fix', 'evidence_extractor_fix', 'source_lifecycle_recanary']);
  }
  return [...flags.values()];
}

export const STATS_SQL = `SELECT COALESCE(source_id, feed_id) AS source_id,
  json_extract(enrichment_json, '$.localization.language') AS language,
  json_extract(enrichment_json, '$.localization.models.summary') AS summary_model,
  json_extract(enrichment_json, '$.localization.contract_version') AS contract_version,
  COUNT(*) AS items,
  SUM(enrichment_status = 'done') AS ready,
  SUM(enrichment_status = 'title_only') AS title_only,
  SUM(json_extract(enrichment_json, '$.localization.outcome') = 'INSUFFICIENT_EVIDENCE') AS insufficient_evidence,
  SUM(json_extract(enrichment_json, '$.localization.failure') = 'SUMMARY:SUMMARY_UNSUPPORTED') AS grounding_failures,
  SUM(enrichment_status = 'failed') AS failed
FROM source_items
WHERE json_extract(enrichment_json, '$.localization.contract_version') IS NOT NULL
  AND COALESCE(enriched_at, updated_at) >= ?
GROUP BY 1, 2, 3, 4`;

export async function loadReviewInputs(db: D1Database, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const fb = await db
    .prepare(`SELECT source_id, summary_model, contract_version, source_language, feedback_code, polarity FROM localization_feedback WHERE created_at >= ?`)
    .bind(since)
    .all<LocalizationFeedbackRow>();
  const st = await db.prepare(STATS_SQL).bind(since).all<LocalizationStatRow>();
  return { feedback: fb.results ?? [], stats: st.results ?? [] };
}

export { LOCALIZATION_CONTRACT_VERSION };
