-- 0043 Protocol Real Data Wave 2: Mediterranean Diet (data only, no schema change).
-- Deterministic controlled import of the owner-approved second real-data
-- protocol target (approval: docs/PROTOCOL-WAVE2-OWNER-APPROVAL.md, local
-- scope). All rows reference verified authoritative material:
--   [dga]   Dietary Guidelines for Americans, 2015-2020, Appendix 4, Table A4-1
--           (Healthy Mediterranean-Style Eating Pattern at 12 calorie levels;
--           reference level 2,000 cal/day) + Chapter 1 limits (sodium <2,300 mg,
--           saturated fat <10%, added sugars <10%) — verified via the official
--           health.gov chapter/appendix pages (ODPHP), archived capture
--           2020-01-11. NOTE: version scope is the VERIFIED 2015-2020 table,
--           not the 2020-2025 edition (whose values are unparseable with
--           available tooling; same pattern family, authority-over-recency).
--   [predimed] Estruch R et al., NEJM 2018;378:e34. PMID 29897866,
--           DOI 10.1056/NEJMoa1800389 (republication; n=7447, HR 0.69 EVOO /
--           0.72 nuts vs low-fat control). The RETRACTED 2013 report
--           (DOI 10.1056/NEJMoa1200303, PMID 23432189; retraction PMID 29897867)
--           is deliberately ABSENT here — integrity exclusion, recorded in docs.
-- Rerunnable: every INSERT below is idempotent; a second apply changes
-- nothing. Forward-only. Remote apply + deploy each require explicit
-- authorization (Wave-2 production is NOT authorized by the local-scope
-- approval).
--
-- Importer-row convention (as in 0042): source_items rows placed by this
-- controlled import carry feed_id of the channel-correct research feed;
-- fetch provenance is NOT claimed via feed_id but via discovery_reason
-- ('protocol-wave-2-med-controlled-import') and the canonical_url itself.
-- No phases: Mediterranean pattern is structurally non-phased. No safety
-- rows (none explicitly evidenced). No commercial rows (public-domain
-- pattern). No actor rows: USDA/HHS references stay PENDING_DOCTORS_REFERENCE
-- (no matching Doctors actors found; creation is a later governance decision).

-- 1. Version (internal seq; label cites the verified table).
INSERT INTO protocol_versions (version_id, protocol_id, version_seq, version_label)
VALUES ('med-v1', 'mediterranean-diet', 1, 'DGA 2015-2020, Appendix 4, Table A4-1 (2,000-calorie reference)')
ON CONFLICT(version_id) DO NOTHING;

-- 2. Components: Table A4-1 at 2,000 cal/day + Chapter 1 limits ([dga]).
INSERT INTO protocol_components (component_id, version_id, phase_id, component_seq, title, detail)
VALUES
  ('med-comp-vegetables', 'med-v1', NULL, 1, 'Vegetables: 2.5 cup-equivalents per day',
   'Weekly subgroups: dark-green 1.5, red and orange 5.5, legumes (beans/peas) 1.5, starchy 5, other 4 cup-eq.'),
  ('med-comp-fruits', 'med-v1', NULL, 2, 'Fruits: 2.5 cup-equivalents per day',
   'Whole fruit emphasized; 1/2 cup dried fruit counts as 1 cup-eq.'),
  ('med-comp-grains', 'med-v1', NULL, 3, 'Grains: 6 ounce-equivalents per day',
   'Whole grains 3 oz-eq, refined grains 3 oz-eq; at least half whole. 1 slice bread = 1 oz-eq.'),
  ('med-comp-dairy', 'med-v1', NULL, 4, 'Dairy: 2 cup-equivalents per day',
   'Fat-free or low-fat milk, yogurt, cheese, or fortified soy beverage. Less than U.S.-Style (lower calcium/vitamin D noted in pattern).'),
  ('med-comp-protein', 'med-v1', NULL, 5, 'Protein foods: 6.5 ounce-equivalents per day',
   'Weekly subgroups: seafood 15, meats/poultry/eggs 26, nuts/seeds/soy 5 oz-eq. More seafood, less meat/poultry than U.S.-Style.'),
  ('med-comp-oils', 'med-v1', NULL, 6, 'Oils: 27 grams per day',
   'High-monounsaturated/polyunsaturated liquid oils (e.g. olive oil); replace solid fats, do not add on top.'),
  ('med-comp-sodium-limit', 'med-v1', NULL, 7, 'Sodium: less than 2,300 mg per day',
   'Chapter 1 limit for adults and children 14+; linear dose-response with blood pressure.'),
  ('med-comp-saturated-fat-limit', 'med-v1', NULL, 8, 'Saturated fats: less than 10 percent of calories per day',
   'Replace with unsaturated fats; no dietary requirement for saturated fats.'),
  ('med-comp-added-sugars-limit', 'med-v1', NULL, 9, 'Added sugars: less than 10 percent of calories per day',
   'Naturally occurring sugars in fruit/milk are not added sugars.')
ON CONFLICT(component_id) DO NOTHING;

-- 3. Source items (controlled-import rows; see convention note above).
INSERT INTO source_items
  (id, feed_id, route, channel_id, title, summary, canonical_url, publisher, published_at,
   triage_status, dedupe_key, acquisition_path, evergreen_view, discovery_mode, discovery_reason, canonical_work_id)
VALUES
  ('med-item-dga-2015', 'europe-pmc-batch', 'kaduse-research', 'kaduse-medikal',
   'Dietary Guidelines for Americans, 2015-2020: Appendix 4 (Healthy Mediterranean-Style Eating Pattern)',
   'Official USDA/HHS Mediterranean-Style pattern table at 12 calorie levels plus Chapter 1 limits.',
   'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',
   'U.S. Department of Agriculture and U.S. Department of Health and Human Services', NULL,
   'inbox', 'https://health.gov/dietaryguidelines/2015/guidelines/appendix-4/',
   'EVERGREEN', 'research_rediscovery', 'EVERGREEN_REDISCOVERY', 'protocol-wave-2-med-controlled-import', NULL),
  ('med-item-predimed-2018', 'europe-pmc-batch', 'kaduse-research', 'kaduse-medikal',
   'Primary Prevention of Cardiovascular Disease with a Mediterranean Diet Supplemented with Extra-Virgin Olive Oil or Nuts.',
   'Republished RCT n=7447: Mediterranean diet lowered major cardiovascular events versus low-fat control.',
   'https://pubmed.ncbi.nlm.nih.gov/29897866/',
   'The New England Journal of Medicine', '2018-06-21',
   'inbox', 'https://pubmed.ncbi.nlm.nih.gov/29897866/',
   'EVERGREEN', 'research_rediscovery', 'EVERGREEN_REDISCOVERY', 'protocol-wave-2-med-controlled-import',
   '10.1056/nejmoa1800389')
ON CONFLICT(id) DO NOTHING;

-- 4. Claims (clean propositions; version-scoped to med-v1).
INSERT INTO protocol_claims
  (claim_id, protocol_id, protocol_version_id, phase_id, component_id, claim_type, claim_text)
VALUES
  ('clm_med_definition', 'mediterranean-diet', 'med-v1', NULL, NULL, 'DEFINITION',
   'The Healthy Mediterranean-Style Eating Pattern at 2,000 calories provides 2.5 cup-eq vegetables, 2.5 cup-eq fruits, 6 oz-eq grains, 2 cup-eq dairy, 6.5 oz-eq protein foods, and 27 g oils per day, with sodium below 2,300 mg.'),
  ('clm_med_mace_reduction', 'mediterranean-diet', 'med-v1', NULL, NULL, 'OUTCOME',
   'Mediterranean diet supplemented with extra-virgin olive oil or nuts lowered major cardiovascular events (hazard ratio 0.69 and 0.72 versus low-fat control) in high-risk adults over median 4.8 years.'),
  ('clm_med_stroke_reduction', 'mediterranean-diet', 'med-v1', NULL, NULL, 'OUTCOME',
   'Mediterranean diet with nuts lowered stroke incidence (hazard ratio 0.54 versus control); with extra-virgin olive oil the hazard ratio was 0.67.')
ON CONFLICT(claim_id) DO NOTHING;

-- 5. Evidence (pointers; material lives in source_items above).
INSERT INTO protocol_evidence (evidence_id, source_item_id, locator)
VALUES
  ('ev_med_dga_2015', 'med-item-dga-2015', 'Appendix 4, Table A4-1, 2,000-calorie column; Chapter 1 limits'),
  ('ev_med_predimed_2018', 'med-item-predimed-2018', 'PMID:29897866; DOI:10.1056/NEJMoa1800389')
ON CONFLICT(evidence_id) DO NOTHING;

-- 6. Claim-evidence links (direction on the link).
INSERT INTO claim_evidence_links (claim_id, evidence_id, direction)
VALUES
  ('clm_med_definition', 'ev_med_dga_2015', 'SUPPORTS'),
  ('clm_med_mace_reduction', 'ev_med_predimed_2018', 'SUPPORTS'),
  ('clm_med_stroke_reduction', 'ev_med_predimed_2018', 'SUPPORTS')
ON CONFLICT(claim_id, evidence_id) DO NOTHING;
