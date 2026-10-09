// Workstream C onboarding runner: APPROVED-only, resolve-first resume,
// zero duplication on re-run, carrier created DISABLED, never activates.
// Real D1 (node:sqlite, full migration chain incl. local 0043).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const onboarding = await bundle('apps/worker/src/doctor-onboarding.ts', 'doctor-onboarding-c');
const candidates = await bundle('apps/worker/src/doctor-candidates.ts', 'doctor-onboarding-cands');
const proposals = await bundle('apps/worker/src/doctor-source-proposals.ts', 'doctor-onboarding-props');
const worker = await bundle('apps/worker/src/index.ts', 'doctor-onboarding-worker');

const OPS_TOKEN = 'test-ops-token';
const ctx = { waitUntil() {}, passThroughOnException() {} };

const AUDIT = { by: 'test:onboarding', reason: 'onboarding runner fixture proof' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const POLICY = {
  panel: 'TURKEY_EXPERT_PANEL',
  channelType: 'OFFICIAL_WEBSITE',
  platform: 'web',
  canonicalLocator: 'https://onboard.example',
  displayLabel: 'Onboard Doctor',
  associationType: 'OFFICIAL_PERSONAL',
  route: 'tip-ogrencileri',
  channelId: 'tip_toplulugu',
  feedUrl: 'https://onboard.example/feed/',
  feedLabel: 'Onboard Doctor blog (test carrier)',
};

async function approvedCandidate(db, name = 'Onboard Hekimi') {
  const { candidateId } = await candidates.proposeCandidate(db, { proposedName: name }, AUDIT);
  await candidates.transitionCandidate(db, candidateId, 'RESEARCHING', AUDIT);
  await candidates.transitionCandidate(db, candidateId, 'READY_FOR_REVIEW', AUDIT);
  await candidates.approveCandidate(db, candidateId, { by: 'owner', reason: 'owner verified identity proof' });
  return candidateId;
}

test('non-approved candidates cannot onboard', async () => {
  const { db } = openDb();
  const { candidateId } = await candidates.proposeCandidate(db, { proposedName: 'Erken Hekim' }, AUDIT);
  await assert.rejects(onboarding.runOnboarding(db, candidateId, POLICY, AUDIT), /NOT_APPROVED/);
  await assert.rejects(onboarding.runOnboarding(db, 'cand_missing', POLICY, AUDIT), /UNKNOWN_CANDIDATE/);
});

test('approved candidate onboards end to end with everything created', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await approvedCandidate(db);
  const r = await onboarding.runOnboarding(db, candidateId, POLICY, AUDIT);
  assert.equal(r.ok, true);
  assert.deepEqual(r.stages, {
    resolve: 'existing', actor: 'created', endpoint: 'created',
    association: 'created', carrier: 'created', done: 'done',
  });
  // Registry rows exist and are linked.
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id = ?`).get(r.actorId).c, 1);
  assert.equal(sqlite.prepare(`SELECT shared_source_ref AS s FROM actor_source_endpoints WHERE endpoint_id = ?`).get(r.endpointId).s, r.carrierFeedId);
  const carrier = sqlite.prepare(`SELECT route, channel_id, enabled FROM source_feeds WHERE id = ?`).get(r.carrierFeedId);
  assert.equal(carrier.route, 'tip-ogrencileri');
  assert.equal(carrier.channel_id, 'tip_toplulugu');
  assert.equal(carrier.enabled, 0, 'carrier starts DISABLED — onboarding never activates');
  // No evaluation: onboarding never implies activation.
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_ingestability WHERE association_id = ?`).get(r.associationId).c, 0);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_items WHERE feed_id = ?`).get(r.carrierFeedId).c, 0);
});

test('re-run resumes without duplicating anything', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await approvedCandidate(db);
  const first = await onboarding.runOnboarding(db, candidateId, POLICY, AUDIT);
  const second = await onboarding.runOnboarding(db, candidateId, POLICY, AUDIT);
  assert.deepEqual(second.stages, {
    resolve: 'existing', actor: 'existing', endpoint: 'existing',
    association: 'existing', carrier: 'existing', done: 'done',
  });
  assert.equal(second.actorId, first.actorId);
  assert.equal(second.associationId, first.associationId);
  assert.equal(second.carrierFeedId, first.carrierFeedId);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id != 'actor_nhlbi'`).get().c, 1);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM source_feeds WHERE id = ?`).get(first.carrierFeedId).c, 1);
});

function post(path, body, token = OPS_TOKEN) {
  return new Request(`https://test.local${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test('route: auth gates first, then strict body validation, then runner errors', async () => {
  const { db } = openDb();
  const env = { DB: db, OPS_TOKEN, ENVIRONMENT: 'test' };
  assert.equal((await worker.default.fetch(post('/api/ops/doctor-onboarding', {}, null), env, ctx)).status, 401);
  assert.equal((await worker.default.fetch(post('/api/ops/doctor-onboarding', {}), env, ctx)).status, 400);
  assert.equal((await worker.default.fetch(
    post('/api/ops/doctor-onboarding', { candidateId: 'x', policy: {}, reason: 'y', extra: 1 }), env, ctx)).status, 400);
  const notFound = await worker.default.fetch(
    post('/api/ops/doctor-onboarding', { candidateId: 'cand_missing', policy: POLICY, reason: 'route proof reason here' }), env, ctx);
  assert.equal(notFound.status, 404);
  const candidateId = await approvedCandidate(db, 'Rota Hekimi');
  const notApproved = await worker.default.fetch(
    post('/api/ops/doctor-onboarding', { candidateId, policy: POLICY, reason: 'short' }), env, ctx);
  // Approved candidate + short reason: runner validation surfaces as 400 (reason too short).
  // Use a non-approved candidate for the 422 path:
  const { candidateId: early } = await candidates.proposeCandidate(db, { proposedName: 'Ham Hekim' }, AUDIT);
  const blocked = await worker.default.fetch(
    post('/api/ops/doctor-onboarding', { candidateId: early, policy: POLICY, reason: 'route proof reason here' }), env, ctx);
  assert.equal(blocked.status, 422);
  assert.equal(notApproved.status, 400);
  // Happy path through the route.
  const ok = await worker.default.fetch(
    post('/api/ops/doctor-onboarding', { candidateId, policy: POLICY, reason: 'route proof reason here' }), env, ctx);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.stages.carrier, 'created');
});

test('policy validation fails closed before any write', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await approvedCandidate(db, 'Dikkat Hekimi');
  const before = sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id != 'actor_nhlbi'`).get().c;
  await assert.rejects(onboarding.runOnboarding(db, candidateId, { ...POLICY, feedUrl: 'gopher://x' }, AUDIT), /VALIDATION_ERROR/);
  await assert.rejects(onboarding.runOnboarding(db, candidateId, POLICY, { by: 't', reason: 'short' }), /VALIDATION_ERROR/);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actors WHERE actor_id != 'actor_nhlbi'`).get().c, before);
});

async function verifiedProposal(db, candidateId, url, channelType) {
  const { proposalId } = await proposals.proposeSource(db, candidateId, { url, channelType }, AUDIT);
  await proposals.transitionProposal(db, proposalId, 'VERIFIED', { by: 'owner', reason: 'owner verified source proof' });
  return proposalId;
}

test('verified proposals onboard as extra sources; rss gets a disabled carrier, manual-only does not', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await approvedCandidate(db, 'Çok Kaynaklı Hekim');
  const rssProposal = await verifiedProposal(db, candidateId, 'https://cok.example/blog/feed', 'OFFICIAL_WEBSITE');
  const igProposal = await verifiedProposal(db, candidateId, 'https://instagram.example/cok', 'INSTAGRAM');
  const r = await onboarding.runOnboarding(db, candidateId, POLICY, AUDIT, {
    sources: [
      {
        proposalId: rssProposal, channelType: 'OFFICIAL_WEBSITE', platform: 'web',
        canonicalLocator: 'https://cok.example/blog/feed', displayLabel: 'Cok Blog',
        associationType: 'OFFICIAL_PERSONAL', feedUrl: 'https://cok.example/blog/feed',
        feedLabel: 'Cok carrier', route: 'tip-ogrencileri', channelId: 'tip_toplulugu',
      },
      {
        proposalId: igProposal, channelType: 'INSTAGRAM', platform: 'instagram',
        canonicalLocator: 'https://instagram.example/cok', displayLabel: 'Cok IG',
        associationType: 'CONTRIBUTOR',
      },
    ],
  });
  assert.equal(r.sources.length, 3, 'primary + 2 proposal sources');
  const [primary, rss, ig] = r.sources;
  assert.equal(rss.proposalId, rssProposal);
  assert.ok(rss.carrierFeedId);
  assert.equal(sqlite.prepare(`SELECT enabled AS e FROM source_feeds WHERE id = ?`).get(rss.carrierFeedId).e, 0);
  assert.equal(ig.proposalId, igProposal);
  assert.equal(ig.carrierFeedId, null, 'manual-only types get no carrier');
  assert.ok(primary.associationId !== rss.associationId && rss.associationId !== ig.associationId);
  // Proposals marked REGISTERED; still no activation anywhere.
  for (const p of [rssProposal, igProposal]) {
    const row = sqlite.prepare(`SELECT lifecycle AS l FROM doctor_source_proposals WHERE proposal_id = ?`).get(p);
    assert.equal(row.l, 'REGISTERED');
  }
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_ingestability`).get().c, 0);
});

test('unverified proposals and foreign proposals are refused', async () => {
  const { sqlite, db } = openDb();
  const candidateId = await approvedCandidate(db, 'Tedbir Hekimi');
  const { proposalId } = await proposals.proposeSource(
    db, candidateId, { url: 'https://tedbir.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const before = sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_endpoints`).get().c;
  await assert.rejects(onboarding.runOnboarding(db, candidateId, POLICY, AUDIT, {
    sources: [{ proposalId, channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://tedbir.example/', displayLabel: 'T', associationType: 'OFFICIAL_PERSONAL' }],
  }), /NOT_VERIFIED/);
  const other = await approvedCandidate(db, 'Öteki Hekim');
  const { proposalId: foreign } = await proposals.proposeSource(
    db, other, { url: 'https://oteki.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  await proposals.transitionProposal(db, foreign, 'VERIFIED', { by: 'owner', reason: 'owner verified source proof' });
  await assert.rejects(onboarding.runOnboarding(db, candidateId, POLICY, AUDIT, {
    sources: [{ proposalId: foreign, channelType: 'OFFICIAL_WEBSITE', platform: 'web', canonicalLocator: 'https://oteki.example/', displayLabel: 'O', associationType: 'OFFICIAL_PERSONAL' }],
  }), /MISMATCH/);
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM actor_source_endpoints`).get().c, before);
});
