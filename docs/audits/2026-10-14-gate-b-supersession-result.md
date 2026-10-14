# Gate B supersession — local implementation result

Branch `reconcile/gate-b-applied-bytes-20261014` (off RC `7f46ed9`). Owner-approved locally only. Production access, SQL execution, ledger writes, aliases: none. Readiness remains exact-filename; no alias map exists in this change.

## Change
- Added the seven preserved apply-directory files under their applied names with exact preserved bytes (SHA-256 in `2026-10-14-gate-b-reconciliation-report.md`); `.gitattributes` marks them `-text` so Git never converts line endings.
- `0044_shared_discovery_kernel.sql` now carries the applied bytes (`ff320fad…`, CRLF) instead of the LF stage-1 artifact bytes (`c08b21f8…`).
- Removed the six RC-only duplicates from `migrations/`; their original bytes are kept at `release-artifacts/gate-b-retired-rc-only/` (assessment tool and its test read from there).
- `REQUIRED_CONTENT_MIGRATIONS` / workstream lists, both frozen local authority manifests (via `scripts/gate-b-supersession.mjs`, kept for audit) and the migration register updated; `EXPECTED_SCHEMA_MIGRATION` is now `0050_doctor_profile_facts.sql`, the newest applied name (production reported newest-filename 0050).
- Required content set = 52 names; production ledger = those 52 + `0031_dossier_discovery_foundation.sql` (remote-only, not required).

## Verification (local)
- typecheck 0; node suites 1836/1836; `local-release-verification` PASS.
- Fresh replay: 52 executed, repeat 0; data fingerprint unchanged (`74faf95b…`); upgrade path from `7b61870` executes 10.
- Normalized DDL of all 271 objects identical to the previous RC; only stored statement text differs (CRLF) in 34 objects, so the schema fingerprint changed (`ee58e8b5…` → `ea6b9942…`) by design.

## Contradicting evidence found (does NOT prove or disprove bytes)
Comparing raw `sqlite_master.sql` captured from production (A0) with local replays: the 34 objects created by the five CRLF files are stored in production with **LF** newlines, matching the previous LF files, not the preserved CRLF bytes. Production does keep `\r` for 7 older objects (0024), so D1 does not strip CR. Therefore either Wrangler/D1 normalized these statements at apply time, or the preserved CRLF files are not byte-identical to what ran. Applied bytes stay **UNPROVEN**; the repo no longer pretends otherwise: exact-name readiness passes, hashes are *preserved-source* hashes, not production receipts.

## Remaining / not done
- Not merged into the RC branch; the owner reviews this branch first.
- Gate B is closed only for exact-filename readiness. Deployment still needs gates A, C, D, E.
- Any future byte-hash gate must treat the CRLF contradiction above as open.

## LF/CRLF experiment (added 2026-10-15)
Same Wrangler version as the 2026-10-09 apply (4.145.0), local mode, a CRLF migration with multi-line CREATE statements: `sqlite_master.sql` retains `\r\n` verbatim. Production retains `\r` for 7 older objects. Production holds LF for the 34 objects from the five preserved CRLF files. Conclusion: Wrangler and D1 do not normalize CRLF, so the preserved CRLF files are **not** the bytes that produced those 34 production objects (the LF RC-named variants match production DDL text exactly). The preserved-source hashes in the authority manifests therefore do not describe applied bytes for those five files. This is the reason the branch must not be merged under the existing "no residual migration risk" policy; it needs an explicit owner decision.
