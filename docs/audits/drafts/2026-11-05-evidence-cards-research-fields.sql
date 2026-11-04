-- DRAFT, NOT A MIGRATION (kept out of migrations/ on purpose: a new migrations/ file raises EXPECTED_SCHEMA_MIGRATION and
-- blocks deploys until applied). Needs explicit owner approval, then: rename to the next number, apply to D1, deploy.
-- Bible 4.3 Research fields that have no column today (field gap report C1-C6). All nullable; NULL = UNKNOWN (Bible 9.3).
ALTER TABLE evidence_cards ADD COLUMN population TEXT;
ALTER TABLE evidence_cards ADD COLUMN sample_size INTEGER;
ALTER TABLE evidence_cards ADD COLUMN human_animal_invitro TEXT;      -- human | animal | in_vitro | in_silico | mixed
ALTER TABLE evidence_cards ADD COLUMN primary_endpoint TEXT;
ALTER TABLE evidence_cards ADD COLUMN effect_measure TEXT;
ALTER TABLE evidence_cards ADD COLUMN absolute_effect TEXT;
ALTER TABLE evidence_cards ADD COLUMN relative_effect TEXT;
ALTER TABLE evidence_cards ADD COLUMN confidence_interval TEXT;
ALTER TABLE evidence_cards ADD COLUMN external_validity TEXT;
ALTER TABLE evidence_cards ADD COLUMN evidence_strength TEXT;
ALTER TABLE evidence_cards ADD COLUMN conflicts_of_interest TEXT;
ALTER TABLE evidence_cards ADD COLUMN funding_source TEXT;
ALTER TABLE evidence_cards ADD COLUMN peer_review_status TEXT;        -- peer_reviewed | preprint | unknown
ALTER TABLE evidence_cards ADD COLUMN preprint_status TEXT;
ALTER TABLE evidence_cards ADD COLUMN retraction_status TEXT;         -- none | correction | expression_of_concern | retracted | unknown
ALTER TABLE evidence_cards ADD COLUMN integrity_checked_at TEXT;      -- last re-check (Bible 13.4)
ALTER TABLE evidence_cards ADD COLUMN access_level TEXT;              -- OPEN_FULL_TEXT | OPEN_ABSTRACT_ONLY | PARTIAL_PUBLIC_RESULTS | PAYWALLED_WITH_USABLE_ABSTRACT | INSUFFICIENT_PUBLIC_INFORMATION
ALTER TABLE evidence_cards ADD COLUMN online_published_at TEXT;       -- Bible 4.3
ALTER TABLE evidence_cards ADD COLUMN print_issue_at TEXT;
ALTER TABLE evidence_cards ADD COLUMN indexed_at TEXT;
ALTER TABLE evidence_cards ADD COLUMN original_study_link TEXT;       -- Bible 13.6 (media/bulletin candidates)
ALTER TABLE evidence_cards ADD COLUMN research_topic TEXT;            -- Bible 11.6 vocabulary key
