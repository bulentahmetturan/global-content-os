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
    evidence: 'SDMX data access proven (HTTP 200, anonymous, structured data). Re-checked 2026-10-03: www.oecd.org terms and API-guidance pages still answer 403 (Cloudflare challenge) to non-browser clients, the in-app browser content tools were unavailable, and the official SDMX structure/metadata endpoints expose no terms, licence or rate annotation (the generic reference-metadata structure is an empty external reference). Technical availability is not a permission conclusion; usage terms and request guidance remain unread.',
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

// ---------------------------------------------------------------- PLATFORM CAPACITY CONTRACT
// The Worker platform limits are PER PLAN and the plan is not readable from inside the Worker. The runner therefore never infers a plan: the owner records the
// verified numbers here (attributed operator controls; ABSENT = unverified = no run) and a run is allowed only when the configured operational budget FITS them.
// No clamping, no plan names, no billing API. Changing any recorded number automatically withdraws the verification (it must be re-asserted).
export const CONTROL_CAPACITY_VERIFIED = 'platform:capacity_verified';
export const CONTROL_CAPACITY_D1 = 'platform:d1_queries_per_invocation';
export const CONTROL_CAPACITY_SUBREQUESTS = 'platform:subrequest_limit';
export const CONTROL_CAPACITY_CPU_MS = 'platform:cpu_budget_ms';
const CAPACITY_NUMBER_KEYS = [CONTROL_CAPACITY_D1, CONTROL_CAPACITY_SUBREQUESTS, CONTROL_CAPACITY_CPU_MS] as const;

export interface PlatformCapacity {
  /** D1 queries one Worker invocation may issue (official per-plan limit as verified by the owner). */
  d1_queries_per_invocation: number | null;
  /** Subrequests (fetch + D1 + KV + R2) one invocation may issue. */
  subrequest_limit: number | null;
  /** CPU time budget per HTTP request in ms, as verified by the owner (waiting on D1 / fetch is not CPU time). Recorded for audit; not machine-compared. */
  cpu_budget_ms: number | null;
  /** True only when the owner explicitly asserted the three numbers above. */
  capacity_verified: boolean;
}
const posInt = (v: string | undefined): number | null => (v !== undefined && /^[1-9]\d{0,6}$/.test(v) ? Number(v) : null);
export function readPlatformCapacity(c: Controls): PlatformCapacity {
  return { d1_queries_per_invocation: posInt(c[CONTROL_CAPACITY_D1]), subrequest_limit: posInt(c[CONTROL_CAPACITY_SUBREQUESTS]), cpu_budget_ms: posInt(c[CONTROL_CAPACITY_CPU_MS]), capacity_verified: isOn(c, CONTROL_CAPACITY_VERIFIED) };
}
/** Subrequests one run invocation needs at most: every D1 statement of the budget plus one source request (the official count includes D1). */
export const SOURCE_REQUESTS_PER_INVOCATION = 1;
/** Why the verified platform capacity does NOT cover the operational budget (empty = it does). No silent clamp: a larger budget is refused, never reduced. */
export function platformCapacityBlockers(cap: PlatformCapacity, operationalBudget: number): string[] {
  const r: string[] = [];
  if (!cap.capacity_verified) r.push('PLATFORM_CAPACITY_NOT_VERIFIED');
  if (cap.d1_queries_per_invocation === null || cap.subrequest_limit === null || cap.cpu_budget_ms === null) r.push('PLATFORM_CAPACITY_VALUES_MISSING');
  if (!cap.capacity_verified || cap.d1_queries_per_invocation === null || cap.subrequest_limit === null) return r;
  if (operationalBudget > cap.d1_queries_per_invocation) r.push(`OPERATIONAL_BUDGET_EXCEEDS_VERIFIED_D1_CAPACITY:${operationalBudget}>${cap.d1_queries_per_invocation}`);
  if (operationalBudget + SOURCE_REQUESTS_PER_INVOCATION > cap.subrequest_limit) r.push(`OPERATIONAL_BUDGET_EXCEEDS_VERIFIED_SUBREQUEST_LIMIT:${operationalBudget + SOURCE_REQUESTS_PER_INVOCATION}>${cap.subrequest_limit}`);
  return r;
}

const KEY_OK = /^(canary_enabled|manual_runs_allowed|promotion_enabled|platform:(capacity_verified|d1_queries_per_invocation|subrequest_limit|cpu_budget_ms)|reader:dossier-[a-z0-9-]+:(enabled|extra_runs_authorized))$/;
const UPSERT = `INSERT INTO dossier_control (control_key, control_value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT (control_key) DO UPDATE SET control_value = excluded.control_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`;
/** The only mutation the operator control surface performs. Values are '0' / '1', a small non-negative integer for extra runs, or a positive integer for a recorded platform number. */
export async function setControl(db: D1Like, o: { key: string; value: string; updatedBy: string; now: string }): Promise<void> {
  if (!KEY_OK.test(o.key)) throw new DossierError('control_key_invalid', o.key);
  const extra = /:extra_runs_authorized$/.test(o.key);
  const capNumber = (CAPACITY_NUMBER_KEYS as readonly string[]).includes(o.key);
  const bad = capNumber ? !/^[1-9]\d{0,6}$/.test(o.value) : extra ? !/^\d{1,2}$/.test(o.value) : !['0', '1'].includes(o.value);
  if (bad) throw new DossierError('control_value_invalid', `${o.key}=${o.value}`);
  if (!o.updatedBy.trim()) throw new DossierError('control_updated_by_required');
  const by = o.updatedBy.trim();
  if (o.key === CONTROL_CAPACITY_VERIFIED && o.value === '1') {
    // asserting verification requires every number to be recorded first: "verified" without values would be an empty promise
    const cap = readPlatformCapacity(await loadControls(db));
    if (cap.d1_queries_per_invocation === null || cap.subrequest_limit === null || cap.cpu_budget_ms === null) throw new DossierError('capacity_values_required_before_verification');
  }
  await db.prepare(UPSERT).bind(o.key, o.value, o.now, by).run();
  // a changed number invalidates any earlier verification: it must be re-asserted explicitly
  if (capNumber) await db.prepare(UPSERT).bind(CONTROL_CAPACITY_VERIFIED, '0', o.now, by).run();
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
