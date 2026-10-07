# Future production operation — Doctor bootstrap + audit-only canary (NOT EXECUTED)

Status: PLAN ONLY. Executes only under a separate explicit owner
authorization that names the association AND this release SHA. No fetch, no
parser, no ingestion, no items, no editorial output, no second identity.

## Baseline this plan was proven against

- Release: integrated Doctor (D1–D4, R1 operator plane, bootstrap) +
  Protocol through 0040, readiness EXPECTED 0040, zero pending migrations
  from the release tree.
- Production at proof time held zero Doctor rows and ledger 0040/0041 on an
  unrelated feed migration (see R2 report §production-reality). Re-verify
  ledger + zero-row state immediately before executing; any drift aborts
  the canary, it never adapts it.

## Identity under test (fixed, allowlist-keyed)

- Key: `ahmet-ekmekci-official-website`
- Actor: Ahmet Ekmekçi, TURKEY_EXPERT_PANEL
- Endpoint: OFFICIAL_WEBSITE `https://ahmetekmekci.com`
- Association: OFFICIAL_PERSONAL
- Abort if the allowlist entry in the deployed code differs by any field.

## Sequence

A. CODE-ONLY DEPLOY the frozen R2 SHA (zero migrations pending from it).
B. Verify `/api/health` commit, `/api/ready` READY, appliedMigration.
C. Verify production Doctor counts (actors/associations/activity/
   evaluations) are all zero via bounded metadata reads only.
D. BOOTSTRAP `POST /api/ops/doctor-bootstrap`
   `{"identityKey": "ahmet-ekmekci-official-website", "reason": "<why>"}`
   — expect 200, all three `created` (or all `existing` with identical ids
   on a careful repeat; a second distinct bundle is a failure).
E. Verify one actor, one endpoint, one association via
   `GET /api/ops/doctor-audit`.
F. Verify association NOT_INGESTABLE (`latestIngestability: null`) and zero
   activation activity.
G. ACTIVATE: `POST /api/ops/doctor-activation` with technical evidence +
   reason — expect 200 INGESTABLE/CONDITIONALLY_INGESTABLE.
H. GET audit — expect the activation evaluation + activity row.
I. Verify INGESTABLE plus append-only event ids.
J. DISABLE with reason — expect 200 NOT_INGESTABLE.
K. GET audit.
L. Verify NOT_INGESTABLE latest with full ordered history intact.
M. Prove history survives: re-read after a pause; rows byte-identical.
N. STOP. Report counts, ids, and timestamps; change nothing else.

## Abort conditions (stop, do not improvise)

Any 4xx/5xx outside the runbook table; any history row that changes; any
write outside the two audit tables (plus the three seeded identity rows);
any fetch/parser/item/editorial/scheduler activity; any second identity;
any ledger drift discovered in step B/C.
