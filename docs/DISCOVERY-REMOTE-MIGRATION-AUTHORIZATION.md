# Discovery Remote Migration Authorization Package

STATUS: `READY_FOR_OWNER_AUTHORIZATION` (migration apply only ÔÇö Section G).
SCOPE: `migrations/0043_protocol_mediterranean_wave2.sql` ÔåÆ `migrations/0044_shared_discovery_kernel.sql`, remote D1 `global-content-os` only.
Branch: `discovery/canonical-delivery`. Package prepared read-only; **no remote write, deploy, activation, scheduler, or publish was performed or is authorized by this document.**

Migration authorization Ôëá deploy authorization Ôëá source activation Ôëá scheduler authorization (Section G).

## A. Decision summary

- **Authoritative remote ledger (read-only, 2026-10-09):** 43 applied rows, `migrations/0001_init.sql` ÔÇĞ `migrations/0042_protocol_dash_wave1.sql` **plus** dossier-track extras 0031_dossier_discovery_foundation.sql and 0043_dossier_discovery_foundation.sql. Remote is **not** at `0030` (that record is stale; see docs update below).
- **Exact pending chain (canonical, stage 1 of this package):** `migrations/0043_protocol_mediterranean_wave2.sql` ÔåÆ `migrations/0044_shared_discovery_kernel.sql` (wrangler-computed; dossier files are absent locally and untouched). Follow-on stage 2: `migrations/0045_discovery_signal_linkage.sql` ÔåÆ `migrations/0046_doctor_knowledge.sql` (current EXPECTED). Coordinated stage 3 (sibling rebases): `0047_doctor_discovery_candidates.sql` ÔåÆ `0048_doctor_source_proposals.sql` ÔåÆ `0049_doctor_profile_facts.sql` ÔåÆ `0050_protocol_ingestion_runs.sql` (see Section H).
- **Excluded:** `migrations/0045_discovery_signal_linkage.sql` ÔÇö uncommitted, unreviewed foreign-workstream file present in the tree. It is **not** part of this package; authorizing it requires its own review + commit first.
- **0031 reconciliation:** remote `actors`/`actor_aliases`/`actor_roles`/`actor_identity_refs`/`protocols`/`source_items` DDL hashes match the local files byte-for-byte (normalized): `bd952cf4/bd952cf4`, `cbabbb9f`, `52443f0e`, `eee69e52`, `6a395d53`, `00a64fbd`. No forward-reconciliation migration needed. The duplicate-number `0031_dossier_*` row coexists and does not alter these six definitions.
- **Numbering note:** remote `0043_dossier_*` vs local `0043_protocol_*` share a number but never collide mechanically (wrangler tracks full filenames). A sibling unmerged branch (`release/r2-live-0041`, commit `6faecd6`) renames another file to `0044_doctor_discovery_candidates.sql`; if both `0044_*` names ever apply remotely, `max(name)` stays `migrations/0044_shared_discovery_kernel.sql` (`'s' > 'd'`), so readiness semantics below are stable ÔÇö but the two tracks must coordinate before either merges.

## B. Evidence

- **Persistent local pilot** (isolated `.wrangler/discovery-pilot/pilot.sqlite`, backups `8FEEB90CÔÇĞCC` pre / `F97A3985ÔÇĞDD` post, integrity ok): full chain runÔåÆcandidateÔåÆadmissionÔåÆAPPROVE/MERGE_AS_ALIASÔåÆintentÔåÆassociationÔåÆingestÔåÆHub inboxÔåÆPRODUCTION_ACTIVE (Hub ingest/route milestone only; briefs 0).
- **Real fetch/parse:** USC faculty page (HTTP 200, title observed), Europe PMC JSON (Longo 796 hits/authorship; Med 3660 hits, 5 fresh DOIs), health.gov 302ÔåÆ302ÔåÆ302ÔåÆ301ÔåÆ200 chain to odphp final host; private-IP checks on every hop; 8 bounded items persisted, all inbox.
- **Idempotency:** retry pass deltas all zero (created 0/0, updated 3/3); restore-from-backup executed twice and verified.
- **Code gates:** `production:check` 0 FAIL 0 WARN (pytest 458/458); targeted discovery/doctor/protocol suites green; `git diff --check` clean.
- **Remote read-only inventory (metadata only, 8 bounded calls, no content bodies):** ledger list, 69-table inventory, 6 DDL hashes, 8 counts, 2 actor identities, index/trigger list, 0043-absence proof (`med_v/comp/items/claims/ev = 0/0/0/0/0`), 21 dossier tables present, 0 discovery tables.
- **Rehearsal (local, exact files):** 0001ÔÇô0042 base ÔåÆ 0043 (`v1/comp9/items2/claims3`) ÔåÆ 0044 (10 tables) ÔåÆ re-apply 0043 (success, zero delta ÔÇö all 6 INSERTs guarded) ÔåÆ re-apply 0044 (success ÔÇö all 25 CREATEs guarded) ÔåÆ half-state detection (`claims0`) ÔåÆ forward-fix by remaining sections only ÔåÆ complete, integrity ok.
- **Dialect:** `CREATE TRIGGER IF NOT EXISTS` confirmed in the SQLite grammar (sqlite.org) and executed on the local replay; residual D1-version risk is covered by abort-on-first-error (Section E).

## C. Exact migration plan

### 0043 ÔÇö Protocol Mediterranean wave-2 data (data-only, 7,774 bytes)

- SHA256: `85EE1C23FF3F1F73F315AA6F6AA68951BB6AEC0AA6E71E09BB4C9553745BBC9E`
- Delta: 6 INSERTs, zero DDL ÔÇö `protocol_versions` (+med-v1), `protocol_components` (+9), `source_items` (+med-item-dga-2015, +med-item-predimed-2018), `protocol_claims` (+3: `clm_med_definition`, mace, stroke), `protocol_evidence` (+2), `claim_evidence_links` (+2). All six carry `ON CONFLICT ÔÇĞ DO NOTHING` (verified by count 6/6; an early naive parse miscounted string-literal semicolons ÔÇö corrected by rehearsal).
- Preconditions: tables from 0033ÔÇô0040 present (remote hashes confirm); med identities absent (proven above).
- Risk: low. Re-apply is a safe no-op (rehearsed). Lock: milliseconds (8 rows).
- Verification: `med_v=1, med_comp=9, med_items=2, med_claims=3`, `PRAGMA integrity_check=ok`, ledger row present.
- Recovery: FORWARD-FIX ONLY for partial states (apply remaining sections by identity, as rehearsed); full re-run also safe. No compensating DELETE is pre-authorized; the exact compensating draft (targets only the 8 identities above, no broad deletes) is held by the operator on request ÔÇö not executed here.

### 0044 ÔÇö Shared discovery kernel (DDL-only, 10,366 bytes)

- SHA256: `FF320FAD1B79791BE2F10735BCD629CF24B84A23579C4FFF22CE1F4F01EC4CE7`
- Delta: 25 guarded CREATEs, zero DML ÔÇö 10 tables (`discovery_runs`, `candidate_ledger`, `evidence_ledger`, `discovery_alias_dedupe`, `decision_ledger`, `wave_metrics`, `onboarding_intents`, `onboarding_intent_sources`, `onboarding_source_events`, `discovery_cross_feed_signals`), 6 indexes, 9 triggers (state-transition + append-only + immutability). Zero ALTER/DROP. No name collides with the 69 remote tables (verified absent) or the 21 dossier tables.
- Preconditions: 0043 applied (definition claim linkage target `clm_med_definition` exists); actors/protocols present.
- Risk: low. Empty-table creation; no data rewrite; re-apply is a guarded no-op (rehearsed). Old Worker keeps running (additive tables ignored; `SCHEMA_BEHIND` only fires when applied < EXPECTED ÔÇö string compare, so 0044-ahead does not block the old Worker). New (Discovery) Worker on pre-0044 schema reports `SCHEMA_BEHIND` BLOCKED ÔÇö fail-closed by design (`EXPECTED_SCHEMA_MIGRATION='0044_shared_discovery_kernel.sql'`).
- Verification: 10/10 tables, 6 indexes, 9 triggers, readiness max-name `migrations/0044_shared_discovery_kernel.sql`, integrity ok.
- Recovery: FORWARD-FIX ONLY. Never DROP-based rollback (would destroy pilot-compatible rows). If the kernel must be retired, leave tables unused and forward-fix; data loss via DROP is explicitly not authorized.

### Order and compatibility

```text
remote(0042 + dossier extras)
ÔåÆ preflight (Section D.1)
ÔåÆ 0043 (data) ÔåÆ verify med counts
ÔåÆ 0044 (DDL) ÔåÆ verify 10 tables + readiness max-name
ÔåÆ post-verify (Section D.3)
ÔåÆ STOP ÔÇö deploy is a separate authorization (Section G)
```

## D. Operation commands

### D.1 PREFLIGHT ÔÇö READ ONLY (authorized now)

```bash
npx wrangler d1 migrations list global-content-os --remote
npx wrangler d1 execute global-content-os --remote --command "SELECT name FROM d1_migrations ORDER BY name" --json
npx wrangler d1 execute global-content-os --remote --command "SELECT (SELECT COUNT(*) FROM protocol_versions WHERE version_id='med-v1') AS med_v, (SELECT COUNT(*) FROM source_items WHERE id IN ('med-item-dga-2015','med-item-predimed-2018')) AS med_items, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND (name LIKE 'discovery_%' OR name IN ('candidate_ledger','decision_ledger','evidence_ledger','wave_metrics','onboarding_intents','onboarding_intent_sources','onboarding_source_events'))) AS disc_tables" --json
```

Proceed only if: ledger max is 0043_dossier_discovery_foundation.sql, `med_v=0`, `med_items=0`, `disc_tables=0`, and local file hashes match Section C.

### D.2 APPLY ÔÇö REQUIRES OWNER AUTHORIZATION (do NOT run from this document)

```bash
npx wrangler d1 migrations apply global-content-os --remote
```

Single command applies exactly the wrangler-computed pending set. Abort (Section E) on any deviation. Keep the `0045_*` and `0046_*` files out of `migrations/` (move aside, do not delete) before running, or they will apply unreviewed under this package's name. A follow-on package must scope 0045ÔåÆ0046 (with the then-current EXPECTED) before the current Worker reports READY.

### D.3 VERIFY ÔÇö READ ONLY (authorized after apply)

Same queries as D.1 plus: med counts `v=1/comp=9/items=2/claims=3`, 10 discovery tables present, `PRAGMA integrity_check`, and the application health/readiness endpoint showing the expected schema name.

## E. Abort conditions

1. Remote ledger max is not 0043_dossier_discovery_foundation.sql (drift).
2. Local file SHA256 mismatch vs Section C.
3. `med_v/med_items` non-zero before apply (unexpected seed identity).
4. Any `disc_tables` non-zero before apply.
5. Unexpected table/column in the apply dry output.
6. Backup/export failure before apply.
7. Non-zero unexpected row delta after apply.
8. Integrity or readiness failure after apply.
9. Concurrent deploy/write detected during the window.
10. Missing owner authorization for D.2 (this document authorizes preflight/verify only).
11. Wrangler-computed pending set differs from the assumed shape (0043-med ÔåÆ 0044-kernel ÔåÆ 0045-signal ÔåÆ 0046-knowledge with only the first two in scope) ÔÇö e.g. a new unknown migration appeared.

## F. Recovery

- **Restore:** Cloudflare D1 has no in-place downgrade for applied migrations; the pre-apply export/backup is the restore point (method + timestamp recorded at apply time by the operator). Restore = operator-run recreate-from-backup; pilot-proven procedure pattern: copy-back + `integrity_check` + ledger/count verification.
- **0043 partial:** forward-fix by remaining section identities (rehearsed ┬ğB); full re-run is also safe (all guarded).
- **0044 partial:** re-run safe (all guarded); never DROP.
- **Escalation:** any abort ÔåÆ stop, preserve ledger/schema/count snapshots, notify owner; no forward-fix without a second explicit authorization.

## H. Canonical namespace (reconciliation, 2026-10-09)

Remote-applied `0043_dossier_discovery_foundation.sql` is immutable. Every number below belongs to exactly one canonical file; same-number/different-content copies living on sibling branches are renamed on rebase (never duplicated). Mediterranean data, Discovery DDL, and Doctor knowledge stay separate responsibilities.

| Numara | Canonical dosya | Workstream | Durum | ─░├ğerik kimli─şi (blob) |
|---|---|---|---|---|
| 0043 | 0043_dossier_discovery_foundation.sql | dossier | APPLIED / IMMUTABLE (remote) | remote ledger |
| 0043 | `migrations/0043_protocol_mediterranean_wave2.sql` | discovery/protocol | PENDING (bu paket, stage 1; numara dossier ile payla┼ş─▒l─▒r, dosya ad─▒ farkl─▒ ÔÇö wrangler dosya ad─▒yla izler, ├ğak─▒┼şma yok) | `681290b5` |
| 0044 | `migrations/0044_shared_discovery_kernel.sql` | discovery | PENDING (bu paket, stage 1) | `c4c2d1a3` |
| 0045 | `migrations/0045_discovery_signal_linkage.sql` | discovery/signal | PENDING (follow-on, stage 2) | `f046caf1` |
| 0046 | `migrations/0046_doctor_knowledge.sql` | doctor | PENDING (follow-on, stage 2; current EXPECTED) | `eb1138ce` |
| 0047 | 0047_doctor_discovery_candidates.sql | doctor-B | PROPOSED (rename from `release/r2-live-0041` 0044, standalone, no FK) | `2b5c3c69` |
| 0048 | 0048_doctor_source_proposals.sql | doctor-B | PROPOSED (rename from r2-0045; FK ÔåÆ 0047) | `5408e475` |
| 0049 | 0049_doctor_profile_facts.sql | doctor-B | PROPOSED (rename from r2-0046; FK ÔåÆ actors only) | `a252b549` |
| 0050 | 0050_protocol_ingestion_runs.sql | ingestion | PROPOSED (rename from ingest-0045; FK ÔåÆ protocols + candidate_ledger, requires 0044) | `fa3db179` |

Dependency order: 0043-med ÔåÆ 0044-kernel ÔåÆ 0045-signal (ALTERs kernel table); 0046-knowledge needs actors only; 0047 standalone; 0048 needs 0047; 0049 needs actors; 0050 needs 0044-kernel. No table-name overlap across any of the eight files (verified by object inventory).

No renames were needed on this branch: local 0043ÔÇô0046 already are the canonical names (renaming would churn pilot ledger continuity, EXPECTED adjacency, and rehearsed evidence with zero mechanical benefit ÔÇö wrangler tracks full filenames, so number-sharing with dossier names never collides on apply). The ingestion branch's 0043/0044 copies are SQL-identical to canonical modulo comments (verified: zero non-comment diff on 0043; identical 10-table/6-index/9-trigger inventory on 0044) ÔÇö that branch adopts the canonical files verbatim on rebase.

Staged rollout: stage 1 = 0043-med ÔåÆ 0044-kernel (this package); stage 2 = 0045 ÔåÆ 0046 (follow-on package, after which current EXPECTED is satisfied); stage 3 = 0047 ÔåÆ 0050 (coordinated rebases, then a worker EXPECTED bump to 0050). Ahead-schema never blocks (string compare), so stages compose safely.

Merge order: (1) this namespace state (guardrail + manifest), (2) sibling workstreams rebase with the renames above, (3) readiness pin follows the newest file, (4) authorization package re-issued per stage, (5) owner apply decision. Canonical allocation going forward: new migration numbers are taken in order after the current max; a second file with a taken number fails the production gate (duplicate-prefix + manifest checks, ┬ğ7 of `scripts/production-check.mjs`).

```canonical-migrations
migrations/0043_protocol_mediterranean_wave2.sql
migrations/0044_shared_discovery_kernel.sql
migrations/0045_discovery_signal_linkage.sql
migrations/0046_doctor_knowledge.sql
```

## G. Authorization boxes

```text
[x] AUTHORIZE REMOTE MIGRATION PREFLIGHT (read-only; executed for this package)
[ ] AUTHORIZE REMOTE MIGRATION APPLY
[ ] AUTHORIZE POST-MIGRATION VERIFICATION
[ ] AUTHORIZE WORKER DEPLOY
[ ] AUTHORIZE CONTROLLED PRODUCTION CANARY
[ ] AUTHORIZE SOURCE ACTIVATION
[ ] AUTHORIZE DISCOVERY SCHEDULER
```

Only the first box is exercised. All others require separate owner decisions.
