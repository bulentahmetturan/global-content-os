// P1 Protocol Registry acceptance: canonical identity, immutability, seed policy,
// no-side-effect gates (no sources, no triage/approved_brief, no scheduler,
// no actor ownership, no family/variant/version). Ephemeral node:sqlite only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-registry');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

// 1. Canonical protocol can be created/read.
test('create canonical protocol and read it back', async () => {
  const { db } = openDb();
  const p = await protocols.createCanonicalProtocol(db, {
    protocol_id: 'test-protocol',
    canonical_name: 'Test protocol',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  assert.equal(p.protocol_id, 'test-protocol');
  const got = await protocols.getProtocol(db, 'test-protocol');
  assert.equal(got.canonical_name, 'Test protocol');
});

// 2. protocol_id is immutable.
test('protocol_id is immutable (UPDATE fails)', async () => {
  const { sqlite, db } = openDb();
  assert.throws(
    () => sqlite.prepare(`UPDATE protocols SET protocol_id = 'x' WHERE protocol_id = 'mediterranean-diet'`).run(),
    /PROTOCOL_ID_IMMUTABLE/,
  );
});

// 3. canonical_name may change without protocol_id changing.
test('canonical_name update preserves protocol_id', async () => {
  const { db } = openDb();
  const before = await protocols.getProtocol(db, 'mediterranean-diet');
  const renamed = await protocols.renameCanonicalProtocol(db, 'mediterranean-diet', 'Mediterranean-style dietary pattern');
  assert.equal(renamed.protocol_id, before.protocol_id);
  assert.equal(renamed.canonical_name, 'Mediterranean-style dietary pattern');
});

// 4. duplicate protocol_id rejected.
test('duplicate protocol_id rejected', async () => {
  const { sqlite, db } = openDb();
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocols (protocol_id, canonical_name, protocol_type, generic_or_branded, registry_state)
       VALUES ('mediterranean-diet', 'X', 'DIETARY_PATTERN', 'GENERIC', 'PROPOSED')`,
    ).run(),
    /UNIQUE/,
  );
});

// 5. exact duplicate canonical identity rejected.
test('exact duplicate canonical_name rejected', async () => {
  const { sqlite, db } = openDb();
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocols (protocol_id, canonical_name, protocol_type, generic_or_branded, registry_state)
       VALUES ('other-id', 'Mediterranean diet', 'DIETARY_PATTERN', 'GENERIC', 'PROPOSED')`,
    ).run(),
    /UNIQUE/,
  );
});

// 6. only approved P0 CANONICAL_READY seeds are selected.
test('only P0 CANONICAL_READY seeds exist', async () => {
  const { db } = openDb();
  const all = await protocols.listProtocols(db);
  const ready = all.filter((p) => p.registry_state === 'CANONICAL_READY');
  assert.deepEqual(ready.map((p) => p.protocol_id).sort(), [
    'classic-ketogenic-diet-therapy',
    'dash-eating-plan',
    'exclusive-enteral-nutrition',
    'food-allergy-elimination-reintroduction',
    'low-fodmap-diet',
    'mediterranean-diet',
  ]);
});

// 7. seed count = exactly P0-approved count.
test('seed count = 6', async () => {
  const { db } = openDb();
  const all = await protocols.listProtocols(db);
  assert.equal(all.length, 6);
});

// 8. no PROPOSED rows seeded.
test('no PROPOSED rows seeded', async () => {
  const { db } = openDb();
  const proposed = await protocols.listProtocolsByRegistryState(db, 'PROPOSED');
  assert.equal(proposed.length, 0);
});

// 9. no WATCH rows seeded.
test('no WATCH rows seeded', async () => {
  const { db } = openDb();
  const watch = await protocols.listProtocolsByRegistryState(db, 'WATCH');
  assert.equal(watch.length, 0);
});

// 10. no REJECT_NOT_A_PROTOCOL rows seeded.
test('no REJECT_NOT_A_PROTOCOL rows seeded', async () => {
  const { db } = openDb();
  const rejected = await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL');
  assert.equal(rejected.length, 0);
});

// 11–16. protocol record contains no efficacy/verdict/position/safety/actor/source columns.
test('protocol table has no efficacy, verdict, clinical-position, safety, actor, or source columns', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'protocols');
  for (const forbidden of ['effective', 'works', 'supported', 'evidence_score', 'verdict', 'clinical_position', 'guideline_recommended', 'safe', 'risk_score', 'creator_actor_id', 'source_activation_state']) {
    assert.ok(!cols.includes(forbidden), `forbidden column present: ${forbidden}`);
  }
});

// 17. protocol creation does not create source_items.
test('protocol creation does not create source_items', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n;
  await protocols.createCanonicalProtocol(db, {
    protocol_id: 'side-effect-test',
    canonical_name: 'Side effect test',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  const after = sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n;
  assert.equal(after, before);
});

// 18. protocol creation does not create scheduler work.
test('protocol creation does not create scheduler work', async () => {
  const { sqlite, db } = openDb();
  await protocols.createCanonicalProtocol(db, {
    protocol_id: 'scheduler-test',
    canonical_name: 'Scheduler test',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});

// 19. protocol creation does not create Hub/triage items.
test('protocol creation does not create triage items', async () => {
  const { sqlite, db } = openDb();
  await protocols.createCanonicalProtocol(db, {
    protocol_id: 'triage-test',
    canonical_name: 'Triage test',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  const decisions = sqlite.prepare('SELECT COUNT(*) AS n FROM editorial_decisions').get().n;
  assert.equal(decisions, 0);
});

// 20. protocol creation does not create approved_brief.
test('protocol creation does not create approved_brief', async () => {
  const { sqlite, db } = openDb();
  await protocols.createCanonicalProtocol(db, {
    protocol_id: 'brief-test',
    canonical_name: 'Brief test',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  const briefs = sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n;
  assert.equal(briefs, 0);
});

// 21. canonical_work_id behavior remains unchanged.
test('canonical_work_id semantics unchanged (source_items column still exists)', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'source_items');
  assert.ok(cols.includes('canonical_work_id'));
});

// 22. Doctor Actor Registry schema remains untouched.
test('actors table unchanged (no protocol columns)', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'actors');
  assert.ok(!cols.some((c) => /protocol/i.test(c)));
});

// 23. no family/variant logic accidentally implemented.
test('no family/variant columns in protocols table', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'protocols');
  for (const forbidden of ['family_id', 'parent_protocol_id', 'variant_of', 'family_of', 'evidence_scope']) {
    assert.ok(!cols.includes(forbidden), `forbidden column present: ${forbidden}`);
  }
});

// 24. no versioning logic accidentally implemented.
test('no versioning columns in protocols table', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'protocols');
  for (const forbidden of ['version_id', 'definition_hash', 'supersedes', 'version_label', 'valid_from', 'valid_to']) {
    assert.ok(!cols.includes(forbidden), `forbidden column present: ${forbidden}`);
  }
});

// 25. migration applies cleanly on local ephemeral DB built through all prior migrations.
test('all migrations apply cleanly in order', () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  for (const f of files) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((r) => r.name);
  assert.ok(tables.includes('protocols'));
  assert.ok(tables.includes('actors'));
  assert.ok(tables.includes('source_items'));
});
