-- Permanent, storage-light ledger of canonical URLs that have already reached a triage decision
-- (promoted, completed, or deleted). source_items rows in 'trash' get hard-deleted by
-- purgeExpiredTrash after a couple of days, so without this a "most read / trending" scrape that
-- re-lists the same popular article a week later would look brand new to upsertSourceItem and get
-- re-ingested, re-reviewed, and re-decided every time it resurfaces on the source's list.
-- Key is a truncated SHA-256 of the canonicalized URL (16 hex chars = 64 bits), not the URL text
-- itself, to keep this table small as it grows without bound (rollback: DROP TABLE decided_links).
CREATE TABLE IF NOT EXISTS decided_links (
  url_key TEXT PRIMARY KEY,
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
