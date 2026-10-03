// Phases E + F: connector framework (mock only) and creator-content classification / extraction contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { makeCtx } from './test-support.mjs';

const C = await bundle('apps/worker/src/dossier/connectors.ts', 'dossier-connectors');
const K = await bundle('apps/worker/src/dossier/classifier.ts', 'dossier-classifier');
const V = JSON.parse(readFileSync('packages/contracts/dossier-discovery.json', 'utf8'));

const item = (value, over = {}) => ({ acquisitionSourceId: 'x', platform: null, identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value }, title: `Fictional item ${value}`, publishedAt: '2026-10-01', ...over });
const noNetwork = async (fn) => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('network is forbidden in dossier connector tests'); };
  try { return [await fn(), () => calls]; } finally { globalThis.fetch = real; }
};

test('E every connector class and platform mode has a valid descriptor: capabilities, legal state, manual status, normalization mode; none defaults to APPROVED', () => {
  assert.equal(V.connector.classes.length, 17);
  for (const cls of V.connector.classes) {
    const d = C.describeConnector({ id: `t-${cls}`, class: cls });
    assert.deepEqual(C.validateDescriptor(d), [], cls);
    assert.equal(d.mock, true);
    assert.notEqual(d.legal_status, 'APPROVED', `${cls} must not default to APPROVED`);
    assert.equal(C.eligibleForActivation(d), false, `${cls} mock is never activatable`);
    for (const f of V.connector.capability_flags) assert.equal(typeof d.capabilities[f], 'boolean', `${cls}.${f}`);
    assert.ok(V.connector.normalization_modes.includes(d.normalization_mode));
  }
  for (const mode of V.connector.platform_modes) {
    const d = C.describeConnector({ id: `m-${mode}`, platformMode: mode });
    assert.equal(d.platform_mode, mode);
    assert.deepEqual(C.validateDescriptor(d), [], mode);
    assert.notEqual(d.legal_status, 'APPROVED');
  }
  assert.throws(() => C.describeConnector({ id: 'x', class: 'RSS_WEB', platformMode: 'TIKTOK_CSI_MANUAL' }), /platform_mode_class_mismatch/);
  assert.throws(() => C.describeConnector({ id: 'x', class: 'NOT_A_CLASS' }), /connector_class_unknown/);
  // an APPROVED legal state still does not make a MOCK activatable
  assert.equal(C.eligibleForActivation(C.describeConnector({ id: 'ap', class: 'RSS_WEB', legalStatus: 'APPROVED' })), false);
  assert.equal(C.eligibleForActivation({ ...C.describeConnector({ id: 'ap2', class: 'RSS_WEB', legalStatus: 'APPROVED' }), mock: false }), true, 'the predicate itself works for a future real, approved, automatic connector');
  assert.equal(C.eligibleForActivation({ ...C.describeConnector({ id: 'ap3', class: 'INSTAGRAM_MANUAL', legalStatus: 'APPROVED' }), mock: false }), false, 'a manual-only connector is never automatically read');
});

test('E Instagram and TikTok: access-dependent modes, manual modes are manual-only, TikTok creator content and CSI are never mixed', () => {
  for (const m of ['INSTAGRAM_AUTHORIZED_PROVIDER', 'INSTAGRAM_OFFICIAL_ACCESS']) {
    const d = C.describeConnector({ id: m, platformMode: m });
    assert.deepEqual([d.class, d.capabilities.requires_auth, d.capabilities.manual_only, d.legal_status], ['INSTAGRAM_PROVIDER', true, false, 'UNRESOLVED'], 'production access is an owner decision: UNRESOLVED');
  }
  for (const m of ['INSTAGRAM_MANUAL_SNAPSHOT', 'INSTAGRAM_SEMI_MANUAL', 'TIKTOK_CSI_MANUAL', 'TIKTOK_CSI_SEMI_MANUAL']) {
    const d = C.describeConnector({ id: m, platformMode: m });
    assert.equal(d.capabilities.manual_only, true, m);
    assert.equal(d.legal_status, 'MANUAL_ONLY');
    assert.equal(d.capabilities.can_list_items, false, 'a manual source cannot list or backfill automatically');
  }
  const content = C.describeConnector({ id: 'tc', platformMode: 'TIKTOK_AUTHORIZED_PROVIDER' });
  const csi = C.describeConnector({ id: 'tcsi', platformMode: 'TIKTOK_CSI_MANUAL' });
  assert.deepEqual(content.signal_roles, ['SOCIAL_CREATOR']);
  assert.deepEqual(csi.signal_roles, ['PUBLIC_DEMAND_SEARCH']);
  assert.deepEqual(csi.allowed_signal_families, ['TURKEY_PUBLIC_DEMAND']);
  assert.ok(content.allowed_signal_families.every((f) => f !== 'TURKEY_PUBLIC_DEMAND'));
  assert.ok(C.validateDescriptor({ ...csi, signal_roles: ['PUBLIC_DEMAND_SEARCH', 'SOCIAL_CREATOR'] }).includes('tiktok_roles_must_not_be_mixed'));
  assert.ok(C.validateDescriptor({ ...content, signal_roles: ['PUBLIC_DEMAND_SEARCH'] }).includes('creator_content_is_not_search_demand'));
  assert.ok(C.validateDescriptor({ ...csi, signal_roles: ['SOCIAL_CREATOR'] }).includes('csi_is_search_demand_not_creator_content'));
  assert.equal(V.connector.real_scraping_implemented, false);
  assert.equal(V.connector.anti_bot_or_waf_bypass, false);
  assert.ok(['INSTAGRAM_PRODUCTION_ACCESS_METHOD', 'TIKTOK_PRODUCTION_ACCESS_METHOD', 'TIKTOK_CSI_AUTOMATION_AVAILABILITY', 'PAID_PROVIDER_CHOICE', 'API_CREDENTIALS', 'PRODUCTION_EXTRACTION_METHOD'].every((k) => V.connector.owner_decision_required.includes(k)));
});

test('E mock readers: plan/fetch/normalize/checkpoint honor caps and cursor, never use the network, and a failure is returned instead of thrown', async () => {
  const ctx = makeCtx();
  const items = Array.from({ length: 10 }, (_, i) => item(`i${i}`));
  const c = C.createMockConnector({ id: 'rss1', class: 'RSS_WEB', items });
  assert.throws(() => c.plan({ itemCap: 0, fetchCap: 5 }), /caps_required/, 'a reader cannot run without caps');
  const [first, calls] = await noNetwork(() => C.executeConnector(c, { itemCap: 3, fetchCap: 5 }, ctx.now));
  assert.equal(calls(), 0, 'the mock never touches the network');
  assert.equal(first.status, 'SUCCEEDED');
  assert.equal(first.items.length, 3, 'the per-run item cap is enforced');
  assert.equal(first.checkpoint.nextCursor, '3');
  const second = await C.executeConnector(c, { itemCap: 3, fetchCap: 5, cursor: first.checkpoint.nextCursor }, ctx.now);
  assert.deepEqual(second.items.map((i) => i.identity.value), ['i3', 'i4', 'i5'], 'incremental read continues from the checkpoint');
  assert.equal(first.items[0].acquisitionSourceId, c.descriptor.acquisition_source_id);
  const bad = C.createMockConnector({ id: 'rss-bad', class: 'RSS_WEB', items, failWith: 'upstream exploded' });
  const r = await C.executeConnector(bad, { itemCap: 3, fetchCap: 5 }, ctx.now);
  assert.deepEqual([r.status, r.error, r.items.length, r.checkpoint], ['FAILED', 'upstream exploded', 0, null]);
});

test('E normalization enforces what a connector may emit: signal family must match its roles; URL-only identity is not assumed', async () => {
  const ctx = makeCtx();
  const sig = (family) => ({ conceptLabel: 'Fictional indicator', observationKind: 'SEARCH_MAGNITUDE', signalFamily: family, measurementProvenance: 'SEARCH', observedAt: '2026-10-01', windowKind: 'FAST_7D', value: 5, valueStatus: 'MEASURED' });
  const csi = C.createMockConnector({ id: 'csi1', platformMode: 'TIKTOK_CSI_MANUAL', items: [item('csi-ok', { signals: [sig('TURKEY_PUBLIC_DEMAND')] })] });
  assert.equal((await C.executeConnector(csi, { itemCap: 2, fetchCap: 2 }, ctx.now)).status, 'SUCCEEDED');
  const mixed = C.createMockConnector({ id: 'csi2', platformMode: 'TIKTOK_CSI_MANUAL', items: [item('csi-social', { signals: [sig('TURKEY_SOCIAL_MOMENTUM')] })] });
  const r = await C.executeConnector(mixed, { itemCap: 2, fetchCap: 2 }, ctx.now);
  assert.equal(r.status, 'FAILED');
  assert.match(r.error, /signal_family_not_allowed_for_connector:TURKEY_SOCIAL_MOMENTUM/);
  // a dataset release is a valid item with no URL
  const ds = C.createMockConnector({ id: 'ds1', class: 'PUBLIC_DATA_API', items: [item('rel-2025', { identity: { strategy: 'DATASET_RELEASE_KEY', value: 'rel-2025' }, url: null, signals: [{ ...sig('TURKEY_PUBLIC_HEALTH_DATA'), windowKind: 'RELEASE_PERIOD', windowStart: '2025-01-01', windowEnd: '2025-12-31', measurementProvenance: 'ADMINISTRATIVE', observationKind: 'ADMINISTRATIVE_STATISTIC' }] })] });
  assert.equal((await C.executeConnector(ds, { itemCap: 2, fetchCap: 2 }, ctx.now)).status, 'SUCCEEDED');
  const urlless = C.createMockConnector({ id: 'ds2', class: 'PUBLIC_TABLE', items: [item('x', { identity: { strategy: 'CANONICAL_URL', value: 'https://e.org/a' }, url: null })] });
  assert.match((await C.executeConnector(urlless, { itemCap: 2, fetchCap: 2 }, ctx.now)).error, /canonical_url_strategy_requires_url/);
  const badStrategy = C.createMockConnector({ id: 'ds3', class: 'PUBLIC_TABLE', items: [item('x', { identity: { strategy: 'URL_ONLY', value: 'a' } })] });
  assert.match((await C.executeConnector(badStrategy, { itemCap: 2, fetchCap: 2 }, ctx.now)).error, /identity_strategy_not_in_vocabulary/);
  // every class can be mocked end-to-end through executeConnector without any network
  const [all, calls] = await noNetwork(async () => Promise.all(V.connector.classes.map((cls) => C.executeConnector(C.createMockConnector({ id: `all-${cls}`, class: cls, items: [item('one')] }), { itemCap: 2, fetchCap: 2 }, ctx.now))));
  assert.ok(all.every((x) => x.status === 'SUCCEEDED'));
  assert.equal(calls(), 0);
});

test('F creator classification: typed contract + deterministic fixture classifier; no keyword classifier; commercial items keep their context; reported questions are not prevalence', () => {
  const clf = K.createFixtureClassifier({
    a: { contentClass: 'HEALTH_EDUCATIONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: false },
    q: { contentClass: 'PATIENT_QUESTION', commercialContext: 'NONE', clinicianReportedPublicQuestion: true },
    s: { contentClass: 'SPONSORED', commercialContext: 'SPONSORED', clinicianReportedPublicQuestion: false },
    p: { contentClass: 'PERSONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: false },
  });
  assert.equal(clf.method, 'FIXTURE');
  const get = (v) => clf.classify(item(v));
  assert.equal(K.isDiscoveryEligible(get('a')), true);
  assert.equal(K.isDiscoveryEligible(get('s')), false);
  assert.equal(K.isCommercialContext(get('s')), true);
  assert.equal(K.producesObservations(get('a')), true);
  assert.equal(K.producesObservations(get('s')), true, 'commercial items stay as observations WITH their context (needed for corrective detection)');
  assert.equal(K.producesObservations(get('p')), false);
  assert.deepEqual(get('unseen-item'), K.UNKNOWN_CLASSIFICATION, 'an unknown item is UNKNOWN, not guessed');
  assert.equal(K.producesObservations(get('unseen-item')), false);
  assert.equal(get('q').clinicianReportedPublicQuestion, true);
  assert.deepEqual(K.validateClassification({ contentClass: 'PERSONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: true }), ['reported_public_question_needs_a_discovery_eligible_class']);
  assert.deepEqual(K.validateClassification({ contentClass: 'MADE_UP', commercialContext: 'NONE', clinicianReportedPublicQuestion: false }), ['content_class_not_in_vocabulary']);
  assert.throws(() => K.createFixtureClassifier({ z: { contentClass: 'MADE_UP', commercialContext: 'NONE', clinicianReportedPublicQuestion: false } }).classify(item('z')), /classification_invalid/);
  assert.equal(V.source.content_classes.clinician_reported_public_question_is_not_prevalence, true);
  assert.equal(V.observation.kinds.includes('CLINICIAN_REPORTED_PUBLIC_QUESTION'), true);
  assert.equal(V.source.content_classes.production_extraction_method, 'OWNER_DECISION_REQUIRED');
  for (const c of ['HEALTH_EDUCATIONAL', 'PATIENT_QUESTION', 'CLINICAL_OBSERVATION', 'RESEARCH_COMMENTARY', 'PERSONAL', 'PROMOTIONAL', 'SPONSORED', 'AFFILIATE', 'OWN_PRODUCT', 'OWN_SERVICE', 'BRAND_PARTNERSHIP', 'UNKNOWN']) assert.deepEqual(K.validateClassification({ contentClass: c, commercialContext: 'UNKNOWN', clinicianReportedPublicQuestion: false }), []);
});

test('F extraction contract: fixture extractor reads declared fixtures only; the classifier/extractor modules analyze no text; spans are bounded', () => {
  const ex = K.createFixtureExtractor();
  assert.equal(ex.method, 'FIXTURE');
  const declared = ex.extract(item('e1', { fixture: { extraction: { mentions: [{ label: 'Fictional Topic', domainHint: 'HEALTH', evidenceSpan: 'short' }], jointGroups: [{ labels: ['A', 'B'], kind: 'JOINT_SOURCE_MENTION' }] } } }));
  assert.equal(declared.mentions.length, 1);
  assert.deepEqual(ex.extract(item('e2', { text: 'any text with words that a keyword matcher could latch onto' })), { mentions: [], jointGroups: [] }, 'no text analysis: nothing declared, nothing extracted');
  const src = readFileSync('apps/worker/src/dossier/classifier.ts', 'utf8');
  assert.ok(!/\.text\b|toLowerCase|\.match\(|\.test\(|RegExp|\.includes\(item/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no keyword/regex classification of item text in code');
  assert.equal(K.evidenceSpanIsBounded('the whole text', 'the whole text'), false);
  assert.equal(K.evidenceSpanIsBounded('part', 'the whole text'), true);
  assert.equal(K.evidenceSpanIsBounded(null, 'x'), true);
});
