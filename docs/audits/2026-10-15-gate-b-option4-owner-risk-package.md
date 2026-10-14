# Gate B — Option 4 owner risk-decision package (NOT a decision, NOT implemented)

Prepared 2026-10-15 on RC `integration/gcos-final-rc-20261014`. No merge, no production access, no readiness change. The supersession branch (`reconcile/gate-b-applied-bytes-20261014`) is invalid as built (it commits CRLF bytes now contradicted) and is not used here.

## 1. What the owner would be accepting
Exactly this and nothing else:

> The six RC filenames below are treated as satisfied in production by the listed ledger names, on the evidence in section 3, **although the exact bytes of the SQL that ran are not proven by any immutable receipt**.

| # | RC filename (LF bytes kept unchanged) | Production ledger name (id, UTC) |
|---|---|---|
| 1 | 0043_protocol_mediterranean_wave2.sql | 0044_protocol_mediterranean_wave2.sql (44, 2026-10-09 12:09:49) |
| 2 | 0044_doctor_discovery_candidates.sql | 0048_doctor_discovery_candidates.sql (48, 12:09:49) |
| 3 | 0045_discovery_signal_linkage.sql | 0046_discovery_signal_linkage.sql (46, 12:09:49) |
| 4 | 0045_doctor_source_proposals.sql | 0049_doctor_source_proposals.sql (49, 12:09:50) |
| 5 | 0046_doctor_knowledge.sql | 0047_doctor_knowledge.sql (47, 12:09:49) |
| 6 | 0046_doctor_profile_facts.sql | 0050_doctor_profile_facts.sql (50, 12:09:50) |

No file is renamed, rewritten or re-hashed; the RC LF bytes stay as committed. No SQL runs; the production ledger is not touched.

## 2. Why this is a policy exception, not a code fix
The readiness contract is exact-filename. Satisfying it for these six names by any mapping changes the acceptance policy ("independently established file hashes remain required", `MIGRATION-OPTION-B-DECISION-20261012.md`). It is therefore valid only as an explicit, signed owner exception, recorded as a narrow, immutable, per-file historical map that fails closed for every other name.

## 3. Evidence comparison
| Question | Evidence | Strength |
|---|---|---|
| Did the RC-named bytes exist before the apply? | Each RC blob was committed 2026-10-09 02:51–04:07 (+03), 8–12 h before the 12:09 UTC apply, and is unchanged since (Git history, all six) | Strong, lineage |
| Were the production files derived from them? | Production-named copies sit in `gcos-doctors-integration` with mtimes 04:48–04:50 (+03), minutes after those commits; executable tokens equal to the RC blobs in all six; two are byte-identical (`0046_discovery_signal_linkage`, `0047_doctor_knowledge`) | Strong, circumstantial |
| Did the apply run from that directory? | Wrangler debug logs `…12-09-20_053`, `…12-09-47_183`: cwd `gcos-doctors-integration`, per-file ✅ in the same window as ledger `applied_at` | Receipt of name, time and success only |
| Is the resulting schema identical? | A0: all 271 objects equal after normalization; raw stored DDL of the five DDL migrations' objects equals RC LF text; columns of all six effect tables match | Strong, effect-level |
| Data effects? | Only #1 has DML (6 INSERT … ON CONFLICT DO NOTHING). Seed row families, IDs and relationships verified present; four title/summary fields differ by post-seed runtime drift, not seed bytes | Strong, effect-level |
| Do the preserved CRLF copies match what ran? | **No.** Authorized probe (2026-10-14T20:46:32Z, one SELECT on `global-content-os` `c0ce92dc-…`, no table access, `changed_db false`) returned **n = 4**: the remote `/query` path preserves CRLF; production holds LF | Contradicts the CRLF copies only |
| Immutable apply receipt with SQL text or hash? | None found. Wrangler omits SQL; D1 keeps none; Git never contained the production names; the apply session transcript is not retained (only later reports); PowerShell history, RC and worktree logs searched | Absent |

Probe result does **not** establish EXACT_BYTES_PROVEN for anything. It removes the only scenario in which the CRLF copies could have been the applied bytes.

## 4. Four med-item content variances (not migration bytes)
| Record | Field | Seed (all repo versions) | Production now | Cause class |
|---|---|---|---|---|
| med-item-dga-2015 | title | English | "Amerikalılar için 2015-2020 Yönergesi: 4. EK (…Yemleme Biçimi)" | post-seed runtime write (drift) |
| med-item-dga-2015 | summary | English | "ABD HHS ve USDA, Americans'a … öneriyor." | same |
| med-item-predimed-2018 | title | English | "Kalp Damarı Hastalıklarının Önlenmesi … Fıstık Eti ile Takviyeli" | same |
| med-item-predimed-2018 | summary | English | "Mediterranean diyeti büyük kardiyovasküler olayları azalttı — …" | same, machine-translation artifact |

They do not depend on this decision. They are corrected by the guarded five-item correction (gate C) after live guards (gate D), which needs separate approval.

## 5. Quantified residual risk
| Dimension | Count / status |
|---|---|
| Mappings with exact-byte proof | 0 of 6 |
| Mappings with name-level execution receipt | 6 of 6 (name, time, success) |
| Mappings with verified schema/data effect | 6 of 6 (5 DDL by raw stored text and columns; 1 data seed by rows) |
| Mappings where preserved apply file is byte-identical to RC | 2 of 6 |
| Mappings where only comments/header differ from preserved copy | 4 of 6 |
| Executable statements known to differ from RC | 0 |
| Unobservable surface | comment/header text of six files |
| Production data at risk from the exception itself | none (no replay, no write) |
| Non-idempotent statements that must never run | `0045_discovery_signal_linkage` (3 ALTER ADD COLUMN) |

## 6. Scope, conditions, recovery
Exception scope: exactly the six rows in section 1, exact-filename readiness only, other missing names still fail closed.
Conditions for release integration: (1) signed immutable map file with RC blob hashes, production names, evidence references; (2) readiness accepts a name only when map entry **and** ledger counterpart both match; (3) tests prove any other missing or altered name fails closed; (4) full regression, typecheck, local D1 and release verification; (5) bundle re-hashed and manifest updated; (6) deploy only after separate gate D approval.
Monitoring: after deploy, `/ready` must report the six via the map and flag any ledger or schema drift; alert on any new unmapped missing name.
Recovery: revert the single integration commit; production unaffected; Worker rollback to `e1f82b14-…`; D1 Time Travel bookmark `00000563-00000006-00005104-e6aadb7e1ed8a73e5ab453ee71c12283`.

## 7. Alternatives
| Option | Consequence |
|---|---|
| Keep rejected, find a receipt | RC stays undeployable. Remaining unsearched: Cloudflare account audit log (timestamps, no SQL) and any off-machine copy of the 2026-10-09 apply session |
| Protection-only patch on live lineage | Not validatable: live artifact source linkage UNKNOWN (six candidate rebuilds, none matches 1,185,101 bytes) |
| Rename RC files to production names with CRLF bytes | Rejected, contradicted by the probe |
| Rename RC files to production names with LF bytes | Equivalent to the exception but asserts unknowable comment identity and rewrites lineage; not recommended over the explicit map |

## 8. Decision text
Recommended: approve only if no receipt can be recovered within the owner's time budget; the exception is narrow, effect-verified and reversible.

> I accept, for exact-filename readiness only, that the six listed RC migration names are satisfied by the listed production ledger names on the evidence in `2026-10-15-gate-b-option4-owner-risk-package.md`, with applied SQL bytes unproven. This does not authorize any migration, ledger change, deployment, credential action or Protocols correction.

Nothing is implemented before that approval.
