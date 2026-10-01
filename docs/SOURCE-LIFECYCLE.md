# Source Lifecycle Orchestrator

One entry point for adding, retiring and reactivating a source. The operator gives a name or URL. The tool works out the rest from evidence. It asks a question only when the ambiguity is real.

```bash
node scripts/source-lifecycle.mjs add "<name | url | source_id>" [--url U] [--channel tip_toplulugu|kaduse-news|kaduse-research] [--history <run-report dir>] [--apply] [--json]
node scripts/source-lifecycle.mjs retire "<source>" [--reason R] [--apply]
node scripts/source-lifecycle.mjs reactivate "<source_id>" [--history DIR] [--apply]
node scripts/source-lifecycle.mjs inspect | plan | recalibrate | purge-plan "<source>"
# add / reactivate: [--localization-sample FILE]; foreign-language sources also need HUB_OPERATOR_TOKEN (G8b)
```

Without `--apply` nothing is written. The user's explicit "add"/"stop using" is the authorization; the agent then passes `--apply`. Exit: 0 done, 3 needs user decision, 4 blocked, 1 denied/error. Full per-run trace: `.logs/source-lifecycle/<request_id>.json` (outside git and default context).

## Ownership and state

GCOS is the only source owner. There is no new registry and no new lifecycle enum. Persistent state is derived from existing fields:

| Derived state | Tıp Topluluğu (`source-registry-*.json`) | Kaduse (catalog + generated `config/feeds.json`) |
|---|---|---|
| ACTIVE | `runtime_activation=AUTOMATION_READY`, status not retired | feed `enabled=true` |
| READY | `MANUAL_INTAKE` and last `lifecycle_history` outcome `READY` (every gate passed except capacity) | – |
| INACTIVE | `MANUAL_INTAKE` / disabled | `PENDING_EXPLICIT_DECISION` / disabled |
| RETIRED | `status=retired` (then `compute_activation_state` returns BLOCKED) | disabled, not pending |

`REQUESTED → RESOLVING → VALIDATING → CANARY → READY/ACTIVE` exist only in the trace.

**Write scope:** every repo write goes through `scripts/source-lifecycle/store.mjs` (`writeCanonicalFiles`), the only write site. It uses the same guards as `source-actions.mjs`: operator or canonical-owner actor, `authorize() === true`, `apply === true`, and a byte-stable JSON round trip (otherwise `REQUIRES_MANUAL_EDIT`).

**Kaduse lanes** (`scripts/source-lifecycle/kaduse-change.mjs`): Kaduse feeds reach D1 only by migration, so `add` (new source) / `retire` / `reactivate` with `--apply` run the full gates, then in a disposable sandbox edit the catalog record (news: subscription `enabled`; research: `verificationStatus EXCLUDE` ↔ previous; new: catalog record), regenerate `config/feeds.json` with `sync-feeds.mjs`, and derive the next forward migration `migrations/NNNN_source_lifecycle_<op>_<id>.sql` from the feeds diff (upsert of catalog-owned columns only; never DELETE). The result is `CHANGE_PREPARED` with a `review_gate`: commit, local `wrangler d1 migrations apply --local`, then remote apply only with explicit authorization. The operator never writes migrations or config by hand. Registered-but-pending feeds (R4, curated-club, `PENDING_ACTIVATION_FEED_IDS` / `RETIRED_DUPLICATE_FEED_IDS` in `sync-feeds.mjs`) stay `PLAN_ONLY`/`NO_CHANGE`: activating them is an explicit decision, never a lifecycle apply.

## Name-only requests ("add <name>")

Catalog-known names resolve automatically. For an unknown name the tool returns `NEEDS_USER_DECISION / IDENTITY_UNRESOLVED` (exit 3) and never guesses a publisher URL. The operating agent then resolves it itself: web-search the name, take the publisher's own official domain (not an aggregator, mirror or social page), and re-run `add "<name>" --url <official URL>`. The user is asked only if the search yields no official domain or more than one plausible publisher.

## Deictic references

For "bu kaynak", "bunu kaldır", "artık bunu kullanma": if the current conversation resolves to exactly one source identity, use it (retire, never delete). If it is ambiguous, do not guess; ask the user one question.

## Add: gates

| Gate | What it decides | Reuses |
|---|---|---|
| G0 request | normalizes name/URL/id, request id | – |
| G1 identity | exact id / URL / same-host path / name tokens; `ALREADY_ACTIVE`; a RETIRED match goes to reactivation; `AMBIGUOUS`/`UNRESOLVED` → one question | `registry-find` stores |
| G2 access + endpoint | robots.txt, 401/403/429/451/login wall → `BLOCKED_ACCESS`; known official API → RSS/Atom (page or `rel=alternate`, same registrable domain only) → HTML list; ≤ 6 requests | Worker API adapters |
| G3 parser | the lane's existing runtime parser (`list-page`, `generic-web.ts`, API adapters). If none fits → `ADAPTER_REQUIRED` + fixture sample in the trace. At least 3 items with title and URL; dates only from markup | runtime parsers |
| G4 routing | one lane + heading (+ tier, evidence role). A tie → question, never fan-out. `HABER` exists only on the `kaduse-news` lane (the Global Hub Haber lane); Tıp Topluluğu headings are DUYURU / BURS / EGITIM, so lay health news is not routed there | S66 headings, registry vocab |
| G5 cadence | see below | scheduler policy |
| G6 dedupe | endpoint collision, S66 one-primary-heading with the candidate added, optional known-item overlap | `check_source_identity.py` via bridge |
| G7 capacity | unchanged `tip_toplulugu_ops.py capacity --add 1 --add-cadence N`. Only SAFE activates; CAUTION/BLOCK stage READY (`MANUAL_INTAKE` + reason); guard unavailable → BLOCK | capacity guard |
| G8 canary | fetch → parse → normalize → dedupe → candidate shape (inside plan hosts/paths) → routing → the exact profile through `automation_ready_gates`. Publishes nothing | `tip_toplulugu_activation.py` via bridge |
| G8b localization | readiness for foreign / mixed-language sources: language, Turkish title, extractive evidence, grounded summary, independent audit (unsupported claim, subject inversion, numeric/entity, garble, leak). Outcome class below; `LOCALIZATION_MODEL_UNSAFE` or an unavailable canary stops activation (`BLOCKED_LOCALIZATION`, exit 4). Turkish sources are `LOCALIZATION_NOT_REQUIRED` with no model call | Worker `POST /api/localize/canary` (operator-gated, no writes) |
| G9 activate | all PASS + SAFE → `AUTOMATION_READY` in an additive layer (burs / egitim / v1.1 for `.tr` / batch3) | canonical owner path |
| G10 observe | existing telemetry only (below) | – |

Bridge: `adapters/tip-toplulugu-radar/scripts/tip_toplulugu_lifecycle_bridge.py` (read-only).

## Localization readiness (G8b)

A readiness / diagnostic outcome on `add` and `reactivate`, never a lifecycle state and never a reason to retire. Classes: `LOCALIZATION_READY`, `LOCALIZATION_TITLE_ONLY`, `LOCALIZATION_INSUFFICIENT_EVIDENCE`, `LOCALIZATION_NOT_REQUIRED` (all activatable) and `LOCALIZATION_MODEL_UNSAFE` / canary unavailable (blocking). The rule is "grounded whenever generated": a missing summary is acceptable, a wrong or unsafe one is not (zero tolerance on leak, unsupported claim, subject inversion, numeric/entity error, garble; titles must localize). The sample is at most 8 parsed items; only foreign items are sent to the canary. The CLI needs `HUB_OPERATOR_TOKEN` (and `GCOS_LOCALIZE_CANARY_URL` unless production); without it a foreign source is blocked, not activated. `--localization-sample FILE` supplies `[{title, excerpt}]` for sources the lifecycle cannot sample (JSON APIs) or to canary real article excerpts. The pipeline, statuses and feedback loop: `docs/LOCALIZATION.md`.

## Cadence

`publication timestamps (feed > list dates > sitemap lastmod) → gaps ≥ 5 min → drop > 10× median → expected gap = median → poll = gap/2 → min(freshness cap) → clamp [lane min, lane max] → snap down to 60/120/180/360/720/1440/2880/4320/10080/20160`.

Future-dated items (deadlines) are ignored. A source silent for more than 4× its gap is flagged `DORMANT_SUSPECT`. Fewer than 4 gaps → class fallback (Tıp Topluluğu 10080, Kaduse news 360, research 1440).

Lane bounds: Tıp Topluluğu 1440 (daily runner) … 20160; Kaduse news 60 … 1440; Kaduse research 360 … 1440.

The value is written once, into the one field the scheduler reads (`fetch_plan.expected_check_interval_minutes`). `cadence_policy` stores bounds and evidence, never a second value. Kaduse lanes: the value is written once, to the catalog target `pollMinutes`, and flows only through generated `config/feeds.json` into D1 `source_feeds.poll_minutes` (default 360 when absent). `recalibrate` proposes a change only after at least one ladder step and not on LOW confidence; `--apply` is the owner action, and it is capacity-checked when load rises.

## Retire (default for "remove" / "stop using")

O1 `status=retired`, `runtime_activation=BLOCKED`, fetch/scheduled/candidate/pipeline flags false (applied to every registry layer holding the id), verified through the runtime gates.
O2 in-flight: `inbox → hold` with an `editorial_decisions` row. hold / production / trash / approved briefs / published stay untouched. This is returned as D1 SQL for an operator step and never executed here.
O3 tombstone: the record stays, with `former_*`, `retired_reason/at/change_ref` and `lifecycle_history`.
O4 detach: scheduler eligibility is removed by status. Regenerate the derivatives with their generators (never hand-edit): `tip-toplulugu-automation-ready.ts/.json`, `docs/source-matrix.generated.json`, and for Kaduse `config/feeds.json`.
O5 artifacts: references are classified KEEP / REVIEW / CLEANUP_CANDIDATE / NEVER_AUTO_DELETE (secrets). A file name belongs to the longest source id it starts with. Nothing is deleted.
O6 provenance kept: see `PRESERVED` in `offboard.mjs`.
O7 `purge-plan` is a separate command that returns a dry-run dependency/FK report; purge is never executed.
`retire` twice → `ALREADY_RETIRED`. `add` on a retired source → reactivation of the same id.

## Boundaries

- Pillar 5: actors `feedback`, `pillar5`, `learning`, `relevance_ledger` and `machine` are refused (`FEEDBACK_CANNOT_MUTATE_SOURCE`). Feedback still reaches sources only through `docs/FEEDBACK-SOURCE-ACTIONS.md`.
- One source per operation; the tool never bulk-enables anything.
- Observability (no new store): `tip_toplulugu_source_telemetry`, `report/scheduler-state.json` + `run-report.json`, `source_items`/`decided_links`, `editorial_decisions`/`review_feedback`, `source_revalidation`, `tip_toplulugu_ops.py status|capacity`.

## Verification

`node --test scripts/source-lifecycle/orchestrator.test.mjs`, `python -m pytest adapters/tip-toplulugu-radar/tests/test_tip_toplulugu_lifecycle_bridge.py`, `npm run production:check`, `node scripts/check-router-links.mjs`. For real capacity answers, point `--history` at the runner's `run-report.json` artifacts; without history the guard returns CAUTION, so nothing auto-activates.
