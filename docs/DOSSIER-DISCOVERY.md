# EVERGREEN > DOSSIER_DISCOVERY (architecture foundation, non-production)

Status: contracts and invariant tests only. No migration, reader, scheduler, route, UI, source or live behavior exists. Contract: `packages/contracts/dossier-discovery.json` (vocabulary of CLASSES) + `packages/contracts/src/dossier-discovery.ts` (pure validators). Tests: `packages/contracts/dossier-discovery.test.mjs`.

## Placement (no third path)
- Temporal architecture stays `TIME_SENSITIVE | EVERGREEN`. DOSSIER_DISCOVERY is a subsystem **under EVERGREEN**: not a temporal path, not an acquisition path, not an `evergreen_view` (`health_reference` / `research_rediscovery` stay navigation views of `source_items`), not a semantic lane.
- A candidate's temporal identity is always `EVERGREEN`. Signal freshness is separate: a fresh item may help discover a topic, and an existing TIME_SENSITIVE `source_items` row is reused as a **sensor** (no second acquisition).
- Dossier entities never live in `source_items` and never touch the closed `CHECK` lists of `0028` (`acquisition_path`, `evergreen_view`).
- Acute single event → existing TIME_SENSITIVE logic. Repeated/structural pattern or globally significant emerging issue → EVERGREEN > DOSSIER_DISCOVERY.

## Boundary chain
`SIGNAL_SOURCE_ITEM → OBSERVATION → CONCEPT → RELATION → CANDIDATE → REVIEW → RESEARCH_HANDOFF`. One source item can yield many observations; non-content observations (search, burden, statistics, measured/modeled environmental data, surveillance, research activity) have no source item. Discovery ends at `RESEARCH_REQUESTED`; research is a separate future workflow.

## Open world
The contract lists classes (five domains and their concept/protocol/technology/topic classes, water facets, signal families), never concepts. Which concepts exist is runtime data. An observation that matches no known concept becomes a `PROPOSED` concept (families `NEW_HEALTH_TOPIC … NEW_RELATION`) for human review (`ACTIVE | REJECTED | PAUSED`); it is never dropped and never auto-canonical. A rejected concept matches, so it does not resurface. Names in the product brief are examples only; a test fails if any appears in the vocabulary or code.

## Rules the contract fixes
- Signal families stay separate; no opaque universal score. Missing is `UNKNOWN` (or `NOT_APPLICABLE`), never 0; measured ≠ modeled.
- Relations are discovery-only (`CO_INTEREST`, `MENTIONED_WITH`, …); `CAUSES/CURES/TREATS/IMPROVES/PREVENTS` are forbidden. A pair needs a joint signal; a triple needs a direct triple signal or a sufficiently supported pair network with independent signal support. The contract fixes only the structure (complete triangle of pairs, each with a joint signal, plus declared independent support); how much is sufficient is a future calibration policy, deliberately unset, and without a configured policy a network fails closed. Automatic depth ≤ 3.
- Quality is signal hygiene, not evidence grading; independence is counted separately (mentions, creators, platforms, independent families) with origin clusters.
- Review is human; rejection needs a reason code; review never mutates weights, source activation/cadence, registry or routing.
- Handoff after ACCEPT carries discovery facts only (no conclusion, advice, dose, verdict; persons are provenance, not subject). Nothing auto-publishes.
- No patient profiling; sources carry an access state (`APPROVED | RESTRICTED | MANUAL_ONLY | UNRESOLVED | REJECTED`).

## Deliberately not built (separate prompts)
Real sources and readers (creator platforms, search/trend data, public-health and environmental data), observation/concept/proposal/candidate/review storage (a D1 migration only when a reader needs it, additive, never widening the `0028` CHECKs), scheduler/lease/cursor reuse, signal weighting and candidate generation, Hub UI, CCOS handoff. Source activation stays lifecycle-owned and owner-approved.

## Readiness semantics (P1)
`SYSTEM_SAFETY` (live GCOS unchanged, no regression) and `DOSSIER_READINESS` (a real end-to-end dossier runtime exists) are reported separately. "Production unaffected" is never evidence that dossier is production-ready. Today: SYSTEM_SAFETY = PASS, DOSSIER_READINESS = PARTIAL (contracts only; no runtime). P1 for dossier is PASS only when its defined production gate is met.

## Durable data model: gap design (read-only, nothing created)
Next free migration number is `0031` (`0027` stays reserved for `localization-v2`). Names are illustrative.

Principles: append-only truth (immutable triggers like `item_path_membership`); `value` NULL = UNKNOWN with an explicit value state; **class vocabularies are validated by the contract, not by SQL `CHECK`** (the `0028` lesson: a `CHECK` list cannot be widened without a table rebuild); only true invariants are `CHECK`s (e.g. `temporal_identity = 'EVERGREEN'`); no concept membership anywhere in SQL; no per-person or commenter data (geography at country/region level at most); counters read from pre-aggregated snapshots, not self-joins (E87).

| Entity | Verdict | Why |
|---|---|---|
| signal sources (creators, institutions, data providers) | **REGISTRY, not D1** | Source truth is lifecycle-owned config (CORE P3, like `temporal-paths.json`); access state lives there. A D1 copy would duplicate truth |
| expert ↔ source/handle mapping | **DEFER (attribute of the registry entry)** | Not queried independently |
| signal runs | **DEFER** | Lease/cursor/last-run state reuse the Evergreen mechanism (`evergreen_runtime_state` columns, namespaced source id); a `run_id` on each observation preserves run attribution. History table only if a reader proves it needs one |
| origin items (non-Hub content/snapshot/release refs) | **NEW, thin** | Reference + hash + url + role + content class + commercial context + origin cluster; no full text. Hub-origin signals reference `source_items.id` and are not copied |
| observations | **NEW, core, append-only** | kind, signal family, measurement provenance, window, value state/value/unit, origin ref, concept ref (`concept_id` XOR `unresolved_label`), run id, geography. One origin → many rows |
| concepts | **NEW, with state `PROPOSED/ACTIVE/REJECTED/PAUSED`** | Proposals for the six concept families are concept rows in `PROPOSED`; a separate proposals table would duplicate them. Parent/child (e.g. form of a parent) is a self-reference |
| aliases | **NEW** | Resolution index for open-world matching (TR/EN); not unique (ambiguity is possible) |
| concept proposals | **MERGED into concepts + reviews** | See above |
| experts | **NEW, minimal (proposed / rejected / paused only)** | `NEW_EXPERT` and persistent expert rejection need runtime rows; an accepted expert becomes a registry entry through the lifecycle (human-approved), never by a runtime write |
| relations | **NEW** | semantic, depth, state, `member_key`; members via a small junction |
| relation observations | **NEW (join)** | Evidence for the joint signal a pair/triple requires; carries the joint-signal kind |
| candidates | **NEW** | Target concept or relation, domain, class, state, constant `EVERGREEN` identity; classification is never rewritten, changes are new snapshots |
| candidate signals + quality snapshots + quality reasons | **MERGED into one append-only snapshot** | `snapshot_at`, 7D/30D/90D windows, per-family summaries, independence counters, quality dimensions (UNKNOWN allowed), reason codes (bounded JSON array), origin cluster and observation ids = the immutable WHY-NOW. Separate reason table DEFERRED (analytics only) |
| origin clusters | **NEW, small** | Cluster id + method; needed so reposts do not count as independent signals |
| reviews | **NEW, append-only** | Human decision + reason code; the latest review per target is the persistent rejection/snooze. Does not reuse `review_feedback` (item-level, `route NOT NULL`); reuses its pattern. Mutates no config |
| research handoff | **NEW, late (DEFER implementation)** | Frozen allowed-fields snapshot taken at ACCEPT; created only when the research workflow exists |

Bounded storage (P4): observation retention/compaction is a calibration decision (deferred); snapshots, not raw observations, feed read paths.
