# Production canary runbook — Doctor audit-only canary (NOT EXECUTED)

Status: PLAN ONLY. Executes only under a separate explicit owner
authorization that names the association. No fetch, no parser, no items.

## Precondition: production row existence (fixtures ≠ production)

D1–D4 fixtures prove the MODEL, not production rows. Before step 1, confirm
in production that all three exist, or stop:

- actor: the explicitly approved person (e.g. Ahmet Ekmekçi)
- endpoint: the explicitly approved source endpoint (e.g. OFFICIAL_WEBSITE
  `https://ahmetekmekci.com`)
- association: the explicitly approved OFFICIAL_PERSONAL link between them

If creating the actor/source/association rows in production itself requires
a governance operation beyond this runbook, that operation must be
authorized and executed first — this runbook does not seed silently.
Expected: production currently holds ZERO doctor rows, so a seeding
decision is required before any canary:

- PRODUCTION_CANARY_REQUIRES_ACTOR_SEED = YES
- PRODUCTION_CANARY_REQUIRES_SOURCE_SEED = YES
- PRODUCTION_CANARY_REQUIRES_ASSOCIATION_SEED = YES

## Canary sequence (one approved association only)

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
