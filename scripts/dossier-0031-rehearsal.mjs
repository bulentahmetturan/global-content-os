#!/usr/bin/env node
// LOCAL MIGRATION REHEARSAL for 0031 (REMOTE MUTATION IS NOT POSSIBLE FROM HERE: this script only opens disposable local SQLite files).
//
//   node scripts/dossier-0031-rehearsal.mjs            -> JSON report on stdout, exit 0 = PASS
//   node scripts/dossier-0031-rehearsal.mjs --write    -> also writes docs/generated/dossier-0031-preflight.json
//
// 1. builds the pre-0031 schema from the canonical migrations (0001-0030) in a disposable file database;
// 2. seeds realistic but FICTIONAL GCOS rows (TIME_SENSITIVE + EVERGREEN items, path membership, Evergreen runtime state, evidence, decisions, briefs, telemetry);
// 3. records a baseline (row counts, schema objects, per-table content digests, CHECK-constraint probes, integrity);
// 4. applies 0031, then verifies every pre-existing row/value/object/CHECK is unchanged and only the audited dossier objects were added; re-applies (idempotent);
// 5. builds a fresh database with every migration and proves it equals the upgraded one;
// 6. boots the real Worker bundle against the pre-0031 AND the upgraded schema (liveness, readiness, DOSSIER disabled, operator surface).
// The migration file itself is never modified here; its checksum is reported (and cross-checked by a test against the committed artifact).
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preflight, MIGRATION } from './dossier-0031-preflight.mjs';
import { bundle, d1FromSqlite } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const isDossier = (n) => /dossier/i.test(n);

function applyMigrations(db, { until31 = true } = {}) {
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  for (const f of files) if (f !== MIGRATION || !until31) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
}

/** Realistic but fictional rows across the GCOS tables a 0031 upgrade must never touch. */
export function seedGcos(db) {
  const feed = db.prepare(`SELECT id FROM source_feeds ORDER BY id LIMIT 1`).get().id;
  const ins = (sql, ...v) => db.prepare(sql).run(...v);
  const item = (id, o) => ins(`INSERT INTO source_items (id, feed_id, route, channel_id, title, summary, canonical_url, publisher, published_at, triage_status, dedupe_key, raw_fingerprint, fetched_at, updated_at, acquisition_path, evergreen_view, discovery_mode, discovery_reason, deadline_at, importance_signal_json, source_id, enrichment_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, feed, o.route, 'kaduse', o.title, o.summary, `https://example.invalid/${id}`, 'Fictional Journal', o.published, o.triage, `dk-${id}`, `fp-${id}`, '2026-10-01T08:00:00.000Z', '2026-10-01T09:00:00.000Z', o.path, o.view ?? null, o.mode ?? null, o.reason ?? null, o.deadline ?? null, o.signal ?? null, 'fictional-source', 'done');
  item('rh-ts-1', { route: 'kaduse-news', title: 'Fictional regulator announces a deadline (rehearsal)', summary: 'time-sensitive synthetic item', published: '2026-10-01T06:00:00.000Z', triage: 'production', path: 'TIME_SENSITIVE', deadline: '2026-10-09T00:00:00.000Z', signal: '{"tier":"A"}' });
  item('rh-ts-2', { route: 'kaduse-news', title: 'Synthetic recall notice (rehearsal)', summary: 'another time-sensitive item', published: '2026-10-02T06:00:00.000Z', triage: 'inbox', path: 'TIME_SENSITIVE' });
  item('rh-ev-1', { route: 'kaduse-research', title: 'Fictional long-run cohort summary (rehearsal)', summary: 'evergreen synthetic item', published: '2025-03-01T00:00:00.000Z', triage: 'hold', path: 'EVERGREEN', view: 'health_reference', mode: 'EVERGREEN_NEW', reason: 'synthetic' });
  item('rh-ev-2', { route: 'kaduse-research', title: 'Fictional rediscovered review (rehearsal)', summary: 'evergreen rediscovery', published: '2019-06-01T00:00:00.000Z', triage: 'inbox', path: 'EVERGREEN', view: 'research_rediscovery', mode: 'EVERGREEN_REDISCOVERY', reason: 'synthetic' });
  ins(`INSERT INTO item_path_membership (source_item_id, temporal_path, first_at) VALUES ('rh-ts-1','TIME_SENSITIVE','2026-10-01T09:00:00.000Z'), ('rh-ev-1','EVERGREEN','2026-10-01T09:00:00.000Z')`);
  ins(`INSERT INTO item_path_membership (source_item_id, temporal_path, evergreen_view, discovery_mode, first_at) VALUES ('rh-ev-2','EVERGREEN','research_rediscovery','EVERGREEN_REDISCOVERY','2026-10-01T09:00:00.000Z')`);
  ins(`INSERT INTO evergreen_runtime_state (source_id, cursor_json, run_id, lease_until, next_due, last_attempt_at, last_success_at, failure_count, evaluated, accepted, underfill, result_json, updated_at) VALUES ('fictional-source','{"page":3}','run-rehearsal',NULL,'2026-10-05T00:00:00.000Z','2026-10-03T00:00:00.000Z','2026-10-03T00:00:00.000Z',0,40,12,1,'{"ok":true}','2026-10-03T00:00:00.000Z')`);
  ins(`INSERT INTO evidence_cards (id, source_item_id, doi, pmid, finding, limitation, study_type) VALUES ('ec-1','rh-ev-1','10.0000/fictional.1','00000001','synthetic finding','synthetic limitation','cohort')`);
  ins(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor, decided_at) VALUES ('ed-1','rh-ts-1','promote','inbox','production','rehearsal-user','2026-10-01T10:00:00.000Z')`);
  ins(`INSERT INTO decided_links (url_key, decided_at) VALUES ('example.invalid/rh-ts-1','2026-10-01T10:00:00.000Z')`);
  ins(`INSERT INTO source_routes (id, source_item_id, route, channel_id, routed_at) VALUES ('sr-1','rh-ts-1','kaduse-news','kaduse','2026-10-01T10:00:00.000Z')`);
  ins(`INSERT INTO tip_toplulugu_source_telemetry (source_id, activation_state, failure_count, updated_at) VALUES ('fictional-source','MANUAL_INTAKE',0,'2026-10-03T00:00:00.000Z')`);
  ins(`INSERT INTO approved_briefs (brief_id, source_item_id, route, channel_id, payload_json, handoff_status, approved_at, approved_by) VALUES ('br-1','rh-ts-1','kaduse-news','kaduse','{"fictional":true}','sent','2026-10-01T10:05:00.000Z','rehearsal-user')`);
  ins(`INSERT INTO handoff_log (id, brief_id, direction, body_json, created_at) VALUES ('hl-1','br-1','outbound','{"fictional":true}','2026-10-01T10:05:00.000Z')`);
  ins(`INSERT INTO production_status (id, brief_id, status, detail, updated_at) VALUES ('ps-1','br-1','accepted','synthetic','2026-10-01T11:00:00.000Z')`);
}

/** CHECK / constraint semantics probed through attempted inserts (rolled back): the outcome (accepted or the exact error) must be identical before and after 0031. */
function constraintProbes(db) {
  const base = `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, acquisition_path) VALUES (?, (SELECT id FROM source_feeds LIMIT 1), 'kaduse-news', 'kaduse', 't', 'u', 'p', ?, ?, ?)`;
  const cases = [
    ['valid TIME_SENSITIVE', base, ['p1', 'inbox', 'd1', 'TIME_SENSITIVE']],
    ['valid EVERGREEN', base, ['p2', 'inbox', 'd2', 'EVERGREEN']],
    ['invalid acquisition_path', base, ['p3', 'inbox', 'd3', 'BOGUS']],
    ['invalid triage_status', base, ['p4', 'weird', 'd4', 'EVERGREEN']],
    ['invalid temporal_path', `INSERT INTO item_path_membership (source_item_id, temporal_path) VALUES ('rh-ts-1','THIRD_PATH')`, []],
    ['invalid evergreen_view', `INSERT INTO item_path_membership (source_item_id, temporal_path, evergreen_view) VALUES ('rh-ev-1','EVERGREEN','made_up')`, []],
    ['duplicate primary key', `INSERT INTO evergreen_runtime_state (source_id, updated_at) VALUES ('fictional-source','x')`, []],
    ['invalid handoff_status', `INSERT INTO approved_briefs (brief_id, source_item_id, route, channel_id, payload_json, handoff_status) VALUES ('brx','rh-ts-1','kaduse-news','kaduse','{}','nonsense')`, []],
  ];
  const out = {};
  for (const [name, sql, args] of cases) {
    db.exec('BEGIN');
    try { db.prepare(sql).run(...args); out[name] = 'ACCEPTED'; } catch (e) { out[name] = String(e.message).replace(/\s+/g, ' ').slice(0, 120); }
    db.exec('ROLLBACK');
  }
  return out;
}

function baseline(db) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((t) => t.name).filter((n) => !isDossier(n));
  const counts = {};
  const digests = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    digests[t] = sha(JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
  }
  const objects = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all().filter((o) => !isDossier(o.name) && !isDossier(o.tbl_name));
  const columns = Object.fromEntries(tables.map((t) => [t, sha(JSON.stringify(db.prepare(`PRAGMA table_info(${t})`).all()))]));
  const paths = { TIME_SENSITIVE: sha(JSON.stringify(db.prepare(`SELECT * FROM source_items WHERE acquisition_path = 'TIME_SENSITIVE' ORDER BY id`).all()) + JSON.stringify(db.prepare(`SELECT * FROM item_path_membership WHERE temporal_path = 'TIME_SENSITIVE' ORDER BY source_item_id`).all())), EVERGREEN: sha(JSON.stringify(db.prepare(`SELECT * FROM source_items WHERE acquisition_path = 'EVERGREEN' ORDER BY id`).all()) + JSON.stringify(db.prepare(`SELECT * FROM item_path_membership WHERE temporal_path = 'EVERGREEN' ORDER BY source_item_id`).all()) + JSON.stringify(db.prepare(`SELECT * FROM evergreen_runtime_state ORDER BY source_id`).all())) };
  return { counts, digests, paths, objects, objectsDigest: sha(JSON.stringify(objects)), columns, constraints: constraintProbes(db), integrity: db.prepare('PRAGMA integrity_check').get().integrity_check, fkViolations: db.prepare('PRAGMA foreign_key_check').all().length, totalRows: Object.values(counts).reduce((a, b) => a + b, 0) };
}
const diff = (a, b) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

const ctxStub = { waitUntil() {}, passThroughOnException() {} };
async function boot(worker, sqlite, label) {
  const env = { DB: d1FromSqlite(sqlite), ENVIRONMENT: 'rehearsal', OPS_TOKEN: 'rehearsal-token-not-a-secret', DOSSIER_CANARY_ENABLED: 'false', BUILD_COMMIT: 'rehearsal' };
  const call = async (path, opts = {}) => worker.fetch(new Request(`https://rehearsal.invalid${path}`, opts), env, ctxStub);
  const health = await call('/api/health');
  const ready = await call('/api/ready');
  const readyBody = await ready.json();
  const noTok = await call('/api/dossier/canary/status');
  const status = await call('/api/dossier/canary/status', { headers: { authorization: `Bearer ${env.OPS_TOKEN}` } });
  const statusBody = status.status === 200 ? await status.json() : null;
  const readiness = await call('/api/dossier/canary/readiness', { headers: { authorization: `Bearer ${env.OPS_TOKEN}` } });
  const readinessBody = readiness.status === 200 ? await readiness.json() : null;
  const run = await call('/api/dossier/canary/run', { method: 'POST', headers: { authorization: `Bearer ${env.OPS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ operator: 'rehearsal', reader_id: 'dossier-clinicaltrials-frontier' }) });
  const runBody = await run.json();
  const dossierTablesWritten = (() => { try { return ['dossier_canary_runs', 'dossier_signal_runs', 'dossier_observations', 'dossier_concepts', 'dossier_candidates'].reduce((a, t) => a + sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0); } catch { return 'TABLES_ABSENT'; } })();
  return {
    label,
    liveness_http: health.status,
    ready_http: ready.status,
    ready_level: readyBody.level,
    ready_blocked_reasons: readyBody.blocked ?? [],
    ready_degraded_reasons: readyBody.degraded ?? [],
    ready_dossier_level: readyBody.dossier?.level ?? null,
    dossier_surface_without_credentials_http: noTok.status,
    status_http: status.status,
    status_error: statusBody ? null : (await status.clone().json().catch(() => ({}))).error ?? null,
    status_env_master_switch: statusBody?.env_master_switch ?? null,
    readiness_dossier_level: readinessBody?.readiness?.level ?? null,
    run_http: run.status,
    run_refused_reasons: runBody.reasons ?? runBody.error ?? runBody.message ?? null,
    dossier_rows_created_by_boot: dossierTablesWritten,
  };
}

export async function rehearse() {
  const dir = mkdtempSync(join(tmpdir(), 'dossier-0031-rehearsal-'));
  const checks = [];
  const open = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  try {
    const pf = preflight();
    check('static preflight passes', pf.REMOTE_0031_PREFLIGHT === 'PASS');
    const raw = readFileSync(`migrations/${MIGRATION}`, 'utf8');

    // ---- upgrade rehearsal: pre-0031 (file database) -> seeded -> baseline -> apply 0031
    const upgradeFile = join(dir, 'upgrade.sqlite');
    const up = new DatabaseSync(upgradeFile);
    open.push(up);
    applyMigrations(up);
    const preObjectsDossier = up.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%dossier%'`).get().n;
    check('pre-0031 schema contains no dossier object', preObjectsDossier === 0);
    seedGcos(up);
    const before = baseline(up);
    check('baseline seeded: both temporal paths and the Evergreen runtime state have rows', before.counts.source_items >= 4 && before.counts.item_path_membership >= 3 && before.counts.evergreen_runtime_state === 1 && before.counts.source_feeds > 0, JSON.stringify({ items: before.counts.source_items, membership: before.counts.item_path_membership, feeds: before.counts.source_feeds }));
    check('baseline integrity', before.integrity === 'ok' && before.fkViolations === 0);
    const preBoot = await bootPre(upgradeFile);
    up.exec(raw);
    const after = baseline(up);
    check('all pre-existing row counts preserved', diff(before.counts, after.counts).length === 0, diff(before.counts, after.counts).join());
    check('all pre-existing row values preserved (per-table content digest)', diff(before.digests, after.digests).length === 0, diff(before.digests, after.digests).join());
    check('every pre-existing schema object unchanged (tables, indexes, triggers, views: exact SQL)', before.objectsDigest === after.objectsDigest);
    check('every pre-existing column definition unchanged', diff(before.columns, after.columns).length === 0);
    check('existing CHECK / PK semantics unchanged (same accept/reject outcome for every probe)', JSON.stringify(before.constraints) === JSON.stringify(after.constraints), JSON.stringify(diff(before.constraints, after.constraints)));
    check('integrity after upgrade', after.integrity === 'ok' && after.fkViolations === 0);
    check('TIME_SENSITIVE path rows unchanged (items + membership)', before.paths.TIME_SENSITIVE === after.paths.TIME_SENSITIVE);
    check('EVERGREEN path rows and Evergreen runtime state unchanged', before.paths.EVERGREEN === after.paths.EVERGREEN);
    const added = up.prepare(`SELECT type, name FROM sqlite_master WHERE name LIKE '%dossier%' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY type, name`).all();
    const expected = [...raw.replace(/--[^\n]*/g, '').matchAll(/CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)].map((m) => ({ type: m[1].toLowerCase(), name: m[2] }));
    check('only the audited dossier objects were added (exact set)', JSON.stringify(added.map((o) => `${o.type}:${o.name}`).sort()) === JSON.stringify(expected.map((o) => `${o.type}:${o.name}`).sort()), `${added.length} added vs ${expected.length} audited`);
    const dossierRows = up.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dossier_%'`).all().reduce((a, t) => a + up.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n, 0);
    check('the upgrade seeds no dossier row', dossierRows === 0);
    let again = true;
    try { up.exec(raw); } catch { again = false; }
    const afterAgain = baseline(up);
    check('re-applying 0031 is safe (idempotent) and changes nothing', again && afterAgain.objectsDigest === before.objectsDigest && diff(before.digests, afterAgain.digests).length === 0);
    const postBoot = await bootWorker(upgradeFile, 'upgraded schema (0031 applied)');

    // ---- fresh migration: every migration on an empty database must equal the upgraded schema
    const fresh = new DatabaseSync(join(dir, 'fresh.sqlite'));
    open.push(fresh);
    let freshOk = true;
    try { applyMigrations(fresh, { until31: false }); } catch (e) { freshOk = false; check('fresh migration (all files) applies', false, String(e.message)); }
    if (freshOk) {
      check('fresh migration (all files) applies', true, `${readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).length} files`);
      const sig = (db) => sha(JSON.stringify(db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all()));
      check('fresh schema equals the upgraded schema byte for byte (all objects)', sig(fresh) === sig(up));
      check('fresh database integrity', fresh.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
    }
    check('Worker boots on the pre-0031 schema: liveness 200, missing ledger fails closed, DOSSIER feature disabled, no run possible', preBoot.liveness_http === 200 && preBoot.ready_http === 503 && preBoot.ready_level === 'BLOCKED' && preBoot.ready_blocked_reasons.includes('REQUIRED_MIGRATIONS_MISSING') && preBoot.run_http === 409 && preBoot.status_http === 409 && preBoot.run_refused_reasons === 'DOSSIER_SCHEMA_NOT_APPLIED' && preBoot.dossier_rows_created_by_boot === 'TABLES_ABSENT', JSON.stringify(preBoot));
    check('Worker boots on the upgraded schema: missing ledger still fails closed, DOSSIER disabled (master switch off), no run, no row created', postBoot.liveness_http === 200 && postBoot.ready_http === 503 && postBoot.ready_level === 'BLOCKED' && postBoot.ready_blocked_reasons.includes('REQUIRED_MIGRATIONS_MISSING') && postBoot.dossier_surface_without_credentials_http === 401 && postBoot.status_env_master_switch === false && postBoot.readiness_dossier_level === 'DISABLED' && postBoot.run_http === 409 && postBoot.dossier_rows_created_by_boot === 0, JSON.stringify(postBoot));

    const objects = { tables: pf.objects.tables, indexes: pf.objects.indexes, triggers: pf.objects.triggers };
    return {
      REMOTE_0031_REHEARSAL: checks.every((c) => c.ok) ? 'PASS' : 'FAIL',
      REMOTE_MUTATION: 'NOT_APPLIED',
      migration_filename: MIGRATION,
      sha256_lf_normalized: pf.sha256_lf_normalized,
      objects_created: objects.tables + objects.indexes + objects.triggers,
      tables_created: objects.tables,
      indexes_created: objects.indexes,
      triggers_created: objects.triggers,
      existing_objects_modified: before.objectsDigest === after.objectsDigest && diff(before.columns, after.columns).length === 0 ? 0 : 'NONZERO',
      existing_rows_modified: diff(before.digests, after.digests).length === 0 && diff(before.counts, after.counts).length === 0 ? 0 : 'NONZERO',
      fresh_test: freshOk ? 'PASS' : 'FAIL',
      upgrade_test: checks.filter((c) => /pre-existing|CHECK|only the audited|re-applying|integrity after|TIME_SENSITIVE/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
      worker_boot_test: preBoot.liveness_http === 200 && postBoot.liveness_http === 200 && postBoot.readiness_dossier_level === 'DISABLED' ? 'PASS' : 'FAIL',
      seeded_rows_total: before.totalRows,
      baseline_row_counts_nonzero: Object.fromEntries(Object.entries(before.counts).filter(([, n]) => n > 0)),
      constraint_probes: after.constraints,
      worker_boot: { pre_0031: preBoot, upgraded: postBoot },
      checks,
      timestamp: new Date().toISOString(),
    };
  } finally {
    for (const d of open) { try { d.close(); } catch { /* already closed */ } }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* disposable temp files; the OS temp cleaner removes leftovers */ }
  }
}

let workerBundle;
async function bootWorker(file, label) {
  workerBundle ??= (await bundle('apps/worker/src/index.ts', 'rehearsal-worker')).default;
  const db = new DatabaseSync(file);
  try { return await boot(workerBundle, db, label); } finally { db.close(); }
}
async function bootPre(file) {
  const copy = file.replace(/\.sqlite$/, '-pre-copy.sqlite');
  const src = new DatabaseSync(file);
  src.exec(`VACUUM INTO '${copy.replace(/\\/g, '/').replace(/'/g, "''")}'`);
  src.close();
  return bootWorker(copy, 'pre-0031 schema (0031 NOT applied)');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = await rehearse();
  if (process.argv.includes('--write')) {
    mkdirSync('docs/generated', { recursive: true });
    writeFileSync('docs/generated/dossier-0031-preflight.json', JSON.stringify(r, null, 2) + '\n');
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.REMOTE_0031_REHEARSAL === 'PASS' ? 0 : 1);
}
