// Doctor profile knowledge: typed facts with provenance, multi-value
// coexistence, supersede-never-update chains, validation. Claims and
// clinical truth are out of scope by design. Real D1 (node:sqlite,
// full chain incl. 0046).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const profile = await bundle('apps/worker/src/doctor-profile.ts', 'doctor-profile-k');
const actors = await bundle('apps/worker/src/actors/registry.ts', 'doctor-profile-actors');

const AUDIT = { by: 'test:profile', reason: 'profile knowledge fixture proof' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

async function actor(db, name = 'Bilgi Hekimi') {
  return actors.createActor(db, { canonicalName: name, panel: 'TURKEY_EXPERT_PANEL' }, AUDIT);
}

test('put and read typed facts with provenance; multiple values coexist', async () => {
  const { db } = openDb();
  const a = await actor(db);
  await profile.putFact(db, a.actor_id, {
    factType: 'SPECIALTY', value: { specialty: 'Kardiyoloji' },
    provenance: { source: 'official-website', observedAt: '2026-10-09' },
  }, AUDIT);
  await profile.putFact(db, a.actor_id, {
    factType: 'SPECIALTY', value: { specialty: 'İç Hastalıkları' },
    provenance: { source: 'institutional-profile' },
  }, AUDIT);
  await profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { name: 'Örnek Hastane', role: 'Kardiyoloji Uzmanı' },
    provenance: { source: 'hospital-directory' },
  }, AUDIT);
  const p = await profile.getProfile(db, a.actor_id);
  assert.equal(p.SPECIALTY.length, 2);
  assert.equal(p.INSTITUTION.length, 1);
  assert.equal(p.INSTITUTION[0].value.name, 'Örnek Hastane');
  assert.equal(p.INSTITUTION[0].superseded, false);
  assert.equal(p.CREDENTIAL, undefined);
});

test('correction supersedes exactly one row; history preserved', async () => {
  const { db } = openDb();
  const a = await actor(db);
  const first = await profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { name: 'Eski Hastane' }, provenance: {},
  }, AUDIT);
  const second = await profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { name: 'Yeni Hastane' }, provenance: { source: 'press-release' },
  }, AUDIT);
  // Unrelated second value (not a correction): both current.
  assert.equal((await profile.getProfile(db, a.actor_id)).INSTITUTION.length, 2);
  const fix = await profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { name: 'Yeni Hastane (düzeltme)' },
    provenance: { source: 'owner-attestation' }, supersedesId: second.factId,
  }, AUDIT);
  assert.equal(fix.superseded, second.factId);
  const current = (await profile.getProfile(db, a.actor_id)).INSTITUTION;
  assert.equal(current.length, 2, 'only the targeted row retires');
  assert.ok(current.some((f) => f.value.name === 'Eski Hastane'));
  assert.ok(current.some((f) => f.value.name === 'Yeni Hastane (düzeltme)'));
  const history = await profile.getFactHistory(db, a.actor_id, 'INSTITUTION');
  assert.equal(history.length, 3);
  assert.equal(history.filter((f) => f.superseded).length, 1);
  // Double-supersede of the same row is refused.
  await assert.rejects(profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { name: 'X' }, provenance: {}, supersedesId: second.factId,
  }, AUDIT), /already superseded/);
});

test('validation: unknown actor/type, cross-actor and cross-type supersede refused', async () => {
  const { db } = openDb();
  const a = await actor(db);
  await assert.rejects(profile.putFact(db, 'actor_nope', { factType: 'SPECIALTY', value: {} }, AUDIT), /unknown actor/);
  await assert.rejects(profile.putFact(db, a.actor_id, { factType: 'DIAGNOSIS', value: {} }, AUDIT), /unknown fact type/);
  await assert.rejects(profile.putFact(db, a.actor_id, { factType: 'SPECIALTY', value: [] }, AUDIT), /must be an object/);
  const b = await actor(db, 'İkinci Hekim');
  const f = await profile.putFact(db, a.actor_id, { factType: 'SPECIALTY', value: { s: 'X' }, provenance: {} }, AUDIT);
  await assert.rejects(profile.putFact(db, b.actor_id, {
    factType: 'SPECIALTY', value: { s: 'Y' }, provenance: {}, supersedesId: f.factId,
  }, AUDIT), /must match actor/);
  await assert.rejects(profile.putFact(db, a.actor_id, {
    factType: 'INSTITUTION', value: { n: 'Z' }, provenance: {}, supersedesId: f.factId,
  }, AUDIT), /must match actor and fact type/);
});
