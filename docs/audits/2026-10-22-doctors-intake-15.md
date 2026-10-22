# Doctors expert intake: 15 approved names (2026-10-22)

Source: owner handoff `GLOBAL_OS_DOCTORS_ONBOARDING_HANDOFF_2026-10-20.md` and its JSON. Status: **prepared locally, nothing applied to production.**

## What was done (local only)
- `release/doctors/expert-intake-2026-10-20.json`: 15 approved names (USER_APPROVED) and the 17 proposed names kept as PROPOSED_ONLY pool. Every `sourceActivation` is OFF. No aliases were invented (aliases stay empty until verified).
- `scripts/doctors-intake-plan.mjs` + test (4/4 pass): validates the file (no duplicate identity, activation OFF, proposed names never approved) and prints the owner-run API calls. It never touches production.
- Live dedup, read-only on 2026-10-22: `actors` has 2 rows (Ahmet Ekmekçi, National Heart, Lung, and Blood Institute); `doctor_candidates` empty; Discovery has one PROTOCOL run and no DOCTOR run or candidate. **None of the 15 exists, so there are no collisions.** The handoff's "2 previously selected" names are not in the live registry either.

## Governed path (existing system, no parallel ingestion)
1. Create one DOCTOR Discovery run (owner, Hub operator token). Production write.
2. Create the 15 candidates in that run (owner). They enter as DISCOVERED; the kernel dedups against actors, aliases and earlier candidates.
3. For each candidate, verify identity references (institutional/university/ORCID/scholarly profile), credential class and panel, and the source bundle URLs. Only verified items go into `compile`. This research is the longest step and is not started.
4. Compile admission, owner decision, onboarding executor (creates actor, endpoint, association, carrier DISABLED).
5. Ingestability evaluation, then activation per source by a separate explicit owner act. Social platforms follow MANUAL_INTAKE. Health claims still need primary-evidence checks.

## Not done, on purpose
No production write, no activation, no polling, no alias or URL invented, CCOS and Kaduse untouched. The 17 proposed names stay a pool until the owner approves them.

## Next options
- A: start source-bundle research for the 15 names (web search, official/university/ORCID URLs, one JSON per person), local only.
- B: owner runs steps 1 and 2 (run + 15 candidates) after the Dossier check.

## Source bundle research (local, 2026-10-22)
File: `release/doctors/expert-source-bundles-2026-10-22.json` (15 people, 40 proposed sources, all activation OFF, test `scripts/doctors-source-bundles.test.mjs`, 8/8 with the intake tests).

Method: web search, the public ORCID API (name plus employment match), and an HTTP status check from this machine. No content was fetched for ingestion and nothing is polled. HTTP 200 only proves a page loads; ownership is claimed only where a page links the other or ORCID employment matches.

| Result | People |
|---|---|
| ORCID verified by employment | Panda, Mayer, Zee, Sonnenburg, Phillips, Brewer, Scheer, Topol, Knight, Taylor, Baar, Iwasaki (12) |
| ORCID not recorded | Gardner (ambiguous, several same-name iDs without employment), Spector (candidate `0000-0002-9795-0365` unconfirmed), Sethi (none found) |
| Candidate carrier feeds (RSS reachable, 200) | Brewer Substack, Topol Substack (Topol's is linked from his Scripps page) |
| Bot-blocked, not verified (403/451) | Scripps Topol page, Harvard sleep page (Scheer), UCSD kibm page (Knight), UC Davis profile (Baar) |
| Social | Sethi Instagram, MANUAL_INTAKE |

**Owner review needed, Satchin Panda:** a July 2026 news report (Hoodline) says he is leaving his Salk post amid a misconduct complaint he denies, and the Salk profile URL returns 404 today. Single source, not verified by me. His onboarding should wait for your decision. Legal name `Satchidananda Panda` is kept as an alias candidate.

**Weakest bundle, Saurabh Sethi:** no institutional profile, no ORCID; only third-party reviewer bios and an Instagram account. Needs licence or institutional evidence before approval.

Also: ZOE is an organization, not a person source (excluded); `tim-spector.co.uk` redirects to `tim-spector.com`.
