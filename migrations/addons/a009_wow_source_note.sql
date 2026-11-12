-- a009 Source note of owner-introduced wow articles (Bible v5 §13.4 DEC-R-20261112-032) (additive).
--   wow_provenance.source_note  what the source (a doctor's list, the owner's list) says about the article: study design, scope, limits.
--                               Shown in the description of the Sorular card in neutral wording; the title stays the article's own title.
-- Optional: the question list works without it. Rollback: none needed (an unused nullable column); SQLite DROP COLUMN if wanted.
ALTER TABLE wow_provenance ADD COLUMN source_note TEXT;
