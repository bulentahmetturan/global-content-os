# Protocols Final Operation Gate

Status: BLOCKED_OWNER / LIVE_PROTECTION_UNVERIFIED. Scientific approval already granted. No production SQL, writes, deployment, migrations, activation or V3 acceptance performed.

## Exact Scope

Content D1 global-content-os, c0ce92dc-9842-4dd9-9d05-a8d09e798b34. Only dash-item-booklet, dash-item-sodium-2001, dash-item-trial-1997, med-item-dga-2015 and med-item-predimed-2018; only title, summary and gists_json. Exact approved new values and every old field/hash remain in release/protocols/five-item-correction.json, core SHA256 e9cbf5796d25aae10b66ade0c1838035fa7b0d08b074d1aedef49c36aafe582a. No scientific values changed in this gate. Gists share the same row and transaction. All other fields and all relationships remain unchanged.

## Transport Evidence

One authorized metadata-only Wrangler d1 info call succeeded on 2026-10-11; evidence .logs/protocols-final-gate-identity.json and stderr.log. Name and UUID exactly match; read replication disabled. This proves current metadata access, not production mutation permission. The 24-hour write counters are existing database traffic, NOT writes by this task. No SQL was executed. Prior 13 bounded SELECT receipts independently prove historical read transport, not future write approval. Credentials were neither read nor exposed.

## Overwrite Inventory

| Path | Local protection | Live protection |
| --- | --- | --- |
| localize/enrich.ts, via /api/enrich, /api/localize and cron | Static five-ID guard before AI/write | UNKNOWN |
| localize/backfill.ts legacy callable writer | Static five-ID exclusion | UNKNOWN; live invocation not established |
| db/queries.ts upsert, raw/localized ingress | Existing protected-ID branch | UNKNOWN |
| /api/localize/apply in index.ts | New whole-request 409 before any batch write | UNKNOWN |
| localize-hub-node.mjs / localize-fda-fast.mjs | Clients use the guarded route after deployment | UNKNOWN |
| Privileged D1, CI or operator SQL | Not enforceable by Worker guards | Exclusive operator window required |

The disabled shared feed is not overwrite protection: cron and manual routes remain independently callable. No feed activation is proposed. The manual endpoint previously bypassed protection and is not the correction transport.

The safe-writer commit is an ancestor of this isolated integration branch. Original RC, scientific-finalization and safe-writer branch pointers remain unchanged. New runtime delta is one import plus four guard lines; no bindings, cron, auth map, migrations or config change. Deploying those guards requires separate owner authorization for the exact integrated Worker artifact, not approval inferred from scientific text acceptance.

Before correction, independently establish 100% traffic on a protected artifact, no old-version/queued/in-flight writer capable of subsequent overwrite, and exclusive privileged writer coordination. There is no proven drain duration; do not invent one. No configuration-only freeze has been demonstrated. A database-trigger alternative would need separate schema authorization and review of the writer's exact trigger gate; do not add one or bypass that gate here.

## Future Operator Package

Run from the integration checkout only AFTER separate bounded-read authorization and live protection certification. Each raw receipt must be retained with operator identity, command, UTC start/end and hashes; supplied JSON is not authenticated evidence by itself. Stop on authentication/identity mismatch, truncation, missing read metrics, changed_db=true or rows_written!=0. Apply a 30-second process timeout and bounded output capture as in the prior operator executor; do not retry a failed auth path.

```powershell
node node_modules/wrangler/bin/wrangler.js d1 info global-content-os --config wrangler.toml --json > .logs/protocol-operation-identity.json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --config wrangler.toml --remote --command "SELECT * FROM source_items WHERE id IN ('dash-item-booklet','dash-item-sodium-2001','dash-item-trial-1997','med-item-dga-2015','med-item-predimed-2018') ORDER BY id LIMIT 6" --json > .logs/protocol-operation-rows.json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --config wrangler.toml --remote --command "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='source_items' AND type IN ('table','trigger','index') ORDER BY type,name LIMIT 65" --json > .logs/protocol-operation-metadata.json
node scripts/prepare-protocol-operation.mjs .logs/protocol-operation-identity.json .logs/protocol-operation-rows.json .logs/protocol-operation-metadata.json .logs/protocol-operation
```

The compiler is local-only. Missing/unsafe metadata, stale historical fields or unsafe receipts abort; it never rebases approved old hashes. Complete fresh columns and exact schema are compared atomically inside the single materialized guarded UPDATE. A SELECT then UPDATE is not itself atomic; this execution-time predicate closes that race. No snapshot means no executable candidate, not a guessed pending operation.

Review generated operation.json and exact apply.sql hash, durable preflight intent, and actual transport limits BEFORE granting the operation. The bare command below is an execution primitive, NOT an enforced approval wrapper. It is NOT authorized to run now:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --config wrangler.toml --remote --file .logs/protocol-operation/apply.sql --json > .logs/protocol-operation/apply-result.json
node node_modules/wrangler/bin/wrangler.js d1 execute global-content-os --config wrangler.toml --remote --file .logs/protocol-operation/readback.sql --json > .logs/protocol-operation/readback-result.json
```

Required result: five exact RETURNING identities and complete expected rows, then independent complete readback; no unrelated column difference. Expected first correction 5 records / 15 eligible fields, replay 0 records. Missing execution counters remain UNKNOWN, not invented. Zero returned rows is conflict unless a full readback proves all desired values and preserved metadata. Network timeout leaves outcome UNKNOWN; STOP, do not blindly retry. Full desired state is an idempotent replay, not permission to issue another mutation.

Rollback is separately authorized and uses the reverse all-five CAS against the exact complete post-image, restoring only the three fields. The generated rollback.sql is valid only for that complete post-image; changed intervening values yield zero rows. Obtain fresh readback and regenerate/review reverse guards using correctionStatement before any recovery operation. Never force rollback over owner edits. Actual local D1 apply/rollback atomicity evidence remains the verified cb9 baseline; this task did not repeat that rehearsal.

## Local Gate Evidence

107 writer/manual-route/auth/cron tests plus 2 plan-only tests passed, zero skips/failures; TypeScript passed. Logs: .logs/protocols-final-gate-targeted.log, plan-tests.log and typecheck.log (all prefixed protocols-final-gate-). The former 1848 Node / 458 Python full gate is historical cb9 evidence; it is NOT recertification of this new runtime guard. A fresh mandatory full production check and exact artifact review are required before separately authorized Worker deployment. No live overwrite certification or production correction is claimed.

Next minimum action: owner authorizes a bounded protection deployment/evidence scope (including current artifact, traffic and drain proof), or selects a separately reviewed non-deployment freeze mechanism. Scientific approval is not requested again. Exact five-item write authorization follows only after protection and fresh evidence gates pass.
