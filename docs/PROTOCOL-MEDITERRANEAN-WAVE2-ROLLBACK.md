# PROTOCOL MEDITERRANEAN WAVE-2 — ROLLBACK PLAN (0043)

> Forward-fix is the default recovery posture (repo convention). This document
> provides the exact ID-scoped compensating deletes if removal is ever
> governed-approved. Tested locally: apply → rollback → counts return to zero;
> re-apply restores deterministically.

## Rollback SQL (reverse dependency order; Wave-2 IDs only)

```sql
DELETE FROM claim_evidence_links WHERE claim_id LIKE 'clm_med\_%' ESCAPE '\';
DELETE FROM protocol_evidence WHERE evidence_id LIKE 'ev_med\_%' ESCAPE '\';
DELETE FROM protocol_claims WHERE claim_id LIKE 'clm_med\_%' ESCAPE '\';
DELETE FROM source_items WHERE id LIKE 'med-item-%';
DELETE FROM protocol_components WHERE component_id LIKE 'med-comp-%';
DELETE FROM protocol_versions WHERE version_id = 'med-v1';
```

## Verification after rollback

- `protocol_versions/components/claims/evidence` counts for med-* return to 0.
- `protocols` still 6; family/alias rows untouched (no delete touches them).
- Re-applying `0043_protocol_mediterranean_wave2.sql` restores the exact rows
  (idempotent INSERTs; verified locally).

## Forward-fix preference

- Data defects → new corrective migration (never edits 0043).
- Failed apply → fix cause, re-apply (file is idempotent; partial apply
  resumes cleanly).
- Destructive production rollback only on explicit owner authorization.
