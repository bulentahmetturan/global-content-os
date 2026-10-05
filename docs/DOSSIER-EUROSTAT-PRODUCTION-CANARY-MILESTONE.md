# DOSSIER second-family production canary: milestone FROZEN_V1

**SECOND FAMILY CONTROLLED PRODUCTION CANARY = 100% (this milestone only). DOSSIER PRODUCT MATURITY = NOT YET 100%.** Machine-readable twin with 18 invariants `CANARY-M2-001..018`: `docs/generated/dossier-eurostat-production-canary-milestone-v1.json`. Plan and hard limits it executed: `docs/DOSSIER-EUROSTAT-CANARY-PLAN.md`, `docs/generated/dossier-eurostat-canary-hard-limits-v1.json`. The first canary milestone (`docs/DOSSIER-FIRST-CANARY-MILESTONE.md`) is unchanged.

## What is frozen
One real Eurostat run, `crun_b5267b4d-2f98-4487-979c-ecc4c4f2cf88` (`TURKEY_HEALTH_BURDEN`, dataset `hlth_cd_asdr2`, slice geo TR, sex T, age TOTAL, unit RT, latest period 2023, release `2026-06-08T21:00:00Z`), reached `COMPLETED / DONE` in production on 2026-10-05 under `DOSSIER_CANARY_V2` in 10 invocations (1,942 statements), with no platform termination, no resume and no recovery needed. The artifact was the prepared one (sha256 `ca5dbee0…a62`, commit `279f335`), deployed once disabled and once with the master switch for the run window, then redeployed disabled.

| Fact | Value |
|---|---|
| source cells / observations / eligible / review-required | 93 / 91 / 77 / 14 |
| concepts before / after | 396 / 486 (90 new PROPOSED, 1 exact link to an existing concept) |
| approved-alias links / unresolved links / non-canonical aliases | 0 / 0 / 0 |
| two-family concepts / promotion-eligible concepts | 1 / 0 (the one shared concept stayed WATCH) |
| candidates / snapshots / reviews / ACTIVE | 0 / 0 / 0 / 0 |
| ClinicalTrials refetch / V1 execution / OECD request | none / none / none (V1 and OECD runs were refused at the route) |
| research-activity observations / origins | 414 / 100 (unchanged) |

## Invocation history (all HTTP 200, same run id, tail outcome ok, 0 exceptions)
| # | Phase | D1 | CPU ms | Wall ms |
|---|---|---:|---:|---:|
| 1 | FETCH to INGEST | 212 | 115 | 7,342 |
| 2 | INGEST | 211 | 132 | 6,118 |
| 3 | INGEST | 211 | 111 | 5,875 |
| 4 | INGEST to DERIVE | 196 | 117 | 4,933 |
| 5 | DERIVE | 194 | 121 | 4,733 |
| 6 | DERIVE | 185 | 264 | 6,930 |
| 7 | DERIVE | 189 | 96 | 4,827 |
| 8 | DERIVE | 187 | 157 | 4,633 |
| 9 | DERIVE | 189 | 168 | 5,121 |
| 10 | DERIVE to DONE | 168 | not captured | not captured |

D1 max 212 (target 240, ceiling 800, headroom 588). Production CPU max 264 ms, median 121 ms; wall max 7.342 s, median 5.121 s (nine of ten tail events; the tail missed invocation 10). The 45 s lease had a 6.1x margin over the observed wall maximum: a margin, not an optimum. A read-only `watch` call during the run used 447 ms CPU and 16.5 s wall under its own inspection budget; it is not a run invocation. The existing GCOS cron kept running (one cron wall of 29.9 s) and is unrelated.

## Pillars
P1 SYSTEM_SAFETY PASS, P1 SECOND_FAMILY_CANARY PASS, P1 OVERALL PASS; P2 PASS_LIVE (Eurostat cells to observations to concepts to `TURKEY_HEALTH_BURDEN` aggregates (77 targets) to the derive/convergence pipeline to DONE); P3 PASS_LIVE (run identity, bounded phases, lease, tail observability, finalization, shutdown); P4 PASS_LIVE (bounded, D1 max 212, measured CPU and wall); P5 PASS (0 candidates, 0 snapshots, 0 reviews, 0 ACTIVE, no non-canonical alias, no policy or frontier change). Each of the 10 invocations was followed by an invariant check (P5 0/0/0/0, baseline unchanged, one V2 run, no alias, no duplicate label, provenance, D1 < 800, run id): 0 failures.

## Shutdown and hygiene
Controls after the run: canary, manual runs, promotion and the Eurostat reader control all 0; the V1 reader control stayed 0; no OECD control row; no active lease; row counts stable over a 90 s post-shutdown window. The disabled Worker `c9c97279…` is the current deployment (deployed with the env switch false). The run evidence recorded dossier `DEGRADED` five seconds after the final deploy; the tail shows that read was served by the intermediate secret-rotation version `fdd34918` that still carried the enabled switch (the same value appeared after the enable deploy while every control was still 0). An independent read-only `/api/ready` check afterwards shows GCOS READY and dossier DISABLED with every critical component ready (the only unready component is the non-critical OECD terms item). Token: a transient `OPS_TOKEN` was generated in memory, used only in the orchestration process, then replaced at shutdown by a fresh random value that was never stored; no 64-hex string exists in the log, filtered tail or evidence; terminal scrollback was not inspected. The Worker secret now holds an unknown value: the owner must set a new one to use the operator CLI again.

## Known limitations and deferred work (none reopens this milestone)
Invocation 10 CPU and wall were not captured; source requests are counted by FETCH-phase invocations (a transient retry inside the one fetch is not observable); the first `watch` page did not list the two-family concept (the Eurostat report counts it). Deferred: global concept-writer concurrency hardening (closed here only by lease serialization), an explicit richer source-lineage hook, candidate-snapshot current-provenance hardening (snapshots may cite a superseded observation; the canary forbids snapshots for this reason), a recurring scheduler, retention and compaction, ongoing source monitoring, the full production activation decision, and the platform CPU enforcement question.

## Freeze means / does not mean
Means: the evidence is accepted and immutable; the successful run is not repeated; future work builds from this baseline. Does not mean: recurring Eurostat ingestion is active, a scheduler exists, global concept-writer concurrency is solved, snapshot provenance hardening is complete, the 45 s lease is optimal, convergence produces candidates, or DOSSIER is fully mature. Raw logs live in the session scratchpad (not committed); their sha256 values are in the JSON.
