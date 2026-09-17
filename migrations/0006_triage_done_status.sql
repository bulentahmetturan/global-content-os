-- Soft-archive kind: 'deleted' (Silinenler) vs 'done' (Üretimi Bitenler).
-- Both keep triage_status='trash' for schema CHECK compatibility; Hub splits by archive_kind.
ALTER TABLE source_items ADD COLUMN archive_kind TEXT;

UPDATE source_items
SET archive_kind = 'done'
WHERE triage_status = 'trash'
  AND id IN (
    SELECT source_item_id FROM editorial_decisions d
    WHERE action = 'complete'
      AND decided_at = (
        SELECT MAX(d2.decided_at) FROM editorial_decisions d2
        WHERE d2.source_item_id = d.source_item_id
      )
  );

UPDATE source_items
SET archive_kind = 'deleted'
WHERE triage_status = 'trash'
  AND (archive_kind IS NULL OR archive_kind = '');
