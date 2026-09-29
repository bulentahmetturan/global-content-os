# approved_brief — sole Global Content OS → Channel Content OS link

Channel Content OS `/api/candidates` and job-review **must not** be used as a news inbox.
They remain the design/render/publish layer.

## Outbound (Global Hub → CCOS)

On Global Hub **Üretime Aktar** (`POST /api/triage` with `action: "promote"`):

1. Item moves to `production`
2. An immutable row is written to `approved_briefs`
3. Compact JSON is POSTed to `CCOS_HANDOFF_URL` (or stubbed when `CCOS_HANDOFF_STUB=true`)

Payload shape (`packages/contracts`, contract version 1.0.0):

```ts
{
  contractVersion: '1.0.0',
  briefId, route, channelId,
  title, summary, gists[],
  canonicalUrl, publisher, publishedAt,
  dedupeKey, approvedAt, approvedBy,
  evidence: { doi, pmid, pmcid, finding, limitation, studyType } | null,
  sourceItemId
}
```

Never included: sibling pending items, raw feed blobs, RSS history, hold/trash queues.

## Inbound (CCOS → Global Hub)

`POST /api/handoff/status` with Bearer `STATUS_CALLBACK_TOKEN`:

```ts
{ briefId, status: 'accepted'|'designing'|'ready'|'published'|'failed', detail? }
```

Writes `production_status` + `handoff_log` only.

## Contract definition and versioning

Single canonical definition: [`packages/contracts/approved-brief.schema.json`](../packages/contracts/approved-brief.schema.json)
(`contractVersion` `1.0.0`, strict: unknown fields are rejected) with golden fixtures in
`packages/contracts/fixtures/`. The TypeScript `ApprovedBrief` type in `packages/contracts/src/index.ts`
must match it and the worker must not redeclare it — both enforced by
`packages/contracts/contracts.test.mjs`. `channel-content-os` vendors an identical copy of the schema and fixtures
(`mcp-server/src/handoff/contract/`) and its test fails if the copy drifts. Any payload change bumps the version.

## CCOS ingest surface (implemented, ADR-0004)

`channel-content-os` exposes `POST /api/handoff/approved-brief`:

- Auth: `Authorization: Bearer <HANDOFF_INGEST_TOKEN>` (CCOS secret; **unset = endpoint disabled, 503**).
  Set the same value here as `CCOS_HANDOFF_TOKEN`.
- Validates against the contract; raw feed fields / wrong version -> `400`.
- Idempotent by `briefId`: first accept `201`, identical resend `200 duplicate`, same `briefId` with a different
  payload `409` (approved briefs are immutable). No project for the channel -> `422`.
- Creates exactly one production job per brief; it is **not** a news inbox and stores no source history.
- Lifecycle callback: CCOS mirrors job progress (`accepted` -> `designing` -> `ready` -> `published` / `failed`) to
  `POST /api/handoff/status` here (`GCOS_STATUS_URL` + `GCOS_STATUS_TOKEN` on the CCOS side; the token equals this
  Worker's `STATUS_CALLBACK_TOKEN`). Callback delivery is best-effort and recorded in CCOS's intake ledger.
- If Cloudflare Access fronts the CCOS hostname, this Worker must call with an Access service token.

Going live (external steps): deploy CCOS with migration 040, set the secrets above on both Workers, then set
`CCOS_HANDOFF_URL=https://<ccos-host>/api/handoff/approved-brief` and `CCOS_HANDOFF_STUB=false` here.
Until then briefs stay `stubbed` in D1 (`approved_briefs.handoff_status = stubbed`, `handoff_log`).

`POST /api/handoff/status` fails closed: if `STATUS_CALLBACK_TOKEN` is unset it answers `503`, and it only accepts
the five contract statuses.
