# PROTOCOL REAL DATA WAVE 1 — DASH (owner-designated target)

> Status: local real-data flow PASS. Production population NOT_APPLIED —
> applying migration 0042 to production D1 requires explicit authorization
> (PROTOCOL_DASH_PRODUCTION_POPULATION_AUTHORIZATION_REQUIRED).
> No deploy required by this wave unless the migration is applied (code
> unchanged except the readiness pointer, which tracks the newest file).

## Target

- TARGET_CANONICAL_PROTOCOL_ID = `dash-eating-plan` (existing P0 identity, reused;
  family `cardiometabolic-dietary-patterns`, aliases `DASH`/`DASH diet` untouched).
- Seed count stays 6. Zero PROPOSED/WATCH/REJECTED canonicalized.

## Authoritative source set (all verified with bounded reads)

- [booklet] NIH Publication No. 06-4082, "Your Guide to Lowering Your Blood
  Pressure with DASH" (orig. 1998, rev. April 2006) — PROTOCOL_DEFINITION,
  VERSION_DEFINITION, COMPONENT_DEFINITION, CLAIM_SUPPORT (definition claim).
  Canonical URL: `https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf`
  (NHLBI page itself unreachable from this environment — transport-level block,
  retried; booklet PDF content verified via search-verified mirrors + AHRQ/UCLA
  corroboration of servings tables).
- [trial] Appel LJ et al., NEJM 1997;336:1117-24 — CLAIM_SUPPORT (BP effect).
  PMID 9099655, DOI 10.1056/NEJM199704173361601 (verified via Europe PMC REST,
  abstract + RCT metadata captured).
- [sodium] Sacks FM et al., NEJM 2001;344:3-10 — CLAIM_SUPPORT (sodium-combined
  effect, subgroup response). PMID 11136953, DOI 10.1056/NEJM200101043440101
  (verified via Europe PMC REST).
- medicalNEWS explicitly NOT used for any protocol-definition purpose.

## Populated rows (migration 0042, idempotent re-apply proven)

- 1 version: `dash-v1` (seq 1, label cites the booklet edition; no invented semver).
- 0 phases: DASH is structurally non-phased (PHASE_MODEL_USAGE = NONE, tested).
- 9 components: Box-3 servings at 2,000 kcal + sodium levels, exact units kept.
- 1 actor: `actor_nhlbi` (GLOBAL_EXPERT_PANEL; issuing institution, no duplicate
  persons; individual trial authors deliberately NOT created).
- 1 edge: `apr_dash_nhlbi` ASSOCIATED_WITH, protocol-wide.
- 3 source_items (EVERGREEN research_rediscovery, `protocol-wave-1-dash-controlled-import`;
  feed_id denotes research channel, fetch provenance in discovery_reason + URL).
- 4 claims (1 DEFINITION + 2 OUTCOME + 1 OTHER), 1 attribution (NHLBI AUTHOR of
  the definition claim only), 3 evidence rows, 4 SUPPORTS links.
- 0 safety rows (no formal DASH contraindication text verified — legitimately sparse).
- 0 commercial rows (DASH is public-domain NHLBI material — legitimately empty).

## Guarantees proven (dash-wave1.test.mjs 11/11)

- Identity reuse, deterministic ordering, latest resolution, historical
  preservation, lineage guards (API + SQL level), duplicate guards, atomic
  failure (BEGIN/throw/ROLLBACK leaves zero trace), idempotent re-apply,
  full-tree deterministic readback via existing repository APIs.
- News/protocol boundary: no medikalnews artifact referenced; feed/registry
  untouched; no brief/scheduler/source side effects.

## Co-existing seed growth (test-isolation note)

- Wave-1 seeds (3 source_items, 1 actor, versioned DASH content) forced
  fixture-scoping fixes in count-based assertions across protocol/ingress/
  temporal/actors suites (behavior unchanged; isolation scoped to fixtures).
  One Doctor-owned assertion touched (`actors.test.mjs` GLOBAL-panel list:
  exact-equality → includes, caused by the governed institutional seed;
  documented here, no Doctor behavior changed).

## Production delta (preflight)

- Migration: `migrations/0042_protocol_dash_wave1.sql` (data only, no schema
  change; additive; idempotent). No other migration touched.
- Rows to create: 1 version, 9 components, 1 actor, 1 edge, 3 items,
  4 claims, 1 attribution, 3 evidence, 4 links. Everything else untouched.
- Expected production counts after apply: protocols=6 (unchanged),
  protocol_versions for dash=1, components=9, claims=4, evidence=3,
  safety=0 new, commercial=0 new.
- Rollback/forward-fix: forward-fix convention; deactivation not applicable
  (additive knowledge rows; removal would be a governed decision, not taken).
- Verification queries: seed counts above + `SELECT name FROM d1_migrations
  ORDER BY name DESC LIMIT 1` → 0042 + `resolveProtocol('DASH')` smoke.
- Deploy need: YES if applied (readiness pointer advanced to 0042 in-tree) —
  requires DEPLOY_AUTHORIZATION separately. No runtime behavior change
  (pointer-only code delta).

## Next boundary

- PROTOCOL_DASH_PRODUCTION_POPULATION_AUTHORIZATION_REQUIRED (exact delta above).
- Then DEPLOY_AUTHORIZATION_REQUIRED for the 0042-pointer build.
