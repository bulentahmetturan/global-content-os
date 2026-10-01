# Temporal V2: Group 0 result and Group 2 (deadline / expiry) proposal

Status: **proposal only**. Group 0 built no expiry engine. Group 2 needs separate owner approval.

## Group 0 (implemented 2026-10-02)

| Item | Change | Where |
|---|---|---|
| `published_at` immutable | a re-sighting with null or a different date never overwrites a stored date; fills a null; only `verifiedDateCorrection: true` changes it; same-day canonical-form repair (`2026-9-29` → `2026-09-29`) still allowed | `apps/worker/src/db/queries.ts` (`publishedAtSame`, `PUBLISHED_AT_SET`) |
| Research date normalization | valid ISO normalization; years 2101–9999 rejected (`invalid_date`) in any format; raw source date kept in `intake_meta_json.published_at_source` when normalization changed it (new rows) | `ingest-gate.ts`, `queries.ts` |
| Research-media age gate | `RESEARCH_MEDIA_FEEDS` (catalog `ACCESSIBLE_SCIENCE_MEDIA` + GDELT): stale (> 14 days) and undated rejected; journal / research-publication sources are not age-gated; no evergreen path | `ingest-gate.ts` (sync with catalog asserted in `ingest-gate.test.mjs`) |
| Resmî Gazete cadence | `resmi_gazete_medical_regulation` 43200 → 1440 in both registry layers (phase1 + v1.1) via canonical `recalibrate --set 1440 --basis` | registries + `lifecycle_history` |
| Duyuru recalibration | per-source, family-based (below) | registries |
| Deadline marking | `adapters/tip-toplulugu-radar/content/policies/tip-toplulugu-temporal-profile.json` (39 sources, 15 `RECORD_EVIDENCE`, 24 `ROLE_INFERRED`) | policy file + `scripts/temporal-profile.test.mjs` |

### Why a lifecycle extension (E86)

`recalibrate` could not handle: (1) sources whose cadence is known from the publisher but not measurable from timestamps (Resmî Gazete daily TOC, undated list pages), (2) records that live in two registry layers. Minimum compliant change: `recalibrate <id> --set <min> --basis "<evidence>"` (ladder step inside lane bounds, written basis, same authorize / apply / capacity / byte-stable guards, history entry `RECALIBRATED_OWNER_DIRECTED`) and multi-layer sync (all layers checked writable before the first write). The old `MULTI_LAYER_RECORD` block on the evidence path is lifted by the same code. No guard was bypassed; the pause / endpoint-modify gap listed in E86 is unchanged.

### Duyuru families

| Family | Rule | Result |
|---|---|---|
| A. measured | engine `deriveCadence` from feed / list timestamps (poll = gap/2, snapped down, lane floor 1440) | 19 sources proposed |
| U-LOW cap | lay / trade health news without deadlines: urgency cap 2880 (applied to 14 of the 19, plus 7 undated newsrooms) so capacity goes to deadline sources first | 21 sources at 2880 |
| F1 deadline HIGH | unmeasurable + HIGH expiry sensitivity → 2880 | yok, tuk, tepdad, halk_sagligi_yeterlik applied |
| F3 slow measured | `harvard_nutrition_source`: months-long gaps → lane max 20160 | applied |
| F4/F5 | non-deadline statistical bulletins and MEDIUM-expiry sources, unmeasurable → engine fallback 10080 (was 43200, above the lane max) | tuik, titck, teged, tkd applied |

Capacity: the unchanged guard (`tip_toplulugu_ops.py capacity`, 10 cycles of real runner history) went SAFE → CAUTION at ~32 expected source-runs/day. `apply` requires SAFE, so low-urgency sources were capped before the deadline sources were added. Final load: see `CAPACITY` in the Group 0 report.

### Not changed (owner decision or access)

- `abroad_es_mir_fse` (target 2880, now 43200) and `abroad_sa_scfhs_watch` (target 2880, now 10080): `source-registry-abroad-career-v1.json` is not byte-stable, the lifecycle store refuses to write (`REQUIRES_MANUAL_EDIT`); a manual edit of the file was denied in-session. Owner edit needed.
- Unevaluated (login wall, robots, network error): `abroad_au_medical_board`, `abroad_au_ahpra`, `klimık_infectious_diseases`, `tpd_psychiatry`, `abroad_it_salute_foreign_qual`, `t24_saglik`, `ttb_national`. Cadence left as is; they are also the strongest pause candidates once E86 adds a pause verb.
- `tuk_specialty_training`: the list parser returns 0 items, so its new 2880 cadence has nothing to find until the parser is fixed (P2 follow-up).
- Cadence below 1440 is not available: the Tıp Topluluğu runner is daily; sources with feed gaps of minutes (e.g. `sondakika_saglik`, `medicalresearch_com`) can lose items between runs whatever the cadence value.

## Group 2 proposal (not started)

1. **Item-level deadline extraction.** Per item: `deadline_at` (date, optional time), `deadline_kind` (application / registration / effective / event), `deadline_source` (`record_field | parsed_text | manual`), original text kept. Never inferred from `published_at`; never invented (CORE rule 3). Only for sources in the temporal profile.
2. **Verify the 24 `ROLE_INFERRED` marks** against real items first; promote to `RECORD_EVIDENCE` or drop.
3. **Expiry state.** `ACTIVE → EXPIRING (≤ N days) → EXPIRED`, computed at read time, no new writes for the clock. EXPIRED items leave Hub review by default (kept, never deleted); EXPIRING sorts first. N from `expiry_sensitivity` (HIGH 7 d, MEDIUM 14 d, to be confirmed by the owner).
4. **Cadence feedback.** After items carry deadlines, replace the static caps in the profile by observed notice lead time (deadline − first seen); `recalibrate` consumes it as evidence.
5. **Where it lives.** Worker ingest (extraction), D1 additive columns on `source_items` (migration 0027+), Hub filter. `approved_brief` only gains a `deadline` field if the consumer needs it (contract change = both repos).
6. **Out of scope** until separately approved: evergreen engine, signal-provider integration, OpenAlex, feedback architecture, localization.
