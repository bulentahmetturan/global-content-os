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
