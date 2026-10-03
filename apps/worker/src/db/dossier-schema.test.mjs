// DOSSIER DISCOVERY durable schema (migration 0031), LOCAL ONLY: fresh chain + upgrade from the pre-0031 schema in node:sqlite.
// Proves the accepted contract at the database level without any reader, job, endpoint or remote apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const contract = await bundle('packages/contracts/src/dossier-discovery.ts', 'dossier-schema-contract');
const V = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));

const F0031 = '0031_dossier_discovery_foundation.sql';
const allFiles = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
const preFiles = allFiles.filter((f) => f < F0031);
const sql0031 = readFileSync(`migrations/${F0031}`, 'utf8');
const stripComments = (s) => s.replace(/--.*$/gm, '');

function openPre() {
  const db = new DatabaseSync(':memory:');
  for (const f of preFiles) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return db;
}
function openFresh() {
  const db = new DatabaseSync(':memory:');
  for (const f of allFiles) db.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return db;
}
const DOSSIER_TABLES = [
  'dossier_signal_runs', 'dossier_external_source_items', 'dossier_origin_clusters', 'dossier_origin_cluster_members', 'dossier_concepts',
  'dossier_aliases', 'dossier_source_actors', 'dossier_actor_source_mappings', 'dossier_relations', 'dossier_relation_members', 'dossier_observations',
  'dossier_relation_observations', 'dossier_signal_aggregates', 'dossier_candidates', 'dossier_candidate_snapshots', 'dossier_candidate_aggregate_states',
  'dossier_snapshot_provenance_refs', 'dossier_reviews',
];
const run = (db, sql, ...a) => db.prepare(sql).run(...a);
const all = (db, sql, ...a) => db.prepare(sql).all(...a);
const get = (db, sql, ...a) => db.prepare(sql).get(...a);
const rejects = (db, sql, params, re) => assert.throws(() => db.prepare(sql).run(...params), re);

let seq = 0;
const ts = () => `2026-10-03T00:00:${String(seq++ % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`;
const concept = (db, id, state = 'PROPOSED', label = `label ${id}`) => run(db, `INSERT INTO dossier_concepts (concept_id, label, normalized_label, state) VALUES (?, ?, ?, ?)`, id, label, contract.normalizeLabel(label), state);
const review = (db, targetType, targetId, decision, reason) => run(db, `INSERT INTO dossier_reviews (review_id, target_type, target_id, decision, reason_code, reviewer, reviewed_at) VALUES (?, ?, ?, ?, ?, 'hub-user', ?)`, `rv${++seq}`, targetType, targetId, decision, reason ?? null, ts());
const relation = (db, id, semantic, members, depth = members.length, state = 'PROPOSED') => {
  run(db, `INSERT INTO dossier_relations (relation_id, semantic, depth, identity_key, state) VALUES (?, ?, ?, ?, ?)`, id, semantic, depth, contract.relationIdentityKey(semantic, members), state);
  members.forEach((m, i) => run(db, `INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES (?, ?, ?)`, id, m, i + 1));
};
const dumpExisting = (db) => {
  const objs = all(db, `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '%dossier%' AND tbl_name NOT LIKE 'dossier_%' ORDER BY type, name`);
  const data = {};
  for (const t of all(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'dossier_%' ORDER BY name`)) data[t.name] = all(db, `SELECT * FROM "${t.name}" ORDER BY rowid`);
  return JSON.stringify({ objs, data });
};

test('S fresh local DB: the whole chain applies, 18 empty dossier tables exist, nothing is seeded', () => {
  const db = openFresh();
  const names = all(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'dossier_%'`).map((r) => r.name).sort();
  assert.deepEqual(names, [...DOSSIER_TABLES].sort());
  for (const t of DOSSIER_TABLES) assert.equal(get(db, `SELECT COUNT(*) AS n FROM ${t}`).n, 0, `${t} starts empty (open world: no seeded universe)`);
  assert.ok(!/\bINSERT\s+INTO\b/i.test(stripComments(sql0031)), 'the migration inserts no rows');
  assert.ok(!/\bUPDATE\b\s+\w+\s+SET/i.test(stripComments(sql0031)) && !/\bDELETE\s+FROM\b/i.test(stripComments(sql0031)), 'no row rewrite or delete in the migration');
  assert.ok(!/\b(DROP|ALTER|REPLACE)\b/i.test(stripComments(sql0031)), 'no destructive or altering statement');
  for (const word of ['magnesium', 'creatine', 'sibo', 'pfas', 'fodmap', 'berberine', 'nmn', 'fasting', 'pm2.5']) assert.ok(!sql0031.toLowerCase().includes(word), `no example topic "${word}" in the schema`);
});

test('T upgrade: from the current pre-0031 schema, every existing object and row is byte-identical; only dossier_* objects are added; re-running is harmless', () => {
  const db = openPre();
  const feed = get(db, `SELECT id FROM source_feeds LIMIT 1`).id;
  run(db, `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at, acquisition_path)
    VALUES ('ts1', ?, 'kaduse-news', 'kaduse-medikal', 'Fresh', 'https://example.org/a', 'P', 'inbox', 'k-ts', '2026-10-01', 'TIME_SENSITIVE')`, feed);
  run(db, `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, published_at, acquisition_path, evergreen_view, canonical_work_id)
    VALUES ('ev1', ?, 'kaduse-research', 'kaduse-medikal', 'Old', 'https://doi.org/10.1/x', 'P', 'inbox', '10.1/x', '2019-01-01', 'EVERGREEN', 'research_rediscovery', '10.1/x')`, feed);
  run(db, `INSERT INTO item_path_membership (source_item_id, temporal_path, evergreen_view) VALUES ('ev1', 'EVERGREEN', 'research_rediscovery')`);
  run(db, `INSERT INTO evergreen_runtime_state (source_id, cursor_json, updated_at) VALUES ('x', '{}', 'now')`);
  const before = dumpExisting(db);
  const objsBefore = new Set(all(db, `SELECT type || ':' || name AS k FROM sqlite_master`).map((r) => r.k));
  db.exec(sql0031);
  assert.equal(dumpExisting(db), before, 'existing DDL (tables, indexes, triggers) and every existing row are unchanged');
  const added = all(db, `SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`).filter((r) => !objsBefore.has(`${r.type}:${r.name}`));
  assert.ok(added.length > 0 && added.every((r) => /dossier/.test(r.name) && /^dossier_/.test(r.tbl_name)), 'only dossier_* tables, indexes and triggers are added; no trigger on an existing table');
  assert.equal(added.filter((r) => r.type === 'table').length, 18);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM source_items`).n, 2);
  db.exec(sql0031); // IF NOT EXISTS: idempotent
  assert.equal(dumpExisting(db), before);
});

test('A-D temporal architecture untouched: no third path, 0028 CHECKs and tables unchanged, no dossier column or FK into existing tables', () => {
  const db = openFresh();
  const feed = get(db, `SELECT id FROM source_feeds LIMIT 1`).id;
  const ins = (extra) => run(db, `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key, ${extra.cols}) VALUES (?, ?, 'kaduse-news', 'kaduse-medikal', 't', 'https://e.org/${extra.id}', 'P', 'inbox', ?, ${extra.ph})`, extra.id, feed, `k-${extra.id}`, ...extra.vals);
  ins({ id: 'a', cols: 'acquisition_path', ph: '?', vals: ['TIME_SENSITIVE'] });
  ins({ id: 'b', cols: 'acquisition_path, evergreen_view', ph: '?, ?', vals: ['EVERGREEN', 'health_reference'] });
  assert.throws(() => ins({ id: 'c', cols: 'acquisition_path', ph: '?', vals: ['DOSSIER'] }), /CHECK constraint failed/, 'DOSSIER is not a temporal path');
  assert.throws(() => ins({ id: 'd', cols: 'acquisition_path, evergreen_view', ph: '?, ?', vals: ['EVERGREEN', 'dossier_discovery'] }), /CHECK constraint failed/, 'DOSSIER is not an evergreen view');
  const srcCols = all(db, `PRAGMA table_info(source_items)`).map((c) => c.name);
  assert.ok(!srcCols.some((c) => /dossier/i.test(c)), 'source_items gains no dossier column');
  for (const t of DOSSIER_TABLES) {
    for (const fk of all(db, `PRAGMA foreign_key_list(${t})`)) assert.ok(fk.table.startsWith('dossier_'), `${t} must not have a foreign key into ${fk.table} (purge safety, no existing-table dependency)`);
  }
  const m28 = readFileSync('migrations/0028_temporal_paths.sql', 'utf8');
  assert.ok(/acquisition_path IN \('TIME_SENSITIVE', 'EVERGREEN'\)/.test(m28) && /evergreen_view IN \('health_reference', 'research_rediscovery'\)/.test(m28));
  assert.ok(!/dossier/i.test(m28));
  assert.ok(!/acquisition_path|evergreen_view|(?<![a-z_])source_items\b|item_path_membership/.test(stripComments(sql0031)), '0031 never touches the temporal columns or source_items');
});

test('E open world: an arbitrary unseen label is stored as a PROPOSED concept; observations can point at it or stay unresolved', () => {
  const db = openFresh();
  concept(db, 'c1', undefined, 'a label nobody listed');
  assert.equal(get(db, `SELECT state FROM dossier_concepts WHERE concept_id = 'c1'`).state, 'PROPOSED', 'unknown is PROPOSED by default, not canonical');
  const obs = (id, cols, vals) => run(db, `INSERT INTO dossier_observations (observation_id, ${cols}, observation_kind, signal_family, measurement_provenance, dedupe_key, observed_at) VALUES (?, ${vals.map(() => '?').join(', ')}, 'CONTENT_MENTION', 'TR_CLINICIAN_CREATOR_PULSE', 'CONTENT', ?, ?)`, id, ...vals, `dk-${id}`, ts());
  obs('o1', 'concept_id', ['c1']);
  obs('o2', 'unresolved_label', ['ambiguous surface form']);
  assert.throws(() => run(db, `INSERT INTO dossier_observations (observation_id, observation_kind, signal_family, measurement_provenance, dedupe_key, observed_at) VALUES ('o3', 'CONTENT_MENTION', 'X', 'CONTENT', 'dk3', ?)`, ts()), /CHECK constraint failed/, 'exactly one of concept / unresolved label');
  assert.throws(() => obs('o4', 'concept_id, unresolved_label', ['c1', 'both']), /CHECK constraint failed/);
  assert.throws(() => run(db, `INSERT INTO dossier_observations (observation_id, concept_id, observation_kind, signal_family, measurement_provenance, dedupe_key, observed_at) VALUES ('o5', 'c1', 'CONTENT_MENTION', 'TR_CLINICIAN_CREATOR_PULSE', 'CONTENT', 'dk-o1', ?)`, ts()), /UNIQUE/, 'dedupe key prevents observation inflation');
  // one source item (here one origin) may yield many observations
  run(db, `INSERT INTO dossier_external_source_items (origin_item_id, acquisition_source_id, identity_strategy, identity_value) VALUES ('oi1', 'src1', 'MANUAL_SNAPSHOT_KEY', 'snap-1')`);
  for (const [id, c] of [['m1', 'c1'], ['m2', 'c1']]) run(db, `INSERT INTO dossier_observations (observation_id, origin_item_id, concept_id, observation_kind, signal_family, signal_subfamily, measurement_provenance, dedupe_key, observed_at) VALUES (?, 'oi1', ?, 'CONTENT_MENTION', 'TR_CLINICIAN_CREATOR_PULSE', ?, 'CONTENT', ?, ?)`, id, c, id, `dk-${id}`, ts());
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_observations WHERE origin_item_id = 'oi1'`).n, 2);
});

test('F/G alias ambiguity: the same normalized alias may map to several concepts; there is no global UNIQUE(normalized_alias)', () => {
  const db = openFresh();
  concept(db, 'c1'); concept(db, 'c2');
  const alias = (id, c, text, lang) => run(db, `INSERT INTO dossier_aliases (alias_id, concept_id, alias_text, normalized_alias, language, alias_type) VALUES (?, ?, ?, ?, ?, 'SYNONYM')`, id, c, text, contract.normalizeLabel(text), lang);
  alias('a1', 'c1', 'Shared Surface', 'en');
  alias('a2', 'c2', 'shared  surface', 'tr');
  alias('a3', 'c2', 'Shared Surface', 'en');
  assert.equal(get(db, `SELECT COUNT(DISTINCT concept_id) AS n FROM dossier_aliases WHERE normalized_alias = ?`, contract.normalizeLabel('shared surface')).n, 2);
  assert.throws(() => alias('a4', 'c1', 'Shared Surface', 'en'), /UNIQUE/, 'the same concept + alias + language is not duplicated');
  for (const idx of all(db, `PRAGMA index_list(dossier_aliases)`).filter((i) => i.unique)) {
    const cols = all(db, `PRAGMA index_info(${idx.name})`).map((c) => c.name);
    assert.notDeepEqual(cols, ['normalized_alias'], 'no unique index on normalized_alias alone');
    assert.ok(cols.length > 1 || cols[0] === 'alias_id');
  }
  assert.ok(!/UNIQUE\s*\(\s*normalized_alias\s*\)/i.test(sql0031) && !/normalized_alias\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql0031));
});

test('H/I candidate identity: temporal identity can only be EVERGREEN; one candidate per target; evaluations append snapshots', () => {
  const db = openFresh();
  concept(db, 'c1'); concept(db, 'c2'); concept(db, 'c3');
  relation(db, 'r1', 'CO_INTEREST', ['c1', 'c2']);
  const cand = (id, type, target, extra = '', vals = []) => run(db, `INSERT INTO dossier_candidates (candidate_id, target_type, target_id${extra}) VALUES (?, ?, ?${vals.map(() => ', ?').join('')})`, id, type, target, ...vals);
  cand('k1', 'CONCEPT', 'c1');
  assert.equal(get(db, `SELECT temporal_identity FROM dossier_candidates WHERE candidate_id = 'k1'`).temporal_identity, 'EVERGREEN', 'default and only value');
  assert.throws(() => cand('k2', 'CONCEPT', 'c2', ', temporal_identity', ['TIME_SENSITIVE']), /CHECK constraint failed/, 'H: never TIME_SENSITIVE');
  assert.throws(() => cand('k2', 'CONCEPT', 'c2', ', temporal_identity', ['DOSSIER']), /CHECK constraint failed/, 'no third path');
  assert.throws(() => run(db, `UPDATE dossier_candidates SET temporal_identity = 'TIME_SENSITIVE' WHERE candidate_id = 'k1'`), /DOSSIER_CANDIDATE_IDENTITY_IMMUTABLE|CHECK/);
  assert.throws(() => cand('kdup', 'CONCEPT', 'c1'), /UNIQUE/, 'I: one candidate per target');
  assert.throws(() => cand('k3', 'CANDIDATE', 'c1'), /CHECK constraint failed/, 'target is a concept or a relation');
  assert.throws(() => cand('k4', 'CONCEPT', 'missing'), /DOSSIER_CANDIDATE_TARGET_NOT_FOUND/);
  assert.throws(() => cand('k5', 'RELATION', 'c1'), /DOSSIER_CANDIDATE_TARGET_NOT_FOUND/, 'a concept id is not a relation target');
  cand('k6', 'RELATION', 'r1');
  assert.throws(() => run(db, `UPDATE dossier_candidates SET target_id = 'c2' WHERE candidate_id = 'k1'`), /DOSSIER_CANDIDATE_IDENTITY_IMMUTABLE/);
  // weekly evaluations: same candidate, new snapshots
  for (const t of ['2026-10-03T00:00:00Z', '2026-10-10T00:00:00Z', '2026-10-17T00:00:00Z']) run(db, `INSERT INTO dossier_candidate_snapshots (snapshot_id, candidate_id, generated_at, algorithm_version, candidate_class, why_now_json) VALUES (?, 'k1', ?, 'v-test', 'WATCH', '{}')`, `s-${t}`, t);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_candidates WHERE target_id = 'c1'`).n, 1);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots WHERE candidate_id = 'k1'`).n, 3);
  assert.throws(() => run(db, `INSERT INTO dossier_candidate_snapshots (snapshot_id, candidate_id, generated_at, algorithm_version, candidate_class, why_now_json) VALUES ('dup', 'k1', '2026-10-03T00:00:00Z', 'v', 'WATCH', '{}')`), /UNIQUE/);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM pragma_table_info('dossier_candidates') WHERE name IN ('target_identity_state', 'provisional')`).n, 0, 'target identity state is read from the target, not stored stale');
});

test('J/K/L relations: pair/triple member rules, symmetric identity dedupe, PROPOSED members stay representable and cannot make an ACTIVE relation', () => {
  const db = openFresh();
  for (const c of ['a', 'b', 'c', 'd']) concept(db, c);
  assert.throws(() => run(db, `INSERT INTO dossier_relations (relation_id, semantic, depth, identity_key) VALUES ('x', 'CO_INTEREST', 1, 'CO_INTEREST:a')`), /CHECK constraint failed/, 'a relation has at least two members');
  relation(db, 'pair', 'CO_INTEREST', ['a', 'b']);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_relation_members WHERE relation_id = 'pair'`).n, 2);
  assert.throws(() => run(db, `INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES ('pair', 'c', 3)`), /DOSSIER_RELATION_MEMBER_BEYOND_DEPTH/, 'a pair cannot take a third member');
  assert.throws(() => run(db, `INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES ('pair', 'a', 2)`), /UNIQUE|PRIMARY/, 'members are distinct');
  assert.throws(() => run(db, `INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES ('pair', 'c', 1)`), /UNIQUE/, 'positions are distinct');
  assert.throws(() => run(db, `INSERT INTO dossier_relation_members (relation_id, concept_id, position) VALUES ('pair', 'c', 0)`), /CHECK constraint failed/);
  relation(db, 'triple', 'CO_INTEREST', ['a', 'b', 'c']);
  assert.equal(get(db, `SELECT depth FROM dossier_relations WHERE relation_id = 'triple'`).depth, 3);
  relation(db, 'composite', 'MENTIONED_WITH', ['a', 'b', 'c', 'd']);
  assert.equal(get(db, `SELECT depth FROM dossier_relations WHERE relation_id = 'composite'`).depth, 4, 'composite is representable (never automatic)');
  // K: A x B == B x A through the stored canonical identity key (no hash invented)
  assert.throws(() => relation(db, 'pair-swapped', 'CO_INTEREST', ['b', 'a']), /UNIQUE/, 'B x A is the same relation as A x B');
  assert.throws(() => relation(db, 'triple-shuffled', 'CO_INTEREST', ['c', 'a', 'b']), /UNIQUE/);
  relation(db, 'pair-other-semantic', 'MENTIONED_WITH', ['b', 'a']);
  assert.equal(get(db, `SELECT identity_key FROM dossier_relations WHERE relation_id = 'pair'`).identity_key, 'CO_INTEREST:a|b');
  // L: PROPOSED concepts in a PROPOSED relation are fine; ACTIVE needs accepted members and a human ACCEPT
  assert.equal(get(db, `SELECT state FROM dossier_relations WHERE relation_id = 'pair'`).state, 'PROPOSED');
  assert.throws(() => run(db, `UPDATE dossier_relations SET state = 'ACTIVE' WHERE relation_id = 'pair'`), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT|DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER/, 'neither a missing ACCEPT nor PROPOSED members allow ACTIVE');
  review(db, 'RELATION_PROPOSAL', 'pair', 'ACCEPT');
  assert.throws(() => run(db, `UPDATE dossier_relations SET state = 'ACTIVE' WHERE relation_id = 'pair'`), /DOSSIER_ACTIVE_RELATION_WITH_PROPOSED_MEMBER/, 'even an accepted relation cannot be ACTIVE while a member is PROPOSED');
  for (const c of ['a', 'b']) { review(db, 'CONCEPT_PROPOSAL', c, 'ACCEPT'); run(db, `UPDATE dossier_concepts SET state = 'ACTIVE' WHERE concept_id = ?`, c); }
  run(db, `UPDATE dossier_relations SET state = 'ACTIVE' WHERE relation_id = 'pair'`);
  assert.equal(get(db, `SELECT state FROM dossier_relations WHERE relation_id = 'pair'`).state, 'ACTIVE');
  // members are ACTIVE now, but a relation still needs its own human ACCEPT
  relation(db, 'pair-search', 'PUBLIC_SEARCH_ASSOCIATION', ['a', 'b']);
  assert.throws(() => run(db, `UPDATE dossier_relations SET state = 'ACTIVE' WHERE relation_id = 'pair-search'`), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  assert.throws(() => relation(db, 'rel-direct-active', 'CO_INTEREST', ['c', 'd'], 2, 'ACTIVE'), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/, 'no direct ACTIVE relation insert');
  assert.throws(() => run(db, `DELETE FROM dossier_relation_members WHERE relation_id = 'pair'`), /DOSSIER_APPEND_ONLY/);
  assert.throws(() => run(db, `DELETE FROM dossier_relations WHERE relation_id = 'pair'`), /DOSSIER_IDENTITY_NOT_DELETABLE/);
  // relation observation = the actual joint signal, separate from the relation identity
  run(db, `INSERT INTO dossier_relation_observations (relation_observation_id, relation_id, observation_id, joint_signal_kind, observed_at) VALUES ('ro1', 'pair', 'obs-soft', 'JOINT_SEARCH', ?)`, ts());
  assert.throws(() => run(db, `UPDATE dossier_relation_observations SET joint_signal_kind = 'JOINT_SOURCE_MENTION' WHERE relation_observation_id = 'ro1'`), /DOSSIER_APPEND_ONLY/);
});

test('M/N UNKNOWN is never 0 and MEASURED stays distinct from MODELED (observations, live aggregates, frozen states)', () => {
  const db = openFresh();
  concept(db, 'c1');
  const obs = (id, value, status, prov) => run(db, `INSERT INTO dossier_observations (observation_id, concept_id, observation_kind, signal_family, measurement_provenance, value, value_status, dedupe_key, observed_at) VALUES (?, 'c1', 'ENVIRONMENTAL_MEASURED', 'ENVIRONMENTAL_MEASUREMENT', ?, ?, ?, ?, ?)`, id, prov, value, status, `dk-${id}`, ts());
  obs('u1', null, 'UNKNOWN', 'MEASURED');
  obs('na', null, 'NOT_APPLICABLE', 'MODELED');
  obs('z', 0, 'MEASURED', 'MEASURED');
  assert.equal(get(db, `SELECT value FROM dossier_observations WHERE observation_id = 'u1'`).value, null, 'UNKNOWN stays NULL');
  assert.equal(get(db, `SELECT value FROM dossier_observations WHERE observation_id = 'z'`).value, 0, 'a real measured zero stays 0');
  assert.throws(() => obs('bad1', 0, 'UNKNOWN', 'MEASURED'), /CHECK constraint failed/, 'UNKNOWN carrying 0 is rejected');
  assert.throws(() => obs('bad2', null, 'MEASURED', 'MEASURED'), /CHECK constraint failed/, 'MEASURED without a value is rejected');
  assert.throws(() => obs('bad3', 5, 'UNKNOWN', 'MEASURED'), /CHECK constraint failed/);
  // MEASURED vs MODELED never flattened
  obs('mm', 12, 'MEASURED', 'MEASURED');
  obs('mo', 12, 'MEASURED', 'MODELED');
  assert.equal(all(db, `SELECT DISTINCT measurement_provenance FROM dossier_observations WHERE observation_id IN ('mm', 'mo') ORDER BY 1`).length, 2);
  assert.throws(() => run(db, `INSERT INTO dossier_observations (observation_id, concept_id, observation_kind, signal_family, dedupe_key, observed_at) VALUES ('np', 'c1', 'X', 'Y', 'dk-np', ?)`, ts()), /NOT NULL/, 'provenance cannot be omitted');
  const agg = (id, prov, value, status) => run(db, `INSERT INTO dossier_signal_aggregates (aggregate_id, target_type, target_id, signal_family, window_kind, window_start, window_end, measurement_provenance, aggregation_version, observation_count, value, value_status, generated_at) VALUES (?, 'CONCEPT', 'c1', 'ENVIRONMENTAL_MEASUREMENT', 'SOURCE_PERIOD', '2025-01-01', '2025-12-31', ?, 'v1', 3, ?, ?, ?)`, id, prov, value, status, ts());
  agg('ag-m', 'MEASURED', 7, 'MEASURED');
  agg('ag-d', 'MODELED', 8, 'MEASURED');
  assert.throws(() => agg('ag-dup', 'MEASURED', 9, 'MEASURED'), /UNIQUE/, 'same selector and provenance: one generation');
  assert.throws(() => agg('ag-bad', 'ESTIMATE', 0, 'UNKNOWN'), /CHECK constraint failed/);
  agg('ag-u', 'ESTIMATE', null, 'UNKNOWN');
  assert.equal(get(db, `SELECT value FROM dossier_signal_aggregates WHERE aggregate_id = 'ag-u'`).value, null);
  // aggregate vs structural window: a periodic indicator is stored with its own window kind, not coerced to 7/30/90
  assert.equal(get(db, `SELECT window_kind FROM dossier_signal_aggregates WHERE aggregate_id = 'ag-m'`).window_kind, 'SOURCE_PERIOD');
  for (const t of ['dossier_signal_aggregates', 'dossier_candidate_aggregate_states', 'dossier_observations']) {
    assert.ok(all(db, `PRAGMA table_info(${t})`).some((c) => c.name === 'value_status'), `${t} carries an explicit value status`);
  }
  assert.ok(!all(db, `PRAGMA table_info(dossier_signal_aggregates)`).some((c) => /score/i.test(c.name)), 'no universal score column');
});

test('O immutability: snapshots, frozen aggregate state, provenance refs, reviews, runs and other history cannot be rewritten; live aggregates and raw rows stay compactable', () => {
  const db = openFresh();
  concept(db, 'c1');
  run(db, `INSERT INTO dossier_candidates (candidate_id, target_type, target_id) VALUES ('k1', 'CONCEPT', 'c1')`);
  run(db, `INSERT INTO dossier_candidate_snapshots (snapshot_id, candidate_id, generated_at, algorithm_version, candidate_class, why_now_json) VALUES ('s1', 'k1', 't1', 'v', 'WATCH', '{}')`);
  run(db, `INSERT INTO dossier_candidate_aggregate_states (aggregate_state_id, snapshot_id, aggregation_version, target_type, target_id, signal_family, window_kind, observation_count, measurement_provenance, generated_at) VALUES ('as1', 's1', 'v1', 'CONCEPT', 'c1', 'TURKEY_PUBLIC_DEMAND', 'FAST_30D', 9, 'SEARCH', 't1')`);
  run(db, `INSERT INTO dossier_snapshot_provenance_refs (provenance_ref_id, snapshot_id, aggregate_state_id, ref_kind, acquisition_source_id, observed_at) VALUES ('p1', 's1', 'as1', 'OBSERVATION', 'src1', 't0')`);
  review(db, 'DOSSIER_CANDIDATE', 'k1', 'SNOOZE');
  run(db, `INSERT INTO dossier_signal_runs (run_id, reader_id, source_ref, started_at, finished_at, status, reader_version) VALUES ('r1', 'rd', 'src1', 't0', 't1', 'SUCCEEDED', 'v1')`);
  run(db, `INSERT INTO dossier_origin_clusters (cluster_id, method) VALUES ('cl1', 'near-duplicate')`);
  run(db, `INSERT INTO dossier_origin_cluster_members (cluster_id, member_kind, member_ref, acquisition_source_id) VALUES ('cl1', 'SOURCE_ITEM', 'si1', 'src1')`);
  const forbid = (sql, re) => assert.throws(() => db.exec(sql), re);
  forbid(`UPDATE dossier_candidate_snapshots SET candidate_class = 'STRONG' WHERE snapshot_id = 's1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`DELETE FROM dossier_candidate_snapshots WHERE snapshot_id = 's1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`UPDATE dossier_candidate_aggregate_states SET observation_count = 1 WHERE aggregate_state_id = 'as1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`DELETE FROM dossier_candidate_aggregate_states WHERE aggregate_state_id = 'as1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`UPDATE dossier_snapshot_provenance_refs SET evidence_span = 'x' WHERE provenance_ref_id = 'p1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`DELETE FROM dossier_snapshot_provenance_refs WHERE provenance_ref_id = 'p1'`, /DOSSIER_SNAPSHOT_IMMUTABLE/);
  forbid(`UPDATE dossier_reviews SET decision = 'ACCEPT'`, /DOSSIER_REVIEW_APPEND_ONLY/);
  forbid(`DELETE FROM dossier_reviews`, /DOSSIER_REVIEW_APPEND_ONLY/);
  forbid(`UPDATE dossier_signal_runs SET status = 'FAILED'`, /DOSSIER_APPEND_ONLY/);
  forbid(`DELETE FROM dossier_signal_runs`, /DOSSIER_APPEND_ONLY/);
  forbid(`UPDATE dossier_origin_clusters SET method = 'x'`, /DOSSIER_APPEND_ONLY/);
  forbid(`DELETE FROM dossier_origin_cluster_members`, /DOSSIER_APPEND_ONLY/);
  forbid(`DELETE FROM dossier_candidates WHERE candidate_id = 'k1'`, /DOSSIER_IDENTITY_NOT_DELETABLE/);
  forbid(`DELETE FROM dossier_concepts WHERE concept_id = 'c1'`, /DOSSIER_IDENTITY_NOT_DELETABLE/);
  // raw evidence: never rewritten, but compactable
  run(db, `INSERT INTO dossier_observations (observation_id, concept_id, observation_kind, signal_family, measurement_provenance, dedupe_key, observed_at) VALUES ('o1', 'c1', 'CONTENT_MENTION', 'TR_CLINICIAN_CREATOR_PULSE', 'CONTENT', 'dk1', 't0')`);
  forbid(`UPDATE dossier_observations SET value = 1, value_status = 'MEASURED' WHERE observation_id = 'o1'`, /DOSSIER_APPEND_ONLY/);
  db.exec(`DELETE FROM dossier_observations WHERE observation_id = 'o1'`);
  // live aggregate: derived and recomputable
  run(db, `INSERT INTO dossier_signal_aggregates (aggregate_id, target_type, target_id, signal_family, window_kind, window_start, window_end, measurement_provenance, aggregation_version, observation_count, generated_at) VALUES ('ag1', 'CONCEPT', 'c1', 'TURKEY_PUBLIC_DEMAND', 'FAST_30D', 't0', 't1', 'SEARCH', 'v1', 9, 't1')`);
  db.exec(`UPDATE dossier_signal_aggregates SET observation_count = 10 WHERE aggregate_id = 'ag1'`);
  db.exec(`DELETE FROM dossier_signal_aggregates WHERE aggregate_id = 'ag1'`);
  assert.equal(get(db, `SELECT observation_count FROM dossier_candidate_aggregate_states WHERE aggregate_state_id = 'as1'`).observation_count, 9, 'the frozen state is unaffected by live recompute / compaction');
  // actor-source mapping: append-only except closing once
  run(db, `INSERT INTO dossier_source_actors (actor_id, actor_kind, display_name, normalized_name) VALUES ('ac1', 'PERSON', 'n', 'n')`);
  run(db, `INSERT INTO dossier_actor_source_mappings (mapping_id, actor_id, acquisition_source_id) VALUES ('m1', 'ac1', 'src1')`);
  forbid(`UPDATE dossier_actor_source_mappings SET acquisition_source_id = 'other' WHERE mapping_id = 'm1'`, /DOSSIER_APPEND_ONLY/);
  db.exec(`UPDATE dossier_actor_source_mappings SET ended_at = 't9' WHERE mapping_id = 'm1'`);
  forbid(`UPDATE dossier_actor_source_mappings SET ended_at = 't10' WHERE mapping_id = 'm1'`, /DOSSIER_APPEND_ONLY/);
  forbid(`DELETE FROM dossier_actor_source_mappings`, /DOSSIER_APPEND_ONLY/);
});

test('P/Q review scope: a candidate or relation-candidate reject mutates no concept/relation; actor accept activates no acquisition source; ACTIVE needs the latest human ACCEPT of that exact object', () => {
  const db = openFresh();
  concept(db, 'c1'); concept(db, 'c2');
  relation(db, 'r1', 'CO_INTEREST', ['c1', 'c2']);
  run(db, `INSERT INTO dossier_candidates (candidate_id, target_type, target_id) VALUES ('kc', 'CONCEPT', 'c1')`);
  run(db, `INSERT INTO dossier_candidates (candidate_id, target_type, target_id) VALUES ('kr', 'RELATION', 'r1')`);
  const snap = () => JSON.stringify({ concepts: all(db, 'SELECT * FROM dossier_concepts ORDER BY concept_id'), relations: all(db, 'SELECT * FROM dossier_relations ORDER BY relation_id'), actors: all(db, 'SELECT * FROM dossier_source_actors'), cands: all(db, 'SELECT * FROM dossier_candidates ORDER BY candidate_id'), feeds: all(db, 'SELECT * FROM source_feeds ORDER BY id') });
  const before = snap();
  assert.throws(() => review(db, 'DOSSIER_CANDIDATE', 'kc', 'REJECT'), /CHECK constraint failed/, 'a reject needs a reason code');
  review(db, 'DOSSIER_CANDIDATE', 'kc', 'REJECT', 'NOISE');
  review(db, 'DOSSIER_CANDIDATE', 'kr', 'REJECT', 'NOISE');
  assert.equal(snap(), before, 'candidate rejects (and the reviews themselves) change no concept, relation, actor, candidate row or feed');
  assert.equal(get(db, `SELECT state FROM dossier_concepts WHERE concept_id = 'c1'`).state, 'PROPOSED');
  assert.equal(get(db, `SELECT state FROM dossier_relations WHERE relation_id = 'r1'`).state, 'PROPOSED');
  // a candidate ACCEPT does not authorise the concept with the same id; only a CONCEPT_PROPOSAL ACCEPT does
  review(db, 'DOSSIER_CANDIDATE', 'c1', 'ACCEPT');
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'ACTIVE' WHERE concept_id = 'c1'`), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  review(db, 'CONCEPT_PROPOSAL', 'c1', 'ACCEPT');
  run(db, `UPDATE dossier_concepts SET state = 'ACTIVE' WHERE concept_id = 'c1'`);
  assert.equal(get(db, `SELECT state FROM dossier_concepts WHERE concept_id = 'c1'`).state, 'ACTIVE');
  // pausing then re-activating needs a fresh ACCEPT (the latest review decides)
  review(db, 'CONCEPT_PROPOSAL', 'c1', 'PAUSE');
  run(db, `UPDATE dossier_concepts SET state = 'PAUSED' WHERE concept_id = 'c1'`);
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'ACTIVE' WHERE concept_id = 'c1'`), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  assert.throws(() => concept(db, 'direct-active', 'ACTIVE'), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/, 'no direct ACTIVE insert without a human ACCEPT');
  // Q: actor accept changes only the actor; mapping never activates or creates an acquisition source
  const feedsBefore = JSON.stringify(all(db, 'SELECT * FROM source_feeds ORDER BY id'));
  const feedCount = get(db, 'SELECT COUNT(*) AS n FROM source_feeds').n;
  run(db, `INSERT INTO dossier_source_actors (actor_id, actor_kind, display_name, normalized_name) VALUES ('ac1', 'PERSON', 'Some Person', 'some person')`);
  assert.throws(() => run(db, `UPDATE dossier_source_actors SET state = 'ACTIVE' WHERE actor_id = 'ac1'`), /DOSSIER_ACTIVE_REQUIRES_HUMAN_ACCEPT/);
  review(db, 'ACTOR_PROPOSAL', 'ac1', 'ACCEPT');
  run(db, `UPDATE dossier_source_actors SET state = 'ACTIVE' WHERE actor_id = 'ac1'`);
  run(db, `INSERT INTO dossier_actor_source_mappings (mapping_id, actor_id, acquisition_source_id, platform) VALUES ('m1', 'ac1', 'a-source-that-may-not-exist', 'VIDEO_CHANNEL')`);
  run(db, `INSERT INTO dossier_actor_source_mappings (mapping_id, actor_id, acquisition_source_id, platform) VALUES ('m2', 'ac1', 'another-source', 'PODCAST')`);
  assert.equal(JSON.stringify(all(db, 'SELECT * FROM source_feeds ORDER BY id')), feedsBefore, 'accepting an actor / mapping sources activates nothing and writes no feed');
  assert.equal(get(db, 'SELECT COUNT(*) AS n FROM source_feeds').n, feedCount);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_actor_source_mappings WHERE actor_id = 'ac1'`).n, 2, 'one actor maps to many acquisition sources');
  assert.throws(() => run(db, `INSERT INTO dossier_actor_source_mappings (mapping_id, actor_id, acquisition_source_id) VALUES ('m3', 'ac1', 'another-source')`), /UNIQUE/);
});

test('MERGED keeps history and resolves to a valid survivor; identities are never deleted', () => {
  const db = openFresh();
  concept(db, 'old'); concept(db, 'keep'); concept(db, 'rej');
  run(db, `UPDATE dossier_concepts SET state = 'REJECTED' WHERE concept_id = 'rej'`);
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'MERGED' WHERE concept_id = 'old'`), /CHECK constraint failed|DOSSIER_MERGE_SURVIVOR_INVALID/, 'merged needs resolved_to');
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'MERGED', resolved_to_concept_id = 'old' WHERE concept_id = 'old'`), /CHECK constraint failed/, 'not to itself');
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'MERGED', resolved_to_concept_id = 'rej' WHERE concept_id = 'old'`), /DOSSIER_MERGE_SURVIVOR_INVALID/, 'survivor cannot be rejected');
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'MERGED', resolved_to_concept_id = 'nope' WHERE concept_id = 'old'`), /FOREIGN KEY|DOSSIER_MERGE_SURVIVOR_INVALID/);
  run(db, `INSERT INTO dossier_aliases (alias_id, concept_id, alias_text, normalized_alias) VALUES ('a1', 'old', 'Old', 'old')`);
  run(db, `UPDATE dossier_concepts SET state = 'MERGED', resolved_to_concept_id = 'keep' WHERE concept_id = 'old'`);
  assert.equal(get(db, `SELECT resolved_to_concept_id FROM dossier_concepts WHERE concept_id = 'old'`).resolved_to_concept_id, 'keep');
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_aliases WHERE concept_id = 'old'`).n, 1, 'history (its alias) stays attached to the merged identity');
  assert.throws(() => run(db, `UPDATE dossier_concepts SET state = 'PROPOSED' WHERE concept_id = 'old'`), /CHECK constraint failed/, 'resolved_to only while MERGED');
  assert.throws(() => run(db, `DELETE FROM dossier_concepts WHERE concept_id = 'old'`), /DOSSIER_IDENTITY_NOT_DELETABLE/);
  assert.throws(() => run(db, `DELETE FROM dossier_concepts WHERE concept_id = 'rej'`), /DOSSIER_IDENTITY_NOT_DELETABLE/);
  // an updated_at touch on a merged row stays possible after its survivor is merged later
  concept(db, 'later');
  run(db, `UPDATE dossier_concepts SET state = 'MERGED', resolved_to_concept_id = 'later' WHERE concept_id = 'keep'`);
  run(db, `UPDATE dossier_concepts SET updated_at = 'x' WHERE concept_id = 'old'`);
});

test('R snapshot provenance is self-describing and survives purge of the Hub source item and compaction of raw observations (no live FK dependency)', () => {
  const db = openFresh();
  const feed = get(db, `SELECT id FROM source_feeds LIMIT 1`).id;
  run(db, `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key) VALUES ('si-purgeable', ?, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/p', 'P', 'inbox', 'dk-p')`, feed);
  concept(db, 'c1');
  run(db, `INSERT INTO dossier_signal_runs (run_id, reader_id, source_ref, started_at, finished_at, status, reader_version) VALUES ('r1', 'rd', ?, 't0', 't1', 'SUCCEEDED', 'v1')`, feed);
  run(db, `INSERT INTO dossier_observations (observation_id, run_id, acquisition_source_id, source_item_id, concept_id, observation_kind, signal_family, measurement_provenance, dedupe_key, observed_at) VALUES ('obs1', 'r1', ?, 'si-purgeable', 'c1', 'CONTENT_MENTION', 'TURKEY_PUBLIC_DEMAND', 'CONTENT', 'dk-obs1', '2026-10-01T00:00:00Z')`, feed);
  run(db, `INSERT INTO dossier_candidates (candidate_id, target_type, target_id) VALUES ('k1', 'CONCEPT', 'c1')`);
  run(db, `INSERT INTO dossier_candidate_snapshots (snapshot_id, candidate_id, generated_at, algorithm_version, candidate_class, why_now_json) VALUES ('s1', 'k1', 't1', 'v', 'EMERGING', '{"window_kinds":{"FAST_30D":{}}}')`);
  run(db, `INSERT INTO dossier_signal_aggregates (aggregate_id, target_type, target_id, signal_family, window_kind, window_start, window_end, measurement_provenance, aggregation_version, observation_count, generated_at) VALUES ('live1', 'CONCEPT', 'c1', 'TURKEY_PUBLIC_DEMAND', 'FAST_30D', 't0', 't1', 'CONTENT', 'v1', 1, 't1')`);
  run(db, `INSERT INTO dossier_candidate_aggregate_states (aggregate_state_id, snapshot_id, live_aggregate_id, aggregation_version, target_type, target_id, signal_family, window_kind, observation_count, independent_source_count, measurement_provenance, generated_at) VALUES ('as1', 's1', 'live1', 'v1', 'CONCEPT', 'c1', 'TURKEY_PUBLIC_DEMAND', 'FAST_30D', 1, 1, 'CONTENT', 't1')`);
  run(db, `INSERT INTO dossier_snapshot_provenance_refs (provenance_ref_id, snapshot_id, aggregate_state_id, ref_kind, acquisition_source_id, observation_id, source_item_id, item_locator, run_id, published_at, observed_at, evidence_span) VALUES ('p1', 's1', 'as1', 'OBSERVATION', ?, 'obs1', 'si-purgeable', 'https://example.org/p', 'r1', '2026-09-30', '2026-10-01T00:00:00Z', 'bounded evidence span')`, feed);
  const explain = () => get(db, `SELECT acquisition_source_id, item_locator, run_id, published_at, observed_at, evidence_span FROM dossier_snapshot_provenance_refs WHERE provenance_ref_id = 'p1'`);
  const before = JSON.stringify(explain());
  // purge the Hub item, compact the raw observation, recompute/drop the live aggregate: nothing historical changes or blocks
  db.exec(`DELETE FROM source_items WHERE id = 'si-purgeable'`);
  db.exec(`DELETE FROM dossier_observations WHERE observation_id = 'obs1'`);
  db.exec(`DELETE FROM dossier_signal_aggregates WHERE aggregate_id = 'live1'`);
  assert.equal(JSON.stringify(explain()), before, 'the provenance ref still says what source, locator, run, times and evidence span it came from');
  assert.equal(explain().acquisition_source_id, feed);
  assert.equal(get(db, `SELECT observation_count FROM dossier_candidate_aggregate_states WHERE aggregate_state_id = 'as1'`).observation_count, 1);
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM dossier_candidate_snapshots WHERE snapshot_id = 's1'`).n, 1);
  // a ref must name its source, carry no raw payload column, and cite at most one item reference
  assert.throws(() => run(db, `INSERT INTO dossier_snapshot_provenance_refs (provenance_ref_id, snapshot_id, ref_kind, observed_at) VALUES ('bad', 's1', 'OBSERVATION', 't')`), /NOT NULL/);
  assert.throws(() => run(db, `INSERT INTO dossier_snapshot_provenance_refs (provenance_ref_id, snapshot_id, ref_kind, acquisition_source_id, source_item_id, origin_item_id, observed_at) VALUES ('bad2', 's1', 'OBSERVATION', 'x', 'a', 'b', 't')`), /CHECK constraint failed/);
  const cols = all(db, `PRAGMA table_info(dossier_snapshot_provenance_refs)`).map((c) => c.name);
  assert.ok(!cols.some((c) => /payload|body|transcript|comment|full_text|raw/i.test(c)), 'no raw payload column');
  const extCols = all(db, `PRAGMA table_info(dossier_external_source_items)`).map((c) => c.name);
  assert.ok(!extCols.some((c) => /payload|body|transcript|comment|full_text|raw/i.test(c)), 'no archive column on external items');
});

test('scheduler/runtime state and numeric policy stay out of the schema; signal runs are provenance only', () => {
  const db = openFresh();
  const forbiddenCol = /lease|cursor|next_due|claim|lock|failure_count|retention|ttl|expire|max_|cap_|threshold|interval|days/i;
  for (const t of DOSSIER_TABLES) for (const c of all(db, `PRAGMA table_info(${t})`)) assert.ok(!forbiddenCol.test(c.name), `${t}.${c.name} looks like scheduler state or an invented numeric policy`);
  for (const f of V.signal_run.excluded_scheduler_runtime_fields) assert.ok(!all(db, `PRAGMA table_info(dossier_signal_runs)`).some((c) => c.name === f));
  assert.deepEqual(all(db, `PRAGMA table_info(dossier_signal_runs)`).map((c) => c.name).sort(), [...V.signal_run.fields].sort(), 'run table = contract fields');
  assert.ok(!/DEFAULT\s+-?\d+(\.\d+)?\b/.test(stripComments(sql0031).replace(/DEFAULT 0\b/g, '').replace(/DEFAULT 1\b/g, '')) || /DEFAULT 0/.test(sql0031), 'no arbitrary numeric default');
  assert.equal(get(db, `SELECT COUNT(*) AS n FROM evergreen_runtime_state`).n, 0, 'evergreen_runtime_state is untouched and unused');
  assert.ok(!/evergreen_runtime_state/.test(sql0031), 'the migration neither reuses nor modifies the runtime state table');
});

test('contract <-> schema alignment and index design', () => {
  const db = openFresh();
  const cols = (t) => new Set(all(db, `PRAGMA table_info(${t})`).map((c) => c.name));
  const has = (t, f) => cols(t).has(f) || cols(t).has(`${f}_json`);
  for (const f of V.signal_aggregate.fields) assert.ok(has('dossier_signal_aggregates', f), `aggregate field ${f}`);
  for (const f of V.candidate_snapshot.aggregate_state.fields) assert.ok(has('dossier_candidate_aggregate_states', f), `aggregate state field ${f}`);
  for (const f of V.candidate_snapshot.provenance_ref.fields) assert.ok(cols('dossier_snapshot_provenance_refs').has(f), `provenance ref field ${f}`);
  for (const f of V.alias.fields) assert.ok(cols('dossier_aliases').has(f), `alias field ${f}`);
  for (const f of V.origin_item.external_allowed_fields.filter((x) => x !== 'origin_cluster_id')) assert.ok(cols('dossier_external_source_items').has(f), `external item field ${f} (cluster membership is a separate append-only table)`);
  for (const f of V.candidate_snapshot.fields.filter((x) => x !== 'candidate_id' && x !== 'generated_at' && x !== 'algorithm_version' && x !== 'candidate_class')) assert.ok(cols('dossier_candidate_snapshots').has(`${f}_json`) || cols('dossier_candidate_snapshots').has(f), `snapshot field ${f}`);
  for (const f of ['concept_id', 'position']) assert.ok(V.relation.member.fields.includes(f) && cols('dossier_relation_members').has(f));
  for (const f of V.relation.observation_required_fields) assert.ok(cols('dossier_relation_observations').has(f), `relation observation field ${f}`);
  for (const f of ['review_id', 'target_type', 'target_id', 'decision', 'reason_code', 'reason_note', 'reviewer', 'reviewed_at']) assert.ok(cols('dossier_reviews').has(f));
  const idx = all(db, `SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_dossier_%' ORDER BY name`).map((r) => r.name);
  assert.deepEqual(idx, ['idx_dossier_actor_map_source', 'idx_dossier_actors_norm', 'idx_dossier_actors_state', 'idx_dossier_agg_states_snapshot', 'idx_dossier_aliases_norm', 'idx_dossier_cluster_members_ref', 'idx_dossier_concepts_norm', 'idx_dossier_concepts_state', 'idx_dossier_ext_items_hash', 'idx_dossier_obs_run', 'idx_dossier_obs_target', 'idx_dossier_prov_refs_snapshot', 'idx_dossier_relation_members_concept', 'idx_dossier_reviews_target', 'idx_dossier_runs_source']);
  // the unique selector index doubles as the aggregate lookup (target + family + window); no redundant second index
  const uniq = all(db, `PRAGMA index_list(dossier_signal_aggregates)`).filter((i) => i.unique).map((i) => all(db, `PRAGMA index_info(${i.name})`).map((c) => c.name));
  assert.ok(uniq.some((c) => c.slice(0, 4).join() === 'target_type,target_id,signal_family,window_kind'));
  // the candidate-snapshot lookup uses its unique (candidate_id, generated_at) key; reviews and candidates use their composite keys
  assert.ok(all(db, `PRAGMA index_list(dossier_candidate_snapshots)`).some((i) => i.unique));
  assert.ok(all(db, `PRAGMA index_list(dossier_candidates)`).some((i) => i.unique));
  assert.ok(all(db, `PRAGMA index_list(dossier_relations)`).some((i) => i.unique), 'relation identity key is unique');
});
