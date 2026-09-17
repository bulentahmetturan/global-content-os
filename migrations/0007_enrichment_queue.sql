-- Async LLM enrichment queue (Workers AI: structured evidence → TR title + 1-line gist).
ALTER TABLE source_items ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE source_items ADD COLUMN enrichment_json TEXT;
ALTER TABLE source_items ADD COLUMN enrichment_error TEXT;
ALTER TABLE source_items ADD COLUMN enriched_at TEXT;

CREATE INDEX IF NOT EXISTS idx_source_items_enrichment
  ON source_items(enrichment_status, fetched_at);

-- Re-queue existing inbox cards for structured enrich (gtx path retired).
UPDATE source_items
SET enrichment_status = 'pending',
    enrichment_error = NULL
WHERE triage_status = 'inbox';
