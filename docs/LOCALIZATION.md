# Turkish localization contract (title + summary)

Status: V2 (`tr-loc/2026-10-02.2`) on branch `localization-v2` (not on main, not deployed). Production change needs owner authorization (deploy and migration `0027`). V1 measured `LOCALIZATION_MODEL_UNSAFE` on the 30-item canary; V2 is not production-ready until its 50-item canary passes (below).

Foreign-language items reach the Hub with a Turkish title and, when the source supports it, a grounded Turkish summary. Publisher / source names stay in the original language. The English excerpt is never the summary. `Öz hazırlanıyor…` is a temporary processing state only.

## Item pipeline (`apps/worker/src/localize/pipeline.ts`, stored by `enrich.ts`)

1. **Language gate** (`language.ts`): a Turkish item is never translated (`skipped`). Unknown text is treated as foreign (fail closed). A title needs at least one Turkish function word to count as Turkish (brand names such as "Galleri" are not Turkish).
2. **Turkish title** (`title.ts`), separate from summarization: a literal, translation-only prompt at temperature 0. Untranslated parts are kept verbatim (dbGaP `New | phs… |` prefix as `Yeni | phs… |`, `STAT+:` label, trailing publisher). Candidates in order: primary model, title fallback model (different family), primary model told why the earlier one was rejected. Each candidate must pass: Turkish validator (no English or foreign-script leak), numbers and acronyms preserved (`CT`→`BT`, `WHO`→`DSÖ`… accepted), garble check, no semantic expansion (no brackets, notes or added clauses), terminology guard (below), then the meaning judge. The first passing candidate is stored; none: `failed` (bounded retry).
3. **Evidence** (`acquire.ts`, `evidence.ts`): sources in priority order — article text (publisher page), abstract (Europe PMC by DOI), publisher excerpt (feed text, page description), structured metadata (ClinicalTrials.gov summary). At most 2 network calls per item, 8 s, 800 KB; aggregator links are resolved (Bing) or refused (Google News). Spans are 2–5 verbatim sentences from the highest-priority source that has enough; sources are never mixed. Boilerplate, bylines, paywall and page chrome, title echoes and text that shares no content words with the title (`OFF_TOPIC`) are not evidence. No adequate source: `INSUFFICIENT_EVIDENCE`, and no summary is attempted.
4. **Grounded summary**: source type (`source-type.ts`: `news`, `research`, `consumer_health`, `regulation`; from feed, host and title shape) selects a bounded policy (`summary-policy.ts`): a generator focus and type-specific judge rules (research: association is not causation, hedges stay, a protocol or dataset has no results; regulation: the action and authority stay exact; consumer health: advice is not turned into a clinical claim; news: what happened, who did it, nothing added). Then contract validation (`contract.ts`), invented-number and garble checks, the terminology guard against title + evidence, and the grounding judge (fail closed). Two attempts.
5. **Store**: provenance in `enrichment_json.localization` (contract version, language, source type, title and summary paths, title candidates, models, evidence id / kind / origin / spans, validator, terminology and judge results, timestamp). A `failed` item stores the same provenance.

### Terminology guard (`terminology.ts`)

A glossary of disease, imaging, procedure, device and drug-class entities with their Turkish renderings and confusable groups (measles / smallpox / chickenpox / rubella; tomosynthesis / tomography / mammography; drug and device classes). Each source entity is judged `same`, `narrower_safe` (an accepted narrower rendering, e.g. ultrasound → ultrasonografi) or `unsupported_substitution` (a sibling from its group, or an entity the source does not contain). Generic drug names (INN stems) must survive the title, transliteration allowed (semaglutide → semaglutid). Title mode: every glossary entity must be rendered. Summary mode: entities may be omitted, never substituted or introduced. Any unsupported substitution fails closed; the translator is given the required renderings up front.

| `enrichment_status` | Meaning | Hub |
|---|---|---|
| `pending` | queued (temporary) | `Öz hazırlanıyor…`, excerpt hidden |
| `done` | Turkish title + grounded Turkish summary | title + summary |
| `title_only` | Turkish title stored; summary not generated (insufficient evidence, or not grounded) | title + `Türkçe özet üretilemedi — kaynağı inceleyin.` |
| `skipped` | source already Turkish | as is |
| `failed` | title not localized / infrastructure error; retried ≤ 3 times, 30 min apart | explicit failure note |

The summary column of a `title_only` item keeps the source text and is never rendered. No schema change was needed for the statuses.

## Sources: localization readiness (lifecycle gate G8b)

`docs/SOURCE-LIFECYCLE.md`. Measured on `add`, `reactivate` and `recalibrate`. The canary runs the production pipeline through the operator-gated `POST /api/localize/canary` (no writes) and an independent auditor model. Outcome classes (diagnostic, not lifecycle states): `LOCALIZATION_READY`, `LOCALIZATION_TITLE_ONLY`, `LOCALIZATION_INSUFFICIENT_EVIDENCE`, `LOCALIZATION_NOT_REQUIRED` (activatable); `LOCALIZATION_MODEL_UNSAFE` and canary unavailable (block activation or a cadence write, fail closed). Acceptance is "grounded whenever generated": a missing summary is acceptable, a wrong one is not. Failure never retires a source.

### Model canary acceptance (V2)

Same 30 items as the V1 canary plus 20 heterogeneous items (news, research, consumer health, regulation / announcement). Zero tolerance: semantic / entity errors, unsupported claims, subject inversions, foreign leaks (auditor flags and manual review merged). Coverage: title success ≥ 98 %, grounded summary ≥ 75 %, title-only ≤ 20 % of foreign items; insufficient evidence is reported separately from model failure. Any error: `MODEL_UNSAFE`. Safe but under a coverage threshold: `MODEL_SAFE_BUT_LOW_COVERAGE`. Validators are never relaxed to raise the pass rate.

## Feedback (P5)

`POST /api/localize/feedback` stores one human judgement (`wrong_translation`, `garbled_turkish`, `unsupported_claim`, `subject_inversion`, `entity_error`, `number_error`, `too_vague`, `summary_not_useful`, `foreign_language_leak`, `title_wrong`, `summary_wrong`, `good_translation`, `good_summary`) in `localization_feedback` with source, item, language, source type, URL, title and summary model, title and summary path, failure reason, contract version, evidence id, validator and judge result and production timestamp. Machine reviewers are refused.

`node scripts/localization-review.mjs queue --remote` (SELECT-only) or `POST /api/localize/review` aggregates by source, source type, title model, summary model, title path, summary path, failure reason, contract version and language, returns a failure breakdown (source type × model × reason), and raises `REVIEW_REQUIRED` flags (semantic error rate, foreign leak, repeated title mistranslation, grounding failure spike, evidence insufficiency). A flag suggests: prompt improvement, model change, source-type policy recalibration, source-specific extraction fix, evidence extractor fix, or source-lifecycle re-canary. Each change passes a bounded canary and is a reviewed commit or explicit authorization.

**Guardrail:** feedback never adds, retires or reactivates a source, edits the canonical registry, loosens scope, changes a model, prompt or policy default, mutates lifecycle state or changes editorial rules. Its only write is one `INSERT` into `localization_feedback`. Gate: `apps/worker/src/localize/localization-guardrails.test.mjs`.

## Existing sources and backlog

No bulk re-processing. Active sources follow the new contract as they produce new items; sources with a high feedback error rate enter the review queue. The older weak items (about 419) stay a separate, bounded backlog, re-queued only in small waves after a live canary passes and the owner authorizes it.

## Models and cost

Generator `llama-3.3-70b-instruct-fp8-fast`; title fallback `qwen3.8-27b`; title and summary judges `mistral-small-3.1-24b-instruct` (a same-family judge accepted measles rendered as smallpox); canary auditor `gpt-oss-120b`, a third family. Per foreign item: 1–3 title candidates + judges, evidence fetch (no model), up to 2 summary + judge calls, and one auditor call in the lifecycle canary. Defaults in `pipeline.ts` (`DEFAULT_MODELS`), overridable per Worker var (`ENRICH_MODEL`, `ENRICH_MODEL_TITLE`, `ENRICH_MODEL_TITLE_FALLBACK`, `ENRICH_MODEL_SUMMARY`, `ENRICH_MODEL_JUDGE`, `ENRICH_MODEL_AUDIT`). A model change is never made by feedback. Workers AI on the current plan has a daily neuron allocation shared by production enrichment and canaries; a 50-item canary uses a large part of one day's allocation.
