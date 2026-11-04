-- 2026-11-04: audience-gate rejections are decisions, not failures (Bible 26.3/26.4). Clear the false failure streak so the two
-- sources leave backoff/manual-review; hsgm_public_health is a retired tombstone (legs hsgm_* replaced it).
UPDATE tip_toplulugu_source_telemetry SET failure_count = 0, source_health = 'HEALTHY', coverage_status = 'NO_ELIGIBLE_ITEMS' WHERE source_id IN ('medical_economics', 'medicalresearch_com');
UPDATE tip_toplulugu_source_telemetry SET failure_count = 0, source_health = 'HEALTHY', coverage_status = 'NO_ELIGIBLE_ITEMS', last_success_at = COALESCE(last_success_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE source_id = 'hsgm_public_health';
