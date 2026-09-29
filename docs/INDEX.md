# INDEX — task → exact context

Entry: `AGENTS.md` → `docs/CORE.md` → `docs/CURRENT.md` → your task below. One task = one repo. Cross-repo reading is exceptional (contracts, migration, integration deploy). Routine source work never loads `channel-content-os`. Files are read whole unless a `:start-end` line range is given.
Shorthand: `@ccos/` = sibling `channel-content-os` (owns channels, brand, design, dashboard, production, render, QA; absorbed `multi_channel_design`, ADR-0005).

### Add / retire / reactivate a source (lifecycle, any route)
READ: `docs/SOURCE-LIFECYCLE.md`
OPTIONAL: `scripts/source-lifecycle/orchestrator.mjs`, `scripts/source-lifecycle/cadence.mjs`
DO NOT LOAD: registries, `config/feeds.json`, traces in `.logs/source-lifecycle/`. Run `node scripts/source-lifecycle.mjs <add|retire|inspect> "<name or url>"`; it returns compact gate results
SECOND REPO: NO

### Add a Hekimler source
READ: `adapters/hekimler-radar/AGENTS.md`, `adapters/hekimler-radar/content/BIBLE-INDEX.md`, `adapters/hekimler-radar/scripts/hekimler_wire_source.py`
OPTIONAL: `adapters/hekimler-radar/radar/hekimler_registry.py`, `adapters/hekimler-radar/content/policies/hekimler-audience-scope.json`
DO NOT LOAD: full Bible, `config/feeds.json`, `docs/source-matrix.generated.json`, run history, `_*` probe dumps
SECOND REPO: NO

### Modify a source record (any route)
READ: `adapters/hekimler-radar/AGENTS.md`, `adapters/hekimler-radar/content/BIBLE-INDEX.md`
OPTIONAL: `adapters/hekimler-radar/scripts/check_source_identity.py`
DO NOT LOAD: whole registries. Look up one record with `node scripts/registry-find.mjs <source-id>` (read-only, searches only the canonical stores); edit the canonical file it names
SECOND REPO: NO

### Hekimler parser or fetch fix
READ: `adapters/hekimler-radar/AGENTS.md`, `adapters/hekimler-radar/radar/hekimler_fetch.py`
OPTIONAL: `adapters/hekimler-radar/radar/fetchers.py`, `adapters/hekimler-radar/scripts/hekimler_run_one.py`
DO NOT LOAD: fixtures beyond the one failing case, full logs, generated matrices, Bible
SECOND REPO: NO

### Worker / Kaduse parser or ingest fix
READ: `AGENTS.md`, `apps/worker/src/ingress/generic-web.ts`
OPTIONAL: `apps/worker/src/ingress/ingest-gate.ts`, `apps/worker/src/ingress/link-quality.ts`
DO NOT LOAD: Hekimler adapter, fixtures beyond the failing case, `config/feeds.json` in bulk
SECOND REPO: NO

### Hekimler source policy, audience, lifecycle
READ: `adapters/hekimler-radar/AGENTS.md`, `adapters/hekimler-radar/content/BIBLE-INDEX.md`, `adapters/hekimler-radar/content/policies/hekimler-audience-scope.json`
OPTIONAL: `adapters/hekimler-radar/radar/hekimler_audience_scope.py`, `adapters/hekimler-radar/content/SORUN-TESPIT-LISTESI.md:1-98`
DO NOT LOAD: full Bible, run history, other channels
SECOND REPO: NO

### Kaduse news / research source work
READ: `AGENTS.md`, `apps/worker/src/ingress/feed-scope.ts`
OPTIONAL: `apps/worker/src/ingress/who-news.ts`, `apps/worker/src/ingress/europe-pmc.ts`
DO NOT LOAD: Hekimler adapter, `config/feeds.json` in bulk. Kaduse editorial policy is owned by the channel repo
SECOND REPO: NO (YES only for a Kaduse editorial-policy question: `@ccos/channels/kaduse-medikal/content/policies/kaduse-news.json`)

### Scheduler / cadence / capacity
READ: `docs/OPERATIONS.md`, `adapters/hekimler-radar/radar/hekimler_scheduler.py`, `apps/worker/src/scheduled-jobs.ts`, `wrangler.toml`
OPTIONAL: `adapters/hekimler-radar/tests/test_hekimler_scheduler_fairness.py`, `docs/continuous-flow.md`, `docs/cron-capacity-report.md`, `adapters/hekimler-radar/radar/hekimler_continuous_runner.py`, `.github/workflows/hekimler-python-runner.yml`
DO NOT LOAD: source registries, Bible, run history
SECOND REPO: NO

### Hub UI
READ: `apps/hub/AGENTS.md`
OPTIONAL: `apps/hub/route-counts.test.mjs`, `apps/hub/source-family.test.mjs`, `apps/hub/source-review-filter.test.mjs`
DO NOT LOAD: `apps/hub/index.html` whole (grep the function), Bible copies in `apps/hub/`
SECOND REPO: NO

### Triage / feedback
READ: `apps/worker/src/triage/actions.ts`, `apps/worker/src/triage/actions.test.mjs`, `apps/worker/src/triage/feedback.ts`
OPTIONAL: `migrations/0023_review_feedback.sql`, `apps/worker/src/db/queries.ts`
DO NOT LOAD: ingress code, registries, Bible
SECOND REPO: NO

### Source health / revalidation / pass-fail
READ: `apps/worker/src/triage/revalidation.ts`, `apps/worker/src/ingress/source-pass-fail.ts`, `adapters/hekimler-radar/content/BIBLE-INDEX.md`
OPTIONAL: `adapters/hekimler-radar/radar/source_pass_fail.py`, `migrations/0024_source_revalidation.sql`, `scripts/production-check.mjs`
DO NOT LOAD: full Bible (use the SPF rows), registries in bulk
SECOND REPO: NO

### approved_brief producer (or contract change)
READ: `packages/contracts/src/index.ts`, `apps/worker/src/triage/actions.ts`, `apps/worker/src/triage/actions.test.mjs`, `docs/approved-brief-handoff.md`
OPTIONAL: `@ccos/mcp-server/src/handoff/contract/approved-brief.schema.json`
DO NOT LOAD: source registries, design docs, Bible, architecture docs, history
SECOND REPO: NO (YES only when the payload shape changes: then also the consumer read set in `@ccos/docs/INDEX.md`)

### Registry maintenance / lookup
READ: `scripts/registry-find.mjs`, `packages/source-catalog/README.md`, `adapters/hekimler-radar/scripts/check_source_identity.py`
OPTIONAL: `adapters/hekimler-radar/content/README.md`, `adapters/hekimler-radar/scripts/dump_source_registry.py`
DO NOT LOAD: whole registries; `node scripts/registry-find.mjs <source-id>` returns one record. Any compact index must be generated and non-editable
SECOND REPO: NO

### Production deploy
READ: `docs/deploy.md`, `docs/RECOVERY.md`, `wrangler.toml`, `.github/workflows/worker-tests.yml`
OPTIONAL: `scripts/production-check.mjs`
DO NOT LOAD: source registries, Bible, history. Deploy / remote migration need explicit user authorization
SECOND REPO: NO

### Tests / CI
READ: `AGENTS.md`, `.github/workflows/worker-tests.yml`, `.github/workflows/hekimler-tests.yml`
OPTIONAL: `adapters/hekimler-radar/scripts/run_hekimler_tests.py`
DO NOT LOAD: full logs, fixtures
SECOND REPO: NO

### Architecture migration / ownership boundary
READ: `docs/CURRENT.md`, `@ccos/docs/decisions/0005-mcd-consolidation-into-channel-content-os.md`, `@ccos/docs/CONTENT-SYSTEMS-MAP.md` (ADR-0004, partly superseded)
OPTIONAL: `docs/approved-brief-handoff.md`
DO NOT LOAD: registries, Bible, run history, feeds
SECOND REPO: YES

### Operations / readiness / release gate
READ: `docs/OPERATIONS.md`, `docs/ops/RELEASE-RUNBOOK.md`
OPTIONAL: `scripts/release-gate.mjs`, `scripts/deploy-identity.mjs`, `release/checklist.json`, `apps/worker/src/readiness.ts`
DO NOT LOAD: `.logs/` (full logs stay on disk; read the PASS/FAIL summary or failing test names), source registries, history
SECOND REPO: NO

### Report a system problem / evidence lifecycle / audit
READ: `docs/EVIDENCE.md`
OPTIONAL: `packages/system-evidence/index.mjs`
DO NOT LOAD: `docs/evidence/system-evidence.ndjson` (append-only ledger; query it with `node scripts/evidence.mjs show <id>` or `audit`). Audits start with `node scripts/evidence.mjs audit-input`; report a user problem with `node scripts/evidence.mjs report-issue "<summary>" --actor human:<name> --apply`
SECOND REPO: NO
