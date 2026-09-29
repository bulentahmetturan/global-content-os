# Research / Scientific Research Contract (Batch R1)

> **Relocated (2026-09-29, ADR-0004).** The research source registry, schemas, claim routing, age-tier and attention-signal code now live in `global-content-os/packages/source-catalog/src/research/`. `channel-content-os` no longer hosts them; references to `packages/source-catalog/src/research/` below are the former location. Shared candidate-model additions in `channel-content-os/mcp-server/src/candidates/` (production side) remain there.

**Status:** discovery-source registry + Research Pool architecture + claim
routing + candidate integration locked (2026-09-05), USER_APPROVED. Reuses
the existing canonical `research` archetype (order 3, approved Batch K2B) --
**no new competing archetype was created.** No live crawler, cron, or
automatic cadence is implemented here.

## Strategic scope: a brand-awareness engine, not a stethoscope newsletter

Research is deliberately **not** limited to Littmann/stethoscopes/auscultation
/medical devices. It may surface any scientifically credible, useful,
responsibly-communicable finding from medicine, human health, public health,
clinical science, and adjacent fields, **with no requirement of direct
Kaduse-product relevance.** The eligibility questions are about scientific
credibility, usefulness, responsible communicability, and editorial fit --
never "does this sell a Kaduse product."

## Content mix -- a rolling report, never a forced quota

`researchAffinity` (`STETHOSCOPE_AUSCULTATION` | `GENERAL_HEALTH_MEDICAL`) is
a content-mix marker only, never a scientific-priority ranking or a trust
score. `computeContentMixReport()` (`research-pool.ts`) takes only the
actual USED candidate history and reports the stethoscope-affinity ratio
against the target band (10-15%) -- it has no "candidate pool" or "target"
parameter, so it is structurally incapable of selecting a paper to hit a
quota or downgrading a quality decision. If no strong stethoscope research
exists in a given window, the band simply goes unmet; quality always wins.

## Ownership -- deliberately NOT Clinical Education, NOT Stethoscope Guide

`packages/source-catalog/src/research/` (`schemas.ts`, `source-registry.ts`,
`research-pool.ts`) is its own registry, structurally
disjoint from `clinical-education/`, `stethoscope-guide/`, `news/`, and
`observance/`.

## Two discovery directions feeding one Research Pool

`ResearchTriggerTypeSchema` keeps `RESEARCH_PUBLICATION_EVENT` (a live,
newly-indexed paper) and `HISTORICAL_RESEARCH_DISCOVERY` (an older paper
surfaced via backfill) **structurally distinct** -- never collapsed into one
generic trigger -- specifically so a historical find can never be silently
presented as newly published. Both feed the same `ResearchPoolRecord` model;
there is no separate canonical article truth for live vs. historical. A
paper's `identity.publicationDate` (the real date) and `discoveredAt` (when
this system found it) are always tracked separately.

This batch builds the discovery-source **registry**, the identity/dedup
logic, and the eligibility/claim architecture -- it does **not** implement a
live HTTP crawler against PubMed/Europe PMC/Crossref, per the batch's own
"no continuous high-cost crawler" instruction (section 69) and "a
deterministic batch/backfill mechanism is acceptable" (section 7). A future
batch can wire real fetchers behind `resolvePaperKey()`/`deduplicatePool()`
without changing this architecture.

## Source universe: 25 sources, 8 individually verified this batch

Eight core discovery/integrity/evidence sources were each individually
WebSearch-verified on 2026-09-05 and are `CANONICAL_ACTIVE`: PubMed
E-utilities (`RESEARCH_INDEX`), Europe PMC REST (`RESEARCH_INDEX`), Crossref
REST API (`BIBLIOGRAPHIC_METADATA`, including retraction-metadata filtering),
Crossmark (`PUBLICATION_INTEGRITY`), the Crossref-hosted Retraction Watch
Database (`PUBLICATION_INTEGRITY`, confirmed acquired/public since Sept
2023), PubMed Central Open Access Subset (`OPEN_FULL_TEXT`), Cochrane Library
(`SYSTEMATIC_EVIDENCE`), and the ClinicalTrials.gov API v2
(`TRIAL_REGISTRY`).

The remaining 17 entries are real, well-established journal
families/publishers (JAMA Network, NEJM, The Lancet + Lancet Digital Health,
BMJ, Nature Medicine, npj Digital Medicine, Circulation, JAHA, JACC,
European Heart Journal, CHEST, European Respiratory Journal, IEEE JBHI, IEEE
TBME, JMIR) plus medRxiv -- **not individually re-confirmed via WebSearch
this batch**, honestly marked `CONDITIONAL_VERIFIED`, never
`CANONICAL_ACTIVE`. Per section 16, this is explicitly **not an exclusive
whitelist** -- a legitimate study in an unlisted journal is never excluded
for that reason alone; these are secondary/direct-journal discovery aids,
with PubMed + Europe PMC remaining the main broad-discovery sources.

## Paywall policy: access level, not exclusion

`AccessLevelSchema` (`OPEN_FULL_TEXT`, `OPEN_ABSTRACT_ONLY`,
`PARTIAL_PUBLIC_RESULTS`, `PAYWALLED_WITH_USABLE_ABSTRACT`,
`INSUFFICIENT_PUBLIC_INFORMATION`) makes explicit that a paywall is **never**
an automatic exclusion (hard rule) -- what matters is claim scope matching
access scope (section 22). `ACCESS_LEVEL_ALLOWED_LOCATORS`
(`schemas.ts`) maps each access level to the `ClaimLocator`s reachable at it
-- e.g. a `PAYWALLED_WITH_USABLE_ABSTRACT` paper may only cite
`ABSTRACT_*` locators, never `FULL_TEXT_RESULTS`. `validateClaim()`
(post-approval, `channel-content-os/mcp-server/src/research/claim-routing.ts`) enforces this structurally; `INSUFFICIENT_PUBLIC_INFORMATION`
allows zero claims (no locator is reachable), which is the only case where
`resolveEvidenceStatus()` returns `INSUFFICIENT_EVIDENCE` rather than
`BLOCKED`/`VERIFIED`.

## Integrity gate

`checkIntegrityGate()` structurally blocks any `RETRACTED` paper from normal
Research eligibility (hard rule) regardless of otherwise-valid claims.
`checkPeerReviewLabel()` structurally forbids ever claiming a `PREPRINT` as
peer reviewed. Neither is an opaque score -- both are deterministic
structural checks, matching sections 27/64's "no single opaque quality
score" instruction.

## Research Pool: upstream of any content candidate

`resolvePaperKey()` collapses the same paper discovered by multiple indexes
(DOI > PMID > PMCID > normalized-title fallback) to one canonical Research
Pool entry; `deduplicatePool()` proves PubMed + Europe PMC finding the same
DOI never creates two entries. `resolvePoolStatus()` is a pure, deterministic
function of duplicate/integrity/evidence/editorial-relevance state
(`DISCOVERED` / `DUPLICATE` / `INTEGRITY_BLOCKED` / `INSUFFICIENT_EVIDENCE` /
`ELIGIBLE` / `NOT_EDITORIALLY_RELEVANT` / `USED`) -- never a single opaque
quality score, and no discovery volume reaches the candidate layer without
passing through this gate first.

## Candidate model extension (reused, not duplicated)

Two additions to the shared candidate model (`mcp-server/src/candidates/`),
both additive and nullable:

1. `TriggerTypeSchema` gained `RESEARCH_PUBLICATION_EVENT` and
   `HISTORICAL_RESEARCH_DISCOVERY` (the legacy generic `RESEARCH_EVENT` value
   is kept for backward compatibility but new Research candidates use the
   two specific values instead).
2. One new nullable JSON column, `research_meta` (migration
   `025_research_candidate_fields.sql`), holding `ResearchCandidateMetaSchema`
   (paper identity, study type, peer-review/integrity/access status,
   research affinity, publication/discovery dates) -- never populated for
   any non-Research candidate. This mirrors migration 024's discipline
   (additive, nullable, archetype-scoped column) rather than growing a
   parallel candidate model or adding a dozen separate SQL columns.

`CandidateEvidenceStatusSchema` (already extended with `SOURCE_CONFLICT` in
Batch SG1) is reused as-is for Research's `evidenceStatus` (`UNVERIFIED` /
`VERIFIED` / `BLOCKED`); Research additionally has its own
`ResearchEvidenceStatusSchema` (`+ INSUFFICIENT_EVIDENCE`) at the
architecture level, surfaced to the candidate via the generic
`evidenceStatus` field using the closest matching value.

## Localhost integration

The dashboard requires **no new page or route** -- `CandidateCard.tsx` and
`CandidateDetail.tsx` render `researchMeta` generically (research affinity
and access-level chips on the card; a full "Research Paper" section with
study type, access level, peer-review/integrity status, publication/discovery
dates, and DOI/PMID on the detail page), and the existing Queue channel/
post-archetype filters work unchanged since `research` was already a
registered archetype. Verified live via the Claude Browser tool
(2026-09-05): both demo candidates render correctly, the historical-vs-live
trigger distinction is visible, and the console shows no errors.

## Non-goals of this document

Not built here: live HTTP fetchers against PubMed/Europe PMC/Crossref/etc.,
an automatic content-selection/scoring engine, cadence/frequency decisions
(deferred to the future unified Kaduse Content Mix), design-family/layout
work, Global Mail, or any social publishing.
