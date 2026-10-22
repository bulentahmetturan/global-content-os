# Hub health card (prepared locally, not deployed)

Purpose: show the `health-watch` result inside Global OS so a silent failure (the Dossier 400, 8 days unnoticed) is visible the moment the Hub is opened.

## What was added
- `apps/worker/src/health-watch.ts`: read-only checks (SELECTs only): worker readiness, Dossier source state and stuck run, ClinicalTrials observation freshness (72 h), Statistics last run (80 h) and policy, content-route freshness (48 h). Pure `evaluateHealth` plus a collector.
- `GET /api/health/watch` in `apps/worker/src/index.ts`, gated by the Hub operator token (`ROUTE_GATES`, mirrored in `scripts/lib/hub-auth.mjs`; fail-closed 503 unset / 401 wrong).
- Hub sidebar card (`apps/hub/index.html`): green "sağlıklı" or red "n uyarı", click lists the alerts; refreshes on load and every 15 min; fails quietly ("okunamadı" or "operatör anahtarı gerekli") and never breaks the Hub.
- Tests: `health-watch.test.mjs` (4, includes the 8-day-silent-failure shape), route-auth gate tests (104/104 with the new gate), Hub tests 23/23, `tsc --noEmit` clean. Visual check done against a local mock (alert state rendered and expanded).

## Not covered / honest limits
- The Protocols five-row check stays in the CLI (`scripts/health-watch.mjs`; needs the correction manifest).
- It shows state when someone opens the Hub; it does not push a notification. A push channel is a separate step.
- It is **not live until the Worker is deployed**: a new bundle, owner-executed deployment (same discipline as Gate D: build, hash, deploy, verify).
- Pre-existing, unrelated: `apps/worker/src/ingress/medikalnews.test.mjs` "real items persist..." fails because its fixture dates (2026-10-07) are now older than the time window; 1,603 of 1,604 Worker tests pass.
