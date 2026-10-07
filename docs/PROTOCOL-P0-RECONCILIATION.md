# PROTOCOL P0 RECONCILIATION — repository + landscape + ontology decisions

> P0 output 2. Docs/research only. No tables created, no `source_items`/triage/`approved_brief` change,
> no cron, no activation, no migration applied. Architecture report binding unless HEAD proves direct conflict
> (§4 verdicts below; only M needs a commit-status note, no semantic conflict).

## 1. Current HEAD

- HEAD `2481bc8eed6a2483b9bf8be60d94937d66c2e2e4` (branch `maintenance/test-time-determinism`, checked 2026-10-07).
- `git status`: modified `apps/worker/src/db/temporal.test.mjs`, `apps/worker/src/readiness.ts`; untracked `apps/worker/src/actors/`,
  `docs/DOCTOR-EXPERT-D0-RECONCILIATION.md`, `docs/DOCTOR-EXPERT-D1-ACTOR-REGISTRY.md`, `migrations/0031_doctor_actor_registry.sql`.
  No protocol files at HEAD; P0 adds only the two docs in this sprint.
- Committed migrations: 0001–0026, 0028, 0029, 0030. 0027 absent (reserved for localization-v2 per `migrations/0028_temporal_paths.sql:4`).
- Companion: `docs/PROTOCOL-LANDSCAPE.md` (P0 output 1, 52 rows).

## 2. Repo truth reconciliation (§4 A–M)

- A. No canonical protocol registry — CONFIRMED (grep `protocol_` over `migrations/`, `packages/source-catalog/data`, `apps/worker/src/db` → no hits; `CREATE TABLE` hits none protocol_*).
- B. No family/variant/version model — CONFIRMED (only `content_family` column `0009:6`, brand-family index names, journal-family prose).
- C. No phase/component model — CONFIRMED (`phase` hits only `tip-toplulugu-phase1-canary` feed id; no component tables).
- D. Lifecycle hosts protocol source bundles — CONFIRMED (`docs/SOURCE-LIFECYCLE.md:39-53` G0–G10; single write site `store.mjs:writeCanonicalFiles` `:27`; Kaduse lanes + forward-migration generator `:29`; no new enum `:16-25`).
- E. Research pool reusable for evidence identity — CONFIRMED (`research-pool.ts:11` `resolvePaperKey`, `:18` `deduplicatePool`).
- F. DOI > PMID > PMCID > title canonical — CONFIRMED (`research-pool.ts:11-16`).
- G. Retraction/preprint gates reusable — CONFIRMED (`schemas.ts:73` integrity, `:40` access scope, `:146-147` record fields; `docs/research-contract.md:58-68` 8 CANONICAL_ACTIVE + 17 CONDITIONAL_VERIFIED; pool gate `:105-115`).
- H. Temporal/Evergreen supports persistent knowledge — CONFIRMED (`0028:1-10` additive-only paths + `item_path_membership:30`; `0029` runtime-state-only; `docs/EVERGREEN-RUNTIME.md:3` all four CANARY_ONLY; `:50-58` PubMed blocker; `:62-64` deploy order).
- I. Triage remains only editorial queue — CONFIRMED (`triage/actions.ts:18,26-31,156,233-249` promote→production→`approved_briefs`).
- J. No parallel candidate queue necessary — CONFIRMED (grep `candidate_queue|protocol_queue` → no hits; 0031 header "no candidate queue, no scheduler").
- K. `approved_brief` v1.0.0 frozen — CONFIRMED (`packages/contracts/src/index.ts:11`, `approved-brief.schema.json:2-3,26`).
- L. No protocol scheduler — CONFIRMED (`docs/OPERATIONS.md:7` scheduler + capacity guard `:88,109`; `evergreen-runner.yml` hourly 25-min cap per EVERGREEN-RUNTIME `:22-26`).
- M. Doctor Actor Registry external reference only — CONFIRMED with note: D0 doc exists untracked (`docs/DOCTOR-EXPERT-D0-RECONCILIATION.md:1-5`, reconciliation-only); committed migrations 0001–0030 have no actor tables (only `editorial_decisions.actor` text col `0001:72`); untracked `0031_doctor_actor_registry.sql` + `actors/` + D1 doc are uncommitted proposals — DECISION_REQUIRED on commit/discard, no semantic conflict with architecture.

## 3. Domain ownership confirmation

`GLOBAL OS → SHARED_KERNEL + INTELLIGENCE_DOMAINS {DOCTOR_EXPERT (actor-centric), PROTOCOL (intervention-centric)} + EDITORIAL_LAYER`.
Relation exists, ownership does not. Doctor emits `protocol_name_raw`; Protocol owns `protocol_ref`. Protocol stores `actor_ref` edges; Doctor owns actors. No duplicate actors (§26: `actor_name_raw` + `future_actor_ref_placeholder` in research artifacts only until P6).

## 4. Shared-kernel reuse confirmation

Source registry/lifecycle, scheduler + capacity guard, parsers, `source_items`, PubMed/Europe PMC/Crossref/PMC/ClinicalTrials adapters
(`ingress/pubmed.ts`, `europe-pmc.ts`, `research-apis.ts`), identity/integrity/access gates, Temporal/Evergreen, triage/review, Hub lanes,
`approved_brief` v1.0.0 → CCOS. Protocol sprints add additive tables + enums only.

## 5. Protocol-definition test (frozen)

A candidate is a canonical Protocol only if it can answer most of: what is the intervention/pattern; defined rules;
population/purpose; repeatable implementation; distinguishable variants; authoritative or reconstructable definition;
studiable identification; distinguishable from slogan/food/supplement/trend. Definition existence ≠ efficacy.
Reject/downgrade `clean eating`, `anti-inflammatory foods`, `eat naturally`, `gut healing` unless a bounded definition is proven.

## 6. Classification vocabulary (§6, frozen)

`CANONICAL_PROTOCOL, PROTOCOL_FAMILY, PROTOCOL_VARIANT, PROTOCOL_VERSION, GENERIC_DIETARY_PATTERN, BRANDED_PROTOCOL,
MEDICAL_NUTRITION_THERAPY, MULTICOMPONENT_PROTOCOL, CLAIM_ONLY, TREND_ONLY, NOT_A_PROTOCOL, UNRESOLVED`.

## 7. Registry-readiness vocabulary (§6, frozen)

`CANONICAL_READY, PROPOSED, NEEDS_IDENTITY_REVIEW, NEEDS_DEFINITION_REVIEW, NEEDS_EVIDENCE_REVIEW, NEEDS_SAFETY_REVIEW,
WATCH, REJECT_NOT_A_PROTOCOL`. Independent dimension from classification (e.g. BRANDED_PROTOCOL + NEEDS_EVIDENCE_REVIEW).

## 8. Family/variant decisions (frozen)

- `INTERMITTENT_FASTING (FAMILY) → TRE, ADF, 5:2 (VARIANTs)`; FMD/prolonged-fasting are NOT children (separate branded/procedure).
- `KETOGENIC_DIET_THERAPY (FAMILY) → CLASSIC_KD, MCT_KD, MAD, LGIT`; consumer-keto is NOT a member (REJECT).
- `LOW_CARB_FAMILY → LOW_CARB, VERY_LOW_CARB (clinical)`; Atkins™ brand = commercial-context only.
- `ELIMINATION_DIET (FAMILY/framework) → AIP, LOW_FODMAP, EOE_STEPUP, FOOD_ALLERGY_ELIM, SCD, CDED (adjacent), LOW_HISTAMINE (WATCH), GAPS (branded)`.
- `plant-based` umbrella stays pattern-level; WFPB/Ornish/Pritikin separate (program vs pattern firewall).
- Hierarchy reflects intervention identity, never name similarity. Evidence scope NODE_ONLY (§12).

## 9. Version-immutability decision table (frozen)

History immutable; material change → NEW VERSION. Classes:

| Class | Example | New version? |
|---|---|---|
| COSMETIC | wording/layout | NO (metadata) |
| CLARIFICATION | worked example, FAQ | NO (note source) |
| COMPONENT_CHANGE | add/drop food group, oil dose, formula ratio | YES |
| DOSAGE_CHANGE | macro cap, carb grams, fasting hours | YES |
| TIMING_CHANGE | window, cycle length, phase duration | YES |
| PHASE_CHANGE | add/drop reintro, reorder phases | YES |
| POPULATION_CHANGE | adult→pediatric indication | YES (new indication-version) |
| SAFETY_CHANGE | new contraindication/monitoring | YES (minor-version + safety flag) |
| CLAIM_CHANGE | new disease/outcome claimed | NO new def-version, but new CLAIM row |
| MAJOR_DEFINITION_CHANGE | elimination list rewrite, bundle recomposition | YES (major) |

Historical studies map to the version (or `version_unknown` + `definition_match APPROX/UNKNOWN`) whose definition they used.

## 10. Definition-source vs evidence-source policy (frozen)

Roles: DEFINITION, ORIGIN, CREATOR, RESEARCH, GUIDELINE, SYSTEMATIC_REVIEW, SAFETY, COMMENTARY, DISCOVERY, COMMERCIAL,
FIRST_PARTY_MARKETING. Official site/book authoritative for "what is it", never sufficient for "does it work".
Every verdict/clinical-position/safety row requires RESEARCH/GUIDELINE/SR/SAFETY provenance.

## 11. Safety gate (frozen)

SAFETY_REVIEW_REQUIRED=YES at class level for: pediatric use; pregnancy/lactation; diabetes meds; renal/hepatic disease;
ED history; underweight; high restriction burden; fasting (esp. prolonged/FMD/VLCD); ketogenic medical therapies;
Rx components (rifaximin); device components (VNS); deficiency/electrolyte/hypoglycemia/growth/interaction risks.
No personalized instructions, dosing, drug start/stop, or individual fasting prescriptions in P0–P1 artifacts.

## 12. Commercial visibility gate (frozen)

Future review must capture: branded foods, supplements, devices, books, courses, certification, memberships, clinics,
consultations, apps, subscriptions (+holder/beneficiary + disclosure state). Commercial involvement never auto-invalidates;
missing material context MUST block future promotion (fail-closed). P1 stores `generic_or_branded` + `commercial_ctx` stub only.

## 13. Clinical-position policy (frozen)

Values: `GUIDELINE_RECOMMENDED, GUIDELINE_CONDITIONAL, GUIDELINE_NOT_RECOMMENDED, MEDICAL_NUTRITION_THERAPY,
CLINICALLY_USED, RESEARCH_EMERGING, CREATOR_DEFINED, NO_ESTABLISHED_POSITION, CONFLICTING_GUIDANCE, OUTDATED`.
Each requires org + title + version/date + population + scope. No guidance → fail-closed `NO_ESTABLISHED_POSITION`.
Position ≠ verdict (e.g. low-FODMAP PARTIALLY_SUPPORTED + GUIDELINE_CONDITIONAL; keto-therapy SUPPORTED-short-term + CLINICALLY_USED/consider).

## 14. Evidence-policy decisions (frozen)

- Maturity records type, not bare counts: guideline/SR/MA/RCT/controlled-feeding/cohort/observational/mechanistic/case-series/animal/in-vitro/creator-only + N, duration, adherence/dropout, co-interventions, blinding limits, funding/COI, definition-mismatch, replication.
- Animal/in-vitro ceiling: MECHANISTIC_CONTEXT only; never independently SUPPORTED.
- Creator marketing: discovery only; never establishes efficacy.
- Pilots: EMERGING SIGNAL with N/control/duration/limits preserved (AIP N=9–28 UCT/crossover; FMD small RCTs; Wahls small RCTs).

## 15. `canonical_work_id` recommendation

**C — remain unchanged; `protocol_id` separate.** `canonical_work_id` keeps meaning "same evidence work across URLs" (0028 EVERGREEN-only semantics).
Protocol knowledge identity uses a new `protocol_id` (+alias/version graph) in P1. A mapping table (`protocol_evidence_link`: protocol_version ↔ work_id + `definition_match`) connects them without overloading either semantic. No 0028 change.

## 16. `definition_hash` recommendation

Deterministic canonical-JSON SHA-256 over normalized: protocol identity (canonical_name + family/type) | version label |
phases (seq/type/duration/rules) | components (kind/code/amount/timing, sorted) | restriction + reintroduction rules |
population-specific definition. Exclude: typography, marketing copy, images, ordering of prose, analytics.
Purpose: detect material definition drift → new version (§9). P1 stores the field; hash function lands with P3 (versioning), not P1.

## 17. Claim-identity-tuple recommendation

Minimum identity: `protocol_id + version_id/definition_hash + population + condition + comparator + outcome + duration`.
`setting + co_interventions + direction + magnitude` are ATTRIBUTES (displayed, filterable, non-identity) except:
co-intervention joins identity only when it changes the studied intervention (e.g. CDED+PEN vs CDED-alone are distinct claims);
direction/magnitude never merge or split claims. Prevents duplicates without collapsing distinct clinical questions. Implements in P8, not P1.

## 18. Doctor dependency status

REFERENCE_ONLY. No actor tables created in P0. Research artifacts may carry `actor_name_raw` + `future_actor_ref_placeholder`.
P6 connects edges once canonical Actor IDs exist. Untracked actor proposals (0031 + `actors/`) noted in §2-M; P0 takes no position on their commit.

## 19. Source-access PoC result (read-only, no activation, no writes)

- PubMed E-utilities (+30 journal feeds incl. nutrition set `pubmed.ts:11-44`): AVAILABLE (code + `registry-find research-pubmed-eutilities` resolves; time-sensitive gated off per EVERGREEN-RUNTIME, Evergreen CANARY_ONLY).
- Europe PMC REST (`europe-pmc.ts`, feed-gated `enabled=1`): AVAILABLE.
- Crossref / PMC-OA / ClinicalTrials.gov v2 / OpenAlex / GDELT (`research-apis.ts:5-11` + per-API isolation `:22-43`): AVAILABLE (code present; keys/redaction per `:52-60`).
- Cochrane: PARTIAL (SYSTEMATIC_EVIDENCE role via registry; no dedicated fetcher — reuse via PubMed/Europe PMC discovery + manual guideline/SR capture; ADAPTER_REQUIRED if automated Cochrane harvest is later wanted).
- Guideline/society sources (AHA/ADA/NICE/ESPEN/KDIGO/ECCO/AGA): MANUAL_REVIEW_REQUIRED (human-curated definition/guideline capture; lifecycle G2/G3 only if a feed endpoint is proposed — none proposed in P0).
- Conclusion: P9 evidence resolution can reuse current adapters; no new ingestion engine needed.

## 20. Exact P1 scope (frozen, not executed)

Canonical Protocol Registry foundation ONLY: `protocol_id`, canonical_name, aliases stub, basic type, generic/branded,
registry_state, minimal metadata (origin/creator refs as text placeholders, definition-source pointer, `definition_hash` column reserved).
Explicitly NOT in P1: resolver (P2), versioning logic (P3), phases (P4), components (P5), actor edges (P6), definition contract (P7),
claims (P8), evidence resolver (P9), clinical position (P10), safety (P11), commercial detail (P12), semantic dedupe (P13),
proposal workflow (P14), WHY_NOW (P15), Hub candidates (P16).

## 21. Likely P1 files (proposals only)

- `migrations/00XX_protocol_registry.sql` (additive: `protocol` + `protocol_alias` tables, immutable-update trigger pattern per 0028; number assigned at execution).
- `packages/source-catalog/src/protocols/{schemas,registry}.ts` + tests (zod identity/type/state enums mirroring §6–7).
- `docs/PROTOCOL-INTELLIGENCE.md` pointer update (if exists by then).
- No worker/contract/scheduler changes in P1.

## 22. Blockers

None for P0 acceptance. Standing non-blockers: untracked actor proposals await owner commit/discard (§2-M); 0027 reservation confirm at next migration authoring; Cochrane auto-harvest deferred (PARTIAL, manual path suffices).

## 23. Owner decisions remaining

1. Accept P0 landscape counts + 6 CANONICAL_READY seeds.
2. Confirm `canonical_work_id` option C + `definition_hash`/claim-tuple recommendations.
3. Confirm version-immutability table (§9) + NODE_ONLY inheritance freeze.
4. Confirm safety/commercial fail-closed gates before P1 writes.
5. Decide commit/discard of untracked actor proposals (outside P0 scope, affects P6 timing only).
6. Authorize P1 (registry foundation) as next sprint — execution not started.
