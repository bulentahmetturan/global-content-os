#!/usr/bin/env node
// LOCAL measurement of the FINAL recurring code path, per Worker invocation (one cron tick = one invocation) and per logical run, on the recorded real ClinicalTrials page and the
// recorded real Eurostat slice in isolated in-memory databases. No network, no production access, nothing is written outside docs/generated.
//
// Metric units (exact; never compare across units):
//   D1_API_CALLS       calls to a D1 statement method (first/all/run) plus one per batch() call: the application's round trips to D1
//   D1_SQL_STATEMENTS  SQL statements executed: every first/all/run is 1, a batch() of N statements is N (this is the unit of the Cloudflare per-invocation D1 query limit and of the
//                      runner's statement budget `statements_used` / `d1_statements_per_invocation`)
//   D1_ROWS_RETURNED   rows handed back by reads (a LOWER BOUND of D1 `rows_read`: node:sqlite does not expose rows scanned)
//   D1_ROWS_WRITTEN    sqlite `changes` of writes (a LOWER BOUND of D1 `rows_written`: index writes are not counted)
//   SOURCE_SUBREQUESTS fetches to the official source endpoints
//   ITEMS_PROCESSED    work-list items moved to DONE by the invocation (source items; one CT study / one Eurostat cell)
//   WALL_LOCAL_PROXY   local wall time of the tick in ms (a PROXY only: sqlite is in-process, so it understates a real D1 invocation)
//   CHECKPOINT_WRITES  writes of the run row's progress / checkpoint (UPDATE dossier_canary_runs ... progress_json / checkpoint_json)
import { writeFileSync } from 'node:fs';
import { recWorld, ctServer, euServer, euRelease, studiesDated, CT_ID, EU_ID, q, n, clone, EU_FIXTURE } from '../apps/worker/src/dossier/recurring-support.mjs';

const H = 3_600_000;
const DAY = 86_400_000;

function meterDb(inner) {
  const m = { apiCalls: 0, statements: 0, rowsReturned: 0, rowsWritten: 0, checkpointWrites: 0 };
  const wrap = (sql) => {
    const s = inner.prepare(sql);
    const isCkpt = /UPDATE dossier_canary_runs SET [^;]*(progress_json|checkpoint_json)/.test(sql);
    const p = {
      bind: (...a) => { s.bind(...a); return p; },
      first: async () => { m.apiCalls += 1; m.statements += 1; const r = await s.first(); if (r) m.rowsReturned += 1; return r; },
      all: async () => { m.apiCalls += 1; m.statements += 1; const r = await s.all(); m.rowsReturned += r.results.length; return r; },
      run: async () => { m.apiCalls += 1; m.statements += 1; if (isCkpt) m.checkpointWrites += 1; const r = await s.run(); m.rowsWritten += r.meta?.changes ?? 0; return r; },
      _stmt: s,
    };
    return p;
  };
  const db = {
    prepare: wrap,
    batch: async (stmts) => { m.apiCalls += 1; m.statements += stmts.length; return inner.batch(stmts.map((x) => x._stmt ?? x)); },
  };
  return { db, m, reset: () => { for (const k of Object.keys(m)) m[k] = 0; } };
}

const done = (id) => (r) => r.reader_id === id && (r.run_status === 'COMPLETED' || r.run_status === 'FAILED' || r.action === 'CHECK_UNCHANGED' || r.action === 'CHECK_FAILED');

/** runs ticks (one per five minutes) until `stop`; returns one record per Worker invocation that did work */
async function drive(w, meter, source, stop, max = 400) {
  const out = [];
  for (let i = 0; i < max; i++) {
    meter.reset();
    const doneBefore = n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE status = 'DONE'`);
    const req0 = (w.ct.requests.length) + (w.eu.requests.length);
    const t0 = Date.now();
    const r = await w.tickAfter(5 * 60_000, { db: meter.db });
    const wall = Date.now() - t0;
    if (r.action === 'NOOP_NOTHING_DUE' || r.action === 'NOOP_RATE_CAP') { if (out.length && stop(r)) break; continue; }
    out.push({
      action: r.action, run_status: r.run_status, phase: r.phase,
      D1_API_CALLS: meter.m.apiCalls, D1_SQL_STATEMENTS: meter.m.statements, D1_ROWS_RETURNED: meter.m.rowsReturned, D1_ROWS_WRITTEN: meter.m.rowsWritten,
      SOURCE_SUBREQUESTS: w.ct.requests.length + w.eu.requests.length - req0,
      ITEMS_PROCESSED: n(w.sqlite, `SELECT COUNT(*) AS n FROM dossier_canary_work WHERE status = 'DONE'`) - doneBefore,
      WALL_LOCAL_PROXY_MS: wall, CHECKPOINT_WRITES: meter.m.checkpointWrites,
    });
    if (stop(r)) break;
  }
  return out;
}
const summarize = (inv) => {
  const sum = (k) => inv.reduce((a, x) => a + x[k], 0);
  const max = (k) => Math.max(0, ...inv.map((x) => x[k]));
  const sorted = (k) => [...inv].map((x) => x[k]).sort((a, b) => a - b);
  return {
    invocations: inv.length,
    PER_RUN_TOTAL: { D1_API_CALLS: sum('D1_API_CALLS'), D1_SQL_STATEMENTS: sum('D1_SQL_STATEMENTS'), D1_ROWS_RETURNED: sum('D1_ROWS_RETURNED'), D1_ROWS_WRITTEN: sum('D1_ROWS_WRITTEN'), SOURCE_SUBREQUESTS: sum('SOURCE_SUBREQUESTS'), ITEMS_PROCESSED: sum('ITEMS_PROCESSED'), CHECKPOINT_WRITES: sum('CHECKPOINT_WRITES') },
    PER_INVOCATION_MAX: { D1_API_CALLS: max('D1_API_CALLS'), D1_SQL_STATEMENTS: max('D1_SQL_STATEMENTS'), D1_ROWS_RETURNED: max('D1_ROWS_RETURNED'), D1_ROWS_WRITTEN: max('D1_ROWS_WRITTEN'), SOURCE_SUBREQUESTS: max('SOURCE_SUBREQUESTS'), ITEMS_PROCESSED: max('ITEMS_PROCESSED'), CHECKPOINT_WRITES: max('CHECKPOINT_WRITES'), WALL_LOCAL_PROXY_MS: max('WALL_LOCAL_PROXY_MS') },
    PER_INVOCATION_MEDIAN_D1_SQL_STATEMENTS: inv.length ? sorted('D1_SQL_STATEMENTS')[Math.floor(inv.length / 2)] : 0,
  };
};

async function newWorld(opts = {}) {
  const w = await recWorld({ uuidIds: true, ...opts });
  const meter = meterDb(w.db);
  return { w, meter };
}

export async function measure() {
  const result = { scenarios: {} };
  // ---- ClinicalTrials: first full run (the 100-study cap), a normal daily run, and an overlap-only poll
  {
    const { w, meter } = await newWorld({ ct: ctServer(studiesDated(100, '2026-10-08', { perDay: 50 })), states: { [CT_ID]: 'BURN_IN' } });
    const first = await drive(w, meter, CT_ID, done(CT_ID));
    result.scenarios.CT_FIRST_RUN_100_STUDIES = { description: 'first run: lookback window, the 100-study cap (the recorded real page)', ...summarize(first), concepts_derived: JSON.parse(w.runs(CT_ID)[0].progress_json).derived };
    w.ct.add(studiesDated(8, '2026-10-11', { idPrefix: 'NCT8', perDay: 8 }));
    w.ctx.setNow('2026-10-12T00:00:00.000Z');
    const daily = await drive(w, meter, CT_ID, done(CT_ID));
    const p2 = JSON.parse(w.runs(CT_ID)[1].progress_json);
    result.scenarios.CT_DAILY_8_NEW_STUDIES = { description: 'next day: 8 new studies plus the one-day overlap re-read', ...summarize(daily), items_in_run: p2.workTotal, concepts_derived: p2.derived, total_concepts: n(w.sqlite, 'SELECT COUNT(*) AS n FROM dossier_concepts') };
    w.ctx.setNow('2026-10-14T00:00:00.000Z');
    const quiet = await drive(w, meter, CT_ID, done(CT_ID));
    const p3 = JSON.parse(w.runs(CT_ID)[2].progress_json);
    result.scenarios.CT_NO_NEW_STUDIES_POLL = { description: 'the next run finds nothing new (only the one-day overlap)', ...summarize(quiet), items_in_run: p3.workTotal, concepts_derived: p3.derived };
  }
  // ---- Eurostat: first ingest (91 cells), unchanged weekly check, a new release
  {
    const { w, meter } = await newWorld({ states: { [EU_ID]: 'BURN_IN' } });
    const ingest = await drive(w, meter, EU_ID, done(EU_ID));
    const p = JSON.parse(w.runs(EU_ID)[0].progress_json);
    result.scenarios.EUROSTAT_FIRST_INGEST_91_CELLS = { description: 'check + full ingest of the recorded slice (one data request)', ...summarize(ingest), items_in_run: p.workTotal, concepts_derived: p.derived };
    w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 8 * DAY).toISOString());
    const check = await drive(w, meter, EU_ID, done(EU_ID));
    result.scenarios.EUROSTAT_WEEKLY_CHECK_UNCHANGED = { description: 'the weekly one-request release check finds nothing new', ...summarize(check) };
    w.eu.set(euRelease('2026-09-15T10:00:00+0200'));
    w.ctx.setNow(new Date(Date.parse(w.ctx.now()) + 8 * DAY).toISOString());
    const rev = await drive(w, meter, EU_ID, done(EU_ID));
    const p2 = JSON.parse(w.runs(EU_ID).at(-1).progress_json);
    result.scenarios.EUROSTAT_NEW_RELEASE_REVISION = { description: 'a newer dataset release: every cell is a new origin of the new release', ...summarize(rev), items_in_run: p2.workTotal, concepts_derived: p2.derived };
  }
  // ---- ineligible ticks do zero source work
  {
    const { w, meter } = await newWorld({ ct: ctServer(studiesDated(10, '2026-10-08', { perDay: 10 })) });
    await drive(w, meter, CT_ID, done(CT_ID));
    await drive(w, meter, EU_ID, done(EU_ID));
    const reqs = w.ct.requests.length + w.eu.requests.length;
    meter.reset();
    let ticks = 0;
    for (let i = 0; i < 100; i++) { const r = await w.tickAfter(5 * 60_000, { db: meter.db }); if (r.action !== 'NOOP_NOTHING_DUE') break; ticks += 1; }
    result.scenarios.INELIGIBLE_TICKS = { description: 'consecutive ticks while neither source is eligible', ticks, SOURCE_SUBREQUESTS: w.ct.requests.length + w.eu.requests.length - reqs, D1_SQL_STATEMENTS_PER_TICK: Math.ceil(meter.m.statements / Math.max(1, ticks)), D1_ROWS_WRITTEN: meter.m.rowsWritten };
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('dossier-recurring-measure.mjs')) {
  const r = await measure();
  const body = { marker: 'RECURRING_MEASUREMENTS_V1', date: '2026-10-06', harness: 'local node:sqlite behind the D1 surface, recorded real responses; WALL is a local proxy', units: 'see the header of scripts/dossier-recurring-measure.mjs', ...r };
  writeFileSync('docs/generated/dossier-recurring-measurements-v1.json', JSON.stringify(body, null, 2) + '\n');
  console.log(JSON.stringify(body.scenarios, (k, v) => v, 1).slice(0, 6000));
}
