-- OWNER-RUN ONLY (never executed by the Worker). Records the PASSED canary and performs the legal frozen transition ACTIVATION_GATED -> ACTIVE.
-- Run ONLY after the canary gates passed and the owner reviewed the evidence. Replace {{OWNER_REF}} and {{UTC_NOW}}.
-- This starts no ingestion (nothing in the Worker runs on a schedule) and projects nothing by itself: production projection comes only from the
-- owner-triggered POST_CANARY_PRODUCTION_HANDOFF run (see docs/STATISTICS-FIRST-CANARY-PACKAGE.md, item 59).
UPDATE statistics_source_runtime_policy
   SET runtime_state = 'ACTIVE', canary_gate = 'PASSED', last_policy_change_at = '{{UTC_NOW}}',
       policy_change_reason = 'first controlled canary passed; owner activation', changed_by = 'owner:{{OWNER_REF}}'
 WHERE source_id = 'EUROSTAT_HEALTH' AND scope_key = '*' AND runtime_state = 'ACTIVATION_GATED';
