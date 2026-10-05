# DOSSIER Eurostat reader (TURKEY_HEALTH_BURDEN): local implementation report (2026-10-05)

Design: `docs/DOSSIER-SECOND-SIGNAL-FAMILY.md` (frozen at `f27f61a`). Measured profile: `docs/generated/dossier-eurostat-reader-profile-measured-v1.json`. **LOCAL ONLY: the source is not activated, nothing is deployed, no production call or canary was made, `PRODUCTION_ACTIVATION_READY = NO`.** The canonical family id is `TURKEY_HEALTH_BURDEN` (no `TURKEY_BURDEN` anywhere in code or contract).

## What exists

| File | Role |
|---|---|
| `apps/worker/src/dossier/eurostat.ts` | reader (JSON-stat parse/validate, Turkiye hard gate `geo=TR`, per-cell normalization, identity, revision classification, linkage audit, error taxonomy, bounded fetch with one retry, local inspect) |
| `apps/worker/src/dossier/canary-v2.ts` | V2 registry (reader registered DISABLED beside the frozen V1 registry) |
| `apps/worker/src/dossier/canary-profile.ts` | additive `DOSSIER_CANARY_V2` + `validateCanaryProfileV2`; V1 constant and V1 validation untouched; `requireCanaryProfile` dispatches by profile id |
| `canary.ts`, `canary-inspect.ts`, `canary-control.ts` | type widening to `CanaryProfile`, `canary_profile`/`attribution_profile` unions, V2 source id in the WATCH read model; one runner guard (below) |
| `recorded/eurostat-hlth-cd-asdr2-tr-2023.json` | one recorded real response (11 KB) |
| `eurostat.test.mjs`, `eurostat-e2e.test.mjs`, `eurostat-support.mjs` | 22 tests, real runner path, isolated in-memory DB whose research-activity baseline is the recorded ClinicalTrials page (V2 never refetches it) |
| `scripts/dossier-eurostat-inspect.mjs`, `scripts/dossier-eurostat-profile-measure.mjs` | read-only inspect; reproducible measurement |

## Units
FETCH_UNIT = one request (one reference year, geo TR, sex T, age TOTAL, unit RT, about 93 cells, 11 KB). CANONICAL_OBSERVATION_UNIT = one (cause code, reference year) cell = one source item = one observation. Identity (`DATASET_RELEASE_KEY`) = dataset, geo, sex, age, unit, cause code, year, value, status flag; labels are never part of it.

## Findings (measured or discovered; some correct the design)
1. **Per-item D1 cost is about 20.5 statements (ingest max 21, derive max 30), not the design estimate of about 10.** A full 91-item run is about 1,865 statements, not about 920. The 240 budget is nevertheless what the stated rule selects (smallest ladder budget that completes, never hits the statement guard, fits the heaviest unit, takes at most 10 operator invocations, stays under half the 800 ceiling). Max measured 212 statements per invocation (588 below the ceiling); the smallest viable budget is about 57. The runner unit estimates (23 / 45) cover the measured costs. Lease 45 s is derived from recorded production D1 timing, **not measured** (local wall is a proxy and not Worker CPU).
2. **A label change would have created a duplicate observation.** The origin identity is stable, but the generic dedupe key includes the concept id, so a renamed label resolved to a NEW concept and a second observation. Fix: one runner guard, limited to `DATASET_RELEASE_KEY` origins, skips observing an origin that already has an observation (existence, not `created`, so a unit killed between staging and its observation still completes on resume). ClinicalTrials and OECD paths are unaffected (different identity strategies).
3. **Revision limit.** A revised cell becomes a new origin beside the old one (history kept; test proves both values stay). The aggregate has no "latest release wins" selector, so for a revised cell the aggregate value would read UNKNOWN (conflicting values) until a human or a later aggregation change decides. This is fail-safe but not a full revision-selection feature.
4. **Overlap is measured, not assumed:** the exact-label overlap with the research-activity concepts in the local state is computed by the tests (currently "Neoplasms" only). Under unknown granularity it stays WATCH: 0 candidates, 0 snapshots, 0 reviews.
5. **Concurrency limit (not provable locally):** the resolver is check-then-insert; two writers proposing the same new label in parallel could create two PROPOSED concepts. The local single-connection SQLite harness cannot model parallel writers. One reader is sequential with one active run, so this reader alone cannot trigger it; do not run two readers that can propose the same label simultaneously.
6. Missing cells are UNKNOWN and reported, never observations (an UNKNOWN row must not count as family support) and never zero; a source-reported zero stays a measured zero. All-cause aggregates are context; Eurostat `_OTH` residual categories are `REVIEW_REQUIRED`.

## Not done / still gating
Source-lifecycle registration, owner activation, production preflight, a production canary, a scheduler, alias governance decisions (the audit reports exact / approved-alias / proposal-only / unlinked; nothing is created), a latest-release aggregate selector, platform CPU behaviour (cause remains `UNRESOLVED_PLATFORM_ENFORCEMENT`).
