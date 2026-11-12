-- a007 Provenance of owner-introduced wow articles (Bible v5 §13.4 DEC-R-20261112-030) (additive, idempotent).
--   wow_provenance  the owner's record number (WOW-NNNN) and where the article came from (a doctor's list such as "Ahmet Ekmekci Kumulatif Liste #7",
--                   or "Sahip ek listesi"). Shown on the Sorular card; it is provenance, not a score: a doctor's pick is a candidate until the owner answers.
-- Optional: the question list works without it (no provenance line). Rollback: DROP TABLE wow_provenance;
CREATE TABLE IF NOT EXISTS wow_provenance (
  item_id TEXT PRIMARY KEY,
  wow_id TEXT,
  source_reference TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
