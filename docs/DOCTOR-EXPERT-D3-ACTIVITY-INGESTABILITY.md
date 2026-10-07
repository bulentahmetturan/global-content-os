# D3 — Source Activity + Ingestability Audit

SPRINT: D3 (implementation, local only — no remote apply, no activation, no polling, no deploy)
DOMAIN: `DOCTOR_EXPERT_INTELLIGENCE` → activity/ingestability audit
STATUS: implemented + tested 2026-10-07; migration NOT applied remotely.

Requires D1 Actor Registry + D2 associations. Single write site:
`apps/worker/src/actors/activity.ts`. Migration
`0035_doctor_source_activity_audit.sql` (next free ID at execution time;
0033/0034 are Protocol-owned and untouched).

## Activity identity

Audit key is `actor_source_association_id` — never raw URL, actor, endpoint,
or future source_ref alone. The auditable question is "can THIS actor-source
relationship be ingested, and what happened when we evaluated it?". Rows
carry denormalized `endpoint_id`/`actor_id` for cheap linkage; joins recover
the rest. `getAssociationAuditBundle` returns association + endpoint + actor
+ activities + ingestability history + latest determination: everything D4
needs to decide activation without activating anything.

## Ingestability semantics

Four states, deterministic derivation (`deriveIngestability`, pure, no AI,
no scoring): `INGESTABLE / CONDITIONALLY_INGESTABLE / NOT_INGESTABLE /
UNKNOWN`. Order-sensitive rules: governance cap (AMBIGUOUS/REJECTED →
UNKNOWN) → unsupported type → terms/legal → explicit denial → auth-required
(conditional) → unreachable (NOT_INGESTABLE/TRANSIENT_NETWORK; re-evaluation
may flip) → rate-limited (conditional) → unparseable → reachable+parseable
→ INGESTABLE → otherwise UNKNOWN. Empty evidence yields UNKNOWN, never
INGESTABLE. UNKNOWN != FALSE.

## Reason taxonomy

Shared bounded `reason_code` on both tables: `NONE,
TECHNICAL_FETCH_FAILED, ACCESS_DENIED, AUTH_REQUIRED, TERMS_LEGAL_BLOCK,
UNSUPPORTED_SOURCE_TYPE, RATE_LIMITED, PARSE_FAILED, TRANSIENT_NETWORK,
POLICY_UNKNOWN, UNKNOWN`. Activity kinds (14, observation classifications):
`DISCOVERED, CHECKED, REACHABLE, UNREACHABLE, AUTHORIZED, UNAUTHORIZED,
SUPPORTED, UNSUPPORTED, RATE_LIMITED, TERMS_BLOCKED, AUTH_REQUIRED,
PARSEABLE, UNPARSEABLE, UNKNOWN` with outcomes `CONFIRMED / BLOCKED /
INCONCLUSIVE / UNKNOWN`. No free-form statuses, no quality score.

## History behavior

Both tables are append-only (triggers refuse UPDATE/DELETE). A
determination change is a new evaluation row; current status is projected
(`getLatestIngestability`: latest `evaluated_at`, `rowid` tiebreak). Nothing
is ever overwritten, so every past determination stays explainable.

## Verification distinction (test-proven)

`VERIFIED` association + unreachable evidence → `NOT_INGESTABLE` (verified
but not ingestable). Verification ("does this source represent this actor?")
and ingestability ("can GCOS consume it under contract?") are separate
state machines; neither writes the other, and audit writes mutate no
canonical actor/association row.

## active_status distinction (test-proven)

Retiring/deactivating the actor changes no determination. `active_status`
governs the person lifecycle; ingestability governs technical
consumability; source activation (a future D4 lifecycle act) governs
acquisition. Three different decisions, three different stores.

## Future source_ref

`PREACTIVATION_ENDPOINT_PLUS_SOURCE_REF` preserved: `source_ref` is nullable
today and additive later — a later evaluation carries the canonical source id
once the shared registry owns it, without rewriting history. No parallel
registry was created.

## Shared sources + person/brand

Determinations are per association: the same endpoint evidence reused for two
associations yields two independent rows with independent latest states.
Person/personal/brand endpoints keep separate audit trails; nothing
auto-collapses them.

## Probe contract (bounded, operator-invoked)

`evaluateIngestability(db, associationId, evidence, audit)` records a
determination from caller-supplied bounded evidence. No cron, no scheduler,
no retries, no content ingestion, no network. D3 never persists
`source_items`, candidates, or briefs (test-proven by unchanged counts and
absent scheduler surface).

## D4 activation boundary

D4 (`D4_CONTROLLED_SOURCE_ACTIVATION_AND_FIRST_REAL_INGESTION`) may read the
bundle and, under owner authorization, promote endpoints into the shared
lifecycle. D3 provides no activation helper by design.

## Known environmental note

The newest-file drift guard (`readiness.test.mjs`) currently reports
`EXPECTED(0034, Protocol-owned bump) vs newest(0035, D3 file)`. The
`readiness.ts` line is owned by the parallel Protocol track's in-flight
bumping (0033→0034 during D2/D3); D3 leaves it untouched per the
leave-Protocol-files rule. All D3/D2/D1/temporal/readiness-behavior tests
pass; the single guard mismatch is interleaved-track hygiene, not D3 logic.
Whoever lands last owns the final bump; production stays at 0030 until
owners authorize remote apply + deploy.
