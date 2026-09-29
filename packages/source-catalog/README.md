# @global-content-os/source-catalog

Canonical, PRE_APPROVAL source truth of global-content-os (Package 2). Nothing here is post-approval.

## Editable inputs (the ONLY editable copies)

| File | Fact |
| --- | --- |
| `data/news-registry.json` | news publishers, sources, monitored targets, reference resources, superseded/excluded |
| `data/research-sources.json` | research source registry (incl. 7 R4 records: `enabled=false`, `PENDING_EXPLICIT_DECISION`) |
| `data/kaduse-subscriptions.json` | Kaduse news subscriptions + acquisition scoping (moved from multi_channel_design) |

`src/**/*-registry.ts` are typed loaders/validators over the JSON, not a second registry.
`config/feeds.json` is GENERATED from these inputs by `scripts/sync-feeds.mjs` (see its `provenance`); never edit it.

## Module status (actual importers, verified 2026-09-29)

| Module | Status |
| --- | --- |
| `news/global-source-registry.ts`, `research/source-registry.ts`, `research/research-pool.ts` (eligibility + RETRACTED gate) | ACTIVE source-side (registry loaders used by tests/generator inputs; pool logic pure) |
| `research/attention-signals.ts`, `research/age-tier-classification.ts`, `news/delivery-handoff.ts` | LEGACY/UNWIRED: no runtime importer. Source-side semantics, so they stay here; they hold no registry data, so they are not a second source truth. Wire or delete in a later package with evidence. |
| post-approval claim routing (`validateClaim`, peer-review label, evidence status) | NOT HERE: `channel-content-os/mcp-server/src/research/claim-routing.ts` |

## Safety invariant

HTTP 200 != automation ready. A source is automation-ready only if configured -> fetch -> parse -> URL/title/content gates ->
audience/relevance gates -> freshness -> valid candidate is demonstrated (see `adapters/hekimler-radar` `runtime_activation`,
`fetch_enabled`, `scheduled_fetch_enabled`, `candidate_emission_enabled`). This catalog cannot bypass it: catalog membership
never enables fetching. Example: `abroad_uk_gmc` is `MANUAL_INTAKE` (real GMC site WAF-blocked; UKVI/DHSC substitute is labelled as such;
`blocked_primary_source_url` records the intended endpoint).
