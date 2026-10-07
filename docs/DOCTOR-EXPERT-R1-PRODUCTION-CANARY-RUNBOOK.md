# Production canary runbook — Doctor audit-only canary (NOT EXECUTED)

Status: PLAN ONLY. Executes only under a separate explicit owner
authorization that names the association. No fetch, no parser, no items.

## Precondition: production row existence (fixtures ≠ production)

D1–D4 fixtures prove the MODEL, not production rows. The bootstrap route
(`POST /api/ops/doctor-bootstrap`, R1 Phase C, undeployed at the time of
writing) is the only approved seeding mechanism: allowlist key
`ahmet-ekmekci-official-website` → one actor + endpoint + association, no
activation. Invoking it in production needs its own explicit authorization;
until then production holds ZERO doctor rows:

- PRODUCTION_CANARY_REQUIRES_ACTOR_SEED = YES (via bootstrap route only)
- PRODUCTION_CANARY_REQUIRES_SOURCE_SEED = YES (via bootstrap route only)
- PRODUCTION_CANARY_REQUIRES_ASSOCIATION_SEED = YES (via bootstrap route only)

## Canary sequence (one approved association only)

0. Authorized bootstrap first: `POST /api/ops/doctor-bootstrap`
   `{"identityKey": "ahmet-ekmekci-official-website", "reason": "<why>"}`
   (expect 200 with actor/endpoint/association all `created`; a repeat must
   return `existing` with identical ids). Abort on anything else.
1. Resolve the association: `GET /api/ops/doctor-audit?associationId=…`
   (expect 200; record `latestIngestability`, expected null/UNKNOWN).
2. `POST /api/ops/doctor-activation` action `activate` with technical
   evidence + operator reason (expect 200 INGESTABLE/CONDITIONALLY).
3. Re-read the bundle (expect activation evaluation + activity row).
4. `POST /api/ops/doctor-activation` action `disable` with reason
   (expect 200 NOT_INGESTABLE).
5. Re-read the bundle (expect full ordered history; latest = disable).

## Expected end state

- REAL_NETWORK_FETCH_EXECUTED = NO
- PARSER_EXECUTED = NO
- INGESTION_EXECUTED = NO
- SOURCE_ITEM_CREATED = NO
- EDITORIAL_ITEM_CREATED = NO
- New production rows: only `actor_source_ingestability` + 
  `actor_source_activity` rows for the one association (plus the separately
  authorized seed rows, if any).

## Abort conditions

Stop and report (do not improvise): any 4xx/5xx outside the runbook table,
any history row that changes after being written, any write outside the two
audit tables, any sign of fetch/parser/item/editorial activity.
