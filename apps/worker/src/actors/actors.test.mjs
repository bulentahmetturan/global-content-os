// D1 Actor Registry acceptance (sprint D1): canonical identity, aliases,
// Turkish-aware normalization without auto-merge, credentials vs roles,
// panels, seed representability, and no-side-effect gates (no sources,
// no triage/approved_brief change). Ephemeral node:sqlite only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors');

const AUDIT = { by: 'test:d1', reason: 'D1 acceptance fixture' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableNames = (sqlite) =>
  sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((r) => r.name);

// 1. Create canonical actor.
test('create canonical actor with fail-closed defaults', async () => {
  const { db } = openDb();
  const a = await actors.createActor(
    db,
    { canonicalName: 'Ahmet Ekmekçi', panel: 'TURKEY_EXPERT_PANEL', countryCode: 'TR' },
    AUDIT,
  );
  assert.match(a.actor_id, /^actor_/);
  assert.equal(a.panel, 'TURKEY_EXPERT_PANEL');
  assert.equal(a.credential_class, 'UNKNOWN_PENDING_VERIFICATION');
  assert.equal(a.credential_status, 'PENDING_VERIFICATION');
  assert.equal(a.identity_confidence, 'PENDING_IDENTITY_RESOLUTION');
});

// 2. Retrieve same actor by immutable actor_id.
test('retrieve same actor by actor_id', async () => {
  const { db } = openDb();
  const created = await actors.createActor(db, { canonicalName: 'Ayça Kaya', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const fetched = await actors.getActor(db, created.actor_id);
  assert.equal(fetched?.canonical_name, 'Ayça Kaya');
  assert.equal(fetched?.actor_id, created.actor_id);
});

// 3. Alias resolves to same actor.
test('alias resolves to same actor', async () => {
  const { db } = openDb();
  const created = await actors.createActor(db, { canonicalName: 'Ahmet Ekmekçi', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  await actors.attachAlias(db, created.actor_id, { aliasValue: 'Ahmet Ekmekci', aliasType: 'DIACRITIC_VARIANT' }, AUDIT);
  const found = await actors.lookupCandidates(db, 'Ahmet Ekmekci');
  assert.equal(found.length, 1);
  assert.equal(found[0].actor_id, created.actor_id);
  const resolved = await actors.resolveIdentity(db, { name: 'Ahmet Ekmekci' });
  assert.equal(resolved.status, 'CANDIDATE_MATCHES');
});

// 4. Turkish diacritic-normalized lookup produces candidates.
test('turkish-aware normalization folds diacritics and dotted capitals', async () => {
  assert.equal(actors.normalizeActorName('Nazan Uysal Harzadın'), 'nazan uysal harzadin');
  assert.equal(actors.normalizeActorName('Derya Uludüz'), 'derya uluduz');
  assert.equal(actors.normalizeActorName('İSTANBUL'), 'istanbul');
  const { db } = openDb();
  await actors.createActor(db, { canonicalName: 'Derya Uludüz', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const found = await actors.lookupCandidates(db, 'derya uluduz');
  assert.equal(found.length, 1);
  assert.equal(found[0].canonical_name, 'Derya Uludüz');
});

// 5+6. Normalized collision does NOT auto-merge; two people may share a name.
test('normalized collision stays two actors and resolves AMBIGUOUS', async () => {
  const { db } = openDb();
  const first = await actors.createActor(
    db,
    { canonicalName: 'Mustafa Kalkan', panel: 'TURKEY_EXPERT_PANEL', countryCode: 'TR' },
    AUDIT,
  );
  const second = await actors.createActor(db, { canonicalName: 'Mustafa Kalkan', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  assert.notEqual(first.actor_id, second.actor_id);
  const resolved = await actors.resolveIdentity(db, { name: 'Mustafa Kalkan' });
  assert.equal(resolved.status, 'AMBIGUOUS');
  assert.equal(resolved.actors.length, 2);
});

// Same alias value on two actors is allowed and stays ambiguous.
test('shared alias value across actors is ambiguity, not reassignment', async () => {
  const { db } = openDb();
  const first = await actors.createActor(db, { canonicalName: 'Mustafa Kalkan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const second = await actors.createActor(db, { canonicalName: 'Mustafa Kalkan', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  await actors.attachAlias(db, first.actor_id, { aliasValue: 'M. Kalkan', aliasType: 'NAME_VARIANT' }, AUDIT);
  await actors.attachAlias(db, second.actor_id, { aliasValue: 'M. Kalkan', aliasType: 'NAME_VARIANT' }, AUDIT);
  const resolved = await actors.resolveIdentity(db, { name: 'M. Kalkan' });
  assert.equal(resolved.status, 'AMBIGUOUS');
});

// 7. Credential remains pending without verification.
test('credential stays pending without a verification ref', async () => {
  const { db } = openDb();
  const a = await actors.createActor(db, { canonicalName: 'Brad Stanfield', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  assert.equal(a.credential_class, 'UNKNOWN_PENDING_VERIFICATION');
  assert.equal(a.credential_status, 'PENDING_VERIFICATION');
});

// 8. Actor can have multiple roles.
test('actor holds multiple operational roles', async () => {
  const { db } = openDb();
  const a = await actors.createActor(
    db,
    { canonicalName: 'Brad Stanfield', panel: 'GLOBAL_EXPERT_PANEL', roles: ['CLINICIAN_CREATOR'] },
    AUDIT,
  );
  await actors.assignRole(db, a.actor_id, 'EVIDENCE_TRANSLATOR', AUDIT);
  assert.deepEqual(await actors.listActorRoles(db, a.actor_id), ['CLINICIAN_CREATOR', 'EVIDENCE_TRANSLATOR']);
});

// 9. Panels remain distinct; HEKIMLER_RADAR is not a panel.
test('turkey/global/other panels are distinct and hekimler_radar is rejected', async () => {
  const { db } = openDb();
  const tr = await actors.createActor(db, { canonicalName: 'Ayça Kaya', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const gl = await actors.createActor(db, { canonicalName: 'Peter Attia', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  const ot = await actors.createActor(db, { canonicalName: 'Anthony William', panel: 'OTHER_HEALTH_ACTORS' }, AUDIT);
  assert.deepEqual((await actors.listActorsByPanel(db, 'TURKEY_EXPERT_PANEL')).map((a) => a.actor_id), [tr.actor_id]);
  // GLOBAL panel legitimately also holds governed institutional seeds (e.g. Wave-1 actor_nhlbi);
  // the invariant is distinctness + presence, not an exhaustive singleton list.
  assert.ok((await actors.listActorsByPanel(db, 'GLOBAL_EXPERT_PANEL')).map((a) => a.actor_id).includes(gl.actor_id));
  assert.deepEqual((await actors.listActorsByPanel(db, 'OTHER_HEALTH_ACTORS')).map((a) => a.actor_id), [ot.actor_id]);
  await assert.rejects(
    actors.createActor(db, { canonicalName: 'X', panel: 'HEKIMLER_RADAR' }, AUDIT),
    /ACTOR_VALIDATION_ERROR/,
  );
});

// 10. Anthony William exists without PHYSICIAN credential.
test('anthony william is representable as non-physician claim source', async () => {
  const { db } = openDb();
  const a = await actors.createActor(
    db,
    { canonicalName: 'Anthony William', panel: 'OTHER_HEALTH_ACTORS', roles: ['HEALTH_CREATOR', 'CLAIM_SOURCE'] },
    AUDIT,
  );
  assert.notEqual(a.credential_class, 'PHYSICIAN');
  assert.deepEqual((await actors.listActorRoles(db, a.actor_id)).sort(), ['CLAIM_SOURCE', 'HEALTH_CREATOR']);
});

// 11. doctor.mik remains unresolved and unlinked.
test('doctor.mik resolves NO_MATCH and links to nobody', async () => {
  const { db } = openDb();
  await actors.createActor(db, { canonicalName: 'Ahmet Ekmekçi', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  const resolved = await actors.resolveIdentity(db, { name: 'doctor.mik' });
  assert.equal(resolved.status, 'NO_MATCH');
  assert.deepEqual(await actors.lookupCandidates(db, 'doctor.mik'), []);
});

// 12. Rhonda Patrick and future FoundMyFitness need no second person actor.
test('foundmyfitness brand alias rides on the one rhonda patrick actor', async () => {
  const { db } = openDb();
  const person = await actors.createActor(
    db,
    { canonicalName: 'Rhonda Patrick', panel: 'GLOBAL_EXPERT_PANEL', countryCode: 'US' },
    AUDIT,
  );
  await actors.attachAlias(db, person.actor_id, { aliasValue: 'FoundMyFitness', aliasType: 'KNOWN_PUBLIC_NAME' }, AUDIT);
  const found = await actors.lookupCandidates(db, 'FoundMyFitness');
  assert.equal(found.length, 1);
  assert.equal(found[0].actor_id, person.actor_id);
});

// 13. Jordan Feigenbaum / Barbell Medicine: no org merged into the person.
test('organization name is not a person and forces no second actor', async () => {
  const { sqlite, db } = openDb();
  await actors.createActor(db, { canonicalName: 'Jordan Feigenbaum', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  assert.equal((await actors.resolveIdentity(db, { name: 'Barbell Medicine' })).status, 'NO_MATCH');
  assert.ok(!tableNames(sqlite).some((t) => /org|brand/i.test(t)), 'D1 must not gain org/brand tables');
});

// Uniqueness: same actor_id cannot duplicate; actor_id is immutable.
test('actor_id is unique and immutable across renames', async () => {
  const { sqlite, db } = openDb();
  const a = await actors.createActor(db, { canonicalName: 'Zeynep Tartan', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  await assert.rejects(
    (async () => {
      await db
        .prepare(`INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
                  VALUES (?, 'Nobody', 'nobody', 'TURKEY_EXPERT_PANEL', 't', 't')`)
        .bind(a.actor_id)
        .run();
    })(),
  );
  const renamed = await actors.renameActor(db, a.actor_id, 'Zeynep Tartan Demir', AUDIT);
  assert.equal(renamed.actor_id, a.actor_id);
  assert.equal(renamed.canonical_name, 'Zeynep Tartan Demir');
  // Old name still resolves to the same actor via FORMER_NAME history.
  const viaOld = await actors.lookupCandidates(db, 'Zeynep Tartan');
  assert.equal(viaOld.length, 1);
  assert.equal(viaOld[0].actor_id, a.actor_id);
  assert.throws(() => {
    sqlite.prepare(`UPDATE actors SET actor_id = 'actor_other' WHERE actor_id = ?`).run(a.actor_id);
  });
});

// Uniqueness: same VERIFIED external identity cannot point to two actors.
test('verified identity collision fails closed; unverified observation does not', async () => {
  const { db } = openDb();
  const first = await actors.createActor(db, { canonicalName: 'Valter Longo', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  const second = await actors.createActor(db, { canonicalName: 'Jason Fung', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  await actors.recordIdentityRef(
    db,
    first.actor_id,
    { refType: 'ORCID', refValue: '0000-0002-1825-0097', purpose: 'credential verification' },
    AUDIT,
  );
  // PENDING rows are observations: same value on another actor is allowed.
  await actors.recordIdentityRef(
    db,
    second.actor_id,
    { refType: 'ORCID', refValue: '0000-0002-1825-0097', purpose: 'candidate observation' },
    AUDIT,
  );
  // Promoting the second row to VERIFIED must fail closed once the first
  // actor's identical identity is VERIFIED.
  await db
    .prepare(`UPDATE actor_identity_refs SET verification_status = 'VERIFIED' WHERE actor_id = ? AND ref_type = 'ORCID'`)
    .bind(first.actor_id)
    .run();
  const { results } = await db
    .prepare(`SELECT id FROM actor_identity_refs WHERE actor_id = ? AND ref_type = 'ORCID'`)
    .bind(second.actor_id)
    .all();
  await assert.rejects(
    (async () => {
      await db
        .prepare(`UPDATE actor_identity_refs SET verification_status = 'VERIFIED' WHERE id = ?`)
        .bind(results[0].id)
        .run();
    })(),
    /UNIQUE/i,
  );
  // Resolving by the verified identifier yields the exact first actor even
  // when the queried name matches nobody.
  // Verifying the first actor's ref, then resolving by identifier, yields the
  // exact actor even when the queried name matches nobody.
  const exact = await actors.resolveIdentity(db, {
    name: 'somebody else entirely',
    identifier: { refType: 'ORCID', refValue: '0000-0002-1825-0097' },
  });
  assert.equal(exact.status, 'EXACT_ACTOR');
  assert.equal(exact.actors[0].actor_id, first.actor_id);
});

// VERIFIED identifier resolves EXACT_ACTOR even when the name differs.
test('verified identifier resolves exact actor', async () => {
  const { db } = openDb();
  const a = await actors.createActor(db, { canonicalName: 'Mark Pimentel', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  await actors.recordIdentityRef(
    db,
    a.actor_id,
    { refType: 'ORCID', refValue: '0000-0001-0001-0001', purpose: 'credential verification', status: 'VERIFIED' },
    AUDIT,
  );
  const exact = await actors.resolveIdentity(db, {
    name: 'unrelated query string',
    identifier: { refType: 'ORCID', refValue: '0000-0001-0001-0001' },
  });
  assert.equal(exact.status, 'EXACT_ACTOR');
  assert.equal(exact.actors[0].actor_id, a.actor_id);
});

// 14. No actor creation causes source activation.
test('actor writes never touch source registries or intake', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c;
  const itemsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  const a = await actors.createActor(db, { canonicalName: 'Osman Müftüoğlu', panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
  await actors.attachAlias(db, a.actor_id, { aliasValue: 'Osman Muftuoglu', aliasType: 'TRANSLITERATION' }, AUDIT);
  await actors.assignRole(db, a.actor_id, 'CLINICIAN_CREATOR', AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c, feedsBefore);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, itemsBefore);
});

// 15+16. approved_brief and triage behavior unchanged; only actor tables added.
test('migration adds only actor tables; brief and triage contracts intact', async () => {
  const { sqlite } = openDb();
  const names = tableNames(sqlite);
  for (const t of ['actors', 'actor_aliases', 'actor_roles', 'actor_identity_refs']) assert.ok(names.includes(t));
  for (const forbidden of ['actor_sources', 'source_activity_audit', 'candidates', 'signals', 'claims']) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not exist in D1`);
  }
  const ddl = readFileSync('migrations/0031_doctor_actor_registry.sql', 'utf8');
  assert.ok(!/(CREATE|ALTER|DROP|INSERT INTO)\s+approved_brief/i.test(ddl));
  assert.ok(!/ALTER TABLE source_items/i.test(ddl));
  // D1 creates no protocol tables (scoped to D1's own DDL statements; a
  // parallel Protocol track owns its tables and is neither created nor
  // policed here. The actor ROLE value 'PROTOCOL_SOURCE' is Doctor-domain
  // vocabulary, not a protocol entity.)
  const ddlBody = ddl.replace(/--.*$/gm, '');
  const createdTables = [...ddlBody.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
  assert.deepEqual(createdTables.sort(), ['actor_aliases', 'actor_identity_refs', 'actor_roles', 'actors']);
  assert.ok(!/protocol_id|protocol_edges/i.test(ddlBody));
  // Triage CHECK still enforced on the hot path.
  assert.throws(() => {
    sqlite.prepare(`INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, triage_status, dedupe_key)
      SELECT 'bad_1', id, 'kaduse-news', 'kaduse-medikal', 'T', 'https://example.org/bad', 'P', 'candidate', 'bad'
      FROM source_feeds LIMIT 1`).run();
  });
  const briefSql = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = 'approved_briefs'`).get().sql;
  assert.ok(briefSql.includes('handoff_status'));
});
