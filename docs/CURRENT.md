# CURRENT — state as of 2026-09-29 (no history here)

## Runtime reality
- Canonical runtime: Cloudflare Worker (`apps/worker`) + D1 (`migrations/`) + cron (`wrangler.toml`), Hub UI in `apps/hub`, Python Hekimler radar in `adapters/hekimler-radar` (GitHub Actions runners).
- Active branch: `feat/manual-intake-activation` (PR #4, draft, per S70 log). `main` is an ancestor of it.
- Last confirmed production deploy: S66 (2026-09-28), migrations 0022–0023 applied. Whether 0024 and later branch work are live is NOT confirmed here — check `docs/deploy.md` procedure with the user before assuming.
- Deploy, remote migration, and merge of PR #4 need explicit user authorization.

## Known intentional legacy (do not "clean up")
- `adapters/tip-radar/` reads the local Python radar SQLite; push via `push-to-hub`.
- `apps/hub/00_TURK_TIP_*BIBLE*.md` are build copies of the Bible in `adapters/hekimler-radar/content/` (DEFERRED_BUILD_COPY).
- `**/legacy-cleanup/`, `**/archive/`, `adapters/hekimler-radar/content/SORUN-TESPIT-LISTESI.md` run log: preserved evidence.
- 118 registry sources shown as "registered but not fetching" are deliberate `MANUAL_INTAKE` (S61–S63), not bugs.

## Parallel work in flight (results not assumed)
- Package 2 (source catalog, registries, feeds generation, Hekimler source policy, tip-radar): worktree `global-content-os.arch`, branch `arch/three-system-reconciliation`. Registry/feeds paths may move. DEFER_TO_PACKAGE_2.
- Package 3 (multi_channel_design → channel-content-os merge; channel/brand/design ownership): DEFER_TO_PACKAGE_3. Final two-repo target: `global-content-os` + `channel-content-os`.
- Package 4 (this router set): branch `chore/token-context-architecture`; needs reconciliation against final P2/P3 paths.

## Real blockers
- Test baseline noted in S60/S63: 7 known failures in `adapters/hekimler-radar/tests/test_phase1_ingestion_canary.py` (since S07). Re-verify before relying on it.
- Registry record-level lookup (`registry-find`) waits on Package 2's final catalog path/schema.

## Run
- Links: `node scripts/check-router-links.mjs`; route cost: `node scripts/check-router-links.mjs --simulate`.
- Typecheck: `npm run typecheck`. Worker tests: `node apps/worker/src/<file>.test.mjs`. Hekimler: `python adapters/hekimler-radar/scripts/run_hekimler_tests.py`.
