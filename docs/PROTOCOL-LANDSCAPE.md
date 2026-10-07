# PROTOCOL LANDSCAPE — P0 research record (read-only)

> P0 output 1. Research only: no registry created, no source activated, no migration applied.
> Creator sites/books used for DEFINITION/ORIGIN/VERSION/COMMERCIAL only, never for efficacy.
> `UNVERIFIED` = not confirmed from an authoritative source in this pass; P1 must re-verify before registry write.
> Key evidence anchors: Seoul Consensus JNM 2025 (low-FODMAP Stmt 8); Cuffe et al Lancet GH 2025 NMA (28 RCT n=2338);
> Batra et al APT 2026 CDED MA (pooled remission 0.69); Cochrane CD001903 (keto-epilepsy); NICE NG217 (keto consider);
> NICE NG220 (MS); ESPEN IBD 2020/2023; KDIGO 2024 + KDOQI 2020 (CKD); ESPEN liver 2020 / oncology 2021;
> ADA Standards 2025; AHA 2021 Guidance + 2023 pattern ranking; Pardali Metabol Open 2025 (AIP Tables 2–4);
> Konijeti 2017 / Abbott 2019 / Ihnatowicz / McNeill (AIP pilots); WAVES Wahls vs Swank 2021.

Field key per candidate: classification | registry_state | protocol_type | family | parent |
generic_or_branded | origin | creator | definition_sources [confidence] |
claimed_populations → studied_populations | claimed_outcomes → studied_outcomes |
phases | major_components | direct_protocol_evidence | SR_status | RCT_status |
guideline_status | clinical_position | safety_flags | supervision_context |
commercial_context | evidence_maturity | identity_confidence | P1_recommendation | notes.
Source roles (§10) noted as D=definition O=origin C=creator R=research G=guideline S=SR Sf=safety Cm=commentary Di=discovery Co=commercial M=first-party-marketing.

## CARDIOMETABOLIC

### mediterranean-diet
- class GENERIC_DIETARY_PATTERN | state CANONICAL_READY | type DIETARY_PATTERN | family CARDIOMETABOLIC | parent —.
- generic | origin region/tradition | creator —. Def: PREDIMED ops, AHA 2021/2023, NHLBI [high]. Roles: D=G,R,S; C/M=n/a.
- claimed broad wellness/longevity → studied high-CVD-risk, T2D, HTN.
- claimed weight/cognition/cancer → studied CVD events, BP, glycemia.
- phases none. Components: veg/fruit/whole-grain/legumes/nuts/olive-oil/fish, low red-processed meat/sweets.
- direct: PREDIMED (+repub), Lyon, cohorts. SR YES. RCT YES.
- guideline: AHA Tier-1, ADA 2025 §5.30 (A CVD/B glycemia), ESC/EAS, DGA. Position GUIDELINE_RECOMMENDED.
- safety: low; alcohol-component + vit-K/allergy caveats. Supervision: routine.
- commercial: generic (books/apps reuse label). Maturity mature. Identity high. P1: include as first registry row.

### dash-eating-plan
- class MEDICAL_NUTRITION_THERAPY | state CANONICAL_READY | type THERAPEUTIC_DIET | family CARDIOMETABOLIC | parent —.
- generic (NHLBI definition owner) | origin NHLBI | creator —. Def: NHLBI DASH plan servings/sodium 1500–2300mg [high]. D=G.
- claimed weight/diabetes/CKD → studied pre-HTN/HTN BP (DASH, DASH-Sodium, OmniHeart).
- claimed broad → studied BP, LDL-C.
- phases none. Components: grains/veg/fruit/low-fat dairy/lean meat/fats-oils/nuts-legumes + sodium cap.
- direct: feeding RCTs. SR YES. RCT YES. Guideline: AHA Tier-1 (100), AHA/ACC HTN, ADA, DGA. Position GUIDELINE_RECOMMENDED.
- safety: low; K/Mg/phosphate adjust in advanced CKD, lactose. Supervision routine (+nephrology in CKD).
- commercial: generic. Maturity mature. Identity high. P1: include.

### portfolio-diet
- class GENERIC_DIETARY_PATTERN | state PROPOSED | type THERAPEUTIC_DIET | family CARDIOMETABOLIC | parent —.
- generic-academic (Toronto/St Michael's) | creator Jenkins et al. Def: JAMA 2002/03 4 pillars + 2021 adherence score [mid-high]. D=R.
- claimed CVD events/weight/diabetes → studied hypercholesterolemia LDL-C (~15–30%).
- phases none. Components: viscous fibre, soy/plant protein, nuts, plant sterols.
- direct: small RCTs. SR YES (LDL-C). RCT YES (surrogate). Guideline: components FDA-claim-recognized; no standalone pattern endorsement (UNVERIFIED). Position GUIDELINE_CONDITIONAL (components) / RESEARCH_EMERGING (named pattern).
- safety: low; fibre GI, nut/soy allergy, sitosterolemia. Supervision dietitian-advised.
- commercial: non-commercial. Maturity intermediate (surrogate, no event trial). Identity mid-high. P1: PROPOSED with surrogate-only flag.

### tlc-diet
- class GENERIC_DIETARY_PATTERN | state WATCH (historic map only) | type THERAPEUTIC_DIET | family CARDIOMETABOLIC | parent —.
- generic-historic (NCEP ATP III 2001-02, NHLBI manual). Def: sat-fat <7%, chol <200mg/d + fibre/stanols [high-historic]. D=G.
- claimed current CVD prevention → studied pre-statin-era LDL-C.
- direct: dated. SR dated. RCT dated. Guideline: superseded by 2013/2018 ACC/AHA cholesterol guidelines. Position OUTDATED (map-only).
- safety: low; risk only if used to defer statins. Supervision routine. Commercial none active. Maturity retired. Identity high. P1: alias/map row only, not a live protocol.

### low-glycemic-pattern
- class GENERIC_DIETARY_PATTERN | state PROPOSED | type MACRONUTRIENT_STRATEGY | family CARDIOMETABOLIC | parent —.
- generic-method (Sydney GI database; GI books commercial overlay). Def: Jenkins GI concept, Diabetes Care reviews; no universal GI/GL cutoff (UNVERIFIED threshold) [mid]. D=R, Co=books.
- claimed CVD/cancer/appetite → studied HbA1c/weight in pre-diabetes/T2D.
- phases none. Components: beans/lentils/intact grains/pasta prioritized; method not a complete diet.
- direct: small RCTs vs ADA diet. SR YES (Nutrients 2022; Cochrane CD005105 weight). RCT YES (small).
- guideline: ADA adjunct-permitted; Diabetes Canada; not ranked standalone (AHA 2023). Position GUIDELINE_CONDITIONAL (adjunct).
- safety: low; fructose/fat GI-gaming; hypoglycemia med-adjustment. Supervision routine (+diabetes meds review).
- commercial: GI-testing/certification logos. Maturity intermediate (heterogeneous). Identity mid (threshold varies). P1: PROPOSED as method modifier, needs cutoff freeze.

### low-carbohydrate-diet
- class GENERIC_DIETARY_PATTERN | state PROPOSED | type MACRONUTRIENT_STRATEGY | family LOW_CARB_FAMILY | parent low-carb-family.
- generic. Def: ADA 2026 >50–150g/d or <45% energy (non-ketogenic); EAL 2023 similar [mid]. D=G.
- claimed superior long-term fat-loss/CVD → studied ≤6-mo weight, TG/HDL, HbA1c in T2D/overweight (advantage washes out ≥12 mo).
- phases none. Components: carb cap + energy target.
- direct: large RCT base. SR YES. RCT YES. Guideline: ADA optional short-term monitored; AHA Tier-3. Position CONFLICTING_GUIDANCE.
- safety: LDL-C rise subset, fibre/micronutrient gaps, keto-flu, insulin/SU/SGLT2 interactions, pregnancy/CKD/T1D caution. Supervision: med-review required.
- commercial: books/apps/coaching. Maturity mature (short-term) / not-superior (long-term). Identity mid. P1: PROPOSED with duration-split claims.

### very-low-carbohydrate-ketogenic-clinical
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MACRONUTRIENT_STRATEGY | family LOW_CARB_FAMILY | parent low-carb-family.
- generic-clinical. Def: EAL/Frontiers <10% energy + <50g/d CHO sufficient for ketosis [mid]. D=R. Distinct from epilepsy KDT and consumer keto.
- claimed cancer/cognition/longevity → studied short-term T2D/weight/TG.
- phases none. Components: carb cap + normoprotein + fat + ketosis verification.
- direct: moderate (obesity/T2D SR/MA to 2023). SR YES. RCT YES (small/short).
- guideline: ADA short-term monitored; AHA Tier-4; neuro only for epilepsy. Position GUIDELINE_CONDITIONAL (narrow, supervised).
- safety: ketoacidosis (T1D/SGLT2), dyslipidemia, stones, deficiency, interactions. Supervision mandatory.
- commercial: programs, ketone meters. Maturity intermediate-narrow. Identity mid. P1: PROPOSED, firewall vs consumer-keto.

### consumer-keto-products
- class TREND_ONLY | state REJECT_NOT_A_PROTOCOL | type — | family — | parent —.
- branded-commercial (many owners, no definition control). Def: none canonical (borrows clinical language w/o ketosis verification) [low]. D=M/Co.
- claimed rapid fat-loss/metabolic reset → studied: none attributable.
- direct: none. SR NO. RCT NO. Guideline: none. Position NO_ESTABLISHED_POSITION.
- safety: clinical-KD risks + adulteration, cost, care-delay. Supervision n/a.
- commercial: HIGH (ketones, MLM oils, plans). Maturity non-evidence. Identity low. P1: REJECT as protocol; keep as commercial-context vocabulary only.

## MEDICAL / NEUROLOGY

### classic-ketogenic-diet-therapy
- class MEDICAL_NUTRITION_THERAPY | state CANONICAL_READY | type MEDICAL_NUTRITION_THERAPY | family KETOGENIC_DIET_THERAPY | parent ketogenic-diet-therapy.
- generic-hospital. Def: Wilder 1921; Intl KD Study Group; NICE NG217 Ev Rev 12 (4:1/3:1) [high]. D=G,R.
- claimed weight/migraine/MS/wellness → studied drug-resistant epilepsy children (freedom RR~3.16, ≥50% RR~5.8), infants, GLUT1-DS/PDHD.
- phases induction/maintenance/monitoring. Components: ratio-bound macros + vitamin/mineral supplementation + labs.
- direct: 13 RCT n=932 + JAMA Peds 2020. SR YES (Cochrane CD001903, low–very-low certainty). RCT YES.
- guideline: NICE NG217 consider (drug-resistant/specific syndromes, tertiary team); not routine. Position CLINICALLY_USED + GUIDELINE_CONDITIONAL.
- safety: GI, weight-loss, hypercholesterolemia, hypercalciuria/stones, growth slowing. Supervision: tertiary keto team mandatory.
- commercial: hospital teams; formula adjunct (KetoCal/Nutricia). Maturity established-niche. Identity high. P1: include; variant firewall vs consumer keto frozen.

### mct-ketogenic-diet
- class PROTOCOL_VARIANT | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family KETOGENIC_DIET_THERAPY | parent ketogenic-diet-therapy.
- generic. Def: Huttenlocher 1971; NICE NG217 grouped [mid]. D=R.
- claimed tolerance superiority → studied same epilepsy pool (Neal 2008 MCT arms).
- phases same. Components: MCT fraction + macros.
- direct: pooled in Cochrane; no standalone modern large RCT. SR PARTIAL. RCT PARTIAL.
- guideline: same NG217 bucket, not differentiated. Position CLINICALLY_USED (variant).
- safety: MCT-dose GI intolerance + keto risks. Supervision keto team. Commercial: MCT/formula vendors. Maturity established-variant, low use. Identity mid. P1: PROPOSED variant.

### modified-atkins-diet
- class PROTOCOL_VARIANT | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family KETOGENIC_DIET_THERAPY | parent ketogenic-diet-therapy.
- generic. Def: Atkins 1972 → Kossoff 2003 (10–20g CHO/d) [high]. D=R. Note: distinct from Atkins™ weight-loss brand (confusion risk → commercial flag).
- claimed weight-loss (conflated) → studied pediatric drug-resistant epilepsy (25% free, ≤60% ≥50%); adults weak (2 RCT n=141, NS); migraine pilots.
- phases none (outpatient start). Components: carb cap + encouraged fat, unrestricted protein.
- direct: MAD vs usual care + vs classic (1 RCT no-diff, 1 classic-superior). SR PARTIAL. RCT YES (small).
- guideline: NG217 same consider bucket; no separate MAD rec. Position CLINICALLY_USED (variant).
- safety: keto GI + dyslipidemia; dropout high (30–38%). Supervision keto team. Commercial: brand-confusion flag. Maturity established-variant / migraine experimental. Identity high. P1: PROPOSED variant.

### low-glycemic-index-treatment
- class PROTOCOL_VARIANT | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family KETOGENIC_DIET_THERAPY | parent ketogenic-diet-therapy.
- generic. Def: Pfeifer & Thiele 2005 [mid]. D=R.
- claimed diabetes/weight → studied pediatric drug-resistant epilepsy (JAMA Peds 2020 arm; Bongiovanni maintenance).
- phases none. Components: 40–60g/d low-GI carbs.
- direct: 1–2 small RCTs, narrative-only Cochrane. SR NO. RCT PARTIAL.
- guideline: NG217 grouped, no LGIT-specific rec. Position RESEARCH_EMERGING.
- safety: hypoglycemia if meds; long-term UNVERIFIED. Supervision keto team. Commercial none. Maturity experimental. Identity mid. P1: PROPOSED variant.

### mind-diet
- class GENERIC_DIETARY_PATTERN | state NEEDS_EVIDENCE_REVIEW | type DIETARY_PATTERN | family NEUROLOGY | parent —.
- generic-academic (Morris/Rush 2015). Def: 10 brain-healthy + 5 limit groups, 15-pt score [high]. D=R.
- claimed Alzheimer prevention → studied cohorts (decline/dementia) + pivotal null RCT (NEJM 2023 n=604 3y MIND vs control+CR: null cognition/MRI).
- phases none. Components: leafy greens/berries/nuts/olive-oil/whole-grains/fish/beans/poultry/wine limits.
- direct: cohorts + 1 null RCT. SR YES (cohorts). RCT YES (1 pivotal null).
- guideline: no dementia-prevention endorsement. Position RESEARCH_EMERGING (tested-and-null).
- safety: low; wine-component caution. Supervision routine. Commercial: books/apps. Maturity tested-null. Identity high. P1: NEEDS_EVIDENCE_REVIEW (do not promote as preventive).

### swank-diet
- class BRANDED_PROTOCOL | state NEEDS_EVIDENCE_REVIEW | type BRANDED_NUTRITION_PROTOCOL | family NEUROLOGY_MS | parent —.
- branded-legacy (Swank MS Foundation). Def: ≤10–15g sat-fat/d, no processed oils (book + swankmsdiet.org) [mid]. D=C.
- claimed halt progression/survival (uncontrolled 7-decade cohort) → studied RRMS fatigue/QoL/cognition (WAVES RCT n~77–87 vs Wahls 24–36wk: both ↓FSS, ↑QoL; secondary MSFC).
- phases none. Components: low-sat-fat whole foods.
- direct: 1 head-to-head RCT + 2026 cognition SR (16 studies, single-RCT signal). SR PARTIAL. RCT PARTIAL (1).
- guideline: NICE NG220 / NMS / MSUK — balanced diet only, no MS diet. Position NO_ESTABLISHED_POSITION.
- safety: EFA/fat-sol-vit gaps, weight-loss if unsupervised. Supervision dietitian-advised. Commercial: foundation books. Maturity legacy-observational + pilot. Identity mid. P1: NEEDS_EVIDENCE_REVIEW.

## AUTOIMMUNE / ELIMINATION

### autoimmune-protocol-aip
- class BRANDED_PROTOCOL | state NEEDS_EVIDENCE_REVIEW | type ELIMINATION_REINTRODUCTION_PROTOCOL | family AUTOIMMUNE_ELIMINATION | parent elimination-diet-framework.
- branded-origin (Ballantyne Paleo Approach; Autoimmune Wellness) now generic-named use. Def: phased elimination → reintro → personalization + lifestyle/coaching (creator site + Pardali 2025 Table 1) [mid]. D=C, R=pilots, Co=books/coaching.
- claimed any-autoimmune reversal → studied: IBD UCT n=15 (Konijeti 2017; 73% remission wk6, HBI 6.7→3.3, Mayo 5.8→1.2, CRP/FC NS, 1 obstruction/1 withdrawal); HT n=16 (Abbott 2019; QoL/MSQ/hsCRP improved, thyroid fx NS) + n=28 (Ihnatowicz; fT3/fT4 ↓ in-range, TPO NS); RA crossover n=9 (McNeill; RAPID3 ↓, fatigue/sleep/pain improved).
- claimed antibody/inflammation resolution → studied PRO-heavy, biomarkers flat/neutral, co-interventions (coaching, D/Fe repletion).
- phases ELIMINATION → REINTRODUCTION → PERSONALIZATION (required). Components: grain/legume/nightshade/dairy/egg/nut/seed/alcohol/additive elimination + reintro sequence + sleep/stress/movement/outdoors + dietitian/coach.
- direct: 4 tiny UCTs/crossover, high bias, no large RCT. SR emerging (preprint/review 2024–25, no RCT MA). RCT NO (no RCT).
- guideline: no ACG/ECCO/ESPEN/ATA/ACR rec. Position RESEARCH_EMERGING / NO_ESTABLISHED_POSITION.
- safety: stricture/obstruction (ileal CD raw-veg/meat), folate/B12/B2 gaps (50% Abbott), muscle-mass loss, med PK/PD unknown; avoid pregnancy/lactation/kids/ED-hx unsupervised. Supervision: dietitian + physician mandatory (SAFETY_REVIEW_REQUIRED=YES).
- commercial: books, coaching, meal-delivery. Maturity emerging-pilot. Identity mid. P1: NEEDS_EVIDENCE_REVIEW + NEEDS_SAFETY_REVIEW; claim matrix per pop×outcome (see reconciliation §8); never global SUPPORTED.

### wahls-protocol
- class MULTICOMPONENT_PROTOCOL | state NEEDS_IDENTITY_REVIEW | type MULTICOMPONENT_HEALTH_PROTOCOL | family AUTOIMMUNE_ELIMINATION + NEUROLOGY_MS | parent —.
- branded (Wahls Protocol® Terry Wahls). Def: modified-Paleo elimination levels + supplements/exercise/stim/meditation (book + trials as "modified Paleolithic elimination") [mid]. D=C.
- claimed reverse MS/ALS/autoimmunity → studied RRMS fatigue/QoL/MSFC/metabolic (WAVES + n=20 multimodal pilot 12-mo; within-group benefit, no superiority, short, self-report).
- phases levels/spectrum (versioned). Components: 9-cup veg/fruit + meat/fish + no grains/eggs/dairy/legumes/nightshades + lifestyle bundle.
- direct: small RCTs/pilots only; no diet-alone isolation. SR NO. RCT PARTIAL (small).
- guideline: no MS-therapy endorsement (NMS trial NCT05007483 ongoing). Position CREATOR_DEFINED / RESEARCH_EMERGING.
- safety: restriction burden, nutrient shortfalls vs US healthy pattern, supplement polypharmacy (UNVERIFIED list). Supervision dietitian + neuro. SAFETY_REVIEW_REQUIRED=YES.
- commercial: YES (book, courses/certification, menus, supplements). Maturity investigational. Identity low-mid (levels vary). P1: NEEDS_IDENTITY_REVIEW first (freeze levels/versions), then evidence.

### general-elimination-diet-framework
- class PROTOCOL_FAMILY | state PROPOSED (framework, not a prescribable protocol) | type ELIMINATION_REINTRODUCTION_PROTOCOL | family AUTOIMMUNE_ELIMINATION | parent —.
- generic-clinical. Def: allergy diagnostic elim/rechallenge; EoE SFED/elemental; FODMAP 3-phase (Monash/ACG) [high]. D=G.
- claimed → studied varies by child (see eoe-stepup, food-allergy-elim, low-fodmap).
- phases elimination → reintroduction → personalization. Components: variable by indication.
- direct/SR/RCT: see children. Guideline: see children. Position framework.
- safety: inadequacy if prolonged; endoscopy/anaphylaxis contexts. Supervision indication-specific.
- commercial: dietitian + Monash app. Maturity mature (as framework). Identity high (as family). P1: include as FAMILY node only.

### low-histamine-diet
- class CLAIM_ONLY | state WATCH | type ELIMINATION_REINTRODUCTION_PROTOCOL | family AUTOIMMUNE_ELIMINATION | parent elimination-diet-framework.
- generic (no standard). Def: no official list — hospital lists vary; DAO hypothesis UNVERIFIED [low]. D=Cm.
- claimed migraine/MCAS/IBS/histamine-intolerance → studied CSU small RCTs/observational (1/3 benefit cited JDV 2017), case reports.
- phases UNVERIFIED. Components: variable exclusion lists.
- direct: low-quality heterogeneous. SR scoping-only. RCT PARTIAL (tiny CSU).
- guideline: EAACI/GA2LEN/WAO CSU 2021 — no routine elimination; short pseudoallergen trial only in selected GI-feature cases (not LHD per se). Position NO_ESTABLISHED_POSITION.
- safety: malnutrition, over-restriction, DAO-supplement UNVERIFIED, workup delay. Supervision dietitian + allergist if trialed. SAFETY_REVIEW_REQUIRED=YES.
- commercial: DAO supplements, testing kits (low-evidence). Maturity experimental, definition-unstable. Identity low. P1: WATCH; do not register until consensus list exists.

### low-fodmap-diet
- class MEDICAL_NUTRITION_THERAPY | state CANONICAL_READY | type ELIMINATION_REINTRODUCTION_PROTOCOL | family GI_THERAPEUTIC | parent elimination-diet-framework.
- generic + licensed (Monash). Def: fermentable oligo/di/mono/polyols; Seoul 2025 3-phase (elim 3–6wk → reintro → personalise, dietitian-led) [high]. D=R+G.
- claimed IBD/SIBO/endo → studied IBS global RR1.51, IBS-SSS −66.2 (Seoul 14 RCTs); NMA 28 RCT n=2338: global rank 4th (RR 0.51), pain 5th (0.61), only diet superior for bloating (0.55), superior to BDA/NICE for bowel habit; QoL improved.
- phases REQUIRED (3). Components: FODMAP substitution + reintro + personalization.
- direct: multiple SR/NMA (Gut 2022, Lancet GH 2025, umbrella 2025: SSS SMD−0.60, QoL +0.26; moderate certainty vs habitual only). SR YES. RCT YES (24).
- guideline: Seoul 2025 weak/low (effective, dietitian); ACG 2021 limited trial; AGA 2021 CPU most-evidenced; NICE CG61 consider + dietitian. Position GUIDELINE_CONDITIONAL (second-line, dietitian-gated).
- safety: Bifidobacteria ↓, Ca/Fe/Mg ↓, microbiota shift, ED risk; long-term/personalization UNVERIFIED (elim-phase only studied). Supervision: trained GI dietitian mandatory. SAFETY_REVIEW_REQUIRED=YES (class-level).
- commercial: Monash app/certification, dietitian programs, low-FODMAP foods. Maturity established (IBS symptom). Identity high. P1: include with phase tags.

### gaps-diet
- class BRANDED_PROTOCOL | state NEEDS_EVIDENCE_REVIEW | type BRANDED_NUTRITION_PROTOCOL | family GI_AUTOIMMUNE | parent elimination-diet-framework.
- branded (Campbell-McBride 2004 book). Def: staged intro → full GAPS; broth/meat/fermented/selective dairy; no grains/starch/refined; leaky-gut→brain claim (leaky gut not an official diagnosis) [low-mid]. D=C.
- claimed ASD/ADHD/dyslexia/depression/schizophrenia/OCD/epilepsy/bipolar → studied ASD GI/behavior weakly (n=17 small, insufficient design).
- phases staged intro/full (versioned). Components: staged animal/broth/fermented foods.
- direct: no large controlled trial; 2025 scoping: insufficient. SR NO. RCT NO.
- guideline: no autism/GI endorsement. Position CREATOR_DEFINED.
- safety: intro phases nutritionally inadequate; growth/deficiency risk in children; care-delay. Supervision: pediatric + dietitian mandatory if ever trialed. SAFETY_REVIEW_REQUIRED=YES.
- commercial: books, certified practitioners/training. Maturity anecdote-only. Identity low-mid. P1: NEEDS_EVIDENCE_REVIEW + NEEDS_SAFETY_REVIEW; WATCH until RCT.

## GI / MEDICAL NUTRITION

### specific-carbohydrate-diet
- class BRANDED_PROTOCOL | state NEEDS_EVIDENCE_REVIEW | type THERAPEUTIC_DIET | family GI_THERAPEUTIC | parent —.
- branded-popular (Gottschall book). Def: grain/disaccharide-free whole-food; no society definition [low-mid]. D=C.
- claimed IBD remission/mucosal healing → studied CD/UC case series + 1 small RCT SCD vs Mediterranean (Lewis 2021 n=194, no superiority, symptomatic both, no inflammation signal).
- phases none standard. Components: monosaccharide-only carbs.
- direct: weak. SR NO (no RCT MA). RCT PARTIAL (1 small). Guideline: ESPEN 2023 "RCT data lacking"; ESPEN/ECCO/ACG no induction rec. Position NO_ESTABLISHED_POSITION.
- safety: restrictive, growth/nutrient risk in kids, burden. Supervision dietitian + GI. SAFETY_REVIEW_REQUIRED=YES (peds).
- commercial: books, SCD-certified products. Maturity experimental. Identity mid. P1: NEEDS_EVIDENCE_REVIEW.

### crohns-disease-exclusion-diet
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family GI_THERAPEUTIC | parent —.
- generic-protocol (+formula). Def: Levine/Sigall-Boneh 2014; Levine 2019 RCT; 2 phases 12wk + maintenance (APT MA 2026) [mid-high]. D=R.
- claimed UC/maintenance/mucosal healing → studied mild-moderate CD induction: remission 0.69 (0.65–0.74, 12 studies n=396); +PEN 0.69, alone 0.67, EEN→+PEN 0.75; response 0.83; maintenance 0.64 (I2 73%); OR vs control 2.58, vs EEN 2.05, vs steroids 17.33 (1 study), vs MedDiet 3.95. No UC studies.
- phases induction/maintenance. Components: whole-food exclusion + PEN 50%→25%.
- direct: MA 17 studies/16 quant/7 RCTs (search 10 Feb 2025, all high RoB). SR YES (1 MA). RCT YES.
- guideline: ESPEN/ECCO as of 2023 not yet endorsed (EEN remains); peds practice shifting (UNVERIFIED post-2025). Position CLINICALLY_USED (emerging) / RESEARCH_EMERGING.
- safety: better tolerated than EEN (80% adherence; 20.8% d/c); GI pain/diarrhea/weight-loss rare. Supervision: GI + dietitian. SAFETY_REVIEW_REQUIRED=YES.
- commercial: formula + CDED programs. Maturity emerging (induction); maintenance UNVERIFIED. Identity high. P1: PROPOSED with bias flags.

### exclusive-enteral-nutrition
- class MEDICAL_NUTRITION_THERAPY | state CANONICAL_READY | type MEDICAL_NUTRITION_THERAPY | family GI_THERAPEUTIC | parent —.
- generic (formula-branded). Def: ESPEN IBD 2020/2023 liquid-only 6–8wk [high]. D=G.
- claimed → studied pediatric CD luminal induction (clinical/CRP/calpro/endo-radio); adults shown but lower tolerance.
- phases induction. Components: complete liquid formula.
- direct: multiple SRs. SR YES. RCT YES. Guideline: ESPEN first-line peds CD induction; adults conditional. Position GUIDELINE_RECOMMENDED (peds induction).
- safety: palatability, psychosocial, refeeding, cost. Supervision: GI + dietitian. SAFETY_REVIEW_REQUIRED=YES.
- commercial: formula vendors (Nestlé/Modulen, Abbott, Nutricia). Maturity established (peds). Identity high. P1: include.

### partial-enteral-nutrition
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family GI_THERAPEUTIC | parent —.
- generic. Def: ESPEN; CDED framework 50%/25% [high]. D=G.
- claimed induction-alone → studied maintenance/growth support; induction-alone inferior; combined CDED+PEN see cded.
- phases maintenance/support. Components: partial formula + free/whole-food.
- direct: SRs maintenance benefit. SR YES. RCT PARTIAL. Guideline: ESPEN not for induction alone; for maintenance/support. Position GUIDELINE_CONDITIONAL (supportive).
- safety: formula tolerance; inadequate induction if solo. Supervision GI + dietitian. Commercial: formula vendors. Maturity established-supportive. Identity high. P1: PROPOSED.

### eoe-step-up-elimination
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type ELIMINATION_REINTRODUCTION_PROTOCOL | family GI_THERAPEUTIC | parent elimination-diet-framework.
- generic. Def: Kagalwalla 2006 SFED; AGA/JTF 2020; ACG 2025 step-up 1FED/2FED/4FED (milk/soy/wheat/egg/nut/seafood) [high]. D=G.
- claimed → studied EoE histologic remission: SFED ~60–70% (obs), 1FED ~40–50%, step-up non-inferior (Hirano/Kliewer RCT) with better adherence.
- phases elimination → biopsy-guided reintro. Components: top-allergen elimination.
- direct: SRs only. SR YES. RCT PARTIAL. Guideline: AGA/JTF 2020 conditional SFED; ACG 2025 prefer step-up. Position GUIDELINE_CONDITIONAL.
- safety: deficiency, impaction if nonadherent, endoscopy burden, psychosocial. Supervision: GI + dietitian + allergy. Commercial: dietitian programs; allergy-test-solo not recommended. Maturity established (shifting to step-up). Identity high. P1: PROPOSED.

### food-allergy-elimination-reintroduction
- class MEDICAL_NUTRITION_THERAPY | state CANONICAL_READY | type ELIMINATION_REINTRODUCTION_PROTOCOL | family GI_THERAPEUTIC | parent elimination-diet-framework.
- generic-medical. Def: NIAID 2010/2020, EAACI, AAAAI; DBPCFC gold standard; 2–4wk elim → supervised challenge [high]. D=G.
- claimed treatment → studied tolerance-identification (diagnostic, not treatment).
- phases diagnostic elim → supervised reintro. Components: suspected-allergen removal.
- direct: many OFC-protocol RCTs. SR YES (WAO/EAACI). RCT YES.
- guideline: elimination only to diagnose + supervised reintro; no broad IgG-panel maintenance. Position GUIDELINE_RECOMMENDED (diagnostic).
- safety: anaphylaxis on reintro (supervised only), over-elimination, growth failure. Supervision: allergist mandatory. SAFETY_REVIEW_REQUIRED=YES.
- commercial: IgE/component testing (guideline-tied). Maturity established-diagnostic. Identity high. P1: include as diagnostic protocol (not a diet).

### ibd-supportive-nutrition
- class GENERIC_DIETARY_PATTERN | state PROPOSED | type DIETARY_PATTERN | family GI_THERAPEUTIC | parent —.
- generic. Def: ESPEN 2023 Rec1 (fruit/veg + n-3 + low n-6 ↓CD/UC risk); ECCO; MedDiet feasible [mid]. D=G.
- claimed remission → studied symptomatic/QoL, no induction signal (CDED vs MedDiet OR 3.95 favors CDED).
- phases none. Components: Med-style + deficiency correction.
- direct: SRs feasible, no remission MA. SR PARTIAL. RCT PARTIAL. Guideline: balanced/Med-style + correct deficiencies; experimental exclusions not for induction. Position GUIDELINE_CONDITIONAL (supportive).
- safety: low if balanced. Supervision dietitian. Commercial none specific. Maturity supportive. Identity mid. P1: PROPOSED adjunct.

## FASTING

### intermittent-fasting-family
- class PROTOCOL_FAMILY | state PROPOSED (family node; children registered separately) | type FASTING_PROTOCOL | family FASTING | parent —.
- generic methods + branded books/apps overlay. Def: no single definition; BMJ 2024 NMA subtypes; Obesity 2023 MA [mid]. D=R, Co=apps/books.
- claimed autophagy/longevity/cancer → studied overweight/obesity weight, BP/glucose (small).
- phases windows/cycles (per child). Components: timing + energy targets.
- direct: large but short/small (BMJ 2024 NMA; Cochrane CD015610 n=1430 + CD013496). SR YES. RCT YES.
- guideline: no first-line endorsement (ADA neutral/preference; AHA/ACC/TOS neutral; Cochrane ≈ standard advice). Position CONFLICTING_GUIDANCE / NO_ESTABLISHED_POSITION (as therapy).
- safety: hypoglycemia (diabetes meds), hypotension, ED history, headache/fatigue, pregnancy/frail/shift-work — screening needed. Supervision: med-review required. SAFETY_REVIEW_REQUIRED=YES (class).
- commercial: apps/timers/coaching/books. Maturity maturing-negative (≈ continuous restriction). Identity mid (family). P1: FAMILY node + 3 variant children; NODE_ONLY evidence frozen.

### time-restricted-eating
- class PROTOCOL_VARIANT | state PROPOSED | type MEAL_TIMING_PROTOCOL | family FASTING | parent intermittent-fasting-family.
- generic (e.g. 16:8, 14:10, eTRE). Def: daily window (BMJ 2024 NMA) [mid]. D=R.
- claimed → studied weight/BP/glucose small; circadian-mechanism claims unproven (see circadian-timing).
- phases daily window. Components: fasting/feeding windows.
- direct/SR/RCT: pooled in family NMA. Guideline: neutral. Position RESEARCH_EMERGING.
- safety: see family; diabetes-med mismatch, sleep-disorder overlap. Supervision med-review. Commercial apps. Maturity intermediate. Identity mid. P1: PROPOSED variant.

### alternate-day-fasting
- class PROTOCOL_VARIANT | state PROPOSED | type FASTING_PROTOCOL | family FASTING | parent intermittent-fasting-family.
- generic. Def: 24h alternate fast/ad-lib (BMJ 2024; Elortegui 2023) [mid]. D=R.
- claimed → studied weight (short-term).
- phases alternate cycles. Components: fast-day energy target.
- direct/SR/RCT: family pool. Guideline neutral. Position RESEARCH_EMERGING.
- safety: family + tolerance burden. Supervision med-review. Maturity intermediate. Identity mid. P1: PROPOSED variant.

### five-two-diet
- class PROTOCOL_VARIANT | state PROPOSED | type FASTING_PROTOCOL | family FASTING | parent intermittent-fasting-family.
- generic + branded overlay (Mosley). Def: 2d restriction + 5d normal [mid]. D=R+C.
- claimed → studied weight.
- phases weekly cycle. Components: 2-day energy target.
- direct/SR/RCT: family pool. Guideline neutral. Position RESEARCH_EMERGING.
- safety: family. Supervision med-review. Commercial: books. Maturity intermediate. Identity mid. P1: PROPOSED variant.

### fasting-mimicking-diet
- class BRANDED_PROTOCOL | state WATCH | type FASTING_PROTOCOL | family FASTING | parent intermittent-fasting-family.
- branded (L-Nutra ProLon) + generic research diet. Def: Longo USC ~5d plant-based ~750–1100 kcal low-protein/low-sugar monthly (Nature Commun 2024; STM 2017) [mid]. D=C+R, Co=ProLon.
- claimed regeneration/autoimmunity/MS/chemo-support → studied weight/IGF-1/CRP/liver-fat/bio-age proxies (small RCTs).
- phases 5-day cycles + normal diet. Components: boxed low-energy composition.
- direct: 2+ small trials + mouse work; no SR-grade base. SR NO. RCT PARTIAL (small).
- guideline: none. Position RESEARCH_EMERGING (proof-of-concept, COI-flagged).
- safety: hypoglycemia/hypotension, med interactions, frailty/malnutrition; clearance required; long-term UNVERIFIED. Supervision physician mandatory. SAFETY_REVIEW_REQUIRED=YES.
- commercial: STRONG (kit, books, clinics). Maturity early. Identity mid. P1: WATCH.

### prolonged-fasting
- class CLAIM_ONLY | state WATCH | type FASTING_PROTOCOL | family FASTING | parent intermittent-fasting-family.
- generic threshold (≥4d water/Buchinger ~250 kcal/d) + branded clinics. Def: Nutrition Reviews 2024 narrative; threshold varies (UNVERIFIED) [low]. D=Cm.
- claimed detox/reset → studied short-term 2–10% weight, BP/glucose/ketones (observational inpatient, no control; n=1422 single-arm; n=530 cohort).
- phases multi-day fast. Components: little/no calories.
- direct: weak non-randomized. SR NO. RCT NO.
- guideline: none; supervised-only if used. Position NO_ESTABLISHED_POSITION.
- safety: HIGH — refeeding syndrome, electrolytes, arrhythmia, syncope; contraindicated pregnancy/T1D/frail/ED. Supervision: inpatient medical mandatory. SAFETY_REVIEW_REQUIRED=YES.
- commercial: fasting clinics/retreats. Maturity very-early + high-risk. Identity low. P1: WATCH; never CANONICAL without controlled safety data.

## PLANT / LIFESTYLE

### whole-food-plant-based
- class GENERIC_DIETARY_PATTERN | state PROPOSED | type DIETARY_PATTERN | family PLANT_LIFESTYLE | parent —.
- generic movement (Campbell/Esselstyn framing; no owner). Def: minimally processed plants; oil-free variant optional (UNVERIFIED as required) [mid]. D=R+Cm.
- claimed reversal of heart disease/diabetes → studied weight/LDL-C/HbA1c/BP (RCTs/cohorts; healthful-vs-unhealthful distinction Satija/Harvard).
- phases none. Components: plant food groups.
- direct: moderate RCTs + large cohorts. SR YES. RCT YES.
- guideline: covered under AHA vegan (78)/vegetarian (86) Tier-1/2; ADA well-planned allowed; no separate WFPB guideline. Position GUIDELINE_CONDITIONAL (as plant-based pattern).
- safety: B12/D/iron/zinc/iodine/omega-3 gaps if strict; protein planning in older adults. Supervision routine (+B12).
- commercial: media/programs. Maturity intermediate-mature (risk factors; no hard-event RCT as WFPB). Identity mid. P1: PROPOSED.

### ornish-program
- class MULTICOMPONENT_PROTOCOL | state WATCH | type LIFESTYLE_PROTOCOL | family PLANT_LIFESTYLE | parent —.
- branded (Dean Ornish / Sharecare). Def: program manual + AHA 2023 mapping: veg/fruit/whole-grain/legumes, fat <10%, avoid oils/nuts/seeds/meat/fish/dairy/eggs + lifestyle bundle [mid]. D=C.
- claimed reversal of heart disease → studied Lifestyle Heart Trial n=48 (angina/stenosis) + prostate PSA cohorts (tiny, bundle-confounded).
- phases program. Components: very-low-fat vegetarian + exercise/stress/smoking bundle.
- direct: very small RCTs. SR PARTIAL (Ge et al 2023 low/very-low). RCT PARTIAL (tiny).
- guideline: not diet-endorsed (AHA very-low-fat Tier-3); CMS-covered Intensive Cardiac Rehab as program (distinct from diet efficacy). Position CREATOR_DEFINED / RESEARCH_EMERGING (program).
- safety: fat-sol-vit/EFA gaps, adherence burden, fish/nut exclusion vs AHA. Supervision program + dietitian. SAFETY_REVIEW_REQUIRED=YES.
- commercial: YES (licensed clinics, books, CMS billing context). Maturity low (diet-alone unproven). Identity mid. P1: WATCH.

### pritikin-program
- class MULTICOMPONENT_PROTOCOL | state WATCH | type LIFESTYLE_PROTOCOL | family PLANT_LIFESTYLE | parent —.
- branded (Pritikin Longevity Center). Def: whole/minimally-processed high-fibre low-fat + exercise/education resort protocol [mid]. D=C.
- claimed CVD/diabetes reversal → studied risk-factor short stays, weight/BP/lipids (uncontrolled).
- phases resort + home. Components: diet + exercise/education.
- direct: small short-term trials (Ge et al bucket). SR PARTIAL. RCT PARTIAL.
- guideline: no standalone; components align with heart-healthy advice only. Position CREATOR_DEFINED.
- safety: low-med; Na/volume + med-adjustment on intensive stays. Supervision program. Commercial: residential center + licensing. Maturity low. Identity mid. P1: WATCH.

## RESTRICTIVE / CREATOR

### paleo-diet
- class TREND_ONLY | state WATCH | type BRANDED_NUTRITION_PROTOCOL | family RESTRICTIVE_CREATOR | parent —.
- generic + trademark overlay (Cordain The Paleo Diet®). Def: Eaton/Konner 1985; Cordain 2002: lean meat/fish/fruit/veg/nuts/seeds/eggs; no grains/legumes/dairy/refined/processed [mid]. D=C+R.
- claimed weight/metabolic/autoimmune wellness → studied metabolic syndrome/T2DM/obesity waist/TG/glucose/HbA1c/short-term weight (Manheimer 2015 n=4 RCTs/159; Sohouli 2022; energy-confounded).
- phases none. Components: paleo food-group exclusions.
- direct: small short RCTs. SR YES (small). RCT YES (small).
- guideline: no major endorsement; Harvard/RACGP: further study, adherence/gap concern. Position NO_ESTABLISHED_POSITION / RESEARCH_EMERGING.
- safety: fiber/calcium/vit-D risk; adherence; cost. Supervision routine. Commercial: YES (books, certification, premium foods). Maturity fad-established, small-RCT base. Identity mid. P1: WATCH.

### carnivore-diet
- class TREND_ONLY | state NEEDS_SAFETY_REVIEW | type BRANDED_NUTRITION_PROTOCOL | family RESTRICTIVE_CREATOR | parent —.
- generic fad (Baker 2018 book). Def: meat/dairy/eggs only, plants excluded; no standard definition (2026 scoping review) [low]. D=C.
- claimed weight/autoimmune/mental-health/inflammation → studied survey/case only (Lennerz 2021 n=2029 self-report; xanthoma case 6x cholesterol).
- phases none. Components: all-animal exclusion.
- direct: zero RCTs (Sport 2025 narrative: zero in athletes). SR scoping-only (9 studies, low-quality). RCT NO.
- guideline: none; EUFIC/Harvard/Cleveland-type reviews flag sat-fat/fiber-absence/CVD-cancer-renal concern. Position NO_ESTABLISHED_POSITION.
- safety: LDL↑, fiber/vit-C/A/polyphenol gaps, red/processed-meat–CRC link, renal/hepatic load, microbiome harm. Supervision: physician + dietitian mandatory if trialed. SAFETY_REVIEW_REQUIRED=YES.
- commercial: books/coaching/social programs. Maturity extreme-fad, no controlled base. Identity low. P1: NEEDS_SAFETY_REVIEW; never CANONICAL without controlled data.

### lion-diet
- class CLAIM_ONLY | state WATCH | type BRANDED_NUTRITION_PROTOCOL | family RESTRICTIVE_CREATOR | parent carnivore-diet.
- branded-creator (Mikhaila Peterson/Fuller 2017; Fuller Foundation). Def: ruminant meat + salt + water only, stepwise reintro [low]. D=C.
- claimed IBD/RA/autoimmune/skin/anxiety/digestive → studied none completed (reports only; 1 IRB RCT announced IBD+RA Lion vs broader keto — no results).
- phases elimination → reintro. Components: ruminant-meat-only.
- direct: none. SR NO. RCT NO.
- guideline: none; clinically incomplete. Position CREATOR_DEFINED.
- safety: severe deficiency, microbiome depletion, ED risk; supervision essential. SAFETY_REVIEW_REQUIRED=YES.
- commercial: creator brand/foundation/community. Maturity pre-evidence. Identity low. P1: WATCH.

### lectin-free-plant-paradox
- class CLAIM_ONLY | state WATCH | type BRANDED_NUTRITION_PROTOCOL | family RESTRICTIVE_CREATOR | parent —.
- branded (Gundry 2017 book). Def: excludes wheat/beans/potatoes/nuts/dairy/nightshades/seed-oils; 3-day detox + long-term (+creator keto-for-cancer variant) [low]. D=C, Co=supplements.
- claimed autoimmunity/cancer/CVD/weight/Parkinson/dementia (book pp68-70) → studied: no whole-protocol RCTs; lectin-harm data cell/animal only (Harvard Chan 2023).
- phases detox + maintenance. Components: lectin-avoidance lists.
- direct: none. SR NO. RCT NO. Guideline: none; Harvard/Cleveland/TCN reviews: unsupported, harms intake. Position CREATOR_DEFINED.
- safety: fiber/vit/mineral gaps; cancer-variant must not replace oncology care. Supervision dietitian + oncologist (if cancer context). SAFETY_REVIEW_REQUIRED=YES.
- commercial: YES (books + Gundry MD supplements/detox). Maturity creator-fad, unvalidated. Identity low. P1: WATCH.

## PRECISION / EMERGING

### precision-nutrition-framework
- class CLAIM_ONLY | state WATCH | type PRECISION_NUTRITION_PROTOCOL | family PRECISION_EMERGING | parent —.
- generic-research (NIH NPH/All of Us; no fixed diet). Def: algorithms predicting individual response (8–12k enrolment) [mid]. D=R.
- claimed obesity/diabetes/CVD prevention via tailoring → studied glycemic prediction, weight, cardiometabolic markers (Popp 2022 JAMA: personalized PPGR vs low-fat no weight diff 6-mo; Ben-Yacov vs Med no diff; ZOE 2024 modest; PMC11015823: hype > standards).
- phases none. Components: genetics/microbiome/behavior/AI → advice.
- direct: mixed/null RCTs. SR PARTIAL (reviews). RCT PARTIAL.
- guideline: none prescribe algorithms; DGA notes insufficient subgroup evidence. Position RESEARCH_EMERGING.
- safety: overconfidence, equity/access, genomic/microbiome privacy. Supervision research-context. Commercial: apps (e.g. ZOE) separate from NIH research. Maturity infrastructure-stage. Identity low (umbrella). P1: WATCH as framework, not prescribable protocol.

### microbiome-guided-nutrition
- class CLAIM_ONLY | state WATCH | type PRECISION_NUTRITION_PROTOCOL | family PRECISION_EMERGING | parent precision-nutrition-framework.
- mixed generic + proprietary (Zeevi Cell 2015; ZOE 2022; DGE position). Def: 16S/metagenomic + ML → PPGR (generalizability debated) [low-mid]. D=R, Co=tests/apps.
- claimed glycemic/obesity/IBS/NAFLD → studied PPGR prediction; IBS RCT vs low-FODMAP both improved; obesity RCT vs low-fat null 6-mo.
- phases none. Components: stool test + score → meals.
- direct: prediction cohorts + few small RCTs; SRs flag overfit/16S limits (PMC13048606; DGE review). SR PARTIAL. RCT PARTIAL.
- guideline: none standalone; GMFH 2022: criteria unmet. Position RESEARCH_EMERGING.
- safety: false personalization, test-validity limits, misapplied restriction. Supervision research/dietitian. Commercial: testing + subscriptions. Maturity proof-of-concept → early RCT. Identity low. P1: WATCH.

### cgm-guided-nutrition
- class CLAIM_ONLY | state WATCH | type PRECISION_NUTRITION_PROTOCOL | family PRECISION_EMERGING | parent precision-nutrition-framework.
- generic technique + proprietary platforms. Def: CGM traces → low-excursion meal plans; no fixed list [mid]. D=R, Co=hardware/software.
- claimed non-diabetic optimize/weight/sport → studied T2D RCT SRMA (PMC12536011, heterogeneous co-interventions); non-diabetic pilots small, adherence-only; cyclist observational variability.
- phases feedback loops. Components: CGM + nutrition feedback.
- direct: T2D base heterogeneous; non-diabetic handful pilots. SR PARTIAL (T2D). RCT PARTIAL.
- guideline: ADA CGM targets diabetes-only; non-diabetic = wellness-driven, ranges undefined (2025 multi-guideline). Position RESEARCH_EMERGING (diabetes-adjunct) / NO_ESTABLISHED_POSITION (non-diabetic).
- safety: anxiety/food-fear/orthorexia, cost, skin/device events, normoglycemia misinterpretation. Supervision: diabetes team (T2D); dietitian if non-diabetic use. Commercial: hardware + coaching. Maturity split. Identity low-mid. P1: WATCH.

## MULTICOMPONENT

### nemechek-protocol
- class MULTICOMPONENT_PROTOCOL | state NEEDS_IDENTITY_REVIEW + NEEDS_EVIDENCE_REVIEW | type MULTICOMPONENT_HEALTH_PROTOCOL | family MULTICOMPONENT | parent —.
- branded-creator (Patrick Nemechek DO; books/site; consults; starter packs). Def (creator only): dysregulated autonomic/vagus-inflammatory reflex target; components EVOO + fish-oil/omega-3 + inulin (first-line) / rifaximin (if inulin fails/older) + VNS/device; versions vary by age/pop — do NOT assume all components in every version [low]. D=C, Co=packs/consults/devices, M=creator site.
- claimed autism/developmental/ADHD → studied whole-protocol controlled: NONE FOUND (zero RCTs/SRs of complete protocol). Only: Pakistan survey (uncontrolled, uninterpretable); single case "no change" (PMC8879068); separate taVNS-ASD RCT protocol (not Nemechek) + omega-3 ASD MAs (component-only).
- phases versioned starters/maintenance (creator-defined; freeze in P1).
- per-component: PROTOCOL_DEFINITION_FACT (creator lists) vs COMPONENT_EVIDENCE (omega-3/VNS separate lits) vs WHOLE_PROTOCOL_EVIDENCE (none) — firewall mandatory.
- direct: none controlled. SR NO. RCT NO. Registered trials: none found for whole protocol (P1 must re-search ClinicalTrials.gov by alias).
- guideline: none; AAP-type autism care excludes bundle. Position CREATOR_DEFINED.
- safety: inulin GI; rifaximin stewardship/resistance/C. diff (Rx implications); fish-oil bleeding/lipid; VNS device safety/overclaim; opportunity-cost/delay (pediatric vulnerability). Supervision: physician + developmental-peds mandatory; Rx/device components need indication review. SAFETY_REVIEW_REQUIRED=YES (high-verification canary).
- commercial: YES (starter packs, books, consults, devices). Maturity creator-bundle, pre-clinical-evidence. Identity low (versions unmapped). P1: NEEDS_IDENTITY_REVIEW (map versions/components) + NEEDS_EVIDENCE_REVIEW; high-verification canary; never upgrade component evidence to protocol efficacy.

## ADJACENT / INDICATION FRAMEWORKS (ontology coverage, not all registrable)

### obesity-mnt-framework
- class GENERIC_DIETARY_PATTERN | state PROPOSED (framework) | type LIFESTYLE_PROTOCOL | family INDICATION_FRAMEWORK | parent —. Generic-clinical. Def: ACC/AHA/TOS obesity, ADA, NICE NG246 [high]. Pops: overweight/obesity; outcomes weight/comorbidity. Evidence: guideline SR base. Position GUIDELINE_RECOMMENDED (framework). Safety: disease-drug-diet interactions. Supervision: dietitian + physician. Commercial: reimbursed MNT. Maturity mature-framework. Identity high (framework). P1: framework node; routes to dash/med/low-carb/vlcd/if children.

### diabetes-mnt-framework
- class GENERIC_DIETARY_PATTERN | state PROPOSED (framework) | type LIFESTYLE_PROTOCOL | family INDICATION_FRAMEWORK | parent —. Generic-clinical. Def: ADA Standards 2025-26, NICE NG28 [high]. Outcomes: HbA1c/weight/hypoglycemia. Position GUIDELINE_RECOMMENDED (framework). Safety: insulin/SU/SGLT2 interactions. Supervision: diabetes team + dietitian. Maturity mature. Identity high. P1: framework node.

### ckd-nutrition-therapy
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family RENAL | parent —. Generic-clinical. Def: KDIGO 2024 + KDOQI 2020: plant-forward, less ultraprocessed; protein 0.8 G3-G5 (avoid >1.3); VLPD 0.3-0.4 (+ketoacids to 0.6) supervised-selected; Na/P/K tailored [high]. Pops G1-G5/dialysis (1.0-1.2)/transplant; outcomes progression/uremia/QoL/electrolytes. SR/RCT YES (protein/ketoanalogue GRADE). Position GUIDELINE_RECOMMENDED. Safety: protein-energy wasting if unsupervised; K/P mismanagement; sarcopenia elderly. Supervision: nephrology + dietitian mandatory. SAFETY_REVIEW_REQUIRED=YES. Commercial: clinical service + ketoacid pharma. Maturity mature. Identity high. P1: PROPOSED.

### liver-nutrition-therapy
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family HEPATIC | parent —. Generic-clinical. Def: ESPEN 2020 (103 statements) + AASLD/EASL/ACG 2025: MASLD=MNT hypocaloric per obesity (no unique macro), Med-type counseling; cirrhosis 1.2-1.5g/kg (1.5 sarcopenia, 1.2-2.0 critical), no protein restriction in HE, late-evening snack + breakfast, veg/dairy protein, BCAA if inadequate; Na not <60mmol/d [high]. Outcomes steatosis/enzymes/histology/sarcopenia/HE. SR/RCT YES. Position GUIDELINE_RECOMMENDED. Safety: sarcopenia/frailty if missed; Na/protein over-restriction; alcohol abstinence. Supervision hepatology + dietitian. Commercial clinical (ONS/EN/PN). Maturity mature. Identity high. P1: PROPOSED.

### migraine-dietary-approaches
- class CLAIM_ONLY | state WATCH | type THERAPEUTIC_DIET | family NEUROLOGY | parent ketogenic-diet-therapy (keto arms only).
- generic. Def: VLCKD/MAD/cKD + trigger elimination + weight-loss (Neri Front Nutr 2023 SR/MA CRD42022330626: VLCKD n=4, MAD n=3, cKD n=2, BHB n=1; MA Z=9.07 p<0.00001 I2 67% favouring keto but heterog + ketosis unmeasured; 2 RCTs mixed) [low-mid]. D=R.
- claimed prevention → studied episodic/chronic migraine frequency (pilots).
- direct: 10 arts mostly Italy, 50% low RoB. SR YES (1). RCT PARTIAL (2 mixed).
- guideline: NICE NG150/AAN/EHF: no diet/keto rec; weight management only if obese. Position RESEARCH_EMERGING.
- safety: VLCD ≤800kcal supervision; dropout 16–39%; BHB GI; caffeine-withdrawal. Supervision neuro + dietitian. SAFETY_REVIEW_REQUIRED=YES.
- commercial: meal replacements, MCT, BHB salts. Maturity pilot. Identity low-mid. P1: WATCH.

### ms-general-nutrition
- class GENERIC_DIETARY_PATTERN | state PROPOSED (supportive only) | type DIETARY_PATTERN | family NEUROLOGY_MS | parent —. Generic (+OMS branded charity variant ≈ Swank-like). Def: NMS/NICE NG220/ECTRIMS: balanced diet, vit-D per norms, weight/exercise; no "MS diet" [high]. Outcomes QoL/fatigue observational; vit-D RCTs NS for relapse; biotin negative. SR narrative-only. RCT NO (disease-modifying). Position NO_ESTABLISHED_POSITION (disease control) / GUIDELINE_CONDITIONAL (healthy eating). Safety: megadosing (D, biotin lab interference). Supervision routine. Commercial: OMS program/books; supplement vendors. Maturity supportive-only. Identity mid. P1: supportive node; Swank/Wahls stay separate.

### oncology-mnt-pathway
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family ONCOLOGY | parent —. Generic-clinical. Def: ESPEN 2017/2021 (43 recs): screen all; counseling → ONS → EN → PN (except end-of-life); 1.0-1.5g protein/kg, 25-30kcal/kg ambulant; exercise + n-3 signal [high]. Outcomes weight/lean-mass/function/QoL/surgical morbidity; counseling-alone survival null (Baldwin SR RR 1.06). SR/RCT YES. Position GUIDELINE_RECOMMENDED (supportive); no anti-cancer diet endorsed (incl. creator keto-for-cancer). Safety: refeeding, GI intolerance, inappropriate PN in advanced disease. Supervision oncology + dietitian. Commercial clinical + ONS/EN/PN. Maturity mature-supportive. Identity high. P1: PROPOSED as pathway (not a diet).

### bariatric-postop-nutrition
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family SURGICAL_MNT | parent —. Generic-clinical. Def: AACE/TOS/ASMBS/OMA/ASA 2019 + AND review PMC5347111: clear-liquid (POD1-2) → full-liquid/puree → soft/solid protein-first + fibre (~10-14d) → lifelong protein 60-100g + micronutrients + hydration/activity; dumping avoidance [high]. Outcomes tolerance/protein/vitamin/weight/dumping. Evidence: cohort + supp trials; uniform RCTs limited (guideline-driven). Position GUIDELINE_RECOMMENDED (pathway). Safety: dehydration, protein/vit deficits (Fe/B12/folate/Ca/D/thiamine), stricture/ulcer if advanced too fast. Supervision: bariatric team lifelong + labs. SAFETY_REVIEW_REQUIRED=YES. Commercial: programs + lifelong supplements. Maturity standard-of-care. Identity high. P1: PROPOSED.

### circadian-meal-timing-principle
- class CLAIM_ONLY | state WATCH | type MEAL_TIMING_PROTOCOL | family FASTING | parent —. Generic-research domain. Def: no consensus; Nutrients 2025 reviews: earlier windows + avoid late-night; overlaps TRE but distinct circadian claim [low]. D=R. Outcomes glucose/insulin/hunger/EE small crossovers; weight-independent rescue unproven. Evidence: small short RCTs + confounded cohorts. SR PARTIAL. RCT PARTIAL (small). Guideline: none as pattern (ADA/AHA regularity secondary). Position RESEARCH_EMERGING. Safety: low; shift-worker/diabetes-med mismatch, sleep overlap. Supervision routine (+meds). Commercial: wearable/circadian coaching. Maturity early. Identity low (modifier, not standalone). P1: WATCH as modifier attached to patterns, never standalone protocol.

### protein-sarcopenia-protocol
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family GERIATRIC | parent —. Generic-clinical. Def: PROT-AGE (Bauer 2013) ≥1.0-1.2g/kg/d healthy older; ESPEN Geriatrics ≥1.0 (1.2-1.5 acute/chronic) + D/Ca + resistance training [high]. Pops sarcopenic/frail/hospitalized older; outcomes lean-mass/function. Evidence: moderate SR/MA; protein-alone weak w/o exercise. SR YES. RCT YES. Position GUIDELINE_RECOMMENDED (adjunct). Safety: CKD dosing (nephrology), dehydration, stones, appetite displacement. Supervision geriatrics + dietitian + physio. Commercial: protein/ONS, physio. Maturity intermediate-mature (adjunct). Identity high. P1: PROPOSED (nutrient+exercise protocol).

### vlcd-meal-replacement-program
- class MEDICAL_NUTRITION_THERAPY | state PROPOSED | type MEDICAL_NUTRITION_THERAPY | family WEIGHT_MANAGEMENT | parent —. Generic modality + branded products. Def: NICE NG246, ADA 800-1000kcal structured short-term, Astbury 2024 review: VLCD <800 / LCD 800-1200 / TDR / mixed MR; AHA/ACC/TOS 2013 ES11 [high]. Pops obesity/T2D; outcomes rapid loss, T2D remission (DiRECT/DROPLET + support); regain without maintenance. Evidence: moderate-large RCT/SR ≤12mo with support. SR YES. RCT YES. Position GUIDELINE_CONDITIONAL (specialist-only supervised). Safety: gallstones, electrolytes, hypotension, lean-mass loss, refeeding; contraindicated pregnancy/adolescent/frail. Supervision: specialist weight service mandatory. SAFETY_REVIEW_REQUIRED=YES. Commercial: STRONG (formula makers, clinics). Maturity mature-narrow (short-term supervised). Identity high. P1: PROPOSED with supervision gate.

## REJECTED LABELS (not protocols)

- clean-eating | anti-inflammatory-foods | eat-naturally | gut-healing (slogans): REJECT_NOT_A_PROTOCOL. Reason: no bounded rules, no reconstructable definition, no studiable intervention. P1: keep as claim-phrase stoplist, never registry rows.
- animal-based-tiktok-variant (meat+fruit/honey/raw-dairy): REJECT_NOT_A_PROTOCOL (fad-stage, no controlled data, definition unstable). Revisit only if versioned definition + trial appears.
- medical-medium (celery-juice-type): REJECT_NOT_A_PROTOCOL in this pass — no primary source checked (UNVERIFIED); do not include without verification.
- atkins-weight-loss-brand vs MAD-medical: distinct entities; brand stays commercial-context only, never merged into MAD row.

## COUNTS (P0 proposal)

- Researched: 48 named candidates + 4 rejected labels = 52 rows.
- CANONICAL_READY: 6 (mediterranean, dash, classic-kd, low-fodmap, een, food-allergy-elim).
- PROPOSED (incl. framework/variant nodes): 20.
- NEEDS_IDENTITY_REVIEW: 2 (wahls, nemechek + gaps overlaps).
- NEEDS_DEFINITION_REVIEW: 1 (low-gi thresholds; folded into PROPOSED row flags).
- NEEDS_EVIDENCE_REVIEW: 5 (mind, swank, aip, scd, gaps).
- NEEDS_SAFETY_REVIEW: 2 standalone flags (carnivore, lion carries WATCH+safety; vlcd/fasting class flags in-row).
- WATCH: 12. REJECT_NOT_A_PROTOCOL: 4 labels.
- (Some rows carry dual flags, e.g. nemechek identity+evidence, aip evidence+safety — counted once in primary state above; safety gate §16 applies per-class regardless.)
