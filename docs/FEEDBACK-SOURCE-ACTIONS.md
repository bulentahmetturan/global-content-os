# Source feedback → canonical owner action

`SOURCE_FEEDBACK` (model, lifecycle, store: `@ccos/docs/FEEDBACK.md`) never writes registry data. The only write path is `scripts/source-actions.mjs`, run by the canonical owner:

`OBSERVATION → EVIDENCE → PROPOSED_ADJUSTMENT → REVIEW (human / review gate) → source-actions (canonical owner) → report back: markApplied {change_ref}`

Actions: `disable` (`runtime_activation → BLOCKED`), `change_url` (`source_url`), `change_cadence` (`fetch_plan.expected_check_interval_minutes` -- the field the Hekimler scheduler reads; ladder step within the Hekimler lane bounds 1440..20160; legacy `poll_minutes` keys are history and never written), `revalidate`, `parser_review`, `classification_review` (the last three record an owner work item; no registry edit).

Guards (all tested in `scripts/source-actions.test.mjs`): feedback must be `ACCEPTED` by `human`/`review_gate`; caller must be `canonical_owner` with `authorize(...) === true` (missing, throwing or non-true → `AUTH_FAIL_CLOSED`); exactly one canonical Hekimler record must resolve (`scripts/registry-find.mjs`); the default is a dry run returning the patch; `apply: true` writes only if the file is byte-stable under a JSON round trip, otherwise `REQUIRES_MANUAL_EDIT` with the exact patch. Kaduse catalog stores are not edited by this module.

The lifecycle orchestrator (`docs/SOURCE-LIFECYCLE.md`) refuses feedback, learning and machine actors outright (`FEEDBACK_CANNOT_MUTATE_SOURCE`).

`AUTONOMOUS_RULE_MUTATION=0`. Transient events (a single fetch failure) are telemetry; feedback is raised only at the thresholds in `docs/OPERATIONS.md` (`MANUAL_REVIEW_REQUIRED`, `SYSTEMIC_FETCH_FAILURE`, lateness).

Relevance learning is a separate owner ledger (`scripts/relevance-ledger.mjs`). It changes future candidate selection priority for one channel and one topic, content family, or source. It does not edit the source registry. One decision is refused (`ONE_SHOT_POLICY_MUTATION`). The canonical owner can reverse an applied adjustment. Production and brand actions stay with channel-content-os.
