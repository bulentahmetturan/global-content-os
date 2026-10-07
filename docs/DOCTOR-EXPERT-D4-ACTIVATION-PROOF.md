# D4 — Controlled Source Activation + First Real Ingestion (proof, not rollout)

SPRINT: D4 (local proof only — no remote apply, no polling, no scheduler, no deploy)
STATUS: proven + tested 2026-10-07. No new migration (D4.8: existing D1–D3
schema already represents activation).

## Activation policy (D4.1)

The ONLY canonical state authorizing ingestion is the latest
`actor_source_ingestability` row for the association with:
status ∈ {INGESTABLE, CONDITIONALLY_INGESTABLE} AND `evaluated_reason`
starting with `CONTROLLED_ACTIVATION:` (explicit owner act recorded by
`activateAssociationForIngestion`). Verification alone, actor active_status
alone, or a plain D3 evidence evaluation never authorizes ingestion
(all three proven by dedicated rejection tests). Deactivation
(`deactivateAssociation`, `CONTROLLED_DEACTIVATION:` prefix) flips current
state via a new row; history is never rewritten. Compatible with endpoint-
first identity, nullable-then-additive `source_ref`, and shared endpoints.

## Controlled source (D4.2)

Exactly one: Ahmet Ekmekçi — OFFICIAL_PERSONAL — official website
`https://ahmetekmekci.com` (the fixture already shared across D1–D3 tests;
no new person). Record: actor `actor_ahmet-ekmekci`, association
`assoc_*` (OFFICIAL_PERSONAL), endpoint `ep_ahmetekmekci-com`-shaped,
pre-activation state UNKNOWN/PENDING, activation state INGESTABLE/NONE via
`CONTROLLED_ACTIVATION:` evaluation + CHECKED/CONFIRMED activity event.
No second source activated.

## First real ingestion (D4.3)

One explicit `ingestOneItem` invocation through the REAL intake write path
(`upsertSourceItem`: admission gate, URL canonicalization, dedupe key,
temporal membership) into `source_items` (raw, triage `inbox`) +
`source_routes`, with association provenance bound via `source_id =
endpoint_id`, `intake_meta_json` {actor, association, endpoint, activation
evaluation}, and a post-ingestion activity row. Honest boundary: the
fetch/parser half is NOT exercised (no network, no polling in scope —
tests must stay deterministic and credential-free); the persistence,
dedupe, and provenance half runs the unmodified production code path.
The ephemeral DB carries one proof-only, explicitly disabled feed row
(`doctor_d4_proof_only`, enabled=0) solely to satisfy the enforced FK;
no registry file, catalog, or production row was touched.

## Provenance gate (D4.4)

All ten questions answerable from stored rows (dedicated test): item →
`source_id`/canonical_url (source+endpoint), intake_meta (association),
activation evaluation (ingestability+why), activity rows (preceding event,
timestamps), append-only history (reconstruction), post-disable
attribution (item + audit survive), shared-source isolation.

## No editorial mutation (D4.5)

Proven: zero rows in production triage, `approved_briefs`,
`editorial_decisions`, `production_status`. RAW item (inbox) vs editorial
content is a tested distinction, not a claim.

## Failure paths (D4.6, all tested)

Non-ingestable rejects; verification-only rejects; active-status-only
rejects; unknown association rejects; post-disable rejects with history
intact; re-activation restores via new act (and dedupes to the same item);
duplicates collapse to one row per dedupe_key; shared endpoint attributes
to exactly one association; brand association untouched by personal
ingestion.

## P1–P5

P1 PASS (registered→activation path executable and inspectable); P2 PASS
(actor→association→activation→ingestion→provenance end-to-end on one real
code path); P3 PASS (activation/ingestion history append-only and
explainable after disable/re-activation); P4 PASS (one source, one
invocation, no scheduler/polling/rollout); P5 PASS (no canonical,
editorial, or protocol mutation; proof feed row is disposable and disabled).

## Known environmental note (unchanged)

Newest-file drift guard stays 6/7: EXPECTED holds the protocol-owned bump,
newest is D3's 0035. D4 leaves the protocol-owned line untouched; final
bump belongs to the track that lands last. Production remains at 0030;
no remote apply authorized in D4.
