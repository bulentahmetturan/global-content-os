# Self-improving selection, part 1 (2026-10-24)

Status: built and tested locally, NOT yet deployed. Nothing here changes triage status, promotes, or deletes; scores and gates only inform and order.

## What exists
- `apps/worker/src/scoring/features.ts`: deterministic features and eight hard gates from the channel interview (docs/audits/2026-10-23-channel-profile-interview.md). Gates only group; an owner rating of wow >= 6 on a gated item is counted as a gate error.
- `apps/worker/src/scoring/model.ts`: four logistic heads (wow, tt, ik, km) over 4096 hashed features. The interview rules are the prior; ratings move weights away from it with L2 pull back. 5-fold cross-validation against the rules-only baseline.
- `apps/worker/src/scoring.ts`: `POST /api/scoring/run` (train + score up to 400 inbox items), `GET /api/scores/latest?ids=`, `GET /api/scoring/status`. All gated by the Hub operator token (ROUTE_GATES + `scripts/lib/hub-auth.mjs`).
- Activation guard: a learned model replaces the rules only with >= 30 rated items AND held-out worthy-accuracy and wow-MAE not worse than the rules. Otherwise `RULES_ONLY` is recorded with the reason. Every run stores a model row with its metrics, so improvement is measurable over time.
- `migrations/addons/a002_scoring.sql` (`scoring_models`, `item_scores`): optional, applied by the owner; until then all three routes answer 503 `SCORING_NOT_READY` and the Hub ignores it.
- Hub: `⚙ 7.2` chip and `ELENDİ` chip on cards, "Sistem tahmini" block (score, channels, plus/minus reasons, gate labels) in the reading pane; scoring is requested at most every 15 minutes.

## Honest limits
- Mechanism and measurement are guaranteed; monotonic improvement is not. With few ratings the system stays on the rules by design.
- Not built yet (part 2): per-channel selection screens, "teach" mode (most uncertain first), scheduled retrain and automatic rollback, reason chips on the rating form, Instagram performance feedback.

## Owner steps (production writes are the owner's)
1. `wrangler d1 execute global-content-os --remote --file migrations/addons/a002_scoring.sql`
2. Deploy the Worker + Hub assets with the usual deploy-identity flow; verify module hash by dry run, `/api/ready`, 401 without token on the three new routes.
3. Read-only check: `GET /api/scoring/status` shows the first model row.
Rollback: `wrangler rollback <previous version>`; tables are harmless if left.
