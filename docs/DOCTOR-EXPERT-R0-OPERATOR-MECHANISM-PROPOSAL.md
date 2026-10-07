# R0 — Operator execution mechanism PROPOSAL (not implemented)

Status: PROPOSAL ONLY. No route, job, or surface was added in R0.
Design for a future explicit owner authorization; do not build without it.

## Finding

No existing production runtime path invokes Doctor activation/audit logic:

1. The Worker imports nothing from `actors/` (only test bundles reference it).
2. `OPS_TOKEN` routes (`/api/cron/run`, `/api/purge/trash`,
   `/api/expire/stale-inbox`, `/api/source-health/low-yield`,
   `/api/source-revalidation/run`) touch scheduler/hygiene state only.
3. `HUB_OPERATOR_TOKEN` routes (`/api/triage`, ingress triggers) are
   editorial or feed-driven; using them for activation would create
   editorial output or require registry rows that must not exist yet.
4. `INGEST`-token routes push feed items; doctor endpoints are
   pre-activation by design and must not enter that path.

So questions R0.6/2–8 all answer NO: an activation+audit-only production
canary is NOT possible without new runtime code.

## Recommended minimal mechanism (one option only)

**`POST /api/ops/doctor-activation` — one-shot, operator-invoked, audit-only.**

- Trust boundary: server-side Worker route; never exposed in Hub UI.
- Auth: existing `OPS_TOKEN` bearer via `ROUTE_GATES` (same fail-closed
  pattern as `/api/cron/run`); unset token = 503, wrong token = 401.
- Invocation shape: `{ associationId, action: 'activate' | 'deactivate' |
  'record-check', evidence?: IngestabilityEvidence, reason: string }`.
  `reason` required, min length enforced.
- Modules reused: `actors/activity.ts` (`activateAssociationForIngestion`,
  `deactivateAssociation`, `recordActivity`, `getAssociationAuditBundle`)
  and `actors/sources.ts` lookups only. No new store logic.
- Mutations permitted: rows in `actor_source_activity` and
  `actor_source_ingestability` for the single named association only.
- Mutations forbidden: `actors`, `actor_source_associations`,
  `actor_source_endpoints`, `source_feeds`, `source_items`, triage,
  `approved_briefs`, protocol tables, scheduler state. The handler must
  reject any request that would write outside the two audit tables
  (enforced by code review + a dedicated test asserting table-write scope).
- Audit behavior: every call appends append-only rows with
  `evaluated_by='ops:doctor-activation'` provenance; failures fail closed
  with no partial writes (single D1 batch).
- Rollback/disable: `action:'deactivate'` flips current state via a new
  row; history preserved. No delete path exists.
- Why less surface than alternatives: reuses the existing OPS_TOKEN gate
  table (one line in `ROUTE_GATES`) instead of a new secret; no cron, no
  polling, no public surface, no fetch, no item creation; strictly narrower
  than extending `/api/triage` (editorial side effects) or adding a runner.

## Schneller future canary under this proposal

Owner invokes activate → verifies bundle via a read-only
`GET /api/ops/doctor-audit?associationId=` (same gate; selects only) →
optionally deactivates. Expected state: activation + ingestability + audit
+ history rows only; zero items, zero briefs, zero fetches.
