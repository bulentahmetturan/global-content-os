# Gate B reconciliation report — applied-migration identity (2026-10-14)

Owner decision in force: Option B stays FAIL_CLOSED; no alias authority, no SQL replay, no ledger mutation, no live access beyond A0. This report is local/read-only evidence work. Remote mutations: 0. No new live query was run.

## Evidence found (new)
1. **Apply provenance, 12:09 UTC batch (ledger ids 44–50).** Wrangler debug logs under `%APPDATA%\xdg.config\.wrangler\logs` (`wrangler-2026-10-09_12-09-20_053.log` pending list, `…12-09-47_183.log` apply with per-file ✅) show `d1 migrations apply` ran with cwd `gcos-doctors-integration` against DB `c0ce92dc-…`. Logs omit SQL text (`QUERY STRING: omitted`).
2. **Apply provenance, 14:37 UTC batch (ids 51–53).** `wrangler-2026-10-09_14-37-03_807.log`: cwd `gcos-protocols-ingest`.
3. **Preserved apply sources.** The seven 12:09 files exist in `gcos-doctors-integration/migrations/` (untracked in Git, never committed anywhere), all with mtimes before the apply (latest 2026-10-09 01:50 UTC; apply 12:09 UTC). The three 14:37 files are tracked in `gcos-protocols-ingest` (branch `guard/migration-authorization-scope-v1`, working tree has `0043_protocol_mediterranean_wave2.sql` deleted, unrelated).
4. The applied names `0044_protocol_mediterranean_wave2`, `0045_shared_discovery_kernel`, `0046_discovery_signal_linkage`, `0047…0050` appear in no Git commit of any branch.

## Mapping (ledger vs preserved apply sources vs RC)
| ledger id | applied name (UTC) | apply dir | applied-dir SHA-256 | RC counterpart | RC SHA-256 | relation |
|---|---|---|---|---|---|---|
| 44 | 0044_protocol_mediterranean_wave2 (2026-10-09 12:09:49) | gcos-doctors-integration | 76e587dd2bc5cf17b13714dc30bdc17de27e2a9dc83201969ad4031b7ccdcc1d | 0043_protocol_mediterranean_wave2 | 85ee1c23ff3f1f73f315aa6f6aa68951bb6aec0aa6e71e09bb4c9553745bbc9e | COMMENT_WHITESPACE_ONLY |
| 45 | 0045_shared_discovery_kernel (2026-10-09 12:09:49) | gcos-doctors-integration | ff320fad1b79791be2f10735bcd629cf24b84a23579c4fff22ce1f4f01ec4ce7 | 0044_shared_discovery_kernel | c08b21f8ce4de816fa7ca131bd44b291d90b210d1f19262be03d49689c3706d5 | EOL_ONLY |
| 46 | 0046_discovery_signal_linkage (2026-10-09 12:09:49) | gcos-doctors-integration | 65d3b0180c873a009c04adb46d79c0a4ee8f1d6bcb640804412a0a0bf814b1c9 | 0045_discovery_signal_linkage | 65d3b0180c873a009c04adb46d79c0a4ee8f1d6bcb640804412a0a0bf814b1c9 | BYTE_IDENTICAL |
| 47 | 0047_doctor_knowledge (2026-10-09 12:09:49) | gcos-doctors-integration | 3ea0279b4d2155d14135ecb46f6de7047eb666452229802eb199c72092e2a7ce | 0046_doctor_knowledge | 3ea0279b4d2155d14135ecb46f6de7047eb666452229802eb199c72092e2a7ce | BYTE_IDENTICAL |
| 48 | 0048_doctor_discovery_candidates (2026-10-09 12:09:49) | gcos-doctors-integration | f61fb0d8e43ebf690554e96e62432571d5c56e1da30505aab596a30d78f08f2b | 0044_doctor_discovery_candidates | 9205df1cc7a763cba684c7ef9c9963c9fa418191a03882bb053704f36bc001a2 | COMMENT_WHITESPACE_ONLY |
| 49 | 0049_doctor_source_proposals (2026-10-09 12:09:50) | gcos-doctors-integration | b8b35bdf3a4bf1f39cef5d31ca4be40cf5705fb1a0110e1e086bfe2385af14ec | 0045_doctor_source_proposals | f4e61ef061c31e0a3ad42d9ff06298eb8e1ee6426d5f5963fd22bdb1dc318667 | COMMENT_WHITESPACE_ONLY |
| 50 | 0050_doctor_profile_facts (2026-10-09 12:09:50) | gcos-doctors-integration | ca7d9dd274bfb9ad1dcd7302d9c9c9664ca8a4c20533e4d639f17bee647b4ba3 | 0046_doctor_profile_facts | c7877402a92e6a108347011157a5906feeffa67bab7e6af0e539489ea10abe59 | COMMENT_WHITESPACE_ONLY |
| 51 | 0044_shared_discovery_kernel (2026-10-09 14:37:05) | gcos-protocols-ingest | ff320fad1b79791be2f10735bcd629cf24b84a23579c4fff22ce1f4f01ec4ce7 | 0044_shared_discovery_kernel | c08b21f8ce4de816fa7ca131bd44b291d90b210d1f19262be03d49689c3706d5 | EOL_ONLY |
| 52 | 0045_protocol_ingestion_runs (2026-10-09 14:37:05) | gcos-protocols-ingest | e14a5f49f3cfefa6892d26ed5b5dbc22bfd06aafe2dd42c2a76165d327c9ea40 | 0045_protocol_ingestion_runs | e14a5f49f3cfefa6892d26ed5b5dbc22bfd06aafe2dd42c2a76165d327c9ea40 | BYTE_IDENTICAL |
| 53 | 0046_protocol_mediterranean_wave2 (2026-10-09 14:37:05) | gcos-protocols-ingest | 396d6f01120291074e870998e00ef919163be820c454051964104d81ccd2b5ba | 0046_protocol_mediterranean_wave2 | 396d6f01120291074e870998e00ef919163be820c454051964104d81ccd2b5ba | BYTE_IDENTICAL |

Relation key: BYTE_IDENTICAL = equal SHA-256; EOL_ONLY = equal after CRLF→LF; COMMENT_WHITESPACE_ONLY = executable SQL tokens equal after stripping `--` comments and collapsing whitespace (header renumbering text differs); DIFFERENT = none observed.

## Classification
| Class | Items |
|---|---|
| Exact byte identity, applied-dir == RC same filename | 0045_protocol_ingestion_runs, 0046_protocol_mediterranean_wave2 (common names) |
| Exact byte identity, preserved apply file == RC file under a different name | 0046_discovery_signal_linkage↔RC 0045_discovery_signal_linkage; 0047_doctor_knowledge↔RC 0046_doctor_knowledge |
| Executable-text identical, bytes differ (comments/header renumber) | 0044_protocol_mediterranean_wave2↔0043; 0048↔0044_doctor_discovery_candidates; 0049↔0045_doctor_source_proposals; 0050↔0046_doctor_profile_facts |
| Same filename, bytes differ by CRLF only | `0044_shared_discovery_kernel` (applied/CRLF `ff320fad…` vs RC/stage-1-artifact LF `c08b21f8…`) |
| Applied bytes PROVEN (immutable receipt) | **0** |

Strength of evidence: preserved apply-directory bytes plus matching cwd, timestamps and per-file names are strong circumstantial provenance. They are not an immutable receipt: Wrangler recorded no SQL hash, and file contents could in principle have been altered and mtime reset. The report therefore does not mark any file PROVEN_APPLIED.

## Findings affecting Gate B
- **The six RC-only files are renamed/re-commented copies of what was applied**, not different logic. Fresh full-DB DDL equivalence (A0) is consistent with this.
- **Replaying the RC six on top of production is unsafe and unnecessary**: `0045_discovery_signal_linkage` repeats an ALTER TABLE ADD COLUMN already applied as `0046_discovery_signal_linkage` (byte-identical).
- **A same-name file is not automatically byte-identical to what ran**: RC `0044_shared_discovery_kernel` is LF while the applied file was CRLF. Any future byte-hash gate must compare against the preserved apply bytes, not the stage-1 artifact.
- Remote ledger holds the shared kernel twice (ids 45 and 51); both ran as `CREATE … IF NOT EXISTS`, so the second was a no-op.

## med-item-* variances (four fields)
- Seed text in every repo version (`0043`, `0044_*` apply copy, `0046`) is the same English title/summary for both items.
- The production Turkish strings occur in Git only as recorded "before" values (`cb9bd92`, `079cb57`), never in any seed file.
- The 2026-10-11 deployed artifact analysis found three live writers that UPDATE title/summary/gists_json (`updateExistingItem`, `enrichOneItem`, manual localization).
- Classification: **actual data drift after seeding, introduced by a runtime path, not a migration-byte difference.** Which writer produced them is consistent with, but not proven by, row data. The Protocols five-item correction exists to replace exactly these values (approved values in `approved-display.ts`). It stays gated (needs deployed write protection, fence evidence, fresh snapshot).

## Safe forward-only reconciliation path (requires owner decision; not implemented)
**Supersession by applied bytes:** commit the seven preserved apply files into the RC under their applied names with their exact bytes (recorded SHA-256 above), remove the six RC-only duplicates from the required set and from the replay chain, and keep the three 14:37 files as they are (using the applied CRLF bytes for the kernel). Effects: readiness passes by exact filename, no alias, no SQL run on production, no ledger write, history preserved. Cost: edits the frozen-hash authority lists and stage-1 artifact references, i.e. a governance-file change that needs explicit owner approval; the permission layer refused loosening these guards before.
Rejected: alias map (owner declined), renaming RC files without the applied bytes (would assert byte identity that is only circumstantial), replaying SQL, ledger edits.

## Extra production read-only access needed
None. D1 and Cloudflare do not retain executed SQL text, and A0 already covers ledger and schema. Optional, low value: Cloudflare account audit-log read for the 2026-10-09 apply events (timestamps only).
