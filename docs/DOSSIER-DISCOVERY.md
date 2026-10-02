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
- Relations are discovery-only (`CO_INTEREST`, `MENTIONED_WITH`, …); `CAUSES/CURES/TREATS/IMPROVES/PREVENTS` are forbidden. A pair needs a joint signal; a triple needs a direct triple signal or a supported pair network (3 pairs, 2 independent signal families: contract minimums). Automatic depth ≤ 3.
- Quality is signal hygiene, not evidence grading; independence is counted separately (mentions, creators, platforms, independent families) with origin clusters.
- Review is human; rejection needs a reason code; review never mutates weights, source activation/cadence, registry or routing.
- Handoff after ACCEPT carries discovery facts only (no conclusion, advice, dose, verdict; persons are provenance, not subject). Nothing auto-publishes.
- No patient profiling; sources carry an access state (`APPROVED | RESTRICTED | MANUAL_ONLY | UNRESOLVED | REJECTED`).

## Deliberately not built (separate prompts)
Real sources and readers (creator platforms, search/trend data, public-health and environmental data), observation/concept/proposal/candidate/review storage (a D1 migration only when a reader needs it, additive, never widening the `0028` CHECKs), scheduler/lease/cursor reuse, signal weighting and candidate generation, Hub UI, CCOS handoff. Source activation stays lifecycle-owned and owner-approved.
