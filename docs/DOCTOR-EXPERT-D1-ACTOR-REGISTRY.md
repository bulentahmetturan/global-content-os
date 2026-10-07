# D1 — Canonical Actor Registry + Identity

SPRINT: D1 (implementation, local only — no remote apply, no activation, no deploy)
DOMAIN: `DOCTOR_EXPERT_INTELLIGENCE` → Actor Registry
STATUS: implemented + tested 2026-10-07; migration NOT applied remotely.

Boundary: D0 reconciliation (`docs/DOCTOR-EXPERT-D0-RECONCILIATION.md`) is
binding and is not duplicated here — only D1 deltas are documented.

## Ownership

The Actor Registry is the canonical person-identity authority for Doctor /
Expert Intelligence. All actor writes go through the single write site
`apps/worker/src/actors/registry.ts` (create/get/alias/role/ref/rename/
confidence/list/resolve). No other module writes the actor tables.

## Panel model

`actors.panel ∈ {TURKEY_EXPERT_PANEL, GLOBAL_EXPERT_PANEL,
OTHER_HEALTH_ACTORS}`. `HEKIMLER_RADAR` is a docs/UI alias for the Turkey
panel only: creating an actor with panel `HEKIMLER_RADAR` fails validation,
and no route, scheduler, or Hub lane was added (test-proven).

## Credential vs role

Distinct concepts, distinct storage. `credential_class` (single, default
`UNKNOWN_PENDING_VERIFICATION`) answers "what is verified about this
person"; `actor_roles` (many, `actor_roles` table) answers "what function
does this actor perform for the system". Nothing infers credentials from
handles, bios, marketing, or honorifics — `setCredential` is explicit and
audit-stamped (`updated_by/reason`).

## Alias rules

Aliases live in `actor_aliases`, never as new actors. Types: `NAME_VARIANT,
DIACRITIC_VARIANT, TRANSLITERATION, FORMER_NAME, HISTORICAL_DISPLAY_NAME,
PROFESSIONAL_DISPLAY_NAME, KNOWN_PUBLIC_NAME`. Titles, institutions, and
specialties are not aliases. Creation records the creation name as a
`PROFESSIONAL_DISPLAY_NAME` row; `renameActor` keeps `actor_id` and retains
the old name as `FORMER_NAME`. The same normalized alias MAY exist on
several actors — that is ambiguity, not reassignment.

## Normalization

`normalizeActorName` (NFKD → strip marks → İ/I/ı fold → lowercase →
collapse) is Turkish-aware and exists for candidate generation only.
`NORMALIZED MATCH ≠ AUTO-MERGE`: the resolver returns `CANDIDATE_MATCHES`
for one candidate and `AMBIGUOUS` for several; no merge operation exists in
D1. `doctor.mik` resolves `NO_MATCH` and is linked to nobody
(`PENDING_IDENTITY_RESOLUTION` by absence, test-proven).

## Identity confidence

`actors.identity_confidence ∈ {VERIFIED, HIGH_CONFIDENCE,
PENDING_IDENTITY_RESOLUTION, AMBIGUOUS, REJECTED_MATCH}`; default
`PENDING_IDENTITY_RESOLUTION`. Ambiguous matches fail closed via the
resolver; `actor_id` immutability is enforced by trigger
`trg_actors_id_immutable` plus a test.

## Verification refs

`actor_identity_refs` records provenance (`ref_type`, value, purpose,
status, observer) for institutional/university/society profiles, ORCID,
researcher IDs, and official sites. Record-only: nothing is polled,
scheduled, or ingested. The same VERIFIED `(ref_type, ref_value)` cannot
exist on two actors (partial unique index
`idx_actor_refs_verified_identity`); non-verified rows stay unconstrained
observations. A VERIFIED identifier resolves `EXACT_ACTOR`.

## Seed registry policy

No seed rows were inserted (migration is DDL-only). Representability of the
approved seed set is proven by ephemeral tests: 12 Turkey + 25 global names
fit `(canonical_name, panel)` with pending credentials; Anthony William fits
`OTHER_HEALTH_ACTORS` + `HEALTH_CREATOR`/`CLAIM_SOURCE` without `PHYSICIAN`;
`doctor.mik` stays unresolved; Rhonda Patrick + `FoundMyFitness`
(`KNOWN_PUBLIC_NAME`) need one actor; `Barbell Medicine` resolves `NO_MATCH`
— organizations are not people and D1 adds no org/brand table.

## Doctor vs Protocol boundary

D1 creates no protocol entity of any kind (test asserts `protocols` and
siblings absent). A future `protocol_ref` from Doctor signals into
`PROTOCOL_INTELLIGENCE` remains the only allowed relation.

## Schema

Migration `0031_doctor_actor_registry.sql` (next free number; `0027`
reserved): `actors`, `actor_aliases`, `actor_roles`,
`actor_identity_refs`, two indexes, one partial unique index, one
immutability trigger. Additive only; existing rows untouched.
`EXPECTED_SCHEMA_MIGRATION` bumped to `0031_…` per the drift-guard
convention. One adjacent fix: the 0030 temporal test's "0030 is newest"
assertion was updated to a presence assertion (any new migration trips the
old wording; test purpose unchanged).

## D2 handoff

D2 (`D2_ACTOR_SOURCE_BUNDLE`) owns `actor_sources` (absent by test) and the
Source Activity Audit. It may read `actors`/`actor_aliases`/resolver as-is;
no D1 API change is expected. D1 applied nothing remotely: production D1
stays at 0030 until an owner authorizes the remote apply + deploy together
(expect `SCHEMA_BEHIND` on a 0031 Worker until then — fail-closed by design).
