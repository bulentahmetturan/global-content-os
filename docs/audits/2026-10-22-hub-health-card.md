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

## Hub module panels (added same day)
`GET /api/hub/modules` (Hub operator token, read-only, `apps/worker/src/hub-modules.ts`) feeds a new sidebar group **Sistem Modülleri** with five panels: Dossier (source state, last runs, observations), Doktorlar (actors, candidates, onboarding), Protokoller (registry), Keşif (waves, candidates, decisions), İstatistik (runs, policy, counts). Each module is collected independently; a failing table shows an error for that panel only. Tests: `hub-modules.test.mjs` (3), Hub nav tests updated (23/23), full Worker + Hub + Doctors suite 1,625 of 1,626 (the one failure is the pre-existing date-drift test above). Visual check against a local mock: all panels render, health chip green/red.

## Deployment preparation (nothing deployed yet)
| Item | Value |
|---|---|
| Changed since live code `4b8dbd33` | `apps/` only (8 files). `wrangler.toml` and `migrations/` unchanged: no new binding, no cron change, no migration, no secret change |
| Dry-run bundle (`wrangler deploy --dry-run --outdir`, no production contact) | `index.js` 1,273,956 bytes, SHA-256 `2797e26d5063d1d6bf9312b63347535bff0ce119984f16004004d2f0169c1422`; contains `/api/health/watch` and `/api/hub/modules` |
| Live now (rollback target) | version `d7b6ab67-57a8-4b27-b289-f8cd6747f43c` (deployment `adcf7725-d821-4172-bc2b-c8adcd198ef4`, secret-only), code `4b8dbd33` |
| Owner command | `$v = (node scripts/deploy-identity.mjs --wrangler-vars) -split ' '` then `node .\node_modules\wrangler\bin\wrangler.js deploy @v` |
| Verification after deploy | `/api/health` commit matches HEAD; `/api/ready` READY; deployed `index.js` hash equals the approved bundle hash; Hub shows the health chip and the module group; `GET /api/health/watch` and `/api/hub/modules` without token answer 401 |
| Rollback | `wrangler rollback d7b6ab67-57a8-4b27-b289-f8cd6747f43c` (owner) |

## Deployed (2026-10-22T21:11:40Z, owner-executed `wrangler deploy`)
New version `c9c9f0ca-f355-4b4f-8aa6-44da721babad` (deployment `755e2a10-b348-4660-9487-154b6067ccb6`), 100%, stamped commit `7df8dc74` (code identical to `f13cf7a`). Previous version for rollback: `d7b6ab67-57a8-4b27-b289-f8cd6747f43c`.
Verified read-only: deployed `index.js` fetched back, 1,273,956 bytes, SHA-256 `2797e26d5063d1d6bf9312b63347535bff0ce119984f16004004d2f0169c1422` = the approved dry-run bundle; `/api/ready` READY (blocked 0, degraded 0); `/api/health/watch` and `/api/hub/modules` answer 401 without and with a wrong token; live Hub HTML contains the "Sistem Modülleri" group; triggers unchanged; `health-watch` unchanged (only the expected ClinicalTrials freshness alert). Not verified by me: the rendered panels with the real token (owner-side, Hub open).

## Second deployment (2026-10-22T21:21:16Z): Hub nav dividers, static asset only
Owner-executed `wrangler deploy`; one modified asset (`/index.html`). New version `ad1e3c43-da9f-4094-9b34-10943d272d1d` (deployment `7a3e70fc-45bd-43e4-98c1-928f45400368`), 100%, stamped commit `f1266858`. Verified read-only: module `index.js` hash unchanged (`2797e26d…169c1422`, so no code change), `/api/ready` READY (0/0), live HTML contains the divider CSS. Rollback target: `c9c9f0ca-f355-4b4f-8aa6-44da721babad`.

## Editorial redesign of the Hub (2026-10-23, local, not deployed)
Owner decisions: Newsreader (serif, titles and reading text) + Instrument Sans (interface) + IBM Plex Mono (metadata); no images; dark default with the existing light theme kept (neutral editorial, not warm paper); compact default with a Rahat toggle; Turkish dates; three actions (Üretime aktar, Beklet, Sil); deadline highlighted for Burs and Eğitim; undo toast; numbered list with a progress strip; skeleton loading; typographic empty states; mini charts on the module panels; motion respects `prefers-reduced-motion`.

What changed (`apps/hub/index.html` only, static asset, Worker bundle unchanged): three-column layout (menu, numbered compact list, reading pane with summary and fact list), keyboard triage (J/K move, B hold, S delete with the existing reason dialog, Z undo, O open source), auto-advance to the next item after an action, line icons, theme toggle, narrow-screen flow (list, then reading pane with a back button), module mini charts (bars, stacked bars, run status strip).

Deliberate safety choices: **undo is offered only after hold and delete**. A promote mints an approved_brief and a handoff job that an undo does not retract, so no undo toast is shown for it; the E key needs a **second press within 3 seconds** to promote. The reading pane never shows the source-language excerpt while enrichment is pending or failed (existing contract kept), and the source link is only rendered for http(s) URLs.

Not done on purpose: AI-written "why it matters" text (the existing evidence-based Turkish gist is shown as the summary, facts are verified fields), daily digest page and command palette (second wave). Tests: Hub 28/28 (new `editorial.test.mjs`), related Worker tests unchanged.

## Third deployment (2026-10-22T23:28:41Z): editorial Hub, static asset only
Owner-executed `wrangler deploy`; one modified asset (`/index.html`). New version `8e85aa7a-973c-43f4-91dc-fd031cc59d07` (deployment `d4a0d5da-8eeb-4630-bf08-70e16e0c6f67`), 100%, stamped commit `0be9df93`. Verified read-only: module `index.js` hash unchanged (`2797e26d…169c1422`), `/api/ready` READY (0/0), live HTML carries the editorial markers (Newsreader link, reading pane, theme key), the two gated routes answer 401 without a token, `health-watch` unchanged. Rollback target: `ad1e3c43-da9f-4094-9b34-10943d272d1d`. Rendered result with the real operator token is for the owner to confirm in the browser.
