// Phase K (overnight hardening): the DOSSIER_CANARY_RELEASE_MANIFEST is derived from code, committed, secret-free and cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { buildManifest, bodyDigest } = await import('../../../../scripts/dossier-release-manifest.mjs');
const committed = JSON.parse(readFileSync('release/dossier-canary-release-manifest.json', 'utf8'));

test('the committed manifest equals a fresh derivation from the code (only the commit fields may differ): it cannot drift from the profile, registry, wrangler.toml or migration', async () => {
  const fresh = await buildManifest();
  assert.equal(bodyDigest(fresh), bodyDigest(committed));
  assert.equal(committed.integrity.manifest_body_sha256_excluding_commit_fields, bodyDigest(committed));
  const strip = ({ generated_against_commit, base_main_commit, branch, integrity, ...r }) => r;
  assert.deepEqual(strip(committed), strip(fresh));
});

test('manifest content: frozen migration checksum, profile, env keys (names only), kill-switch defaults, capacity requirement, readers, order, first-run behaviour, blocked source, rollback', () => {
  const m = committed;
  assert.equal(m.manifest, 'DOSSIER_CANARY_RELEASE_MANIFEST');
  assert.equal(m.branch, 'recovery/statistics-recurring-forward-port');
  assert.match(m.generated_against_commit, /^[0-9a-f]{40}$/);
  assert.equal(m.base_main_commit, 'f684f10b360e8013638dc5dbf01ded06bc6936c6');
  assert.equal(m.migration.sha256_lf_normalized, '5f228b0a2c3541f46ba2259f1e2cce2cef5f4db6fdf24d111f58e49fbcbdc343');
  assert.equal(m.migration.frozen, true);
  assert.equal(m.migration.additive_idempotent_dossier_only, true);
  assert.deepEqual(m.migration.objects, { tables: 21, indexes: 17, triggers: 40 });
  assert.equal(m.canary_profile.profile_id, 'DOSSIER_CANARY_V1');
  assert.equal(m.canary_profile.run_mode, 'MANUAL_ONE_SHOT');
  assert.deepEqual(m.canary_profile.profile_errors, []);
  assert.equal(m.canary_profile.runtime.d1_statements_per_invocation, 200);
  assert.equal(m.canary_profile.runtime.lease_seconds, 45);
  assert.deepEqual([m.canary_profile.promotion.auto_accept, m.canary_profile.promotion.auto_publish, m.canary_profile.promotion.source_specific_frontier], [false, false, 'DISABLED']);
  assert.deepEqual(m.required_env_config_keys.wrangler_vars, [{ name: 'DOSSIER_CANARY_ENABLED', checked_in_default: 'false', only_exact_value_that_enables: 'true' }]);
  assert.deepEqual(m.required_env_config_keys.secrets_names_only, ['OPS_TOKEN']);
  assert.equal(m.kill_switch_defaults.env_master_switch, 'false');
  assert.equal(m.kill_switch_defaults.canary_enabled, 'absent=OFF');
  assert.equal(m.kill_switch_defaults.platform_capacity_verified, 'absent=false (no run)');
  assert.deepEqual(m.operator_controls.platform_capacity_keys, ['platform:d1_queries_per_invocation', 'platform:subrequest_limit', 'platform:cpu_budget_ms', 'platform:capacity_verified']);
  assert.equal(m.platform_capacity_requirement.minimum_runnable_budget_floor, 57);
  assert.equal(m.platform_capacity_requirement.workers_free_canary, 'NOT_PRACTICAL_WITH_CURRENT_ARCHITECTURE');
  assert.deepEqual(m.source_readers.map((r) => [r.dossier_reader_id, r.default_enabled, r.runnable_by_registration]), [['dossier-clinicaltrials-frontier', false, true], ['dossier-oecd-turkiye-mortality', false, false]]);
  assert.deepEqual(m.canonical_source_ids, ['clinicaltrials-gov-api-v2', 'oecd-health']);
  assert.deepEqual(m.known_blocked_sources.map((b) => b.dossier_reader_id), ['dossier-oecd-turkiye-mortality']);
  assert.deepEqual(m.deployment_order.map((s) => s.step), ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13']);
  assert.ok(m.deployment_order.filter((s) => s.mutating).every((s) => s.owner_approval_required === true), 'every mutating step needs owner approval');
  assert.equal(m.expected_first_run_behavior.expected_candidates, 0);
  assert.equal(m.expected_first_run_behavior.source_requests, 1);
  assert.match(m.rollback.schema, /no down migration/);
  assert.ok(m.required_owner_verifications.some((v) => v.id === 'HUMAN_VERIFY_OECD_OFFICIAL_TERMS'));
});

test('the manifest carries no secret value, token, account id or URL with credentials', () => {
  const text = readFileSync('release/dossier-canary-release-manifest.json', 'utf8');
  assert.ok(!/Bearer\s+[A-Za-z0-9]/.test(text));
  assert.ok(!/(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}/.test(text), 'no mixed-case opaque token-shaped string');
  assert.ok(!/c0ce92dc|account_id|database_id/.test(text), 'no Cloudflare resource identifiers');
});
