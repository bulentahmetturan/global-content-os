# Gate A1 — unauthorized-caller probe result (2026-10-15)

One owner-authenticated attempt (password pasted by the owner into the Windows `runas` console; never seen, stored or logged by the agent). Two earlier attempts failed before execution: error 1734 (command too long, 989 chars) and error 1326 (password rejected when typed). Launcher fix: `scripts/operator-bridge/start-unauthorized-probe-short.ps1` (RC 8f5c985): same reviewed probe `4f2592c8…4d11`, same in-memory hash check, 422-character command.

| Item | Observed |
|---|---|
| Probe identity | caller SID `…-1006` (gcos-operator), not the authorized client `…-1000` |
| Probe bytes | staged file SHA-256 `4f2592c8fd7fe7058e26abaceb457695ca5be2fb44127669a9d9889b4c804d11` = expected |
| Result | `PASS_DENIED`, evidence `BROKER_AUDIT_REJECTION`, transport `IPC_DISCONNECTED`, audit UTC 2026-10-14T22:00:47.679Z (inside the probe window) |
| Server identity | pid 26492, path-verified as the installed broker |
| Broker health after probe | alive, responding, start time unchanged (20:43:51) |
| Authorized IPC after probe | `operator_credential_status` via the authorized client returned `identityVerified`, `profileVerified`, `protectedBundleVerified` true; isolation flags true |
| Production operations | 0 |
| Credentials enrolled | CLOUDFLARE_READ false, GCOS_OPS_READ false, DOSSIER_OPS_READ false |

Interpretation: the denial is established by a broker-side audit rejection record read by the probe, not by a bare disconnect. Limits: `result.json` lives in a user-writable Public directory, so its integrity is supported (staged hash, timing matches the new logon at 01:00:45, broker alive) but not independently provable by the unprivileged user; the audit file itself is private to the operator. The probe caller is the operator identity, which is by design a non-authorized client SID.

Gate A1: PASS (probe-reported, audit-backed). Gate A2 (credential enrollment) is separate and not started.
