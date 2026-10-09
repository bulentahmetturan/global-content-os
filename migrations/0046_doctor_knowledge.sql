-- Doctor knowledge: publications/events and statements (LOCAL ONLY; not applied
-- remotely, no deploy). Additive only: two new tables with foreign keys into
-- the existing actors table; no existing table, row, trigger or index is read
-- or rewritten.
--
-- Separation rule (binding): profile identity stays in actors/actor_aliases;
-- publications here are attestations of appearance; statements cover
-- doctor-origin claims with an explicit evidence status. A doctor's statement
-- is NEVER stored as validated medical fact: the CHECK below has no VALIDATED
-- value by design.

CREATE TABLE IF NOT EXISTS doctor_publications (
  publication_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  kind TEXT NOT NULL CHECK (kind IN (
    'ARTICLE', 'RESEARCH_PAPER', 'INTERVIEW', 'PUBLIC_STATEMENT',
    'VIDEO', 'EVENT', 'OTHER'
  )),
  title TEXT NOT NULL,
  publisher TEXT,
  published_at TEXT,
  canonical_url TEXT,
  source_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (actor_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS idx_doctor_publications_actor
  ON doctor_publications(actor_id, published_at);

CREATE TABLE IF NOT EXISTS doctor_statements (
  statement_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  publication_id TEXT REFERENCES doctor_publications(publication_id),
  statement_text TEXT NOT NULL,
  statement_class TEXT NOT NULL CHECK (statement_class IN (
    'HEALTH_CLAIM', 'CLINICAL_RECOMMENDATION', 'PROTOCOL_REFERENCE', 'GENERAL'
  )),
  evidence_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (evidence_status IN (
    'UNKNOWN', 'UNVERIFIED', 'CONTESTED', 'SUPERSEDED'
  )),
  extracted_at TEXT NOT NULL,
  supersedes_id TEXT REFERENCES doctor_statements(statement_id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (supersedes_id IS NULL OR supersedes_id != statement_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_statements_actor
  ON doctor_statements(actor_id, statement_class);
CREATE INDEX IF NOT EXISTS idx_doctor_statements_publication
  ON doctor_statements(publication_id);
