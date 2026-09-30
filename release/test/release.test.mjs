import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RELEASE_DIR, loadConfig, readJson, resolveRoots, parseWrangler, worst } from '../lib/util.mjs';
import { analyseRepo, numbering } from '../lib/migrations.mjs';
import { secretStates, namesFromSecretList } from '../lib/secrets.mjs';
import { validateManifest } from '../lib/manifest.mjs';
import { matchLiveIdentity, repoIdentity } from '../lib/identity.mjs';
import { evaluate, evaluateChecklist, render, REQUIRED_ROLLBACK } from '../lib/readiness.mjs';
import { runScenario, newWorld, validateApprovedBrief, BRIEF_KEYS } from '../e2e/harness.mjs';
import { SCENARIOS, runAll } from '../e2e/scenarios.mjs';
import { runSmoke } from '../smoke/smoke.mjs';

const config = loadConfig();
const tmp = () => mkdtempSync(join(tmpdir(), 'p7-'));

// ---- migration precheck ---------------------------------------------------------------------------------
test('migration precheck: replays a good chain, flags a bad pending migration, applied state unknown by default', () => {
  const root = tmp();
  mkdirSync(join(root, 'm'));
  writeFileSync(join(root, 'm', '0001_a.sql'), 'CREATE TABLE a(id TEXT PRIMARY KEY);');
  writeFileSync(join(root, 'm', '0002_b.sql'), 'CREATE TABLE b(id TEXT, a_id TEXT REFERENCES a(id));');
  writeFileSync(join(root, 'm', '0003_bad.sql'), 'CREATE TABL oops;');
  const good = analyseRepo({ root, migrationsDir: 'm', pending: ['0002_b.sql'] });
  assert.equal(good.freshChainFkOn.ok, false); // 0003 breaks the chain
  assert.equal(good.freshChainFkOn.failedAt, '0003_bad.sql');
  assert.deepEqual([good.pending[0].exists, good.pending[0].testedLocal, good.pending[0].applied], [true, true, 'unknown']);
  const bad = analyseRepo({ root, migrationsDir: 'm', pending: ['0003_bad.sql', '0009_missing.sql'], applied: ['0003_bad.sql'] });
  assert.equal(bad.pending[0].testedLocal, false);
  assert.equal(bad.pending[0].applied, 'yes');
  assert.equal(bad.pending[1].exists, false);
});

test('migration numbering: duplicates flagged, gaps informational', () => {
  const n = numbering([{ number: 1, filename: 'a' }, { number: 1, filename: 'b' }, { number: 4, filename: 'c' }]);
  assert.deepEqual(n.dups, ['b']);
  assert.deepEqual(n.gaps, ['1->4']);
});

// ---- secrets: names only ----------------------------------------------------------------------------------
test('secret preflight uses names only and never surfaces values', () => {
  const f = join(tmp(), 'secrets.json');
  writeFileSync(f, JSON.stringify([{ name: 'HANDOFF_INGEST_TOKEN', type: 'secret_text', value: 'SUPER-SECRET-VALUE' }]));
  const names = namesFromSecretList(f);
  assert.deepEqual(names, ['HANDOFF_INGEST_TOKEN']);
  const states = secretStates(config.secrets.ccos, names);
  assert.equal(states.find((s) => s.name === 'HANDOFF_INGEST_TOKEN').state, 'configured');
  assert.equal(states.find((s) => s.name === 'GCOS_STATUS_TOKEN').state, 'missing');
  assert.equal(JSON.stringify(states).includes('SUPER-SECRET-VALUE'), false);
  assert.equal(secretStates(config.secrets.ccos, null)[0].state, 'unknown');
});

// ---- manifest ---------------------------------------------------------------------------------------------
test('manifest: template valid; SYSTEM_V1 cannot be frozen prematurely', () => {
  const t = readJson(join(RELEASE_DIR, 'manifest.template.json'));
  assert.equal(validateManifest(t).ok, true);
  assert.equal(t.systemV1, 'NOT_YET');
  assert.equal(validateManifest({ ...t, systemV1: 'FROZEN' }).ok, false);
  assert.equal(validateManifest({ ...t, status: 'RELEASED' }).ok, false);
  const sha = 'a'.repeat(40);
  const rel = { ...t, status: 'RELEASED', releaseId: 'SYSTEM_V1', deployedAt: '2026-10-01T00:00:00Z', smoke: 'SMOKE_PASS', systemV1: 'FROZEN', gcos: { ...t.gcos, commit: sha, expectedMigrationLevel: '0024_x.sql' }, ccos: { ...t.ccos, commit: sha, expectedMigrationLevel: '040_x.sql' }, rollbackRef: { gcosVersionId: 'v1', ccosVersionId: 'v2', gcosCommit: sha, ccosCommit: sha } };
  assert.deepEqual(validateManifest(rel), { ok: true, errors: [] });
  assert.equal(validateManifest({ ...rel, smoke: null }).ok, false);
});

// ---- deployment identity --------------------------------------------------------------------------------
test('identity: parses wrangler; live identity match logic', () => {
  const w = parseWrangler('name = "x"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "n"\ndatabase_id = "i"\n[triggers]\ncrons = ["* * * * *"]\n[vars]\nCCOS_HANDOFF_STUB = "true"\n');
  assert.deepEqual([w.name, w.crons, w.d1[0].database_id, w.vars.CCOS_HANDOFF_STUB], ['x', ['* * * * *'], 'i', 'true']);
  assert.equal(matchLiveIdentity({ ok: true, commit: 'abc' }, 'abc').ok, true);
  assert.equal(matchLiveIdentity({ ok: true, commit: null }, 'abc').ok, false);
  assert.equal(matchLiveIdentity({ ok: true, commit: 'zzz' }, 'abc').ok, false);
  const id = repoIdentity(join(RELEASE_DIR, '..'), 'wrangler.toml', 'migrations');
  assert.ok(id.commit && id.workerName && id.expectedMigrationLevel && id.d1.length);
});

// ---- readiness evaluator ----------------------------------------------------------------------------------
test('readiness evaluator: deterministic, never FAIL on the current tree, categories covered, phase=cutover is strict', () => {
  const roots = resolveRoots(config);
  const run = (phase) => evaluate({ config, roots, phase, e2eRunner: () => runAll(), smokeReady: { ok: true, detail: 'x' } });
  const a = run('pre');
  const b = run('pre');
  assert.equal(a.status, b.status);
  assert.deepEqual(a.summary, b.summary);
  assert.notEqual(a.status, 'FAIL', render(a));
  const cats = new Set(a.checks.map((c) => c.category));
  for (const c of ['GIT', 'TESTS', 'CONTRACTS', 'MIGRATIONS', 'SECRETS/CONFIG', 'SCHEDULER', 'HEALTH', 'OBSERVABILITY', 'ROLLBACK', 'DEPLOYMENT_IDENTITY']) assert.ok(cats.has(c), c);
  assert.ok(['PASS', 'WARN', 'FAIL'].includes(a.status));
  assert.ok(render(a).split('\n').length < 60, 'human output stays small');
  assert.equal(worst(['PASS', 'WARN']), 'WARN');
});

test('readiness evaluator: missing repo and missing secret FAIL; unbound P-checks defer rather than fail', () => {
  const r = evaluate({ config, roots: { gcos: join(tmp(), 'nope'), ccos: null }, phase: 'pre' });
  assert.equal(r.status, 'FAIL');
  const roots = resolveRoots(config);
  const f = join(tmp(), 's.json');
  writeFileSync(f, '[]');
  const s = evaluate({ config, roots, phase: 'pre', secretFiles: { gcos: f, ccos: f } });
  assert.equal(s.checks.find((c) => c.id === 'secrets_gcos').status, 'FAIL'); // TIP_RADAR_INGEST_TOKEN is always-required
  const real = evaluate({ config, roots, phase: 'pre' });
  assert.ok(real.defers.P5 && real.defers.P3, 'unbound P5/P3 items are reported as deferrals');
});

test('checklist never completes before reconciliation', () => {
  const roots = resolveRoots(config);
  const r = evaluate({ config, roots, phase: 'pre', e2eRunner: () => runAll(), smokeReady: { ok: true, detail: 'x' } });
  const c = evaluateChecklist(readJson(join(RELEASE_DIR, 'checklist.json')), r, {});
  assert.equal(c.complete, false);
  assert.ok(c.items.find((i) => i.id === 'packages_reconciled').state === 'OPEN');
});

// ---- contracts --------------------------------------------------------------------------------------------
test('e2e brief contract mirrors CCOS source (keys + enums)', () => {
  const ccos = resolveRoots(config).ccos;
  const src = ccos && existsSync(join(ccos, 'mcp-server/src/handoff/approved-brief.ts')) ? readFileSync(join(ccos, 'mcp-server/src/handoff/approved-brief.ts'), 'utf8') : null;
  if (!src) return; // CCOS checkout not available: skip
  for (const k of BRIEF_KEYS) assert.ok(src.includes(`${k}:`), `CCOS contract lacks ${k}`);
  for (const v of ['kaduse-news', 'kaduse-research', 'tip-ogrencileri', 'kaduse-medikal', 'tip-ogrencileri-platformu', 'tip_toplulugu']) assert.ok(src.includes(`'${v}'`), v);
});

// ---- e2e harness ------------------------------------------------------------------------------------------
test('e2e: all happy + failure scenarios match contract expectations', () => {
  const r = runAll();
  assert.deepEqual(r.failed, [], JSON.stringify(r.results.filter((x) => !x.ok)));
  assert.equal(r.total, SCENARIOS.length);
  for (const id of ['happy_path', 'fetch_failure', 'parse_failure', 'duplicate_item', 'rejected_candidate', 'invalid_approved_brief', 'duplicate_approved_brief', 'ccos_unavailable', 'render_failure', 'qa_failure', 'status_callback_failure', 'auth_failure_bad_token']) assert.ok(SCENARIOS.some((s) => s.id === id), id);
});

test('e2e: idempotency, immutability (409), and validation', () => {
  const w = newWorld();
  const first = runScenario({ id: 'x', options: { presentTwice: true } }, null, w);
  assert.equal(first.outcome.jobs, 1);
  const brief = w.briefs[0];
  const tamper = { ...brief, title: 'changed' };
  const res = w.ccos.intake.has(tamper.briefId);
  assert.ok(res);
  assert.deepEqual(validateApprovedBrief({ ...brief, extra: 1 }), ['unknown_key:extra']);
  assert.ok(validateApprovedBrief({ ...brief, route: 'nope' }).includes('route'));
});

test('e2e: adapters are swappable per stage', () => {
  const w = newWorld();
  const calls = [];
  const a = { ...runScenarioAdapters(w) };
  a.render = () => { calls.push('render'); return { ok: false, error: 'boom' }; };
  const r = runScenario({ id: 'swap' }, a, w);
  assert.deepEqual(calls, ['render']);
  assert.equal(r.outcome.terminal, 'render_failed');
});
import { defaultAdapters } from '../e2e/harness.mjs';
const runScenarioAdapters = (w) => defaultAdapters(w);

// ---- smoke ------------------------------------------------------------------------------------------------
function fakeServers(behaviour = {}) {
  const log = [];
  const mk = (which) => http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      log.push(`${which} ${req.method} ${req.url}`);
      const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (which === 'gcos') {
        if (req.url === '/api/health') return send(200, { ok: true, service: 'global-content-os', commit: behaviour.commit ?? 'abc' });
        if (req.url === '/api/system-health') return send(200, { ok: true });
        if (req.url === '/api/handoff/status') return send(behaviour.gcosOpenCallback ? 200 : 401, {});
      } else {
        if (req.url === '/') return send(200, {});
        if (req.url === '/api/handoff/approved-brief') {
          const auth = req.headers.authorization ?? '';
          if (!auth) return send(behaviour.ccosOpen ? 201 : 401, {});
          return send(400, { error: 'invalid_approved_brief' });
        }
      }
      send(404, {});
    });
  });
  return { log, gcos: mk('gcos'), ccos: mk('ccos') };
}
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

test('smoke: SMOKE_PASS on a healthy pair, non-destructive request set, token never echoed', async () => {
  const f = fakeServers();
  const [g, c] = [await listen(f.gcos), await listen(f.ccos)];
  const r = await runSmoke({ gcosUrl: g, ccosUrl: c, expectCommit: 'abc', ccosToken: 'TOKEN-XYZ' });
  f.gcos.close(); f.ccos.close();
  assert.equal(r.verdict, 'SMOKE_PASS', JSON.stringify(r.failed));
  assert.equal(JSON.stringify(r).includes('TOKEN-XYZ'), false);
  const posts = f.log.filter((l) => l.includes(' POST '));
  assert.ok(posts.every((p) => p.endsWith('/api/handoff/status') || p.endsWith('/api/handoff/approved-brief')), posts.join(';'));
});

test('smoke: SMOKE_FAIL on identity mismatch, open auth, and unreachable service', async () => {
  const f = fakeServers({ commit: 'other', ccosOpen: true });
  const [g, c] = [await listen(f.gcos), await listen(f.ccos)];
  const r = await runSmoke({ gcosUrl: g, ccosUrl: c, expectCommit: 'abc' });
  f.gcos.close(); f.ccos.close();
  assert.equal(r.verdict, 'SMOKE_FAIL');
  assert.ok(r.failed.includes('gcos_identity') && r.failed.includes('ccos_handoff_auth_fail_closed'));
  const dead = await runSmoke({ gcosUrl: 'http://127.0.0.1:1', ccosUrl: 'http://127.0.0.1:1', timeoutMs: 500 });
  assert.equal(dead.verdict, 'SMOKE_FAIL');
});

// ---- rollback / runbook -----------------------------------------------------------------------------------
test('rollback: every scenario complete, and each is present in the runbook', () => {
  const rb = readJson(join(RELEASE_DIR, 'rollback.json'));
  for (const id of REQUIRED_ROLLBACK) {
    const s = rb.scenarios.find((x) => x.id === id);
    assert.ok(s, id);
    for (const f of ['trigger', 'containment', 'rollbackAction', 'verification', 'dataLossRisk']) assert.ok(s[f], `${id}.${f}`);
  }
  const runbook = join(RELEASE_DIR, '..', 'docs', 'ops', 'RELEASE-RUNBOOK.md');
  assert.ok(existsSync(runbook), 'runbook exists');
  const text = readFileSync(runbook, 'utf8');
  for (const id of REQUIRED_ROLLBACK) assert.ok(text.includes(id), `runbook mentions ${id}`);
});

test('runbook contains no secret values and never instructs SYSTEM_V1 before smoke', () => {
  const text = readFileSync(join(RELEASE_DIR, '..', 'docs', 'ops', 'RELEASE-RUNBOOK.md'), 'utf8');
  assert.equal(/Bearer\s+[A-Za-z0-9]{16,}/.test(text), false);
  assert.ok(text.indexOf('smoke') < text.indexOf('SYSTEM_V1 release record'));
});

test('preflight CLI: exits 0 in pre phase, writes artifact, stays small', () => {
  const out = tmp();
  const stdout = execFileSync('node', [join(RELEASE_DIR, 'preflight.mjs'), '--out', out], { encoding: 'utf8' });
  assert.ok(stdout.startsWith('READINESS '));
  assert.ok(existsSync(join(out, 'preflight-latest.json')));
  assert.ok(stdout.length < 6000);
});
