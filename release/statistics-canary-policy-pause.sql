-- OWNER-RUN ONLY (never executed by the Worker). Post-canary parking: EUROSTAT_HEALTH -> PAUSED (allowed from ACTIVE or ACTIVATION_GATED). Replace {{UTC_NOW}}.
UPDATE statistics_source_runtime_policy
   SET runtime_state = 'PAUSED', last_policy_change_at = '{{UTC_NOW}}', policy_change_reason = 'first controlled canary shutdown (parked)', changed_by = 'owner:canary-pause'
 WHERE source_id = 'EUROSTAT_HEALTH' AND scope_key = '*' AND runtime_state IN ('ACTIVE', 'ACTIVATION_GATED');
