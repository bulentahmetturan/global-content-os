# Turkish localization contract (title + summary)

Status: implemented on branch `localization-model-canary` (not on main, not deployed). Production change needs owner authorization (deploy and migration `0027`).

Foreign-language items reach the Hub with a Turkish title and, when the source supports it, a grounded Turkish summary. Publisher / source names stay in the original language. The English excerpt is never the summary. `Öz hazırlanıyor…` is a temporary processing state only.

## Item pipeline (`apps/worker/src/localize/pipeline.ts`, stored by `enrich.ts`)

1. **Language gate** (`language.ts`): a Turkish item is never translated (`skipped`). Unknown text is treated as foreign (fail closed).
2. **Turkish title**, its own path: model translation, validator (Turkish, no English or foreign-script leak, numbers and acronyms preserved), meaning judge. Two attempts. A title that fails stays `failed` (bounded retry).
3. **Extractive evidence** (`evidence.ts`): sentences quoted from the source excerpt; boilerplate, title echoes and too-short excerpts are not evidence. No evidence: the summary is not attempted.
4. **Grounded summary**: 1–2 Turkish sentences from the evidence only, then contract validation (`contract.ts`: length, sentence end, no invented numbers, no title echo or excerpt copy) and the grounding judge (fail closed). Two attempts.
5. **Store**: provenance goes to `enrichment_json.localization` (contract version, language, models, evidence id, validator and judge results, timestamp).

| `enrichment_status` | Meaning | Hub |
|---|---|---|
| `pending` | queued (temporary) | `Öz hazırlanıyor…`, excerpt hidden |
| `done` | Turkish title + grounded Turkish summary | title + summary |
| `title_only` | Turkish title stored; summary not generated (insufficient evidence, or not grounded) | title + `Türkçe özet üretilemedi — kaynağı inceleyin.` |
| `skipped` | source already Turkish | as is |
| `failed` | title not localized / infrastructure error; retried ≤ 3 times, 30 min apart | explicit failure note |

The summary column of a `title_only` item keeps the source text and is never rendered. No schema change was needed for the statuses.

## New sources: localization readiness (lifecycle gate G8b)

`docs/SOURCE-LIFECYCLE.md`. The canary runs the production pipeline through the operator-gated `POST /api/localize/canary` (no writes) and an independent auditor model. Outcome classes (diagnostic, not lifecycle states): `LOCALIZATION_READY`, `LOCALIZATION_TITLE_ONLY`, `LOCALIZATION_INSUFFICIENT_EVIDENCE`, `LOCALIZATION_NOT_REQUIRED` (activatable); `LOCALIZATION_MODEL_UNSAFE` and canary unavailable (block activation, fail closed). Acceptance is "grounded whenever generated": a missing summary is acceptable, a wrong one is not. Failure never retires a source.

## Feedback (P5)

`POST /api/localize/feedback` stores one human judgement (`wrong_translation`, `garbled_turkish`, `unsupported_claim`, `subject_inversion`, `entity_error`, `number_error`, `too_vague`, `summary_not_useful`, `foreign_language_leak`, `title_wrong`, `summary_wrong`, `good_translation`, `good_summary`) in `localization_feedback` with source, item, language, URL, title and summary model, contract version, evidence id, validator and judge result and production timestamp. Machine reviewers are refused.

`node scripts/localization-review.mjs queue --remote` (SELECT-only) or `POST /api/localize/review` aggregates by source, model, contract version and language and raises `REVIEW_REQUIRED` flags (semantic error rate, foreign leak, repeated title mistranslation, grounding failure spike, evidence insufficiency). A flag suggests: prompt improvement, model change, source-specific extraction fix, evidence extractor fix, or source-lifecycle re-canary. Each change passes a bounded canary and is a reviewed commit or explicit authorization.

**Guardrail:** feedback never adds, retires or reactivates a source, edits the canonical registry, loosens scope, changes a model or prompt default, mutates lifecycle state or changes editorial rules. Its only write is one `INSERT` into `localization_feedback`. Gate: `apps/worker/src/localize/localization-guardrails.test.mjs`.

## Existing sources and backlog

No bulk re-processing. Active sources follow the new contract as they produce new items; sources with a high feedback error rate enter the review queue. The older weak items (about 419) stay a separate, bounded backlog, re-queued only in small waves after a live canary passes.

Models and cost: defaults in `pipeline.ts` (`DEFAULT_MODELS`), overridable per Worker var (`ENRICH_MODEL`, `ENRICH_MODEL_TITLE`, `ENRICH_MODEL_SUMMARY`, `ENRICH_MODEL_JUDGE`, `ENRICH_MODEL_AUDIT`). A model change is never made by feedback.
