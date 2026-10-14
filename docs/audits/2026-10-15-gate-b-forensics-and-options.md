# Gate B forensics, med-item matrix and resolution options (2026-10-15)

Status: analysis only. Owner decision in force: residual migration risk NOT accepted; supersession branch (`reconcile/gate-b-applied-bytes-20261014`, 64262b2 + 9e6b380) stays separate. Remote mutations: 0; no live query beyond A0.

## 1. Verified facts (re-checked against artifacts)
| Reported fact | Verified from |
|---|---|
| Ledger 53 rows; 6 RC-only, 8 remote-only names | A0 `DB-R2.json` vs `migrations/` |
| Production DDL equals RC replay (271 objects, normalized) | A0 `DB-R3.json` vs local replay |
| Branch-local result 1836/1836 + typecheck | measured on the supersession worktree only; **not RC** (RC measured 1834/1834 before docs-only commits) |
| No SQL migration needed | schema equal; only the exact-filename readiness contract fails |
| production:check | three overlapping runs on the supersession worktree (23:26, 23:31, 23:32); progressing slowly (test children started 23:40–23:42), no result yet |

## 2. Provenance matrix
Scale: EXACT_BYTES_PROVEN / EXECUTION_RECEIPT_PROVEN / SEMANTICALLY_SUPPORTED / SCHEMA_ONLY_EQUIVALENT / UNKNOWN.

Execution receipts available: Wrangler debug logs (`…12-09-20_053`, `…12-09-47_183`, cwd `gcos-doctors-integration`) give name, success and time only; SQL text is omitted by Wrangler (`QUERY STRING: omitted`). They are not SQL receipts.

| # | RC filename | Production filename (id, UTC) | Preserved apply file vs RC | Raw production DDL vs RC text | DML / non-idempotent | Class |
|---|---|---|---|---|---|---|
| 1 | 0043_protocol_mediterranean_wave2 | 0044_protocol_mediterranean_wave2 (44, 12:09:49) | executable tokens equal; comments/header differ | n/a (data seed) | 6 INSERT … ON CONFLICT DO NOTHING | SEMANTICALLY_SUPPORTED |
| 2 | 0044_doctor_discovery_candidates | 0048_doctor_discovery_candidates (48) | tokens equal; CRLF + comments differ | production = LF = RC text | none | SEMANTICALLY_SUPPORTED |
| 3 | 0045_discovery_signal_linkage | 0046_discovery_signal_linkage (46) | **byte-identical** (65d3b018…) | columns match | 3 ALTER ADD COLUMN (non-idempotent) | SEMANTICALLY_SUPPORTED (strongest) |
| 4 | 0045_doctor_source_proposals | 0049_doctor_source_proposals (49) | tokens equal; CRLF + comments differ | production = LF = RC text | none | SEMANTICALLY_SUPPORTED |
| 5 | 0046_doctor_knowledge | 0047_doctor_knowledge (47) | **byte-identical** (3ea0279b…) | production = RC text | none | SEMANTICALLY_SUPPORTED (strongest) |
| 6 | 0046_doctor_profile_facts | 0050_doctor_profile_facts (50) | tokens equal; CRLF + comments differ | production = LF = RC text | none | SEMANTICALLY_SUPPORTED |

Counts: EXACT_BYTES_PROVEN 0; EXECUTION_RECEIPT_PROVEN 0 (name-level receipts only); SEMANTICALLY_SUPPORTED 6; UNRESOLVED (byte identity) 6.

Additional contemporaneous evidence: a 2026-10-09 Codex session report (`archived_sessions/rollout-2026-10-09T20-06-53…`, section 4.4) lists an "earlier report" of `0044_shared_discovery_kernel.sql` as 10,366 bytes, SHA-256 prefix `FF32`, suffix `CE7`, and a "later trusted-artifact report" of 10,143 bytes / `c08b21f8…`. The preserved CRLF kernel is 10,366 bytes with SHA-256 `ff320fad…4ec01ce7`, so that file existed and circulated at apply time. This corroborates circulation, not execution of those bytes; the report itself says neither should replace the other.

## 3. LF versus CRLF
- Four preserved files (kernel, 0048, 0049, 0050; the kernel appears twice) are CRLF; their RC counterparts are LF. After CRLF→LF they are identical except for header comments in 0048–0050 and the Mediterranean file.
- Production stores LF for the 34 objects created from them. Same-version Wrangler (4.145.0, local mode) preserves CRLF in `sqlite_master.sql`, and production preserves `\r` for 7 older objects.
- Normalization explains the textual difference only if the remote `/query` path normalizes CRLF, which is **untested** (local mode is not remote). Without that test, "preserved CRLF == applied" is contradicted by raw DDL, and "LF == applied" is supported for statement text, while header comments are not stored in DDL and stay unobservable.
- No raw-byte identity is claimed anywhere.

## 4. med-item variance matrix (production `source_items`; owner SELECT results already on record, no new retrieval)
| ID | Field | Seed (all repo versions) | Production now | Approved target (`approved-display.ts`) | Class |
|---|---|---|---|---|---|
| med-item-dga-2015 | title | English "Dietary Guidelines for Americans, 2015-2020: Appendix 4 (…)" | "Amerikalılar için 2015-2020 Yönergesi: 4. EK (Sağlıklı Akdeniz Tarzı Yemleme Biçimi)" | "Amerikalılar İçin Beslenme Rehberi 2015–2020: Ek 4 — …" | production data drift (runtime localization) |
| med-item-dga-2015 | summary | English one-liner | "ABD HHS ve USDA, Americans'a Akdeniz tarzı bir yemleme biçimi öneriyor." | approved Turkish paragraph | same |
| med-item-predimed-2018 | title | English NEJM title | "Kalp Damarı Hastalıklarının Önlenmesi … Fıstık Eti ile Takviyeli" | approved Turkish title | same |
| med-item-predimed-2018 | summary | English RCT one-liner | "Mediterranean diyeti büyük kardiyovasküler olayları azalttı — büyük kardiyovasküler olaylar" | approved summary (≤320 chars) | same, with visible machine-translation artifact |

These are not formatting or encoding differences (different language and content). Cause class: post-seed runtime write (three live title/summary writers in the deployed artifact); exact writer UNKNOWN. Downstream: display shows unapproved Turkish text until the five-item correction (gate C, after live guards). The variance is provable from rows already captured, so no production write is needed to prove it; fixing it needs one.

## 5. Options
| Option | Proven | Unknown | Prod data risk | Migration safety | Protocols | Reversible | Owner approval | Deploy safe? |
|---|---|---|---|---|---|---|---|---|
| 1 Recover evidence for existing readiness | name-level receipts, preserved sources, schema, raw DDL | applied SQL bytes; remote CRLF handling | none | none | none | n/a | no for analysis; a new live query needs authorization | not yet |
| 2 Forward-only reconciliation, no policy change | not feasible: readiness is exact-filename and a new file cannot satisfy six absent names | – | none | safe | none | yes | policy change would be needed | no |
| 3 Non-authoritative diagnostic map | lineage table (`scripts/migration-compatibility-assessment.mjs`, never passes readiness) | – | none | none | none | yes | no | no |
| 4 Bounded residual-risk decision | all of sections 2–4 | applied bytes | none (schema equal, no SQL run) | readiness passes by name only | unblocks D, then C | yes (revert commit) | **yes, explicit** | yes, after D preconditions |

## 6. Recommended path and the one narrow evidence request
Option 1 first, with a single read-only probe that decides whether the CRLF contradiction is real: `SELECT length('a' || char(13) || char(10) || 'b')` proves nothing, so the probe must send a real CR+LF inside the SQL text, e.g. a string literal spanning a CRLF line break, through the same `/query` endpoint Wrangler used (`d1 execute --remote --command`), and return its length. Length 4 means the remote path preserves CRLF (the preserved CRLF files cannot be the applied bytes for those objects). Length 3 means it normalizes (the LF/CRLF difference is explained and the preserved files become consistent with production, still not byte-proven). Scope: one SELECT on `global-content-os`, no table access, no row data. Not executed; it needs a fresh authorization because A0 covered a fixed statement set.

Even length 3 does not lift Gate B to EXACT_BYTES_PROVEN. Closing byte identity needs an immutable receipt (none exists in Wrangler, D1 or Git). If none can be found, only Option 4 remains and it is an owner policy decision.
