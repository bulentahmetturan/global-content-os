// LOCAL deterministic build inspection of the Worker artifact intended for the Eurostat second-family canary. It DEPLOYS NOTHING (`wrangler deploy --dry-run`
// bundles locally and exits), reads no secret and needs no network. It builds twice, requires identical output, records / checks the sha256 of the bundle and
// proves the canary code is inside it.
//   node scripts/dossier-eurostat-canary-artifact.mjs           -> prints the build identity JSON
//   node scripts/dossier-eurostat-canary-artifact.mjs --check   -> exits 1 if the sha256 differs from docs/generated/dossier-eurostat-canary-plan-v1.json
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARKERS = ['DOSSIER_CANARY_V2', 'selectEffectiveRelease', 'NEWEST_RELEASE_HAS_NO_VALUE', 'AMBIGUOUS_SAME_RELEASE_CONFLICT', 'DATASET_RELEASE_KEY', 'CONCEPT_PROPOSER_BUSY', 'leaseNearlyOver', 'V2_HARD_STOP_PROMOTION_ELIGIBILITY_REACHED', 'dossier-eurostat-tr-causes-of-death', 'hlth_cd_asdr2', 'eurostat-report'];
const FORBIDDEN = ['TEST_ONLY', 'POC_ONLY', 'createMockConnector', 'burnin-operator', 'test-operator'];

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'gcos-canary-artifact-'));
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'deploy', '--dry-run', '--outdir', dir], { stdio: 'ignore', shell: process.platform === 'win32' });
    const text = readFileSync(join(dir, 'index.js'), 'utf8');
    return { sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), text };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const a = build();
const b = build();
const identity = {
  deploys: false,
  build_a_sha256: a.sha256,
  build_b_sha256: b.sha256,
  deterministic: a.sha256 === b.sha256,
  bytes: a.bytes,
  markers_present: Object.fromEntries(MARKERS.map((m) => [m, a.text.includes(m)])),
  forbidden_markers_present: FORBIDDEN.filter((m) => a.text.includes(m)),
};
const ok = identity.deterministic && Object.values(identity.markers_present).every(Boolean) && identity.forbidden_markers_present.length === 0;
if (process.argv.includes('--check')) {
  const plan = JSON.parse(readFileSync('docs/generated/dossier-eurostat-canary-plan-v1.json', 'utf8'));
  const same = plan.artifact.bundle_sha256 === a.sha256;
  console.log(JSON.stringify({ ...identity, plan_sha256: plan.artifact.bundle_sha256, matches_plan: same, ok: ok && same }, null, 2));
  process.exit(ok && same ? 0 : 1);
}
console.log(JSON.stringify({ ...identity, ok }, null, 2));
process.exit(ok ? 0 : 1);
