// Source proposals: validation, budgets, lifecycle, evidence-backed probe
// assessment (stub io, no network), probe persistence with auto-verify
// only on supporting signals. Real D1 (node:sqlite, full chain incl. 0045).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from './sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const proposals = await bundle('apps/worker/src/doctor-source-proposals.ts', 'doctor-proposals-p');
const candidates = await bundle('apps/worker/src/doctor-candidates.ts', 'doctor-proposals-cands');

const AUDIT = { by: 'test:proposals', reason: 'proposal queue fixture proof' };

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

async function candidate(db, name = 'Teklif Hekimi') {
  const { candidateId } = await candidates.proposeCandidate(db, { proposedName: name }, AUDIT);
  return candidateId;
}

const stubIo = (over = {}) => ({
  fetchText: async (url) => {
    if (url.endsWith('/robots.txt')) return { ok: true, status: 200, text: 'User-agent: *\nDisallow: /wp-admin/\n', contentType: 'text/plain' };
    return { ok: true, status: 200, text: '<rss><item>a</item><item>b</item></rss>', contentType: 'application/rss+xml' };
  },
  parseItems: (text) => (text.match(/<item>/g) || []).length,
  checkTarget: () => ({ blocked: false, reason: null }),
  ...over,
});

test('propose validates candidate, url, enums, budgets; idempotent on duplicates', async () => {
  const { sqlite, db } = openDb();
  const id = await candidate(db);
  await assert.rejects(proposals.proposeSource(db, 'cand_nope', { url: 'https://x.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT), /unknown candidate/);
  await assert.rejects(proposals.proposeSource(db, id, { url: 'gopher://x', channelType: 'OFFICIAL_WEBSITE' }, AUDIT), /VALIDATION_ERROR/);
  await assert.rejects(proposals.proposeSource(db, id, { url: 'https://x.example/', channelType: 'TIKTOK' }, AUDIT), /unknown channel type/);
  const a = await proposals.proposeSource(db, id, { url: 'https://teklif.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  assert.equal(a.created, true);
  const b = await proposals.proposeSource(db, id, { url: 'https://instagram.example/teklif', channelType: 'INSTAGRAM' }, AUDIT);
  assert.equal(b.created, true);
  const dup = await proposals.proposeSource(db, id, { url: 'https://instagram.example/teklif', channelType: 'INSTAGRAM' }, AUDIT);
  assert.equal(dup.created, false);
  assert.equal(dup.proposalId, b.proposalId);
  // Capability snapshot recorded at proposal time.
  const cap = sqlite.prepare(`SELECT capability_acquisition AS c FROM doctor_source_proposals WHERE proposal_id = ?`).get(a.proposalId).c;
  assert.equal(cap, 'rss');
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS c FROM doctor_source_proposals`).get().c, 2);
});

test('rejected candidates accept no proposals', async () => {
  const { db } = openDb();
  const id = await candidate(db, 'Reddedilen Hekim');
  await candidates.transitionCandidate(db, id, 'RESEARCHING', AUDIT);
  await candidates.transitionCandidate(db, id, 'REJECTED', { by: 'owner', reason: 'owner rejected identity proof' });
  await assert.rejects(proposals.proposeSource(db, id, { url: 'https://r.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT), /REJECTED/);
});

test('probe verifies rss feeds, parks html and unreachable without inventing support', async () => {
  const { db } = openDb();
  const id = await candidate(db);
  const { proposalId } = await proposals.proposeSource(db, id, { url: 'https://probe.example/feed', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const signals = await proposals.probeSourceUrl('https://probe.example/feed', stubIo());
  assert.equal(signals.reachable, true);
  assert.equal(signals.feedItems, 2);
  const rec = await proposals.recordProbe(db, proposalId, 'OFFICIAL_WEBSITE', signals, AUDIT);
  assert.equal(rec.verified, true);
  assert.equal(rec.confidence, 'HIGH');
  const rows = await proposals.listProposalsByCandidate(db, id);
  assert.equal(rows.find((r) => r.proposal_id === proposalId).lifecycle, 'VERIFIED');

  // HTML content: reachable but no feed → stays PROPOSED.
  const { proposalId: html } = await proposals.proposeSource(db, id, { url: 'https://html.example/', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const htmlSignals = await proposals.probeSourceUrl('https://html.example/', stubIo({
    fetchText: async (url) => url.endsWith('/robots.txt')
      ? { ok: false, status: 404, text: '', contentType: '' }
      : { ok: true, status: 200, text: '<html></html>', contentType: 'text/html' },
  }));
  assert.equal(htmlSignals.feedItems, null);
  const htmlRec = await proposals.recordProbe(db, html, 'OFFICIAL_WEBSITE', htmlSignals, AUDIT);
  assert.equal(htmlRec.verified, false);
  assert.equal((await proposals.listProposalsByCandidate(db, id)).find((r) => r.proposal_id === html).lifecycle, 'PROPOSED');

  // Unreachable: stays PROPOSED with reasons.
  const { proposalId: dead } = await proposals.proposeSource(db, id, { url: 'https://dead.example/f', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const deadRec = await proposals.recordProbe(db, dead, 'OFFICIAL_WEBSITE', {
    reachable: false, httpStatus: 0, contentType: null, bytes: 0, robotsAllowed: null, feedItems: null, notes: ['dns-fail'],
  }, AUDIT);
  assert.equal(deadRec.verified, false);

  // Manual-only type with a reachable profile: VERIFIED/MEDIUM (existence, not ingestion).
  const { proposalId: ig } = await proposals.proposeSource(db, id, { url: 'https://instagram.example/doktor', channelType: 'INSTAGRAM' }, AUDIT);
  const igRec = await proposals.recordProbe(db, ig, 'INSTAGRAM', {
    reachable: true, httpStatus: 200, contentType: 'text/html', bytes: 42, robotsAllowed: true, feedItems: null, notes: ['profile-page'],
  }, AUDIT);
  assert.equal(igRec.verified, true);
  assert.equal(igRec.confidence, 'MEDIUM');
});

test('probe is single-shot on PROPOSED; terminal transitions are final', async () => {
  const { db } = openDb();
  const id = await candidate(db);
  const { proposalId } = await proposals.proposeSource(db, id, { url: 'https://once.example/f', channelType: 'OFFICIAL_WEBSITE' }, AUDIT);
  const signals = { reachable: true, httpStatus: 200, contentType: 'application/rss+xml', bytes: 9, robotsAllowed: true, feedItems: 1, notes: [] };
  await proposals.recordProbe(db, proposalId, 'OFFICIAL_WEBSITE', signals, AUDIT);
  await assert.rejects(proposals.recordProbe(db, proposalId, 'OFFICIAL_WEBSITE', signals, AUDIT), /PROBE_FORBIDDEN/);
  await assert.rejects(proposals.transitionProposal(db, proposalId, 'PROPOSED', AUDIT), /TRANSITION_FORBIDDEN/);
  await proposals.transitionProposal(db, proposalId, 'REGISTERED', { by: 'ops:onboarding', reason: 'runner registered endpoint proof' });
  const rows = await proposals.listProposalsByCandidate(db, id);
  assert.equal(rows.find((r) => r.proposal_id === proposalId).lifecycle, 'REGISTERED');
});

test('robots-denied feeds never verify', async () => {
  const a = proposals.assessProbe('OFFICIAL_WEBSITE', {
    reachable: true, httpStatus: 200, contentType: 'application/rss+xml', bytes: 99,
    robotsAllowed: false, feedItems: 10, notes: [],
  });
  assert.equal(a.verifiable, false);
  assert.ok(a.notes.includes('robots-denied'));
});
