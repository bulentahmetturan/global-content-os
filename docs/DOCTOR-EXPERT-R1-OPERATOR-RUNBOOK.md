# R1 Operator Runbook — Doctor activation control plane

Scope: `POST /api/ops/doctor-activation` + `GET /api/ops/doctor-audit`
under the existing `OPS_TOKEN` trust boundary. Audit-only: no fetch,
parser, ingestion, items, editorial output, scheduler, or polling.
No production secrets are recorded here.

## Auth (existing convention)

```
Authorization: Bearer <OPS_TOKEN>
```

- Unset `OPS_TOKEN` → `503 OPS_TOKEN_NOT_CONFIGURED` (fail closed).
- Missing/wrong token → `401 UNAUTHORIZED` (constant-time compare).
- Never log the token or the Authorization header.

## ACTIVATE

```
POST /api/ops/doctor-activation
Content-Type: application/json

{
  "associationId": "assoc_<id>",
  "action": "activate",
  "reason": "<operator reason, 8-500 chars>",
  "evidence": {
    "supportedType": true,
    "reachable": true,
    "authorized": true,
    "parseable": true
  }
}
```

Expected `200`:

```json
{
  "ok": true, "action": "activate", "associationId": "assoc_...",
  "previousStatus": null, "resultingStatus": "INGESTABLE",
  "alreadyInState": false, "mutated": true,
  "evaluationId": "eval_...", "activityId": "act_...",
  "reasonCode": "NONE", "evaluatedAt": "..."
}
```

`evidence` is optional; empty evidence derives UNKNOWN and the call is
refused with `422 ACTIVATION_REFUSED` (verification alone never activates).
Every successful call appends one evaluation + one activity row, including
repeats (`alreadyInState: true` flags them; nothing is silently skipped).

## VERIFY

```
GET /api/ops/doctor-audit?associationId=assoc_<id>
```

Returns the bundle: association, endpoint, actor, activities,
ingestabilityHistory, latestIngestability. Confirm `latestIngestability`
carries your `evaluationId` and a `CONTROLLED_ACTIVATION:` reason.

## DISABLE

Same POST shape with `"action": "disable"` and NO `evidence` field
(evidence on disable is rejected as `INVALID_BODY`):

```json
{ "associationId": "assoc_...", "action": "disable", "reason": "<why>" }
```

Expected `200` with `resultingStatus: "NOT_INGESTABLE"`.

## VERIFY HISTORY

GET the audit bundle again: history must contain all evaluations in order
(activation first, deactivation last), `latestIngestability` must be the
deactivation, and prior rows must be byte-identical to before.

## Failure interpretation

| Code | Meaning | Safe retry |
|---|---|---|
| 401 | bad/missing token | fix header, retry as new explicit act |
| 503 | OPS_TOKEN unset server-side | do not retry; configure secret, redeploy |
| 400 INVALID_BODY | shape/reason/evidence violation | fix body, retry |
| 400 UNSUPPORTED_ACTION | action not activate/disable | fix action, retry |
| 404 UNKNOWN_ASSOCIATION | id unknown | do not retry; resolve the association first |
| 422 ACTIVATION_REFUSED | evidence derives non-ingestible | do not retry blindly; resolve the blocker, then retry as new act |
| 500 | storage failure | inspect; append-only triggers mean no partial activation state exists without its rows — re-read the bundle before acting |

Rejections write nothing (proven: table counts identical before/after every
rejection path). There are no generic retries on this endpoint; every retry
is a deliberate operator act and is recorded as one.

## Emergency disable procedure

POST `disable` with reason `emergency disable: <cause>`. One call flips
current state; history is preserved. Verify via the audit bundle. No delete
path exists anywhere, so nothing can be lost by disabling.
