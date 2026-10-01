// Operational alert model (release/alert-model.json) + GET /api/ops/summary (operations hardening).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle, openGcosDb, unreachableD1 } from './sqlite-d1.test-helper.mjs';

const model = JSON.parse(readFileSync('release/alert-model.json', 'utf8'));
const ops = await bundle('apps/worker/src/ops-summary.ts', 'ops-summary');
const readiness = await bundle('apps/worker/src/readiness.ts', 'readiness-ops');
const worker = (await bundle('apps/worker/src/index.ts', 'worker-index-ops')).default;

const CLASSES = ['MUST_ALERT', 'SHOULD_ALERT', 'MANUAL_CHECK'];
const EVALUATORS = ['gcos:/api/ops/summary', 'gcos:scheduler-run-report', 'gcos:capacity-guard', 'ccos:/ops/summary'];

test('catalog: three classes, unique ids, every signal fully specified', () => {
  assert.deepEqual(Object.keys(model.classes), CLASSES);
  const ids = model.signals.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate signal id');
  for (const s of model.signals) {
    assert.ok(CLASSES.includes(s.class), `${s.id}.class`);
    assert.ok(['gcos', 'ccos'].includes(s.system), `${s.id}.system`);
    assert.ok(EVALUATORS.includes(s.evaluatedBy), `${s.id}.evaluatedBy`);
    assert.ok(s.evaluatedBy.startsWith(`${s.system}:`), `${s.id} evaluated by the other system`);
    for (const f of ['condition', 'response']) assert.ok(typeof s[f] === 'string' && s[f].length > 10, `${s.id}.${f}`);
    assert.ok(s.detect?.repo && s.detect?.file && s.detect?.pattern, `${s.id}.detect`);
  }
});

test('catalog covers the required failure modes as MUST_ALERT', () => {
  const cls = Object.fromEntries(model.signals.map((s) => [s.id, s.class]));
  for (const id of [
    'GCOS_BLOCKED',
    'CCOS_BLOCKED',
    'GCOS_D1_UNAVAILABLE',
    'CCOS_D1_UNAVAILABLE',
    'HANDOFF_SYSTEMIC_FAILURE',
    'CALLBACK_SYSTEMIC_FAILURE',
    'SCHEDULER_SYSTEMIC_FAILURE',
    'PRODUCTION_JOB_SYSTEMIC_FAILURE',
  ]) {
    assert.equal(cls[id], 'MUST_ALERT', id);
  }
  assert.equal(cls.SOURCE_SINGLE_FAILURE, 'MANUAL_CHECK', 'a single source failure never pages');
});

test('every detection pointer resolves to real code (CCOS pointers when the sibling checkout is present)', () => {
  const roots = { gcos: '.', ccos: process.env.CCOS_ROOT ?? resolve('..', 'channel-content-os') };
  for (const s of model.signals) {
    const root = roots[s.detect.repo];
    if (s.detect.repo === 'ccos' && !existsSync(join(root, 'mcp-server'))) continue;
    const file = join(root, s.detect.file);
    assert.ok(existsSync(file), `${s.id}: ${s.detect.file} missing`);
    assert.ok(readFileSync(file, 'utf8').includes(s.detect.pattern), `${s.id}: pattern "${s.detect.pattern}" not in ${s.detect.file}`);
  }
});

const READY = { level: 'READY', blocked: [], degraded: [] };
const quiet = { failed: 0, exhausted: 0, conflicts: 0, approved24h: 10, failed24h: 0 };
const ids = (s) => s.map((x) => x.id);

test('GCOS runtime signals: classes come from the catalog; single failures are not systemic', () => {
  assert.deepEqual(ops.evaluateGcosSignals(READY, true, quiet), []);
  const blocked = ops.evaluateGcosSignals({ level: 'BLOCKED', blocked: ['DB_UNREACHABLE'], degraded: [] }, true, null);
  assert.deepEqual(blocked.map((s) => [s.id, s.class]), [['GCOS_BLOCKED', 'MUST_ALERT'], ['GCOS_D1_UNAVAILABLE', 'MUST_ALERT']]);
  assert.deepEqual(ids(ops.evaluateGcosSignals(READY, true, { ...quiet, failed: 1, failed24h: 1 })), ['HANDOFF_FAILED']);
  const systemic = ops.evaluateGcosSignals(READY, true, { ...quiet, failed: 4, failed24h: 4, approved24h: 5 });
  assert.ok(ids(systemic).includes('HANDOFF_SYSTEMIC_FAILURE'));
  assert.ok(ids(ops.evaluateGcosSignals(READY, true, { ...quiet, conflicts: 1, failed: 1 })).includes('HANDOFF_BRIEF_ID_CONFLICT'));
  assert.ok(ids(ops.evaluateGcosSignals({ level: 'DEGRADED', blocked: [], degraded: ['CRON_HEARTBEAT_STALE'] }, false, quiet)).includes('WORKER_CRON_STALE'));
  const runtimeIds = model.signals.filter((s) => s.evaluatedBy === ops.RUNTIME_EVALUATOR).map((s) => s.id).sort();
  assert.deepEqual(runtimeIds, ['GCOS_BLOCKED', 'GCOS_D1_UNAVAILABLE', 'GCOS_DEGRADED', 'GCOS_IDENTITY_UNSTAMPED', 'HANDOFF_BRIEF_ID_CONFLICT', 'HANDOFF_FAILED', 'HANDOFF_RESEND_EXHAUSTED', 'HANDOFF_SYSTEMIC_FAILURE', 'WORKER_CRON_STALE']);
});

const call = (env, auth) =>
  worker.fetch(new Request('https://gcos.test/api/ops/summary', { headers: auth ? { Authorization: auth } : {} }), env, { waitUntil() {} });
const SECRET_ENV = { OPS_TOKEN: 'ops-secret-abc', STATUS_CALLBACK_TOKEN: 'cb-secret-def', TIP_RADAR_INGEST_TOKEN: 'ingest-secret-ghi', CCOS_HANDOFF_TOKEN: 'handoff-secret-jkl', OPENALEX_API_KEY: 'openalex-secret-mno' };

test('GET /api/ops/summary fails closed on OPS_TOKEN', async () => {
  const { db } = openGcosDb();
  assert.equal((await call({ DB: db }, 'Bearer x')).status, 503);
  assert.equal((await call({ DB: db, OPS_TOKEN: 't' })).status, 401);
  assert.equal((await call({ DB: db, OPS_TOKEN: 't' }, 'Bearer nope')).status, 401);
});

test('GET /api/ops/summary: compact failed-handoff view with readiness, identity and schema; no payloads or secrets', async () => {
  const { sqlite, db } = openGcosDb({ appliedMigration: readiness.EXPECTED_SCHEMA_MIGRATION });
  for (const [id, status, detail] of [['b1', 'failed', 'HTTP 503'], ['b2', 'sent', 'delivered'], ['b3', 'failed', 'BRIEF_ID_CONFLICT']]) {
    sqlite
      .prepare(`INSERT INTO approved_briefs (brief_id, source_item_id, route, channel_id, payload_json, handoff_status, handoff_detail) VALUES (?, 'item_1', 'kaduse-news', 'kaduse-medikal', '{"canonicalUrl":"https://secret.example"}', ?, ?)`)
      .run(id, status, detail);
    sqlite.prepare(`INSERT INTO handoff_log (id, brief_id, direction, body_json) VALUES (?, ?, 'outbound', '{}')`).run(`l_${id}`, id);
  }
  const res = await call({ DB: db, ...SECRET_ENV, BUILD_COMMIT: 'deadbeef' }, 'Bearer ops-secret-abc');
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.readiness.level, 'READY');
  assert.deepEqual({ commit: body.identity.commit, expectedSchema: body.identity.expectedSchema, appliedMigration: body.identity.appliedMigration }, { commit: 'deadbeef', expectedSchema: readiness.EXPECTED_SCHEMA_MIGRATION, appliedMigration: readiness.EXPECTED_SCHEMA_MIGRATION });
  assert.deepEqual(body.handoffs.byStatus, { failed: 2, sent: 1 });
  assert.deepEqual(body.handoffs.oldestFailed.map((f) => [f.briefId, f.detail, f.attempts]).sort(), [['b1', 'HTTP 503', 1], ['b3', 'BRIEF_ID_CONFLICT', 1]]);
  assert.ok(ids(body.signals).includes('HANDOFF_BRIEF_ID_CONFLICT'));
  assert.equal(body.highestAlert, 'MUST_ALERT');
  assert.ok(body.notEvaluatedHere.some((s) => s.startsWith('SCHEDULER_SYSTEMIC_FAILURE')));
  assert.ok(!text.includes('secret.example'), 'no brief payloads');
  for (const v of Object.values(SECRET_ENV)) assert.ok(!text.includes(v), 'secret leaked');
  assert.ok(text.length < 6000);
});

test('GET /api/ops/summary with D1 down: BLOCKED + MUST_ALERT, no data section', async () => {
  const res = await call({ DB: unreachableD1(), OPS_TOKEN: 't' }, 'Bearer t');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.readiness.level, 'BLOCKED');
  assert.equal(body.highestAlert, 'MUST_ALERT');
  assert.equal(body.handoffs, null);
});
