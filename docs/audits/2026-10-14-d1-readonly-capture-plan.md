# Production D1 read-only evidence capture plan

Status: PLAN ONLY. Not executed. Remote mutations: 0. Requires explicit owner authorization (gate A0 below).
Candidate: `integration/gcos-final-rc-20261014`. Statements: `release/d1-readonly-capture.sql` (guarded by `release/test/d1-readonly-capture.test.mjs`).

## Identity (from `wrangler.toml`, `scripts/operator-bridge/config.mjs`, prior 2026-10-11 evidence)

| Item | Value |
|---|---|
| Account | `92fd1fe2237154079a0834121c33964b` |
| Content D1 (`DB`) | `global-content-os` `c0ce92dc-9842-4dd9-9d05-a8d09e798b34` |
| Stats D1 (`STATS_DB`) | `global-content-os-stats` `c67cfa1e-e508-4933-8a42-7684e32b5ec5` |
| Live version (last verified 2026-10-11) | `e1f82b14-95be-4041-8a20-fd4b7f468b0c`; rollback metadata `2a1876d4-...` |

Live state may have moved since 2026-10-11; the capture must re-read it first (metadata GETs only).

## Authentication — options (owner picks one; none enrolled today)

| Option | Mechanism | Credential exposure | Notes |
|---|---|---|---|
| 1 (recommended, zero secret handling by agents) | Owner runs the statements in the Cloudflare D1 Console and returns the result tables | None | Used for the 2026-10-12 duplicate-identity SELECT. Slowest per query, but statements are 8 per DB. |
| 2 | Installed Wrangler existing OAuth, read into process memory only, `WRANGLER_WRITE_LOGS=false`, `d1 execute --remote` with the file above | Existing token in memory, never printed or stored | Precedent: 2026-10-11 one-time authorization. Wrangler does not enforce read-only; safety rests on the guarded SQL file. |
| 3 | Operator bridge `CLOUDFLARE_READ` | Not available | Bridge reads only `/workers/` paths, not D1; alias not enrolled; isolation boundary decision still open. Do not extend without a separate approval. |

## Exact operations and safety classification

| ID | Operation | Class | Returns |
|---|---|---|---|
| M1 | `GET /accounts/{id}/workers/scripts/global-content-os/deployments` (before and after) | metadata read | active version bracket |
| M2 | `GET /accounts/{id}/d1/database/{db_id}` for both DBs | metadata read | name, version, table count, size |
| M3 | `GET /accounts/{id}/d1/database/{db_id}/time_travel/bookmark` | metadata read, non-mutating | current bookmark = rollback point, taken before any migration |
| R1 | `SELECT count(*) FROM d1_migrations` | read-only SELECT | integer |
| R2 | `SELECT id,name,applied_at FROM d1_migrations ORDER BY id` | read-only SELECT | ledger, filename+timestamp only |
| R3 | `SELECT type,name,tbl_name,sql FROM sqlite_master ...` | read-only SELECT on metadata | DDL text, no data rows |
| R4 | `PRAGMA table_info(<6 effect tables>)` | read-only PRAGMA | column definitions |
| S1 | R1–R3 against `STATS_DB` | read-only | same |

No `SELECT` touches `source_items` or any other application table. The `sql` column in R3 can be large; capture to a local file and keep only its SHA-256 and the names in reports.

## What this can and cannot establish

Establishable: current ledger names and timestamps; whether the six RC-only filenames are in `d1_migrations`; exact required-set delta against `schema-contract.ts`; current schema DDL versus what the RC migrations produce; the actual pending set by filename; a Time Travel bookmark for rollback.

Impossible from D1 alone (stays UNKNOWN until a receipt exists):
- **Applied SQL bytes.** `d1_migrations` stores name and timestamp only. A name match or schema match never proves byte identity. Prior search: 59 source artifacts, 0 proven applied bytes.
- Whether a differently named remote record (`0044_protocol_mediterranean_wave2.sql`, `0046_discovery_signal_linkage.sql`, etc.) held the same SQL.
- Provenance of the four changed `med-item-*` title/summary values.
- Writers active in the last 30 minutes, privileged D1 clients, drain capability, immutable source-to-artifact build receipt, OPS and Dossier alert root causes (need application credentials).

Option B therefore stays FAIL_CLOSED after this capture unless the owner supplies apply receipts or a separate, explicit risk decision. The capture narrows the pending set and unblocks an exact mutation plan; it does not by itself prove identity.

## Authorization gates (independent; one approval never covers another)

| Gate | Action | Needs |
|---|---|---|
| A0 | This read-only D1 + Cloudflare metadata capture | owner chooses option 1 or 2 |
| A | Credential enrollment (bridge aliases, broker) | owner decision on isolation boundary, then interactive hidden-input enrollment by owner |
| B | D1 migration apply | exact pending set from A0, per-file hashes, Time Travel bookmark, ledger-write plan, explicit owner approval |
| C | Protocols five-item protected corrections | live write protection deployed and verified, drain/fence evidence, fresh full snapshot for CAS, separate approval |
| D | Worker deployment | artifact-to-source linkage, rollback artifact, B satisfied where schema-dependent |
| E | Live smoke and acceptance | deployed version, read-only smoke matrix; OPS reads need application credentials |
