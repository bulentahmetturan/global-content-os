# DOSSIER first controlled production canary: milestone FROZEN_V1

**FIRST CONTROLLED PRODUCTION CANARY = 100%. DOSSIER PRODUCT MATURITY = NOT YET 100%.**

Machine-readable twin: `docs/generated/dossier-first-canary-milestone-v1.json` (15 invariants `CANARY-M1-001..015`). Evidence it points to: `docs/generated/dossier-first-canary-completed.json`, `dossier-cpu-decision.json`, `dossier-cpu-root-cause-investigation.json`, `dossier-canary-attempt-1.json`, `dossier-canary-resume-1.json`, `dossier-0031-remote-apply.json`, `dossier-r3-disabled-deploy.json`, `dossier-r6-capacity-recorded.json`, and `docs/DOSSIER-CANARY-RUNBOOK.md`.

## What is frozen

One real ClinicalTrials.gov run, `crun_52632d2d-282e-44d2-aec3-a8e9f854ab2d`, reached `COMPLETED / DONE` in production on 2026-10-05 after two platform terminations, resumed from its durable checkpoint without a refetch and without a second run.

| Fact | Value |
|---|---|
| source items / observations / concepts | 100 / 414 / 396 (all PROPOSED, 0 ACTIVE) |
| WATCH targets / editorially ineligible | 391 / 5 |
| candidates / snapshots / reviews | 0 / 0 / 0 |
| signal family | `GLOBAL_RESEARCH_ACTIVITY` only; multi-family false; frontier disabled; OECD off |
| provenance | signal run SUCCEEDED (100 seen, 414 written) with source attribution |
| D1 per invocation | max 763 across the recorded history (800 ceiling), max 148 in resume 2 (200 ceiling) |
| after the run | controls OFF, disabled Worker `ee60d69b`, GCOS READY, DOSSIER DISABLED_HEALTHY, secrets clean |

Proven path (real production evidence, not a simulation): ClinicalTrials -> source items -> observations -> concepts -> editorial eligibility -> WATCH -> FINALIZE -> signal-run provenance -> COMPLETED.

## Pillars for the milestone

P1 SYSTEM_SAFETY PASS, P1 FIRST_CANARY_MILESTONE PASS, P1 OVERALL_FOR_FIRST_CANARY PASS, P2 REAL_E2E PASS, P3 RECOVERABILITY_OBSERVABILITY PASS, P4 BOUNDEDNESS PASS, P5 GOVERNANCE PASS.

- **P3 proven:** same-run checkpoint recovery, expired-lease recovery, tail observability (outcome, cpuTime, wallTime, exceptions, status), run history retention, clean shutdown, disabled redeploy, historical explainability. The recurring scheduler is deferred on purpose and is not a failure of this milestone.
- **P4 proven:** same-run bounded continuation, no refetch, no whole-run restart.
- **P5 invariants:** 0 candidate, 0 snapshot, 0 review, 0 ACTIVE concept, one signal family, frontier disabled, OECD disabled, no automatic source activation, no autonomous policy mutation.

## The 200 / 45 profile is NOT universal

`CLINICALTRIALS_CANARY_PROFILE = 200 D1 statements per invocation, 45 s lease, cpu_ms unchanged.` It is not applied automatically to OECD or any other reader. One OECD item needs about 460 statements, so OECD cannot run under it; every future reader needs a source-specific bounded profile (reviewed change).

## Dispositions (do not reopen the milestone)

- **CPU root cause: `UNRESOLVED_PLATFORM_ENFORCEMENT`, confidence LOW, fix NONE_AVAILABLE.** Mitigation: smaller bounded slice + shorter lease + same-run recovery. **Effectiveness: NOT_PROVEN_CAUSAL**: resume 2 finished with zero terminations, which does not show that the mitigation caused that. Classified `DEFERRED_NON_BLOCKING_PLATFORM_ISSUE`; a Cloudflare support escalation stays optional.
- **D1 accounting: `PARTIAL_EXPLAINED`.** The two platform-killed invocations never recorded counters; nothing was fabricated. Run identity, the per-invocation ceiling and row integrity are intact.
- **Unrelated existing test debt:** `apps/worker/src/ingress/evergreen.test.mjs` fails since 2026-10-05 because the calendar passed its hard-coded date. Not touched here, not a DOSSIER blocker.

## Deferred, non-blocking

recurring scheduler; long-term retention / compaction; OECD terms and access; an OECD reader-specific work budget; an OECD live canary; a second signal family; real multi-family convergence; platform-enforcement support escalation; the unrelated Evergreen date-sensitive test. None of them reopens the 100% milestone.

## Freeze means / does not mean

Means: the evidence is accepted and immutable; the successful run is not repeated to raise confidence; future work builds from this baseline.
Does not mean: DOSSIER is fully mature, the scheduler is complete, OECD is ready, a second family is active, multi-family convergence is proven, or retention is final.
