/**
 * Items 63 + 74: source activation policy contract and human governance. The Worker may INSPECT and ENFORCE policy, never change it: every sensitive
 * transition is an owner action (owner SQL / owner-invoked route / owner review). Real storage foundation; no network.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { loadReader } from './test-support/engines.mjs';
import { freshDb } from './test-support/fixtures.mjs';
import { loadOps, ownerSql } from './test-support/ops-bundle.mjs';

const O = await loadOps();
const R = await loadReader();
const dbs = [];
after(async () => Promise.all(dbs.map((d) => d.close())));

const base = { ownerRef: 'OWNER-REF', legalGate: 'OWNER_REVIEW_REQUIRED', legalOverrideRef: 'OWNER-REF', authGate: 'NOT_REQUIRED', rateLimitGate: 'SET', canaryGate: 'PASSED' };
const view = (state, over = {}) => ({ state, ...base, ...over });

describe('63 admission matrix (state x kind)', () => {
  const T = (kind, state, allowed, code) => it(`${kind} under ${state}: ${allowed ? 'admitted' : code}`, () => {
    const a = O.admission(kind, view(state));
    assert.equal(a.allowed, allowed, a.reason);
    if (!allowed) assert.equal(a.code, code);
  });
  T('CANARY_RUN', 'DISABLED', false, 'SOURCE_DISABLED');
  T('CANARY_RUN', 'ACTIVATION_GATED', true);
  T('CANARY_RUN', 'ACTIVE', true);
  T('CANARY_RUN', 'PAUSED', false, 'SOURCE_PAUSED');
  T('CANARY_RUN', 'RETIRED', false, 'SOURCE_RETIRED');
  T('PRODUCTION_RUN', 'ACTIVATION_GATED', false, 'STATE_NOT_PERMITTED_FOR_KIND');
  T('PRODUCTION_RUN', 'ACTIVE', true);
  T('PRODUCTION_RUN', 'PAUSED', false, 'SOURCE_PAUSED');
  T('SCHEDULED_RUN', 'ACTIVATION_GATED', false, 'STATE_NOT_PERMITTED_FOR_KIND');
  T('SCHEDULED_RUN', 'ACTIVE', true);
  T('SCHEDULED_RUN', 'DISABLED', false, 'SOURCE_DISABLED');
  it('no policy row is DISABLED (the frozen default); READ_ONLY is always allowed', () => {
    assert.equal(O.admission('SCHEDULED_RUN', null).code, 'SOURCE_DISABLED');
    assert.equal(O.admission('PRODUCTION_RUN', null).allowed, false);
    assert.equal(O.admission('READ_ONLY', null).allowed, true);
  });
  it('BLOCKED by gate: unsatisfied legal/auth/rate-limit gates block even an ACTIVE source; a missing owner reference blocks; an unpassed canary blocks production and schedule', () => {
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { legalGate: 'BLOCKED', legalOverrideRef: null })).code, 'BLOCKED_BY_GATE');
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { legalGate: 'LEGAL_REVIEW_REQUIRED', legalOverrideRef: null })).code, 'BLOCKED_BY_GATE');
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { authGate: 'REQUIRED_MISSING' })).code, 'BLOCKED_BY_GATE');
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { rateLimitGate: 'NOT_SET' })).code, 'BLOCKED_BY_GATE');
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { ownerRef: null })).code, 'OWNER_REF_MISSING');
    assert.equal(O.admission('SCHEDULED_RUN', view('ACTIVE', { canaryGate: 'NOT_RUN' })).code, 'CANARY_NOT_PASSED');
    assert.equal(O.admission('PRODUCTION_RUN', view('ACTIVE', { legalGate: 'PASS', legalOverrideRef: null })).allowed, true);
  });
  it('the admission contract agrees with the frozen database: a PRODUCTION run is refused by the DB itself unless the source is ACTIVE', async () => {
    const c = await freshDb({});
    dbs.push(c);
    c.clock.advance(60_000);
    await assert.rejects(R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: 'PRODUCTION', fetcher: R.fixtureFetcher('v1'), sleep: async () => {} }), (e) => e.dbCode === 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
  });
});

describe('74 owner governance: the Worker cannot move policy, legal override or mapping state', () => {
  it('every owner gate is an owner action backed by a real artifact; none is performable by the Worker', () => {
    assert.ok(O.OWNER_GATES.length >= 9);
    for (const g of O.OWNER_GATES) {
      assert.equal(g.workerMayPerform, false, g.id);
      assert.ok(['OWNER_SQL', 'OWNER_INVOKED_OPERATOR_ROUTE', 'OWNER_REVIEW'].includes(g.mechanism), g.id);
      if (g.mechanism === 'OWNER_SQL' && g.artifact.startsWith('release/')) assert.ok(existsSync(g.artifact), g.artifact);
    }
    const ids = new Set(O.OWNER_GATES.map((g) => g.id));
    for (const need of ['SOURCE_ARM', 'SOURCE_ACTIVATE', 'SOURCE_PAUSE', 'SOURCE_DISARM', 'LEGAL_OVERRIDE', 'MAPPING_REVIEW', 'CANARY_AUTHORIZATION', 'PRODUCTION_HANDOFF', 'SCHEDULER_ENABLE']) assert.ok(ids.has(need), need);
  });
  it('static scan: no Worker/library module writes the policy or mapping tables or calls the policy update helpers (only the frozen repositories and the local-only entries may)', () => {
    const dir = 'apps/worker/src/statistics';
    const allowed = new Set(['repositories/runtime-policy.ts', 'repositories/indicators.ts', 'local-smoke.ts', 'local-entry.ts']);
    const offenders = [];
    const walk = (d) => readdirSync(d).forEach((n) => {
      const p = `${d}/${n}`;
      if (statSync(p).isDirectory()) { if (n !== 'test-support') walk(p); return; }
      if (!n.endsWith('.ts')) return;
      const rel = p.slice(dir.length + 1);
      if (allowed.has(rel)) return;
      const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+statistics_(source_runtime_policy|indicator_mappings)/i.test(src)) offenders.push(`${rel}: writes policy/mapping tables`);
      if (/policy\.(update|ensureDefault)\s*\(/.test(src)) offenders.push(`${rel}: calls the policy update helpers`);
      if (/\bapproveMapping\b|\bsetMappingState\b/.test(src)) offenders.push(`${rel}: touches mapping approval`);
    });
    walk(dir);
    assert.deepEqual(offenders, []);
  });
  it('the read-only operator surface leaves every table byte-identical (summary, runs, schedule-plan, contract)', async () => {
    const c = await freshDb({});
    dbs.push(c);
    await ownerSql(c, 'release/statistics-canary-policy-arm.sql');
    const r = await R.runDemoMlexpecUnit(c, { slice: { startYear: 2022, endYear: 2024 }, runMode: 'CANARY', fetcher: R.fixtureFetcher('v1'), sleep: async () => {} });
    assert.equal(r.status, 'COMPLETED');
    const tables = (await c.storage.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'statistics_%' ORDER BY name`)).map((x) => x.name);
    const snap = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, JSON.stringify(await c.storage.all(`SELECT * FROM ${t}`))])));
    const before = await snap();
    const env = { STATS_DB: c.eng.db, OPS_TOKEN: 't', STATISTICS_SCHEDULER_ENABLED: 'true' };
    for (const p of ['summary', 'runs', 'schedule-plan', 'contract']) {
      const res = await O.handleStatisticsRoutes(new Request(`https://x/api/statistics/ops/${p}`, { headers: { Authorization: 'Bearer t' } }), env, `/api/statistics/ops/${p}`);
      assert.equal(res.status, 200, p);
    }
    assert.deepEqual(await snap(), before);
  });
  it('the contract route shows the gates and the OFF-by-default scheduler without touching the database', async () => {
    const res = await O.handleStatsOps(new Request('https://x/api/statistics/ops/contract', { headers: { Authorization: 'Bearer t' } }), { OPS_TOKEN: 't' }, '/api/statistics/ops/contract');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.scheduler.default, 'OFF');
    assert.ok(body.ownerGates.every((g) => g.workerMayPerform === false));
  });
});
