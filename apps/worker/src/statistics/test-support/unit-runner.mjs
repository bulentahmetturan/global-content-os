// Test-only orchestration of ONE bounded unit through the real storage API, in the order a reader will use:
//   run (PLANNED→RUNNING) → checkpoint lease → resume cursor → batches (series+versions+provenance+projection+checkpoint, one D1 batch each) → run complete + lease release.
// `crashAfterBatch: n` simulates process death after the n-th durable batch (the run is left RUNNING with its lease, exactly as a dead Worker would).
import { TRANSFORM_FP, obs } from './fixtures.mjs';

export async function runUnit(c, { sourceId, datasetId, readerClass = 'SDMX_READER', unitKind = 'SDMX_WINDOW', unitKey, release, owner = 'worker-A', mode = 'PRODUCTION', ttlMs, batches, parserVersion = 'p1', crashAfterBatch = null, skipComplete = false }) {
  const run = await c.repos.runs.create({ sourceId, datasetId, readerClass, readerVersion: 'r1', parserVersion, normalizerVersion: 'n1', mappingVersion: 'm1', transformFingerprint: TRANSFORM_FP, runMode: mode, plannedUnitKey: unitKey, bounds: { unit: unitKey }, releaseId: release.release_id });
  await c.repos.runs.start(run.run_id, { owner, ttlMs });
  const ck = await c.repos.checkpoints.acquireLease(datasetId, unitKey, unitKind, run.run_id, owner, ttlMs);
  const resumeFrom = ck.cursor_text;
  const counters = { inserted: 0, unchanged: 0, revised: 0, quarantined: 0 };
  const results = [];
  let done = 0;
  for (const [i, b] of batches.entries()) {
    if (resumeFrom !== null && b.cursor <= resumeFrom) continue; // resume: skip units already durable (cursor strings sort in unit order)
    const r = await c.repos.tx.commitBoundedBatch({
      runId: run.run_id,
      releaseId: release.release_id,
      series: b.series,
      observations: b.observations.map((o) => obs({ releaseId: release.release_id, runId: run.run_id, retrievedAt: c.clock.now(), ...o })),
      checkpoint: { checkpointId: ck.checkpoint_id, cursor: b.cursor, lastReleaseId: release.release_id, lastContentFingerprint: b.fingerprint ?? null, parserVersion },
    });
    results.push(r);
    c.S.accumulateCounters(counters, r);
    done++;
    if (crashAfterBatch !== null && i + 1 === crashAfterBatch) return { run, ck, results, crashed: true, counters };
  }
  if (skipComplete) return { run, ck, results, counters };
  const final = await c.repos.runs.complete(run.run_id, owner, { status: 'COMPLETED', finalize: true, counters, releaseCheckpointId: ck.checkpoint_id, checkpointSummary: `batches=${done}` });
  return { run: final, ck, results, counters, crashed: false };
}
