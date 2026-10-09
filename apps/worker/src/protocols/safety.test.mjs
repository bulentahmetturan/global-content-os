// P6 safety acceptance: explicit constraints with strict lineage, generic
// applicability contexts, stance-free claim/evidence linkage, no inference.
// Ephemeral node:sqlite only. Fixtures use neutral synthetic wording and
// never constitute medical advice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite, bundle } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const protocols = await bundle('apps/worker/src/protocols/registry.ts', 'protocol-safety-endpoints');
const claims = await bundle('apps/worker/src/protocols/claims.ts', 'protocol-safety-claims');
const evidence = await bundle('apps/worker/src/protocols/evidence.ts', 'protocol-safety-evidence');
const safety = await bundle('apps/worker/src/protocols/safety.ts', 'protocol-safety');

function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
    sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  }
  return { sqlite, db: d1FromSqlite(sqlite) };
}

const tableColumns = (sqlite, table) =>
  sqlite.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);

function insertActor(sqlite, id) {
  sqlite.prepare(
    `INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
     VALUES (?, ?, ?, 'GLOBAL_EXPERT_PANEL', 'test:p6', 'P6 fixture')`,
  ).run(id, `Name ${id}`, id.replace(/_/g, ' '));
}

let itemSeq = 0;
function insertItem(sqlite) {
  itemSeq += 1;
  const feed = sqlite.prepare('SELECT id, route, channel_id FROM source_feeds LIMIT 1').get();
  const id = `item_p6_${itemSeq}`;
  sqlite.prepare(
    `INSERT INTO source_items (id, feed_id, route, channel_id, title, canonical_url, publisher, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, feed.id, feed.route, feed.channel_id, `P6 fixture ${itemSeq}`, `https://example.org/p6/${itemSeq}`, 'P6', `p6-${itemSeq}`);
  return id;
}

function rule(db, id, over = {}) {
  return safety.createSafetyRule(db, {
    rule_id: id, protocol_id: 'mediterranean-diet', safety_type: 'MONITORING',
    severity: 'INFO', title: `Fixture note ${id}.`, ...over,
  });
}

async function structure(db) {
  await protocols.createProtocolVersion(db, { version_id: 'fod-v1', protocol_id: 'low-fodmap-diet', version_seq: 1 });
  await protocols.createProtocolVersion(db, { version_id: 'fod-v2', protocol_id: 'low-fodmap-diet', version_seq: 2 });
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p1', version_id: 'fod-v1', phase_seq: 1 });
  await protocols.createProtocolComponent(db, { component_id: 'fod-c1', version_id: 'fod-v1', phase_id: 'fod-p1', component_seq: 1, title: 'C' });
  await protocols.createProtocolComponent(db, { component_id: 'fod-c0', version_id: 'fod-v1', component_seq: 2, title: 'U' });
}

// ---- CORE SAFETY TESTS ----

test('protocol-wide rule created with stable immutable ID', async () => {
  const { db } = openDb();
  const r = await rule(db, 'sfr_wide');
  assert.equal(r.protocol_id, 'mediterranean-diet');
  assert.equal(r.protocol_version_id, null);
  assert.deepEqual(await safety.getSafetyRule(db, 'sfr_wide'), r);
});

test('invalid protocol fails; type and severity constrained', async () => {
  const { sqlite, db } = openDb();
  await assert.rejects(() => rule(db, 'sfr_bad', { protocol_id: 'no-such-protocol' }));
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO safety_rules (rule_id, protocol_id, safety_type, severity, title)
       VALUES ('sfr_t', 'mediterranean-diet', 'BOGUS', 'INFO', 'T.')`,
    ).run(),
  );
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO safety_rules (rule_id, protocol_id, safety_type, severity, title)
       VALUES ('sfr_s', 'mediterranean-diet', 'MONITORING', 'BOGUS', 'T.')`,
    ).run(),
  );
});

test('scope identity immutable; title/detail/active_status editable', async () => {
  const { sqlite, db } = openDb();
  await rule(db, 'sfr_keys');
  assert.throws(
    () => sqlite.prepare(`UPDATE safety_rules SET protocol_id = 'dash-eating-plan' WHERE rule_id = 'sfr_keys'`).run(),
    /SAFETY_RULE_KEYS_IMMUTABLE/,
  );
  assert.throws(
    () => sqlite.prepare(`UPDATE safety_rules SET severity = 'CRITICAL' WHERE rule_id = 'sfr_keys'`).run(),
    /SAFETY_RULE_KEYS_IMMUTABLE/,
  );
  sqlite.prepare(`UPDATE safety_rules SET title = 'Retitled.' WHERE rule_id = 'sfr_keys'`).run();
  assert.equal((await safety.getSafetyRule(db, 'sfr_keys')).title, 'Retitled.');
});

test('exact duplicate structured rule fails; distinct wording coexists', async () => {
  const { db } = openDb();
  await rule(db, 'sfr_dup1', { title: 'Same fixture note.' });
  await assert.rejects(
    () => rule(db, 'sfr_dup2', { title: 'Same fixture note.' }),
    /SAFETY_RULE_DUPLICATE/,
  );
  await rule(db, 'sfr_dup3', { title: 'Different fixture note.' });
  assert.equal((await safety.listProtocolSafetyRules(db, 'mediterranean-diet')).length, 2);
});

// ---- VERSION SCOPE ----

test('version-scoped rule; cross-protocol version mismatch fails (API + SQL)', async () => {
  const { sqlite, db } = openDb();
  await structure(db);
  const r = await rule(db, 'sfr_ver', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', safety_type: 'PRECAUTION', severity: 'MODERATE', title: 'Version note.' });
  assert.equal(r.protocol_version_id, 'fod-v1');
  assert.deepEqual((await safety.listProtocolVersionSafetyRules(db, 'fod-v1')).map((x) => x.rule_id), ['sfr_ver']);
  await assert.rejects(
    () => rule(db, 'sfr_verx', { protocol_id: 'dash-eating-plan', protocol_version_id: 'fod-v1', title: 'Mismatch.' }),
    /SAFETY_LINEAGE_MISMATCH/,
  );
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO safety_rules (rule_id, protocol_id, protocol_version_id, safety_type, severity, title)
       VALUES ('sfr_verx_sql', 'dash-eating-plan', 'fod-v1', 'PRECAUTION', 'LOW', 'Mismatch.')`,
    ).run(),
  );
});

test('historical version may carry a rule without affecting latest', async () => {
  const { db } = openDb();
  await structure(db);
  await rule(db, 'sfr_hist', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', title: 'Historic note.' });
  assert.equal((await protocols.getLatestProtocolVersion(db, 'low-fodmap-diet')).version_id, 'fod-v2');
});

// ---- PHASE / COMPONENT SCOPE ----

test('phase-scoped rule passes when lineage valid; cross-version phase fails', async () => {
  const { db } = openDb();
  await structure(db);
  const r = await rule(db, 'sfr_phase', {
    protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', phase_id: 'fod-p1',
    safety_type: 'MONITORING', severity: 'LOW', title: 'Phase note.',
  });
  assert.equal(r.phase_id, 'fod-p1');
  assert.deepEqual((await safety.listPhaseSafetyRules(db, 'fod-p1')).map((x) => x.rule_id), ['sfr_phase']);
  await assert.rejects(
    () => rule(db, 'sfr_phasex', {
      protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v2', phase_id: 'fod-p1', title: 'Mismatch.',
    }),
    /SAFETY_LINEAGE_MISMATCH/,
  );
});

test('component-scoped rule passes when lineage valid; cross-version component fails', async () => {
  const { db } = openDb();
  await structure(db);
  const r = await rule(db, 'sfr_comp', {
    protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', component_id: 'fod-c0',
    safety_type: 'PRECAUTION', severity: 'LOW', title: 'Component note.',
  });
  assert.equal(r.component_id, 'fod-c0');
  assert.deepEqual((await safety.listComponentSafetyRules(db, 'fod-c0')).map((x) => x.rule_id), ['sfr_comp']);
  await assert.rejects(
    () => rule(db, 'sfr_compx', {
      protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v2', component_id: 'fod-c0', title: 'Mismatch.',
    }),
    /SAFETY_LINEAGE_MISMATCH/,
  );
});

test('contradictory phase+component pairing fails closed', async () => {
  const { sqlite, db } = openDb();
  await structure(db);
  await protocols.createProtocolPhase(db, { phase_id: 'fod-p2', version_id: 'fod-v1', phase_seq: 2 });
  // fod-c1 sits in fod-p1; claiming it under fod-p2 is contradictory.
  await assert.rejects(
    () => rule(db, 'sfr_contra', {
      protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1',
      phase_id: 'fod-p2', component_id: 'fod-c1', title: 'Contradictory.',
    }),
    /SAFETY_LINEAGE_MISMATCH/,
  );
  // Unphased component under a phase is valid.
  const ok = await rule(db, 'sfr_ok', {
    protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1',
    phase_id: 'fod-p2', component_id: 'fod-c0', title: 'Compatible.',
  });
  assert.equal(ok.phase_id, 'fod-p2');
  assert.throws(
    () => sqlite.prepare(
      `INSERT INTO safety_rules (rule_id, protocol_id, protocol_version_id, phase_id, component_id, safety_type, severity, title)
       VALUES ('sfr_contra_sql', 'low-fodmap-diet', 'fod-v1', 'fod-p2', 'fod-c1', 'PRECAUTION', 'LOW', 'Contradictory.')`,
    ).run(),
    /SAFETY_LINEAGE_MISMATCH/,
  );
});

test('phase scope without version fails closed', async () => {
  const { db } = openDb();
  await structure(db);
  await assert.rejects(
    () => rule(db, 'sfr_nov', { protocol_id: 'low-fodmap-diet', phase_id: 'fod-p1', title: 'No version.' }),
    /SAFETY_LINEAGE_MISMATCH/,
  );
});

// ---- CONTEXT TESTS ----

test('rule may carry one or many contexts, retrieved deterministically', async () => {
  const { db } = openDb();
  await rule(db, 'sfr_ctx');
  await safety.createSafetyRuleContext(db, { context_id: 'sfctx_2', rule_id: 'sfr_ctx', context_type: 'POPULATION', context_label: 'test-population-beta' });
  await safety.createSafetyRuleContext(db, { context_id: 'sfctx_1', rule_id: 'sfr_ctx', context_type: 'LIFE_STAGE', context_label: 'test-life-stage-alpha' });
  const list = await safety.listSafetyRuleContexts(db, 'sfr_ctx');
  assert.deepEqual(list.map((c) => c.context_id), ['sfctx_1', 'sfctx_2']);
  assert.deepEqual(await safety.listSafetyRuleContexts(db, 'sfr_ctx'), list);
});

test('context to nonexistent rule fails; exact duplicate context fails', async () => {
  const { db } = openDb();
  await rule(db, 'sfr_ctx');
  await assert.rejects(() => safety.createSafetyRuleContext(db, {
    context_id: 'sfctx_x', rule_id: 'sfr_missing', context_type: 'OTHER', context_label: 'test',
  }));
  await safety.createSafetyRuleContext(db, { context_id: 'sfctx_a', rule_id: 'sfr_ctx', context_type: 'CONDITION', context_label: 'test-condition-gamma' });
  await assert.rejects(() => safety.createSafetyRuleContext(db, {
    context_id: 'sfctx_b', rule_id: 'sfr_ctx', context_type: 'CONDITION', context_label: 'test-condition-gamma',
  }));
});

test('contexts carry no user/patient columns anywhere in P6', async () => {
  const { sqlite } = openDb();
  const cols = ['safety_rules', 'safety_rule_contexts', 'safety_rule_claims', 'safety_rule_evidence']
    .flatMap((t) => tableColumns(sqlite, t));
  for (const forbidden of ['user', 'patient', 'eligib', 'profile', 'pregnant', 'is_child', 'has_ckd', 'icd', 'snomed', 'dose']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden fragment: ${forbidden}`);
  }
});

// ---- CLAIM / EVIDENCE SEPARATION ----

test('rule creation creates no claim/evidence; claim creation creates no rule', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  const item = insertItem(sqlite);
  const claimsBefore = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n;
  const evidenceBefore = sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_evidence').get().n;
  await rule(db, 'sfr_sep');
  // No claim/evidence beyond pre-existing governed seeds (counts unchanged).
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_claims').get().n, claimsBefore);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM protocol_evidence').get().n, evidenceBefore);
  await claims.createClaim(db, { claim_id: 'clm_sep', protocol_id: 'mediterranean-diet', claim_type: 'OTHER', claim_text: 'Separation fixture.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_sep', source_item_id: item });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM safety_rules').get().n, 1);
});

test('safety↔claim link works; invalid claim fails; duplicate fails', async () => {
  const { sqlite, db } = openDb();
  await rule(db, 'sfr_link');
  await claims.createClaim(db, { claim_id: 'clm_link', protocol_id: 'mediterranean-diet', claim_type: 'OTHER', claim_text: 'Linked fixture.' });
  await safety.linkSafetyRuleClaim(db, { rule_id: 'sfr_link', claim_id: 'clm_link' });
  assert.deepEqual((await safety.listSafetyRuleClaims(db, 'sfr_link')).map((l) => l.claim_id), ['clm_link']);
  await assert.rejects(() => safety.linkSafetyRuleClaim(db, { rule_id: 'sfr_link', claim_id: 'clm_missing' }));
  await assert.rejects(() => safety.linkSafetyRuleClaim(db, { rule_id: 'sfr_link', claim_id: 'clm_link' }));
});

test('direct safety↔evidence link works without altering evidence provenance', async () => {
  const { sqlite, db } = openDb();
  const item = insertItem(sqlite);
  await rule(db, 'sfr_ev');
  const before = await evidence.createEvidence(db, { evidence_id: 'ev_link', source_item_id: item, locator: 'p.5' });
  await safety.linkSafetyRuleEvidence(db, { rule_id: 'sfr_ev', evidence_id: 'ev_link' });
  assert.deepEqual((await safety.listSafetyRuleEvidence(db, 'sfr_ev')).map((l) => l.evidence_id), ['ev_link']);
  assert.deepEqual(await evidence.getEvidence(db, 'ev_link'), before);
  await assert.rejects(() => safety.linkSafetyRuleEvidence(db, { rule_id: 'sfr_ev', evidence_id: 'ev_link' }));
});

// ---- SEVERITY / EVIDENCE SEPARATION ----

test('HIGH severity rule exists with no evidence-strength field anywhere', async () => {
  const { sqlite, db } = openDb();
  const r = await rule(db, 'sfr_high', { safety_type: 'CONTRAINDICATION', severity: 'HIGH', title: 'High-importance fixture note.' });
  assert.equal(r.severity, 'HIGH');
  const cols = ['safety_rules', 'safety_rule_contexts', 'safety_rule_claims', 'safety_rule_evidence']
    .flatMap((t) => tableColumns(sqlite, t));
  for (const forbidden of ['score', 'confidence', 'strength', 'certainty', 'verdict', 'truth', 'evidence_direction']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(forbidden)), `forbidden fragment: ${forbidden}`);
  }
});

test('rule lifecycle never mutates endpoints, topology, or P5 rows', async () => {
  const { sqlite, db } = openDb();
  insertActor(sqlite, 'actor_test_one');
  const item = insertItem(sqlite);
  await structure(db);
  await claims.createClaim(db, { claim_id: 'clm_lc', protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', claim_type: 'OTHER', claim_text: 'Lifecycle fixture.' });
  await evidence.createEvidence(db, { evidence_id: 'ev_lc', source_item_id: item });
  await rule(db, 'sfr_lc', { protocol_id: 'low-fodmap-diet', protocol_version_id: 'fod-v1', title: 'Lifecycle note.' });
  await safety.linkSafetyRuleClaim(db, { rule_id: 'sfr_lc', claim_id: 'clm_lc' });
  await safety.linkSafetyRuleEvidence(db, { rule_id: 'sfr_lc', evidence_id: 'ev_lc' });
  const protoBefore = await protocols.getProtocol(db, 'low-fodmap-diet');
  const verBefore = await protocols.getProtocolVersion(db, 'fod-v1');
  const claimBefore = await claims.getClaim(db, 'clm_lc');
  const evBefore = await evidence.getEvidence(db, 'ev_lc');
  await safety.setSafetyRuleActiveStatus(db, 'sfr_lc', 'INACTIVE');
  assert.deepEqual(await protocols.getProtocol(db, 'low-fodmap-diet'), protoBefore);
  assert.deepEqual(await protocols.getProtocolVersion(db, 'fod-v1'), verBefore);
  assert.deepEqual(await claims.getClaim(db, 'clm_lc'), claimBefore);
  assert.deepEqual(await evidence.getEvidence(db, 'ev_lc'), evBefore);
  assert.equal((await safety.getSafetyRule(db, 'sfr_lc')).active_status, 'INACTIVE');
});

// ---- SOURCE / REGRESSION ----

test('safety work touches no source, scheduler, brief, or triage state', async () => {
  const { sqlite, db } = openDb();
  const feedsBefore = sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all();
  await rule(db, 'sfr_src', { safety_type: 'MONITORING', severity: 'INFO', title: 'Source-neutral fixture.' });
  await safety.createSafetyRuleContext(db, { context_id: 'sfctx_s', rule_id: 'sfr_src', context_type: 'OTHER', context_label: 'test-label' });
  assert.deepEqual(sqlite.prepare('SELECT id, enabled FROM source_feeds ORDER BY id').all(), feedsBefore);
  // Safety work creates no source items of its own (controlled-import seed
  // rows, which always carry a discovery_reason, excluded by design).
  assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM source_items WHERE discovery_reason IS NULL`).get().n, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM approved_briefs').get().n, 0);
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name);
  assert.ok(!tables.some((t) => /cron|scheduler|job_queue/i.test(t)));
});

test('P0 seed count stays 6; P2/P3 behavior unchanged; no commercial tables', async () => {
  const { sqlite, db } = openDb();
  await rule(db, 'sfr_reg', { safety_type: 'PRECAUTION', severity: 'LOW', title: 'Regression fixture.' });
  assert.equal((await protocols.listProtocols(db)).length, 6);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'PROPOSED')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'WATCH')).length, 0);
  assert.equal((await protocols.listProtocolsByRegistryState(db, 'REJECT_NOT_A_PROTOCOL')).length, 0);
  const r = await protocols.resolveProtocol(db, 'DASH');
  assert.equal(r.outcome, 'EXACT_ALIAS');
  const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r2) => r2.name);
  for (const forbidden of ['products', 'brands', 'sponsors', 'affiliates', 'pricing', 'supplements']) {
    assert.ok(!tables.includes(forbidden), `forbidden table present: ${forbidden}`);
  }
});
