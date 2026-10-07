# WAVE 2 SOURCE ENVELOPE — DRAFT (Mediterranean Diet)

> Metadata only (title / publisher / date / URL / role). No source content
> fetched. Roles follow P0 authority vocabulary. Owner target approval still
> pending; P-5 verifies each entry before use.

## Candidate 1 — DGA 2020-2025 Healthy Mediterranean-Style Eating Pattern

- Title: Dietary Guidelines for Americans, 2020-2025, Table A3-5
  (Healthy Mediterranean-Style Dietary Pattern, daily/weekly amounts)
- Publisher: USDA + HHS (statutory, 7 USC 5341; based on 2020 Advisory Committee report)
- Date: December 2020 (edition 2020-2025)
- URL: https://www.dietaryguidelines.gov/sites/default/files/2020-12/Dietary_Guidelines_for_Americans_2020-2025.pdf
- Roles: PROTOCOL_DEFINITION, VERSION_DEFINITION, COMPONENT_DEFINITION
- Notes: quantified, versioned (edition-dated) official pattern — recommended
  Wave-2 version scope. To verify in P-5: exact table values at reference
  calorie level + serving definitions.

## Candidate 2 — PREDIMED republication (NEJM 2018)

- Title: Primary Prevention of Cardiovascular Disease with a Mediterranean Diet
  Supplemented with Extra-Virgin Olive Oil or Nuts
- Publisher: The New England Journal of Medicine (investigator-led, funded by
  Instituto de Salud Carlos III et al.; foods donated, sponsors had no
  design/analysis role)
- Date: 13/21 June 2018; n=7447, median follow-up 4.8 y; HR 0.69 (EVOO) / 0.72
  (nuts) vs low-fat control; ISRCTN35739639
- URL: https://doi.org/10.1056/NEJMoa1800389 — PMID 29897866
- Roles: CLAIM_SUPPORT (primary-prevention CVD effect), COMPONENT_DEFINITION
  (trial intervention Table 1 ONLY — not the version scope)
- Integrity flag (mandatory): supersedes the RETRACTED 2013 report
  (DOI 10.1056/NEJMoa1200303, PMID 23432189; retraction PMID 29897867).
  P-5 must cite 2018 only and record the retraction as CONTEXT.

## Candidate 3 — WHO Europe HEN synthesis report (Mediterranean + Nordic diets)

- Title: What national and subnational interventions and policies based on
  Mediterranean and Nordic diets are recommended or implemented in the WHO
  European Region… (Health Evidence Network synthesis)
- Publisher: WHO Regional Office for Europe
- Date: 8 August 2019 (report); symposium May 2018
- URL: https://www.who.int/europe/publications/i/item/9789289053013
- Roles: CLAIM_SUPPORT (context: traditional-pattern description + policy
  effectiveness evidence), never version scope
- Notes: traditional pattern characterization (plant foods + olive oil;
  moderate fish/poultry; low dairy/red meat/sweets).

## Candidate 4 — WHO/FAO healthy-diet principles (context reserve)

- Title: Healthy diet fact sheet + FAO/WHO joint statement "What are healthy
  diets?" (four principles: adequacy, balance, moderation, diversity)
- Publisher: WHO (+ FAO)
- Date: fact sheet reviewed January 2026; joint statement via iris.who.int
- Roles: CLAIM_SUPPORT (context only) — generic principles, not Mediterranean definition
- Notes: use only if a context claim needs it; otherwise leave out (bounded).

## Explicitly excluded as definition

- News/editorial coverage including medicalNEWS (secondary at most, never
  canonical structure).
- Harvard Chan / UCLA-style summaries (unverified here; secondary at most).
- The retracted 2013 PREDIMED report (integrity exclusion, not a candidate).

## To verify in P-5 (execution)

- ESC prevention-guideline Mediterranean recommendation (candidate CLAIM_SUPPORT,
  not yet verified — verify or drop).
- DGA Table A3-5 exact values + citation page/section locators.
- PREDIMED Table 1 intervention details (component-boundary check only).
- Actor decision: USDA/HHS as issuing institutions (edge type TBD, no persons).
