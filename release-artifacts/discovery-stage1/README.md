# Discovery Stage-1 Migration Release Artifact

## Release Identity
- **Release ID**: `discovery-stage1-migrations-20261009`
- **Source Commit**: `083fd96`
- **Source Branch**: `release/discovery-stage1-migrations`
- **Base Commit**: `1788294` (guardrail commit)

## Migrations Included

### 1. 0043_protocol_mediterranean_wave2.sql
- **Type**: Data-only
- **Source Commit**: `4a174b6`
- **SHA-256**: `85ee1c23ff3f1f73f315aa6f6aa68951bb6aec0aa6e71e09bb4c9553745bbc9e`
- **Git Blob**: `681290b5d4dd5c0b4c16ee1b69e16e6d1ec161d8`
- **Description**: Mediterranean Diet protocol data (DGA 2015-2020 Appendix 4 + PREDIMED RCT)
- **Delta**: 6 INSERTs (protocol_versions, protocol_components ×9, source_items ×2, protocol_claims ×3, protocol_evidence ×2, claim_evidence_links ×2)
- **All guarded**: `ON CONFLICT ... DO NOTHING`

### 2. 0044_shared_discovery_kernel.sql
- **Type**: DDL-only
- **Source Commit**: `f65e789`
- **SHA-256**: `c08b21f8ce4de816fa7ca131bd44b291d90b210d1f19262be03d49689c3706d5`
- **Git Blob**: `c4c2d1a3202d160b14e485caeeeeb40f739f47ad`
- **Description**: Shared discovery kernel for Doctor and Protocol discovery
- **Tables Created**: 10 (discovery_runs, candidate_ledger, evidence_ledger, discovery_alias_dedupe, decision_ledger, wave_metrics, onboarding_intents, onboarding_intent_sources, onboarding_source_events, discovery_cross_feed_signals)
- **Indexes**: 6
- **Triggers**: 9 (state-transition, append-only, immutability)

## Authoritative Remote Predecessor
- `0043_dossier_discovery_foundation.sql` (applied in remote D1 ledger at position 43)

## Excluded Migrations (NOT IN THIS ARTIFACT)
- `migrations/0045_discovery_signal_linkage.sql` — follow-on stage-2
- `migrations/0046_doctor_knowledge.sql` — follow-on stage-2 (current EXPECTED)

## Order of Application
1. `0043_protocol_mediterranean_wave2.sql` (data)
2. `0044_shared_discovery_kernel.sql` (DDL)

## Verification
```bash
# Verify checksums
sha256sum -c checksums.sha256

# Verify git blob identity
git hash-object migrations/0043_protocol_mediterranean_wave2.sql  # should be 681290b5d4dd5c0b4c16ee1b69e16e6d1ec161d8
git hash-object migrations/0044_shared_discovery_kernel.sql  # should be c4c2d1a3202d160b14e485caeeeeb40f739f47ad
```

## Preconditions
- Remote D1 ledger max = `0043_dossier_discovery_foundation.sql`
- Mediterranean data absent: `med_v=0, med_items=0`
- Discovery tables absent: `disc_tables=0`
- Local file SHA256 matches manifest

## Authorization
- **Preflight**: Authorized (read-only checks passed)
- **Apply**: Requires owner signature on D.2
- **Deploy**: NOT authorized
- **Source Activation**: NOT authorized
- **Scheduler**: NOT authorized

## Deployment Notes
- **Deploy NOT authorized**: This artifact is for migration apply only
- **Worker deploy**: Separate authorization required
- **Source activation**: Separate authorization required
- **Scheduler**: NOT authorized
- **Production canary**: NOT authorized

## Verification Commands (Post-Apply)
```bash
# Verify Mediterranean data
SELECT COUNT(*) FROM protocol_versions WHERE version_id='med-v1';  -- expect 1
SELECT COUNT(*) FROM source_items WHERE id IN ('med-item-dga-2015','med-item-predimed-2018');  -- expect 2

# Verify discovery kernel
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name LIKE 'discovery_%' OR name IN ('candidate_ledger','decision_ledger','evidence_ledger','wave_metrics','onboarding_intents','onboarding_intent_sources','onboarding_source_events'));  -- expect 10

# Integrity
PRAGMA integrity_check;
```

## Manifest Reference
See `manifest.json` for complete machine-readable specification.

## Excluded Migrations
- `0045_discovery_signal_linkage.sql` — Follow-on stage-2
- `0046_doctor_knowledge.sql` — Follow-on stage-2 (current EXPECTED=0046_doctor_knowledge.sql)

These are tracked in the canonical branch but EXCLUDED from this stage-1 artifact.