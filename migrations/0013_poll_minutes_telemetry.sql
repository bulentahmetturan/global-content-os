-- Per-source fetch cadence for the Hekimler source panel.
-- 60 hourly, 1440 daily, 10080 weekly, 43200 monthly.
ALTER TABLE hekimler_source_telemetry ADD COLUMN poll_minutes INTEGER NOT NULL DEFAULT 43200;
