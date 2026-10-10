// Phase D (overnight hardening): DISABLED DEPLOY REHEARSAL. The real Worker bundle runs against a migrated (0031) disposable database in the two
// configurations that matter for the first deploy. No network is reachable (fetch is a recording stub that refuses); nothing is deployed anywhere.
//   D1  schema 0031 present, DOSSIER_CANARY_ENABLED=false            -> normal GCOS healthy, DOSSIER disabled, nothing runs, no source access, no candidates
//   D2  schema 0031 present, DOSSIER_CANARY_ENABLED=true, reader controls OFF, platform capacity unverified -> nothing runs, the exact blocker is explained
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';
import { readMigrations, replay } from '../../../../scripts/migration-authority.mjs';
import { openDossierDb, setTestCapacity } from './test-support.mjs';

const worker = (await bundle('apps/worker/src/index.ts', 'deploy-rehearsal-worker')).default;
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'deploy-rehearsal-control');
const TOKEN = 'rehearsal-ops-token-0001';
const CT_ID = 'dossier-clinicaltrials-frontier';
const OE_ID = 'dossier-oecd-turkiye-mortality';
const DOSSIER_HOSTS = /clinicaltrials\.gov|sdmx\.oecd\.org/;

function networkGuard() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url instanceof Request ? url.url : url)); throw new Error('network is disabled in the deploy rehearsal'); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const ctxOf = () => { const pending = []; return { pending, waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})), passThroughOnException() {} }; };
const dossierRows = (sqlite) => ['dossier_canary_runs', 'dossier_signal_runs', 'dossier_observations', 'dossier_concepts', 'dossier_candidates', 'dossier_candidate_snapshots', 'dossier_reviews', 'dossier_signal_aggregates'].reduce((a, t) => a + sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);
const gcosDigest = (sqlite) => JSON.stringify(['source_feeds', 'source_items', 'item_path_membership', 'evergreen_runtime_state', 'approved_briefs'].map((t) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n));
const authed = { headers: { authorization: `Bearer ${TOKEN}` } };
const post = (path, body) => ({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = (env, path, init) => worker.fetch(new Request(`https://rehearsal.invalid${path}`, init), env, ctxOf());
const envOf = (db, over = {}) => ({ DB: db, ENVIRONMENT: 'rehearsal', OPS_TOKEN: TOKEN, DOSSIER_CANARY_ENABLED: 'false', ...over });

test('wrangler.toml as deployed: master switch is the string "false", the only cron is the existing GCOS one (no DOSSIER trigger), no environment override enables DOSSIER', () => {
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /^DOSSIER_CANARY_ENABLED = "false"/m);
  assert.deepEqual((toml.match(/crons\s*=\s*\[[^\]]*\]/g) ?? []).length, 1);
  assert.ok(!/\[env\./.test(toml), 'no per-environment section can override the switch');
  assert.ok(!/DOSSIER_CANARY_ENABLED\s*=\s*"true"/.test(toml));
  assert.ok(!/OPS_TOKEN\s*=/.test(toml), 'no secret value is checked in');
});

test('D1: schema 0031 present + master switch OFF -> normal GCOS healthy; DOSSIER disabled; no run, no source access, no candidate, no GCOS mutation', async () => {
  const net = networkGuard();
  try {
    const { sqlite, db, secrets } = healthyBase('0046_protocol_mediterranean_wave2.sql');
    const env = envOf(db, secrets);
    const before = gcosDigest(sqlite);
    assert.equal((await call(env, '/api/health')).status, 200);
    const ready = await call(env, '/api/ready');
    const readyBody = await ready.json();
    assert.equal(ready.status, 200);
    assert.equal(readyBody.dossier?.level, 'DISABLED');
    const readiness = await (await call(env, '/api/dossier/canary/readiness', authed)).json();
    assert.equal(readiness.readiness.level, 'DISABLED');
    assert.equal(readiness.readiness.canary_enabled_by_config, false);
    const status = await (await call(env, '/api/dossier/canary/status', authed)).json();
    assert.equal(status.env_master_switch, false);
    assert.ok(status.readers.every((r) => r.may_run_now === false && r.runtime_enabled === false));
    // even a fully "enabled" operator cannot run while the master switch is off
    for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.controlReaderEnabled(CT_ID), '1']]) await CC.setControl(db, { key: k, value: v, updatedBy: 'op', now: 't' });
    await setTestCapacity(db);
    const run = await call(env, '/api/dossier/canary/run', post('', { operator: 'op', reader_id: CT_ID }));
    assert.equal(run.status, 409);
    assert.deepEqual((await run.json()).reasons, ['ENV_CANARY_DISABLED']);
    assert.equal(net.calls.length, 0, 'no network request of any kind');
    assert.equal(dossierRows(sqlite), 0, 'no run, observation, concept, candidate or review exists');
    assert.equal(gcosDigest(sqlite), before, 'no GCOS table changed');
  } finally { net.restore(); }
});

test('D2: schema 0031 present + master switch ON + reader controls OFF + capacity unverified -> nothing runs, readiness names the exact blocker, normal GCOS stays healthy', async () => {
  const net = networkGuard();
  try {
    const { sqlite, db, secrets } = healthyBase('0046_protocol_mediterranean_wave2.sql');
    const envOff = envOf(db, { ...secrets, STATUS_CALLBACK_TOKEN: undefined });
    const env = envOf(db, { ...secrets, STATUS_CALLBACK_TOKEN: undefined, DOSSIER_CANARY_ENABLED: 'true' });
    const healthOff = await (await call(envOff, '/api/ready')).json();
    const healthOn = await call(env, '/api/ready');
    const healthOnBody = await healthOn.json();
    assert.equal(healthOn.status, 200, 'enabling DOSSIER never changes the HTTP readiness of normal GCOS');
    assert.equal(healthOnBody.level, healthOff.level, 'the global GCOS level is independent of DOSSIER');
    assert.equal(healthOnBody.dossier.level, 'BLOCKED', 'DOSSIER itself reports BLOCKED_FOR_RUN');
    assert.ok(healthOnBody.dossier.not_ready.includes('PLATFORM_CAPACITY_READY'));
    const readiness = await (await call(env, '/api/dossier/canary/readiness', authed)).json();
    assert.deepEqual(readiness.readiness.components.PLATFORM_CAPACITY_READY.reasons.slice(0, 2), ['PLATFORM_CAPACITY_NOT_VERIFIED', 'PLATFORM_CAPACITY_VALUES_MISSING']);
    for (const reader of [CT_ID, OE_ID]) {
      const run = await call(env, '/api/dossier/canary/run', post('', { operator: 'op', reader_id: reader }));
      assert.equal(run.status, 409);
      const reasons = (await run.json()).reasons;
      assert.ok(reasons.includes('PLATFORM_CAPACITY_NOT_VERIFIED') && reasons.includes('READER_DISABLED') && reasons.includes('CANARY_DISABLED_BY_OPERATOR') && reasons.includes('MANUAL_RUNS_NOT_ALLOWED'), reasons.join());
    }
    assert.equal((await call(env, '/api/health')).status, 200);
    assert.equal(net.calls.length, 0);
    assert.equal(dossierRows(sqlite), 0);
  } finally { net.restore(); }
});

/** A production-shaped, HEALTHY base: migrations recorded in d1_migrations, a fresh cron heartbeat, every optional secret present, handoff in stub mode. */
function healthyBase(upTo) {
  const { sqlite, db } = openDossierDb();
  sqlite.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort().filter((n) => n <= upTo);
  for (const f of files) sqlite.prepare(`INSERT INTO d1_migrations (name) VALUES (?)`).run(f);
  sqlite.prepare(`UPDATE source_feeds SET last_fetched_at = ? WHERE id = (SELECT id FROM source_feeds LIMIT 1)`).run(new Date().toISOString());
  const statistics = replay(readMigrations('migrations/statistics'));
  return { sqlite, db, secrets: { STATS_DB: d1FromSqlite(statistics.db), STATUS_CALLBACK_TOKEN: 's', TIP_RADAR_INGEST_TOKEN: 'i', OPENALEX_API_KEY: 'o', CCOS_HANDOFF_STUB: 'true' } };
}

test('DEPLOY ORDER and global readiness semantics on a healthy base: Worker deployed BEFORE 0031 is BLOCKED (503, loud); after 0031 READY with DOSSIER disabled; enabling DOSSIER before capacity is verified only DEGRADES (200) with the one named reason; verified capacity restores READY', async () => {
  const net = networkGuard();
  try {
    // R3 before R1 (wrong order): the new code expects 0031, the database is at 0030 -> BLOCKED, readable reason, and still no DOSSIER activity
    const early = healthyBase('0030_source_lifecycle_pubmed_carrier_reconcile.sql');
    const e = await call(envOf(early.db, early.secrets), '/api/ready');
    const eb = await e.json();
    assert.equal(e.status, 503);
    assert.ok(eb.blocked.some((b) => b.startsWith('SCHEMA_BEHIND:0030')), eb.blocked.join());
    // correct order: 0031 applied, master switch off -> READY, DOSSIER DISABLED
    const requiredGlobalSchema = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort().at(-1);
    const ok = healthyBase(requiredGlobalSchema);
    const r1 = await (await call(envOf(ok.db, ok.secrets), '/api/ready')).json();
    assert.equal(r1.level, 'READY');
    assert.equal(r1.dossier.level, 'DISABLED');
    assert.deepEqual([r1.blocked, r1.degraded], [[], []]);
    // master switch ON but capacity not yet verified: GCOS still serves (200), level DEGRADED with exactly one DOSSIER reason, DOSSIER itself BLOCKED_FOR_RUN
    const r2res = await call(envOf(ok.db, { ...ok.secrets, DOSSIER_CANARY_ENABLED: 'true' }), '/api/ready');
    const r2 = await r2res.json();
    assert.equal(r2res.status, 200);
    assert.deepEqual([r2.level, r2.blocked, r2.degraded], ['DEGRADED', [], ['DOSSIER_CANARY_NOT_READY']]);
    assert.equal(r2.dossier.level, 'BLOCKED');
    assert.ok(r2.dossier.components.PLATFORM_CAPACITY_READY.reasons.includes('PLATFORM_CAPACITY_NOT_VERIFIED'));
    assert.equal((await call(envOf(ok.db, { ...ok.secrets, DOSSIER_CANARY_ENABLED: 'true' }), '/api/health')).status, 200);
    // capacity recorded and verified by the owner: the DOSSIER component is ready again and the global level returns to READY
    await setTestCapacity(ok.db);
    const r3 = await (await call(envOf(ok.db, { ...ok.secrets, DOSSIER_CANARY_ENABLED: 'true' }), '/api/ready')).json();
    assert.equal(r3.dossier.components.PLATFORM_CAPACITY_READY.ready, true);
    assert.deepEqual([r3.level, r3.degraded], r3.dossier.level === 'BLOCKED' ? ['DEGRADED', ['DOSSIER_CANARY_NOT_READY']] : ['READY', []]);
    assert.equal(net.calls.length, 0);
    for (const w of [early, ok]) assert.equal(dossierRows(w.sqlite), 0);
  } finally { net.restore(); }
});

test('deploy boot invariants: missing OPS_TOKEN, unknown capacity, disabled reader and the global kill switch each independently prevent a run (every other switch ON)', async () => {
  const net = networkGuard();
  try {
    const build = async () => {
      const { sqlite, db } = openDossierDb();
      for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1']]) await CC.setControl(db, { key: k, value: v, updatedBy: 'op', now: 't' });
      await setTestCapacity(db);
      return { sqlite, db };
    };
    const body = post('', { operator: 'op', reader_id: CT_ID });
    // control group: with everything allowed the gate lets the run start (the stubbed network then refuses, the run is recorded as FAILED provenance)
    const ok = await build();
    const okRun = await call(envOf(ok.db, { DOSSIER_CANARY_ENABLED: 'true' }), '/api/dossier/canary/run', body);
    assert.notEqual(okRun.status, 409, 'control: the gate itself is open in this configuration');
    assert.equal(net.calls.filter((u) => DOSSIER_HOSTS.test(u)).length, 1, 'control: exactly the one official source request was attempted (and refused by the stub)');
    net.calls.length = 0;
    // (a) missing OPS_TOKEN
    const a = await build();
    assert.equal((await call(envOf(a.db, { DOSSIER_CANARY_ENABLED: 'true', OPS_TOKEN: undefined }), '/api/dossier/canary/run', body)).status, 503);
    // (b) unknown platform capacity
    const b = await build();
    await b.db.prepare(`DELETE FROM dossier_control WHERE control_key LIKE 'platform:%'`).run();
    assert.deepEqual((await (await call(envOf(b.db, { DOSSIER_CANARY_ENABLED: 'true' }), '/api/dossier/canary/run', body)).json()).reasons.filter((r) => /^PLATFORM/.test(r)), ['PLATFORM_CAPACITY_NOT_VERIFIED', 'PLATFORM_CAPACITY_VALUES_MISSING']);
    // (c) disabled reader
    const c = await build();
    await CC.setControl(c.db, { key: CC.controlReaderEnabled(CT_ID), value: '0', updatedBy: 'op', now: 't' });
    assert.deepEqual((await (await call(envOf(c.db, { DOSSIER_CANARY_ENABLED: 'true' }), '/api/dossier/canary/run', body)).json()).reasons, ['READER_DISABLED']);
    // (d) global kill switch OFF (operator control) and (e) master switch not exactly "true"
    const d = await build();
    await CC.setControl(d.db, { key: CC.CONTROL_CANARY, value: '0', updatedBy: 'op', now: 't' });
    assert.deepEqual((await (await call(envOf(d.db, { DOSSIER_CANARY_ENABLED: 'true' }), '/api/dossier/canary/run', body)).json()).reasons, ['CANARY_DISABLED_BY_OPERATOR']);
    const e = await build();
    assert.deepEqual((await (await call(envOf(e.db, { DOSSIER_CANARY_ENABLED: 'TRUE' }), '/api/dossier/canary/run', body)).json()).reasons, ['ENV_CANARY_DISABLED']);
    // (f) OECD stays blocked with every control on
    const f = await build();
    await CC.setControl(f.db, { key: CC.controlReaderEnabled(OE_ID), value: '1', updatedBy: 'op', now: 't' });
    assert.ok((await (await call(envOf(f.db, { DOSSIER_CANARY_ENABLED: 'true' }), '/api/dossier/canary/run', post('', { operator: 'op', reader_id: OE_ID }))).json()).reasons.some((r) => /USAGE_TERMS_UNRESOLVED/.test(r)));
    assert.equal(net.calls.length, 0, 'none of the refused configurations reached the network');
    for (const w of [a, b, c, d, e, f]) assert.equal(dossierRows(w.sqlite), 0);
  } finally { net.restore(); }
});

test('deploy itself starts nothing; cron cannot start the DOSSIER runner even in the most permissive configuration (every switch on, capacity verified)', async () => {
  const net = networkGuard();
  try {
    const { sqlite, db } = openDossierDb();
    for (const [k, v] of [[CC.CONTROL_CANARY, '1'], [CC.CONTROL_MANUAL_RUNS, '1'], [CC.CONTROL_PROMOTION, '1'], [CC.controlReaderEnabled(CT_ID), '1']]) await CC.setControl(db, { key: k, value: v, updatedBy: 'op', now: 't' });
    await setTestCapacity(db);
    const controlsBefore = sqlite.prepare(`SELECT control_key, control_value, updated_at FROM dossier_control ORDER BY control_key`).all();
    const env = envOf(db, { DOSSIER_CANARY_ENABLED: 'true' });
    // module load (the deploy) wrote nothing
    assert.equal(dossierRows(sqlite), 0);
    // every minute/hour slot of the schedule
    const ctx = ctxOf();
    for (const [h, m] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 5], [0, 7], [0, 10], [0, 17], [0, 20], [0, 30], [0, 43], [1, 0], [3, 0], [12, 0], [23, 59]]) await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 5, h, m), cron: '* * * * *', noRetry() {} }, env, ctx);
    await Promise.allSettled(ctx.pending);
    assert.equal(dossierRows(sqlite), 0, 'no DOSSIER run, observation, concept or candidate was created by any scheduled tick');
    assert.deepEqual(sqlite.prepare(`SELECT control_key, control_value, updated_at FROM dossier_control ORDER BY control_key`).all(), controlsBefore, 'cron did not touch the controls');
    // and the runner is reachable only through the OPS_TOKEN route: an unauthenticated POST does nothing
    const before = net.calls.length;
    assert.equal((await call(env, '/api/dossier/canary/run', { method: 'POST', body: '{}' })).status, 401);
    assert.equal(net.calls.length, before);
    assert.equal(dossierRows(sqlite), 0);
  } finally { net.restore(); }
});
