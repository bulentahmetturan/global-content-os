-- a011 Turkish topic labels for the two sides of an article's relation (Bible v5 §13.4 DEC-R-20261112-036) (additive).
--   wow_extractions.label_a / label_b  short Turkish names of the studied factor and of the outcome (e.g. "Sigara", "Kalp hastalığı").
--   They are what the card shows as single-topic tags; the English side terms stay the search terms.
-- Optional: without them the card falls back to the plan topic name or the English term. Rollback: none needed (nullable columns).
ALTER TABLE wow_extractions ADD COLUMN label_a TEXT;
ALTER TABLE wow_extractions ADD COLUMN label_b TEXT;
