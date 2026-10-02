# INDEX — task → exact context

Entry: `AGENTS.md` → `docs/CORE.md` → `docs/CURRENT.md` → your task below. One task = one repo. Cross-repo reading is exceptional (contracts, migration, integration deploy). Routine source work never loads `channel-content-os`. Files are read whole unless a `:start-end` line range is given.
Shorthand: `@ccos/` = sibling `channel-content-os` (owns channels, brand, design, dashboard, production, render, QA; absorbed `multi_channel_design`, ADR-0005).

### Add / retire / reactivate a source (lifecycle, any route)
READ: `docs/SOURCE-LIFECYCLE.md`
OPTIONAL: `scripts/source-lifecycle/orchestrator.mjs`, `scripts/source-lifecycle/cadence.mjs`
DO NOT LOAD: registries, `config/feeds.json`, traces in `.logs/source-lifecycle/`. Run `node scripts/source-lifecycle.mjs <add|retire|inspect> "<name or url>"`; it returns compact gate results
SECOND REPO: NO

### Add a Tıp Topluluğu source (subsystem wiring only)
Not an independent add path: a new source, retire or reactivate goes to the lifecycle route above. The wire tool is used only for the subsystem wiring the lifecycle orchestrator requires.
READ: `adapters/tip-toplulugu-radar/AGENTS.md`, `adapters/tip-toplulugu-radar/content/BIBLE-INDEX.md`, `adapters/tip-toplulugu-radar/scripts/tip_toplulugu_wire_source.py`
OPTIONAL: `adapters/tip-toplulugu-radar/radar/tip_toplulugu_registry.py`, `adapters/tip-toplulugu-radar/content/policies/tip-toplulugu-audience-scope.json`
DO NOT LOAD: full Bible, `config/feeds.json`, `docs/source-matrix.generated.json`, run history, `_*` probe dumps
SECOND REPO: NO

### Modify a source record (any route)
Field-level canonical maintenance only. Add, retire, reactivate or any lifecycle-grade change goes to the lifecycle route above.
READ: `adapters/tip-toplulugu-radar/AGENTS.md`, `adapters/tip-toplulugu-radar/content/BIBLE-INDEX.md`
OPTIONAL: `adapters/tip-toplulugu-radar/scripts/check_source_identity.py`
DO NOT LOAD: whole registries. Look up one record with `node scripts/registry-find.mjs <source-id>` (read-only, searches only the canonical stores); edit the canonical file it names
SECOND REPO: NO

### Tıp Topluluğu parser or fetch fix
READ: `adapters/tip-toplulugu-radar/AGENTS.md`, `adapters/tip-toplulugu-radar/radar/tip_toplulugu_fetch.py`
OPTIONAL: `adapters/tip-toplulugu-radar/radar/fetchers.py`, `adapters/tip-toplulugu-radar/scripts/tip_toplulugu_run_one.py`, `adapters/tip-toplulugu-radar/scripts/tip_toplulugu_tr_runner_setup.md` (sources blocked outside Türkiye, e.g. HSGM: `.github/workflows/tip-toplulugu-tr-runner.yml`)
DO NOT LOAD: fixtures beyond the one failing case, full logs, generated matrices, Bible
SECOND REPO: NO

### Worker / Kaduse parser or ingest fix
READ: `AGENTS.md`, `apps/worker/src/ingress/generic-web.ts`
OPTIONAL: `apps/worker/src/ingress/ingest-gate.ts`, `apps/worker/src/ingress/link-quality.ts`
DO NOT LOAD: Tıp Topluluğu adapter, fixtures beyond the failing case, `config/feeds.json` in bulk
SECOND REPO: NO

### Tıp Topluluğu source policy, audience, lifecycle
READ: `adapters/tip-toplulugu-radar/AGENTS.md`, `adapters/tip-toplulugu-radar/content/BIBLE-INDEX.md`, `adapters/tip-toplulugu-radar/content/policies/tip-toplulugu-audience-scope.json`
OPTIONAL: `adapters/tip-toplulugu-radar/radar/tip_toplulugu_audience_scope.py`, `adapters/tip-toplulugu-radar/content/SORUN-TESPIT-LISTESI.md:1-104`
DO NOT LOAD: full Bible, run history, other channels
SECOND REPO: NO

### Kaduse news / research source work
READ: `AGENTS.md`, `apps/worker/src/ingress/feed-scope.ts`
OPTIONAL: `apps/worker/src/ingress/who-news.ts`, `apps/worker/src/ingress/europe-pmc.ts`, `docs/research-contract.md` (research registry + Research Pool contract; code: `packages/source-catalog/src/research/`)
DO NOT LOAD: Tıp Topluluğu adapter, `config/feeds.json` in bulk. Kaduse editorial policy is owned by the channel repo
SECOND REPO: NO (YES only for a Kaduse editorial-policy question: `@ccos/channels/kaduse-medikal/content/policies/kaduse-news.json`)

### Scheduler / cadence / capacity
READ: `docs/OPERATIONS.md`, `adapters/tip-toplulugu-radar/radar/tip_toplulugu_scheduler.py`, `apps/worker/src/scheduled-jobs.ts`, `wrangler.toml`
OPTIONAL: `adapters/tip-toplulugu-radar/tests/test_tip_toplulugu_scheduler_fairness.py`, `docs/continuous-flow.md`, `docs/cron-capacity-report.md`, `adapters/tip-toplulugu-radar/radar/tip_toplulugu_continuous_runner.py`, `.github/workflows/tip-toplulugu-python-runner.yml`
DO NOT LOAD: source registries, Bible, run history
SECOND REPO: NO

### Evergreen runtime / cursor / runner / source telemetry
READ: `docs/EVERGREEN-RUNTIME.md`, `docs/SOURCE-LIFECYCLE.md`
OPTIONAL: `apps/worker/src/ingress/evergreen.ts`, `apps/worker/src/ingress/evergreen-state.ts`, `adapters/tip-toplulugu-radar/radar/evergreen_runner.py`
DO NOT LOAD: source registries in bulk, archived run history. Activation stays lifecycle-owned and requires owner approval
SECOND REPO: NO

### Hub UI
READ: `apps/hub/AGENTS.md`
OPTIONAL: `apps/hub/route-counts.test.mjs`, `apps/hub/source-family.test.mjs`, `apps/hub/source-review-filter.test.mjs`
DO NOT LOAD: `apps/hub/index.html` whole (grep the function), Bible copies in `apps/hub/`
SECOND REPO: NO

### Triage / feedback
READ: `apps/worker/src/triage/actions.ts`, `apps/worker/src/triage/actions.test.mjs`, `apps/worker/src/triage/feedback.ts`
OPTIONAL: `migrations/0023_review_feedback.sql`, `apps/worker/src/db/queries.ts`, `docs/RELEVANCE-LOOP.md` (P5 accept/reject, patterns, owner-applied ordering)
DO NOT LOAD: ingress code, registries, Bible
SECOND REPO: NO

### Source health / revalidation / pass-fail
READ: `apps/worker/src/triage/revalidation.ts`, `apps/worker/src/ingress/source-pass-fail.ts`, `adapters/tip-toplulugu-radar/content/BIBLE-INDEX.md`
OPTIONAL: `adapters/tip-toplulugu-radar/radar/source_pass_fail.py`, `migrations/0024_source_revalidation.sql`, `scripts/production-check.mjs`
DO NOT LOAD: full Bible (use the SPF rows), registries in bulk
SECOND REPO: NO

### approved_brief producer (or contract change)
READ: `packages/contracts/src/index.ts`, `apps/worker/src/triage/actions.ts`, `apps/worker/src/triage/actions.test.mjs`, `docs/approved-brief-handoff.md`
OPTIONAL: `@ccos/mcp-server/src/handoff/contract/approved-brief.schema.json`
DO NOT LOAD: source registries, design docs, Bible, architecture docs, history
SECOND REPO: NO (YES only when the payload shape changes: then also the consumer read set in `@ccos/docs/INDEX.md`)

### Registry maintenance / lookup
READ: `scripts/registry-find.mjs`, `packages/source-catalog/README.md`, `adapters/tip-toplulugu-radar/scripts/check_source_identity.py`
OPTIONAL: `adapters/tip-toplulugu-radar/content/README.md`, `adapters/tip-toplulugu-radar/scripts/dump_source_registry.py`
DO NOT LOAD: whole registries; `node scripts/registry-find.mjs <source-id>` returns one record. Any compact index must be generated and non-editable
SECOND REPO: NO

### Production deploy
READ: `docs/deploy.md`, `docs/RECOVERY.md`, `wrangler.toml`, `.github/workflows/worker-tests.yml`
OPTIONAL: `scripts/production-check.mjs`
DO NOT LOAD: source registries, Bible, history. Deploy / remote migration need explicit user authorization
SECOND REPO: NO

### Tests / CI
READ: `AGENTS.md`, `.github/workflows/worker-tests.yml`, `.github/workflows/tip-toplulugu-tests.yml`
OPTIONAL: `adapters/tip-toplulugu-radar/scripts/run_tip_toplulugu_tests.py`
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

### How much context did a task use? (P4 context telemetry)
READ: `docs/context/task-classes.json`
OPTIONAL: `docs/context/benchmarks.json`
DO NOT LOAD: transcripts. Run `node scripts/context-telemetry.mjs sessions --file <transcript.jsonl> [--class C] [--why "..."] --check`, `summary --scope content-systems`, `benchmarks`, or `manual <manifest.json>` for non-Claude agents
SECOND REPO: NO

### History / evidence (not current truth; only when the question is "why/what was true then")
READ: `docs/CURRENT.md` (current truth wins over every file below)
OPTIONAL: only the one record for your question: `docs/global-news-hub-contract.md` (2026-09-04 Hub/source-registry design record, pre-ADR-0004 ownership), `adapters/tip-toplulugu-radar/content/archive/` (pre-v4 Tıp Topluluğu history)
DO NOT LOAD: any of these as rules or current state; they are archived at their original paths (HISTORY / EVIDENCE banner) because code and tests cite them
SECOND REPO: NO
