# A2 credential plan (2026-10-15) — values UNKNOWN, nothing created or rotated

## Audit result (no secret value read or printed)
| Store | Result |
|---|---|
| Wrangler OAuth (`%APPDATA%\xdg.config\.wrangler\config\default.toml`) | valid refresh token; scopes include `workers_scripts:write`, `d1:write`, `secrets_store:write`, `workers_kv:write`, … (write-capable) |
| Windows Credential Manager (W11) | no target matching gcos / cloudflare / ops / dossier / wrangler |
| Environment variable names | none matching CLOUDFLARE / OPS_TOKEN / DOSSIER / GCOS / CF_API |
| PowerShell history | no `secret put`, `OPS_TOKEN`, `DOSSIER_OPS` |
| `.dev.vars` (only `global-content-os`) | keys `CCOS_HANDOFF_STUB`, `STATUS_CALLBACK_TOKEN`, `TIP_RADAR_INGEST_TOKEN`; no OPS keys |
| Repository `.github` | no workflow consumes `OPS_TOKEN` or `DOSSIER_OPS_*` |

Worker secrets are write-only in Cloudflare: existing `OPS_TOKEN` and `DOSSIER_OPS_READ_TOKEN` cannot be read back. Existing production tokens are not assumed broken; their values are simply not available to us. Classification: all three aliases UNKNOWN (not ABSENT).

## Rules kept
1. Do not overwrite, delete or rotate the current Worker secrets now.
2. Wrangler OAuth is not enrolled as `CLOUDFLARE_READ` (write scopes would hand agents write power).
3. No secret value in chat, arguments, environment, files or logs; enrollment only through the installed `credential-store.ps1 -Mode Enroll -Alias <ALIAS>` under the operator identity with hidden input (requires one more owner-authenticated `runas`).

## Per alias
| Alias | Need | Options |
|---|---|---|
| CLOUDFLARE_READ | Worker version/deployment metadata only (`/accounts/{id}/workers/…`) | (a) skip: the same reads run through Wrangler under explicit owner authorization (done for A0). (b) new account-scoped read-only API token: dashboard.cloudflare.com → My Profile → API Tokens → Create Token → Create Custom Token; permission *Account · Workers Scripts · Read*; resource *Account → this account only* (`92fd1fe2…`); optional TTL/IP filter; then enroll under the operator identity |
| GCOS_OPS_READ | Bearer for `/api/ops/summary` etc. | existing `OPS_TOKEN` value from owner's records; else rotation (below) |
| DOSSIER_OPS_READ | Bearer for `/api/dossier/ops/*` | existing `DOSSIER_OPS_READ_TOKEN` value from owner's records; else rotation (below) |

## If a value cannot be recovered: rotation plan (prepared, NOT authorized, NOT executed)
- Effects: `wrangler secret put` creates a new Worker version. It would add a second deployment unless executed as part of the one authorized deployment window, so it needs its own explicit authorization and ordering relative to gate D.
- Constraints from code: `OPS_TOKEN` must differ from `DISCOVERY_EXECUTOR_TOKEN` and from the Dossier owner/executor tokens (reused tokens → 503); `DOSSIER_OPS_READ_TOKEN` is distinct from `OPS_TOKEN` and `DOSSIER_OPS_WRITE_TOKEN`.
- Known consumers: none found in `.github`; operator endpoints are manual-use, so rotation breaks only callers who already lack the value. Unknown external consumers must be confirmed by the owner before rotation.
- Sequence: generate new values in the owner's secure vault; owner enters them via `wrangler secret put <NAME>` hidden prompt (agent never sees them); verify `/api/ops/summary` 401 without token, 200 with; enroll the same values as aliases; record version id. Rollback: re-put the previous value if it exists in vault; otherwise endpoint stays token-gated (fail-closed 503/401).

## Fallback for live acceptance without OPS tokens
Gate E read checks via Wrangler SELECT-only bounded D1 queries and public `health`/`ready`; OPS-API-only criteria stay BLOCKED until a token exists. Query set to be approved before use.
