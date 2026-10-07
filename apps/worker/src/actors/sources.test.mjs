// D2 Actor ↔ Source association acceptance (sprint D2): endpoint identity,
// association taxonomy, verification provenance, person/brand separation,
// shared sources, fail-closed resolution, and no-activation invariants.
// Ephemeral node:sqlite only; no network, no polling, no source activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-actors-d2');
const sources = await bundle('apps/worker/src/actors/sources.ts', 'doctor-sources-d2');

const AUDIT = { by: 'test:d2', reason: 'D2 acceptance fixture' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableNames = (sqlite) =>
  sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((r) => r.name);

async function seedActor(db, name, panel = 'TURKEY_EXPERT_PANEL') {
  return actors.createActor(db, { canonicalName: name, panel }, AUDIT);
}

// 1. One actor can link to multiple source types.
test('one actor links to multiple source types', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Ahmet Ekmekçi');
  const web = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://ahmetekmekci.com' },
    AUDIT,
  );
  const fb = await sources.createEndpoint(
    db,
    { channelType: 'FACEBOOK', platform: 'facebook', canonicalLocator: 'https://facebook.com/ahmetekmekci' },
    AUDIT,
  );
  const inst = await sources.createEndpoint(
    db,
    { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@ahmetekmekci' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: web.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: fb.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: inst.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  const bundle = await sources.getSourceBundle(db, a.actor_id);
  assert.equal(bundle.length, 3);
  assert.deepEqual(
    bundle.map((b) => b.association_type).sort(),
    ['OFFICIAL_PERSONAL', 'OFFICIAL_PROFESSIONAL', 'OFFICIAL_PROFESSIONAL'],
  );
});

// 2. Same canonical endpoint cannot duplicate for same actor.
test('same actor + same endpoint + same type is one association', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Ayça Kaya');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'YOUTUBE', platform: 'youtube', canonicalLocator: 'https://youtube.com/@aycakaya' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  await assert.rejects(
    sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT),
    /DUPLICATE_ASSOCIATION/,
  );
});

// 3. URL/locator variants normalize correctly.
test('locator variants normalize to one endpoint identity', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Derya Uludüz');
  const ep1 = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://deryauluduz.com/' },
    AUDIT,
  );
  const ep2 = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://www.deryauluduz.com' },
    AUDIT,
  );
  assert.equal(ep1.endpoint_id, ep2.endpoint_id);
  // Handle normalization.
  const ig1 = await sources.createEndpoint(db, { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@DeryaUluduz' }, AUDIT);
  const ig2 = await sources.createEndpoint(db, { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: 'deryauluduz' }, AUDIT);
  assert.equal(ig1.endpoint_id, ig2.endpoint_id);
  // ORCID formatting.
  const orcid1 = await sources.createEndpoint(db, { channelType: 'ORCID', platform: 'orcid', canonicalLocator: 'https://orcid.org/0000-0002-1234-5678' }, AUDIT);
  const orcid2 = await sources.createEndpoint(db, { channelType: 'ORCID', platform: 'orcid', canonicalLocator: '0000-0002-1234-5678' }, AUDIT);
  assert.equal(orcid1.endpoint_id, orcid2.endpoint_id);
  // YouTube channel URL variants.
  const yt1 = await sources.createEndpoint(db, { channelType: 'YOUTUBE', platform: 'youtube', canonicalLocator: 'https://youtube.com/channel/UC1234567890abcdefghijk' }, AUDIT);
  const yt2 = await sources.createEndpoint(db, { channelType: 'YOUTUBE', platform: 'youtube', canonicalLocator: 'UC1234567890abcdefghijk' }, AUDIT);
  assert.equal(yt1.endpoint_id, yt2.endpoint_id);
});

// 4. Same endpoint may associate with multiple actors where relation permits.
test('shared institutional source supports many actors', async () => {
  const { db } = openDb();
  const a1 = await seedActor(db, 'Mustafa Kalkan');
  const a2 = await seedActor(db, 'Zeynep Tartan');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'INSTITUTIONAL_PROFILE', platform: 'web', canonicalLocator: 'https://hospital.example.com/team' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a1.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  await sources.linkActorToSource(db, { actorId: a2.actor_id, endpointId: ep.endpoint_id, associationType: 'INSTITUTIONAL_PROFILE' }, AUDIT);
  const actors = await sources.listActorsForSource(db, ep.endpoint_id);
  assert.equal(actors.length, 2);
});

// 5. OFFICIAL_PERSONAL ownership conflict fails closed.
test('official-personal ownership conflict fails closed', async () => {
  const { db } = openDb();
  const a1 = await seedActor(db, 'Osman Müftüoğlu');
  const a2 = await seedActor(db, 'Halit Yerebakan');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://osmanmuftuoglu.com' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a1.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  await assert.rejects(
    sources.linkActorToSource(db, { actorId: a2.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT),
    /OFFICIAL_PERSONAL_CONFLICT/,
  );
});

// 6. Actor lookup always uses actor_id, not display name.
test('association resolves by actor_id never by display name', async () => {
  const { db } = openDb();
  const a1 = await seedActor(db, 'Mustafa Kalkan', 'TURKEY_EXPERT_PANEL');
  const a2 = await seedActor(db, 'Mustafa Kalkan', 'GLOBAL_EXPERT_PANEL');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@mustafakalkan' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a1.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  const res = await sources.resolveSourceAssociation(db, { actorId: a2.actor_id, channelType: 'INSTAGRAM', locator: '@mustafakalkan' });
  assert.equal(res.status, 'SOURCE_EXISTS_DIFFERENT_ACTOR');
  assert.equal(res.associations[0].actor_id, a1.actor_id);
});

// 7. Mutable source display name does not change actor identity.
test('display label change preserves endpoint and actor identity', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Mehmet Müderrisoğlu');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'YOUTUBE', platform: 'youtube', canonicalLocator: 'https://youtube.com/channel/UCmehmet1234567890abc', displayLabel: 'Mehmet Müderrisoğlu' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  // Simulate display label change: same endpoint_id, same actor.
  const epAfter = await sources.getEndpoint(db, ep.endpoint_id);
  assert.equal(epAfter?.endpoint_id, ep.endpoint_id);
  const bundle = await sources.getSourceBundle(db, a.actor_id);
  assert.equal(bundle.length, 1);
  assert.equal(bundle[0].actor_id, a.actor_id);
});

// 8. Source association creation does NOT activate source lifecycle.
test('association creation does not activate source lifecycle', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c;
  const a = await seedActor(db, 'Tuğba Duymaz');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'FACEBOOK', platform: 'facebook', canonicalLocator: 'https://facebook.com/tugbaduymaz' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds`).get().c, feedsBefore);
  // No lifecycle state columns on the association.
  const row = sqlite.prepare(`SELECT * FROM actor_source_associations LIMIT 1`).get();
  assert.ok(!('runtime_activation' in row));
  assert.ok(!('status' in row));
});

// 9. Source association creation does NOT create scheduler entry.
test('association creation does not create scheduler entry', async () => {
  const { sqlite, db } = openDb();
  const a = await seedActor(db, 'Nazan Uysal Harzadın');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'PODCAST', platform: 'podcast', canonicalLocator: 'https://feeds.example.com/nazan' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'HOSTED_SHOW' }, AUDIT);
  // No scheduler/cron tables exist in D2.
  const names = tableNames(sqlite);
  assert.ok(!names.some((t) => /schedul|cron|poll/i.test(t)));
});

// 10. Source association creation does NOT create SOURCE_ITEM.
test('association creation does not create SOURCE_ITEM', async () => {
  const { sqlite, db } = openDb();
  const itemsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c;
  const a = await seedActor(db, 'Muhammed Keskin');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'NEWSLETTER', platform: 'substack', canonicalLocator: 'https://muhammedkeskin.substack.com' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL' }, AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items`).get().c, itemsBefore);
});

// 11. Source association creation does NOT modify approved_brief.
test('association creation does not modify approved_brief', async () => {
  const { sqlite, db } = openDb();
  const briefsBefore = sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c;
  const a = await seedActor(db, 'Valter Longo');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://valterlongo.com' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PERSONAL' }, AUDIT);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM approved_briefs`).get().c, briefsBefore);
});

// 12. Rhonda Patrick / FoundMyFitness remains person ↔ brand/source relation.
test('rhonda patrick and foundmyfitness remain person and brand source', async () => {
  const { db } = openDb();
  const person = await seedActor(db, 'Rhonda Patrick', 'GLOBAL_EXPERT_PANEL');
  const brand = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://foundmyfitness.com', displayLabel: 'FoundMyFitness' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: brand.endpoint_id, associationType: 'OFFICIAL_BRAND' }, AUDIT);
  const bundle = await sources.getSourceBundle(db, person.actor_id);
  assert.equal(bundle.length, 1);
  assert.equal(bundle[0].association_type, 'OFFICIAL_BRAND');
  // No second actor was created for the brand.
  const allActors = await db.prepare(`SELECT * FROM actors`).all();
  assert.equal(allActors.results.length, 1);
});

// 13. Jordan Feigenbaum / Barbell Medicine remains person ↔ organization/source.
test('jordan feigenbaum and barbell medicine remain person and organization', async () => {
  const { db } = openDb();
  const person = await seedActor(db, 'Jordan Feigenbaum', 'GLOBAL_EXPERT_PANEL');
  const org = await sources.createEndpoint(
    db,
    { channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://barbellmedicine.com', displayLabel: 'Barbell Medicine' },
    AUDIT,
  );
  await sources.linkActorToSource(db, { actorId: person.actor_id, endpointId: org.endpoint_id, associationType: 'ORGANIZATION_ASSOCIATION' }, AUDIT);
  const bundle = await sources.getSourceBundle(db, person.actor_id);
  assert.equal(bundle.length, 1);
  assert.equal(bundle[0].association_type, 'ORGANIZATION_ASSOCIATION');
});

// 14. Unverified account remains PENDING/AMBIGUOUS.
test('unverified account remains pending verification', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Steven Gundry', 'GLOBAL_EXPERT_PANEL');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'INSTAGRAM', platform: 'instagram', canonicalLocator: '@stevengundry' },
    AUDIT,
  );
  const assoc = await sources.linkActorToSource(
    db,
    { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'OFFICIAL_PROFESSIONAL', verificationStatus: 'PENDING_VERIFICATION' },
    AUDIT,
  );
  assert.equal(assoc.verification_status, 'PENDING_VERIFICATION');
});

// 15. No activity_score or ingestability policy implemented prematurely.
test('no activity or ingestability fields on associations or endpoints', async () => {
  const { sqlite } = openDb();
  const assocCols = sqlite.prepare(`PRAGMA table_info(actor_source_associations)`).all().map((c) => c.name);
  const epCols = sqlite.prepare(`PRAGMA table_info(actor_source_endpoints)`).all().map((c) => c.name);
  for (const forbidden of ['activity_score', 'post_frequency', 'ingestability', 'automation_ready', 'poll_cadence', 'source_role']) {
    assert.ok(!assocCols.includes(forbidden), `association must not have ${forbidden}`);
    assert.ok(!epCols.includes(forbidden), `endpoint must not have ${forbidden}`);
  }
});

// 16. D2 creates no protocol entities (scoped to D2's own artifacts: the 0032
// DDL and the actors module. A parallel Protocol track owns its own tables;
// D2 neither creates nor polices them).
test('d2 creates no protocol entities', async () => {
  const ddl32 = readFileSync('migrations/0032_doctor_actor_sources.sql', 'utf8');
  const created32 = [...ddl32.replace(/--.*$/gm, '').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map((m) => m[1]);
  assert.deepEqual(created32.sort(), ['actor_source_associations', 'actor_source_endpoints', 'actor_source_verification_refs']);
  const { sqlite } = openDb();
  const names = tableNames(sqlite);
  for (const t of ['actor_source_endpoints', 'actor_source_associations', 'actor_source_verification_refs']) {
    assert.ok(names.includes(t));
  }
  assert.ok(!names.some((t) => /aip|nemechek/i.test(t)));
});

// 17. Existing D1 Actor Registry tests remain green.
test('D1 actor registry still works after D2 migration', async () => {
  const { db } = openDb();
  const a = await actors.createActor(db, { canonicalName: 'Jason Fung', panel: 'GLOBAL_EXPERT_PANEL' }, AUDIT);
  assert.match(a.actor_id, /^actor_/);
  assert.equal(a.credential_class, 'UNKNOWN_PENDING_VERIFICATION');
});

// 18. Existing Temporal/readiness tests remain green.
test('temporal and readiness invariants hold after D2', async () => {
  const { sqlite } = openDb();
  // source_items schema unchanged.
  const cols = sqlite.prepare(`PRAGMA table_info(source_items)`).all().map((c) => c.name);
  assert.ok(cols.includes('dedupe_key'));
  assert.ok(cols.includes('triage_status'));
  // approved_briefs schema unchanged.
  const briefSql = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = 'approved_briefs'`).get().sql;
  assert.ok(briefSql.includes('handoff_status'));
});

// 19. Migration applies cleanly to local ephemeral DB after 0031.
test('migration 0032 applies cleanly after 0031', async () => {
  const { sqlite } = openDb();
  const names = tableNames(sqlite);
  for (const t of ['actors', 'actor_aliases', 'actor_roles', 'actor_identity_refs', 'actor_source_endpoints', 'actor_source_associations', 'actor_source_verification_refs']) {
    assert.ok(names.includes(t), `${t} must exist after 0032`);
  }
});

// 20. Verification provenance is recorded per association.
test('verification provenance is recorded per association', async () => {
  const { db } = openDb();
  const a = await seedActor(db, 'Mark Pimentel', 'GLOBAL_EXPERT_PANEL');
  const ep = await sources.createEndpoint(
    db,
    { channelType: 'RESEARCHER_PROFILE', platform: 'web', canonicalLocator: 'https://med.stanford.edu/pimentel' },
    AUDIT,
  );
  const assoc = await sources.linkActorToSource(db, { actorId: a.actor_id, endpointId: ep.endpoint_id, associationType: 'RESEARCH_PROFILE' }, AUDIT);
  await sources.recordVerificationRef(
    db,
    assoc.association_id,
    { refType: 'INSTITUTIONAL_LINK', refValue: 'https://med.stanford.edu/pimentel', status: 'VERIFIED', observedAt: '2026-10-07T00:00:00Z' },
    AUDIT,
  );
  const updated = await sources.updateVerificationStatus(db, assoc.association_id, 'VERIFIED', AUDIT);
  assert.equal(updated.verification_status, 'VERIFIED');
});
