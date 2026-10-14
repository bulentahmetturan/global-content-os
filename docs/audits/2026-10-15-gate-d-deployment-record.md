# Gate D deployment record (2026-10-14 22:16 UTC)

Owner-approved single deployment of exactly one artifact. No migration, no secret change, no Protocols correction.

| Item | Value |
|---|---|
| Source commit | `2afa1467a5f716fce723d6c86bc89f14a34a0929` (`integration/gcos-gate-b-option4-20261015`) |
| Artifact | `index.js` 1,264,685 bytes, SHA-256 `cf679c4824308c18343330df0a050cfc7465e7998e8fe10802079698a44791a6` |
| Target | Worker `global-content-os`, account `92fd1fe2237154079a0834121c33964b` |
| Previous version (rollback) | `e1f82b14-95be-4041-8a20-fd4b7f468b0c` (deployment `115f092d-…`) |
| New version | `d8d0a853-c5f4-414a-aada-83430f37f24d` (deployment `08f6cef5-38eb-4d09-9e5e-2e1fa907d8ce`), 100% |
| Triggers | `* * * * *`, `*/5 * * * *`, `0 3 * * *` (unchanged) |
| D1 rollback point | Time Travel `0000056e-00000002-00005104-730ee7adf135dc9cdd0bc4e9754facb5` |

## Post-deploy verification (read-only)
- `GET /api/health` 200: commit `2afa1467…`, branch and `deployedAt` match.
- `GET /api/ready` 200 READY: `blocked []`, `degraded []`; appliedMigration `0050_doctor_profile_facts.sql`; content/Doctors/Discovery/Protocols/Dossier/statistics READY; six names reported under `mappedMigrations` with `mappedProvenance: HISTORICAL_BYTES_UNPROVEN_ACCEPTED_BY_OWNER`.
- `deploy-identity --live`: commit and branch match HEAD, readiness READY.
- Deployed module fetched back from Cloudflare: `index.js` SHA-256 equals the approved bundle hash (source-to-artifact linkage established for this version). Guard strings `protectedProtocolDisplay`, `APPROVED_PROTOCOL_OPERATOR_WRITER_REQUIRED` and the audit label are present in the live module.

Not verified here: behavior of guarded routes (needs operator token), cron execution results, live acceptance criteria (0/31).

## Second deployment (2026-10-14T23:53:51Z): Dossier ClinicalTrials cursor fix
Owner ran `wrangler deploy` in their terminal (permission layer blocks agent production writes). Source `4b8dbd330ad5cbc2d61b766014084cee32ac60ff` (code identical to `8f31cdb`); new version `435ed217-17bd-4722-8ad3-e94866f4af9e` (deployment `01e0784e-196f-4cc3-b81c-108cff0baf6b`) 100%; rollback target is the previous version of the secret-rotation deployments (code `cf679c48…`). Live module fetched back: `index.js` 1,265,136 bytes, SHA-256 `26668614983dc2c7fe4635642cc90b7d73f940f8da5544531dffa7c3c5aba6a5` = approved bundle. `/api/health` and `/api/ready` READY, commit stamped. Secrets `OPS_TOKEN` and `DOSSIER_OPS_READ_TOKEN` rotated by the owner earlier the same day (values never exposed).
