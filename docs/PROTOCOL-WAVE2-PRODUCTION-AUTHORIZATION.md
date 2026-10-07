# PROTOCOLS WAVE 2 — PRODUCTION AUTHORIZATION PACKAGE (NOT APPLIED)

> This is the Wave-2 production handoff gate (P-11). Nothing in this file has
> been applied. Production stays at schema 0042 until the owner authorizes the
> exact-delta apply below. DASH Wave-1 production state is frozen (see
> `docs/PROTOCOL-DASH-WAVE1-CLOSURE.md`).

## Read-only production preflight (verified 2026-10-07/08)

- `/api/health`: commit da9dc6a, expectedSchema `0042_protocol_dash_wave1.sql`.
- `/api/ready`: READY; appliedMigration `0042_protocol_dash_wave1.sql`;
  zero blocked/degraded.
- `wrangler d1 migrations list --remote`: newest pending-for-apply is exactly
  `0043_protocol_mediterranean_wave2.sql` (0040/0041/0042 applied).
- Mediterranean-diet production rows: versions 0, components 0, claims 0,
  evidence 0 (Wave-2 unpopulated, as expected).
- News pipeline: medicalNEWS unchanged since last verification.
- Rollback branch exists for this state:
  `backup/protocols-doctors-2026-10-07` (pushed, 4a174b6).

## Exact delta (local migration 0043, verified locally end-to-end)

- File: `migrations/0043_protocol_mediterranean_wave2.sql` (data-only, no DDL).
- SHA-256: `85EE1C23FF3F1F73F315AA6F6AA68951BB6AEC0AA6E71E09BB4C9553745BBC9E`
- Canonical protocol: `mediterranean-diet` (reused; no new canonical).
- Rows to create (idempotent INSERT ... ON CONFLICT DO NOTHING):
  - protocol_versions: 1 (`med-v1`, DGA 2015-2020 Table A4-1 label)
  - protocol_components: 9 (Table A4-1 @2,000 kcal + Chapter 1 limits)
  - source_items: 2 (DGA Appendix-4 page, PREDIMED 2018 PubMed)
  - protocol_claims: 3 (1 DEFINITION + 2 OUTCOME)
  - protocol_evidence: 2
  - claim_evidence_links: 3 (all SUPPORTS)
  - actors: 0 (Doctors-reference gate: PENDING_DOCTORS_REFERENCE)
  - safety_rules: 0 (legitimately sparse; none explicitly evidenced)
  - commercial_relationships: 0
  - phases: 0 (non-phased pattern)
  - TOTAL = 17 rows across 6 tables (versions+components+items+claims+evidence+links)
- Idempotency: local apply → counts stable; second apply adds 0 rows
  (`mediterranean-wave2.test.mjs` re-apply test).
- Atomicity: bad-lineage insert aborts; ROLLBACK leaves zero trace (same test).
- Readback determinism: full-tree readback asserted equality (same test).
- Retraction: no 2013 PREDIMED material (test-pinned by locator regex).

## Rollback plan

- ID-scoped deletes tested locally: 17 → 0 → re-apply 17 (idempotent).
- Doc: `docs/PROTOCOL-MEDITERRANEAN-WAVE2-ROLLBACK.md`.
- Production rule: forward-fix first; destructive rollback only on explicit
  owner authorization (RELEASE-RUNBOOK §7).

## Deploy plan

- Requires a deploy authorization separate from this package.
- Deploy build = tree containing pointer update
  (`EXPECTED_SCHEMA_MIGRATION = '0043_protocol_mediterranean_wave2.sql'`,
  committed at 4a174b6) — i.e. `maintenance/test-time-determinism@4a174b6`.
- Expected post-deploy state: `/api/ready` appliedMigration == expectedSchema
  == 0043, zero blocked/degraded; health commit match.
- No protocol HTTP surface exists by design: post-deploy verification is
  read-only D1 counts + `/api/ready` + route integrity.

## Verification queries (post-apply, read-only)

```sql
SELECT COUNT(*) FROM protocol_versions WHERE protocol_id='mediterranean-diet';      -- 1
SELECT COUNT(*) FROM protocol_components WHERE version_id='med-v1';                 -- 9
SELECT COUNT(*) FROM protocol_claims WHERE protocol_id='mediterranean-diet';        -- 3
SELECT COUNT(*) FROM source_items WHERE discovery_reason='protocol-wave-2-med-controlled-import'; -- 2
SELECT name FROM d1_migrations ORDER BY name DESC LIMIT 1;                          -- 0043
SELECT COUNT(*) FROM protocols;                                                     -- 6 (unchanged)
```

## Blockers to this package becoming execution

- AUTHORIZATION: exact-delta approval for 0043 apply (and separately, deploy
  of the 0043-pointer build).
- None technical. All local gates green at commit 4a174b6; rollback tested;
  boundary tests PASS.

## NEXT (single action)

- OWNER_EXACT_DELTA_APPROVAL on the delta above. On approval: apply 0043 →
  verification queries → request deploy authorization for the 0043-pointer
  build. No further step is authorized today.
