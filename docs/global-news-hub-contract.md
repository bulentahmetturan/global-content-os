# Global News Hub Contract

> **Relocated (2026-09-29, ADR-0004).** This contract was written when the Global News Hub was assigned to `channel-content-os`. The Hub, the source registry and every other source-monitoring concern are now owned by **this repo (`global-content-os`)**. `channel-content-os` only consumes `approved_brief` objects (see `approved-brief-handoff.md`). Where the text below says "this repo" it now means `global-content-os`; historical references to `channel-content-os` ownership are kept for traceability only. Registry code lives in `packages/source-catalog/`.
>
> **HISTORY (2026-09-04 design record).** The "Still NOT implemented" list below is obsolete: ingestion, fetch, dedup, the Hub UI and the D1 schema now exist (`apps/worker`, `apps/hub`, `migrations/`). Current truth: `docs/CURRENT.md`.

**Status:** architecture locked (Batch N1, 2026-09-04; extended by Batch
N2-FINAL, 2026-09-04), USER_APPROVED. The global source registry
(`packages/source-catalog/src/news/`) now exists as durable Publisher/Logical
Source/Monitored Target/Reference-Resource data plus a provider-independent
delivery-handoff type. Still NOT implemented: ingestion engine, fetcher,
dedup/clustering code, any delivery surface (localhost UI or email), and any
D1 schema. This document fixes ownership and the data-flow contract; Batch
N2-FINAL section below fixes the source-model granularity.

## Why this exists

Both this repo's own `README.md`/`docs/SYSTEM-REFERENCE.md` and
`multi_channel_design`'s `docs/CONTENT-MONITORING.md` already independently
describe pieces of a shared, channel-agnostic content-monitoring/news system,
but neither repo previously named a single canonical owner or contract for
it. `multi_channel_design`'s ADR-0002 (2026-09-01) had provisionally
reserved a top-level `radar/` directory in that repo for this shared engine.
That reservation is **superseded by this document** -- see "Relationship to
`multi_channel_design`'s ADR-0002" below.

## Ownership model

- **One Global News Hub.** A single shared engine, owned by this repo
  (`global-content-os`; originally decided as `channel-content-os`, relocated by ADR-0004), serves every channel (Kaduse Medikal, Macaristan
  Rehberi, Futboscope, and future channels). It is never duplicated per
  channel and never reimplemented as a second engine for a new channel.
- **Channel subscriptions and acquisition scoping are owned HERE** (Package 2):
  `packages/source-catalog/data/kaduse-subscriptions.json`. `multi_channel_design`
  owns only channel editorial COVERAGE policy (archetype/policy files such as
  `kaduse-news.json`). Neither repo hosts a second, independently editable copy
  of a channel's source list.
- **This repo maintains a synchronized runtime representation** (an index
  loaded/derived from the channel-owned config) needed to actually execute
  ingestion and routing. That runtime representation is not itself canonical
  editorial truth -- if it disagrees with the channel-owned config, the
  channel-owned config wins and the runtime representation must be
  re-synced, never edited directly to "fix" a mismatch.

## Data flow

```
CHANNEL CANONICAL CONFIG (multi_channel_design, channels/<slug>/content/)
        |
        v  (sync / load / index -- one-directional for config)
GLOBAL NEWS HUB RUNTIME CHANNEL PROFILE (this repo)
        |
        v
NEWS INGESTION + ROUTING
        |
        v
CHANNEL NEWS CANDIDATES  (one logical record set)
```

**Channel -> Hub** (editorial/config direction): enabled sources, source
priorities, topic interests, exclusions, channel relevance criteria,
archetype/policy references, channel identifiers.

**Hub -> views** (runtime/operational direction): fetched articles,
candidates, normalized source info, relevance score, duplicate-cluster id,
`fetchedAt`, source health, candidate state, errors, delivery state.
Runtime/operational state is never written back as if it were editable
canonical channel policy.

## Global view / channel view -- same underlying records

Every channel's relevant news is visible at two view levels that both read
the same logical candidate/content records -- never duplicated storage:

```
GLOBAL VIEW                          CHANNEL VIEW (e.g. Kaduse Medikal)
Global News Hub                      Kaduse Medikal
|-- Kaduse Medikal news candidates   `-- Kaduse News candidates (same records,
|-- Macaristan Rehberi candidates        filtered to this channel)
`-- Futboscope candidates
```

## Cross-channel article model

One source article may be relevant to more than one channel. The model is:

```
ONE canonical source/content item
  + N channel-relevance/routing relationships (one per relevant channel)
```

Never: one duplicated article record per channel it happens to be relevant
to.

## Delivery surfaces

Localhost/web dashboard and email digest are **delivery surfaces**, not
source registries and not canonical policy stores. Both read from the same
candidate store:

```
INGEST ONCE -> NORMALIZE ONCE -> ROUTE ONCE -> VIEW/DELIVER MANY
```

No separate scraping/ingestion pipeline is built per delivery surface.
Neither surface is implemented in this batch.

## Source authority principle

A **discovery source** may identify a candidate (e.g. a media publication
reporting an FDA approval). A **primary/original source** (e.g. the FDA
itself), when available, should be preferred for factual verification of
that candidate. This distinction must be representable in the source-pack
contract below, but is not required to be enforced as a mandatory workflow
for every news category in this batch.

## Global source model (Batch N2-FINAL, 2026-09-04, supersedes the N1 "minimum source-pack contract" below)

**Superseded:** N1's original source-pack contract listed `trustTier` and
`priority` as expected per-source fields. Batch N2-FINAL section 11
explicitly forbids canonicalizing any source-priority/trust-tier ontology
("CORE/SECONDARY/WATCHLIST", "T1/T2/T3", "official tier" etc.) -- the user
has not approved one. Those two fields are retired from the contract; a
source's factual attributes (type, region, institutional parent) may still
be recorded, but never a ranking.

The registry distinguishes four layers, implemented in
`packages/source-catalog/src/news/schemas.ts` + `global-source-registry.ts`:

```
PUBLISHER / ORGANISATION            (e.g. FDA, European Commission, TÜSEB)
        |
        v  (publisherId)
LOGICAL SOURCE                      (e.g. FDA CDRH, EC Medical Devices)
        |
        v  (sourceId)
MONITORED TARGET / SUB-FEED         (e.g. FDA CDRH -> Digital Health Center
                                      of Excellence; whole-source, real
                                      sub-feed, query target, or a channel
                                      filter over a broader source when no
                                      dedicated endpoint exists)
        |
        v  (targetId, referenced by ID only)
CHANNEL SUBSCRIPTION                (global-content-os,
                                      packages/source-catalog/data/<channel>-subscriptions.json)
        |
        v
future: ingestion -> canonical candidate -> channel routing ->
channel editorial/delivery eligibility -> DELIVERY HANDOFF -> future
NewsDeliveryAdapter -> GlobalMailAdapter
```

A **Reference/Enrichment Resource** (e.g. the FDA AI-Enabled Medical Device
List, HSA's registered-device dataset, AAMI's standards library) is a fifth,
parallel category: it is explicitly `isNewsPublisher: false` and can never
become a News subscription.

**Key invariants:**
- A publisher may legitimately own multiple distinct logical sources (the
  European Commission owns 5: Medical Devices, DG SANTE, HERA, HTACG, MDCG)
  -- these are never collapsed into one merely because they share a parent,
  and never duplicated as separate publishers.
- A child monitored target (e.g. FDA CDRH's Digital Health Center of
  Excellence, TÜSEB's TÜYZE Sağlıkta Yapay Zekâ target, TİTCK's Tıbbi Cihaz
  Duyuruları target) is never registered as its own unrelated publisher.
- One global monitored target can be referenced by any number of future
  channel subscriptions without duplicating the source/target record --
  `multi_channel_design` stores only `sourceId`/`targetId` references plus
  its own inclusion/exclusion/relevance policy, never a copy of the
  publisher name, official URL, or transport metadata.
- Transport is recorded honestly: `WEB_ONLY` (official web presence known,
  no verified feed/API), `PENDING_MANUAL` (a structured mechanism such as a
  saved search may exist but was not confirmed this batch), or `UNRESOLVED`.
  No RSS/API is ever invented; `machineReadable: true` is set only once an
  actual feed has been verified in a later batch.
- A derived runtime routing index (target -> subscribing channels) is
  expected to exist once ingestion is built, but it is computed from the
  registry + channel subscriptions -- it is never a second manually
  editable source of truth.

Full data: `packages/source-catalog/data/news-registry.json` (49 publishers,
54 logical sources, 59 monitored targets, 5 reference resources, as of
Batch N2-FINAL). Kaduse's actual subscriptions live in
`packages/source-catalog/data/kaduse-subscriptions.json`,
referencing these IDs only.

## Relationship to `multi_channel_design`'s ADR-0002

`multi_channel_design`'s ADR-0002 (2026-09-01) reserved a top-level `radar/`
directory in that repo as the future home of a shared, channel-agnostic
source-monitoring core (never implemented -- `.gitkeep` placeholders only).
Batch N1 (2026-09-04, this document) is a new, explicit, user-approved
architecture decision that **the shared engine is the Global News Hub,
owned by `channel-content-os` at the time (relocated to `global-content-os` by ADR-0004 on 2026-09-29)**, not a top-level `radar/`
directory in `multi_channel_design`. `multi_channel_design` has recorded
this supersession in its own `docs/decisions/0003-global-news-hub-supersedes-radar-location.md`
and retired the empty `radar/` scaffold accordingly; this section exists so
that reading this document alone is enough to know the old reservation is no
longer active. `multi_channel_design`'s `docs/CONTENT-MONITORING.md`
behavioral contract (canonicalize URLs, fingerprint content, merge
duplicates, immutable published state, `INCOMING -> WILL_PUBLISH ->
PUBLISHED`) is unaffected by this change -- it describes ingestion/publication
*behavior*, not *location*, and continues to describe the Global News Hub's
intended behavior once built.

The one existing, working, channel-embedded source-monitoring implementation
(`tip-ogrencileri-platformu`'s Python `radar/` engine, in
`multi_channel_design`) is untouched by this batch. Its previously-planned
generalization target (`multi_channel_design`'s shared top-level `radar/`
core, per ADR-0002/`TASKS.md` item 24) is superseded -- if that engine's
logic is later reused as part of the Global News Hub, the target is the Hub repo (`global-content-os`), not a `radar/` directory in `multi_channel_design`. That migration has since been performed (Hekimler radar now lives in `global-content-os/adapters/hekimler-radar/`).

## Non-goals of this document

Not built here (still true after Batch N2-FINAL): source ingestion/fetchers,
scheduling, feed polling, normalization, canonical article identity,
duplicate detection/clustering, freshness handling, source health checks,
relevance evaluation, channel routing, the candidate queue, delivery
(localhost or email, including any SMTP/provider integration, recipients,
templates, or sending), runtime status, and any D1 schema/table. This
document (plus Batch N2-FINAL's registry code) fixes ownership, source-model
granularity, and a provider-independent delivery-handoff seam only --
Global Mail integration itself is deferred to the end of the larger project
and remains downstream of routing/editorial eligibility, per Batch
N2-FINAL section 10/20.
