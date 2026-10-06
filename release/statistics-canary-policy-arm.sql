-- OWNER-RUN ONLY (never executed by the Worker). First canary arming: EUROSTAT_HEALTH -> ACTIVATION_GATED (canary only, NEVER ACTIVE).
-- Replace the two placeholders before running: {{OWNER_REF}} (your approval reference) and {{UTC_NOW}} (ISO-8601 UTC with milliseconds).
-- Target: STATS_DB only. Requires the source row from the registry bootstrap (foreign key).
INSERT INTO statistics_source_runtime_policy
  (source_id, scope_key, dataset_id, runtime_state, terms_status, legal_gate, legal_override_ref, auth_gate, rate_limit_gate, canary_gate,
   owner_activation_ref, owner_activated_at, last_policy_change_at, policy_change_reason, changed_by)
VALUES
  ('EUROSTAT_HEALTH', '*', NULL, 'ACTIVATION_GATED', 'VERIFIED', 'OWNER_REVIEW_REQUIRED', '{{OWNER_REF}}', 'NOT_REQUIRED', 'SET', 'NOT_RUN',
   '{{OWNER_REF}}', '{{UTC_NOW}}', '{{UTC_NOW}}', 'first controlled canary arming (ACTIVATION_GATED, canary only)', 'owner:{{OWNER_REF}}')
ON CONFLICT(source_id, scope_key) DO UPDATE SET
  runtime_state = 'ACTIVATION_GATED', terms_status = 'VERIFIED', legal_gate = 'OWNER_REVIEW_REQUIRED', legal_override_ref = '{{OWNER_REF}}',
  auth_gate = 'NOT_REQUIRED', rate_limit_gate = 'SET', canary_gate = 'NOT_RUN', owner_activation_ref = '{{OWNER_REF}}',
  owner_activated_at = '{{UTC_NOW}}', last_policy_change_at = '{{UTC_NOW}}',
  policy_change_reason = 'first controlled canary arming (ACTIVATION_GATED, canary only)', changed_by = 'owner:{{OWNER_REF}}';
