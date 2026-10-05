// HEALTH_STATISTICS schema V1 — local executable proof (disposable in-memory SQLite, D1-compatible subset).
// Never touches D1, wrangler, production or any persisted database. Usage: node scripts/statistics-schema-proof.mjs [--write]
// --write regenerates docs/generated/statistics-schema-validation-v1.json (the only file this script may write).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const DDL_PATH = 'docs/generated/statistics-schema-v1.sql';
const OUT_PATH = 'docs/generated/statistics-schema-validation-v1.json';
const ddl = readFileSync(DDL_PATH, 'utf8');
const results = [];
const section = { current: 'setup' };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function b32(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } return out; }
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulid = () => Array.from(randomBytes(26), (b) => CROCK[b % 32]).join('');
const ids = {
  release: (dataset, kind, key) => 'rel_' + sha(`${dataset}|${kind}|${key}`).slice(0, 24),
  series: (key) => 'ser_' + b32(createHash('sha256').update(key).digest().subarray(0, 20)),
  run: () => 'run_' + ulid(),
  event: () => 'val_' + ulid(),
  ckpt: (dataset, scope) => 'ckp_' + sha(`${dataset}|${scope}`).slice(0, 24),
  artifact: (hex) => 'art_' + hex,
  sev: (dedupe) => 'sev_' + dedupe.slice(0, 24),
  lin: (type, from, to) => 'lin_' + sha(`${type}|${from}|${to}`).slice(0, 24),
};
const T = (n) => `2026-10-0${1 + (n % 9)}T10:00:00.000Z`;

function record(id, name, expected, ok, detail = '') { results.push({ section: section.current, id, name, expected, passed: ok, detail: String(detail).slice(0, 240) }); }
function ok(id, name, fn) { try { const r = fn(); record(id, name, 'success', r !== false, r === false ? 'returned false' : ''); } catch (e) { record(id, name, 'success', false, e.message); } }
function fails(id, name, fn, code) { try { fn(); record(id, name, `fail(${[].concat(code).join('|')})`, false, 'unexpectedly succeeded'); } catch (e) { const hit = [].concat(code).some((c) => e.message.includes(c)); record(id, name, `fail(${[].concat(code).join('|')})`, hit, hit ? '' : `wrong error: ${e.message}`); } }
function eq(id, name, actual, expected) { const pass = JSON.stringify(actual) === JSON.stringify(expected); record(id, name, JSON.stringify(expected), pass, pass ? '' : `actual ${JSON.stringify(actual)}`); }

function open() { const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); return db; }
const q = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const run = (db, sql, ...p) => db.prepare(sql).run(...p);

// ---------------- reference writer (the frozen write contract) ----------------
const fp = (o) => sha(JSON.stringify([o.value_state, o.numeric_value ?? null, o.text_value ?? null, o.lower_bound ?? null, o.upper_bound ?? null, o.interval_type ?? null, o.finality ?? 'UNKNOWN', o.status_flag_native ?? null]));
const WINNER = `SELECT v.series_id, v.period_key, v.release_id, v.period_granularity, v.period_start, v.period_end, v.value_state, v.numeric_value, v.text_value, v.finality, v.quality_state, v.retrieved_at, v.created_at,
  COUNT(*) OVER (PARTITION BY v.series_id, v.period_key) - 1 AS revisions,
  ROW_NUMBER() OVER (PARTITION BY v.series_id, v.period_key ORDER BY r.release_rank DESC, v.retrieved_at DESC, v.release_id DESC) AS rn
  FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id
  WHERE v.quality_state <> 'QUARANTINED' AND r.status <> 'WITHDRAWN' AND r.release_class = 'PRODUCTION'`;
function project(db, seriesId, periodKey) {
  const w = one(db, `SELECT * FROM (${WINNER} AND v.series_id = ? AND v.period_key = ?) WHERE rn = 1`, seriesId, periodKey);
  if (!w) { run(db, 'DELETE FROM statistics_current_observations WHERE series_id = ? AND period_key = ?', seriesId, periodKey); return null; }
  run(db, `INSERT INTO statistics_current_observations (series_id, period_key, current_release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revision_count, last_changed_at, last_confirmed_release_id, last_confirmed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(series_id, period_key) DO UPDATE SET current_release_id=excluded.current_release_id, period_granularity=excluded.period_granularity, period_start=excluded.period_start, period_end=excluded.period_end,
      value_state=excluded.value_state, numeric_value=excluded.numeric_value, text_value=excluded.text_value, finality=excluded.finality, quality_state=excluded.quality_state,
      revision_count=excluded.revision_count, last_changed_at=excluded.last_changed_at, last_confirmed_release_id=excluded.last_confirmed_release_id, last_confirmed_at=excluded.last_confirmed_at`,
    w.series_id, w.period_key, w.release_id, w.period_granularity, w.period_start, w.period_end, w.value_state, w.numeric_value, w.text_value, w.finality, w.quality_state, w.revisions, w.created_at, w.release_id, w.retrieved_at);
  return w;
}
function rebuild(db) {
  run(db, 'DELETE FROM statistics_current_observations');
  run(db, `INSERT INTO statistics_current_observations (series_id, period_key, current_release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revision_count, last_changed_at, last_confirmed_release_id, last_confirmed_at)
    SELECT series_id, period_key, release_id, period_granularity, period_start, period_end, value_state, numeric_value, text_value, finality, quality_state, revisions, created_at, release_id, retrieved_at FROM (${WINNER}) WHERE rn = 1`);
}
const INS_V = `INSERT INTO statistics_observation_versions (series_id, period_key, release_id, period_granularity, period_start, period_end, source_period_key, value_state, numeric_value, text_value, lower_bound, upper_bound, interval_type, status_flag_native, finality, revision_class, previous_release_id, revision_reason_origin, revision_reason_source, value_fingerprint, run_id, provenance_kind, source_locator, extraction_method, artifact_id, retrieved_at, created_at, quality_state)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(series_id, period_key, release_id) DO UPDATE SET value_fingerprint = excluded.value_fingerprint WHERE statistics_observation_versions.value_fingerprint <> excluded.value_fingerprint`;
// o: {series_id, period (key,gran,start,end,native), release_id, value..., run_id, kind, locator, method, artifact_id, retrieved_at, revision_class?}
function write(db, o) {
  const rel = one(db, 'SELECT release_rank FROM statistics_releases WHERE release_id = ?', o.release_id);
  const fingerprint = fp(o);
  const same = one(db, 'SELECT value_fingerprint FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', o.series_id, o.period.key, o.release_id);
  const win = one(db, `SELECT * FROM (${WINNER} AND v.series_id = ? AND v.period_key = ?) WHERE rn = 1`, o.series_id, o.period.key);
  let cls = 'NEW_RELEASE', prev = null, result = 'INSERTED';
  if (same) cls = 'NEW_RELEASE'; // replay/conflict path: the UPSERT decides (no-op or abort)
  else if (win) {
    const winRank = one(db, 'SELECT release_rank FROM statistics_releases WHERE release_id = ?', win.release_id).release_rank;
    const winFp = one(db, 'SELECT value_fingerprint FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', win.series_id, win.period_key, win.release_id).value_fingerprint;
    if (rel.release_rank < winRank) { cls = 'BACKFILL'; result = 'BACKFILL'; }
    else if (winFp === fingerprint) { // same value in a newer release: no version, only confirmation
      run(db, 'UPDATE statistics_current_observations SET last_confirmed_release_id = ?, last_confirmed_at = ? WHERE series_id = ? AND period_key = ?', o.release_id, o.retrieved_at, o.series_id, o.period.key);
      return 'CONFIRMED_NO_VERSION';
    } else { cls = o.revision_class ?? 'SOURCE_REVISION'; prev = win.release_id; result = 'REVISED'; }
  }
  const kindMeta = o.kind ?? 'API';
  const quality = o.quality ?? (kindMeta === 'PDF' || kindMeta === 'EXPORT' ? 'SUSPECT' : 'VALID');
  run(db, INS_V, o.series_id, o.period.key, o.release_id, o.period.gran, o.period.start ?? null, o.period.end ?? null, o.period.native, o.value_state, o.numeric_value ?? null, o.text_value ?? null, o.lower_bound ?? null, o.upper_bound ?? null, o.interval_type ?? null, o.status_flag_native ?? null,
    o.finality ?? 'UNKNOWN', same ? 'NEW_RELEASE' : cls, same ? null : prev, o.reason ? 'SOURCE_STATED' : 'NOT_STATED', o.reason ?? null, fingerprint, o.run_id, kindMeta, o.locator, o.method ?? 'NATIVE_STRUCTURED', o.artifact_id ?? null, o.retrieved_at, o.created_at ?? o.retrieved_at, quality);
  if (same) return same.value_fingerprint === fingerprint ? 'REPLAY_NOOP' : 'CONFLICT';
  project(db, o.series_id, o.period.key);
  return result;
}
const Y = (y) => ({ key: `Y${y}`, gran: 'YEAR', start: `${y}-01-01`, end: `${y}-12-31`, native: String(y) });

// ---------------- fixtures ----------------
function bootstrap(db) {
  db.exec(ddl);
  const src = (id, area, disp, role = 'PRIMARY_PRODUCER') => run(db, `INSERT INTO statistics_sources (source_id, display_name, organization, source_area, disposition, authority_level, upstream_role, architecture_status, registry_version) VALUES (?,?,?,?,?,?,?,?, 'V1')`, id, id, 'org', area, disp, '3_INTERGOVERNMENTAL', role, 'ARCHITECTURE_READY');
  src('EUROSTAT_HEALTH', 'GLOBAL_HEALTH_STATISTICS', 'PRIMARY_CANONICAL');
  src('WHO_HEALTH_STATISTICS', 'GLOBAL_HEALTH_STATISTICS', 'PRIMARY_CANONICAL');
  src('SGK_HEALTH_STATISTICS', 'TURKEY_HEALTH_STATISTICS', 'PRIMARY_CANONICAL');
  src('TR_MINISTRY_OF_HEALTH_STATISTICS', 'TURKEY_HEALTH_STATISTICS', 'PRIMARY_CANONICAL');
  src('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'GLOBAL_HEALTH_STATISTICS', 'SECONDARY_NORMALIZED', 'SECONDARY_NORMALIZED');
  src('WORLDOMETER', 'GLOBAL_HEALTH_STATISTICS', 'DISCOVERY_CROSSCHECK', 'DISCOVERY');
  const ds = (src_, native, type, rc, ac, rm, pm) => { const id = `${src_}:${native}`; run(db, `INSERT INTO statistics_datasets (dataset_id, source_id, source_native_dataset_id, display_name, dataset_type, reader_class, access_class, release_model, reference_period_model, bounded_query_capability, architecture_readiness) VALUES (?,?,?,?,?,?,?,?,?, 'YES', 'ARCHITECTURE_READY')`, id, src_, native, native, type, rc, ac, rm, pm); return id; };
  const D = {
    api: ds('EUROSTAT_HEALTH', 'HLTH_SHA11_HF', 'SDMX_DATAFLOW', 'SDMX_READER', 'DOCUMENTED_API', 'API_SNAPSHOT', 'YEAR'),
    who: ds('WHO_HEALTH_STATISTICS', 'WHOSIS_000001', 'ODATA_INDICATOR', 'ODATA_READER', 'DOCUMENTED_API', 'API_SNAPSHOT', 'YEAR'),
    sgk: ds('SGK_HEALTH_STATISTICS', 'YILLIK_BLM_4', 'FILE_WORKBOOK', 'BULK_FILE_READER', 'BULK_FILE', 'FILE_VERSION', 'YEAR'),
    moh: ds('TR_MINISTRY_OF_HEALTH_STATISTICS', 'SIY_BULLETIN', 'PDF_REPORT_SERIES', 'PDF_RELEASE_READER', 'PDF_RELEASE', 'PUBLICATION', 'YEAR'),
    owid: ds('OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'life-expectancy', 'REST_INDICATOR_SET', 'SECONDARY_QA_READER', 'PUBLIC_DOCUMENTED_DOWNLOAD', 'API_SNAPSHOT', 'YEAR'),
  };
  run(db, `INSERT INTO statistics_geographies (geography_id, scheme, code, label_en, label_tr, kind, iso3) VALUES ('ISO3:TUR','ISO3','TUR','Türkiye','Türkiye','COUNTRY','TUR')`);
  run(db, `INSERT INTO statistics_geographies (geography_id, scheme, code, label_en, kind, iso3) VALUES ('ISO3:DEU','ISO3','DEU','Germany','COUNTRY','DEU')`);
  run(db, `INSERT INTO statistics_geographies (geography_id, scheme, code, label_en, kind, parent_geography_id) VALUES ('TUIK_IBBS:TR100','TUIK_IBBS','TR100','İstanbul','PROVINCE','ISO3:TUR')`);
  run(db, `INSERT INTO statistics_geographies (geography_id, scheme, code, label_en, kind) VALUES ('WHO_REGION:EUR','WHO_REGION','EUR','WHO European Region','SUPRANATIONAL')`);
  const ind = (dataset, nat, label, mt) => { const id = `${dataset}#${nat}`; run(db, `INSERT INTO statistics_indicators (indicator_id, dataset_id, source_native_indicator_id, label, measure_type) VALUES (?,?,?,?,?)`, id, dataset, nat, label, mt); return id; };
  const I = { api: ind(D.api, 'HF1', 'Government schemes', 'PERCENT'), who: ind(D.who, 'WHOSIS_000001', 'Life expectancy at birth', 'YEARS'), sgk: ind(D.sgk, 'TABLO-4.3', 'Sickness events by age and sex', 'COUNT'), moh: ind(D.moh, 'T2.1', 'Infant mortality rate', 'RATE'), owid: ind(D.owid, 'life-expectancy', 'Life expectancy (OWID)', 'YEARS') };
  run(db, `INSERT INTO statistics_concepts (concept_code, label, domain, status, approved_by, approved_at) VALUES ('LIFE_EXPECTANCY_AT_BIRTH','Life expectancy at birth','LIFE_EXPECTANCY','APPROVED','owner@example',?)`, T(1));
  run(db, `INSERT INTO statistics_concepts (concept_code, label, domain, status) VALUES ('INFANT_MORTALITY_RATE','Infant mortality rate','CHILD_NEWBORN','PROPOSED')`);
  return { D, I };
}
function mkSeries(db, d, ind, geo, over = {}) {
  const dims = over.dims ?? {};
  const dimHash = sha(Object.keys(dims).sort().map((k) => `${k}=${dims[k]}`).join('\n')).slice(0, 16);
  const unit = over.unit ?? '_Z', sex = over.sex ?? '_Z', age = over.age ?? '_Z';
  const key = over.key ?? `v1|${d}|${ind.split('#')[1]}|${geo}|${unit}|${sex}|${age}|${over.std ?? 'UNKNOWN'}|${over.est ?? 'UNKNOWN'}|${over.scn ?? '_Z'}|${dimHash}`;
  const sid = ids.series(key);
  run(db, `INSERT INTO statistics_series (series_id, canonical_series_key, dataset_id, indicator_id, geography_id, unit_code, sex_code, age_group_code, standardization_code, estimate_type_code, scenario_code, dimset_hash, source_native_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sid, key, d, ind, geo, unit, sex, age, over.std ?? 'UNKNOWN', over.est ?? 'UNKNOWN', over.scn ?? '_Z', dimHash, over.native ?? `native:${key}`);
  Object.entries(dims).forEach(([k, v], i) => run(db, 'INSERT INTO statistics_series_dimensions (series_id, dimension_key, source_value_code, source_value_label, value_order) VALUES (?,?,?,?,?)', sid, k, v, v, i));
  return sid;
}
function mkRelease(db, dataset, kind, key, over = {}) {
  const id = ids.release(dataset, kind, key);
  run(db, `INSERT INTO statistics_releases (release_id, dataset_id, release_kind, release_key, edition_label, published_at, retrieved_first_at, release_class, status, supersedes_release_id, release_rank, source_url, release_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, dataset, kind, key, over.edition ?? null, over.published ?? null, over.retrieved ?? T(2), over.cls ?? 'PRODUCTION', over.status ?? 'CURRENT', over.supersedes ?? null, over.rank ?? 1, over.url ?? null, sha(`${dataset}|${key}`));
  return id;
}
function activate(db, source, scope = '*') { // test-only simulation of an OWNER action: complete gate set + approval reference
  const dataset = scope === '*' ? null : scope;
  run(db, `INSERT INTO statistics_source_runtime_policy (source_id, scope_key, dataset_id, runtime_state, terms_status, legal_gate, legal_override_ref, auth_gate, rate_limit_gate, canary_gate, owner_activation_ref, owner_activated_at, policy_change_reason, changed_by)
    VALUES (?,?,?, 'ACTIVE', 'PARTIAL', 'OWNER_REVIEW_REQUIRED', 'OWNER-OVERRIDE-TEST', 'NOT_REQUIRED', 'SET', 'PASSED', 'OWNER-APPROVAL-TEST', ?, 'test activation', 'owner-test')`, source, scope, dataset, T(3));
}
function mkRun(db, source, dataset, mode = 'PRODUCTION', over = {}) {
  const id = ids.run();
  run(db, `INSERT INTO statistics_ingestion_runs (run_id, source_id, dataset_id, reader_class, reader_version, parser_version, normalizer_version, mapping_version, transform_fingerprint, run_mode, status, stage, planned_unit_key, bounds_spec, release_id, started_at, lease_owner, lease_expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'RUNNING', 'WRITE', ?, ?, ?, ?, 'worker-lease-1', ?)`, id, source, dataset, over.reader ?? 'SDMX_READER', 'r1', 'p1', 'n1', 'm1', sha('cfg'), mode, over.unit ?? `unit-${id}`, over.bounds ?? '{"geo":"TUR","window":"2020-2025"}', over.release ?? null, T(3), T(4));
  return id;
}
function finish(db, runId, status = 'COMPLETED', counts = {}) {
  run(db, `UPDATE statistics_ingestion_runs SET status = ?, finished_at = ?, finalization_status = ?, inserted_count = ?, unchanged_count = ?, revised_count = ? WHERE run_id = ?`, status, T(5), status === 'COMPLETED' ? 'FINALIZED' : 'NOT_FINALIZED', counts.inserted ?? 0, counts.unchanged ?? 0, counts.revised ?? 0, runId);
}

// ================= 1. DDL =================
section.current = 'ddl';
{
  const db = open();
  ok('DDL-01', 'reference DDL applies to an empty database', () => { db.exec(ddl); return true; });
  ok('DDL-02', 'DDL is re-applicable (IF NOT EXISTS everywhere)', () => { db.exec(ddl); return true; });
  ok('DDL-03', 'DDL contains no DROP/ALTER/PRAGMA statements', () => !/^\s*(DROP|ALTER|PRAGMA)\b/im.test(ddl.replace(/--.*$/gm, '')));
  const tables = q(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
  const idx = q(db, "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
  const auto = q(db, "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'sqlite_autoindex%'").length;
  const trg = q(db, "SELECT name FROM sqlite_master WHERE type='trigger'").length;
  eq('DDL-04', 'final table count', tables.length, 18);
  record('DDL-05', 'explicit index count / implicit autoindex count / trigger count', 'informational', true, `${idx.length} explicit, ${auto} autoindex, ${trg} triggers`);
  results.meta = { tables, explicitIndexes: idx.length, autoIndexes: auto, triggers: trg };
  const fkViol = q(db, 'PRAGMA foreign_key_check');
  eq('DDL-06', 'foreign_key_check clean on empty schema', fkViol.length, 0);
  eq('DDL-07', 'all FKs are RESTRICT/NO ACTION (no CASCADE in DDL)', /ON DELETE CASCADE/i.test(ddl), false);
  eq('DDL-08', 'foreign keys enforced when enabled', one(db, 'PRAGMA foreign_keys').foreign_keys, 1);
}

// ================= 2. Flow 1: API / SDMX =================
section.current = 'flow1-api';
const flow1 = open(); const F1 = bootstrap(flow1);
{
  const db = flow1;
  fails('F1-00', 'run for a source with no runtime policy row is refused (default DISABLED)', () => mkRun(db, 'EUROSTAT_HEALTH', F1.D.api), 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
  fails('F1-00b', 'CANARY run refused while DISABLED', () => mkRun(db, 'EUROSTAT_HEALTH', F1.D.api, 'CANARY'), 'STAT_RUN_REQUIRES_CANARY_POLICY');
  activate(db, 'EUROSTAT_HEALTH');
  const relA = mkRelease(db, F1.D.api, 'API_SNAPSHOT', 'updated:2026-06-01', { published: '2026-06-01', rank: 20260601000000, url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_sha11_hf?geo=TR' });
  const runId = mkRun(db, 'EUROSTAT_HEALTH', F1.D.api, 'PRODUCTION', { release: relA, unit: 'flow|geo=TR|last=5' });
  const ser = mkSeries(db, F1.D.api, F1.I.api, 'ISO3:TUR', { unit: 'PC_CHE', dims: { FINANCING_SCHEME: 'HF1' } });
  const ck = ids.ckpt(F1.D.api, 'flow|geo=TR|last=5');
  ok('F1-01', 'checkpoint created with a lease held by the run', () => run(db, `INSERT INTO statistics_checkpoints (checkpoint_id, dataset_id, scope_key, unit_kind, lease_run_id, lease_owner, lease_expires_at) VALUES (?,?,?,?,?,?,?)`, ck, F1.D.api, 'flow|geo=TR|last=5', 'SDMX_WINDOW', runId, 'worker-lease-1', T(4)).changes === 1);
  const base = { series_id: ser, release_id: relA, run_id: runId, locator: 'sdmx:HLTH_SHA11_HF/A.PC_CHE.HF1.TR@2023', retrieved_at: T(3), value_state: 'PRESENT', finality: 'FINAL' };
  eq('F1-02', 'first observation version inserted', write(db, { ...base, period: Y(2023), numeric_value: 77.2, text_value: '77.2' }), 'INSERTED');
  eq('F1-03', 'second period inserted', write(db, { ...base, period: Y(2022), numeric_value: 76.1, text_value: '76.1' }), 'INSERTED');
  ok('F1-04', 'checkpoint advances while leased by the same run', () => run(db, `UPDATE statistics_checkpoints SET cursor_text = 'period=2023', last_release_id = ?, last_run_id = ?, last_success_at = ?, lease_run_id = NULL, lease_owner = NULL, lease_expires_at = NULL WHERE checkpoint_id = ?`, relA, runId, T(5), ck).changes === 1);
  fails('F1-05', 'checkpoint cannot advance without a lease', () => run(db, `UPDATE statistics_checkpoints SET cursor_text = 'period=2024', last_run_id = ? WHERE checkpoint_id = ?`, runId, ck), 'STAT_CHECKPOINT_NOT_LEASED');
  ok('F1-06', 'run finalized (terminal)', () => { finish(db, runId, 'COMPLETED', { inserted: 2 }); return true; });
  fails('F1-07', 'terminal run is immutable', () => run(db, `UPDATE statistics_ingestion_runs SET inserted_count = 99 WHERE run_id = ?`, runId), 'STAT_RUN_TERMINAL_IMMUTABLE');
  eq('F1-08', 'exact replay of the same release is a no-op (no duplicate version)', write(db, { ...base, period: Y(2023), numeric_value: 77.2, text_value: '77.2' }), 'REPLAY_NOOP');
  eq('F1-09', 'version count after replay', one(db, 'SELECT COUNT(*) c FROM statistics_observation_versions').c, 2);
  eq('F1-10', 'bounded latest read (current, one series)', one(db, 'SELECT period_key, numeric_value FROM statistics_current_observations WHERE series_id = ? ORDER BY period_start DESC LIMIT 1', ser), { period_key: 'Y2023', numeric_value: 77.2 });
  eq('F1-11', 'historical read (range)', q(db, 'SELECT period_key FROM statistics_current_observations WHERE series_id = ? AND period_start >= ? ORDER BY period_start', ser, '2022-01-01').map((r) => r.period_key), ['Y2022', 'Y2023']);
  const trace = one(db, `SELECT v.source_locator, r.release_kind, r.source_url, u.reader_version, u.parser_version, u.normalizer_version, d.source_id, s.source_area, g.geography_id
      FROM statistics_observation_versions v JOIN statistics_releases r ON r.release_id = v.release_id JOIN statistics_ingestion_runs u ON u.run_id = v.run_id
      JOIN statistics_datasets d ON d.dataset_id = r.dataset_id JOIN statistics_sources s ON s.source_id = d.source_id
      JOIN statistics_series se ON se.series_id = v.series_id JOIN statistics_geographies g ON g.geography_id = se.geography_id
      WHERE v.series_id = ? AND v.period_key = 'Y2023' AND v.release_id = ?`, ser, relA);
  eq('F1-12', 'provenance trace resolves source, dataset, release, run versions and locator', [trace.source_id, trace.release_kind, trace.reader_version, trace.parser_version, trace.normalizer_version, trace.source_locator.startsWith('sdmx:')], ['EUROSTAT_HEALTH', 'API_SNAPSHOT', 'r1', 'p1', 'n1', true]);
  eq('F1-13', 'INV-008: global source family + Türkiye subject geography are independent', [trace.source_area, trace.geography_id], ['GLOBAL_HEALTH_STATISTICS', 'ISO3:TUR']);
  fails('F1-14', 'version for a nonexistent series is rejected (FK)', () => write(db, { ...base, series_id: 'ser_' + 'a'.repeat(32), period: Y(2020), numeric_value: 1 }), ['FOREIGN KEY', 'STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH']);
  // revision matrix on this DB
  section.current = 'revision-matrix';
  const relB = mkRelease(db, F1.D.api, 'API_SNAPSHOT', 'updated:2026-07-01', { published: '2026-07-01', rank: 20260701000000 });
  const runB = mkRun(db, 'EUROSTAT_HEALTH', F1.D.api, 'PRODUCTION', { release: relB, unit: 'flow|geo=TR|last=5|b' });
  const b2 = { ...base, release_id: relB, run_id: runB, retrieved_at: T(6) };
  eq('R-03', 'new release / same value → no new version, confirmation only', write(db, { ...b2, period: Y(2023), numeric_value: 77.2, text_value: '77.2' }), 'CONFIRMED_NO_VERSION');
  eq('R-03b', 'confirmation recorded on projection', one(db, 'SELECT last_confirmed_release_id r FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser, 'Y2023').r, relB);
  eq('R-04', 'new release / changed value → new immutable version', write(db, { ...b2, period: Y(2023), numeric_value: 77.9, text_value: '77.9' }), 'REVISED');
  eq('R-04b', 'old version still queryable', one(db, 'SELECT numeric_value v FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser, 'Y2023', relA).v, 77.2);
  eq('R-04c', 'new version links to previous and current switches', [one(db, 'SELECT previous_release_id p, revision_class c FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser, 'Y2023', relB), one(db, 'SELECT numeric_value v, revision_count n FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser, 'Y2023')], [{ p: relA, c: 'SOURCE_REVISION' }, { v: 77.9, n: 1 }]);
  const relC = mkRelease(db, F1.D.api, 'API_SNAPSHOT', 'updated:2026-08-01', { published: '2026-08-01', rank: 20260801000000, supersedes: relB });
  const runC = mkRun(db, 'EUROSTAT_HEALTH', F1.D.api, 'PRODUCTION', { release: relC, unit: 'flow|geo=TR|last=5|c' });
  const c2 = { ...base, release_id: relC, run_id: runC, retrieved_at: T(7) };
  eq('R-05', 'correction with a source-stated reason (class CORRECTION, reason verbatim)', write(db, { ...c2, period: Y(2023), numeric_value: 78.0, text_value: '78.0', revision_class: 'CORRECTION', reason: 'Corrected data transmitted by national authority' }), 'REVISED');
  eq('R-05b', 'reason stored only as SOURCE_STATED', one(db, 'SELECT revision_class c, revision_reason_origin o FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser, 'Y2023', relC), { c: 'CORRECTION', o: 'SOURCE_STATED' });
  const relOld = mkRelease(db, F1.D.api, 'API_SNAPSHOT', 'updated:2026-01-01', { published: '2026-01-01', rank: 20260101000000 });
  const runOld = mkRun(db, 'EUROSTAT_HEALTH', F1.D.api, 'PRODUCTION', { release: relOld, unit: 'flow|geo=TR|old' });
  eq('R-06', 'backfill of an older release stored as BACKFILL history', write(db, { ...base, release_id: relOld, run_id: runOld, retrieved_at: T(8), period: Y(2023), numeric_value: 70.0, text_value: '70.0' }), 'BACKFILL');
  eq('R-06b', 'backfill never displaces the newer current value', one(db, 'SELECT numeric_value v, current_release_id r FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser, 'Y2023'), { v: 78.0, r: relC });
  eq('R-06c', 'backfill has no previous pointer', one(db, 'SELECT previous_release_id p, revision_class c FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser, 'Y2023', relOld), { p: null, c: 'BACKFILL' });
  // provisional -> final
  const ser2 = mkSeries(db, F1.D.api, F1.I.api, 'ISO3:DEU', { unit: 'PC_CHE', dims: { FINANCING_SCHEME: 'HF1' } });
  write(db, { ...base, series_id: ser2, release_id: relB, run_id: runB, retrieved_at: T(6), period: Y(2024), numeric_value: 50.0, text_value: '50.0', finality: 'PROVISIONAL', status_flag_native: 'p' });
  eq('R-07', 'provisional → final (same number, finality differs) is a new version', write(db, { ...base, series_id: ser2, release_id: relC, run_id: runC, retrieved_at: T(7), period: Y(2024), numeric_value: 50.0, text_value: '50.0', finality: 'FINAL' }), 'REVISED');
  eq('R-07b', 'current is FINAL', one(db, 'SELECT finality f FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser2, 'Y2024').f, 'FINAL');
  // missing -> present, present -> suppressed
  const ser3 = mkSeries(db, F1.D.api, F1.I.api, 'ISO3:TUR', { unit: 'PC_CHE', dims: { FINANCING_SCHEME: 'HF2' } });
  write(db, { ...base, series_id: ser3, release_id: relA, run_id: runId, period: Y(2021), value_state: 'MISSING', text_value: ':' });
  eq('R-08', 'missing stored as MISSING with NULL number (never 0)', one(db, 'SELECT value_state s, numeric_value n FROM statistics_observation_versions WHERE series_id=? AND period_key=?', ser3, 'Y2021'), { s: 'MISSING', n: null });
  eq('R-08b', 'missing → present in a later release', write(db, { ...base, series_id: ser3, release_id: relB, run_id: runB, retrieved_at: T(6), period: Y(2021), numeric_value: 12.5, text_value: '12.5' }), 'REVISED');
  eq('R-09', 'present → suppressed when the source legitimately revises', write(db, { ...base, series_id: ser3, release_id: relC, run_id: runC, retrieved_at: T(7), period: Y(2021), value_state: 'SUPPRESSED', text_value: 'c' }), 'REVISED');
  eq('R-09b', 'current reflects SUPPRESSED, history retains the number', [one(db, 'SELECT value_state s FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser3, 'Y2021').s, one(db, 'SELECT numeric_value n FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser3, 'Y2021', relB).n], ['SUPPRESSED', 12.5]);
  // withdrawn release
  run(db, "UPDATE statistics_releases SET status = 'WITHDRAWN' WHERE release_id = ?", relC);
  project(db, ser, 'Y2023');
  eq('R-10', 'withdrawn release is excluded; current falls back to the previous release deterministically', one(db, 'SELECT numeric_value v, current_release_id r FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser, 'Y2023'), { v: 77.9, r: relB });
  fails('R-10b', 'new observations into a withdrawn release are refused', () => write(db, { ...c2, period: Y(2019), numeric_value: 1, text_value: '1' }), 'STAT_OBSERVATION_INTO_WITHDRAWN_RELEASE');
  eq('R-10c', 'withdrawn release history is retained', one(db, 'SELECT COUNT(*) c FROM statistics_observation_versions WHERE release_id = ?', relC).c, 3);
  run(db, "UPDATE statistics_releases SET status = 'CURRENT' WHERE release_id = ?", relC);
  project(db, ser, 'Y2023');
  // conflicts and negative integrity
  section.current = 'negative-integrity';
  fails('R-11', 'same-release conflicting write fails (immutable history)', () => write(db, { ...base, period: Y(2023), numeric_value: 99.9, text_value: '99.9' }), 'STAT_OBSERVATION_VERSION_IMMUTABLE');
  fails('R-12a', 'orphan provenance: unknown run_id rejected', () => write(db, { ...base, run_id: 'run_' + 'Z'.repeat(26), period: Y(2010), numeric_value: 1, text_value: '1' }), ['FOREIGN KEY', 'STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH']);
  fails('R-12b', 'orphan provenance: missing run_id rejected (NOT NULL)', () => write(db, { ...base, run_id: null, period: Y(2011), numeric_value: 1, text_value: '1' }), ['NOT NULL', 'STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH']);
  fails('R-12c', 'orphan provenance: empty source locator rejected', () => write(db, { ...base, locator: '', period: Y(2012), numeric_value: 1, text_value: '1' }), 'CHECK constraint');
  fails('R-12d', 'FILE provenance without artifact rejected', () => write(db, { ...base, kind: 'FILE', method: 'SPREADSHEET_CELL', period: Y(2013), numeric_value: 1, text_value: '1' }), 'CHECK constraint');
  fails('R-13', 'duplicate canonical series identity rejected', () => mkSeries(db, F1.D.api, F1.I.api, 'ISO3:TUR', { unit: 'PC_CHE', dims: { FINANCING_SCHEME: 'HF1' } }), 'UNIQUE constraint');
  fails('R-14', 'extension-dimension collision (same key twice on a series) rejected', () => run(db, `INSERT INTO statistics_series_dimensions (series_id, dimension_key, source_value_code) VALUES (?, 'FINANCING_SCHEME', 'HF9')`, ser), 'UNIQUE constraint');
  fails('N-01', 'update of an observation value rejected', () => run(db, 'UPDATE statistics_observation_versions SET numeric_value = 1 WHERE series_id = ?', ser), 'STAT_OBSERVATION_VERSION_IMMUTABLE');
  fails('N-02', 'delete of a production observation version rejected', () => run(db, 'DELETE FROM statistics_observation_versions WHERE series_id = ?', ser), 'STAT_OBSERVATION_VERSION_NO_DELETE');
  fails('N-03', 'delete of a release rejected', () => run(db, 'DELETE FROM statistics_releases WHERE release_id = ?', relA), 'STAT_NO_DELETE_WITHDRAW_INSTEAD');
  fails('N-04', 'delete of a source rejected (retire instead)', () => run(db, "DELETE FROM statistics_sources WHERE source_id = 'EUROSTAT_HEALTH'"), 'STAT_NO_DELETE_RETIRE_INSTEAD');
  fails('N-05', 'zero masquerading: numeric value on a MISSING state rejected', () => write(db, { ...base, series_id: ser3, release_id: relOld, run_id: runOld, period: Y(2005), value_state: 'MISSING', numeric_value: 0 }), 'CHECK constraint');
  fails('N-06', 'PRESENT without any value representation rejected', () => write(db, { ...base, period: Y(2006) }), 'CHECK constraint');
  fails('N-07', 'period key inconsistent with granularity rejected', () => write(db, { ...base, period: { key: 'Y20', gran: 'YEAR', start: '2020-01-01', end: '2020-12-31', native: '20' }, numeric_value: 1 }), 'CHECK constraint');
  fails('N-08', 'revision class SOURCE_REVISION without a previous release rejected', () => run(db, INS_V, ser, 'Y2001', relA, 'YEAR', '2001-01-01', '2001-12-31', '2001', 'PRESENT', 1, '1', null, null, null, null, 'FINAL', 'SOURCE_REVISION', null, 'NOT_STATED', null, sha('x'), runId, 'API', 'loc', 'NATIVE_STRUCTURED', null, T(3), T(3), 'VALID'), 'CHECK constraint');
  fails('N-09', 'revision reason without SOURCE_STATED origin rejected (no inferred reasons)', () => run(db, INS_V, ser, 'Y2002', relA, 'YEAR', '2002-01-01', '2002-12-31', '2002', 'PRESENT', 1, '1', null, null, null, null, 'FINAL', 'NEW_RELEASE', null, 'NOT_STATED', 'inferred reason', sha('y'), runId, 'API', 'loc', 'NATIVE_STRUCTURED', null, T(3), T(3), 'VALID'), 'CHECK constraint');
  fails('N-10', 'release/series dataset mismatch rejected', () => { const who = mkRelease(db, F1.D.who, 'API_SNAPSHOT', 'k1', { rank: 5 }); write(db, { ...base, release_id: who, period: Y(2003), numeric_value: 1, text_value: '1' }); }, 'STAT_OBSERVATION_RELEASE_SERIES_RUN_MISMATCH');
  fails('N-11', 'series with an indicator from another dataset rejected', () => mkSeries(db, F1.D.api, F1.I.who, 'ISO3:TUR', { key: `v1|${F1.D.api}|bad|x` }), 'STAT_SERIES_INDICATOR_DATASET_MISMATCH');
  fails('N-12', 'series key must start with its dataset id', () => mkSeries(db, F1.D.api, F1.I.api, 'ISO3:DEU', { key: 'v1|OTHER:DATASET|x|y|z', unit: 'Q' }), 'CHECK constraint');
  fails('N-13', 'series identity columns are immutable', () => run(db, "UPDATE statistics_series SET geography_id = 'ISO3:DEU' WHERE series_id = ?", ser), 'STAT_SERIES_IDENTITY_IMMUTABLE');
  fails('N-14', 'dataset id must equal source_id:native id', () => run(db, `INSERT INTO statistics_datasets (dataset_id, source_id, source_native_dataset_id, display_name, dataset_type, reader_class, access_class, release_model, reference_period_model, bounded_query_capability, architecture_readiness) VALUES ('X:Y','EUROSTAT_HEALTH','Z','n','OTHER','REST_READER','DOCUMENTED_API','API_SNAPSHOT','YEAR','YES','DESIGN_ONLY')`), 'CHECK constraint');
  fails('N-15', 'source_area outside the two top-level areas rejected', () => run(db, `INSERT INTO statistics_sources (source_id, display_name, organization, source_area, disposition, authority_level, upstream_role, architecture_status, registry_version) VALUES ('BAD_SRC','b','o','MIXED','PRIMARY_CANONICAL','x','PRIMARY_PRODUCER','DESIGN_ONLY','V1')`), 'CHECK constraint');
  fails('N-16', 'self lineage edge rejected', () => run(db, `INSERT INTO statistics_lineage_edges (edge_id, edge_type, from_source_id, to_source_id, from_ref, to_ref, evidence_status) VALUES (?, 'MIRROR_OF','WHO_HEALTH_STATISTICS','WHO_HEALTH_STATISTICS','WHO_HEALTH_STATISTICS','WHO_HEALTH_STATISTICS','VERIFIED')`, ids.lin('MIRROR_OF', 'W', 'W')), 'CHECK constraint');
  fails('N-17', 'validation event with inconsistent target rejected', () => run(db, `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, release_id, series_id, detail_summary) VALUES (?, 'STRUCTURAL','VALID','RELEASE', ?, ?, 'x')`, ids.event(), relA, ser), 'CHECK constraint');
  fails('N-18', 'CROSS_SOURCE_QA cannot carry a quarantining verdict (no truth voting)', () => run(db, `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, series_id, compared_series_id, detail_summary) VALUES (?, 'CROSS_SOURCE_QA','QUARANTINED','SERIES', ?, ?, 'x')`, ids.event(), ser, ser2), 'CHECK constraint');
  fails('N-19', 'validation events are append-only', () => { const id = ids.event(); run(db, `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, release_id, detail_summary) VALUES (?, 'STRUCTURAL','VALID','RELEASE', ?, 'ok')`, id, relA); run(db, "UPDATE statistics_validation_events SET status = 'SUSPECT' WHERE event_id = ?", id); }, 'STAT_VALIDATION_EVENT_APPEND_ONLY');
  fails('N-20', 'release_id format enforced', () => run(db, `INSERT INTO statistics_releases (release_id, dataset_id, release_kind, release_key, retrieved_first_at, release_rank, release_fingerprint) VALUES ('bad', ?, 'EDITION','k', ?, 1, ?)`, F1.D.api, T(1), sha('k')), 'CHECK constraint');
  // quarantine via validation event
  const before = one(db, 'SELECT quality_state q FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser2, 'Y2024', relC).q;
  run(db, `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, series_id, period_key, obs_release_id, detail_summary) VALUES (?, 'SEMANTIC','QUARANTINED','OBSERVATION_VERSION', ?, 'Y2024', ?, 'implausible jump')`, ids.event(), ser2, relC);
  project(db, ser2, 'Y2024');
  eq('V-01', 'validation event drives quality_state; quarantined version is excluded from current', [before, one(db, 'SELECT quality_state q FROM statistics_observation_versions WHERE series_id=? AND period_key=? AND release_id=?', ser2, 'Y2024', relC).q, one(db, 'SELECT current_release_id r FROM statistics_current_observations WHERE series_id=? AND period_key=?', ser2, 'Y2024').r], ['VALID', 'QUARANTINED', relB]);
  // rebuild
  const snap = q(flow1, 'SELECT series_id, period_key, current_release_id, numeric_value, value_state, finality, revision_count FROM statistics_current_observations ORDER BY 1,2');
  rebuild(flow1);
  const snap2 = q(flow1, 'SELECT series_id, period_key, current_release_id, numeric_value, value_state, finality, revision_count FROM statistics_current_observations ORDER BY 1,2');
  eq('P-01', 'current projection fully rebuilt from immutable history equals the incrementally maintained projection (core columns)', snap2, snap);
  fails('P-02', 'projection row cannot reference a version of another series/period (composite FK)', () => run(flow1, `UPDATE statistics_current_observations SET current_release_id = ? WHERE series_id = ? AND period_key = 'Y2023'`, relOld.replace(/.$/, '0'), ser), 'FOREIGN KEY');
}

// ================= 3. Flow 2: release file (SGK) =================
section.current = 'flow2-file';
{
  const db = open(); const F = bootstrap(db);
  activate(db, 'SGK_HEALTH_STATISTICS');
  const sha1 = sha('sgk-2024-zip-v1'), sha2 = sha('sgk-2024-zip-v2');
  const rel1 = mkRelease(db, F.D.sgk, 'FILE_VERSION', sha1, { published: '2025-12-01', rank: 20251201000000, url: 'https://www.sgk.gov.tr/download/downloadfile?f=c3ebc2d5' });
  const run1 = mkRun(db, 'SGK_HEALTH_STATISTICS', F.D.sgk, 'PRODUCTION', { reader: 'BULK_FILE_READER', release: rel1, unit: '2024|zip|BLM4|TABLO-4.3-4.4' });
  const art = ids.artifact(sha1);
  ok('F2-01', 'raw artifact metadata with R2 absent (backend NONE, source URL as locator)', () => run(db, `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, filename, content_type, byte_size, local_sha256, retrieved_at, parser_version, parse_status, retention_class, extraction_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, art, rel1, 'https://www.sgk.gov.tr/x.zip', 'NONE', 'c3ebc2d5.zip', 'application/x-zip-compressed', 4434266, sha1, T(2), 'xlsx-p1', 'PARSED', 'R1_EVIDENCE', 'BLM4 TABLO-4.3-4.4 B6:D20').changes === 1);
  fails('F2-02', 'R2 backend without a locator rejected', () => run(db, `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, backend_type, local_sha256, retrieved_at, retention_class) VALUES (?,?, 'R2', ?, ?, 'R1_EVIDENCE')`, ids.artifact(sha('z')), rel1, sha('z'), T(2)), 'CHECK constraint');
  run(db, `INSERT OR IGNORE INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, local_sha256, retrieved_at, retention_class) VALUES (?,?,?, 'NONE', ?, ?, 'R1_EVIDENCE')`, art, rel1, 'https://www.sgk.gov.tr/x.zip', sha1, T(2));
  eq('F2-03', 'same checksum replay does not duplicate the artifact', one(db, 'SELECT COUNT(*) c FROM statistics_raw_artifacts WHERE release_id = ?', rel1).c, 1);
  const ser = mkSeries(db, F.D.sgk, F.I.sgk, 'ISO3:TUR', { unit: 'NB', sex: 'F', age: 'Y15-24', dims: { NACE: 'TOTAL' } });
  const b = { series_id: ser, release_id: rel1, run_id: run1, kind: 'FILE', method: 'SPREADSHEET_CELL', artifact_id: art, retrieved_at: T(2), value_state: 'PRESENT', finality: 'FINAL' };
  eq('F2-04', 'spreadsheet observation with cell locator', write(db, { ...b, period: Y(2024), numeric_value: 123456, text_value: '123456', locator: 'xlsx:BLM4!TABLO-4.3-4.4!C8' }), 'INSERTED');
  eq('F2-05', 'FILE provenance starts VALID only when extraction is deterministic (SPREADSHEET_CELL)', one(db, 'SELECT quality_state q FROM statistics_observation_versions WHERE series_id = ?', ser).q, 'VALID');
  eq('F2-06', 'same checksum, same release replay does not duplicate observations', write(db, { ...b, period: Y(2024), numeric_value: 123456, text_value: '123456', locator: 'xlsx:BLM4!TABLO-4.3-4.4!C8' }), 'REPLAY_NOOP');
  const rel2 = mkRelease(db, F.D.sgk, 'FILE_VERSION', sha2, { published: '2026-01-15', rank: 20260115000000, supersedes: rel1 });
  const run2 = mkRun(db, 'SGK_HEALTH_STATISTICS', F.D.sgk, 'PRODUCTION', { reader: 'BULK_FILE_READER', release: rel2, unit: '2024|zip2|BLM4' });
  const art2 = ids.artifact(sha2);
  run(db, `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, local_sha256, retrieved_at, retention_class) VALUES (?,?,?, 'NONE', ?, ?, 'R1_EVIDENCE')`, art2, rel2, 'https://www.sgk.gov.tr/x2.zip', sha2, T(6));
  eq('F2-07', 'corrected file (new checksum) revises the value as a new immutable version', write(db, { ...b, release_id: rel2, run_id: run2, artifact_id: art2, retrieved_at: T(6), period: Y(2024), numeric_value: 123999, text_value: '123999', locator: 'xlsx:BLM4!TABLO-4.3-4.4!C8', revision_class: 'CORRECTION' }), 'REVISED');
  eq('F2-08', 'old version remains queryable', one(db, 'SELECT numeric_value v FROM statistics_observation_versions WHERE series_id=? AND release_id=?', ser, rel1).v, 123456);
  eq('F2-09', 'release status transition (controlled mutable) SUPERSEDED/CORRECTED allowed', run(db, "UPDATE statistics_releases SET status = 'CORRECTED' WHERE release_id = ?", rel1).changes, 1);
  fails('F2-10', 'release identity immutable', () => run(db, "UPDATE statistics_releases SET release_key = 'x' WHERE release_id = ?", rel1), 'STAT_RELEASE_IDENTITY_IMMUTABLE');
  eq('F2-11', 'file-release current value and provenance chain to the artifact', one(db, `SELECT c.numeric_value v, a.local_sha256 s FROM statistics_current_observations c JOIN statistics_observation_versions o ON o.series_id=c.series_id AND o.period_key=c.period_key AND o.release_id=c.current_release_id JOIN statistics_raw_artifacts a ON a.artifact_id=o.artifact_id WHERE c.series_id=?`, ser), { v: 123999, s: sha2 });
}

// ================= 4. Flow 3: PDF =================
section.current = 'flow3-pdf';
{
  const db = open(); const F = bootstrap(db);
  activate(db, 'TR_MINISTRY_OF_HEALTH_STATISTICS');
  const sha1 = sha('moh-bulletin-2025');
  const rel = mkRelease(db, F.D.moh, 'PUBLICATION', '2025-bulletin-14', { edition: '2025', published: '2026-09-30', rank: 20260930170000, url: 'https://dosyamerkez.saglik.gov.tr/Eklenti/56342/0/haber-bulteni-2025-trpdf.pdf' });
  const rn = mkRun(db, 'TR_MINISTRY_OF_HEALTH_STATISTICS', F.D.moh, 'PRODUCTION', { reader: 'PDF_RELEASE_READER', release: rel, unit: 'edition=2025|T2.1' });
  const art = ids.artifact(sha1);
  run(db, `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, filename, content_type, byte_size, local_sha256, retrieved_at, parser_version, parse_status, retention_class) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, art, rel, 'https://dosyamerkez.saglik.gov.tr/x.pdf', 'NONE', 'haber-bulteni-2025-trpdf.pdf', 'application/pdf', 640294, sha1, T(2), 'pdf-p1', 'PARSED', 'R1_EVIDENCE');
  const ser = mkSeries(db, F.D.moh, F.I.moh, 'ISO3:TUR', { unit: 'PER_1000_LIVE_BIRTHS', est: 'ADMINISTRATIVE_COUNT', std: 'CRUDE' });
  const b = { series_id: ser, release_id: rel, run_id: rn, kind: 'PDF', method: 'PDF_TABLE_PARSE', artifact_id: art, retrieved_at: T(2), value_state: 'PRESENT', finality: 'UNKNOWN' };
  eq('F3-01', 'PDF-derived observation lands SUSPECT with page/table locator', [write(db, { ...b, period: Y(2025), numeric_value: 7.7, text_value: '7,7', locator: 'pdf:p2/Mortalite/row1' }), one(db, 'SELECT quality_state q, extraction_method m FROM statistics_observation_versions WHERE series_id = ?', ser)], ['INSERTED', { q: 'SUSPECT', m: 'PDF_TABLE_PARSE' }]);
  fails('F3-02', 'PDF-derived observation cannot be inserted as VALID (review required)', () => write(db, { ...b, period: Y(2024), numeric_value: 8.4, text_value: '8,4', locator: 'pdf:p2/Mortalite/row2', quality: 'VALID' }), 'STAT_PDF_EXPORT_OBSERVATION_MUST_START_SUSPECT');
  fails('F3-03', 'PDF provenance requires PDF_TABLE_PARSE', () => write(db, { ...b, method: 'NATIVE_STRUCTURED', period: Y(2023), numeric_value: 9, text_value: '9', locator: 'pdf:p2/x' }), 'CHECK constraint');
  eq('F3-04', 'default read excludes SUSPECT (quality filter on projection)', q(db, `SELECT 1 FROM statistics_current_observations WHERE series_id = ? AND quality_state = 'VALID'`, ser).length, 0);
  run(db, `INSERT INTO statistics_validation_events (event_id, layer, status, target_type, series_id, period_key, obs_release_id, detail_summary) VALUES (?, 'PROVENANCE','VALID','OBSERVATION_VERSION', ?, 'Y2025', ?, 'golden table check reviewed')`, ids.event(), ser, rel);
  project(db, ser, 'Y2025');
  eq('F3-05', 'review verdict promotes the version and the projection', one(db, 'SELECT quality_state q FROM statistics_current_observations WHERE series_id = ?', ser).q, 'VALID');
  const sha2 = sha('moh-bulletin-2025-rev');
  const rel2 = mkRelease(db, F.D.moh, 'PUBLICATION', '2025-bulletin-14-rev', { edition: '2025', published: '2026-10-20', rank: 20261020000000, supersedes: rel });
  const rn2 = mkRun(db, 'TR_MINISTRY_OF_HEALTH_STATISTICS', F.D.moh, 'PRODUCTION', { reader: 'PDF_RELEASE_READER', release: rel2, unit: 'edition=2025|T2.1|rev' });
  const art2 = ids.artifact(sha2);
  run(db, `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, local_sha256, retrieved_at, parser_version, parse_status, retention_class) VALUES (?,?,?, 'NONE', ?, ?, 'pdf-p1', 'PARSED', 'R1_EVIDENCE')`, art2, rel2, 'https://dosyamerkez.saglik.gov.tr/x2.pdf', sha2, T(7));
  eq('F3-06', 'revised PDF edition produces a new version, previous remains', [write(db, { ...b, release_id: rel2, run_id: rn2, artifact_id: art2, retrieved_at: T(7), period: Y(2025), numeric_value: 7.9, text_value: '7,9', locator: 'pdf:p2/Mortalite/row1' }), q(db, 'SELECT release_id FROM statistics_observation_versions WHERE series_id = ? AND period_key = ?', ser, 'Y2025').length], ['REVISED', 2]);
  eq('F3-07', 'new revised PDF version stays SUSPECT until reviewed; current follows deterministic winner rule', one(db, 'SELECT quality_state q, numeric_value v FROM statistics_current_observations WHERE series_id = ?', ser), { q: 'SUSPECT', v: 7.9 });
}

// ================= 5. Governance proofs =================
section.current = 'p5-governance';
{
  const db = open(); const F = bootstrap(db);
  eq('G-01', 'source identity present while no runtime policy exists (effective state DISABLED)', [one(db, "SELECT COUNT(*) c FROM statistics_sources WHERE source_id='WHO_HEALTH_STATISTICS'").c, one(db, "SELECT COUNT(*) c FROM statistics_source_runtime_policy").c], [1, 0]);
  fails('G-02', 'inserting a source never activates ingestion: production run refused', () => mkRun(db, 'WHO_HEALTH_STATISTICS', F.D.who), 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
  ok('G-03', 'DISABLED/ACTIVATION_GATED policy rows can be created without gates', () => { run(db, `INSERT INTO statistics_source_runtime_policy (source_id, scope_key) VALUES ('WHO_HEALTH_STATISTICS','*')`); return one(db, "SELECT runtime_state s FROM statistics_source_runtime_policy WHERE source_id='WHO_HEALTH_STATISTICS'").s === 'DISABLED'; });
  fails('G-04', 'ACTIVE without owner approval and gates is impossible (CHECK)', () => run(db, "UPDATE statistics_source_runtime_policy SET runtime_state = 'ACTIVE' WHERE source_id = 'WHO_HEALTH_STATISTICS'"), 'CHECK constraint');
  fails('G-05', 'ACTIVE with approval but unsatisfied auth gate impossible', () => run(db, `UPDATE statistics_source_runtime_policy SET runtime_state='ACTIVE', owner_activation_ref='X', owner_activated_at=?, legal_gate='PASS', rate_limit_gate='SET', canary_gate='PASSED', auth_gate='REQUIRED_MISSING' WHERE source_id='WHO_HEALTH_STATISTICS'`, T(1)), 'CHECK constraint');
  fails('G-06', 'ACTIVE with open legal gate and no recorded override impossible', () => run(db, `UPDATE statistics_source_runtime_policy SET runtime_state='ACTIVE', owner_activation_ref='X', owner_activated_at=?, legal_gate='OWNER_REVIEW_REQUIRED', rate_limit_gate='SET', canary_gate='PASSED', auth_gate='NOT_REQUIRED' WHERE source_id='WHO_HEALTH_STATISTICS'`, T(1)), 'CHECK constraint');
  fails('G-07', 'a DISCOVERY source can never be ACTIVATION_GATED/ACTIVE', () => run(db, `INSERT INTO statistics_source_runtime_policy (source_id, scope_key, runtime_state) VALUES ('WORLDOMETER','*','ACTIVATION_GATED')`), 'STAT_POLICY_DISPOSITION_NOT_INGESTIBLE');
  ok('G-08', 'canary run allowed once policy is ACTIVATION_GATED (owner-triggered canary)', () => { run(db, "UPDATE statistics_source_runtime_policy SET runtime_state='ACTIVATION_GATED', policy_change_reason='owner approves canary', changed_by='owner-test' WHERE source_id='WHO_HEALTH_STATISTICS'"); mkRun(db, 'WHO_HEALTH_STATISTICS', F.D.who, 'CANARY'); return true; });
  fails('G-09', 'production run still refused in ACTIVATION_GATED', () => mkRun(db, 'WHO_HEALTH_STATISTICS', F.D.who, 'PRODUCTION', { unit: 'other' }), 'STAT_RUN_REQUIRES_ACTIVE_POLICY');
  run(db, "UPDATE statistics_source_runtime_policy SET runtime_state='PAUSED' WHERE source_id='WHO_HEALTH_STATISTICS'");
  fails('G-10', 'PAUSED blocks canary and production runs', () => mkRun(db, 'WHO_HEALTH_STATISTICS', F.D.who, 'CANARY', { unit: 'p' }), 'STAT_RUN_REQUIRES_CANARY_POLICY');
  run(db, "UPDATE statistics_source_runtime_policy SET runtime_state='RETIRED' WHERE source_id='WHO_HEALTH_STATISTICS'");
  fails('G-11', 'RETIRED is final', () => run(db, "UPDATE statistics_source_runtime_policy SET runtime_state='PAUSED' WHERE source_id='WHO_HEALTH_STATISTICS'"), 'STAT_POLICY_RETIRED_IS_FINAL');
  fails('G-12', 'policy identity immutable', () => run(db, "UPDATE statistics_source_runtime_policy SET source_id='EUROSTAT_HEALTH' WHERE source_id='WHO_HEALTH_STATISTICS'"), 'STAT_POLICY_IDENTITY_IMMUTABLE');
  fails('G-13', 'secret reference must be a NAME (no value-like content)', () => run(db, `INSERT INTO statistics_source_runtime_policy (source_id, scope_key, auth_secret_name) VALUES ('EUROSTAT_HEALTH','*','abc=secret value')`), 'CHECK constraint');
  // mappings
  const ind = F.I.who;
  fails('G-14', 'EXACT mapping without a named human review rejected', () => run(db, `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin) VALUES (?, 'LIFE_EXPECTANCY_AT_BIRTH', 1, 'EXACT', 'MANUAL_REVIEW')`, ind), 'CHECK constraint');
  fails('G-15', 'an automated PROPOSAL can only be REVIEW_REQUIRED', () => run(db, `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin, reviewed_by, reviewed_at) VALUES (?, 'LIFE_EXPECTANCY_AT_BIRTH', 1, 'EXACT', 'PROPOSAL', 'bot', ?)`, ind, T(1)), 'CHECK constraint');
  fails('G-16', 'EXACT mapping onto an unapproved (PROPOSED) concept rejected', () => run(db, `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin, reviewed_by, reviewed_at) VALUES (?, 'INFANT_MORTALITY_RATE', 1, 'EXACT', 'MANUAL_REVIEW', 'owner', ?)`, F.I.moh, T(1)), 'STAT_MAPPING_CONCEPT_NOT_APPROVED');
  ok('G-17', 'reviewed EXACT mapping to an approved concept accepted', () => run(db, `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin, reviewed_by, reviewed_at, evidence_ref) VALUES (?, 'LIFE_EXPECTANCY_AT_BIRTH', 1, 'EXACT', 'MANUAL_REVIEW', 'owner', ?, 'review-1')`, ind, T(1)).changes === 1);
  ok('G-18', 'REVIEW_REQUIRED proposal accepted without review', () => run(db, `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin) VALUES (?, 'LIFE_EXPECTANCY_AT_BIRTH', 1, 'REVIEW_REQUIRED', 'PROPOSAL')`, F.I.owid).changes === 1);
  fails('G-19', 'mappings are append-only (no in-place edit)', () => run(db, "UPDATE statistics_indicator_mappings SET state='NON_EQUIVALENT' WHERE indicator_id = ?", ind), 'STAT_MAPPING_APPEND_ONLY');
  eq('G-20', 'mapping state view reports UNMAPPED / EXACT / REVIEW_REQUIRED (no label-based merge)', Object.fromEntries(q(db, 'SELECT indicator_id, mapping_state FROM statistics_indicator_mapping_state_v ORDER BY indicator_id').map((r) => [r.indicator_id.split('#')[0].split(':')[1], r.mapping_state]).sort((a, b) => (a[0] < b[0] ? -1 : 1))), { HLTH_SHA11_HF: 'UNMAPPED', SIY_BULLETIN: 'UNMAPPED', WHOSIS_000001: 'EXACT', YILLIK_BLM_4: 'UNMAPPED', 'life-expectancy': 'REVIEW_REQUIRED' });
  // outbox
  const rel = mkRelease(db, F.D.api ?? F.D.who, 'API_SNAPSHOT', 'ev1', { rank: 9 });
  const dedupe = sha('NEW_RELEASE|ec.europa.eu/x|' + rel);
  const evId = ids.sev(dedupe);
  ok('G-21', 'release event queued PENDING (un-emitted by default)', () => run(db, `INSERT INTO statistics_release_events (event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary) VALUES (?,?,?,?,?, 'NEW_RELEASE', 'https://example.org/bulletin', 'example.org/bulletin', '{"facts":[]}')`, evId, dedupe, 'WHO_HEALTH_STATISTICS', F.D.who, rel).changes === 1);
  fails('G-22', 'event dedupe is deterministic (same key rejected)', () => run(db, `INSERT INTO statistics_release_events (event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary) VALUES (?,?,?,?,?, 'NEW_RELEASE', 'https://example.org/bulletin', 'example.org/bulletin', '{}')`, ids.sev(sha('other')), dedupe, 'WHO_HEALTH_STATISTICS', F.D.who, rel), 'UNIQUE constraint');
  fails('G-23', 'EMITTED requires prior ELIGIBLE', () => run(db, "UPDATE statistics_release_events SET eligibility_state='EMITTED', emitted_at=?, emitted_ref='r1' WHERE event_id=?", T(2), evId), 'STAT_EVENT_EMIT_NOT_GOVERNED');
  run(db, "UPDATE statistics_release_events SET eligibility_state='ELIGIBLE', eligibility_reason='policy' WHERE event_id=?", evId);
  fails('G-24', 'ELIGIBLE event cannot be emitted while the source runtime state is not ACTIVE', () => run(db, "UPDATE statistics_release_events SET eligibility_state='EMITTED', emitted_at=?, emitted_ref='r1' WHERE event_id=?", T(2), evId), 'STAT_EVENT_EMIT_NOT_GOVERNED');
  fails('G-25', 'http (non-https) official URL rejected', () => run(db, `INSERT INTO statistics_release_events (event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary) VALUES (?,?,?,?,?, 'NEW_RELEASE', 'http://x.org/b', 'x.org/b', '{}')`, ids.sev(sha('h')), sha('h'), 'WHO_HEALTH_STATISTICS', F.D.who, rel), 'CHECK constraint');
  fails('G-26', 'payload must be bounded valid JSON', () => run(db, `INSERT INTO statistics_release_events (event_id, dedupe_key, source_id, dataset_id, release_id, event_type, official_url, canonical_url_key, payload_summary) VALUES (?,?,?,?,?, 'NEW_RELEASE', 'https://x.org/b', 'x.org/b', 'not json')`, ids.sev(sha('j')), sha('j'), 'WHO_HEALTH_STATISTICS', F.D.who, rel), 'CHECK constraint');
  // lineage: OWID derived from WHO
  const lid = ids.lin('DERIVED_FROM', 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH', 'WHO_HEALTH_STATISTICS');
  ok('G-27', 'secondary lineage representable (OWID DERIVED_FROM WHO)', () => run(db, `INSERT INTO statistics_lineage_edges (edge_id, edge_type, from_source_id, to_source_id, from_ref, to_ref, evidence_status, evidence_ref) VALUES (?, 'DERIVED_FROM','OUR_WORLD_IN_DATA_GLOBAL_HEALTH','WHO_HEALTH_STATISTICS','OUR_WORLD_IN_DATA_GLOBAL_HEALTH','WHO_HEALTH_STATISTICS','VERIFIED','metadata.json')`, lid).changes === 1);
  eq('G-28', 'independence query: OWID has an upstream path to WHO', q(db, "SELECT to_ref FROM statistics_lineage_edges WHERE from_ref = 'OUR_WORLD_IN_DATA_GLOBAL_HEALTH' AND edge_type IN ('DERIVED_FROM','MIRROR_OF')").map((r) => r.to_ref), ['WHO_HEALTH_STATISTICS']);
  fails('G-29', 'duplicate lineage edge rejected', () => run(db, `INSERT INTO statistics_lineage_edges (edge_id, edge_type, from_source_id, to_source_id, from_ref, to_ref, evidence_status) VALUES (?, 'DERIVED_FROM','OUR_WORLD_IN_DATA_GLOBAL_HEALTH','WHO_HEALTH_STATISTICS','OUR_WORLD_IN_DATA_GLOBAL_HEALTH','WHO_HEALTH_STATISTICS','PARTIAL')`, ids.lin('DERIVED_FROM', 'x', 'y')), 'UNIQUE constraint');
  run(db, "INSERT INTO statistics_source_runtime_policy (source_id, scope_key, runtime_state) VALUES ('EUROSTAT_HEALTH','*','ACTIVATION_GATED')");
  fails('G-30', 'run for a dataset not belonging to the stated source rejected', () => mkRun(db, 'EUROSTAT_HEALTH', F.D.who, 'CANARY', { unit: 'mm' }), 'STAT_RUN_DATASET_SOURCE_MISMATCH');
}

// ================= 6. Canary release purge rule =================
section.current = 'canary';
{
  const db = open(); const F = bootstrap(db);
  run(db, `INSERT INTO statistics_source_runtime_policy (source_id, scope_key, runtime_state) VALUES ('EUROSTAT_HEALTH','*','ACTIVATION_GATED')`);
  const rel = mkRelease(db, F.D.api, 'API_SNAPSHOT', 'canary-1', { cls: 'CANARY', rank: 3 });
  const rn = mkRun(db, 'EUROSTAT_HEALTH', F.D.api, 'CANARY', { release: rel });
  const ser = mkSeries(db, F.D.api, F.I.api, 'ISO3:TUR', { unit: 'X' });
  write(db, { series_id: ser, release_id: rel, run_id: rn, locator: 'sdmx:x', retrieved_at: T(2), value_state: 'PRESENT', period: Y(2023), numeric_value: 1, text_value: '1' });
  eq('C-01', 'canary release data is never projected to current', one(db, 'SELECT COUNT(*) c FROM statistics_current_observations').c, 0);
  eq('C-02', 'canary observation versions are deletable (purge) while the release row stays', [run(db, 'DELETE FROM statistics_observation_versions WHERE release_id = ?', rel).changes, one(db, 'SELECT COUNT(*) c FROM statistics_releases WHERE release_id = ?', rel).c], [1, 1]);
}

// ================= 7. Query plans (scale-sensitive paths) =================
section.current = 'query-plans';
const plans = [];
{
  const db = open(); const F = bootstrap(db);
  activate(db, 'EUROSTAT_HEALTH');
  const rel = mkRelease(db, F.D.api, 'API_SNAPSHOT', 'bulk', { rank: 100 });
  const rn = mkRun(db, 'EUROSTAT_HEALTH', F.D.api, 'PRODUCTION', { release: rel });
  const sample = {};
  db.exec('BEGIN');
  for (let i = 0; i < 300; i++) { run(db, `INSERT OR IGNORE INTO statistics_geographies (geography_id, scheme, code, label_en, kind) VALUES (?,?,?,?, 'COUNTRY')`, `SOURCE_NATIVE:G${i}`, 'SOURCE_NATIVE', `G${i}`, `G${i}`); }
  for (let i = 0; i < 40; i++) run(db, `INSERT INTO statistics_indicators (indicator_id, dataset_id, source_native_indicator_id, label) VALUES (?,?,?,?)`, `${F.D.api}#IND${i}`, F.D.api, `IND${i}`, `IND${i}`);
  for (let i = 0; i < 1500; i++) {
    const geo = `SOURCE_NATIVE:G${i % 300}`; const ind = `${F.D.api}#IND${i % 40}`;
    const sid = mkSeries(db, F.D.api, ind, geo, { sex: i % 2 ? 'F' : 'M', dims: { CAUSE: `C${i % 7}` } });
    if (i === 10) sample.series = sid;
    for (let y = 2000; y < 2024; y++) write(db, { series_id: sid, release_id: rel, run_id: rn, locator: `k${i}@${y}`, retrieved_at: T(2), value_state: 'PRESENT', period: Y(y), numeric_value: i + y / 10, text_value: String(i + y / 10) });
  }
  for (let i = 0; i < 400; i++) mkRelease(db, F.D.api, 'API_SNAPSHOT', `hist-${i}`, { rank: 200 + i, published: `2025-01-${String(1 + (i % 28)).padStart(2, '0')}` });
  for (let i = 0; i < 800; i++) { const r = mkRun(db, 'EUROSTAT_HEALTH', F.D.api, 'PRODUCTION', { unit: `hist-unit-${i}` }); finish(db, r); }
  db.exec('COMMIT');
  db.exec('ANALYZE');
  const counts = { series: one(db, 'SELECT COUNT(*) c FROM statistics_series').c, versions: one(db, 'SELECT COUNT(*) c FROM statistics_observation_versions').c, current: one(db, 'SELECT COUNT(*) c FROM statistics_current_observations').c };
  record('Q-00', 'plan fixture size', 'informational', true, JSON.stringify(counts));
  const small = ['statistics_sources', 'statistics_datasets', 'statistics_source_runtime_policy', 'statistics_concepts', 'statistics_geographies'];
  const Qs = [
    ['Q-01', 'latest observation by series', 'SELECT * FROM statistics_current_observations WHERE series_id = ? ORDER BY period_start DESC LIMIT 1', [sample.series]],
    ['Q-02', 'historical series (period range)', 'SELECT * FROM statistics_current_observations WHERE series_id = ? AND period_start >= ? ORDER BY period_start', [sample.series, '2010-01-01']],
    ['Q-03', 'indicator + geography → series', 'SELECT series_id FROM statistics_series WHERE indicator_id = ? AND geography_id = ?', [`${F.D.api}#IND3`, 'SOURCE_NATIVE:G3']],
    ['Q-04', 'geography → series (Türkiye-only subject query)', 'SELECT series_id FROM statistics_series WHERE geography_id = ?', ['SOURCE_NATIVE:G3']],
    ['Q-05', 'revision history for one series+period', 'SELECT * FROM statistics_observation_versions WHERE series_id = ? AND period_key = ?', [sample.series, 'Y2020']],
    ['Q-06', 'release → changed observations', 'SELECT series_id, period_key FROM statistics_observation_versions WHERE release_id = ? LIMIT 100', [rel]],
    ['Q-07', 'provenance trace (version → release/run)', 'SELECT v.source_locator, r.source_url, u.reader_version FROM statistics_observation_versions v CROSS JOIN statistics_releases r ON r.release_id = v.release_id CROSS JOIN statistics_ingestion_runs u ON u.run_id = v.run_id WHERE v.series_id = ? AND v.period_key = ? AND v.release_id = ?', [sample.series, 'Y2020', rel]],
    ['Q-08', 'latest run for a source', 'SELECT * FROM statistics_ingestion_runs WHERE source_id = ? ORDER BY planned_at DESC LIMIT 1', ['EUROSTAT_HEALTH']],
    ['Q-09', 'dataset → latest release', 'SELECT * FROM statistics_releases WHERE dataset_id = ? ORDER BY release_rank DESC LIMIT 1', [F.D.api]],
    ['Q-10', 'release feed', "SELECT * FROM statistics_releases WHERE release_class = 'PRODUCTION' ORDER BY published_at DESC LIMIT 20", []],
    ['Q-11', 'extension-dimension filter', "SELECT series_id FROM statistics_series_dimensions WHERE dimension_key = 'CAUSE' AND source_value_code = ?", ['C3']],
    ['Q-12', 'quality lookup (non-VALID)', "SELECT * FROM statistics_observation_versions WHERE quality_state <> 'VALID' ORDER BY created_at LIMIT 50", []],
    ['Q-13', 'run → checkpoint', 'SELECT * FROM statistics_checkpoints WHERE last_run_id = ?', [rn]],
    ['Q-14', 'checkpoint by dataset+scope', 'SELECT * FROM statistics_checkpoints WHERE dataset_id = ? AND scope_key = ?', [F.D.api, 'x']],
    ['Q-15', 'release outbox (eligible)', "SELECT * FROM statistics_release_events WHERE eligibility_state = 'ELIGIBLE' ORDER BY created_at LIMIT 20", []],
    ['Q-16', 'validation events for a version', 'SELECT * FROM statistics_validation_events WHERE series_id = ? AND period_key = ?', [sample.series, 'Y2020']],
    ['Q-17', 'planner: due sources', "SELECT * FROM statistics_source_runtime_policy WHERE runtime_state IN ('ACTIVE','ACTIVATION_GATED') AND next_due_at <= ?", ['2030-01-01T00:00:00.000Z']],
    ['Q-18', 'source → datasets', 'SELECT * FROM statistics_datasets WHERE source_id = ?', ['EUROSTAT_HEALTH']],
    ['Q-19', 'recent material revisions', "SELECT series_id, period_key FROM statistics_observation_versions WHERE revision_class NOT IN ('NEW_RELEASE','BACKFILL') ORDER BY created_at DESC LIMIT 50", []],
  ];
  for (const [id, name, sql, params] of Qs) {
    const rows = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map((r) => r.detail);
    const scans = rows.filter((d) => /^SCAN /.test(d) && !/USING (COVERING )?INDEX/.test(d));
    const bigScan = scans.filter((d) => !small.some((t) => d.includes(t))); // anything not an explicitly small lookup table (aliases included) counts as scale-sensitive
    plans.push({ id, name, plan: rows, scale_sensitive_full_scan: bigScan.length > 0, small_table_scans: scans.filter((d) => !bigScan.includes(d)) });
    record(id, `query plan: ${name}`, 'no full scan of a scale-sensitive table', bigScan.length === 0, rows.join(' ; '));
  }
}

// ================= output =================
const failed = results.filter((r) => !r.passed);
const bySection = {};
for (const r of results) { bySection[r.section] ??= { total: 0, passed: 0 }; bySection[r.section].total++; if (r.passed) bySection[r.section].passed++; }
const summary = { total: results.length, passed: results.length - failed.length, failed: failed.length, bySection };
console.log(JSON.stringify(summary));
if (failed.length) { for (const f of failed) console.log(`FAIL ${f.id} ${f.name} :: expected ${f.expected} :: ${f.detail}`); }
if (process.argv.includes('--write')) {
  writeFileSync(OUT_PATH, JSON.stringify({ phase: 'DESIGN_AND_FREEZE_HEALTH_STATISTICS_SCHEMA', as_of: '2026-10-05', engine: 'node:sqlite (SQLite ' + one(open(), 'select sqlite_version() v').v + ') in-memory, foreign_keys=ON', ddl: DDL_PATH, ddl_sha256: sha(ddl), summary, schema: results.meta, query_plans: plans, results }, null, 2) + '\n');
}
process.exit(failed.length ? 1 : 0);
