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
export function evaluateBurnIn(ev) {
  const missing = [];
  const ok = (cond, name) => { if (!cond) missing.push(name); };
  const nowMs = Date.parse(ev?.nowUtc);
  const startMs = Date.parse(BURNIN_START_UTC);
  ok(Number.isFinite(nowMs), 'CURRENT_UTC_PARSEABLE');
  ok(nowMs >= startMs + ms(BURNIN_WINDOW_HOURS), 'BURNIN_WINDOW_192H');
  ok((ev?.ctCompletedRuns ?? -1) >= REQUIRED_CT_COMPLETED_RUNS, 'CT_COMPLETED_RUNS_GTE_7');
  ok((ev?.eurostatCompletedChecks ?? -1) >= REQUIRED_EUROSTAT_CHECKS, 'EUROSTAT_CHECKS_GTE_2');
  const inv = ev?.invariants ?? {};
  ok(inv.hardStops === 0, 'ZERO_HARD_STOP');
  ok(inv.duplicateLabels === 0, 'ZERO_DUPLICATE_LABEL');
  ok(Number.isFinite(inv.maxPerInvocationStatements) && inv.maxPerInvocationStatements <= MAX_PER_INVOCATION_STATEMENTS, 'PER_INVOCATION_STATEMENTS_WITHIN_HARD_STOP');
  ok(inv.globalConcurrencyMax <= MAX_GLOBAL_CONCURRENCY, 'GLOBAL_CONCURRENCY_MAX_1');
  ok(inv.leaseOverlaps === 0, 'ZERO_LEASE_OVERLAP');
  ok(ev?.unresolvedHardFailure === false, 'NO_UNRESOLVED_HARD_FAILURE');
  const s2 = ev?.stage2 ?? {};
  ok(s2.candidates === 0 && s2.snapshots === 0 && s2.reviews === 0 && s2.activePromotions === 0, 'STAGE2_REMAINED_LOCKED');
  ok(ev?.provenanceIntact === true, 'PROVENANCE_INTACT');
  ok(typeof ev?.rollback?.previousDisabledVersionId === 'string' && ev.rollback.previousDisabledVersionId.length > 0, 'ROLLBACK_VERSION_KNOWN');
  ok(ev?.rollback?.pausePathVerified === true, 'PAUSE_PATH_VERIFIED');
  return { frozen: missing.length === 0, missing };
}

export function renderFreezeRecord(ev) {
  const v = evaluateBurnIn(ev);
  if (!v.frozen) throw new Error(`R18_REFUSED:${v.missing.join(',')}`);
  return {
    marker: 'FROZEN_V1',
    scope: 'DOSSIER recurring production (Stage-1 burn-in evidence)',
    burnin_start_utc: BURNIN_START_UTC,
    frozen_at_utc: ev.nowUtc,
    window_hours: BURNIN_WINDOW_HOURS,
    ct_completed_runs: ev.ctCompletedRuns,
    eurostat_completed_checks: ev.eurostatCompletedChecks,
    invariants: ev.invariants,
    stage2: ev.stage2,
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
