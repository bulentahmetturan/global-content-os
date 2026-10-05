// Test-only harness for the recurring operation (never imported by runtime code): a fresh deterministic local world, a fake ClinicalTrials server with the real
// API's incremental semantics (first-post date lower bound, newest-first order, page tokens), a Eurostat fake that serves the RECORDED real response, and a clock.
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { openDossierDb, makeCtx, setTestCapacity } from './test-support.mjs';

export const RP = await bundle('apps/worker/src/dossier/recurring-profile.ts', 'rec-profile');
export const RC = await bundle('apps/worker/src/dossier/recurring-control.ts', 'rec-control');
export const RH = await bundle('apps/worker/src/dossier/recurring-health.ts', 'rec-health');
export const RS = await bundle('apps/worker/src/dossier/recurring-scheduler.ts', 'rec-sched');
export const CR = await bundle('apps/worker/src/dossier/canary.ts', 'rec-runner');
export const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'rec-cc');
export const EU = await bundle('apps/worker/src/dossier/eurostat.ts', 'rec-eu');

export const CT_ID = RP.RECURRING_CT_READER_ID;
export const EU_ID = RP.RECURRING_EU_READER_ID;
const rec = (f) => JSON.parse(readFileSync(`apps/worker/src/dossier/recorded/${f}`, 'utf8')).response;
export const CT100 = rec('clinicaltrials-page100.json');
export const EU_FIXTURE = rec('eurostat-hlth-cd-asdr2-tr-2023.json');
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const q = (sqlite, sql, ...a) => sqlite.prepare(sql).all(...a);
export const n = (sqlite, sql, ...a) => sqlite.prepare(sql).get(...a).n;

export const firstPost = (s) => s.protocolSection.statusModule.studyFirstPostDateStruct.date;
/** Re-dates the recorded studies so a test controls exactly which are "new" (the study content, conditions and interventions stay the recorded real ones). */
export function studiesDated(count, startDate, { idPrefix = 'NCT9', perDay = 10 } = {}) {
  const base = CT100.studies.slice(0, count);
  return base.map((s, i) => {
    const c = clone(s);
    const d = new Date(Date.parse(`${startDate}T00:00:00Z`) + Math.floor(i / perDay) * 86_400_000).toISOString().slice(0, 10);
    c.protocolSection.statusModule.studyFirstPostDateStruct = { date: d };
    c.protocolSection.identificationModule.nctId = `${idPrefix}${String(i).padStart(7, '0')}`;
    return c;
  });
}

/** Fake of the ClinicalTrials v2 list endpoint: filter.advanced lower bound (inclusive), newest first, pageSize, opaque page tokens, an optional server-side page cap. */
export function ctServer(initial = [], { pageCap = Infinity } = {}) {
  const srv = { studies: [...initial], requests: [], failNext: null, pageCap };
  srv.add = (more) => srv.studies.push(...more);
  srv.fetch = async (url) => {
    const u = new URL(url);
    srv.requests.push(url);
    if (srv.failNext) { const f = srv.failNext; srv.failNext = null; return f; }
    const since = /RANGE\[(\d{4}-\d{2}-\d{2}),MAX\]/.exec(u.searchParams.get('filter.advanced') ?? '')?.[1] ?? '0000-00-00';
    const size = Math.min(Number(u.searchParams.get('pageSize')), srv.pageCap);
    const start = u.searchParams.get('pageToken') ? Number(u.searchParams.get('pageToken').replace('tok', '')) : 0;
    const all = srv.studies.filter((s) => firstPost(s) >= since).sort((a, b) => firstPost(b).localeCompare(firstPost(a)) || a.protocolSection.identificationModule.nctId.localeCompare(b.protocolSection.identificationModule.nctId));
    const page = all.slice(start, start + size);
    const body = { studies: clone(page), totalCount: all.length, ...(start + size < all.length ? { nextPageToken: `tok${start + size}` } : {}) };
    return { ok: true, status: 200, json: async () => clone(body) };
  };
  return srv;
}
export const httpFail = (status) => ({ ok: false, status, json: async () => ({}), headers: { get: () => null } });

/** Fake Eurostat: serves the recorded slice for the data request and the same body for the tiny check; `body` is swappable (a newer release, a revision, drift). */
export function euServer(body = EU_FIXTURE) {
  const srv = { body: clone(body), requests: [], failNext: null };
  srv.set = (b) => { srv.body = clone(b); };
  srv.fetch = async (url) => {
    srv.requests.push(url);
    if (srv.failNext) { const f = srv.failNext; srv.failNext = null; return f; }
    return { ok: true, status: 200, json: async () => clone(srv.body), headers: { get: () => null } };
  };
  return srv;
}
export const euRelease = (iso) => { const b = clone(EU_FIXTURE); b.updated = iso; return b; };

/**
 * A fresh recurring world. Both sources are BURN_IN by default (set by the OWNER, as in production); `start` is the clock origin; the invocation ledger and the
 * capacity are the owner's. `statements` counts every prepared statement of the tick (to prove a disabled deployment reads nothing).
 */
export async function recWorld({ ct = ctServer(studiesDated(40, '2026-10-09')), eu = euServer(), states = { [CT_ID]: 'BURN_IN', [EU_ID]: 'BURN_IN' }, enabled = true, envOn = true, capacity = true, start = '2026-10-10T00:00:00.000Z', uuidIds = false } = {}) {
  const { sqlite, db } = openDossierDb();
  const ctx = makeCtx(start);
  if (uuidIds) { let k = 0; ctx.id = (prefix) => `${prefix}_${String(++k).padStart(8, '0')}-0000-4000-8000-${String(k).padStart(12, '0')}`; } // production-shaped ids (crun_<uuid>)
  let statements = 0;
  const counted = { prepare: (sql) => { statements += 1; return db.prepare(sql); }, batch: db.batch };
  const w = { sqlite, db, ctx, ct, eu, logs: [], counted, statements: () => statements, resetStatements: () => { statements = 0; } };
  const owner = (over) => ({ by: 'owner', actor: 'owner-test', now: ctx.now(), ...over });
  if (capacity) await setTestCapacity(db);
  if (enabled) await RC.setRecurringFlag(db, owner({ key: RC.CONTROL_RECURRING_ENABLED, value: '1' }));
  for (const [id, to] of Object.entries(states)) if (to !== 'DISABLED') await RC.setRecurringState(db, owner({ readerId: id, to }));
  w.owner = owner;
  w.deps = (over = {}) => ({ db: over.db ?? db, env: { DOSSIER_RECURRING_ENABLED: envOn ? 'true' : 'false' }, ctFetch: ct.fetch, euFetch: eu.fetch, ctx, sleep: async () => {}, log: (e) => w.logs.push(e), ...over });
  w.tick = (over) => RS.runRecurringTick(w.deps(over));
  /** advances the clock by `ms` then ticks (one cron firing). */
  w.tickAfter = (ms, over) => { ctx.setNow(new Date(Date.parse(ctx.now()) + ms).toISOString()); return w.tick(over); };
  /** ticks every five minutes until `stop(report)` is true (bounded). */
  w.drain = async (stop, max = 400) => {
    const reports = [];
    for (let i = 0; i < max; i++) { const r = await w.tickAfter(5 * 60_000); reports.push(r); if (stop(r)) break; }
    return reports;
  };
  w.runs = (readerId) => q(sqlite, `SELECT * FROM dossier_canary_runs WHERE reader_id = ? ORDER BY created_at, run_id`, readerId);
  w.controls = () => Object.fromEntries(q(sqlite, 'SELECT control_key, control_value FROM dossier_control').map((r) => [r.control_key, r.control_value]));
  w.state = (id) => w.controls()[RC.controlRecurringState(id)] ?? 'DISABLED';
  return w;
}
