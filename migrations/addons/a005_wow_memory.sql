-- a005 Wow editorial memory (Bible v5 §1.3, §4.1, §4.6, §10; DEC-R-20261111-025 stages 2-4, DEC-R-20261112-027) (additive, idempotent).
-- One place for what the owner finds valuable and why, and for what the system did with it:
--   wow_reasons      the shared wow-reason tags. Seeds are PROPOSED; a tag becomes ACTIVE the first time the owner uses or adds it.
--   wow_extractions  what the system read out of an introduced article (topic units, the two sides of the relation, the PROBABLE
--                    wow reason). It is the system's guess and is kept apart from the owner's own reason (wow_feedback).
--   wow_relations    relations the owner approved from an article (state as in §4.1). Repo topic plans keep their own relations.
--   wow_queries      one journal-free search per relation, versioned; REVIEW = low scores, the owner is asked, it still runs.
--   wow_hits         which query brought which item: the only basis of the "why it came" text.
--   wow_feedback     the owner's answer: score, feedback kind (which part must change), own reason tags + sentence, item/general scope.
-- Optional like a001-a004: lives outside the frozen migration authority; the memory routes answer 503 WOW_MEMORY_NOT_READY until it
-- exists and ingestion skips hit recording. Rollback: DROP TABLE wow_feedback, wow_hits, wow_queries, wow_relations, wow_extractions, wow_reasons.
CREATE TABLE IF NOT EXISTS wow_reasons (
  code TEXT PRIMARY KEY,
  name_tr TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (state IN ('PROPOSED', 'ACTIVE', 'REJECTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO wow_reasons (code, name_tr) VALUES
  ('COUNTERINTUITIVE', 'Beklenenin tersi sonuç'),
  ('DAILY_HABIT_BIG_EFFECT', 'Günlük alışkanlık, büyük etki'),
  ('LARGE_EFFECT', 'Çok büyük etki'),
  ('MYTH_BUSTING', 'Yaygın inanışı çürütüyor'),
  ('NEW_MECHANISM', 'Yeni mekanizma veya ilk kez gösterilen bulgu'),
  ('PRACTICE_CHANGING', 'Klinik pratiği değiştirebilir'),
  ('REVERSIBILITY', 'Geri döndürülebilirlik, toparlanma'),
  ('BIG_SAMPLE_LONG_FOLLOWUP', 'Çok büyük örneklem veya uzun takip');

CREATE TABLE IF NOT EXISTS wow_extractions (
  item_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('rules', 'llm')),
  topic_ids TEXT NOT NULL DEFAULT '[]',
  plan_units TEXT NOT NULL DEFAULT '[]',
  side_a TEXT NOT NULL DEFAULT '[]',
  side_b TEXT NOT NULL DEFAULT '[]',
  probable_reason TEXT,
  study_type TEXT,
  state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (state IN ('PROPOSED', 'CONFIRMED', 'CORRECTED', 'REJECTED')),
  relation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT,
  PRIMARY KEY (item_id, extractor_version)
);

CREATE TABLE IF NOT EXISTS wow_relations (
  relation_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  a_terms TEXT NOT NULL,
  b_terms TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (state IN ('PROPOSED', 'ACTIVE', 'REJECTED', 'SNOOZED')),
  origin_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS wow_queries (
  query_id TEXT PRIMARY KEY,
  relation_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  query TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'REVIEW', 'CLOSED')),
  last_run_at TEXT,
  last_total INTEGER,
  last_created INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_wow_queries_relation ON wow_queries(relation_id, version);

CREATE TABLE IF NOT EXISTS wow_hits (
  item_id TEXT NOT NULL,
  query_id TEXT NOT NULL,
  relation_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (item_id, query_id)
);
CREATE INDEX IF NOT EXISTS idx_wow_hits_query ON wow_hits(query_id);

CREATE TABLE IF NOT EXISTS wow_feedback (
  feedback_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  wow INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('wow', 'ordinary', 'topic_wrong', 'weak_evidence', 'channel', 'repeat', 'study_type', 'skip')),
  reason_codes TEXT NOT NULL DEFAULT '[]',
  sentence TEXT,
  scope TEXT NOT NULL DEFAULT 'item' CHECK (scope IN ('item', 'general')),
  title_orig TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_wow_feedback_item ON wow_feedback(item_id, created_at);
