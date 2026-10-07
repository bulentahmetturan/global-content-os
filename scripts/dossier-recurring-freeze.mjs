#!/usr/bin/env node
// R18 recurring-production final freeze procedure (deterministic, repository-local).
//
// Evaluates burn-in evidence against the frozen Stage-1 requirements and, only when every
// requirement holds, renders the immutable freeze record. It never touches production, never
// manufactures evidence, and never freezes early: any missing requirement is refused by name.
//
// Frozen requirements (docs/DOSSIER-RECURRING-MULTI-FAMILY-OPERATION.md R17, runbook section 1):
//   current UTC >= burn-in start + 192h; CT completed runs >= 7; Eurostat completed checks >= 2;
//   recurring invariants PASS; no unresolved hard production failure; Stage-2 stayed locked;
//   provenance/history intact; rollback/shutdown path valid.
//
// Usage at freeze time (owner terminal, after a bounded live observation):
//   node scripts/dossier-recurring-freeze.mjs --evidence <evidence.json> [--emit <record.json>]
// Evidence shape is documented in evaluateBurnIn() below. --emit writes the record file only
// when the evidence freezes; otherwise it exits non-zero listing the missing requirements.
import { readFileSync, writeFileSync } from 'node:fs';

export const BURNIN_START_UTC = '2026-10-07T00:17:31Z';
export const BURNIN_WINDOW_HOURS = 192;
export const REQUIRED_CT_COMPLETED_RUNS = 7;
export const REQUIRED_EUROSTAT_CHECKS = 2;
export const MAX_PER_INVOCATION_STATEMENTS = 400;
export const MAX_GLOBAL_CONCURRENCY = 1;

const ms = (h) => h * 3600_000;

/**
 * Evidence (all from bounded live reads; nothing is inferred):
 * {
 *   nowUtc, ctCompletedRuns, eurostatCompletedChecks,
 *   invariants: { hardStops, duplicateLabels, maxPerInvocationStatements, globalConcurrencyMax, leaseOverlaps },
 *   unresolvedHardFailure: bool,
 *   stage2: { candidates, snapshots, reviews, activePromotions },
 *   provenanceIntact: bool,
 *   rollback: { previousDisabledVersionId: string|null, pausePathVerified: bool }
 * }
 */
const asFiniteInteger = (value, { min = 0 } = {}) => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isFinite(value)) return Number.NaN;
    return value >= min ? value : Number.NaN;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^(?:\d+)$/.test(trimmed)) return Number.NaN;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || !Number.isFinite(n) || n < min) return Number.NaN;
    return n;
  }
  return Number.NaN;
};

export function evaluateBurnIn(ev) {
  const missing = [];
  const ok = (cond, name) => { if (!cond) missing.push(name); };
  const nowMs = Date.parse(ev?.nowUtc);
  const startMs = Date.parse(BURNIN_START_UTC);
  const ctRuns = asFiniteInteger(ev?.ctCompletedRuns, { min: 0 });
  const eurostatChecks = asFiniteInteger(ev?.eurostatCompletedChecks, { min: 0 });
  const inv = ev?.invariants ?? {};
  const maxPerInvocationStatements = asFiniteInteger(inv.maxPerInvocationStatements, { min: 0 });
  const globalConcurrencyMax = asFiniteInteger(inv.globalConcurrencyMax, { min: 0 });
  const stage2 = ev?.stage2 ?? {};
  const stageCandidates = asFiniteInteger(stage2.candidates, { min: 0 });
  const stageSnapshots = asFiniteInteger(stage2.snapshots, { min: 0 });
  const stageReviews = asFiniteInteger(stage2.reviews, { min: 0 });
  const stageActivePromotions = asFiniteInteger(stage2.activePromotions, { min: 0 });
  const rollbackPrevious = typeof ev?.rollback?.previousDisabledVersionId === 'string' ? ev.rollback.previousDisabledVersionId.trim() : ev?.rollback?.previousDisabledVersionId;
  ok(Number.isFinite(nowMs), 'CURRENT_UTC_PARSEABLE');
  ok(nowMs >= startMs + ms(BURNIN_WINDOW_HOURS), 'BURNIN_WINDOW_192H');
  ok(ctRuns >= REQUIRED_CT_COMPLETED_RUNS, 'CT_COMPLETED_RUNS_GTE_7');
  ok(eurostatChecks >= REQUIRED_EUROSTAT_CHECKS, 'EUROSTAT_CHECKS_GTE_2');
  ok(asFiniteInteger(inv.hardStops, { min: 0 }) === 0, 'ZERO_HARD_STOP');
  ok(asFiniteInteger(inv.duplicateLabels, { min: 0 }) === 0, 'ZERO_DUPLICATE_LABEL');
  ok(Number.isFinite(maxPerInvocationStatements) && maxPerInvocationStatements <= MAX_PER_INVOCATION_STATEMENTS, 'PER_INVOCATION_STATEMENTS_WITHIN_HARD_STOP');
  ok(Number.isFinite(globalConcurrencyMax) && globalConcurrencyMax <= MAX_GLOBAL_CONCURRENCY, 'GLOBAL_CONCURRENCY_MAX_1');
  ok(asFiniteInteger(inv.leaseOverlaps, { min: 0 }) === 0, 'ZERO_LEASE_OVERLAP');
  ok(ev?.unresolvedHardFailure === false, 'NO_UNRESOLVED_HARD_FAILURE');
  ok(stageCandidates === 0 && stageSnapshots === 0 && stageReviews === 0 && stageActivePromotions === 0, 'STAGE2_REMAINED_LOCKED');
  ok(ev?.provenanceIntact === true, 'PROVENANCE_INTACT');
  ok(typeof rollbackPrevious === 'string' && rollbackPrevious.length > 0, 'ROLLBACK_VERSION_KNOWN');
  ok(ev?.rollback?.pausePathVerified === true, 'PAUSE_PATH_VERIFIED');
  return { frozen: missing.length === 0, missing };
}

export function renderFreezeRecord(ev) {
  const v = evaluateBurnIn(ev);
  if (!v.frozen) throw new Error(`R18_REFUSED:${v.missing.join(',')}`);
  const inv = ev.invariants ?? {};
  return {
    marker: 'FROZEN_V1',
    scope: 'DOSSIER recurring production (Stage-1 burn-in evidence)',
    burnin_start_utc: BURNIN_START_UTC,
    frozen_at_utc: ev.nowUtc,
    window_hours: BURNIN_WINDOW_HOURS,
    ct_completed_runs: asFiniteInteger(ev.ctCompletedRuns, { min: 0 }),
    eurostat_completed_checks: asFiniteInteger(ev.eurostatCompletedChecks, { min: 0 }),
    invariants: {
      hardStops: asFiniteInteger(inv.hardStops, { min: 0 }),
      duplicateLabels: asFiniteInteger(inv.duplicateLabels, { min: 0 }),
      maxPerInvocationStatements: asFiniteInteger(inv.maxPerInvocationStatements, { min: 0 }),
      globalConcurrencyMax: asFiniteInteger(inv.globalConcurrencyMax, { min: 0 }),
      leaseOverlaps: asFiniteInteger(inv.leaseOverlaps, { min: 0 }),
    },
    stage2: {
      candidates: asFiniteInteger((ev.stage2 ?? {}).candidates, { min: 0 }),
      snapshots: asFiniteInteger((ev.stage2 ?? {}).snapshots, { min: 0 }),
      reviews: asFiniteInteger((ev.stage2 ?? {}).reviews, { min: 0 }),
      activePromotions: asFiniteInteger((ev.stage2 ?? {}).activePromotions, { min: 0 }),
    },
    provenance_intact: true,
    rollback: ev.rollback,
    not_implied_by_freeze: [
      'steady-state retention/compaction (declared schema decision, not implemented)',
      'OECD readiness (fallback-only, unresolved terms)',
      'alert-threshold recalibration (needs longer burn-in measurements)',
      'append-only audit table (additive migration, not approved)',
      'Hub UI for dossier (deferred, non-blocking)',
    ],
  };
}

const args = process.argv.slice(2);
const invokedAsCli = typeof process.argv[1] === 'string' && (process.argv[1].endsWith('dossier-recurring-freeze.mjs') || process.argv[1].endsWith('dossier-recurring-freeze'));
if (invokedAsCli) {
  const get = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };
  const evFile = get('--evidence');
  if (!evFile) { console.error('usage: dossier-recurring-freeze.mjs --evidence <evidence.json> [--emit <record.json>]'); process.exit(2); }
  const ev = JSON.parse(readFileSync(evFile, 'utf8'));
  const v = evaluateBurnIn(ev);
  if (!v.frozen) { console.error(`R18_REFUSED: ${v.missing.join(', ')}`); process.exit(1); }
  const record = renderFreezeRecord(ev);
  const out = get('--emit');
  if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  else console.log(JSON.stringify(record, null, 2));
}
