# Evergreen runtime P3

Prepared locally on the production Temporal V2 model. All four lifecycle entries remain CANARY_ONLY.
No source activation, remote migration, deploy or production item write is part of this preparation.

Worker authority:
- Migration 0029 adds runtime state only; 0028 and canonical item/membership semantics remain unchanged.
- GET /api/evergreen/plan previews at most four configured sources without writes.
- POST /api/evergreen/plan requires X-Ingest-Token and claims due ACTIVE sources with transport enabled,
  positive daily budget and no live family lease. Leases expire after 30 minutes.
- POST /api/ingress/evergreen-items requires the same token and Worker-issued runId. The Worker checks
  candidate archive/host scope, caps, cursor shape, activation and transport before admission.
- Cursor advances only on successful completion. Errors preserve cursor, retain last successful fetch,
  expose last_error and schedule bounded exponential retry (1 to 24 hours).
- Lost-response completion retries return the persisted result; concurrent completion is refused.
  A crashed executor's lease expires and the next plan resumes the canonical cursor. Partial item writes
  are encountered by canonical dedupe on retry. Configuration is never written by either route.
- GET /api/evergreen/status supplies source names, activation, blockers, last successful fetch,
  next due, evaluated/accepted counts, today's admission count, underfill, error and cursor.

Executor:
`.github/workflows/evergreen-runner.yml` runs hourly, sequentially, with a 25-minute job cap and concurrency
control. Python obtains authenticated plans and executes only their archive windows. It never chooses
source activation, daily targets, cadence or canonical work identity. HTTP 403/429 and robots exclusions
are reported without bypass. Completion response loss gets one identical retry. Runtime failure releases
the source into Worker backoff; abrupt process death is recovered by lease expiry.

Owner review before production:
1. Review tests and migration 0029, then authorize remote migration and deployment separately.
2. Review source lifecycle changes for the four existing identities only. PubMed's production transport
   is currently disabled and blocks writes even if its Evergreen activation is changed.
3. Approve activation through the canonical lifecycle, deploy reviewed registry changes, and enable the
   workflow on the production/default branch with its existing ingest secret.
4. Verify real health_reference and research_rediscovery items, count/list agreement, persisted cursor,
   repeated completion, error/recovery telemetry and UI. P2/P3 production acceptance remains pending
   until these real observations exist. Healthline and Yale remain excluded.

## Migration 0029: scope, rollback and recovery

- `0029_evergreen_runtime_state.sql` is one `CREATE TABLE evergreen_runtime_state`: no ALTER, UPDATE, DELETE, trigger or backfill.
  A test (`temporal.test.mjs`) applies it to a 0028-shaped database and proves every existing row, column, index and constraint is
  byte-identical, that the table starts empty with inert defaults, and that 0028-era statements keep working.
- Rollback: `wrangler rollback <previous Worker version>`. The previous Worker never names the table, so leaving the (empty or
  small) table in place is harmless; there is no data to restore. Do not drop it while a 0029 Worker is live (readiness expects 0029).
- Recovery from a crashed executor: the lease expires after 30 minutes, the next plan resumes from the persisted cursor, and partial
  item writes are absorbed by canonical dedupe. `/api/evergreen/status` shows `lease.state` (IDLE, LEASED, PROCESSING, COMPLETED,
  LEASE_EXPIRED_RECOVERABLE), `lease.retryAt` after a failure, `failureCount`, `lastError` and the cursor.
- `underfill` is reported only for ACTIVE sources; CANARY_ONLY or blocked sources report `null` (not a false alarm).

## PubMed activation blocker (investigated)

- Registry/catalog (`config/feeds.json`) say `research-pubmed-eutilities` is enabled; production D1 has `enabled = 0` (last fetch
  2026-09-24T11:33Z, 124 items, 47 holds, 0 rejects). No migration, lifecycle record or `source_change_history` row explains it, so it is
  an undocumented production state, not a runtime wiring failure: the Worker is correctly refusing to write to a disabled feed.
- The local canary does not show this: it inserts feed rows from `config/feeds.json` (enabled) into its disposable database.
- Re-enabling the feed row is not a neutral switch: it also resumes the legacy time-sensitive PubMed topic batch
  (`ingestPubmed`, term `auscultation OR stethoscope OR ("artificial intelligence" AND medicine)`). Activation therefore needs an owner
  decision and a lifecycle `reactivate`; this runtime never enables it. PubMed stays CANARY_ONLY.

## Deploy order (the workflow is inert until it is safe)

`evergreen-runner.yml` calls `POST /api/evergreen/plan`, which exists only in a Worker built with this change. If the workflow reaches the
default branch before that Worker is deployed it fails hourly (the Worker answers 404). Order: remote migration 0029, deploy Worker,
then merge the workflow. While every source is CANARY_ONLY the plan claims nothing and no item is written.
