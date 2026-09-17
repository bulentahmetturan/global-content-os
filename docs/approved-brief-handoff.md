# approved_brief — sole Global Content OS → Channel Content OS link

Channel Content OS `/api/candidates` and job-review **must not** be used as a news inbox.
They remain the design/render/publish layer.

## Outbound (Global Hub → CCOS)

On Global Hub **Üretime Aktar** (`POST /api/triage` with `action: "promote"`):

1. Item moves to `production`
2. An immutable row is written to `approved_briefs`
3. Compact JSON is POSTed to `CCOS_HANDOFF_URL` (or stubbed when `CCOS_HANDOFF_STUB=true`)

Payload shape (`packages/contracts`):

```ts
{
  briefId, route, channelId,
  title, summary, gists[],
  canonicalUrl, publisher, publishedAt,
  dedupeKey, approvedAt, approvedBy,
  evidence?: { doi, pmid, pmcid, finding, limitation, studyType },
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

## Stub acceptance surface for CCOS

This slice does **not** change CCOS. Until CCOS adds a real ingest endpoint,
set `CCOS_HANDOFF_STUB=true` (default). Outbound briefs are logged in D1
(`approved_briefs.handoff_status = stubbed`, `handoff_log`).
