// R18 final-freeze procedure: pure burn-in evidence evaluation with fixture proofs.
// The procedure refuses every incomplete state by requirement name and renders the immutable
// freeze record only when the frozen Stage-1 requirements genuinely hold. No production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateBurnIn, renderFreezeRecord, BURNIN_START_UTC } from '../../../../scripts/dossier-recurring-freeze.mjs';

const qualifying = () => ({
  nowUtc: '2026-10-15T00:17:31Z',
  ctCompletedRuns: 7,
  eurostatCompletedChecks: 2,
  invariants: { hardStops: 0, duplicateLabels: 0, maxPerInvocationStatements: 143, globalConcurrencyMax: 1, leaseOverlaps: 0 },
  unresolvedHardFailure: false,
  stage2: { candidates: 0, snapshots: 0, reviews: 0, activePromotions: 0 },
  provenanceIntact: true,
  rollback: { previousDisabledVersionId: 'ee60d69b', pausePathVerified: true },
});

test('qualifying burn-in evidence freezes with the exact record schema', () => {
  assert.equal(BURNIN_START_UTC, '2026-10-07T00:17:31Z');
  assert.deepEqual(evaluateBurnIn(qualifying()), { frozen: true, missing: [] });
  const r = renderFreezeRecord(qualifying());
  assert.equal(r.marker, 'FROZEN_V1');
  assert.equal(r.frozen_at_utc, '2026-10-15T00:17:31Z');
  assert.equal(r.ct_completed_runs, 7);
  assert.equal(r.eurostat_completed_checks, 2);
  assert.ok(r.not_implied_by_freeze.includes('OECD readiness (fallback-only, unresolved terms)'));
});

test('every single missing requirement refuses by name; the record is never rendered early', () => {
  const cases = [
    [{ nowUtc: '2026-10-14T00:17:31Z' }, 'BURNIN_WINDOW_192H'],
    [{ ctCompletedRuns: 6 }, 'CT_COMPLETED_RUNS_GTE_7'],
    [{ eurostatCompletedChecks: 1 }, 'EUROSTAT_CHECKS_GTE_2'],
    [{ invariants: { hardStops: 1, duplicateLabels: 0, maxPerInvocationStatements: 143, globalConcurrencyMax: 1, leaseOverlaps: 0 } }, 'ZERO_HARD_STOP'],
    [{ invariants: { hardStops: 0, duplicateLabels: 1, maxPerInvocationStatements: 143, globalConcurrencyMax: 1, leaseOverlaps: 0 } }, 'ZERO_DUPLICATE_LABEL'],
    [{ invariants: { hardStops: 0, duplicateLabels: 0, maxPerInvocationStatements: 401, globalConcurrencyMax: 1, leaseOverlaps: 0 } }, 'PER_INVOCATION_STATEMENTS_WITHIN_HARD_STOP'],
    [{ invariants: { hardStops: 0, duplicateLabels: 0, maxPerInvocationStatements: 143, globalConcurrencyMax: 2, leaseOverlaps: 0 } }, 'GLOBAL_CONCURRENCY_MAX_1'],
    [{ unresolvedHardFailure: true }, 'NO_UNRESOLVED_HARD_FAILURE'],
    [{ stage2: { candidates: 1, snapshots: 0, reviews: 0, activePromotions: 0 } }, 'STAGE2_REMAINED_LOCKED'],
    [{ provenanceIntact: false }, 'PROVENANCE_INTACT'],
    [{ rollback: { previousDisabledVersionId: '', pausePathVerified: true } }, 'ROLLBACK_VERSION_KNOWN'],
  ];
  for (const [patch, name] of cases) {
    const ev = { ...qualifying(), ...patch };
    if (patch.invariants) ev.invariants = patch.invariants;
    if (patch.stage2) ev.stage2 = patch.stage2;
    if (patch.rollback) ev.rollback = patch.rollback;
    const v = evaluateBurnIn(ev);
    assert.equal(v.frozen, false);
    assert.ok(v.missing.includes(name), `${name}: got ${v.missing.join(',')}`);
    assert.throws(() => renderFreezeRecord(ev), /R18_REFUSED/);
  }
});

test('CLI evaluates an evidence file and emits the record only when frozen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'r18-'));
  const evFile = join(dir, 'evidence.json');
  const outFile = join(dir, 'record.json');
  writeFileSync(evFile, JSON.stringify({ ...qualifying(), ctCompletedRuns: 3 }));
  assert.throws(() => execFileSync(process.execPath, ['scripts/dossier-recurring-freeze.mjs', '--evidence', evFile], { stdio: 'pipe' }), /R18_REFUSED: CT_COMPLETED_RUNS_GTE_7/);
  writeFileSync(evFile, JSON.stringify(qualifying()));
  execFileSync(process.execPath, ['scripts/dossier-recurring-freeze.mjs', '--evidence', evFile, '--emit', outFile], { stdio: 'pipe' });
  assert.equal(JSON.parse(readFileSync(outFile, 'utf8')).marker, 'FROZEN_V1');
});
