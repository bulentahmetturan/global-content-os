/**
 * DOSSIER canary readiness: auditable components, a top level DERIVED from them (never one opaque boolean), environment reported separately.
 *
 * Semantics (so DOSSIER can never take unrelated GCOS features down):
 *   DISABLED   the canary is intentionally off (environment master switch false). Components are still reported; this is NOT a failure and does not
 *              change the global /api/ready level. A live schema that is not yet migrated is reported as SCHEMA_READY=false with an expected-before-migration note.
 *   READY      every component is ready.
 *   DEGRADED   only non-critical components are not ready (a reader's access/legal blocker, for example OECD usage terms): the rest of the canary can run.
 *   BLOCKED    the canary is enabled but a critical component is not ready (schema, policy, registration, runner, provenance, governance, kill switch).
 */
import { validateCanaryProfile, type DossierCanaryProfile } from './canary-profile';
import { DOSSIER_READER_REGISTRY, readerAccessBlockers, validateRegistration, type DossierReaderRegistration } from './canary-control';
import type { D1Like } from './types';

export type ComponentName =
  | 'SCHEMA_READY' | 'RUNTIME_READY' | 'CANARY_POLICY_READY' | 'SOURCE_REGISTRATION_READY' | 'SOURCE_ACCESS_READY'
  | 'MANUAL_RUNNER_READY' | 'PROVENANCE_READY' | 'P5_GOVERNANCE_READY' | 'KILL_SWITCH_READY';
export const CRITICAL_COMPONENTS: readonly ComponentName[] = ['SCHEMA_READY', 'RUNTIME_READY', 'CANARY_POLICY_READY', 'SOURCE_REGISTRATION_READY', 'MANUAL_RUNNER_READY', 'PROVENANCE_READY', 'P5_GOVERNANCE_READY', 'KILL_SWITCH_READY'];

export interface ComponentReport {
  ready: boolean;
  critical: boolean;
  reasons: string[];
}
export type DossierReadinessLevel = 'READY' | 'DEGRADED' | 'BLOCKED' | 'DISABLED';
export interface DossierReadiness {
  environment: 'LOCAL' | 'LIVE';
  level: DossierReadinessLevel;
  canary_enabled_by_config: boolean;
  components: Record<ComponentName, ComponentReport>;
  not_ready: ComponentName[];
  note: string;
}

export interface DossierReadinessInputs {
  environment: 'LOCAL' | 'LIVE';
  envMasterSwitch: boolean;
  /** Canary tables exist (migration 0031 applied) and are readable. */
  schemaPresent: boolean;
  controlsReadable: boolean;
  profile: DossierCanaryProfile;
  registry?: readonly DossierReaderRegistration[];
  /** The runner and operator surface are part of the deployed build. */
  runnerWired: boolean;
}

export function evaluateDossierReadiness(i: DossierReadinessInputs): DossierReadiness {
  const registry = i.registry ?? DOSSIER_READER_REGISTRY;
  const profileErrors = validateCanaryProfile(i.profile);
  const registryErrors = registry.flatMap((r) => validateRegistration(r).map((e) => `${r.dossier_reader_id}:${e}`));
  const setOfSources = new Set(registry.map((r) => r.canonical_source_id));
  const profileSources = (i.profile?.sources?.value ?? []).map((s) => s.canonical_source_id);
  const missingReg = profileSources.filter((s) => !setOfSources.has(s)).map((s) => `NO_READER_REGISTRATION:${s}`);
  const blockedReaders = registry.flatMap((r) => readerAccessBlockers(r).map((b) => `${r.dossier_reader_id}:${b}`));
  const c = (critical: boolean, reasons: string[]): ComponentReport => ({ ready: reasons.length === 0, critical, reasons });
  const components: Record<ComponentName, ComponentReport> = {
    SCHEMA_READY: c(true, i.schemaPresent ? [] : ['SCHEMA_0031_NOT_APPLIED' + (i.environment === 'LIVE' && !i.envMasterSwitch ? '(expected before the approved migration)' : '')]),
    RUNTIME_READY: c(true, i.schemaPresent ? [] : ['CANARY_RUNTIME_TABLES_MISSING']),
    CANARY_POLICY_READY: c(true, profileErrors),
    SOURCE_REGISTRATION_READY: c(true, [...registryErrors, ...missingReg]),
    SOURCE_ACCESS_READY: c(false, blockedReaders),
    MANUAL_RUNNER_READY: c(true, [...(i.runnerWired ? [] : ['RUNNER_NOT_WIRED']), ...(i.profile?.run_mode?.value === 'MANUAL_ONE_SHOT' ? [] : ['RUN_MODE_NOT_MANUAL_ONE_SHOT'])]),
    PROVENANCE_READY: c(true, [...(Number.isInteger(i.profile?.provenance_refs_per_signal_family?.value) ? [] : ['PROVENANCE_CAP_NOT_SET']), ...(i.profile?.retention?.value === 'CANARY_HOLD_UNTIL_REVIEW' ? [] : ['CANARY_RETENTION_NOT_HOLD_UNTIL_REVIEW']), ...(i.schemaPresent ? [] : ['PROVENANCE_TABLES_MISSING'])]),
    P5_GOVERNANCE_READY: c(true, [...(i.profile?.promotion?.auto_accept?.value === false ? [] : ['AUTO_ACCEPT_POSSIBLE']), ...(i.profile?.promotion?.auto_publish?.value === false ? [] : ['AUTO_PUBLISH_POSSIBLE']), ...(i.profile?.promotion?.source_specific_frontier?.value === 'DISABLED' ? [] : ['SOURCE_SPECIFIC_FRONTIER_ENABLED'])]),
    KILL_SWITCH_READY: c(true, [...(i.controlsReadable ? [] : ['CONTROL_TABLE_UNREADABLE'])]),
  };
  const notReady = (Object.keys(components) as ComponentName[]).filter((k) => !components[k].ready);
  const criticalDown = notReady.filter((k) => components[k].critical);
  let level: DossierReadinessLevel;
  let note: string;
  if (!i.envMasterSwitch) {
    level = 'DISABLED';
    note = 'DOSSIER canary is intentionally disabled by configuration: not a system failure and not part of the global readiness level';
  } else if (criticalDown.length) {
    level = 'BLOCKED';
    note = 'DOSSIER canary is enabled but a critical component is not ready (canary only: unrelated GCOS features are unaffected)';
  } else if (notReady.length) {
    level = 'DEGRADED';
    note = 'a non-critical component is not ready (for example a reader whose source access or legal status is not verified)';
  } else {
    level = 'READY';
    note = 'all canary components are ready';
  }
  return { environment: i.environment, level, canary_enabled_by_config: i.envMasterSwitch, components, not_ready: notReady, note };
}

/** Reads the facts the pure evaluation needs from D1 (the Worker path). A missing canary table is a fact, never an exception. */
export async function gatherDossierReadiness(db: D1Like, o: { environment: 'LOCAL' | 'LIVE'; envMasterSwitch: boolean; profile: DossierCanaryProfile; runnerWired?: boolean }): Promise<DossierReadiness> {
  let schemaPresent = false;
  let controlsReadable = false;
  try {
    await db.prepare(`SELECT 1 FROM dossier_canary_runs LIMIT 1`).first();
    await db.prepare(`SELECT 1 FROM dossier_control LIMIT 1`).first();
    schemaPresent = true;
    controlsReadable = true;
  } catch {
    schemaPresent = false;
  }
  return evaluateDossierReadiness({ environment: o.environment, envMasterSwitch: o.envMasterSwitch, schemaPresent, controlsReadable, profile: o.profile, runnerWired: o.runnerWired ?? true });
}
