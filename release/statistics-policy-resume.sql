-- OWNER-RUN ONLY (never executed by the Worker). Resume after an owner pause (or after reviewing a terminal failure): PAUSED -> ACTIVE.
-- The frozen CHECK keeps every activation gate (owner reference, legal gate, rate-limit gate, canary gate PASSED) intact; this only changes the state and,
-- by touching last_policy_change_at after a failed run, is the owner's acknowledgement that unblocks the scheduler planner. Replace {{OWNER_REF}} and {{UTC_NOW}}.
UPDATE statistics_source_runtime_policy
   SET runtime_state = 'ACTIVE', last_policy_change_at = '{{UTC_NOW}}', policy_change_reason = 'owner resume after review', changed_by = 'owner:{{OWNER_REF}}'
 WHERE source_id = 'EUROSTAT_HEALTH' AND scope_key = '*' AND runtime_state = 'PAUSED';
