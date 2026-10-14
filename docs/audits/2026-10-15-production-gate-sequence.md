# Production gate sequence and dependencies (RC `integration/gcos-final-rc-20261014`)

Local analysis only. Remote mutations: 0. No gate below is executed or authorized by this document.

## Facts that fix the order
1. **No SQL migration is needed.** A0 showed production DDL equals the RC replay. The only Gate B gap is the exact-filename readiness contract: six RC names are absent from the ledger. Executing SQL is neither required nor safe (non-idempotent ALTER in `0045_discovery_signal_linkage`).
2. **The RC Worker would report not-ready** against the live ledger until Gate B is decided (supersession branch `reconcile/gate-b-applied-bytes-20261014`, held separate; its preserved-bytes premise is contradicted for 5 CRLF files).
3. **Live guards are absent** from the deployed artifact (2026-10-11 analysis), so the protected Protocols correction (C) cannot be safely executed before a Worker deploy (D). Order for these two is therefore **D before C**, despite the lettering.
4. **Source-to-artifact linkage of the live Worker is UNKNOWN.** Local rebuilds of 7b61870, 19cbd34, c5758e2, e20a0b3, cdddb04 and b6d72db produce 1,085,157 / 1,255,592 / 1,262,841 / 1,085,157 / 1,039,981 / 1,246,422 bytes; the live module is 1,185,101 bytes (`0e1e6f1b…`). None matches. A "protection-only patch on the live lineage" therefore cannot be validated against live source, which argues for deploying the full RC after Gate B.
5. The RC bundle is reproducible: two builds give `61aed30a…d906` (1,263,420 bytes).

## Dependency graph
```
A credentials (CLOUDFLARE_READ, GCOS_OPS_READ, DOSSIER_OPS_READ)   ── needed for E reads and operator evidence; independent of B/D
B ledger/readiness decision (no SQL)  ──►  D Worker deploy (full RC)  ──►  C five-item correction  ──►  E live acceptance
                                           │ needs: rollback version e1f82b14 retained; fresh Time Travel bookmark; D1 write-fence evidence
E read-only subset (public health/ready, OPS reads with A) can start after D; consequential E checks need separate approval
```

## Per-gate packet
| Gate | Exact action | Target | Preconditions | Rollback | Evidence |
|---|---|---|---|---|---|
| A | Owner enrolls three aliases via `credential-store.ps1 -Mode Enroll` under the operator identity after the isolation decision | Windows Credential Manager (operator) | broker isolation PASS (bounded unauthorized-SID probe) | delete alias | `operator_credential_status` presence only |
| B | Owner decision on how readiness treats the six names (options in the supersession result doc); no SQL, no ledger write | repo authority files only | none | revert commit | readiness against captured ledger lists 0 missing |
| D | `wrangler deploy` of the exact RC commit, rebuilt and re-hashed at deploy time | Worker `global-content-os`, account `92fd1fe2…` | B decided; tests + typecheck green on that commit; bundle hash recorded | redeploy version `e1f82b14-…`; D1 untouched | `/health`, `/ready`, version id, bundle hash |
| C | Protocols five-item writer (`scripts/protocols-five-item-writer.mjs`) | D1 `c0ce92dc-…`, exactly 5 `source_items` rows | D done and guards verified live; no active writers; fresh full snapshot; Time Travel bookmark | guarded reverse CAS in same tool; Time Travel restore | audit intent row, readback of 5 rows |
| E | 25 acceptance checks (6 Doctors, 6 Discovery, 6 Dossier, 7 Statistics) | live Worker | D (and A for token-gated reads) | n/a (read-only) | per-check PASS/FAIL/BLOCKED/UNKNOWN with version and UTC |

## Broker update: required before enrollment?
Changes in source since the installed binary (2026-10-13 02:00): lifecycle diagnostics NDJSON (codes only, 256 KiB cap), in-broker startup self-probe that records `IPC_CALLER_DENIED`, image path/ACL/hash self-check, redacted credential-store failure causes, fixtures. No change to the credential or IPC authorization paths themselves.
- **Not required for security of enrollment**: the installed, approved-package-hash binary (`b0b64c80…5d0c`) already enforces SID/ACL/hash checks.
- **Needed only for** built-in denial evidence and crash diagnostics. The same denial evidence can be obtained from the running binary with one bounded `runas` probe as the second identity, which requires the operator password (owner action).
- A native update means an administrator-owned, pinned-hash install; builds are non-deterministic, so the package hash must be fixed at packaging time and compared to the installed copy. Not performed.
