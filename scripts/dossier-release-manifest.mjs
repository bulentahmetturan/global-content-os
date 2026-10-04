#!/usr/bin/env node
// DOSSIER_CANARY_RELEASE_MANIFEST generator (local, read-only; writes only release/dossier-canary-release-manifest.json with --write).
//
//   node scripts/dossier-release-manifest.mjs            -> manifest JSON on stdout
//   node scripts/dossier-release-manifest.mjs --write    -> release/dossier-canary-release-manifest.json
//
// Everything is derived from the checked-in code (profile, registry, wrangler.toml, migration), never typed by hand, and a test regenerates it and compares.
// It contains NAMES only: no secret value, no token, no account identifier. The commit that contains the manifest cannot name itself, so
// `generated_against_commit` is the commit the manifest was generated on (its parent when committed); the owner pins the deploy commit at R0 and compares the
// CHECKSUMS and the manifest body, not the commit id.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bundle } from '../apps/worker/src/sqlite-d1.test-helper.mjs';
import { preflight, MIGRATION } from './dossier-0031-preflight.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return null; } };

export async function buildManifest() {
  const PF = await bundle('apps/worker/src/dossier/canary-profile.ts', 'manifest-profile');
  const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'manifest-control');
  const CR = await bundle('apps/worker/src/dossier/canary.ts', 'manifest-runner');
  const profile = PF.DOSSIER_CANARY_V1;
  const pf = preflight();
  const toml = readFileSync('wrangler.toml', 'utf8');
  const masterDefault = (toml.match(/^DOSSIER_CANARY_ENABLED = "([^"]*)"/m) ?? [])[1] ?? null;
  const val = (f) => f.value;
  const readers = CC.DOSSIER_READER_REGISTRY.map((r) => ({
    dossier_reader_id: r.dossier_reader_id,
    canonical_source_id: r.canonical_source_id,
    signal_family: r.signal_family,
    default_enabled: r.enabled,
    state: r.state,
    legal_status: r.legal_status,
    usage_terms: r.usage_terms,
    rate_guidance: r.rate_guidance,
    runnable_by_registration: CC.readerAccessBlockers(r).length === 0,
    blocker: r.blocker,
    runtime_enable_control: CC.controlReaderEnabled(r.dossier_reader_id),
    extra_run_control: CC.controlReaderExtraRuns(r.dossier_reader_id),
  }));
  return {
    manifest: 'DOSSIER_CANARY_RELEASE_MANIFEST',
    manifest_version: 1,
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    generated_against_commit: git('rev-parse', 'HEAD'),
    base_main_commit: git('rev-parse', 'origin/main'),
    live_production_expected_schema_before_release: '0030_source_lifecycle_pubmed_carrier_reconcile.sql',
    commit_pinning: 'the owner records `git rev-parse HEAD` at R0; the manifest body and the checksums below are what must match, not this file\'s own commit id',
    migration: {
      filename: MIGRATION,
      sha256_lf_normalized: pf.sha256_lf_normalized,
      frozen: true,
      objects: pf.objects,
      additive_idempotent_dossier_only: pf.REMOTE_0031_PREFLIGHT === 'PASS',
      preflight_artifact: 'docs/generated/dossier-0031-preflight.json',
      expected_newest_migration_after_release: MIGRATION,
    },
    canary_profile: {
      profile_id: profile.profile_id,
      run_mode: val(profile.run_mode),
      sources: val(profile.sources),
      backfill: val(profile.backfill),
      clinicaltrials: { max_pages_per_run: val(profile.clinicaltrials.max_pages_per_run), max_items_per_run: val(profile.clinicaltrials.max_items_per_run) },
      oecd: { max_rows_per_run: val(profile.oecd.max_rows_per_run) },
      max_runs_per_reader: val(profile.max_runs_per_reader),
      retention: val(profile.retention),
      promotion: { routes: val(profile.promotion.routes), source_specific_frontier: val(profile.promotion.source_specific_frontier), unknown_granularity: val(profile.promotion.unknown_granularity), auto_accept: val(profile.promotion.auto_accept), auto_publish: val(profile.promotion.auto_publish) },
      candidate_class: val(profile.candidate_class),
      provenance_refs_per_signal_family: val(profile.provenance_refs_per_signal_family),
      runtime: { d1_statements_per_invocation: val(profile.runtime.d1_statements_per_invocation), lease_seconds: val(profile.runtime.lease_seconds) },
      profile_errors: PF.validateCanaryProfile(profile),
    },
    required_env_config_keys: {
      wrangler_vars: [{ name: 'DOSSIER_CANARY_ENABLED', checked_in_default: masterDefault, only_exact_value_that_enables: 'true' }],
      secrets_names_only: ['OPS_TOKEN'],
      bindings: ['DB'],
      no_new_secret_is_introduced_by_dossier: true,
    },
    operator_controls: {
      table: 'dossier_control',
      absent_means: 'OFF',
      global: [CC.CONTROL_CANARY, CC.CONTROL_MANUAL_RUNS, CC.CONTROL_PROMOTION],
      per_reader_patterns: ['reader:<dossier_reader_id>:enabled', 'reader:<dossier_reader_id>:extra_runs_authorized'],
      platform_capacity_keys: [CC.CONTROL_CAPACITY_D1, CC.CONTROL_CAPACITY_SUBREQUESTS, CC.CONTROL_CAPACITY_CPU_MS, CC.CONTROL_CAPACITY_VERIFIED],
    },
    kill_switch_defaults: {
      env_master_switch: masterDefault,
      [CC.CONTROL_CANARY]: 'absent=OFF',
      [CC.CONTROL_MANUAL_RUNS]: 'absent=OFF',
      [CC.CONTROL_PROMOTION]: 'absent=OFF',
      reader_enabled: 'absent=OFF for every reader',
      platform_capacity_verified: 'absent=false (no run)',
    },
    platform_capacity_requirement: {
      contract: ['d1_queries_per_invocation', 'subrequest_limit', 'cpu_budget_ms', 'capacity_verified'],
      rule: 'a run is allowed only when capacity_verified is asserted by the owner AND the operational budget fits: budget <= d1_queries_per_invocation AND budget + 1 <= subrequest_limit; never inferred from a plan name, never clamped',
      operational_budget_d1_statements_per_invocation: val(profile.runtime.d1_statements_per_invocation),
      minimum_runnable_budget_floor: CR.MIN_RUNNABLE_BUDGET_FLOOR,
      official_limits_checked_2026_10_03: { workers_paid: { d1_queries_per_invocation: 1000, subrequests: 10000, cpu: '30 s default' }, workers_free: { d1_queries_per_invocation: 50, subrequests: 50, cpu: '10 ms' } },
      active_plan: 'UNKNOWN (owner must confirm; ClinicalTrials canary needs the 1000-query platform)',
      workers_free_canary: 'NOT_PRACTICAL_WITH_CURRENT_ARCHITECTURE',
    },
    required_owner_verifications: [
      { id: 'OWNER_AUTHORIZE_REMOTE_0031', needed_for: 'R1', note: 'apply only the file whose LF-normalized sha256 equals migration.sha256_lf_normalized' },
      { id: 'OWNER_AUTHORIZE_DISABLED_DEPLOY', needed_for: 'R3', note: 'after R1 only: a Worker deployed before 0031 is BLOCKED (SCHEMA_BEHIND)' },
      { id: 'OWNER_CONFIRM_CLOUDFLARE_PLAN_AND_RECORD_CAPACITY', needed_for: 'R6', note: 'record the verified platform limits through the capacity controls; Workers Paid is required for the ClinicalTrials canary' },
      { id: 'OWNER_AUTHORIZE_ENABLE_AND_RUN_CLINICALTRIALS', needed_for: 'R6-R7' },
      { id: 'HUMAN_VERIFY_OECD_OFFICIAL_TERMS', needed_for: 'R9', note: 'docs/DOSSIER-OECD-VERIFICATION-CHECKLIST.md; OECD never runs before this' },
    ],
    source_readers: readers,
    canonical_source_ids: readers.map((r) => r.canonical_source_id),
    known_blocked_sources: readers.filter((r) => !r.runnable_by_registration).map((r) => ({ dossier_reader_id: r.dossier_reader_id, reason: r.blocker })),
    deployment_order: [
      { step: 'R0', action: 'verify the commit, the manifest and the migration checksum', mutating: false },
      { step: 'R1', action: 'apply migration 0031 to the remote database', mutating: true, owner_approval_required: true },
      { step: 'R2', action: 'verify the remote schema (0031 recorded, 21 empty dossier tables)', mutating: false },
      { step: 'R3', action: 'deploy the Worker with DOSSIER_CANARY_ENABLED="false"', mutating: true, owner_approval_required: true },
      { step: 'R4', action: 'verify normal GCOS health is unchanged', mutating: false },
      { step: 'R5', action: 'verify the DOSSIER block reports DISABLED', mutating: false },
      { step: 'R6', action: 'record and verify platform capacity, then enable the approved readers and the master switch', mutating: true, owner_approval_required: true },
      { step: 'R7', action: 'run ClinicalTrials once', mutating: true, owner_approval_required: true },
      { step: 'R8', action: 'inspect', mutating: false },
      { step: 'R9', action: 'OECD only after human terms verification and a reviewed registration commit', mutating: true, owner_approval_required: true },
      { step: 'R10', action: 'inspect WATCH / convergence', mutating: false },
      { step: 'R11', action: 'kill switches', mutating: true, owner_approval_required: true },
      { step: 'R12', action: 'human review of the evidence', mutating: false },
      { step: 'R13', action: 'continue / roll back / recalibrate decision', mutating: false },
    ],
    expected_first_run_behavior: {
      reader: 'dossier-clinicaltrials-frontier',
      source_requests: 1,
      items: val(profile.clinicaltrials.max_items_per_run),
      invocations_at_800_budget: '~14 explicit bounded invocations of ONE run (largest measured 763 statements)',
      expected_observations_on_the_recorded_real_page: 414,
      expected_candidates: 0,
      expected_reviews: 0,
      expected_outcome: 'every topic WATCH (single signal family); no convergence without a second family; zero automatic ACCEPT; zero publication',
      stops_after: 'one COMPLETED run per reader (quota); a failed run does not consume it',
    },
    rollback: {
      method: 'operator controls to 0 (canary_enabled, manual_runs_allowed, reader enabled), optionally redeploy the previous Worker or DOSSIER_CANARY_ENABLED="false"',
      schema: 'no down migration: 0031 is additive and dossier-only; leaving it applied is harmless',
      data: 'rows are retained (CANARY_HOLD_UNTIL_REVIEW); nothing in GCOS references them',
      previous_worker_compatible_with_0031: true,
    },
    forbidden: ['no source beyond the two readers', 'no recurring scheduler', 'no automatic ACCEPT or publication', 'no source lifecycle or canonical GCOS mutation'],
    integrity: { manifest_body_sha256_excluding_commit_fields: null },
  };
}

export function bodyDigest(m) {
  const { generated_against_commit, base_main_commit, branch, integrity, ...rest } = m;
  void generated_against_commit; void base_main_commit; void branch; void integrity;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const m = await buildManifest();
  m.integrity.manifest_body_sha256_excluding_commit_fields = bodyDigest(m);
  const out = JSON.stringify(m, null, 2) + '\n';
  if (process.argv.includes('--write')) { mkdirSync('release', { recursive: true }); writeFileSync('release/dossier-canary-release-manifest.json', out); }
  process.stdout.write(out);
}
