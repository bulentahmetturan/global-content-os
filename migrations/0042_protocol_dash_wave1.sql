-- 0042 Protocol Real Data Wave 1: DASH (data only, no schema change).
-- Deterministic controlled import of the owner-designated first real-data
-- protocol target. All rows reference verified authoritative material:
--   [booklet] NIH Publication No. 06-4082, "Your Guide to Lowering Your Blood
--             Pressure with DASH", originally printed 1998, revised April 2006
--             (https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf)
--   [trial]   Appel LJ et al., NEJM 1997;336:1117-24. PMID 9099655,
--             DOI 10.1056/NEJM199704173361601 (verified via Europe PMC REST)
--   [sodium]  Sacks FM et al., NEJM 2001;344:3-10. PMID 11136953,
--             DOI 10.1056/NEJM200101043440101 (verified via Europe PMC REST)
-- Rerunnable: every INSERT below is idempotent (PK / UNIQUE / ON CONFLICT DO
-- NOTHING semantics); a second apply changes nothing. Forward-only. Remote
-- apply requires explicit authorization (PROTOCOL_DASH_PRODUCTION_POPULATION).
--
-- Importer-row convention (documented, auditable): source_items rows placed
-- by this controlled import carry feed_id of the channel-correct research
-- feed; fetch provenance is NOT claimed via feed_id but via discovery_reason
-- ('protocol-wave-1-dash-controlled-import') and the canonical_url itself.
-- No News/HABER routing: all items are EVERGREEN research_rediscovery.
-- No phases: DASH is structurally a non-phased eating pattern (verified in
-- [booklet]). No safety rows: no formal DASH contraindication text verified.
-- No commercial rows: DASH is public-domain NHLBI material. One institutional
-- actor (NHLBI, issuing institution of [booklet]) + one ASSOCIATED_WITH edge.

-- 1. Version (internal seq; human label cites the authoritative edition).
INSERT INTO protocol_versions (version_id, protocol_id, version_seq, version_label)
VALUES ('dash-v1', 'dash-eating-plan', 1, 'NIH Publication No. 06-4082 (Revised April 2006)')
ON CONFLICT(version_id) DO NOTHING;

-- 2. Components: Box 3 servings at 2,000 kcal/day + sodium levels ([booklet]).
INSERT INTO protocol_components (component_id, version_id, phase_id, component_seq, title, detail)
VALUES
  ('dash-comp-grains', 'dash-v1', NULL, 1, 'Grains: 6-8 servings per day',
   'Whole grains emphasized. Examples: 1 slice bread; 1 oz dry cereal; 1/2 cup cooked rice, pasta, or cereal.'),
  ('dash-comp-vegetables', 'dash-v1', NULL, 2, 'Vegetables: 4-5 servings per day',
   'Examples: 1 cup raw leafy vegetable; 1/2 cup cut-up raw or cooked vegetable; 1/2 cup vegetable juice.'),
  ('dash-comp-fruits', 'dash-v1', NULL, 3, 'Fruits: 4-5 servings per day',
   'Examples: 1 medium fruit; 1/2 cup fresh, frozen, or canned fruit; 1/4 cup dried fruit; 1/2 cup fruit juice.'),
  ('dash-comp-dairy', 'dash-v1', NULL, 4, 'Fat-free or low-fat milk and milk products: 2-3 servings per day',
   'Examples: 1 cup milk or yogurt; 1 1/2 oz cheese.'),
  ('dash-comp-protein', 'dash-v1', NULL, 5, 'Lean meats, poultry, and fish: 6 or fewer 1-oz servings per day',
   'Select lean only; trim visible fat. Example: 1 oz cooked meats, poultry, or fish; 1 egg counts here.'),
  ('dash-comp-nuts-legumes', 'dash-v1', NULL, 6, 'Nuts, seeds, and legumes: 4-5 servings per week',
   'Examples: 1/3 cup or 1 1/2 oz nuts; 2 Tbsp peanut butter; 1/2 cup cooked legumes.'),
  ('dash-comp-fats', 'dash-v1', NULL, 7, 'Fats and oils: 2-3 servings per day',
   'Examples: 1 tsp soft margarine; 1 tsp vegetable oil; 1 Tbsp mayonnaise; 2 Tbsp salad dressing.'),
  ('dash-comp-sweets', 'dash-v1', NULL, 8, 'Sweets and added sugars: 5 or fewer servings per week',
   'Examples: 1 Tbsp sugar; 1 Tbsp jelly or jam; 1/2 cup sorbet; 1 cup lemonade.'),
  ('dash-comp-sodium', 'dash-v1', NULL, 9, 'Sodium: 2,300 mg per day, reducible to 1,500 mg per day',
   '2,300 mg is about 1 teaspoon of table salt; 1,500 mg (about 2/3 teaspoon) lowers blood pressure further.')
ON CONFLICT(component_id) DO NOTHING;

-- 3. Institutional actor (issuing institution of [booklet]; no duplicate persons).
INSERT INTO actors (actor_id, canonical_name, normalized_name, panel, created_by, created_reason)
VALUES ('actor_nhlbi', 'National Heart, Lung, and Blood Institute', 'national heart lung and blood institute',
        'GLOBAL_EXPERT_PANEL', 'protocol-wave-1-dash', 'DASH Wave-1: issuing institution of the official DASH Eating Plan (NIH Publication No. 06-4082)')
ON CONFLICT(actor_id) DO NOTHING;

INSERT INTO actor_protocol_relationships
  (relationship_id, actor_id, protocol_id, protocol_version_id, relationship_type)
VALUES ('apr_dash_nhlbi', 'actor_nhlbi', 'dash-eating-plan', NULL, 'ASSOCIATED_WITH')
ON CONFLICT(relationship_id) DO NOTHING;

-- 4. Source items (controlled-import rows; see convention note above).
INSERT INTO source_items
  (id, feed_id, route, channel_id, title, summary, canonical_url, publisher, published_at,
   triage_status, dedupe_key, acquisition_path, evergreen_view, discovery_mode, discovery_reason, canonical_work_id)
VALUES
  ('dash-item-booklet', 'europe-pmc-batch', 'kaduse-research', 'kaduse-medikal',
   'Your Guide to Lowering Your Blood Pressure with DASH',
   'NIH Publication No. 06-4082 (revised April 2006): official DASH eating plan servings and sodium levels.',
   'https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf',
   'National Heart, Lung, and Blood Institute', '2006-04-01',
   'inbox', 'https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf',
   'EVERGREEN', 'research_rediscovery', 'EVERGREEN_REDISCOVERY', 'protocol-wave-1-dash-controlled-import', NULL),
  ('dash-item-trial-1997', 'europe-pmc-batch', 'kaduse-research', 'kaduse-medikal',
   'A clinical trial of the effects of dietary patterns on blood pressure. DASH Collaborative Research Group.',
   'RCT n=459: DASH combination diet lowered blood pressure versus control over 8 weeks.',
   'https://pubmed.ncbi.nlm.nih.gov/9099655/',
   'The New England Journal of Medicine', '1997-04-01',
   'inbox', 'https://pubmed.ncbi.nlm.nih.gov/9099655/',
   'EVERGREEN', 'research_rediscovery', 'EVERGREEN_REDISCOVERY', 'protocol-wave-1-dash-controlled-import',
   '10.1056/nejm199704173361601'),
  ('dash-item-sodium-2001', 'europe-pmc-batch', 'kaduse-research', 'kaduse-medikal',
   'Effects on blood pressure of reduced dietary sodium and the Dietary Approaches to Stop Hypertension (DASH) diet. DASH-Sodium Collaborative Research Group.',
   'RCT n=412: sodium reduction combined with DASH lowered blood pressure, greatest in combination.',
   'https://pubmed.ncbi.nlm.nih.gov/11136953/',
   'The New England Journal of Medicine', '2001-01-01',
   'inbox', 'https://pubmed.ncbi.nlm.nih.gov/11136953/',
   'EVERGREEN', 'research_rediscovery', 'EVERGREEN_REDISCOVERY', 'protocol-wave-1-dash-controlled-import',
   '10.1056/nejm200101043440101')
ON CONFLICT(id) DO NOTHING;

-- 5. Claims (clean propositions; version-scoped to dash-v1).
INSERT INTO protocol_claims
  (claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type, claim_text)
VALUES
  ('clm_dash_definition', 'dash-eating-plan', 'dash-v1', NULL, NULL, 'DEFINITION',
   'The DASH eating plan emphasizes vegetables, fruits, whole grains, and fat-free or low-fat dairy foods, with 6-8 daily grain servings at 2,000 kcal and sodium intake of 2,300 mg per day, reducible to 1,500 mg per day.'),
  ('clm_dash_bp_lowering', 'dash-eating-plan', 'dash-v1', NULL, NULL, 'OUTCOME',
   'Eight weeks of the DASH combination diet lowered systolic blood pressure by 5.5 mm Hg and diastolic by 3.0 mm Hg more than a control diet (11.4/5.5 mm Hg more in participants with hypertension).'),
  ('clm_dash_sodium_combined', 'dash-eating-plan', 'dash-v1', NULL, NULL, 'OUTCOME',
   'DASH combined with low sodium intake lowered systolic blood pressure by 7.1 mm Hg in participants without hypertension and 11.5 mm Hg in those with hypertension, versus control diet with high sodium.'),
  ('clm_dash_subgroup_response', 'dash-eating-plan', 'dash-v1', NULL, NULL, 'OTHER',
   'Blood-pressure effects of sodium reduction and DASH were observed with and without hypertension, across races and sexes, with larger effects in participants with hypertension.')
ON CONFLICT(claim_id) DO NOTHING;

-- 6. Attribution (issuing institution authors the definition claim only).
INSERT INTO claim_attributions (attribution_id, claim_id, actor_id, attribution_role)
VALUES ('cattr_dash_definition', 'clm_dash_definition', 'actor_nhlbi', 'AUTHOR')
ON CONFLICT(attribution_id) DO NOTHING;

-- 7. Evidence (pointers; material lives in source_items above).
INSERT INTO protocol_evidence (evidence_id, source_item_id, locator)
VALUES
  ('ev_dash_booklet', 'dash-item-booklet', 'NIH Publication No. 06-4082, Box 3 servings table; sodium levels'),
  ('ev_dash_trial_1997', 'dash-item-trial-1997', 'PMID:9099655; DOI:10.1056/NEJM199704173361601'),
  ('ev_dash_sodium_2001', 'dash-item-sodium-2001', 'PMID:11136953; DOI:10.1056/NEJM200101043440101')
ON CONFLICT(evidence_id) DO NOTHING;

-- 8. Claim-evidence links (direction on the link; one record, one direction each).
INSERT INTO claim_evidence_links (claim_id, evidence_id, direction)
VALUES
  ('clm_dash_definition', 'ev_dash_booklet', 'SUPPORTS'),
  ('clm_dash_bp_lowering', 'ev_dash_trial_1997', 'SUPPORTS'),
  ('clm_dash_sodium_combined', 'ev_dash_sodium_2001', 'SUPPORTS'),
  ('clm_dash_subgroup_response', 'ev_dash_sodium_2001', 'SUPPORTS')
ON CONFLICT(claim_id, evidence_id) DO NOTHING;
