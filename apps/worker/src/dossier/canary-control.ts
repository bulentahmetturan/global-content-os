/**
 * Canary operational controls: reader registration, kill switches and the per-invocation D1 statement budget.
 * Everything here is independent of the canonical GCOS source registry, TIME_SENSITIVE and the Evergreen runner.
 */
import type { LegalState } from './connectors';
import { DossierError, type D1Like, type D1Stmt } from './types';

// ---------------------------------------------------------------- registry (DOSSIER reader identity != canonical source identity)
export type TechnicalAccess = 'VERIFIED' | 'PARTIAL' | 'BLOCKED';
export type UsageTerms = 'VERIFIED' | 'PARTIAL' | 'UNRESOLVED';
export type RateGuidance = 'VERIFIED' | 'NOT_PUBLISHED' | 'UNRESOLVED';

export interface DossierReaderRegistration {
  dossier_reader_id: string;
  /** The canonical GCOS source this reader reads. The registration never creates, activates or alters that source. */
  canonical_source_id: string;
  signal_family: string;
  reader_class: string;
  /** Static registration state. The checked-in value is always false: enabling is a runtime operator control, never a code change. */
  enabled: boolean;
  state: 'CANARY_DISABLED';
  canary_profile: 'DOSSIER_CANARY_V1';
  legal_status: LegalState;
  technical_access: TechnicalAccess;
  usage_terms: UsageTerms;
  rate_guidance: RateGuidance;
  access_status: string;
  attribution_profile: 'CLINICALTRIALS_GOV' | 'OECD_HEALTH';
  runtime_mode: 'MANUAL_ONE_SHOT';
  last_reviewed_at: string;
  blocker: string | null;
  evidence: string;
}

export const DOSSIER_READER_REGISTRY: readonly DossierReaderRegistration[] = [
  {
    dossier_reader_id: 'dossier-clinicaltrials-frontier',
    canonical_source_id: 'clinicaltrials-gov-api-v2',
    signal_family: 'GLOBAL_RESEARCH_ACTIVITY',
    reader_class: 'TRIAL_METADATA',
    enabled: false,
    state: 'CANARY_DISABLED',
    canary_profile: 'DOSSIER_CANARY_V1',
    legal_status: 'APPROVED',
    technical_access: 'VERIFIED',
    usage_terms: 'VERIFIED',
    rate_guidance: 'NOT_PUBLISHED',
    access_status: 'PUBLIC_API_NO_KEY_ATTRIBUTION_REQUIRED',
    attribution_profile: 'CLINICALTRIALS_GOV',
    runtime_mode: 'MANUAL_ONE_SHOT',
    last_reviewed_at: '2026-10-03',
    blocker: null,
    evidence: 'Official OpenAPI (/api/oas/v2) and Terms and Conditions text (data free of charge; attribute the source, show the processing date, state modifications, keep current); no rate limit published (none assumed).',
  },
  {
    dossier_reader_id: 'dossier-oecd-turkiye-mortality',
    canonical_source_id: 'oecd-health',
    signal_family: 'TURKEY_HEALTH_BURDEN',
    reader_class: 'PUBLIC_DATA_API',
    enabled: false,
    state: 'CANARY_DISABLED',
    canary_profile: 'DOSSIER_CANARY_V1',
    legal_status: 'UNRESOLVED',
    technical_access: 'VERIFIED',
    usage_terms: 'UNRESOLVED',
    rate_guidance: 'UNRESOLVED',
    access_status: 'SDMX_ACCESS_VERIFIED_USAGE_TERMS_UNRESOLVED',
    attribution_profile: 'OECD_HEALTH',
    runtime_mode: 'MANUAL_ONE_SHOT',
    last_reviewed_at: '2026-10-03',
    blocker: 'OECD_USAGE_TERMS_UNRESOLVED: the official OECD terms and API-guidance pages answered 403 to this client (no bypass attempted); an operator must confirm the official terms and any request guidance, then set legal_status APPROVED and usage_terms VERIFIED',
    evidence: 'SDMX data access proven (HTTP 200, structured data); official usage terms and request guidance could not be read by permitted means.',
  },
];

export function readerRegistration(id: string): DossierReaderRegistration | null {
  return DOSSIER_READER_REGISTRY.find((r) => r.dossier_reader_id === id) ?? null;
}

/** Structural validation of a registration (a test also cross-checks canonical ids against the real catalogs). */
export function validateRegistration(r: DossierReaderRegistration): string[] {
  const e: string[] = [];
  if (r.enabled !== false || r.state !== 'CANARY_DISABLED') e.push('checked_in_registration_must_be_disabled');
  if (!r.dossier_reader_id.startsWith('dossier-')) e.push('dossier_reader_id_must_be_namespaced');
  if (r.dossier_reader_id === r.canonical_source_id) e.push('reader_identity_must_differ_from_canonical_source_identity');
  if (r.runtime_mode !== 'MANUAL_ONE_SHOT') e.push('runtime_mode_must_be_manual_one_shot');
  if (!['APPROVED', 'RESTRICTED', 'MANUAL_ONLY', 'UNRESOLVED', 'REJECTED'].includes(r.legal_status)) e.push('legal_status_not_in_vocabulary');
  return e;
}

/** Why a reader may NOT run in the canary (empty = it may). A reader whose usage terms are not verified never runs. */
export function readerAccessBlockers(r: DossierReaderRegistration): string[] {
  const b: string[] = [];
  if (r.technical_access !== 'VERIFIED') b.push(`TECHNICAL_ACCESS_${r.technical_access}`);
  if (r.usage_terms !== 'VERIFIED') b.push(`USAGE_TERMS_${r.usage_terms}`);
  if (r.legal_status !== 'APPROVED') b.push(`LEGAL_STATUS_${r.legal_status}`);
  return b;
}

// ---------------------------------------------------------------- controls (kill switches). ABSENT = OFF.
export const CONTROL_CANARY = 'canary_enabled';
export const CONTROL_MANUAL_RUNS = 'manual_runs_allowed';
export const CONTROL_PROMOTION = 'promotion_enabled';
export const controlReaderEnabled = (readerId: string): string => `reader:${readerId}:enabled`;
export const controlReaderExtraRuns = (readerId: string): string => `reader:${readerId}:extra_runs_authorized`;

export type Controls = Readonly<Record<string, string>>;

export async function loadControls(db: D1Like): Promise<Controls> {
  const { results } = await db.prepare(`SELECT control_key, control_value FROM dossier_control`).all<{ control_key: string; control_value: string }>();
  return Object.fromEntries(results.map((r) => [r.control_key, r.control_value]));
}
export const isOn = (c: Controls, key: string): boolean => c[key] === '1';

const KEY_OK = /^(canary_enabled|manual_runs_allowed|promotion_enabled|reader:dossier-[a-z0-9-]+:(enabled|extra_runs_authorized))$/;
/** The only mutation the operator control surface performs. Values are '0' / '1', or a small non-negative integer for extra runs. */
export async function setControl(db: D1Like, o: { key: string; value: string; updatedBy: string; now: string }): Promise<void> {
  if (!KEY_OK.test(o.key)) throw new DossierError('control_key_invalid', o.key);
  const extra = /:extra_runs_authorized$/.test(o.key);
  if (extra ? !/^\d{1,2}$/.test(o.value) : !['0', '1'].includes(o.value)) throw new DossierError('control_value_invalid', `${o.key}=${o.value}`);
  if (!o.updatedBy.trim()) throw new DossierError('control_updated_by_required');
  await db
    .prepare(`INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT (control_key) DO UPDATE SET control_value = excluded.control_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(o.key, o.value, o.now, o.updatedBy.trim())
    .run();
}

// ---------------------------------------------------------------- per-invocation D1 statement budget
export interface BudgetedD1 {
  db: D1Like;
  used(): number;
  remaining(): number;
  budget: number;
}
/**
 * Counts every prepared statement of ONE Worker invocation. A statement that would exceed the budget is refused with
 * `d1_statement_budget_exceeded` BEFORE it reaches the database; the runner pauses at unit boundaries well before that.
 */
export function createBudgetedD1(inner: D1Like, budget: number): BudgetedD1 {
  let used = 0;
  const db: D1Like = {
    prepare(sql: string): D1Stmt {
      if (used >= budget) throw new DossierError('d1_statement_budget_exceeded', `${used}/${budget}`);
      used += 1;
      return inner.prepare(sql);
    },
    ...(inner.batch ? { batch: (stmts: D1Stmt[]) => inner.batch!(stmts) } : {}),
  };
  return { db, used: () => used, remaining: () => Math.max(0, budget - used), budget };
}
