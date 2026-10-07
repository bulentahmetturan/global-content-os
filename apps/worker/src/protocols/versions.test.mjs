// P3 version / phase / component acceptance: immutable structure over time
// beneath stable protocol identity. Ephemeral node:sqlite only. Fixtures are
// test-local synthetic rows; the six P0 production seeds gain no versions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-structure');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

// ---- VERSION TESTS ----

test('a protocol can have one version (create/read roundtrip)', async () => {
  const { db } = openDb();
  const v = await protocols.createProtocolVersion(db, {
    version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1, version_label: 'baseline',
  });
  assert.equal(v.protocol_id, 'mediterranean-diet');
  assert.equal(v.version_seq, 1);
  const got = await protocols.getProtocolVersion(db, 'med-v1');
  assert.equal(got.version_label, 'baseline');
});

test('a protocol can have multiple versions, listed deterministically', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2 });
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  const list = await protocols.listProtocolVersions(db, 'mediterranean-diet');
  assert.deepEqual(list.map((v) => v.version_id), ['med-v1', 'med-v2']);
});

test('latest version resolution is deterministic (MAX seq, not insertion order)', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2 });
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v2');
  await protocols.createProtocolVersion(db, { version_id: 'med-v3', protocol_id: 'mediterranean-diet', version_seq: 3 });
  assert.equal((await protocols.getLatestProtocolVersion(db, 'mediterranean-diet')).version_id, 'med-v3');
});

test('latest of a versionless protocol is null (fail closed, no guessing)', async () => {
  const { db } = openDb();
  assert.equal(await protocols.getLatestProtocolVersion(db, 'dash-eating-plan'), null);
  assert.equal(await protocols.getProtocolVersion(db, 'no-such-version'), null);
});

test('historical version remains queryable after a newer version exists', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1, version_label: 'baseline' });
  await protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 2, version_label: 'revised' });
  const old = await protocols.getProtocolVersion(db, 'med-v1');
  assert.equal(old.version_label, 'baseline');
  assert.equal(old.version_seq, 1);
});

test('versions are isolated per protocol', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'dash-v1', protocol_id: 'dash-eating-plan', version_seq: 1 });
  assert.deepEqual((await protocols.listProtocolVersions(db, 'dash-eating-plan')).map((v) => v.version_id), ['dash-v1']);
  assert.equal((await protocols.getLatestProtocolVersion(db, 'dash-eating-plan')).version_id, 'dash-v1');
});

test('version referencing a nonexistent protocol fails (FK)', async () => {
  const { db } = openDb();
  await assert.rejects(
    () => protocols.createProtocolVersion(db, { version_id: 'ghost-v1', protocol_id: 'no-such-protocol', version_seq: 1 }),
  );
});

test('adding versions never changes the canonical protocol ID or creates protocols', async () => {
  const { sqlite, db } = openDb();
  const before = await protocols.getProtocol(db, 'mediterranean-diet');
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  const after = await protocols.getProtocol(db, 'mediterranean-diet');
  assert.deepEqual(after, before);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocols').get().n, 6);
});

test('version identity keys immutable; label editable', async () => {
  const { sqlite, db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1, version_label: 'a' });
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_versions SET version_id = 'x' WHERE version_id = 'med-v1'`).run(),
    /VERSION_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_versions SET version_seq = 9 WHERE version_id = 'med-v1'`).run(),
    /VERSION_KEYS_IMMUTABLE/,
  );
  sqlite.prepare(`UPDATE protocol_versions SET version_label = 'b' WHERE version_id = 'med-v1'`).run();
  assert.equal((await protocols.getProtocolVersion(db, 'med-v1')).version_label, 'b');
});

test('duplicate version ordering rejected', async () => {
  const { db } = openDb();
  await protocols.createProtocolVersion(db, { version_id: 'med-v1', protocol_id: 'mediterranean-diet', version_seq: 1 });
  await assert.rejects(
    () => protocols.createProtocolVersion(db, { version_id: 'med-v2', protocol_id: 'mediterranean-diet', version_seq: 1 }),
    /UNIQUE/,
  );
});

// ---- PHASE TESTS ----

async function versionWith(db, versionId, protocolId = 'low-fodmap-diet', seq = 1) {
  return protocols.createProtocolVersion(db, { version_id: versionId, protocol_id: protocolId, version_seq: seq });
}

test('a version can contain multiple phases in explicit deterministic order', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p3', version_id: 'fod-v1', phase_seq: 3, phase_label: 'Personalization' });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1, phase_label: 'Elimination' });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p2', version_id: 'fod-v1', phase_seq: 2, phase_label: 'Reintroduction' });
  const phases = await protocols.listProtocolPhases(db, 'fod-v1');
  assert.deepEqual(phases.map((p) => p.phase_id), ['fod-p1', 'fod-p2', 'fod-p3']);
});

test('phase belongs to exactly one version; versions stay isolated', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await versionWith(db, 'fod-v2', 'low-fodmap-diet', 2);
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  assert.equal((await protocols.listProtocolPhases(db, 'fod-v2')).length, 0);
  assert.equal((await protocols.getProtocolPhase(db, 'fod-p1')).version_id, 'fod-v1');
});

test('phase referencing a nonexistent version fails (FK)', async () => {
  const { db } = openDb();
  await assert.rejects(
    () => protocols.createProtocolPhase(db, { phase_id: 'ghost-p', version_id: 'no-such-version', phase_seq: 1 }),
  );
});

test('phase identity independent of label; keys immutable', async () => {
  const { sqlite, db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1, phase_label: 'Old' });
  sqlite.prepare(`UPDATE protocol_phases SET phase_label = 'New' WHERE phase_id = 'fod-p1'`).run();
  const p = await protocols.getProtocolPhase(db, 'fod-p1');
  assert.equal(p.phase_label, 'New');
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_phases SET phase_seq = 5 WHERE phase_id = 'fod-p1'`).run(),
    /PHASE_KEYS_IMMUTABLE/,
  );
});

test('same phase position collision rejected', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await assert.rejects(
    () => protocols.createProtocolPhase(db, { phase_id: 'fod-pX', version_id: 'fod-v1', phase_seq: 1 }),
    /UNIQUE/,
  );
});

// ---- COMPONENT TESTS ----

test('a version can contain multiple components, listed deterministically', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolComponent(db, { component_id: 'c2', version_id: 'fod-v1', component_seq: 2, title: 'B' });
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', component_seq: 1, title: 'A' });
  const list = await protocols.listProtocolComponents(db, 'fod-v1');
  assert.deepEqual(list.map((c) => c.component_id), ['c1', 'c2']);
});

test('a phase can contain multiple components, listed deterministically', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await protocols.createProtocolComponent(db, { component_id: 'c2', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 2, title: 'B' });
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 1, title: 'A' });
  assert.deepEqual((await protocols.listPhaseComponents(db, 'fod-p1')).map((c) => c.component_id), ['c1', 'c2']);
});

test('component belongs to the expected version', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', component_seq: 1, title: 'A' });
  assert.equal((await protocols.getProtocolComponent(db, 'c1')).version_id, 'fod-v1');
});

test('cross-version phase/component link fails closed', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await versionWith(db, 'fod-v2', 'low-fodmap-diet', 2);
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await assert.rejects(
    () => protocols.createProtocolComponent(db, {
      component_id: 'cx', version_id: 'fod-v2', phase_id: 'fod-p1', component_seq: 1, title: 'Cross',
    }),
    /COMPONENT_PHASE_VERSION_MISMATCH/,
  );
});

test('cross-version link fails at SQL level even bypassing the API', async () => {
  const { sqlite, db } = openDb();
  await versionWith(db, 'fod-v1');
  await versionWith(db, 'fod-v2', 'low-fodmap-diet', 2);
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocol_components (component_id, version_id, phase_id, component_seq, title)
       VALUES ('cx', 'fod-v2', 'fod-p1', 1, 'Cross')`,
    ).run(),
    /COMPONENT_PHASE_VERSION_MISMATCH/,
  );
});

test('invalid phase/version reference fails', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await assert.rejects(
    () => protocols.createProtocolComponent(db, {
      component_id: 'cx', version_id: 'fod-v1', phase_id: 'no-such-phase', component_seq: 1, title: 'X',
    }),
    /COMPONENT_PHASE_NOT_FOUND/,
  );
  await assert.rejects(
    () => protocols.createProtocolComponent(db, {
      component_id: 'cy', version_id: 'no-such-version', component_seq: 1, title: 'Y',
    }),
  );
});

test('component identity independent of title; keys immutable', async () => {
  const { sqlite, db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', component_seq: 1, title: 'Old' });
  sqlite.prepare(`UPDATE protocol_components SET title = 'New' WHERE component_id = 'c1'`).run();
  assert.equal((await protocols.getProtocolComponent(db, 'c1')).title, 'New');
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_components SET component_seq = 7 WHERE component_id = 'c1'`).run(),
    /COMPONENT_KEYS_IMMUTABLE/,
  );
});

test('unphased components are version-level and excluded from phase listings', async () => {
  const { db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await protocols.createProtocolComponent(db, { component_id: 'c0', version_id: 'fod-v1', component_seq: 1, title: 'Whole-version rule' });
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 2, title: 'Phase rule' });
  assert.deepEqual((await protocols.listProtocolComponents(db, 'fod-v1')).map((c) => c.component_id), ['c0', 'c1']);
  assert.deepEqual((await protocols.listPhaseComponents(db, 'fod-p1')).map((c) => c.component_id), ['c1']);
  assert.equal((await protocols.getProtocolComponent(db, 'c0')).phase_id, null);
});

// ---- P2/P0 INVARIANT SPOT-CHECKS ----

test('P0 seed count stays 6; no PROPOSED/WATCH/REJECTED canonicalized', async () => {
  const { db } = openDb();
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
});

test('P2 resolver still answers from the same tree', async () => {
  const { db } = openDb();
  const r = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(r.outcome, 'EXACT_ALIAS');
  assert.equal(r.protocol.protocol_id, 'dash-eating-plan');
});

test('structure writes touch no source, triage, brief, or scheduler state', async () => {
  const { sqlite, db } = openDb();
  await versionWith(db, 'fod-v1');
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await protocols.createProtocolComponent(db, { component_id: 'c1', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 1, title: 'A' });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM source_items').get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});
