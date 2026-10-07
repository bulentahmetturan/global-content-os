# PROTOCOL PRODUCTION PREFLIGHT — P0–P8 boundary package

> Prepared during the Maximum Safe Sprint (P8 continuation). Local-only evidence.
> Nothing below authorizes or performs production execution.

## Scope proposed for a future authorized window

- Migrations (protocol-owned, additive, idempotent seeds), in order:
  `0033_protocol_registry.sql`, `0034_protocol_families_variants_aliases.sql`,
  `0036_protocol_version_phase_component_model.sql`,
  `0037_actor_protocol_relationship_model.sql`,
  `0038_claim_evidence_provenance_model.sql`, `0039_safety_model.sql`,
  `0040_commercial_model.sql`.
  (0035 is Doctor-owned; not in protocol scope. 0031/0032 Doctor D1/D2 are
  untracked in-tree work, likewise out of scope.)
- P8 added NO migration. `readiness.ts` EXPECTED already tracks the newest
  file (`0040_commercial_model.sql`).

## Remote state (verified by absence)

- PRODUCTION_MIGRATION_APPLIED = NO for every P0–P8 migration (all sprints ran
  ephemeral `node:sqlite` only; no `wrangler d1 ... --remote` apply performed).
- SOURCE_ACTIVATION = NO. No source enabled/disabled/retired in production;
  no scheduler enabled; no deploy performed.

## Rollback / recovery

- Nothing to roll back: no production write exists. If a future partial apply
  occurs, follow repo convention (forward-fix migration; never destructive
  reset). Local recovery is a fresh ephemeral rebuild (full migration replay
  is covered by `versions.test.mjs` "all migrations apply cleanly" and every
  suite's `openDb`).

## Activation manifest

- Empty. P0–P8 canonicalize exactly 6 protocols and activate zero sources.
  No MANUAL_INTAKE → AUTOMATED conversion exists anywhere in this work.

## Scheduler

- No new scheduler. Existing Worker cron + Python runner + evergreen executor
  untouched. P8 proves bounded dispatch (enabled-flag, cadence, CANARY_ONLY
  exclusion, lease-gated claims) against current code.

## Affected tables (all new, production-empty on first apply)

- `protocols` (+6 seed rows), `protocol_families` (+4), `protocol_family_members`
  (+6), `protocol_aliases` (+9), `protocol_versions`, `protocol_phases`,
  `protocol_components`, `actor_protocol_relationships`, `protocol_claims`,
  `claim_attributions`, `protocol_evidence`, `claim_evidence_links`,
  `safety_rules`, `safety_rule_contexts`, `safety_rule_claims`,
  `safety_rule_evidence`, `commercial_relationships`,
  `commercial_relationship_claims`, `commercial_relationship_evidence`.
- No ALTER of any existing table. No existing row read or rewritten by any
  protocol migration.

## Health / readiness expectations after an authorized apply

- `/api/ready` reports appliedMigration `0040_commercial_model.sql` and stops
  reporting SCHEMA_BEHIND (currently behind by design until authorized).
- No new critical dependency: a single source outage still degrades, never blocks.

## First-run verification queries (read-only, small, indexed)

- `SELECT COUNT(*) FROM protocols;` → 6, all `CANONICAL_READY`.
- `SELECT COUNT(*) FROM protocol_families;` → 4.
- `SELECT registry_state, COUNT(*) FROM protocols GROUP BY 1;` → only CANONICAL_READY.
- `SELECT * FROM d1_migrations ORDER BY name DESC LIMIT 1;` → 0040 file.

## Test matrix at preflight

- P8 activation-boundary 7/7; commercial 15/15; safety 20/20; claims 23/23;
  protocols 20/20; families 26/26; versions 26/26; relationships 21/21;
  readiness 6/6; temporal 14/14; actors 18/18; typecheck clean in scope;
  `git diff --check` clean; router BROKEN_ROUTER_LINKS=0.

## Exact authorizations required (nothing broader)

1. PRODUCTION_MIGRATION_AUTHORIZATION_REQUIRED — apply 0033–0040 to production
   D1 (owner runs `wrangler d1 migrations apply --remote` or equivalent).
2. DEPLOY_AUTHORIZATION_REQUIRED — deploy the Worker build carrying
   EXPECTED_SCHEMA_MIGRATION 0040.
3. SOURCE_ACTIVATION_AUTHORIZATION_REQUIRED — none pending; any future
   activation needs its own lifecycle `--apply` + owner decision per source.

## Known unrelated items (not blockers, not owned here)

- `apps/worker/src/db/temporal.test.mjs` carries a pre-existing worktree
  modification (untouched since P0).
- Doctor D1 files + `0031` migration remain untracked in-tree work.
- Pre-existing `actors/sources.ts` D2 typecheck errors (outside protocol scope).
