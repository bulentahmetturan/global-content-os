import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { bundle, d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const knowledge = await bundle('apps/worker/src/actors/knowledge.ts', 'doctor-knowledge');
const registry = await bundle('apps/worker/src/actors/registry.ts', 'doctor-knowledge-registry');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

async function actor(db, name = 'Dr Knowledge Example') {
  return registry.createActor(db, {
    canonicalName: name,
    panel: 'TURKEY_EXPERT_PANEL',
    credentialClass: 'PHYSICIAN',
    credentialStatus: 'VERIFIED',
    identityConfidence: 'HIGH_CONFIDENCE',
  }, { by: 'test', reason: 'knowledge slice' });
}

test('publications record with attribution and dedupe by canonical url', async () => {
  const { db } = openDb();
  const a = await actor(db);
  const first = await knowledge.recordPublication(db, {
    actorId: a.actor_id, kind: 'INTERVIEW', title: 'Heart health talk',
    publisher: 'Example Media', publishedAt: '2026-09-01', canonicalUrl: 'https://media.example/heart-talk',
  });
  assert.equal(first.kind, 'INTERVIEW');
  const dupe = await knowledge.recordPublication(db, {
    actorId: a.actor_id, kind: 'INTERVIEW', title: 'Heart health talk (changed title)',
    canonicalUrl: 'https://media.example/heart-talk',
  });
  assert.equal(dupe.publication_id, first.publication_id, 'same canonical url returns the existing row');
  assert.equal(dupe.title, 'Heart health talk', 'the stored wording is never rewritten by a duplicate');
  const listed = await knowledge.listActorPublications(db, a.actor_id);
  assert.equal(listed.length, 1);
  await assert.rejects(
    knowledge.recordPublication(db, { actorId: 'actor-missing', kind: 'ARTICLE', title: 'X' }),
    /DOCTOR_KNOWLEDGE_UNKNOWN_ACTOR/,
  );
  await assert.rejects(
    knowledge.recordPublication(db, { actorId: a.actor_id, kind: 'NEWSPAPER', title: 'X' }),
    /DOCTOR_KNOWLEDGE_INVALID/,
  );
  await assert.rejects(
    knowledge.recordPublication(db, { actorId: a.actor_id, kind: 'ARTICLE', title: '  ' }),
    /DOCTOR_KNOWLEDGE_INVALID/,
  );
});

test('statements carry evidence status but are never validated fact', async () => {
  const { db } = openDb();
  const a = await actor(db);
  const pub = await knowledge.recordPublication(db, {
    actorId: a.actor_id, kind: 'RESEARCH_PAPER', title: 'Sleep study', canonicalUrl: 'https://doi.example/10.1/sleep',
  });
  const statement = await knowledge.recordStatement(db, {
    actorId: a.actor_id, publicationId: pub.publication_id,
    statementText: 'Short sleep correlates with higher resting heart rate.',
    statementClass: 'HEALTH_CLAIM', extractedAt: '2026-09-02T00:00:00.000Z',
  });
  assert.equal(statement.evidence_status, 'UNKNOWN');
  await assert.rejects(
    knowledge.recordStatement(db, {
      actorId: a.actor_id, statementText: 'X cures Y.', statementClass: 'HEALTH_CLAIM',
      evidenceStatus: 'VALIDATED', extractedAt: '2026-09-02T00:00:00.000Z',
    }),
    /DOCTOR_KNOWLEDGE_INVALID/,
    'VALIDATED is not a storable status',
  );
  await assert.rejects(
    knowledge.recordStatement(db, {
      actorId: a.actor_id, publicationId: 'pub-missing', statementText: 'X.',
      statementClass: 'GENERAL', extractedAt: '2026-09-02T00:00:00.000Z',
    }),
    /DOCTOR_KNOWLEDGE_UNKNOWN_PUBLICATION/,
  );
  const other = await actor(db, 'Dr Other Example');
  await assert.rejects(
    knowledge.recordStatement(db, {
      actorId: other.actor_id, publicationId: pub.publication_id, statementText: 'Borrowed.',
      statementClass: 'GENERAL', extractedAt: '2026-09-02T00:00:00.000Z',
    }),
    /DOCTOR_KNOWLEDGE_PUBLICATION_ACTOR_MISMATCH/,
  );
});

test('statement revision chains supersede within one actor only', async () => {
  const { db } = openDb();
  const a = await actor(db);
  const first = await knowledge.recordStatement(db, {
    actorId: a.actor_id, statementText: 'Drink eight glasses.', statementClass: 'CLINICAL_RECOMMENDATION',
    extractedAt: '2026-08-01T00:00:00.000Z',
  });
  const second = await knowledge.recordStatement(db, {
    actorId: a.actor_id, statementText: 'Drink to thirst.', statementClass: 'CLINICAL_RECOMMENDATION',
    extractedAt: '2026-09-01T00:00:00.000Z', supersedesId: first.statement_id,
  });
  assert.equal(second.statement_id === first.statement_id, false);
  const rows = await knowledge.listActorStatements(db, a.actor_id, 'CLINICAL_RECOMMENDATION');
  assert.deepEqual(
    rows.map((row) => [row.statement_text, row.evidence_status]),
    [['Drink eight glasses.', 'SUPERSEDED'], ['Drink to thirst.', 'UNKNOWN']],
  );
  const other = await actor(db, 'Dr Chain Other');
  await assert.rejects(
    knowledge.recordStatement(db, {
      actorId: other.actor_id, statementText: 'Mine now.', statementClass: 'GENERAL',
      extractedAt: '2026-09-02T00:00:00.000Z', supersedesId: first.statement_id,
    }),
    /DOCTOR_KNOWLEDGE_SUPERSEDE_ACTOR_MISMATCH/,
  );
  await assert.rejects(
    knowledge.recordStatement(db, {
      actorId: a.actor_id, statementText: 'Ghost.', statementClass: 'GENERAL',
      extractedAt: '2026-09-02T00:00:00.000Z', supersedesId: 'statement-missing',
    }),
    /DOCTOR_KNOWLEDGE_UNKNOWN_SUPERSEDED/,
  );
});
