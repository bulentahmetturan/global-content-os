/**
 * Items 75-84 (second-source maturity and file/PDF preparation): the readiness record is internally consistent with the repository facts, makes no
 * claim beyond what exists (no reader, no adapter, no bucket, no credential), and the ArtifactStore contract every future adapter must pass is executable
 * today against the in-memory adapter. Local only; no network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import { loadStatistics } from './test-support/engines.mjs';

const doc = JSON.parse(readFileSync('docs/generated/statistics-later-sources-readiness-v1.json', 'utf8'));
const readiness = JSON.parse(readFileSync('docs/generated/statistics-source-readiness-v1.json', 'utf8'));
const src = (id) => readiness.sources.find((s) => s.source_id === id);
const ALLOWED = ['COMPLETE_PROVEN', 'READY_LOCAL', 'DESIGNED_AND_TEST_CONTRACT_READY', 'PARTIAL', 'BLOCKED'];

describe('readiness record 75-84', () => {
  it('covers exactly items 75..84 with an allowed status; production-only items are never COMPLETE_PROVEN', () => {
    assert.deepEqual(Object.keys(doc.items).sort(), ['75', '76', '77', '78', '79', '80', '81', '82', '83', '84']);
    for (const [k, v] of Object.entries(doc.items)) {
      assert.ok(ALLOWED.includes(v.status), `${k}: ${v.status}`);
      assert.notEqual(v.status, 'COMPLETE_PROVEN', `${k}: nothing here has live proof`);
    }
    assert.deepEqual([doc.items['76'].status, doc.items['77'].status], ['BLOCKED', 'BLOCKED']);
  });
  it('agrees with the frozen source readiness: WHO is the audited fallback with PARTIAL terms, TUIK stays gated and unresolved, neither is activation-ready', () => {
    assert.deepEqual([src('WHO_HEALTH_STATISTICS').adapter, src('WHO_HEALTH_STATISTICS').terms_status, src('WHO_HEALTH_STATISTICS').source_activation_ready], ['REST_READER', 'PARTIAL', 'NO']);
    assert.deepEqual([src('TURKSTAT_HEALTH_STATISTICS').disposition, src('TURKSTAT_HEALTH_STATISTICS').terms_status, src('TURKSTAT_HEALTH_STATISTICS').source_activation_ready], ['CANONICAL_GATED', 'UNKNOWN', 'NO']);
    assert.match(doc.items['75'].selection, /WHO_HEALTH_STATISTICS \/ WHOSIS_000001/);
    assert.match(doc.items['76'].state, /no credential was created/);
    assert.equal(doc.items['75'].implemented, false);
    assert.equal(doc.items['78'].implemented, false);
  });
  it('the WHO contract is bounded and keeps unknowns explicit instead of claiming them', () => {
    const c = doc.items['75'].contract;
    assert.deepEqual([c.bounds.source_requests_per_unit, c.bounds.max_response_bytes], [1, 262144]);
    assert.ok(c.bounds.never.includes('a call without $filter'));
    assert.ok(c.must_be_proven_before_implementation.length >= 3);
    assert.match(c.endpoint_shape, /\$filter=SpatialDim eq 'TUR'/);
  });
  it('nothing beyond the contract exists in the repository: no WHO or TUIK reader, no R2 binding, no R2 type in statistics code', () => {
    for (const f of readdirSync('apps/worker/src/statistics/readers')) assert.doesNotMatch(f, /who|tuik|turkstat|gho/i, f);
    assert.doesNotMatch(readFileSync('wrangler.toml', 'utf8'), /r2_buckets|STATS_ARTIFACTS/);
    const walk = (d) => readdirSync(d).forEach((n) => {
      const p = `${d}/${n}`;
      if (statSync(p).isDirectory()) return n === 'test-support' ? undefined : walk(p);
      if (n.endsWith('.ts')) assert.doesNotMatch(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\bR2Bucket\b|\.r2\b|STATS_ARTIFACTS/, p);
    });
    walk('apps/worker/src/statistics');
  });
  it('files and PDFs keep R2 explicit and rest on existing local flow proofs; the R2 runbook mutates nothing and every mutating step needs its own approval key', () => {
    assert.equal(doc.items['83'].r2_required, true);
    assert.equal(doc.items['84'].r2_required, true);
    assert.match(doc.items['84'].contract, /starts SUSPECT/);
    const flows = readFileSync('apps/worker/src/statistics/flows.test.mjs', 'utf8');
    assert.match(flows, /ZIP\/XLSX/);
    assert.match(flows, /PDF/);
    const keys = new Set();
    for (const s of doc.items['82'].runbook) {
      if (s.mutates) { assert.match(s.approval_key, /^OWNER_APPROVAL_/); assert.ok(!keys.has(s.approval_key)); keys.add(s.approval_key); assert.ok(s.rollback); } else assert.equal(s.approval_key, undefined);
    }
    assert.deepEqual(doc.items['82'].not_created, ['bucket', 'binding', 'adapter']);
  });
  it('item 80 needs no migration: the lineage edge types exist in the frozen schema', () => {
    const sql = readFileSync('docs/generated/statistics-schema-v1.sql', 'utf8');
    for (const t of ['MIRROR_OF', 'UPSTREAM_SOURCE', 'DERIVED_FROM', 'NORMALIZED_FROM']) assert.ok(sql.includes(`'${t}'`), t);
    assert.equal(doc.items['80'].migration_required, false);
  });
});

describe('81 ArtifactStore contract (every future adapter must pass this)', () => {
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  async function contract(make) {
    const store = await make();
    const bytes = new TextEncoder().encode('statistics artifact fixture');
    const a = await store.put('art/ab/abcdef', bytes);
    assert.equal(a.sha256, sha(bytes), 'returns the real sha256');
    assert.equal(a.byteSize, bytes.byteLength);
    const again = await store.put('art/ab/abcdef', bytes);
    assert.deepEqual(again, a, 'put is idempotent for the same key and bytes');
    const got = await store.get(a.locator);
    assert.deepEqual([...got], [...bytes]);
    got[0] = 0;
    assert.equal((await store.get(a.locator))[0], bytes[0], 'get returns a copy; stored bytes cannot be mutated through it');
    assert.equal(await store.get('missing-locator'), null);
    assert.ok(['IN_MEMORY_TEST', 'R2'].includes(store.kind));
    bytes[0] = 0;
    assert.notEqual((await store.get(a.locator))[0], 0, 'put stores a copy');
  }
  it('the in-memory test adapter passes the contract; the R2 adapter is explicitly NOT_IMPLEMENTED and cannot be constructed by accident', async () => {
    const S = await loadStatistics();
    await contract(() => new S.InMemoryArtifactStore());
    assert.throws(() => S.r2ArtifactStoreNotImplemented(), /R2_ARTIFACT_STORE_NOT_IMPLEMENTED/);
  });
  it('the metadata contract keeps bytes out of D1: the artifact row has no payload column and R2 locators need a backend locator', () => {
    const sql = readFileSync('docs/generated/statistics-schema-v1.sql', 'utf8');
    const table = /CREATE TABLE IF NOT EXISTS statistics_raw_artifacts \(([\s\S]*?)\n\);/.exec(sql)[1];
    assert.doesNotMatch(table, /\b(blob|payload|content_bytes|body)\b/i);
    assert.match(table, /backend_type NOT IN \('R2','OTHER'\) OR backend_locator IS NOT NULL/);
    assert.ok(existsSync('apps/worker/src/statistics/artifact-store.ts'));
  });
});
