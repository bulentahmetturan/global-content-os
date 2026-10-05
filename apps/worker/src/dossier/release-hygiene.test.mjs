// Phase J (overnight hardening): release / branch hygiene for the DOSSIER production path and the TEST-ONLY LEAKAGE HARD GATE.
// The real Worker entry is bundled exactly as the deploy would (esbuild, all imports followed); nothing test-only, fixture-only, POC-only or mock may be in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const worker = await build({ entryPoints: ['apps/worker/src/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
const inputs = Object.keys(worker.metafile.inputs).map((p) => p.replace(/\\/g, '/'));
const text = worker.outputFiles[0].text;

// the exact DOSSIER modules that ship in the Worker (a new module in the production path is a conscious, reviewed change)
const SHIPPED = [
  'apps/worker/src/dossier-canary-routes.ts', 'apps/worker/src/dossier-ops-routes.ts',
  'apps/worker/src/dossier/recurring-control.ts', 'apps/worker/src/dossier/recurring-health.ts', 'apps/worker/src/dossier/recurring-ops.ts', 'apps/worker/src/dossier/recurring-profile.ts', 'apps/worker/src/dossier/recurring-scheduler.ts', 'apps/worker/src/dossier/review.ts',
  'apps/worker/src/dossier/aggregation.ts', 'apps/worker/src/dossier/attribution.ts', 'apps/worker/src/dossier/candidates.ts', 'apps/worker/src/dossier/canary-control.ts',
  'apps/worker/src/dossier/canary-inspect.ts', 'apps/worker/src/dossier/canary-v2.ts', 'apps/worker/src/dossier/eurostat.ts', 'apps/worker/src/dossier/canary-profile.ts', 'apps/worker/src/dossier/canary-readiness.ts', 'apps/worker/src/dossier/canary.ts',
  'apps/worker/src/dossier/classifier.ts', 'apps/worker/src/dossier/clinicaltrials.ts', 'apps/worker/src/dossier/clusters.ts', 'apps/worker/src/dossier/coherence.ts',
  'apps/worker/src/dossier/connectors.ts', 'apps/worker/src/dossier/eligibility.ts', 'apps/worker/src/dossier/ingest.ts', 'apps/worker/src/dossier/oecd.ts',
  'apps/worker/src/dossier/policy.ts', 'apps/worker/src/dossier/promotion.ts', 'apps/worker/src/dossier/relations.ts', 'apps/worker/src/dossier/repo.ts',
  'apps/worker/src/dossier/resolver.ts', 'apps/worker/src/dossier/snapshots.ts', 'apps/worker/src/dossier/types.ts', 'apps/worker/src/dossier/wow.ts',
  'packages/contracts/src/dossier-discovery.ts', 'packages/contracts/dossier-discovery.json',
];

test('the deployed Worker bundle contains exactly the audited DOSSIER modules and nothing test-only: no test, fixture, recorded response, burn-in, script or POC file', () => {
  const dossier = inputs.filter((p) => /dossier/i.test(p)).sort();
  assert.deepEqual(dossier, [...SHIPPED].sort());
  const bad = inputs.filter((p) => /\.test\.|test-support|test-capacity|burnin|fixtures\.mjs|recorded|\/\.logs\/|^scripts\/|poc|router\.ts$|orchestrator|handoff\.ts$/i.test(p) && /dossier/i.test(p));
  assert.deepEqual(bad, [], 'nothing from the local pipeline / review / handoff / orchestrator / POC tooling ships');
  assert.ok(!inputs.some((p) => /node_modules\/(vitest|@vitest)/.test(p)));
});

test('TEST-ONLY LEAKAGE HARD GATE: none of the test-only constructs exists in the deployed bundle text', () => {
  for (const k of ['POC_ONLY', 'TEST_ONLY', 'TEST_REGISTRY', 'PROMOTE_EVERYTHING', 'ALLOW_UNKNOWN_GRANULARITY', 'createMockConnector', 'createFixtureExtractor', 'mock: true', "method: 'FIXTURE'", 'Fictional', 'fictional', 'simulation-operator', 'burnin-operator', 'test-operator', 'testPolicy', 'setTestCapacity', 'TEST_ONLY_PAID_CAPACITY', 'SIMULATED_PROCESS_KILL']) assert.ok(!text.includes(k), `bundle contains ${k}`);
  assert.ok(!/allowUnknownGranularity:\s*(true|!0)/.test(text), 'no code path sets allowUnknownGranularity to true');
  assert.ok(!/legal_status:\s*"APPROVED"[^}]*oecd|oecd[^}]*legal_status:\s*"APPROVED"/i.test(text), 'OECD is not approved anywhere in shipped code');
  assert.ok(!/capacity_verified:\s*(true|!0)/.test(text), 'no shipped code asserts platform capacity as verified');
  assert.ok(!/NCT9\d{6}/.test(text), 'no fictional trial ids');
});

test('source-level gates on production TypeScript: test-only flags, forced approvals, fake capacity, fixture readers and test promotion policies are absent or inert', () => {
  const prod = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name)) prod.push(p); } };
  walk('apps/worker/src'); walk('packages/contracts/src');
  const src = Object.fromEntries(prod.map((p) => [p, readFileSync(p, 'utf8')]));
  const grep = (re) => prod.filter((p) => re.test(src[p]));
  assert.deepEqual(grep(/POC_ONLY|TEST_ONLY/), [], 'no POC_ONLY / TEST_ONLY marker in production TypeScript');
  // the only places that mention allowUnknownGranularity: the type, the gate reading it, and the canary profile that sets it FALSE
  assert.deepEqual(grep(/allowUnknownGranularity/).map((p) => p.split('/').pop()).sort(), ['canary-profile.ts', 'candidates.ts', 'coherence.ts', 'policy.ts']);
  assert.ok(/allowUnknownGranularity: false/.test(src['apps/worker/src/dossier/canary-profile.ts']));
  assert.ok(!/allowUnknownGranularity:\s*true/.test(Object.values(src).join('\n')));
  // the checked-in registry: every reader is disabled and CANARY_DISABLED; OECD is not approved
  const control = src['apps/worker/src/dossier/canary-control.ts'];
  assert.ok(!/enabled:\s*true/.test(control));
  assert.equal((control.match(/enabled: false,/g) ?? []).length, 2);
  assert.ok(/legal_status: 'UNRESOLVED'/.test(control));
  // no production module constructs capacity or approval values
  assert.ok(!/capacity_verified:\s*true|PLATFORM_CAPACITY_VERIFIED|d1_queries_per_invocation:\s*\d/.test(Object.values(src).join('\n')));
  // mock / fixture connector factories have no production importer
  const importers = (name) => prod.filter((p) => new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(src[p]) && !/connectors\.ts$/.test(p));
  assert.deepEqual(importers('createMockConnector'), []);
  assert.deepEqual(importers('createFixtureExtractor'), ['apps/worker/src/dossier/classifier.ts'].filter(() => false));
  // production observations are never stamped as fixture data
  assert.match(src['apps/worker/src/dossier/clinicaltrials.ts'], /registryRecordExtractor = createStructuredSignalExtractor\(\)/);
  assert.match(src['apps/worker/src/dossier/oecd.ts'], /statisticalRowExtractor = createStructuredSignalExtractor\(\)/);
});

test('the canary promotion policy that ships is not a test policy: convergence only, frontier disabled, no automatic accept or publish, unknown granularity fails closed', async () => {
  const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'hyg-profile');
  for (const promotionEnabled of [true, false]) {
    const pol = PF.canaryPolicy(PF.DOSSIER_CANARY_V1, { promotionEnabled, canonicalSourceId: 'clinicaltrials-gov-api-v2' });
    assert.equal(pol.topicCoherence.value.allowUnknownGranularity, false);
    assert.ok(!JSON.stringify(pol).includes('SOURCE_SPECIFIC_FRONTIER') || /DISABLED|\[\]/.test(JSON.stringify(pol.promotionRoutes ?? pol.sourceSpecificFrontier ?? 'DISABLED')));
  }
  assert.equal(PF.DOSSIER_CANARY_V1.promotion.auto_accept.value, false);
  assert.equal(PF.DOSSIER_CANARY_V1.promotion.auto_publish.value, false);
  assert.equal(PF.DOSSIER_CANARY_V1.promotion.source_specific_frontier.value, 'DISABLED');
  assert.deepEqual(PF.validateCanaryProfile(PF.DOSSIER_CANARY_V1), []);
});

test('branch hygiene: POC / evidence tooling is outside the Worker and never imported by it; no oversized or generated artifact beyond the audited fixtures and the preflight JSON; no temp or backup files', () => {
  const idx = readFileSync('apps/worker/src/index.ts', 'utf8');
  assert.ok(!/scripts\/|\.logs/.test(idx));
  for (const poc of ['scripts/dossier-clinicaltrials-poc.mjs', 'scripts/dossier-tr-health-poc.mjs']) {
    const t = readFileSync(poc, 'utf8');
    assert.ok(/POC_ONLY/.test(t), `${poc} is labelled POC_ONLY`);
    assert.ok(!inputs.includes(poc));
  }
  // tracked-file shape: look for stray artifacts by name in the dossier-owned directories
  const stray = [];
  for (const d of ['apps/worker/src/dossier', 'scripts', 'docs/generated']) for (const f of readdirSync(d)) if (/\.(tmp|bak|orig|rej|log|swp)$|~$|^\.#/.test(f)) stray.push(`${d}/${f}`);
  assert.deepEqual(stray, []);
  const big = [];
  for (const d of ['apps/worker/src/dossier', 'apps/worker/src/dossier/recorded', 'scripts', 'docs/generated']) for (const f of readdirSync(d, { withFileTypes: true })) if (f.isFile() && statSync(`${d}/${f.name}`).size > 200 * 1024) big.push(`${d}/${f.name}`);
  assert.deepEqual(big, [], 'no tracked file in the dossier-owned directories exceeds 200 KB');
  // no credential-shaped literal in any dossier-owned source
  const hits = [];
  for (const d of ['apps/worker/src/dossier', 'scripts']) for (const f of readdirSync(d)) if (/dossier|canary/.test(f) || d.endsWith('dossier')) { try { const t = readFileSync(`${d}/${f}`, 'utf8'); if (/-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,}/.test(t)) hits.push(f); } catch { /* directory */ } }
  assert.deepEqual(hits, []);
});
