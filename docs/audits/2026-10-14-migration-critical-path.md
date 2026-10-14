# Migration critical path — local candidate evidence

Scope: isolated `sprint/migration-critical-20261014`, baseline `58f41bc`.
Production writes, migration execution, deployment and credential enrollment: zero.

## Identity and history

The historical primary branch `e20a0b3` checks numeric prefixes in
`release/lib/migrations.mjs:numbering`, so the two committed 0043 files trigger
a false identity collision. Both filenames are preserved. The candidate already
contains `19cbd34`, which uses exact filenames, matching D1's filename ledger.
No historical SQL, filename or ledger identity was rewritten in this sprint.

| Filename | Checkout SHA-256 | Evidence |
|---|---|---|
| 0043_dossier_discovery_foundation.sql | 5f228b0a2c3541f46ba2259f1e2cce2cef5f4db6fdf24d111f58e49fbcbdc343 | Present in restored lineage 7b61870 |
| 0043_protocol_mediterranean_wave2.sql | 85ee1c23ff3f1f73f315aa6f6aa68951bb6aec0aa6e71e09bb4c9553745bbc9e | Origin 4a174b6; captured Option B hash |
| 0045_discovery_signal_linkage.sql | 65d3b0180c873a009c04adb46d79c0a4ee8f1d6bcb640804412a0a0bf814b1c9 | Committed additive SQL in b6d72db; captured Option B hash |

These are candidate checkout hashes, not proof of production applied bytes.
The primary branch's reported 0045 SQL failure comes from an untracked file
(`near "replacement characters": syntax error`), not its committed migration
history. That file is neither copied nor adopted into the isolated candidate.

## Corrected layer

Release readiness replay now uses the existing fatal UTF-8 decoder instead of
lossy `readFileSync(..., 'utf8')`. Invalid UTF-16/UTF-8 fails before SQL parsing,
with the filename and encoding error. SQL strings/comments/triggers remain
untouched; full SQL is executed by SQLite rather than split on semicolons.

The candidate's existing schema readiness uses required filename sets and
capabilities in `schema-contract.ts`; latest filename alone cannot establish
completeness. Existing readiness tests and OPS invariants pass on this lineage.
No production readiness is asserted by a local test.

## Verification

- `node scripts/local-release-verification.mjs`: PASS, content 50 files and statistics 1 file, LOCAL_ONLY.
- Critical-path, authority, local-release and Option B tests: 43 PASS.
- Readiness, schema-readiness, OPS invariants and five-item SQLite writer tests: 29 PASS.
- Historical migration forensics/reconciliation and ingestion run ledger: 9 PASS.
- Existing release suite: 17 PASS (local HTTP sandbox restriction required execution outside sandbox).
- Actual local D1 five-item writer compatibility: see final sprint report and `.logs/protocols-safe-writer-local-d1.json`; never infer a pass while execution is pending.

Writer fencing is already present: exact five IDs/approved values, full snapshot
CAS, schema CAS, materialized single-statement UPDATE, durable intent, bounded
metadata, replay and guarded rollback. SQLite tests verify these controls;
actual D1 is a separate required compatibility gate.

## Remaining production gates

Option B remains FAIL_CLOSED: schema-effect similarity does not confer alias
authority or prove historical execution. Captured production applied bytes and
the actual pending set remain unverified. Local synthetic ledgers cannot certify
production. Broker/credential availability, fresh authorized read evidence and
explicit owner approvals remain outside this migration correction.

Integration owner serializes canonical evidence capture to avoid independent
worktree ID allocation collisions. No canonical ledger is appended here.
