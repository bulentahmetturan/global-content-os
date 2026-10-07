# PROTOCOL DASH WAVE-1 — ROLLBACK PLAN (0042)

> Forward-fix is the default recovery posture (repo convention). This document
> provides the exact ID-scoped compensating deletes if removal is ever
> governed-approved. Tested locally 2026-10-07: apply → rollback → counts
> return to zero; re-apply restores deterministically.

## Rollback SQL (reverse dependency order; Wave-1 IDs only)

```sql
DELETE FROM claim_evidence_links WHERE claim_id LIKE 'clm_dash\_%' ESCAPE '\';
DELETE FROM claim_attributions WHERE attribution_id = 'cattr_dash_definition';
DELETE FROM protocol_evidence WHERE evidence_id LIKE 'ev_dash\_%' ESCAPE '\';
DELETE FROM protocol_claims WHERE claim_id LIKE 'clm_dash\_%' ESCAPE '\';
DELETE FROM source_items WHERE id LIKE 'dash-item-%';
DELETE FROM actor_protocol_relationships WHERE relationship_id = 'apr_dash_nhlbi';
DELETE FROM actors WHERE actor_id = 'actor_nhlbi';
DELETE FROM protocol_components WHERE component_id LIKE 'dash-comp-%';
DELETE FROM protocol_versions WHERE version_id = 'dash-v1';
```

## Verification after rollback

- `protocol_versions/component/claims/evidence` counts for dash-* return to 0.
- `protocols` still 6; family/alias rows untouched (no delete touches them).
- Re-applying `0042_protocol_dash_wave1.sql` restores the exact 27 rows
  (idempotent INSERTs; verified locally).

## Forward-fix preference

- Data defects → new corrective migration (never edits 0042).
- Failed apply → fix cause, re-apply (file is idempotent; partial apply
  resumes cleanly).
- Destructive production rollback only on explicit owner authorization.
