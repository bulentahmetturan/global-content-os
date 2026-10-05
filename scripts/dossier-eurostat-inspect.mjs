// Read-only LOCAL inspect of the Eurostat DOSSIER reader configuration. No network, no database, no activation, no run creation.
// Prints: source, dataset, family, access mode, legal state, reader version, bounded-unit definition, configured profile, activation state.
// Usage: node scripts/dossier-eurostat-inspect.mjs
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';

const EU = await bundle('apps/worker/src/dossier/eurostat.ts', 'eu-inspect-reader');
const V2 = await bundle('apps/worker/src/dossier/canary-v2.ts', 'eu-inspect-v2');
const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'eu-inspect-profile');
const reg = V2.DOSSIER_READER_REGISTRY_V2[0];
const p = PF.DOSSIER_CANARY_V2;
const out = {
  ...EU.inspectEurostatReader(),
  registration: { reader_id: reg.dossier_reader_id, enabled: reg.enabled, state: reg.state, canary_profile: reg.canary_profile, legal_status: reg.legal_status, usage_terms: reg.usage_terms, rate_guidance: reg.rate_guidance, blocker: reg.blocker },
  configured_profile: { id: p.profile_id, d1_statements_per_invocation: p.runtime.d1_statements_per_invocation.value, lease_seconds: p.runtime.lease_seconds.value, items_cap: p.eurostat.max_items_per_run.value, max_requests_per_run: p.eurostat.max_requests_per_run.value, d1_ceiling: PF.D1_OPERATIONAL_CEILING, profile_errors: PF.validateCanaryProfileV2(p) },
  v1_baseline: p.baseline.value,
  network: 'NOT_USED',
  mutation: 'NONE',
};
console.log(JSON.stringify(out, null, 2));
