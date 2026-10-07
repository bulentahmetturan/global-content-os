// P2 family / variant / alias + deterministic resolution acceptance.
// Ephemeral node:sqlite only. Synthetic fixtures are test-local and never
// touch the six P0 production seeds. Resolver is proven read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-resolution');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

const counts = (sqlite) => ({
  protocols: sqlite.prepare('SELECT COUNT(*) AS n FROM protocols').get().n,
  families: sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_families').get().n,
  members: sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_family_members').get().n,
  aliases: sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_aliases').get().n,
});

/** Synthetic CANONICAL_READY protocol (alias-trigger-compatible) for fixture tests. */
async function insertReady(db, id, name) {
  return protocols.createCanonicalProtocol(db, {
    protocol_id: id,
    canonical_name: name,
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'CANONICAL_READY',
  });
}

// 1. canonical ID unchanged.
test('canonical ID resolves exact and stays stable', async () => {
  const { db } = openDb();
  const r = await protocols.resolveProtocol(db, 'mediterranean-diet');
  assert.equal(r.outcome, 'EXACT_CANONICAL_ID');
  assert.equal(r.protocol.protocol_id, 'mediterranean-diet');
});

// 2. canonical name resolution.
test('exact canonical_name resolves', async () => {
  const { db } = openDb();
  const r = await protocols.resolveProtocol(db, 'Mediterranean diet');
  assert.equal(r.outcome, 'EXACT_CANONICAL_NAME');
  assert.equal(r.protocol.protocol_id, 'mediterranean-diet');
});

// 3. alias resolution.
test('seeded aliases resolve to exact protocols', async () => {
  const { db } = openDb();
  const dash = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(dash.outcome, 'EXACT_ALIAS');
  assert.equal(dash.protocol.protocol_id, 'dash-eating-plan');
  const fodmap = await protocols.resolveProtocol(db, 'Low-FODMAP');
  assert.equal(fodmap.protocol.protocol_id, 'low-fodmap-diet');
  const een = await protocols.resolveProtocol(db, 'een');
  assert.equal(een.protocol.protocol_id, 'exclusive-enteral-nutrition');
});

// 4. normalization determinism.
test('normalization is deterministic and folds separators/case/diacritics', async () => {
  assert.equal(protocols.normalizeAlias('Low-FODMAP'), 'low fodmap');
  assert.equal(protocols.normalizeAlias('low  fodmap'), 'low fodmap');
  assert.equal(protocols.normalizeAlias('LOW FODMAP'), 'low fodmap');
  assert.equal(protocols.normalizeAlias('İ'), 'i');
  assert.equal(protocols.normalizeAlias('Classic KD'), 'classic kd');
  const { db } = openDb();
  const r = await protocols.resolveProtocol(db, 'LOW-FODMAP');
  assert.equal(r.protocol.protocol_id, 'low-fodmap-diet');
});

// 5. alias target integrity.
test('alias to nonexistent protocol fails (FK); alias to non-ready protocol fails closed', async () => {
  const { sqlite, db } = openDb();
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type)
       VALUES ('no-such-protocol', 'X', 'x', 'NAME_VARIANT')`,
    ).run(),
  );
  await protocols.createCanonicalProtocol(db, {
    protocol_id: 'proposed-test',
    canonical_name: 'Proposed test',
    protocol_type: 'DIETARY_PATTERN',
    generic_or_branded: 'GENERIC',
    registry_state: 'PROPOSED',
  });
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type)
       VALUES ('proposed-test', 'Proposed alias', 'proposed alias', 'NAME_VARIANT')`,
    ).run(),
    /ALIAS_TARGET_NOT_CANONICAL/,
  );
});

// 6. family membership.
test('seed families contain the six canonical members', async () => {
  const { db } = openDb();
  const fam = await protocols.getProtocolFamily(db, 'mediterranean-diet');
  assert.equal(fam.family_id, 'cardiometabolic-dietary-patterns');
  const members = await protocols.listFamilyMembers(db, 'cardiometabolic-dietary-patterns');
  assert.deepEqual(members.map((m) => m.protocol_id).sort(), ['dash-eating-plan', 'mediterranean-diet']);
  const keto = await protocols.getProtocolFamily(db, 'classic-ketogenic-diet-therapy');
  assert.equal(keto.family_id, 'ketogenic-diet-therapy');
});

// 7. multiple variants in one family.
test('family can hold multiple variants without collapsing them', async () => {
  const { sqlite, db } = openDb();
  await insertReady(db, 'variant-a', 'Variant A');
  await insertReady(db, 'variant-b', 'Variant B');
  sqlite.prepare(`INSERT INTO protocol_families (family_id, canonical_name) VALUES ('test-family', 'Test family')`).run();
  sqlite.prepare(`INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES ('test-family', 'variant-a', 'VARIANT')`).run();
  sqlite.prepare(`INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES ('test-family', 'variant-b', 'VARIANT')`).run();
  const variants = await protocols.listFamilyVariants(db, 'test-family');
  assert.deepEqual(variants.map((v) => v.protocol_id).sort(), ['variant-a', 'variant-b']);
});

// 8. variant != version.
test('variant rows carry no versioning semantics', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'protocols');
  for (const forbidden of ['version_id', 'definition_hash', 'supersedes', 'version_label']) {
    assert.ok(!cols.includes(forbidden), `forbidden column present: ${forbidden}`);
  }
  const mcols = tableColumns(sqlite, 'protocol_family_members');
  assert.ok(!mcols.includes('version_id'));
});

// 9. family != protocol.
test('families live in their own table, not as protocols', async () => {
  const { sqlite, db } = openDb();
  const pcols = tableColumns(sqlite, 'protocols');
  assert.ok(!pcols.includes('family_id'));
  const fam = await protocols.getFamily(db, 'ketogenic-diet-therapy');
  assert.equal(fam.canonical_name, 'Ketogenic diet therapy');
  assert.equal(await protocols.getProtocol(db, 'ketogenic-diet-therapy'), null);
});

// 10. alias != protocol.
test('inserting an alias creates no protocol row', async () => {
  const { sqlite } = openDb();
  const before = counts(sqlite).protocols;
  sqlite.prepare(
    `INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type)
     VALUES ('dash-eating-plan', 'Dietary Approaches', 'dietary approaches', 'NAME_VARIANT')`,
  ).run();
  assert.equal(counts(sqlite).protocols, before);
});

// 11. ambiguous alias fails closed.
test('shared alias across protocols returns AMBIGUOUS with candidates, no guess', async () => {
  const { sqlite, db } = openDb();
  await insertReady(db, 'ambig-one', 'Ambig One');
  await insertReady(db, 'ambig-two', 'Ambig Two');
  sqlite.prepare(`INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type) VALUES ('ambig-one', 'Keto', 'keto', 'SHORT_FORM')`).run();
  sqlite.prepare(`INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type) VALUES ('ambig-two', 'Keto', 'keto', 'SHORT_FORM')`).run();
  const r = await protocols.resolveProtocol(db, 'keto');
  assert.equal(r.outcome, 'AMBIGUOUS');
  assert.equal(r.candidates.length, 2);
  assert.equal(r.protocol, undefined);
});

// 12. unknown alias returns NOT_FOUND (no fuzzy matching).
test('unknown and misspelled inputs return NOT_FOUND', async () => {
  const { db } = openDb();
  assert.equal((await protocols.resolveProtocol(db, 'keto')).outcome, 'NOT_FOUND');
  assert.equal((await protocols.resolveProtocol(db, 'Mediteranean deit')).outcome, 'NOT_FOUND');
  assert.equal((await protocols.resolveProtocol(db, 'Dashh')).outcome, 'NOT_FOUND');
  assert.equal((await protocols.resolveProtocol(db, '')).outcome, 'NOT_FOUND');
  assert.equal((await protocols.resolveProtocol(db, '   ')).outcome, 'NOT_FOUND');
});

// 13–15. WATCH / PROPOSED / REJECTED never canonicalized.
test('no WATCH, PROPOSED, or REJECTED rows exist in production seeds', async () => {
  const { db } = openDb();
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
  const members = await protocols.listFamilyMembers(db, 'elimination-reintroduction-framework');
  assert.ok(members.every((m) => m.registry_state === 'CANONICAL_READY'));
});

// 16. active_status separate from registry_state.
test('active_status and registry_state mutate independently', async () => {
  const { sqlite, db } = openDb();
  sqlite.prepare(`UPDATE protocols SET active_status = 'INACTIVE' WHERE protocol_id = 'dash-eating-plan'`).run();
  let p = await protocols.getProtocol(db, 'dash-eating-plan');
  assert.equal(p.active_status, 'INACTIVE');
  assert.equal(p.registry_state, 'CANONICAL_READY');
  sqlite.prepare(`UPDATE protocols SET registry_state = 'PROPOSED' WHERE protocol_id = 'dash-eating-plan'`).run();
  p = await protocols.getProtocol(db, 'dash-eating-plan');
  assert.equal(p.registry_state, 'PROPOSED');
  assert.equal(p.active_status, 'INACTIVE');
});

// 17. resolver performs no writes.
test('resolver is read-only across a battery of lookups', async () => {
  const { sqlite, db } = openDb();
  const before = counts(sqlite);
  for (const q of ['mediterranean-diet', 'Mediterranean diet', 'DASH', 'Low-FODMAP', 'een', 'keto', 'nope', 'Classic KD', '']) {
    await protocols.resolveProtocol(db, q);
  }
  assert.deepEqual(counts(sqlite), before);
});

// 19. no source activation.
test('P2 operations leave source_feeds activation untouched', async () => {
  const { sqlite, db } = openDb();
  const before = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  await protocols.resolveProtocol(db, 'DASH');
  await protocols.listFamilies(db);
  const after = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  assert.deepEqual(after, before);
});

// 20. no scheduler creation, approved_brief unchanged.
test('no scheduler tables appear; approved_briefs stays empty', async () => {
  const { sqlite, db } = openDb();
  await protocols.resolveProtocol(db, 'DASH');
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
});

// 21. alias mutation cannot mutate canonical IDs.
test('alias rows are immutable; canonical IDs survive alias lifecycle', async () => {
  const { sqlite, db } = openDb();
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_aliases SET protocol_id = 'dash-eating-plan' WHERE normalized_alias = 'een'`).run(),
    /ALIAS_IMMUTABLE/,
  );
  const r = await protocols.resolveProtocol(db, 'een');
  assert.equal(r.protocol.protocol_id, 'exclusive-enteral-nutrition');
});

// 22. variant resolution preserves variant identity with canonical context.
test('VARIANT_MATCH returns the variant itself plus family canonical', async () => {
  const { sqlite, db } = openDb();
  await insertReady(db, 'test-variant', 'Test Variant');
  await insertReady(db, 'vfam-canonical', 'Vfam Canonical');
  sqlite.prepare(`INSERT INTO protocol_families (family_id, canonical_name) VALUES ('vfam', 'V Family')`).run();
  sqlite.prepare(`INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES ('vfam', 'vfam-canonical', 'CANONICAL')`).run();
  sqlite.prepare(`INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES ('vfam', 'test-variant', 'VARIANT')`).run();
  sqlite.prepare(`INSERT INTO protocol_aliases (protocol_id, alias_value, normalized_alias, alias_type) VALUES ('test-variant', 'TV', 'tv', 'SHORT_FORM')`).run();
  const r = await protocols.resolveProtocol(db, 'tv');
  assert.equal(r.outcome, 'VARIANT_MATCH');
  assert.equal(r.protocol.protocol_id, 'test-variant');
  assert.equal(r.family.family_id, 'vfam');
  assert.deepEqual(r.canonicalProtocols.map((c) => c.protocol_id), ['vfam-canonical']);
});

// 23. seed counts: 6 protocols, 4 families, 6 members, 9 aliases.
test('production seed population unchanged (6/4/6/9)', async () => {
  const { sqlite } = openDb();
  assert.deepEqual(counts(sqlite), { protocols: 6, families: 4, members: 6, aliases: 9 });
});

// 24. seed alias normalization contract (single-source drift guard).
test('every seeded alias_value normalizes to its stored normalized_alias', async () => {
  const { sqlite } = openDb();
  const rows = sqlite.prepare('SELECT alias_value, normalized_alias FROM protocol_aliases').all();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(protocols.normalizeAlias(row.alias_value), row.normalized_alias, row.alias_value);
  }
});

// 25. family IDs immutable.
test('family_id is immutable', async () => {
  const { sqlite } = openDb();
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_families SET family_id = 'x' WHERE family_id = 'ketogenic-diet-therapy'`).run(),
    /FAMILY_ID_IMMUTABLE/,
  );
});

// 26. membership rows immutable.
test('family membership rows are immutable', async () => {
  const { sqlite } = openDb();
  assert.throws(
    () => sqlite.prepare(`UPDATE protocol_family_members SET member_role = 'VARIANT' WHERE protocol_id = 'mediterranean-diet'`).run(),
    /FAMILY_MEMBERSHIP_IMMUTABLE/,
  );
});

// 27. families accept multiple CANONICAL members, but one protocol belongs to one family.
test('multiple CANONICALs coexist; second family for one protocol is rejected', async () => {
  const { sqlite, db } = openDb();
  const cardio = await protocols.listFamilyMembers(db, 'cardiometabolic-dietary-patterns');
  assert.ok(cardio.length >= 2);
  assert.throws(
    () => sqlite.prepare(`INSERT INTO protocol_family_members (family_id, protocol_id, member_role) VALUES ('ketogenic-diet-therapy', 'mediterranean-diet', 'VARIANT')`).run(),
    /UNIQUE/,
  );
});

// 28. canonical_work_id semantics unchanged.
test('canonical_work_id column still exists on source_items', async () => {
  const { sqlite } = openDb();
  const cols = tableColumns(sqlite, 'source_items');
  assert.ok(cols.includes('canonical_work_id'));
});

// 29. getAliasesForProtocol returns stored aliases.
test('aliases listed per protocol from stored data', async () => {
  const { db } = openDb();
  const aliases = await protocols.getAliasesForProtocol(db, 'dash-eating-plan');
  assert.deepEqual(aliases.map((a) => a.normalized_alias).sort(), ['dash', 'dash diet']);
});
