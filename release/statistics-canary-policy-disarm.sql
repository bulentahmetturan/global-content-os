-- OWNER-RUN ONLY (never executed by the Worker). First canary shutdown: EUROSTAT_HEALTH -> DISABLED. Replace {{UTC_NOW}} before running.
UPDATE statistics_source_runtime_policy
   SET runtime_state = 'DISABLED', last_policy_change_at = '{{UTC_NOW}}', policy_change_reason = 'first controlled canary shutdown', changed_by = 'owner:canary-disarm'
 WHERE source_id = 'EUROSTAT_HEALTH' AND scope_key = '*';
