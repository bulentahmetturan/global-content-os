-- Undo of legacy_reject.sql (2026-09-20): restore the prior route from the JSON backup next to this file.
-- Prior routes: see hekimler_backup_before_2026-09-20.json (decision_route per id). Generic restore:
UPDATE source_items SET decision_route = 'NEEDS_REVIEW'
 WHERE channel_id = 'hekimler-toplulugu' AND decision_route = 'REJECTED_LEGACY';
-- Rows originally OPPORTUNITY/PROFESSIONAL_BRIEF must be restored individually from the backup file.
