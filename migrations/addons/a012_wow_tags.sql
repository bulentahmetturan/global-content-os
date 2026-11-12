-- a012 Article tags decided from the article itself (Bible v5 §13.4 DEC-R-20261112-039) (additive).
--   wow_extractions.tags_json  {"topics":["Sigara ve tütün kullanımı","Kalp hastalığı"],"relations":[["Sigara ve tütün kullanımı","Kalp hastalığı"]]}
--   One Turkish name per single topic (as many as the article has) and the relations between them. Each tag has a "+" on the card.
-- Optional: without it the card falls back to the plan topic / side labels. Rollback: none needed (nullable column).
ALTER TABLE wow_extractions ADD COLUMN tags_json TEXT;
