# DOSSIER second signal family: selection and production-path design (2026-10-05; DESIGN ONLY)

**Decision: second family = `TURKEY_HEALTH_BURDEN`; primary source = Eurostat `hlth_cd_asdr2` (causes of death, age-standardised death rate, geo=TR); fallback = OECD Health Statistics `DF_COM` (same family, legal gate still closed).**
Machine-readable twin: `docs/generated/dossier-second-signal-family-v1.json`.

**Family identifier (frozen).** `SIGNAL_FAMILY_ID = TURKEY_HEALTH_BURDEN`, the existing canonical contract/runtime identifier (`packages/contracts/dossier-discovery.json`, `oecd.ts`, migration 0031 data). The phase brief used 'TURKEY_BURDEN' conceptually; the existing canonical contract/runtime identifier is TURKEY_HEALTH_BURDEN and is preserved to avoid duplicate family identity. No new family id is created; the contract, runtime id and migration 0031 are not renamed or changed.
**Family invariant.** `SIGNAL_MEANING` = measured health burden affecting Turkiye. `PRIMARY_MEASURE_IN_V1` = age-standardised mortality rate by cause, from Eurostat `hlth_cd_asdr2`. This does not mean every `TURKEY_HEALTH_BURDEN` observation must be mortality, nor that Eurostat permanently owns the family: future independent burden datasets may join the same family when lineage and semantic compatibility permit.
**Status wording.** This is a design freeze, not implementation or production readiness: P2/P3/P4 are designed, not proven or measured (section 20).

Nothing here activates a source, runs a canary, changes code/schema/config, deploys or pushes. The first-canary milestone (`docs/DOSSIER-FIRST-CANARY-MILESTONE.md`, `FROZEN_V1`, 100%) is untouched and not reopened. The 200 D1 / 45 s profile is ClinicalTrials-specific and is not copied: section 15 derives a profile from this source's own mechanics.

Evidence legend: `VERIFIED_2026-10-05` = official URL/API opened read-only today (this phase); `FROZEN_SOURCE_BASE` = from `statistics-source-*-v1.json` / `DOSSIER-SOURCES.md`; `ESTIMATE` = derived, must be measured locally before any use; `UNKNOWN` = not read, never treated as allowed or zero.

## 1. LOOP

L: first ClinicalTrials production milestone frozen at 100%. O: select and design the best genuinely independent second signal family. O: decision matrix, lineage, reader contract, bounded profile, future canary. P: no implementation or activation until P1-P5 design gates pass.

## 2. FROZEN BASELINE (do not reopen)

Run `crun_52632d2d-282e-44d2-aec3-a8e9f854ab2d`: ClinicalTrials.gov v2, `GLOBAL_RESEARCH_ACTIVITY`, 100 items / 414 observations / 396 PROPOSED concepts / 391 WATCH / 0 candidates, P1-P5 PASS for the milestone. `GLOBAL_RESEARCH_ACTIVITY` alone cannot create a durable candidate (default route = multi-family convergence). The 396 concepts and 414 observations persist in D1 (`CANARY_HOLD_UNTIL_REVIEW`), so a second-family canary does **not** need to refetch ClinicalTrials.

## 3. SOURCE / FAMILY SHORTLIST

Starting universe: the 13 families in `packages/contracts/dossier-discovery.json` (`signal.families`) and the frozen statistics source base. No family was invented. `GLOBAL_RESEARCH_ACTIVITY` is excluded (already live). Excluded without shortlisting: Instagram / TikTok content / creator panels (`RESTRICTED` or `UNRESOLVED`, identities not supplied), TUIK / MoH / HSGM / SGK primary sources (`LEGAL_REVIEW_REQUIRED`, terms UNKNOWN, TUIK API needs credentials, catalog `tuik-saglik-source` URL returns 404), IHME / IARC / UNAIDS / NCD-RisC (gated, manual or authenticated), environmental sources (no named, verified source: `UNRESOLVED`).

| # | Family | Concrete source / dataset | Why it is on the list |
|---|---|---|---|
| 1 | `TURKEY_HEALTH_BURDEN` | **Eurostat `hlth_cd_asdr2`** | official, open, Turkiye in the data, granular causes |
| 2 | `TURKEY_HEALTH_BURDEN` | OECD Health Statistics `OECD.ELS.HD,DSD_HEALTH_STAT@DF_COM` (reader exists locally) | previously prepared; fair comparison, no privilege |
| 3 | `TURKEY_PUBLIC_DEMAND` | Google Trends official API (alpha) / TikTok CSI manual | highest direct product value, blocked on access |
| 4 | `GLOBAL_PUBLIC_HEALTH_DATA` | WHO Global Health Observatory OData (TUR indicators) | open API, global, includes Turkiye |
| 5 | `GLOBAL_INSTITUTIONAL_FRONTIER` | existing catalog items `who-newsroom`, `ema-news`, `fda-press-announcements`, `nih-news-releases` | zero new acquisition (the "easy" option, tested against the anti-pattern) |

Per-option detail (required shortlist fields):

| Field | 1 Eurostat | 2 OECD | 3 Demand (Trends/CSI) | 4 WHO GHO | 5 Institutional news |
|---|---|---|---|---|---|
| INDEPENDENCE from `GLOBAL_RESEARCH_ACTIVITY` | PASS (death registration, no trial lineage) | PASS | PASS | PASS | **PARTIAL**: regulator announcements frequently derive from registered trials |
| PRODUCT_VALUE | MEDIUM (see 7) | MEDIUM | STRONG | MEDIUM-WEAK (indicators, not disease concepts) | WEAK |
| TURKEY_RELEVANCE | STRONG (geo=TR native) | STRONG | STRONG | MEDIUM (TUR rows among global) | WEAK |
| AUTHORITY | official statistical office (EU), national data from TUIK | intergovernmental compiler, WHO Mortality DB | platform-internal, relative index | intergovernmental | primary institutional announcements |
| LEGAL_STATUS | **terms VERIFIED** (candidate-country data reusable, attribution) | UNRESOLVED (terms unread; pages 403) | UNRESOLVED (alpha is application-based) | PARTIAL (publication licence CC BY-NC-SA 3.0 IGO; data platform terms not explicit) | catalog-active, dossier use UNRESOLVED |
| ACCESS_MODE | public REST, JSON-stat, no key | public SDMX-JSON, no key | application-based alpha / manual export | public OData, no key | existing Hub `source_items` |
| READER_CLASS | `PUBLIC_DATA_API` (new adapter) | `PUBLIC_DATA_API` (exists locally) | `PUBLIC_DEMAND` / `TIKTOK_CSI_MANUAL` | `PUBLIC_DATA_API` | `RSS_WEB` (reuse) |
| BOUNDED_UNIT | one cause row of one reference year | whole 49-row slice (~460 stmts) | term set x geo x window | one indicator x TUR x year | one feed item |
| REVISION_MODEL | dataset `updated` timestamp, no revision history (local snapshot) | release-prepared time, versioned dataflow | rolling relative index | latest-value-only (`Date` field) | item publication |
| KNOWN_BLOCKERS | no published rate limit; no hierarchy annotation; data lag (latest 2023) | terms/automation/rate UNREAD; ~460 stmts per unit | no stable access; owner provider choice | licence ambiguity for data; concept mapping | independence PARTIAL |
| ACTIVATION_READINESS | reader to build; no legal blocker found | NO (legal gate) | NO | NO (legal PARTIAL) | n/a (fails independence) |

## 4. AUDITABLE DECISION MATRIX

Ordinal scale for the weighted view only: STRONG=3, MEDIUM=2, WEAK/PARTIAL=1, BLOCKED=0. UNKNOWN is never scored: it is listed and, where it is material, it lowers the rating to the level the verified evidence supports (never to PASS). Weights (owner-recommended): P1 25, independence 20, product 20, legal/access/readiness 15, P3 10, P4 10. **Independence is also a hard gate**: a PARTIAL or FAIL is excluded regardless of score.

| Option | Independence | Product value | Turkey relevance | Authority | Legal/access | P1 | P2 | P3 | P4 | P5 | Activation readiness | Weighted (of 3.0) | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 Eurostat `hlth_cd_asdr2` | PASS | MEDIUM | STRONG | STRONG | STRONG (terms VERIFIED; rate guidance NOT_PUBLISHED) | STRONG | MEDIUM | STRONG | STRONG | STRONG | PARTIAL (reader not built; owner gates open) | **2.80** | **PRIMARY** |
| 2 OECD `DF_COM` | PASS | MEDIUM | STRONG | STRONG | BLOCKED (terms UNREAD) | MEDIUM | MEDIUM | MEDIUM | MEDIUM | STRONG | BLOCKED | 1.90 | **FALLBACK** |
| 3 Demand (Trends alpha / CSI) | PASS | STRONG | STRONG | MEDIUM | BLOCKED | WEAK | MEDIUM | WEAK | MEDIUM | STRONG | BLOCKED | 1.75 | strategic next family, not now |
| 4 WHO GHO | PASS | MEDIUM-WEAK | MEDIUM | STRONG | PARTIAL | MEDIUM | WEAK | MEDIUM | MEDIUM | STRONG | BLOCKED (owner/legal review) | 1.85 | not selected |
| 5 Institutional news reuse | **PARTIAL (hard-gate fail)** | WEAK | WEAK | STRONG | MEDIUM | STRONG | WEAK | STRONG | STRONG | STRONG | n/a | 2.05 | **excluded by independence gate** (also the "easiest" option) |

Reading: option 5 scores second on the raw weights only because it needs no new acquisition; that is exactly the anti-pattern, and the hard gate removes it. Option 3 has the best product value but cannot be designed to an activatable reader today. Options 1 and 2 are the same family and the same real-world measurement (see 8); the difference is legal readiness, granularity and an existing reader.

## 5. PRIMARY DECISION

- `PRIMARY_SECOND_SIGNAL_FAMILY = TURKEY_HEALTH_BURDEN` (already in the contract; no new family).
- `PRIMARY_SOURCE = Eurostat` (dissemination API, dataset `hlth_cd_asdr2`, "Causes of death - standardised death rate by NUTS 2 region of residence"; the national level is `geo=TR`). Proposed canonical id: `eurostat-hlth-cd-asdr2` (PROPOSED, not registered; registration is `SOURCE_LIFECYCLE_REQUIRED`).
- Why not OECD: OECD stays fair and unprivileged. It loses on the legal gate (terms/automation/rate unread, official pages answer 403, an attempt to read them in the in-app browser today failed on a policy check and was not bypassed) and on granularity (49 coarse rows vs 92 specific causes). OECD's real advantage, a source-exposed taxonomy parent that feeds the coherence gate, is recorded as a Eurostat gap in section 12.
- `BEST_ARCHITECTURAL_SECOND_FAMILY` = `TURKEY_HEALTH_BURDEN` (source-agnostic). `BEST_IMMEDIATELY_ACTIVATABLE` (legally) = Eurostat. They coincide, so no split is needed.

## 6. FALLBACK

`FALLBACK_SECOND_SIGNAL_FAMILY = TURKEY_HEALTH_BURDEN`, `FALLBACK_SOURCE = OECD Health Statistics DF_COM` (`oecd-health`, reader `dossier-oecd-turkiye-mortality` already exists locally, `CANARY_DISABLED`). It is used only if Eurostat has an external blocker (Turkiye dropped from the dataset, a terms change, API retired). It needs its own gate first (`docs/DOSSIER-OECD-VERIFICATION-CHECKLIST.md`) and its own reader budget (~460 statements per 49-row item: reader-specific, not a reason to reject). Same family means the semantics, windows and convergence contract below apply unchanged. **Double-counting hard gate (P2/P5).** Eurostat burden + OECD burden does **not** produce `INDEPENDENT_FAMILY_COUNT = 2`: both are `TURKEY_HEALTH_BURDEN`, and one family counts once. Where the same upstream national mortality data (TUIK) reaches both, the second source is **corroboration / lineage evidence only**, never an independent convergence family. OECD is not implemented or activated in this phase; if ever enabled alongside Eurostat it must be recorded as corroboration of the same `lineage_group`.

## 7. PRODUCT VALUE

Question: "What second independent signal most improves discovery of topics worth investigating for a Turkish reader?"

- The mission is Demand/frontier -> what to investigate. `GLOBAL_RESEARCH_ACTIVITY` is a frontier signal. The repo's own gates say a factual public-health topic without a credible anchor is refused by every promotion route; a measured Turkish health-burden signal **is** that anchor. So burden is the family that unlocks the existing route design, whereas demand without an anchor cannot promote a public-health topic either.
- Eurostat adds Turkey-native, official, cause-specific rows (92 groups, including specific cancers, TB, HIV, viral hepatitis B/C, diabetes, dementia, COVID-19 groups), 13 reference years (2011-2023), versus 49 coarse groups from OECD.
- Honest limits (measured this phase): (a) exact-label overlap between the 92 Eurostat labels and the live 100-study ClinicalTrials concept labels is **1** ("Neoplasms"; the same as OECD) under the existing resolver; about 8 more are plausible semantic neighbours that need human alias decisions (breast cancer, melanoma, diabetes mellitus, dementia, pneumonia, COVID-19 groups). Linkage, not source choice, is the P2 bottleneck, and it is a governance question, not a code shortcut. (b) The data is annual and lagged (latest year 2023): it anchors "what matters", never "what is new". (c) Value is MEDIUM, not STRONG, until alias governance exists.
- Demand (option 3) is the strongest value but is application-gated (Google Trends API: limited alpha announced 2025-07-24, application-based, no published quota or price; search-result evidence, treat as UNVERIFIED on the official page). Recommended as the **third** family when an owner provider decision and access exist: research + burden + demand is the intended full triangle.
- `PRODUCT_VALUE = MEDIUM` (honest), `TURKEY_RELEVANCE = STRONG`.

## 8. INDEPENDENCE / LINEAGE

| Item | Finding |
|---|---|
| Upstream owner | TUIK (national cause-of-death statistics: MoH Death Notification System + MERNIS/ADNKS, per the frozen lineage file; TUIK page itself UNVERIFIED), delivered to Eurostat as an official candidate-country statistic |
| Eurostat's role | dissemination/compilation layer; `hlth_cd_asdr2` data for TR carries source status flags (`d` = definition differs) |
| Mirrors / aggregators | WHO Mortality DB and OECD derive from TUIK/MoH as well (sibling distributors, same real-world measurement) |
| Does an existing source derive from it? | `oecd-health` (FROZEN_SOURCE_BASE: PARTIAL lineage to TUIK/MoH). No other live DOSSIER source |
| Relation to ClinicalTrials.gov | none: trial registrations by sponsors vs death registration; no shared dataset, key, mirror or aggregator |
| Within-family rule (hard gate) | same family counts once; a second distributor of the same underlying lineage group (`lineage_group = TUIK_CAUSE_OF_DEATH`) is corroboration only and must not raise `INDEPENDENT_FAMILY_COUNT`. The protection is designed, not yet implemented or tested: `LINEAGE_DOUBLE_COUNT_PROTECTION = PARTIAL` |

`LINEAGE_INDEPENDENCE = PASS` (versus `GLOBAL_RESEARCH_ACTIVITY`). Caveat kept explicit: the TUIK upstream link for Eurostat is PARTIAL in the frozen lineage evidence.

## 9. SIGNAL SEMANTICS

- `SIGNAL_FAMILY_ID = TURKEY_HEALTH_BURDEN` (contract class `STRUCTURAL_OR_RELEASE_DRIVEN`; window `SOURCE_PERIOD`; FAST windows and momentum are forbidden).
- `SIGNAL_MEANING`: officially registered, age-standardised mortality burden of a cause-of-death group in Turkiye for a reference year. It answers "does this health topic carry a measured Turkish population burden".
- `WHAT_COUNTS_AS_POSITIVE_SIGNAL`: a row for (cause group, TR, reference year) with a source-provided numeric value. Presence of a measured burden is the anchor; the size of the value is carried for display and is **not** a ranking, threshold or "important" claim.
- `WHAT_DOES_NOT_COUNT`: medical efficacy; trend or "rising/falling" claims (single period, no momentum); cross-country comparison; causality; treatment or dose relevance; the `TOTAL` row (context); aggregate/residual nodes (see below); any inference from a missing row.
- `SOURCE_NATIVE_METRICS`: `value` (rate), `unit` = `RT` ("Rate": deaths per 100,000, age-standardised), `status` flags per row, dataset `updated`, dimensions `freq=A, sex, age, icd10, geo, time`. The `NR` (number) unit is UNVERIFIED for TR and not used.
- `NORMALIZED_OBSERVATION_SHAPE` (reuses `oecd.ts` semantics): family `TURKEY_HEALTH_BURDEN`, kind `BURDEN_UTILIZATION`, provenance `ADMINISTRATIVE`, subfamily `MORTALITY_ASDR`, value + unit with state `MEASURED`, geo `TUR`, window `SOURCE_PERIOD` (annual start/end), origin = `(dataset, geo, icd10 code, sex, age, unit, time, release_token)`, evidence span = official data URL + processing date + flag.
- `CONCEPT_LINKAGE`: only the `icd10` dimension creates concepts, via the existing open-world resolver (exact normalized-label match to an existing identity, else a PROPOSED concept, never ACTIVE, ambiguity -> REVIEW_REQUIRED). The ICD-10 code is the source-native identifier. `AUTO_ALIAS_CREATION = FORBIDDEN`: the reader creates no cross-source alias and no suggestion; plausible matches (for example "Malignant neoplasm of stomach" and a ClinicalTrials "Stomach Neoplasms") may be proposed later, by a human-driven alias process, for human review. No word list, no fuzzy merge; unknown linkage stays unknown. `CONCEPT_LINKAGE_READY_FOR_IMPLEMENTATION = PARTIAL`, `ALIAS_GOVERNANCE_REQUIRED = YES`.
- Aggregate / residual nodes (code ranges `A_B`, `C00-D48`, `*_OTH` "remainder of", `TOTAL`): emitted with eligibility `REVIEW_REQUIRED` unless proven a leaf by structural containment over the fetched code set; fail closed.
- `TEMPORAL / freshness`: no decay score. Each observation carries `reference_year` and `release_token`; the display and snapshot state "reference period 2023" and `years_since_reference` as a plain fact. Staleness never lowers or zeros a value.
- `UNKNOWN`: a row with no value (`positions-with-no-data`) is `UNKNOWN`, never 0. The source reports whole-number-looking small values and flags (`d`), carried as annotations.
- `N/A`: `NOT_APPLICABLE` only where the source defines it. For a ClinicalTrials-only topic, Turkish burden is `NOT_OBSERVED` (the dataset covers 92 groups, the topic is not one of them), which is **not** zero and **not** "no burden".

## 10. CONVERGENCE MODEL

No universal score. Per target, three explicit records (never collapsed):

- `INDEPENDENT_FAMILY_COUNT` = number of distinct signal families with ELIGIBLE support for the target, de-duplicated by lineage group inside a family. Today's maximum: 2 (`GLOBAL_RESEARCH_ACTIVITY`, `TURKEY_HEALTH_BURDEN`). This is the existing `MULTI_SIGNAL_FAMILY_SUPPORT` definition ("more than one"), not a tunable count.
- `FAMILY_SUPPORT_STATE` per (target, family): `PRESENT_MEASURED` | `PRESENT_NOT_APPLICABLE` | `UNKNOWN` | `NOT_OBSERVED` | `NOT_COVERED_BY_SOURCE`. None of these is zero.
- `CONVERGENCE_EVIDENCE`: the list of `(family, aggregate_id, window_kind, reference period, measurement_provenance, representative provenance refs)`. Different clocks stay visible: research activity is a 2026 first-post date, burden is reference year 2023; there is no joint window.

Example outcome: research activity present + a Turkish burden observation for the same concept -> `INDEPENDENT_FAMILY_COUNT = 2`, valid route `MULTI_SIGNAL_FAMILY_CONVERGENCE`. Two signals do **not** create a candidate: eligibility, a valid route, topic coherence/granularity and integrity must all pass.

## 11. WATCH / CANDIDATE CONTRACT (unchanged)

OBSERVATION -> CONCEPT -> EDITORIAL ELIGIBILITY -> SIGNAL AGGREGATE -> WATCH -> valid promotion route -> TOPIC coherence/granularity gate -> DOSSIER CANDIDATE -> immutable snapshot -> human review. No gate is bypassed or loosened. The first multi-family test keeps `source_specific_frontier = DISABLED`, `unknown_granularity = FAIL_CLOSED_TO_WATCH`, `auto_accept = false`, `auto_publish = false`. Eurostat exposes no taxonomy parent (codelist `ICD10` v6.0, 0 parent elements, read today), so `GRANULARITY_PARENTAGE = UNKNOWN`: granularity is `UNKNOWN_GRANULARITY` and fails closed to WATCH (two families present never promote a candidate by themselves) unless the owner later approves a structural ICD-code containment rule (an owner decision, not made here).

## 12. SOURCE READINESS

| Item | Status |
|---|---|
| Identity | dataset `hlth_cd_asdr2`, agency ESTAT, stable code ids, geo `TR` = "Turkiye", `VERIFIED_2026-10-05` |
| Coverage for TR | 13 reference years 2011-2023; 89 cause rows (2011-2019) and 92 (2020-2023, COVID groups added); `VERIFIED_2026-10-05` |
| Latest slice | `lastTimePeriod=1` -> 2023, 92 rows, about 11 KB, one request (`VERIFIED`) |
| Dataset `updated` | `2026-06-08T23:00:00+0200` at check time (`VERIFIED`) |
| Not covered | `hlth_cd_aro` (absolute counts) has no TR value for the latest year (checked, empty); national absolute counts are not available from this source |
| Gaps | no taxonomy parent; no revision history; no published rate limit; data lag |

## 13. LEGAL / ACCESS READINESS

- Terms: Eurostat "Copyright notice and free re-use of data" (official page opened 2026-10-05). Reuse of statistical data for commercial or non-commercial purposes is authorised if the source is acknowledged; modifications must be stated and a non-responsibility disclaimer included; the commercial-reuse exception for non-EU data **excludes** "official EU acceding and candidate countries" (Turkiye is one), so TR data falls under the general permission. No licence file or written agreement is needed. The page says conditions may be specified on individual documents; per-dataset notices were not found to restrict this one (`UNKNOWN` for any notice not displayed through the API).
- Access: public REST, no key, no registration (`VERIFIED`). Automated-use policy and rate limits: **not published** in the API pages read (`NOT_PUBLISHED`, not "none"); the design therefore stays conservative (section 15).
- `LEGAL_READY = YES` for terms. Still required before activation (external, owner-owned): source-lifecycle `inspect`/registration and an explicit owner activation approval (P5). Attribution wording: "Source: Eurostat (hlth_cd_asdr2), data for Turkiye supplied by TUIK; processed <date>; modified by <GCOS normalization>; Eurostat is not responsible for the result."

## 14. READER DESIGN (design only)

| Item | Design |
|---|---|
| Reader class | `PUBLIC_DATA_API`, normalization mode `STATISTICAL_RELEASE`, reader id `dossier-eurostat-tr-causes-of-death` (PROPOSED) |
| Endpoint | `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hlth_cd_asdr2?geo=TR&sex=T&age=TOTAL&unit=RT&lastTimePeriod=1&format=JSON&lang=EN` (JSON-stat 2.0) |
| Auth | none |
| Legal gate | registry entry `legal_status` and `usage_terms` must be `APPROVED`/`VERIFIED` (the runner already refuses `READER_BLOCKED:*` otherwise); starts `CANARY_DISABLED` |
| Bounded unit | one source item = one `(cause code, reference year)` row; fetched as one page, processed row by row |
| Pagination / windowing | none needed (92 rows in one response); reference year = the `lastTimePeriod=1` window; no backfill by default |
| Checkpoint key | `(reader_id, dataset, geo, sex, age, unit, reference_year, release_token, next_row_index)` |
| Release / change detection | one tiny request (`icd10=TOTAL`, `lastTimePeriod=1`) reading `updated` and the latest `time`; unchanged `updated` -> skip the run, no writes |
| Normalization | JSON-stat value/dimension/status -> section 9 shape; dimension order is read from the `id` and `size` arrays, never hard-coded; a shape mismatch is a `PARSE_ERROR` (fail closed) |
| Concept extraction | `icd10` dimension only; code + English label from the response; no NLP/LLM |
| Dedupe | origin key as in section 9; a re-run of the same `(release_token, reference_year)` writes nothing new |
| Revision handling | a changed `updated` for the same reference year yields a new origin (`release_token` in the key); the previous release stays; the aggregate selector takes the latest release per reference period (deterministic). Needs local verification against the aggregation selector; any schema need is unknown here and must be resolved in the implementation phase |
| Provenance | official data URL (query string included), `updated`, processing date, row status flag, attribution notice |
| Source-native ids | ICD-10 code (for example `C16`), dataset id `HLTH_CD_ASDR2` |
| Error classes | `HTTP_4XX_PARAMS` (fail), `DATASET_MOVED_404` (fail, alert), `HTTP_429_503` (one retry with backoff, then pause for resume), `PARSE_ERROR` (fail closed), `NO_DATA_FOR_TR` (run ends `NO_DATA`, no zeros), `ROW_CAP_EXCEEDED` (fail, no truncation), `READER_BLOCKED` (gate) |
| Rate-limit handling | sequential, never parallel, at most 1 request per second, `Retry-After` honoured |
| Retry boundary | at most 1 retry per request inside an invocation; further attempts only by an operator resume |
| Canary slice | latest reference year (2023), `sex=T`, `age=TOTAL`, `unit=RT`, 92 rows, cap 100 |
| Contract impact | none expected: family, kind, window, connector class and normalization mode already exist; an owner-reviewed `DOSSIER_CANARY_V2` profile (new, V1 stays frozen) is required because V1 validation demands exactly two sources, one of them ClinicalTrials |

## 15. BOUNDED EXECUTION PROFILE (design targets, `ESTIMATE`, no config change)

`PROFILE_MEASURED = NO`. `PROFILE_STATUS = ESTIMATE_REQUIRES_LOCAL_IMPLEMENTATION_PROOF`. None of the numbers below is a production constant; 240 is not frozen.

Basis: the OECD measurement (one slice of 48 observations = about 460 statements, about 9.6 per observation) and the ClinicalTrials unit (up to about 60). Eurostat's unit is one row (one observation, at most one concept, aliases, run bookkeeping), so about 8-12 statements per unit. This is why the unit is small here and large for OECD.

| Parameter | Proposed | Note |
|---|---|---|
| `SOURCE_ITEMS_PER_INVOCATION` | 20 rows | cap, not a threshold |
| `D1_STATEMENT_BUDGET` | 240 (range 200-300) | about 20 units x 10 + overhead; derived, coincidentally near 200; floor rule: minimum runnable unit <= 15 statements, otherwise `budget_below_minimum_runnable_unit` |
| `LEASE_SECONDS` | 45 | an abandoned lease expires quickly; to be re-justified by measured wall time |
| `MAX_WALL_TARGET` | <= 10 s per invocation | measure locally first |
| `MAX_CPU_TARGET` | not set (the platform CPU cause is `UNRESOLVED_PLATFORM_ENFORCEMENT`); record only, compare against the recorded 310-367 ms ClinicalTrials envelope | no number is claimed meaningful |
| `MAX_SUBREQUESTS` | 3 per run (1 change-check, 1 data, 1 spare retry) | far under the 10,000 / 1,000 plan limits |
| `CHECKPOINT_FREQUENCY` | after every runnable unit (row) | the existing runner pauses at unit boundaries |
| `CANARY_SAMPLE_SIZE` | 92 rows, one reference year (about 92 x 10 = about 920 statements, about 4-5 invocations) | ESTIMATE; replace with the local measurement |

## 16. CHECKPOINT / REVISION MODEL

Same-run durable checkpoint at row granularity (as in the frozen canary); resume from `next_row_index` without refetching when the stored slice hash still matches, otherwise a new run. `release_token` = dataset `updated` value; per-row `status` flags retained. Revision history is not provided by the source, so every release read is stored locally (append-only), which makes "why did the value change" explainable from our own snapshots only. No source-wide replay by default; no whole-table analytics (incremental aggregates only).

## 17. FAILURE / RECOVERY

Failure isolation: own reader run, own lease, own checkpoint; a failure never touches ClinicalTrials rows. Platform termination -> expired-lease recovery -> same-run resume (proven mechanism). Source fault classes as in section 14. Rollback / shutdown: reader `enabled=false` (operator control and registry), `DOSSIER_CANARY_ENABLED=false`; the data written by the run is held for review (`CANARY_HOLD_UNTIL_REVIEW`), no deletion without owner authorization; the disabled Worker redeploy path from the frozen runbook applies unchanged.

## 18. FUTURE MULTI-FAMILY CANARY (not run)

`DOSSIER_SECOND_FAMILY_CANARY_V1` (to be authored in a later, owner-approved implementation phase): MANUAL_ONE_SHOT, one reader (Eurostat), one run, backfill disabled, ClinicalTrials reader **not** enabled and **not** refetched (its persisted concepts and observations are the baseline), promotion routes `MULTI_SIGNAL_FAMILY_CONVERGENCE` only, coherence gate on, `unknown_granularity` fail closed, no scheduler, controls OFF afterwards. Sequence: local replay of a saved real Eurostat response -> local multi-family check against a copy of the baseline shape -> owner approval -> a single production run -> shutdown. **0 candidates is a valid and expected outcome**: under today's rules the only exact overlap ("Neoplasms") has no taxonomy parent and stays WATCH.

## 19. CANARY SUCCESS GATES

All must hold; none requires a candidate.

1. Source fetch bounded: <= 3 subrequests, 1 data request, rows <= 100.
2. Reader provenance PASS: signal run SUCCEEDED with source attribution and processing date.
3. Checkpoint PASS: a forced mid-run stop resumes the same run without a refetch.
4. Source identity stable: re-running the same release writes 0 new observations.
5. No duplicate observations (unique origin keys).
6. Concept linkage auditable: every concept PROPOSED or MATCHED_EXISTING (exact label only) with its ICD code; 0 ACTIVE; 0 auto-merges; 0 auto-created aliases.
7. Second family visible: aggregates exist for `TURKEY_HEALTH_BURDEN`, `SOURCE_PERIOD`, `MEASURED`, with unit.
8. ClinicalTrials family unchanged: the count and content hash of its observations/aggregates before and after are identical except targets that gained a burden observation.
9. Multi-family state correct: every target with eligible support from both families shows `INDEPENDENT_FAMILY_COUNT = 2` and `MULTI_SIGNAL_FAMILY_SUPPORT = true`, every other target `false`; absent burden is `NOT_OBSERVED`, never 0.
10. Promotion policy unchanged (configuration hash equal to V1 routes).
11. Candidates only if naturally eligible; any candidate carries both families' provenance and passed the coherence gate.
12. P5: 0 reviews written by the system, 0 auto-accept/publish, source routing not changed.
13. Clean shutdown: controls OFF, Worker disabled state restored, GCOS READY.
14. No unintended source activation: the registry shows exactly one enabled reader during the run and none after it.

## 20. P1-P5 MATRIX (selected primary, design phase)

| Pillar | Status | Evidence | Remaining |
|---|---|---|---|
| P1 SYSTEM_SAFETY | PASS | disabled by default; legal gate refuses `READER_BLOCKED`; own run/lease/checkpoint; ClinicalTrials baseline not touched; rollback = disable + hold data | measure the unit locally; confirm no schema need |
| P1 SECOND_FAMILY_DESIGN_READINESS | PASS (after the canonical family-id decision) | one family, one source, lineage PASS, terms verified, reader class/unit/checkpoint/profile defined | none for design |
| P1 OVERALL | PASS FOR DESIGN ONLY; **not** an activation or implementation clearance | | owner approvals, lifecycle registration, implementation |
| P2 REAL_E2E | DESIGNED_NOT_PROVEN | path in section 11; real overlap measured (1 exact, about 8 alias candidates) | local replay, then the canary |
| P3 OPERABILITY | DESIGNED_NOT_PROVEN | change check via `updated`, checkpoint per row, same-run resume, per-reader isolation | measure wall/CPU; no scheduler designed or built |
| P4 BOUNDEDNESS | DESIGNED_NOT_MEASURED | 1 request, 92 rows, about 11 KB, 10-statement units | replace the estimate with a local measurement |
| P5 GOVERNANCE | PASS | owner activation required; legal gate not bypassable; unknown concept never ACTIVE; no auto-publish; feedback does not change routing | none |

## 21. ARTIFACTS

`docs/DOSSIER-SECOND-SIGNAL-FAMILY.md` (this file) and `docs/generated/dossier-second-signal-family-v1.json`. No code, migration, config, deploy or push. Frozen first-canary artifacts unchanged.

## 22. BLOCKERS

External / owner: OWNER_APPROVAL for code implementation, for source-lifecycle registration, and for activation (all currently NO); Eurostat rate guidance `NOT_PUBLISHED` (conservative design instead); OECD terms still UNREAD (fallback only). Product: label linkage between ICD cause groups and trial conditions needs an alias-governance decision; no source-exposed granularity, so candidates stay WATCH until an owner granularity rule exists; data lag. None blocks the design.

## 23. DESIGN FREEZE

`SECOND_SIGNAL_FAMILY_DESIGN_READY = YES`: one primary family and source, independence and lineage audited, product value justified with its limits, legal and access status explicitly known, reader class, bounded unit, checkpoint, profile, convergence contract and canary defined, P1-P5 design gates pass, no broad selection question remains. `ARCHITECTURE_READY = YES`, `READER_DESIGN_READY = YES`, `LEGAL_READY = YES`, `ACCESS_READY = YES`, `BOUNDED_PROFILE_READY = NO` (estimate only), `CANARY_READY = NO`, `PRODUCTION_ACTIVATION_READY = NO`.
`CANARY_READY = NO` because: the reader is not implemented; the profile is not measured locally; concept-linkage/alias governance is incomplete; the `DOSSIER_CANARY_V2` contract is not implemented or tested.

## 24. NEXT SINGLE STEP

`IMPLEMENT_EUROSTAT_TURKEY_HEALTH_BURDEN_READER_LOCAL_FIRST` (design ready, worktree clean). Code implementation still needs its own owner approval (currently NO), and a source-lifecycle `inspect` for `eurostat-hlth-cd-asdr2` precedes any registration. Local implementation activates nothing. No fallback is needed.
