// H Doctor readiness: bounded read-only snapshot over the real chain
// (actor → endpoint → association → carrier → items → briefs).
// Proves counts, per-association position, attention flags, auth gating,
// and zero mutations. Real D1 (node:sqlite, full migration chain).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const status = await bundle('apps/worker/src/doctor-status.ts', 'doctor-status-h');
const candidates = await bundle('apps/worker/src/doctor-candidates.ts', 'doctor-status-cands');
const proposals = await bundle('apps/worker/src/doctor-source-proposals.ts', 'doctor-status-props');
const worker = await bundle('apps/worker/src/index.ts', 'doctor-status-worker');

const OPS_TOKEN = 'test-ops-token';
const AUDIT = { by: 'test:readiness', reason: 'readiness discovery fixture proof' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

function seedChain(sqlite, tag = 'rd') {
  // Protocol-owned actor WITHOUT associations is never a Doctor.
  sqlite.prepare(`INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
    VALUES ('actor_protocol_x', 'Protocol Institution', 'protocol institution', 'GLOBAL_EXPERT_PANEL', 'protocol-seed', 'seed')`).run();
  sqlite.prepare(`INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
    VALUES ('actor_${tag}', 'Readiness Doctor', 'readiness doctor', 'TURKEY_EXPERT_PANEL', 'test', 'test')`).run();
  sqlite.prepare(`INSERT INTO actor_source_endpoints
    (endpoint_id, channel_type, platform, canonical_locator, normalized_locator, platform_external_id, display_label, shared_source_ref)
    VALUES ('ep_${tag}', 'OFFICIAL_WEBSITE', 'web', 'https://ready.example', 'ready.example/', NULL, 'Ready', 'feed_${tag}')`).run();
  sqlite.prepare(`INSERT INTO actor_source_associations
    (association_id, actor_id, endpoint_id, association_type, verification_status, identity_confidence, created_by, created_reason)
    VALUES ('assoc_${tag}', 'actor_${tag}', 'ep_${tag}', 'OFFICIAL_PERSONAL', 'PENDING_VERIFICATION', 'PENDING_IDENTITY_RESOLUTION', 'test', 'test')`).run();
  sqlite.prepare(`INSERT INTO source_feeds (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled)
    VALUES ('feed_${tag}', 'ready carrier', 'tip-ogrencileri', 'tip_toplulugu', 'RSS', 'https://ready.example/feed', 60, 0)`).run();
  sqlite.prepare(`INSERT INTO source_items
    (id, feed_id, route, channel_id, title, summary, canonical_url, publisher, triage_status, dedupe_key)
    VALUES ('item_${tag}_1', 'feed_${tag}', 'tip-ogrencileri', 'tip_toplulugu', 'T1', 'S1', 'https://ready.example/1', 'Ready', 'inbox', 'https://ready.example/1'),
           ('item_${tag}_2', 'feed_${tag}', 'tip-ogrencileri', 'tip_toplulugu', 'T2', 'S2', 'https://ready.example/2', 'Ready', 'production', 'https://ready.example/2')`).run();
  sqlite.prepare(`INSERT INTO approved_briefs (brief_id, source_item_id, route, channel_id, payload_json, handoff_status, handoff_detail)
    VALUES ('brief_${tag}', 'item_${tag}_2', 'tip-ogrencileri', 'tip_toplulugu', '{}', 'failed', 'test')`).run();
}

function tableCounts(sqlite) {
  const names = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const out = {};
  for (const t of names) out[t] = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  return out;
}

test('readiness counts the doctor chain and excludes protocol-only actors', async () => {
  const { sqlite, db } = openDb();
  seedChain(sqlite);
  const r = await status.doctorReadiness(db);
  assert.equal(r.ok, true);
  assert.equal(r.counts.doctorActors, 1);
  assert.equal(r.counts.endpoints, 1);
  assert.equal(r.counts.associations, 1);
  assert.equal(r.counts.items, 2);
  assert.equal(r.counts.inboxItems, 1);
  assert.equal(r.counts.briefs, 1);
  assert.equal(r.counts.carriers, 1);
  assert.equal(r.counts.carriersEnabled, 0);
  const [a] = r.associations;
  assert.equal(a.associationId, 'assoc_rd');
  assert.equal(a.latestIngestability, null);
  assert.equal(a.carrierEnabled, 0);
  assert.ok(typeof a.lastFetchAt === 'string', 'last fetch surfaces from item fetched_at');
  assert.deepEqual(r.attention, []);
});

test('orphan carrier refs and polling-eligible combos surface as attention', async () => {
  const { sqlite, db } = openDb();
  seedChain(sqlite, 'att');
  sqlite.prepare(`UPDATE source_feeds SET enabled = 1 WHERE id = 'feed_att'`).run();
  sqlite.prepare(`INSERT INTO actor_source_ingestability
    (evaluation_id, association_id, endpoint_id, status, reason_code, evaluated_by, evaluated_reason, evaluated_at)
    VALUES ('eval_att', 'assoc_att', 'ep_att', 'INGESTABLE', 'NONE', 'test', 'test', '2026-10-09T00:00:00.000Z')`).run();
  // Orphan: point a second association at a missing feed.
  sqlite.prepare(`INSERT INTO actor_source_endpoints
    (endpoint_id, channel_type, platform, canonical_locator, normalized_locator, platform_external_id, display_label, shared_source_ref)
    VALUES ('ep_orphan', 'OFFICIAL_WEBSITE', 'web', 'https://orphan.example', 'orphan.example/', NULL, 'Orphan', 'feed_missing')`).run();
  sqlite.prepare(`INSERT INTO actor_source_associations
    (association_id, actor_id, endpoint_id, association_type, verification_status, identity_confidence, created_by, created_reason)
    VALUES ('assoc_orphan', 'actor_att', 'ep_orphan', 'OFFICIAL_BRAND', 'PENDING_VERIFICATION', 'PENDING_IDENTITY_RESOLUTION', 'test', 'test')`).run();
  const r = await status.doctorReadiness(db);
  assert.ok(r.attention.some((s) => s.startsWith('ORPHAN_CARRIER_REF:assoc_orphan')), JSON.stringify(r.attention));
  assert.ok(r.attention.some((s) => s.startsWith('POLLING_ELIGIBLE:assoc_att')), JSON.stringify(r.attention));
});

test('route is gated (401/503) and performs zero writes', async () => {
  const { sqlite, db } = openDb();
  seedChain(sqlite, 'rt');
  const before = tableCounts(sqlite);
  const env = { DB: db, OPS_TOKEN, ENVIRONMENT: 'test' };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const noAuth = await worker.default.fetch(new Request('https://t.local/api/ops/doctor-readiness'), env, ctx);
  assert.equal(noAuth.status, 401);
  const wrong = await worker.default.fetch(
    new Request('https://t.local/api/ops/doctor-readiness', { headers: { Authorization: 'Bearer nope' } }), env, ctx);
  assert.equal(wrong.status, 401);
  const unset = await worker.default.fetch(
    new Request('https://t.local/api/ops/doctor-readiness', { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }),
    { DB: db, ENVIRONMENT: 'test' }, ctx);
  assert.equal(unset.status, 503);
  const ok = await worker.default.fetch(
    new Request('https://t.local/api/ops/doctor-readiness', { headers: { Authorization: `Bearer ${OPS_TOKEN}` } }), env, ctx);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.counts.doctorActors, 1);
  assert.deepEqual(tableCounts(sqlite), before);
});

test('discovery backlog surfaces candidates, open proposals and approved-not-onboarded', async () => {
  const { db } = openDb();
  const discovered = await candidates.proposeCandidate(db, { proposedName: 'Backlog Hekimi' }, AUDIT);
  void discovered;
  const { candidateId: approved } = await candidates.proposeCandidate(db, { proposedName: 'Onaysız Kurulum' }, AUDIT);
  await candidates.transitionCandidate(db, approved, 'RESEARCHING', AUDIT);
  await candidates.transitionCandidate(db, approved, 'READY_FOR_REVIEW', AUDIT);
  await candidates.approveCandidate(db, approved, { by: 'owner', reason: 'owner verified backlog proof' });
  await proposals.proposeSource(db, approved, { url: 'https://backlog.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const r = await status.doctorReadiness(db);
  assert.equal(r.discovery.candidatesByLifecycle.DISCOVERED, 1);
  assert.equal(r.discovery.candidatesByLifecycle.APPROVED, 1);
  assert.equal(r.discovery.openProposals, 1);
  assert.deepEqual(r.discovery.approvedNotOnboarded, [approved]);
});

test('pre-0044 schema degrades discovery to zeros without breaking readiness', async () => {
  const throwing = { prepare() { throw new Error('no-table'); }, batch: async () => [] };
  const r = await status.doctorReadiness(throwing);
  assert.equal(r.ok, true);
  assert.deepEqual(r.discovery, { candidatesByLifecycle: {}, openProposals: 0, approvedNotOnboarded: [] });
  assert.deepEqual(r.associations, []);
});
