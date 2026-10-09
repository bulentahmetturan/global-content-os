# OECD usage-terms verification: operator checklist (HUMAN task, nothing here is verified)

**Status (2026-10-04): `OECD_USAGE_TERMS = UNRESOLVED`, `OECD_AUTOMATED_ACCESS = UNKNOWN`, `OECD_RATE_GUIDANCE = UNRESOLVED`, `OECD_CANARY_READY = NO`.**

The reader `dossier-oecd-turkiye-mortality` (canonical source `oecd-health`, signal family `TURKEY_HEALTH_BURDEN`) is registered `CANARY_DISABLED` and **cannot run** while the registration says `legal_status != APPROVED` or `usage_terms != VERIFIED`: the runner refuses with `READER_BLOCKED:USAGE_TERMS_UNRESOLVED` / `READER_BLOCKED:LEGAL_STATUS_UNRESOLVED` even if every switch is on. Technical availability (anonymous SDMX answers HTTP 200) is **not** permission.

Why a human: the official terms pages on `www.oecd.org` answer HTTP 403 (a bot challenge) to automated clients. They were not bypassed, no third-party summary is accepted as authoritative, and the official SDMX structure endpoints carry no terms, licence or rate annotation. Nobody (and no tool) may infer the answer.

ClinicalTrials.gov does not depend on this: the ClinicalTrials-only canary, remote 0031 and the disabled deploy are all independent of OECD.

## 1. What the operator must read (official OECD material only, in a normal browser)

Record every answer with its exact URL and the date read. If a question is not answered by the official material, write `NOT_PUBLISHED` (that is a valid, different answer from `UNREAD`).

| # | Question | Where to look (official OECD only) | Answer | URL read | Date read |
|---|---|---|---|---|---|
| 1 | Official terms-and-conditions location for OECD data / the Data Explorer API | the OECD "Terms and conditions" / "Data" pages linked from data-explorer.oecd.org and sdmx.oecd.org | | | |
| 2 | Is **automated (programmatic) API access** to `sdmx.oecd.org/public/rest/data/...` permitted for this use? Any key/registration requirement? | the OECD API documentation / terms | | | |
| 3 | **Reuse / licence** of the data (and of this dataflow specifically: `OECD.ELS.HD,DSD_HEALTH_STAT@DF_COM`) | terms; the dataflow's own metadata page in the Data Explorer | | | |
| 4 | **Attribution requirement**: is attribution required, and what exact wording? Is the underlying provider (WHO Mortality Database) to be named? | terms; the dataflow metadata page | | | |
| 5 | **Rate / request guidance** (requests per minute/hour, bulk limits, recommended practice) | the OECD API documentation | | | |
| 6 | **Commercial / internal use restrictions** (is a content-discovery workflow that produces editorial decisions within scope?) | terms | | | |
| 7 | **Required source wording** for any display or derived output (and whether modifications must be stated) | terms | | | |
| 8 | **Third-party rights**: do WHO / national statistical offices impose extra conditions on this dataflow? | the dataflow metadata page | | | |
| 9 | **Date checked** (all of the above) | | | | |
| 10 | **Reviewer** (name and role of the person who read the material) | | | | |
| 11 | **Evidence / reference** (saved PDF or screenshot path, or the permanent URL; never a third-party summary) | | | | |

Stop and keep everything blocked if any of questions 2, 3 or 6 is answered "no", "restricted" or "contact us".

## 2. What changes after (and only after) the answers are verified: exact fields

One reviewed commit; nothing is changed at runtime by an operator control. Edit **only** the OECD entry of `DOSSIER_READER_REGISTRY` in `apps/worker/src/dossier/canary-control.ts` plus the evidence docs:

| File / field | Now | Set to, per the verified answers |
|---|---|---|
| `canary-control.ts` `legal_status` | `UNRESOLVED` | `APPROVED` only if automated access and the intended use are permitted; otherwise `RESTRICTED`, `MANUAL_ONLY` or `REJECTED` (the reader stays blocked) |
| `usage_terms` | `UNRESOLVED` | `VERIFIED` (terms were read and answered) or `PARTIAL` |
| `rate_guidance` | `UNRESOLVED` | `VERIFIED` (a published limit exists: also encode it, see below) or `NOT_PUBLISHED` (officially silent) |
| `technical_access` | `VERIFIED` | unchanged |
| `access_status` | `SDMX_ACCESS_VERIFIED_USAGE_TERMS_UNRESOLVED` | a short factual state, e.g. `SDMX_ACCESS_AND_TERMS_VERIFIED` |
| `blocker` | the unresolved-terms text | `null` (only when the reader is genuinely allowed to run) |
| `last_reviewed_at` | `2026-10-03` | the date checked (answer 9) |
| `evidence` | the 403 / no-annotation text | one sentence naming the official URL(s), the reviewer and the date (answers 1, 10, 11) |
| `apps/worker/src/dossier/oecd.ts` `OECD_ATTRIBUTION` | conservative generic wording | the exact required wording (answer 4/7) and `attribution_requirements` that the terms actually impose |
| `apps/worker/src/dossier/canary-profile.ts` | `oecd.max_rows_per_run` = 100, one request per run | tighten only if a published rate/bulk guidance requires it; never loosen |
| `docs/DOSSIER-SOURCES.md` and `docs/DOSSIER-CANARY-RUNBOOK.md` | `UNRESOLVED` | the verified result, with date and reviewer |
| tests that pin the blocked state (`canary.test.mjs`, `operator-security.test.mjs`, `deploy-rehearsal.test.mjs`, `oecd-blocked-state.test.mjs`) | expect `USAGE_TERMS_UNRESOLVED` | update in the same commit, deliberately |

Then (owner-authorized, after that commit is deployed): `reader:dossier-oecd-turkiye-mortality:enabled` = `1` and run R9 of `docs/DOSSIER-CANARY-RUNBOOK.md`.

## 3. What this checklist deliberately does NOT do

- It does not mark OECD approved, and no code path treats technical access as approval.
- It does not retry or fetch the 403 pages; the next read is a human, in a browser, from the official site.
- It does not change the canonical GCOS `oecd-health` source entry, its lifecycle state, or any other source.
- It adds no source: OECD is one of the two sources of `DOSSIER_CANARY_V1`.
