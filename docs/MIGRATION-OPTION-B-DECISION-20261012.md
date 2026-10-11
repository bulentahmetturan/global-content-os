# Migration Option B Decision — 2026-10-12

## Decision in brief

Option B is safe to use only as a **read-only schema-effect compatibility assessment**. It is not migration authorization, proof of historical execution, a pending-set calculation, a ledger alias, or a readiness exception. The exact-filename runtime/release gate remains unchanged and FAIL-CLOSED.

The captured ER02 comparison is anchored to RC `19cbd3447bf08cdd04e651d5ba7a5a49ce7a8f81`, an ancestor of central RC `c5758e2b748338d51bf3795da521894a92398e41`. All six files in the current RC tree match the captured ER02 SHA-256 values. ER02 reports 45 common filenames, six RC-only, eight remote-only, 259 exact schema-object matches, 12 comment/whitespace-only semantic matches, no identified required DDL delta, zero proven applied migration byte matches, unknown data delta, and unknown actual pending set.

## Narrow policy

1. Keep `d1_migrations` as the authoritative execution ledger. Full filename, namespace, target environment, authorized pending set and independently established file hashes remain required by the existing migration authority.
2. Permit a separate local tool to compare the six RC-only migration effects with captured production schema evidence. Its result is advisory evidence only; it cannot approve an alias, change the pending set, write the ledger, run SQL, or influence Worker readiness.
3. An assessed counterpart filename is a candidate relationship, never an identity substitution. Matching names, numeric prefixes, SQL effects, schema objects or resulting data do not prove applied bytes.
4. Data-bearing migrations require exact data-row/payload and provenance evidence in addition to schema checks. Until that evidence exists, execution necessity and data compatibility remain UNKNOWN.
5. Missing evidence, changed files, stale schema snapshots, or any unrelated readiness failure remain FAIL-CLOSED.

## Six filename assessments

| RC-only migration | Owner / effect | Candidate remote filename | Current compatibility evidence | Remaining requirement |
|---|---|---|---|---|
| `0043_protocol_mediterranean_wave2.sql` | Protocols; data seed for versions, components, source items, claims, evidence and links | `0044_protocol_mediterranean_wave2.sql` | Existing bounded reads verify expected row families and relationships; owner subsequently ran the bounded cross-ID identity check and reported only the two expected source IDs. Four title/summary values still differ from the original SQL payload; applied bytes remain unproven. | Resolve/document the source-text payload variance and obtain original apply receipt or explicit owner risk decision. Do not replay blindly. |
| `0044_doctor_discovery_candidates.sql` | Doctors; creates candidate table and indexes | `0048_doctor_discovery_candidates.sql` | Corresponding schema contract appears in captured schema comparison; no byte proof. | Confirm all constraints/index details against a fresh authoritative schema snapshot and establish the execution record. |
| `0045_discovery_signal_linkage.sql` | Discovery; adds three linkage columns and index | `0046_discovery_signal_linkage.sql` | Columns/index appear compatible in captured schema comparison; no byte proof. | Verify exact column definitions, index and existing linked data. SQL contains non-idempotent `ALTER TABLE ADD COLUMN`; reapplication is unsafe. |
| `0045_doctor_source_proposals.sql` | Doctors; creates proposal table and indexes | `0049_doctor_source_proposals.sql` | Corresponding schema contract appears in captured schema comparison; no byte proof. | Confirm all constraints/index details against a fresh authoritative schema snapshot and establish the execution record. |
| `0046_doctor_knowledge.sql` | Doctors; creates publication and statement tables with actor/publication foreign keys and indexes | `0047_doctor_knowledge.sql` | Corresponding schema contract appears in captured schema comparison; no byte proof. | Confirm foreign-key/check/index details against a fresh authoritative schema snapshot and establish the execution record. |
| `0046_doctor_profile_facts.sql` | Doctors; creates profile-facts table and unique/normal indexes | `0050_doctor_profile_facts.sql` | Corresponding schema contract appears in captured schema comparison; no byte proof. | Confirm uniqueness and index details against a fresh authoritative schema snapshot and establish the execution record. |

Historical Git origin commits and current candidate hashes are emitted per file by `scripts/migration-compatibility-assessment.mjs`. The candidate remote filenames are not authorized aliases. The remote-only `0031_dossier_discovery_foundation.sql` and other discrepancies are outside this six-file compatibility assessment and continue to be governed by the exact authority check; no unrelated readiness finding is suppressed.

## Protocols seed reconciliation

The already-authorized ER03 evidence contains 13 bounded SELECT results. It covers every row family inserted by `0043_protocol_mediterranean_wave2.sql`:

| Seed family | Intended `med-v1` records | Captured production evidence |
|---|---:|---|
| `protocol_versions` | 1 | Exact expected version row present |
| `protocol_components` | 9 | All nine expected component IDs/values present; no missing or unexpected IDs |
| `source_items` | 2 | Both exact IDs and stable identity/provenance fields present; title and summary differ on both records (four fields total) |
| `protocol_claims` | 3 | Exact expected claim rows present |
| `protocol_evidence` | 2 | Exact expected evidence rows and locators present |
| `claim_evidence_links` | 3 | Exact expected claim/evidence/direction links present |
| `protocol_phases` | 0 | Expected empty; captured result empty |

The displayed source-text differences are already covered by the Protocols text-review and approved correction scope. They do not establish whether the local English seed was applied and later localized, whether another authorized process created the rows, or whether the reviewed text edits were performed with documented provenance. The 13-query comparison reported no missing or unexpected target IDs.

Exact source-item payload differences from the captured comparison:

| ID / field | RC migration value | Captured production value |
|---|---|---|
| `med-item-dga-2015.title` | `Dietary Guidelines for Americans, 2015-2020: Appendix 4 (Healthy Mediterranean-Style Eating Pattern)` | `Amerikalılar için 2015-2020 Yönergesi: 4. EK (Sağlıklı Akdeniz Tarzı Yemleme Biçimi)` |
| `med-item-dga-2015.summary` | `Official USDA/HHS Mediterranean-Style pattern table at 12 calorie levels plus Chapter 1 limits.` | `ABD HHS ve USDA, Americans'a Akdeniz tarzı bir yemleme biçimi öneriyor.` |
| `med-item-predimed-2018.title` | `Primary Prevention of Cardiovascular Disease with a Mediterranean Diet Supplemented with Extra-Virgin Olive Oil or Nuts.` | `Kalp Damarı Hastalıklarının Önlenmesi için Akdeniz Diyeti, Zeytinyağı veya Fıstık Eti ile Takviyeli` |
| `med-item-predimed-2018.summary` | `Republished RCT n=7447: Mediterranean diet lowered major cardiovascular events versus low-fat control.` | `Mediterranean diyeti büyük kardiyovasküler olayları azalttı — büyük kardiyovasküler olaylar` |

Migration SQL declares `ON CONFLICT(version_id|component_id|id|claim_id|evidence_id|claim_id,evidence_id) DO NOTHING`; duplicate primary/unique-key replay is a no-op, not an update/reconciliation. That is deterministic source behavior, not proof the SQL ran. It also does not prevent a semantically duplicate source under a different ID. The following additional bounded duplicate-identity query was executed by the owner in the production D1 Console:

```sql
SELECT id, canonical_url, dedupe_key, canonical_work_id, discovery_reason
FROM source_items
WHERE canonical_url IN (
  'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',
  'https://pubmed.ncbi.nlm.nih.gov/29897866/'
)
   OR dedupe_key IN (
  'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',
  'https://pubmed.ncbi.nlm.nih.gov/29897866/'
)
   OR lower(canonical_work_id) = '10.1056/nejmoa1800389'
ORDER BY id
LIMIT 25;
```

Target: production Content D1 `global-content-os` (`c0ce92dc-9842-4dd9-9d05-a8d09e798b34`). The query was executed in the D1 Console as a SELECT. No further SQL is required to compare the seed rows already returned by Q1-Q8, and this query must not be repeated.

**Owner-reported result, supported by the supplied screenshot:** execution succeeded; SELECT only; 2 rows returned: `med-item-dga-2015` and `med-item-predimed-2018`; no additional IDs matched the queried canonical URLs, dedupe keys, or DOI; production writes: 0. The console shows response time `240ms` and query time `15.97ms`. This closes the bounded cross-ID duplicate check for those identity keys. The screenshot does not provide an execution timestamp or provider request ID and clips the rightmost columns; those details are not inferred. The result does not prove migration execution, byte provenance, or equivalence/provenance of the four changed source-text values. **Do not rerun this query.**

## Historical identity classification

The only proof presently available is the captured ledger's exact-name absence plus schema/data snapshots. No immutable apply receipt or proven applied-byte hash was recovered by the already-completed bounded search (59 source byte artifacts, 0 proven applied bytes). Exact-name absence does not prove SQL was never run manually or under a different filename. Accordingly:

| RC filename | Classification now | What is proven / not proven |
|---|---|---|
| `0043_protocol_mediterranean_wave2.sql` | `DATA_EFFECT_VERIFIED_ONLY` (partial payload variance noted) | Seed row families and relationships exist as described above; two source items differ in title/summary. No execution identity or exact seed-byte proof. |
| `0044_doctor_discovery_candidates.sql` | `SCHEMA_EFFECT_VERIFIED_ONLY` | Captured schema contract is present; exact migration execution and bytes unknown. |
| `0045_discovery_signal_linkage.sql` | `SCHEMA_EFFECT_VERIFIED_ONLY` | Captured linkage columns/index are present; exact migration execution and bytes unknown. |
| `0045_doctor_source_proposals.sql` | `SCHEMA_EFFECT_VERIFIED_ONLY` | Captured schema contract is present; exact migration execution and bytes unknown. |
| `0046_doctor_knowledge.sql` | `SCHEMA_EFFECT_VERIFIED_ONLY` | Captured table/constraint/index contract is present; exact migration execution and bytes unknown. |
| `0046_doctor_profile_facts.sql` | `SCHEMA_EFFECT_VERIFIED_ONLY` | Captured table/unique-index contract is present; exact migration execution and bytes unknown. |

None is `PROVEN_APPLIED` or `PROVEN_NOT_APPLIED`. The exact RC filenames are absent from the captured ledger, but remote differently named records and the absence of apply receipts prevent a conclusion about whether equivalent SQL effects were executed under another identity. No history is rewritten and no discrepancy is converted into an apply set.

## Independent operations evidence

No Cloudflare production operator transport is exposed in this local task environment. Existing evidence is reused; no Wrangler log/auth request is retried. OPS/Dossier alert root causes, privileged writer activity/fence, and compatible executable rollback remain externally unverified. The previous read-only collection request is not broadened here; its designated operator must return those already-scoped outputs through the authorized evidence channel.

## Risk and readiness

- **Schema compatibility:** captured schema evidence identifies no required application DDL delta; 259 objects matched exactly and 12 more differed only by comments/whitespace. This is limited to the captured snapshot and is not a live freshness claim.
- **Data migration risk:** Core Protocols row identities, version/components/claims/evidence relationships, and the bounded cross-ID identity check are verified from production reads. Four source title/summary fields differ from the original seed values, and the available result does not establish transformation provenance. The other five are described as schema-only/additive in local SQL, but production data effects/state are not inferred from that description.
- **Historical provenance:** UNPROVEN. The completed bounded search found 59 source-byte artifacts and zero proven applied bytes. Schema or data equivalence cannot repair that evidentiary gap.
- **Execution identity:** UNKNOWN. Actual pending set remains UNKNOWN. No migration can be selected for apply from this assessment.
- **Runtime dependency:** exact RC readiness currently fails because six exact required filenames are absent from the captured ledger and no alias authority exists. No Worker code/readiness change is proposed.

### Owner decision

**Current owner direction is explicit:** residual migration risk is NOT accepted; migration apply, ledger modification, readiness bypass, and deployment are NOT authorized. No repeat approval request is pending. Keep the release blocked while recovering authoritative receipts/evidence; do not infer “already applied” from matching schema or current rows. Any future proposal to change this direction requires a new, separate owner authorization and is outside this assessment.

## Exact safe release conditions

1. Obtain current authoritative ledger/environment/database identity and complete per-file apply receipts or immutable byte provenance.
2. Resolve/document the four Protocols source-text value differences and their provenance; the bounded duplicate-identity query is complete and must not be repeated.
3. Reconcile all filename discrepancies through the migration authority owner; no implicit aliasing, manual ledger repair, or blind SQL replay.
4. Preserve and pass exact-file/hash authority, complete-set checks, namespace/environment checks, historical-byte checks where required, and every unrelated readiness gate.
5. Preserve the current owner direction: residual migration risk is not accepted; no migration apply, ledger edit, readiness bypass, or deployment is authorized. Any future change to that direction would require separate explicit authorization.

## Local verification

The added `scripts/migration-compatibility-assessment.mjs` reads only the captured JSON evidence and the six local SQL files to check hashes and produce an assessment-only result. It has no D1/network/migration-runner interface. Its tests reject RC identity drift, incomplete filename evidence, local byte drift, readiness promotion, and hidden ledger identity changes. It reports `sqlExecuted=false`, `databaseContacted=false`, `ledgerChanged=false`, `executionAuthorized=false`, and `migrationReadiness=FAIL_CLOSED`.

This check supplements but does not replace `scripts/migration-authority.mjs`, `scripts/production-check.mjs`, `release/lib/readiness.mjs`, or Worker migration readiness. Historical migration files and production state are untouched.
