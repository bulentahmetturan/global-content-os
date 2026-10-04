# HEALTH_STATISTICS — Source Base V1 (v1.1, gap-closure; 2026-10-05)

Phases: `SOURCE_DISCOVERY_AND_DATASET_AUDIT` (commit `4e6c71c`) + `CLOSE_REMAINING_SOURCE_BASE_GAPS` (this revision). Read-only research and local documentation. No remote mutation, schema change, source activation, account creation, token request or pipeline code. No source is ACTIVE.
Companions in `docs/generated/`: `statistics-source-registry-v1.json`, `-dataset-inventory-v1.json`, `-source-lineage-v1.json`, `-source-coverage-v1.json`, `-source-audit-v1.json`, `-source-readiness-v1.json`. Research outputs, not a runtime registry or schema.
Evidence rule: VERIFIED = an official URL/file was opened read-only on 2026-10-05. Search-summary claims are marked UNVERIFIED or PARTIAL. UNKNOWN != allowed.

Three separate states (never one boolean):
- `SOURCE_BASE_ARCHITECTURE_READY = YES` — enough is known about every P0/P1 source to design the pipeline and adapters.
- `SOURCE_BASE_COMPLETE = YES` — no material Tier-1 identity/acquisition gap would force a registry redesign.
- `SOURCE_ACTIVATION_READY_ALL_SOURCES = NO` — no source is approved to run (terms, owner authorization, canaries).

HEALTH_STATISTICS is a separate structured-data subsystem: not EVERGREEN, not TIME_SENSITIVE, no third temporal path, no semantic lane. A release may later emit an optional TIME_SENSITIVE signal; an observation never becomes a content item.

Source-base freeze marker: `SOURCE_BASE_VERSION = V1`, `SOURCE_BASE_COMPLETE = YES`, `SOURCE_BASE_ARCHITECTURE_READY = YES`, `SOURCE_ACTIVATION_READY_ALL_SOURCES = NO`, `SOURCE_BASE_FROZEN_FOR_ARCHITECTURE = YES`. Frozen means architecture may rely on this registry; it does not mean sources can never be added (additions go through the same audit/governance). Branch: `statistics/source-base`.

## 1. LOOP

| Loop | Result |
|---|---|
| Closure order | TÜİK access → SGK ZIP/revision → HSGM groups → MoH release model → TNSA → ILOSTAT → machine-access/revision unknowns → lineage → WHO licence → branch hygiene |
| TÜİK | Real access mechanism found in the portal's own documentation: authenticated SDMX 2.1 REST service (`DOCUMENTED_API_AUTH`). |
| SGK | 2024 ZIP downloaded: 5 XLSX workbooks; revision policy PDF read. Scope corrected (no health-expenditure block). |
| HSGM | 3 of 6 unverified groups now verified (influenza weekly, nutrition/obesity, chronic/risk factors); 3 remain unverified. |
| Machine-access unknowns | 5 → 0 (each classified: DOCUMENTED_API_AUTH, AUTH_EXPORT, MANUAL_ONLY). |
| Revision unknowns | 4 → 2 explicit UNKNOWN (MoH, HSGM). TÜİK and SGK have published policies. |
| Convergence | Tier-1 gap re-test: 0 gaps. ILOSTAT added (unique OCCUPATIONAL_HEALTH comparables). |

## 2. Executive gap-closure result

5 Turkey + 27 Global = 32 families: 13 PRIMARY_CANONICAL, 7 CANONICAL_GATED, 3 SECONDARY_NORMALIZED, 4 DISCOVERY_CROSSCHECK, 5 REFERENCE_METHODOLOGY, 0 REJECTED. 90 inventory rows over 20 P0–P3 families.

The v1 blocker was "no documented Turkish machine path". It was wrong for TÜİK: the portal documents an SDMX service (`nsiws.tuik.gov.tr`, agency `TR`) that needs a token from an SMS-verified account. That is an activation prerequisite (owner action), not an architecture unknown. All 12 P0/P1 sources now meet the eight exit conditions (`statistics-source-readiness-v1.json`). Terms remain unresolved for 10 families (UNKNOWN), partial for 6, unverified for 1, verified for 3; that blocks activation, not architecture. OECD stays CANONICAL_GATED. IARC terms are UNVERIFIED (legal review required; systematic-retrieval permission UNKNOWN).

## 3. Turkey gap-closure results

**TÜİK (T0).** Verified from the public portal bundle and official pages: documented SDMX 2.1 REST at `https://nsiws.tuik.gov.tr/rest/` (agency `TR`); dataflow list `/rest/dataflow/TR/all/latest`; structures versioned (DF, DSD, CL, CS); series-key filter in DSD dimension order plus `startPeriod`/`endPeriod`; formats SDMX-ML Generic (default), JSON, SDMX-CSV, SDMX_2.1_STRUCTURED; auth by OAuth token from `giris.tuik.gov.tr` (API key generated after SMS verification of a portal account, or TÜİK-issued client credentials). An unauthenticated call returned HTTP 401. The portal also has a public SPA, a "bulk download" page and a numbered press-release stream; its internal `/api/{lang}/…` paths are not public (404/405) and were not pursued. Release calendar: `tuik.gov.tr/Kurumsal/Veri_Takvimi`. Revision: published Revision Policy, current-year Revision Plan and past-year Revisions pages (policy-governed; no per-observation history in SDMX). Terms: no terms/licence page located (UNKNOWN). Rate limit: none stated. Health dataflow IDs are not enumerable without a token (`stable_dataset_ids = YES` as a model, IDs UNKNOWN). Decision: P0 future ingestion via `SDMX_READER`, which is robust (documented, versioned, bounded); no portal scraping. No account or token was created or requested.

**Ministry of Health (T1).** PDF is the only reliable form (`PDF_RELEASE_READER`). Release model: numbered news bulletin (2025 bulletin "Sayı: 14", 2026-09-30 17:00, under the Official Statistics Programme), then the full yearbook PDF (TR/EN) on `dosyamerkez.saglik.gov.tr/Eklenti/{id}/0/…` (2024 yearbook 43 MB, Last-Modified 2025-12-31; 2023 yearbook 2025-03-07). IDs are not predictable; discover via the sbsgm release pages. Tables are numbered per edition ("Tablo 2.1…"). No XLSX/CSV attachment, no correction notice found (revision UNKNOWN, explicit).

**HSGM (T2, one family).** Verified groups: cancer (14 PDFs 2009–2022), HIV/AIDS, tuberculosis (HIV-TB 2009–2023), **influenza** (weekly PDF with a predictable URL family on `grip.saglik.gov.tr`, 390 report links, latest 2026/37), **chronic disease/risk factors** (Türkiye Hanehalkı Sağlık Araştırması, BOH risk-factor prevalence 2023, published 2025), **nutrition/obesity** (TBSA 2017). Unverified: other communicable surveillance, immunization (`asi.saglik.gov.tr` is an information portal, no statistics found), screening (information app). `/tr/istatistikler` returned an access-denied body from this network (not bypassed; `NETWORK_ACCESS_REQUIRED = UNKNOWN` for the 3 unverified groups).

| HSGM dataset group | Status | URL / pattern | Format | Cadence | Reference period | Revision | Reader |
|---|---|---|---|---|---|---|---|
| CANCER (Türkiye Kanser İstatistikleri) | VERIFIED | /depo/birimler/kanser-db/Dokumanlar/Istatistikler/{irregular filename}.pdf | PDF | annual report, irregular lag | report year 2009–2022 | UNKNOWN | PDF_RELEASE_READER |
| HIV/AIDS | VERIFIED | single replaceable PDF (same URL) | PDF | irregular | cumulative/yearly (inside PDF) | UNKNOWN (file replaced in place → local snapshot required) | PDF_RELEASE_READER |
| TUBERCULOSIS (HIV-TB co-infection 2009–2023) | VERIFIED | /depo/tuberkuloz/{n}-{title}.pdf | PDF | annual-ish | 2009–2023 | UNKNOWN | PDF_RELEASE_READER |
| INFLUENZA / RESPIRATORY VIRUS SURVEILLANCE | VERIFIED | https://grip.saglik.gov.tr/depo/influenza-raporu/{year}/Haftalik_Solunum_Yolu_Virusleri_Surveyans_Raporu_{year}_{week}._Hafta.pdf (weblink redirect 301 → PDF 200 verified for 2026/37) | PDF (weekly) | weekly; 390 report links across seasons 2015-16…2025-26; latest seen 2026/37 | ISO-style epidemiological week | UNKNOWN | PDF_RELEASE_READER |
| CHRONIC DISEASE / RISK FACTORS | VERIFIED | /media/attachments/{yyyy}/{mm}/{dd}/{file}.pdf | PDF | survey wave (report 'Türkiye Hanehalkı Sağlık Araştırması: Bulaşıcı Olmayan Hastalıkların Risk Faktörleri Prevalansı 2023', Ankara 2025, compares 2017–2023) | survey year 2023 (2017 comparator) | wave-based; none expected | PDF_RELEASE_READER |
| NUTRITION / OBESITY (TBSA) | VERIFIED | /depo/birimler/saglikli-beslenme-ve-hareketli-hayat-db/Dokumanlar/... | PDF | survey wave (TBSA 2017) | 2017 fieldwork | wave-based | PDF_RELEASE_READER |
| COMMUNICABLE-DISEASE SURVEILLANCE (other notifiable) | UNVERIFIED | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PDF_RELEASE_READER (expected) |
| IMMUNIZATION | UNVERIFIED | https://asi.saglik.gov.tr | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| SCREENING | UNVERIFIED | https://hsys.saglik.gov.tr/TaramaBilgilendirme/TaramaBilgilendirme | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| OTHER HSGM RELEASES | OPEN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PDF_RELEASE_READER |

**SGK (T3).** 2024 yearbook ZIP (4.4 MB): `YILLIK BLM 1` insured/workplaces, `BLM 2` pensioners/income, `BLM 3-1` work accidents and occupational diseases (4/1-a; 49 sheets incl. `Metaveri İK`, `Metaveri MH`, `Tablo 3.1.1…`), `BLM 3-2` (4/1-b), `BLM 4` sickness/temporary incapacity (`TABLO-4.1…4.4`, `EK`). 2022 ZIP has the same five files (the 2024 names carry a `_2024` suffix). Sheets are bilingual, keyed by NACE and province. **Correction to v1:** the yearbook has no health-expenditure or utilization block; SGK is a source for OCCUPATIONAL_HEALTH, sickness morbidity and insured-population coverage. Revision policy (PDF, read): major revisions (definition, scope, classification, method) and post-publication errors may be corrected with public notice on the statistics page; no revision history in files. Monthly bulletin files are not enumerated by the page (metadata/revision-policy links only). Decision: `BULK_FILE_READER` (ZIP → XLSX, whitelisted sheets).

**TNSA (T4).** Public aggregate outputs: main report PDFs for 1993, 1998, 2003, 2008, 2013, 2018 (+2018 Syrian-migrant sample and advanced-analysis volumes) on `fs.hacettepe.edu.tr/hips/dosyalar/yayinlar/`. Microdata: registered access via the World Bank Microdata Library / DHS catalogue (login-gated; treated as restricted, not ingestible). 2024 wave: cooperation protocol (SBB, TÜBİTAK, Hacettepe, Marmara; ~20,000 households); no results found. Reader: `PDF_RELEASE_READER`, P2.

## 4. Global gap-closure results

**ILOSTAT (added, `ILOSTAT_OSH`, PRIMARY_CANONICAL, P2).** Provides authoritative comparable occupational-injury statistics: fatal and non-fatal injuries by economic activity/sex/migrant status, days lost, injury rates, SDG 8.8.1, labour inspection. Verified live: CSV API (`rplumber.ilo.org/data/indicator/?id=INJ_FATL_ECO_NB_A&ref_area=TUR&format=.csv`, Türkiye 1976–2024, 2024 total fatal = 1,905, national source id FA:1729), indicator TOC with per-indicator last-update timestamps (1,965 rows), SDMX service with 1,215 dataflows (`DF_INJ_*`). Bulk guidelines (official PDF) document automated downloads, weekly Sunday refresh. No occupational-disease indicator found. Terms page not retrievable (terms PDF 404, bulk page 403): terms UNKNOWN. Türkiye's value is a relay of the national source; SGK is the likely origin (UNVERIFIED).

**Machine-access unknowns (5 → 0):** TÜİK → DOCUMENTED_API_AUTH; IHME → AUTH_EXPORT (account, emailed link; non-commercial agreement opened); IARC → MANUAL_ONLY; terms UNVERIFIED (a secondary summary quotes a restriction on systematic retrieval; the official IARC terms page was not verified, so permission is UNKNOWN and the gate is LEGAL_REVIEW_REQUIRED, not BLOCKED); UNAIDS → MANUAL_ONLY (XLSX/CSV export; "Data list" CSV reportedly needs an EDMS account); ECDC → MANUAL_ONLY (Atlas CSV via the UI; no API found).

**Revision unknowns (4 → 2):** TÜİK known (policy-governed), SGK known (policy PDF read), MoH and HSGM explicit UNKNOWN (checked; nothing stated; not inferred).

**WHO licence.** The official WHO copyright page states CC BY-NC-SA 3.0 IGO for WHO *publications*; the WHO data-policy page opened here does not state a data licence and the pages opened do not explicitly extend it to the GHO/data platform. `WHO_TERMS_STATUS = PARTIAL`. Owner review required before republishing derived data. OECD terms page still 403 to automation: UNKNOWN, kept CANONICAL_GATED.

**Lineage closed (explicit upstream, per chart or page):** OWID life expectancy = UN WPP 2024 (from 1950) + HMD/Zijdeman/Riley (earlier); OWID child mortality = UN WPP 2024; OWID TB = WHO 2025; OWID HIV = UNAIDS 2026. Worldometer = "elaboration of the latest United Nations data" (own text). World Population Review = World Bank, UN, WHO, US NCHS (own source list). WorldStats = REST Countries API + World Bank (own footer). StatBase unreachable (non-blocking). County Health Rankings: PARTIAL (documentation page lists CDC/Census-type upstreams; not parsed). UN SDG DB: custodian aggregator.

**Low-value inputs (non-blocking by rule):** StatBase, UN DL record 4085690, NCBI NBK223602 (reCAPTCHA), ScienceDirect (403), STLCC guide, World of Statistics stay REFERENCE_METHODOLOGY / DISCOVERY_CROSSCHECK and do not block architecture.

**Tier-1 convergence test.** Re-ran Turkey, global and the 30-domain taxonomy. Candidates considered and folded into existing families: WHO Mortality DB/GHED/TB data/WHO Europe (WHO); UN IGME, JMP (UNICEF); Death Notification System (TÜİK/MoH); Turkish Cancer Registry (HSGM). No new Tier-1 gap. `MAJOR_TIER1_SOURCE_GAPS = 0`. Remaining Turkey domain gaps (DISEASE_BURDEN, CARDIOVASCULAR as a dedicated series, DIABETES_METABOLIC, MENTAL_HEALTH, ENVIRONMENTAL_HEALTH) are covered for Türkiye only through global modelled sources (WHO, IHME, NCD-RisC, OECD) and stay visible in the coverage matrix; OCCUPATIONAL_HEALTH is now covered (SGK, ILOSTAT).

## 5. Updated source tree

```
HEALTH_STATISTICS
├── TURKEY_HEALTH_STATISTICS
│   ├── TURKSTAT_HEALTH_STATISTICS        CANONICAL_GATED   SDMX_READER (token)         P0
│   ├── TR_MINISTRY_OF_HEALTH_STATISTICS  PRIMARY_CANONICAL PDF_RELEASE_READER          P0
│   ├── HSGM_PUBLIC_HEALTH_STATISTICS     PRIMARY_CANONICAL PDF_RELEASE_READER          P1   (ONE family; 6 groups verified, 3 unverified)
│   ├── SGK_HEALTH_STATISTICS             PRIMARY_CANONICAL BULK_FILE_READER (ZIP/XLSX) P1
│   └── TR_HACETTEPE_HIPS_TNSA            PRIMARY_CANONICAL PDF_RELEASE_READER          P2
└── GLOBAL_HEALTH_STATISTICS
    ├── PRIMARY_CANONICAL (9)    WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, UNICEF_DATA,
    │                            CDC_NCHS_HEALTH_STATISTICS, US_CENSUS_HEALTH, UK_ONS_HEALTH, ILOSTAT_OSH (new)
    ├── CANONICAL_GATED (6)      OECD_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY, UNAIDS_DATA, ECDC_SURVEILLANCE, NCD_RISC
    ├── SECONDARY_NORMALIZED (3) OUR_WORLD_IN_DATA_GLOBAL_HEALTH, COUNTY_HEALTH_RANKINGS, UN_SDG_GLOBAL_DATABASE
    ├── DISCOVERY_CROSSCHECK (4) WORLDOMETER, WORLD_POPULATION_REVIEW, WORLDSTATS_IO, STATBASE
    └── REFERENCE_METHODOLOGY (5) WORLD_OF_STATISTICS, STLCC_WORLD_STATISTICS_GUIDE, NCBI_HEALTH_STATISTICS_REFERENCE,
                                  SCIENCEDIRECT_HEALTH_STATISTICS_REFERENCE, UN_DIGITAL_LIBRARY_HEALTH_STATISTICS_REFERENCE
```

## 6. Updated dataset / dataflow inventory

Counts seen live: WHO GHO 3,099 indicators; World Bank topic 8 = 658 indicators, 71 sources; Eurostat 2,672 dataflows; OECD 1,548 (118 health); UNICEF 41; UN WPP 86 indicators/300 locations; ONS 338 datasets; CDC 1,479 assets; Census 1,809; ILO SDMX 1,215 dataflows, TOC 1,965 indicators. Full rows: `statistics-dataset-inventory-v1.json`.

| Source | Dataset / dataflow ID | Name | Domain | Turkey | Readiness | ID evidence |
|---|---|---|---|---|---|---|
| WHO_HEALTH_STATISTICS | WHOSIS_000001 | Life expectancy at birth (years) | LIFE_EXPECTANCY | YES | READY | VERIFIED_LIVE |
| WHO_HEALTH_STATISTICS | GHO Indicator catalogue (3,099 indicators) | GHO Indicator catalogue (3,099 indicators) | ALL | UNKNOWN | READY | VERIFIED_LIVE (count) |
| WHO_HEALTH_STATISTICS | GHO Dimension catalogue | GHO Dimension catalogue | ALL | UNKNOWN | READY | VERIFIED_LIVE |
| WHO_HEALTH_STATISTICS | WHO Mortality Database | WHO Mortality Database | CAUSE_SPECIFIC_MORTALITY | UNKNOWN | GATED | UNVERIFIED (search result) |
| WHO_HEALTH_STATISTICS | GHED — Global Health Expenditure Database | GHED — Global Health Expenditure Database | HEALTH_EXPENDITURE | UNKNOWN | UNKNOWN | UNVERIFIED (search result) |
| WHO_HEALTH_STATISTICS | Global TB data CSV | Global TB data CSV | COMMUNICABLE_DISEASE | UNKNOWN | UNKNOWN | UNVERIFIED (search result) |
| WORLD_BANK_HEALTH | SH.XPD.CHEX.GD.ZS | Current health expenditure (% of GDP) | HEALTH_EXPENDITURE | YES | READY | VERIFIED_LIVE |
| WORLD_BANK_HEALTH | Topic 8 Health (658 indicators) | Topic 8 Health (658 indicators) | ALL | UNKNOWN | READY | VERIFIED_LIVE (count) |
| WORLD_BANK_HEALTH | Source 16 — Health Nutrition and Population Statistics | Source 16 — Health Nutrition and Population Statistics | ALL | UNKNOWN | READY | VERIFIED_LIVE |
| WORLD_BANK_HEALTH | Source 2 — World Development Indicators | Source 2 — World Development Indicators | ALL | UNKNOWN | READY | VERIFIED_LIVE |
| EUROSTAT_HEALTH | HLTH_CD_ANR | Causes of death — absolute number | CAUSE_SPECIFIC_MORTALITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_CD_ARO | Causes of death — deaths by country of residence and occurrence | CAUSE_SPECIFIC_MORTALITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_CD_PTPYLL | Causes of death — potential years of life lost (treatable/preventable) | CAUSE_SPECIFIC_MORTALITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | DEMO_MLEXPEC | Life expectancy by age and sex | LIFE_EXPECTANCY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | DEMO_MAGEC | Deaths by age and sex | ALL_CAUSE_MORTALITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | DEMO_MINFIND | Infant mortality rates | CHILD_NEWBORN | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_RS_PHYS | Physicians by sex and age | HEALTH_WORKFORCE | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_RS_NURSE | Nurses by age and sex | HEALTH_WORKFORCE | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_RS_BDS1 | Hospital beds by function and type of care | HOSPITAL_CAPACITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | HLTH_SILC_01 | Self-perceived health by sex, age and labour status | HEALTH_INEQUALITY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | SDG_03_11 | Healthy life years at birth by sex | LIFE_EXPECTANCY | PARTIAL (verify per flow) | READY | VERIFIED_IN_DATAFLOW_LIST |
| EUROSTAT_HEALTH | hlth_sha11_hf | Health expenditure by financing scheme (SHA 2011) | HEALTH_EXPENDITURE | YES (HTTP 200 for geo=TR) | READY | VERIFIED_LIVE_QUERY |
| EUROSTAT_HEALTH | HLTH_EHIS_* (61 EHIS flows) | HLTH_EHIS_* (61 EHIS flows) | RISK_FACTORS | UNKNOWN | READY | VERIFIED_IN_DATAFLOW_LIST (count 61) |
| UN_WORLD_POPULATION_PROSPECTS | indicators 46/49/61/22/24/59/19/60 | WPP: PopByAge5AndSex, TPopulation, E0, IMR, U5MR, CDR, TFR5, TDeaths | POPULATION_DEMOGRAPHY | YES | GATED | VERIFIED_LIVE (indicator list); data query 401 w/o token |
| UNICEF_DATA | CME | Child mortality (UN IGME) | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | CME_CAUSE_OF_DEATH | Child cause of death | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | MNCH | Maternal, child and newborn health | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | IMMUNISATION | Immunisation | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | NUTRITION | Nutrition | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | HIV_AIDS | HIV/AIDS | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | WASH_HEALTHCARE_FACILITY | WASH in healthcare facilities | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| UNICEF_DATA | DM | Demography | CHILD_NEWBORN | UNKNOWN (per-flow) | UNKNOWN | VERIFIED_IN_DATAFLOW_LIST |
| CDC_NCHS_HEALTH_STATISTICS | w9j2-ggv5 | NCHS death rates and life expectancy at birth | LIFE_EXPECTANCY | NO | READY | VERIFIED_IN_CDC_METADATA_LIST |
| CDC_NCHS_HEALTH_STATISTICS | e2d5-ggg7 | VSRR provisional maternal death counts and rates | MATERNAL_REPRODUCTIVE | NO | READY | VERIFIED_IN_CDC_METADATA_LIST |
| CDC_NCHS_HEALTH_STATISTICS | 4bc2-bbpq | Provisional percent of deaths for COVID-19, influenza, RSV | COMMUNICABLE_DISEASE | NO | READY | VERIFIED_IN_CDC_METADATA_LIST |
| CDC_NCHS_HEALTH_STATISTICS | it4f-frdc | US state life expectancy by sex, 2021 | LIFE_EXPECTANCY | NO | READY | VERIFIED_IN_CDC_METADATA_LIST |
| CDC_NCHS_HEALTH_STATISTICS | jx6g-fdh6 | Drug poisoning mortality by state | CAUSE_SPECIFIC_MORTALITY | NO | READY | VERIFIED_IN_CDC_METADATA_LIST |
| US_CENSUS_HEALTH | timeseries/healthins/sahie | Small Area Health Insurance Estimates | HEALTH_FINANCING_INSURANCE | NO | READY | VERIFIED_IN_CATALOG |
| UK_ONS_HEALTH | weekly-deaths-region | Deaths registered weekly in England and Wales by region | ALL_CAUSE_MORTALITY | NO | READY | VERIFIED_LIVE_LIST |
| UK_ONS_HEALTH | weekly-deaths-age-sex | Deaths registered weekly by age and sex | ALL_CAUSE_MORTALITY | NO | READY | VERIFIED_LIVE_LIST |
| UK_ONS_HEALTH | life-expectancy-by-local-authority | Life expectancy by local authority | LIFE_EXPECTANCY | NO | READY | VERIFIED_LIVE_LIST |
| UK_ONS_HEALTH | health-accounts | Expenditure on healthcare: UK Health Accounts | HEALTH_EXPENDITURE | NO | READY | VERIFIED_LIVE_LIST |
| UK_ONS_HEALTH | TS037 | General health (Census 2021) | MORBIDITY | NO | READY | VERIFIED_LIVE_LIST |
| UK_ONS_HEALTH | TS038 | Disability (Census 2021) | DISABILITY | NO | READY | VERIFIED_LIVE_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_LE | Life expectancy | LIFE_EXPECTANCY | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_COM | Causes of mortality | CAUSE_SPECIFIC_MORTALITY | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_C | Cancer | CANCER | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_CD | Communicable diseases | COMMUNICABLE_DISEASE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_STAT@DF_MIM | Maternal and infant mortality | MATERNAL_REPRODUCTIVE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_SHA@DF_SHA | Health expenditure and financing | HEALTH_EXPENDITURE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_EMP_REAC@DF_PHYS | Physicians | HEALTH_WORKFORCE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_REAC_EMP@DF_NURSE | Nurses | HEALTH_WORKFORCE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_REAC_HOSP@DF_HOSP | Hospitals | HOSPITAL_CAPACITY | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_PROC@DF_IMMUN | Immunisations | IMMUNIZATION | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_PROC@DF_SCREEN | Screening | SCREENING | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_LVNG@DF_HEALTH_LVNG_BW | Body weight | OBESITY | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_PROT@DF_HEALTH_PROT | Healthcare coverage | HEALTH_FINANCING_INSURANCE | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HEALTH_MORTALITY@DF_MORTALITY | Mortality by week | ALL_CAUSE_MORTALITY | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| OECD_HEALTH_STATISTICS | DSD_HCQO@DF_MH | Mental healthcare | MENTAL_HEALTH | YES (member; per-flow UNVERIFIED) | GATED | VERIFIED_IN_DATAFLOW_LIST |
| TURKSTAT_HEALTH_STATISTICS | Ölüm ve Ölüm Nedeni İstatistikleri | Death and Cause-of-Death Statistics | CAUSE_SPECIFIC_MORTALITY | YES | MANUAL_ONLY | UNVERIFIED (bulletin IDs not retrievable) |
| TURKSTAT_HEALTH_STATISTICS | Sağlık Harcamaları İstatistikleri | Health Expenditure Statistics | HEALTH_EXPENDITURE | YES | MANUAL_ONLY | UNVERIFIED |
| TURKSTAT_HEALTH_STATISTICS | Türkiye Sağlık Araştırması / Doğum / Hayat Tabloları / ADNKS | Health survey, births, life tables, population denominators | POPULATION_DEMOGRAPHY | YES | MANUAL_ONLY | UNVERIFIED (names from TÜİK program; not retrieved) |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Sağlık İstatistikleri Yıllığı 2024 (TR) | Health Statistics Yearbook 2024 | HOSPITAL_CAPACITY | YES | MANUAL_ONLY | VERIFIED_LINK |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Sağlık İstatistikleri Yıllığı 2024 (EN) | Health Statistics Yearbook 2024 (EN) | HOSPITAL_CAPACITY | YES | MANUAL_ONLY | VERIFIED_LINK |
| HSGM_PUBLIC_HEALTH_STATISTICS | kanser/Türkiye Kanser İstatistikleri 2009–2022 | Turkey Cancer Statistics (14 annual reports) | CANCER | YES | MANUAL_ONLY | VERIFIED_PDF |
| HSGM_PUBLIC_HEALTH_STATISTICS | bulasici-hastaliklar-ve-erken-uyari-db/HIV_AIDS_Istatistikleri | HIV/AIDS statistics | COMMUNICABLE_DISEASE | YES | MANUAL_ONLY | VERIFIED_PDF |
| HSGM_PUBLIC_HEALTH_STATISTICS | tuberkuloz/6-HIVTB_Birlikteligi_2009-2023 | HIV-TB co-infection 2009–2023 | COMMUNICABLE_DISEASE | YES | MANUAL_ONLY | VERIFIED_PDF |
| TR_HACETTEPE_HIPS_TNSA | TNSA 2018 | Turkey Demographic and Health Survey 2018 | MATERNAL_REPRODUCTIVE | YES | MANUAL_ONLY | VERIFIED_PAGE |
| IHME_GBD | GBD Results tool | GBD results (cause/risk/location/age/sex/measure) | DISEASE_BURDEN | UNKNOWN | GATED | UNVERIFIED (search) |
| IARC_GLOBAL_CANCER_OBSERVATORY | GLOBOCAN Cancer Today | GLOBOCAN estimates | CANCER | UNKNOWN | GATED | VERIFIED_PAGE_ONLY |
| UNAIDS_DATA | AIDSinfo HIV estimates | UNAIDS HIV estimates | COMMUNICABLE_DISEASE | UNKNOWN | GATED | VERIFIED_PAGE_ONLY |
| ECDC_SURVEILLANCE | Surveillance Atlas of Infectious Diseases | ECDC Surveillance Atlas | COMMUNICABLE_DISEASE | NO | GATED | VERIFIED_PAGE_ONLY |
| NCD_RISC | NCD-RisC data downloads | Diabetes/BMI/BP/height estimates | DIABETES_METABOLIC | YES | GATED | UNVERIFIED (search) |
| SGK_HEALTH_STATISTICS | YILLIK BLM 3-1 (4/1-a) | Work accidents and occupational diseases 4/1-a (49 sheets: Tablo 3.1.1…; Metaveri İK, Metaveri MH) | OCCUPATIONAL_HEALTH | YES | MANUAL_ONLY | VERIFIED_XLSX_INSPECTED |
| SGK_HEALTH_STATISTICS | YILLIK BLM 3-2 (4/1-b) | Work accidents and occupational diseases 4/1-b | OCCUPATIONAL_HEALTH | YES | MANUAL_ONLY | VERIFIED_FILE_LISTED |
| SGK_HEALTH_STATISTICS | YILLIK BLM 4 | Sickness (temporary incapacity) statistics: TABLO-4.1…4.4 + EK | MORBIDITY | YES | MANUAL_ONLY | VERIFIED_XLSX_INSPECTED |
| SGK_HEALTH_STATISTICS | YILLIK BLM 1 | Insured persons and workplaces | HEALTH_FINANCING_INSURANCE | YES | MANUAL_ONLY | VERIFIED_FILE_LISTED |
| SGK_HEALTH_STATISTICS | YILLIK BLM 2 | Pensioners and income recipients | OTHER_PUBLIC_HEALTH | YES | MANUAL_ONLY | VERIFIED_FILE_LISTED |
| SGK_HEALTH_STATISTICS | Aylık İstatistik Bültenleri | SGK monthly bulletins (+ Metaveri PDF, Revizyon ve Hata Politikası PDF) | MORBIDITY | UNKNOWN | UNKNOWN | VERIFIED_POLICY_PDFS_ONLY |
| TURKSTAT_HEALTH_STATISTICS | SDMX documentation example DF_EMISYON_DEGISIM_ORAN (v1.1, DSD_SERA_GAZ_EMISYON_IST v1.5) | Documentation example only — shows id/version/DSD/codelist model (CL_SIKLIK 1.0, CL_IBBS 1.1, CL_DEGISIM 3.0, CL_GOSTERGE 7.2, CL_GIZLILIK 1.0) | OTHER_PUBLIC_HEALTH | UNKNOWN | GATED | VERIFIED_IN_OFFICIAL_DOCUMENTATION |
| HSGM_PUBLIC_HEALTH_STATISTICS | Haftalık Solunum Yolu Virüsleri Sürveyans Raporu {year}/{week} | Haftalık Solunum Yolu Virüsleri Sürveyans Raporu {year}/{week} | COMMUNICABLE_DISEASE | YES | MANUAL_ONLY | VERIFIED_PDF |
| HSGM_PUBLIC_HEALTH_STATISTICS | TBSA 2017 Özet Bulgular | TBSA 2017 Özet Bulgular | OBESITY | YES | MANUAL_ONLY | VERIFIED_PDF |
| HSGM_PUBLIC_HEALTH_STATISTICS | Türkiye Hanehalkı Sağlık Araştırması — BOH Risk Faktörleri Prevalansı 2023 | Türkiye Hanehalkı Sağlık Araştırması — BOH Risk Faktörleri Prevalansı 2023 | RISK_FACTORS | YES | MANUAL_ONLY | VERIFIED_PDF |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Sağlık İstatistikleri Yıllığı 2025 Haber Bülteni (Sayı 14, 2026-09-30) | Health Statistics Yearbook 2025 news bulletin | CHILD_NEWBORN | YES | MANUAL_ONLY | VERIFIED_PDF |
| TR_HACETTEPE_HIPS_TNSA | TNSA 2018 main report | Turkey Demographic and Health Survey 2018 main report | MATERNAL_REPRODUCTIVE | YES | MANUAL_ONLY | VERIFIED_LINK |
| ILOSTAT_OSH | INJ_FATL_ECO_NB_A | Cases of fatal occupational injury by economic activity | OCCUPATIONAL_HEALTH | YES (TUR 2024 total fatal = 1,905) | READY | VERIFIED_LIVE_TOC |
| ILOSTAT_OSH | INJ_NFTL_ECO_NB_A | Cases of non-fatal occupational injury by economic activity | OCCUPATIONAL_HEALTH | YES (TUR 2024 total fatal = 1,905) | READY | VERIFIED_LIVE_TOC |
| ILOSTAT_OSH | INJ_FATL_ECO_RT_A | Fatal occupational injuries per 100,000 workers by economic activity | OCCUPATIONAL_HEALTH | YES (TUR 2024 total fatal = 1,905) | READY | VERIFIED_LIVE_TOC |
| ILOSTAT_OSH | INJ_DAYS_ECO_NB_A | Days lost due to occupational injury by economic activity | OCCUPATIONAL_HEALTH | YES (TUR 2024 total fatal = 1,905) | READY | VERIFIED_LIVE_TOC |
| ILOSTAT_OSH | SDG_F881_SEX_MIG_RT_A | SDG 8.8.1 fatal occupational injuries per 100,000 workers by sex and migrant status | OCCUPATIONAL_HEALTH | YES (TUR 2024 total fatal = 1,905) | READY | VERIFIED_LIVE_TOC |

## 7. Updated duplicate + upstream lineage matrix

| Secondary / mirror | Indicator family | Upstream canonical | Role | Evidence |
|---|---|---|---|---|
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | life expectancy (grapher/life-expectancy) | UN WPP 2024 (from 1950); Human Mortality Database 2025, Zijdeman et al. 2015, Riley 2005 (before 1950) | SECONDARY_NORMALIZED_QA | VERIFIED (metadata.json read) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | child mortality rate (grapher/child-mortality-rate-per-1000-live-births) | UN WPP 2024 (not UN IGME/UNICEF CME) | SECONDARY_NORMALIZED_QA | VERIFIED (metadata.json read) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | TB mortality (grapher/tuberculosis-death-rate) | WHO 2025; population from various sources | SECONDARY_NORMALIZED_QA | VERIFIED (metadata.json read) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | HIV prevalence (grapher/share-of-the-population-infected-with-hiv) | UNAIDS 2026 | SECONDARY_NORMALIZED_QA | VERIFIED (metadata.json read) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | health expenditure; cancer / disease burden | WHO GHED / World Bank; IARC / IHME GBD (typical) | SECONDARY_NORMALIZED_QA | UNKNOWN per chart — rule: read each chart's metadata.json before use |
| WORLD_BANK_HEALTH | life expectancy, mortality, immunisation | WHO / UNICEF / UN WPP (HNP source 16; sourceNote per indicator) | MIRROR_WITH_LINEAGE (not independent) | PARTIAL (indicator sourceNote carries upstream) |
| WORLD_BANK_HEALTH | current health expenditure (SH.XPD.CHEX.*) | WHO GHED | MIRROR_WITH_LINEAGE | PARTIAL |
| WORLD_BANK_HEALTH | population (source 40) | UN WPP | MIRROR_WITH_LINEAGE | PARTIAL |
| WORLD_POPULATION_REVIEW | life expectancy / population | World Bank, United Nations, WHO, US NCHS NVSR (its own source list) | DISCOVERY_CROSSCHECK | VERIFIED (source list on its life-expectancy page) |
| WORLDOMETER | population, life expectancy | United Nations (Population Division) estimates; counters = Worldometer algorithm | DISCOVERY_CROSSCHECK | VERIFIED (own page text) |
| WORLDSTATS_IO | population counters | REST Countries API; World Bank | DISCOVERY_CROSSCHECK | VERIFIED (own footer) |
| STATBASE | unknown | UNKNOWN | DISCOVERY_CROSSCHECK | UNKNOWN (homepage unreachable; non-blocking) |
| COUNTY_HEALTH_RANKINGS | US county measures | CDC/NCHS, US Census, others (per CHR data-documentation page; list not parsed) | SECONDARY_NORMALIZED_QA | PARTIAL |
| UN_SDG_GLOBAL_DATABASE | SDG 3 and 8.8.1 series | WHO / UNICEF / UN WPP / UNAIDS / ILO / WB custodians | SECONDARY_NORMALIZED_QA | PARTIAL (custodian model) |
| WHO_HEALTH_STATISTICS | Türkiye mortality | TÜİK / MoH Death Notification System | CANONICAL_DERIVED_DOWNSTREAM | PARTIAL — TÜİK remains upstream truth |
| OECD_HEALTH_STATISTICS | Türkiye health statistics | TÜİK / MoH | CANONICAL_GATED_DERIVED | PARTIAL |
| EUROSTAT_HEALTH | Türkiye (geo=TR) health | TÜİK | CANONICAL_DERIVED_DOWNSTREAM | PARTIAL |
| UNICEF_DATA | child mortality (CME) | UN IGME (UNICEF/WHO/WB/UN DESA) | CANONICAL_CO_OWNED | PARTIAL — avoid double counting with WHO GHO |
| WHO_HEALTH_STATISTICS | diabetes/obesity/BMI series | NCD-RisC inputs — WHO relays | CANONICAL_DERIVED_DOWNSTREAM | UNKNOWN per indicator |
| IARC_GLOBAL_CANCER_OBSERVATORY | Türkiye cancer | Turkish Cancer Registry (HSGM) as one input among models | INDEPENDENT_MODEL_VS_NATIONAL_REGISTRY | UNKNOWN |
| ILOSTAT_OSH | Türkiye occupational injuries | national source id FA:1729 (SGK administrative data is the likely origin — UNVERIFIED) | CANONICAL_RELAY_OF_NATIONAL_SOURCE | PARTIAL |
| TURKSTAT_HEALTH_STATISTICS | Türkiye cause-of-death | MoH Death Notification System + MERNİS/ADNKS | NATIONAL_CANONICAL | VERIFIED (bulletin methodology via press summary; UNVERIFIED on TÜİK page) |

Rule: a value present in several rows is one observation lineage, not N confirmations. Primary outranks secondary; WHO outranks World Bank/OWID/WPR/Worldometer; TÜİK outranks every Türkiye copy.

## 8. Terms / activation gate matrix

TERMS_STATUS = VERIFIED / PARTIAL / UNKNOWN. ACTIVATION_LEGAL_GATE = PASS / OWNER_REVIEW_REQUIRED / LEGAL_REVIEW_REQUIRED / BLOCKED. `Activation ready` is NO for every source (no owner authorization, no canary, terms not all resolved).

| Source | Access class | Auth | Terms status | Activation legal gate | Activation ready | Licence / terms evidence | Rate limit |
|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | DOCUMENTED_API_AUTH | API_KEY (SMS-verified portal account → API key → OAuth access token wi | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN (none stated in the service documentation read) |
| TR_MINISTRY_OF_HEALTH_STATISTICS | PDF_RELEASE | NONE | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| HSGM_PUBLIC_HEALTH_STATISTICS | PDF_RELEASE | NONE | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| SGK_HEALTH_STATISTICS | BULK_FILE | NONE | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| TR_HACETTEPE_HIPS_TNSA | PDF_RELEASE | NONE for reports; ACCOUNT for microdata | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| WHO_HEALTH_STATISTICS | DOCUMENTED_API | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | CC BY-NC-SA 3.0 IGO is stated by WHO's official copyright page for WHO publications; the opened WHO pages do NOT explicitly state it for the GHO/data  | UNKNOWN |
| WORLD_BANK_HEALTH | DOCUMENTED_API | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | https://datacatalog.worldbank.org/public-licenses (CC BY 4.0 per dataset licence; not rendered in this phase) | UNKNOWN (not specified in API docs) |
| EUROSTAT_HEALTH | DOCUMENTED_API | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | CC BY 4.0 / Commission Decision 2011/833/EU (per Eurostat copyright notice, via search) | UNKNOWN (not covered in guide read) |
| UN_WORLD_POPULATION_PROSPECTS | DOCUMENTED_API_AUTH | API_KEY (free token by email request; API returned HTTP 401 without it | PARTIAL | OWNER_REVIEW_REQUIRED | NO | CC BY 3.0 IGO (WPP 2024 publication per search; confirm for data files) | UNKNOWN |
| UNICEF_DATA | PUBLIC_SDMX_ENDPOINT | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| CDC_NCHS_HEALTH_STATISTICS | DOCUMENTED_API | NONE (app token optional — UNVERIFIED) | VERIFIED | PASS | NO | US Government Works (per dataset metadata licenseId USGOV_WORKS) | UNKNOWN (Socrata throttles unauthenticated clients) |
| US_CENSUS_HEALTH | DOCUMENTED_API | API_KEY (optional/recommended — UNVERIFIED) | VERIFIED | PASS | NO | https://creativecommons.org/publicdomain/zero/1.0/ (per catalog entries) | UNKNOWN |
| UK_ONS_HEALTH | DOCUMENTED_API | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | Open Government Licence v3.0 (standard for ONS; UNVERIFIED in this phase) | UNKNOWN |
| OECD_HEALTH_STATISTICS | DOCUMENTED_API | NONE | UNKNOWN | LEGAL_REVIEW_REQUIRED | NO | https://www.oecd.org/en/about/terms-conditions.html (returned 403 to automated fetch) | CONFLICTING in OECD docs: '20 queries/min & 20 downloads/hr' vs '60 downloads/hr' (search  |
| IHME_GBD | AUTH_EXPORT | ACCOUNT | VERIFIED | LEGAL_REVIEW_REQUIRED | NO | IHME Free-of-Charge Non-Commercial User Agreement | UNKNOWN |
| IARC_GLOBAL_CANCER_OBSERVATORY | MANUAL_ONLY | NONE | UNVERIFIED | LEGAL_REVIEW_REQUIRED | NO | Material may be used 'as is' with citation for non-commercial purposes (GLOBOCAN 2012 statement via search; current terms UNVERIFIED) | UNKNOWN |
| UNAIDS_DATA | MANUAL_ONLY | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | CC BY-IGO variants reported for some UNAIDS datasets (UNVERIFIED) | UNKNOWN |
| ECDC_SURVEILLANCE | MANUAL_ONLY | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | CC BY 4.0 (ECDC copyright page, via search) | UNKNOWN |
| NCD_RISC | BULK_FILE | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | CC BY 4.0 reported for outputs (secondary; UNVERIFIED) | UNKNOWN |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | PUBLIC_DOCUMENTED_DOWNLOAD | NONE | PARTIAL | OWNER_REVIEW_REQUIRED | NO | CC BY (OWID-produced); third-party data keeps provider licence | UNKNOWN |
| COUNTY_HEALTH_RANKINGS | BULK_FILE | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| UN_SDG_GLOBAL_DATABASE | DOCUMENTED_API | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |
| ILOSTAT_OSH | DOCUMENTED_API | NONE | UNKNOWN | OWNER_REVIEW_REQUIRED | NO | UNKNOWN | UNKNOWN |

## 9. Revision / release matrix

| Source | Release model | Revision model | History kept? | Local snapshot required? |
|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | Dated bulletin (press release) + SDMX dataflow with versioned DF/DSD/codelists | Policy-governed: published revision policy, current-year revision plan and past-year revisions page; SDMX returns current values; per-observation revision history not documented | PARTIAL (past-year revisions page; not in SDMX) | YES |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Numbered Haber Bülteni (official statistics programme) + full yearbook PDF (TR/EN) on dosyamerkez.saglik.gov.tr/Eklenti/{id}/0/{file}.pdf (id not predictable; discover via sbsgm release page) | UNKNOWN (no correction/revision notice or policy found on the release pages; editions simply replace) | PARTIAL | YES |
| HSGM_PUBLIC_HEALTH_STATISTICS | Per-group PDF report with a predictable URL family; weekly reports on grip.saglik.gov.tr | UNKNOWN (reports unversioned; some files replaced in place; no correction policy found) | NO | YES |
| SGK_HEALTH_STATISTICS | One ZIP per year (GUID filename) containing 5 XLSX blocks; file names 'YILLIK BLM n … .xlsx' (the 2024 ZIP adds the suffix _2024; the 2022 ZIP does not); bilingual TR/EN table titles | Published 'Revizyon ve Hata Politikası' (read): major revisions (definition/scope/classification/method) and post-publication errors may be corrected, with public notice on the official statistics web page; no revision history in files | NO | YES |
| TR_HACETTEPE_HIPS_TNSA | Wave main report PDF with stable URL (e.g., …/yayinlar/2019_tnsa_anarapor_compressed.pdf); microdata via World Bank Microdata Library / DHS catalogue (TUR_2008_DHS page verified; login-gated) | Wave-based; no revisions documented (explicit UNKNOWN for corrections) | NO | NO |
| WHO_HEALTH_STATISTICS | Live indicator tables with per-record Date; no edition IDs for GHO; annual WHS report is a dated publication | Latest-value-only for GHO API (re-estimated back-series replace prior values); WHS PDF editions are versioned | NO | YES |
| WORLD_BANK_HEALTH | Per-source 'lastupdated' date; WDI Archives (source 57) preserves older editions | Back-series restated on update; archive source 57 retains prior WDI versions | PARTIAL | YES |
| EUROSTAT_HEALTH | Dataflow version + per-observation flags; 2,672 ESTAT dataflows listed | Latest values; flags (e.g., provisional/revised) mark status; history not retained | NO | YES |
| UN_WORLD_POPULATION_PROSPECTS | EDITION (revision year) with projection variants | New edition replaces/revises full history; editions are discrete | PARTIAL (old editions archived) | YES (store edition id) |
| UNICEF_DATA | Dataflow versions (1.0); no release history | Latest values | NO | YES |
| CDC_NCHS_HEALTH_STATISTICS | Socrata dataset + rowsUpdatedAt; provisional vs final distinguished by dataset | Provisional counts revised; Socrata keeps latest only | NO | YES |
| US_CENSUS_HEALTH | Vintage/year in dataset path | New vintages; old vintages remain addressable | YES | NO |
| UK_ONS_HEALTH | Dataset → editions → versions with next_release metadata | Explicit versions per edition (revision history exposed) | YES | NO |
| OECD_HEALTH_STATISTICS | Dataflow version (e.g., DSD_HEALTH_STAT@DF_LE v1.1) | Latest values | NO | YES |
| IHME_GBD | GBD round/version | Each GBD round re-estimates the full back-series | PARTIAL (prior rounds remain on GHDx) | YES (store GBD round id) |
| IARC_GLOBAL_CANCER_OBSERVATORY | GLOBOCAN edition | New edition re-estimates all | PARTIAL | YES |
| UNAIDS_DATA | Annual estimates release | Each release re-estimates full history | PARTIAL | YES |
| ECDC_SURVEILLANCE | Atlas export by disease/indicator/time | Member-state resubmissions revise values | NO | YES |
| NCD_RISC | Dated Zenodo/versioned downloads | New versions supersede; archives page lists outdated estimates | YES (archives page) | NO |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | Grapher slug; archive snapshots on archive.ourworldindata.org | Silent re-computation on upstream update; dated archive exists | PARTIAL | YES |
| COUNTY_HEALTH_RANKINGS | Annual data release | Annual restated | PARTIAL | YES |
| UN_SDG_GLOBAL_DATABASE | Annual SDG database release | Replaced annually | NO | YES |
| ILOSTAT_OSH | Indicator table (e.g., INJ_FATL_ECO_NB_A) with per-indicator 'data.end'/last-update timestamp; SDMX dataflows DF_INJ_* (1,215 flows total) | Latest values; per-indicator last-update timestamp; no per-observation history documented | NO | YES |

Explicit UNKNOWN (checked, nothing stated): MoH yearbook, HSGM reports. Known by policy: TÜİK, SGK. Local snapshot is required for every latest-value-only source.

## 10. P0/P1 future adapter matrix (no code)

| Source | Adapter | Access class | Poll | Bounds | Checkpoint/version key | Revision | Terms / activation gate |
|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | SDMX_READER | DOCUMENTED_API_AUTH | Daily/weekly: read national release calendar for health products, then fetch dataflow structure version + bounded data slice after a bulletin date; never list/crawl all flows each run | Dataflow whitelist × series key × startPeriod (since last checkpoint) | Dated bulletin (press release) + SDMX dataflow with versioned DF/DSD/codelists | KNOWN_POLICY | UNKNOWN / LEGAL_REVIEW_REQUIRED |
| TR_MINISTRY_OF_HEALTH_STATISTICS | PDF_RELEASE_READER | PDF_RELEASE | Poll sbsgm yearbook index + 'Haber Bültenleri' page weekly around Sept–Jan; on new link: HEAD (Last-Modified, Content-Length) then fetch once; checksum | One bulletin/yearbook PDF per edition; whitelisted tables (Tablo list is in the PDF front matter) | Numbered Haber Bülteni (official statistics programme) + full yearbook PDF (TR/EN) on dosy | EXPLICIT_UNKNOWN | UNKNOWN / LEGAL_REVIEW_REQUIRED |
| HSGM_PUBLIC_HEALTH_STATISTICS | PDF_RELEASE_READER | PDF_RELEASE | Per nested group: weekly poll of grip.saglik.gov.tr/tr/hir; monthly poll of cancer/HIV/TB/survey index pages; HEAD + checksum before download | One group index per run; PDF whitelist; weekly flu report = latest week only | Per-group PDF report with a predictable URL family; weekly reports on grip.saglik.gov.tr | EXPLICIT_UNKNOWN | UNKNOWN / LEGAL_REVIEW_REQUIRED |
| SGK_HEALTH_STATISTICS | BULK_FILE_READER | BULK_FILE | Poll the Yıllıklar page for a new year ZIP link (GUID); HEAD + checksum; parse only whitelisted workbooks/sheets | One ZIP/year × whitelisted sheets (BLM 3-1, 3-2, 4) | One ZIP per year (GUID filename) containing 5 XLSX blocks; file names 'YILLIK BLM n … .xls | KNOWN_POLICY | UNKNOWN / LEGAL_REVIEW_REQUIRED |
| WHO_HEALTH_STATISTICS | REST_READER | DOCUMENTED_API | Per-indicator: query $filter=Date gt <checkpoint> (Date field present) or re-pull the bounded slice and diff; daily/weekly | IndicatorCode whitelist × SpatialDim in {TUR, regions, selected peers} × TimeDim range; never full /api/Indicator crawl | Live indicator tables with per-record Date; no edition IDs for GHO; annual WHS report is a | KNOWN | PARTIAL / OWNER_REVIEW_REQUIRED |
| WORLD_BANK_HEALTH | REST_READER | DOCUMENTED_API | Poll /v2/sources lastupdated per whitelisted source; fetch only changed source's whitelisted indicators | Indicator whitelist × country list × mrv/date range | Per-source 'lastupdated' date; WDI Archives (source 57) preserves older editions | KNOWN | PARTIAL / OWNER_REVIEW_REQUIRED |
| EUROSTAT_HEALTH | SDMX_READER | DOCUMENTED_API | Poll dataflow structure/lastUpdate per whitelisted flow; re-pull bounded slice, diff by flag/value | Dataflow whitelist × geo={TR, EU27 aggregate, peers} × lastTimePeriod=N | Dataflow version + per-observation flags; 2,672 ESTAT dataflows listed | KNOWN | PARTIAL / OWNER_REVIEW_REQUIRED |
| UN_WORLD_POPULATION_PROSPECTS | REST_READER | DOCUMENTED_API_AUTH | Edition-driven: watch population.un.org/wpp/ for a new edition, then bounded API pulls (indicator × location × years) with a token; bulk-file location UNVERIFIED (/wpp/downloads returned 404 on 2026-10-05) | Edition × indicator whitelist × locations | EDITION (revision year) with projection variants | KNOWN | PARTIAL / OWNER_REVIEW_REQUIRED |
| UNICEF_DATA | SDMX_READER | PUBLIC_SDMX_ENDPOINT | Poll dataflow list/structure and re-pull bounded slices; weekly | Dataflow × REF_AREA={TUR,..} × time range | Dataflow versions (1.0); no release history | KNOWN | UNKNOWN / OWNER_REVIEW_REQUIRED |
| CDC_NCHS_HEALTH_STATISTICS | REST_READER | DOCUMENTED_API | Poll view metadata rowsUpdatedAt per whitelisted dataset id; re-pull bounded filter | Dataset-id whitelist × $where year/state × $limit | Socrata dataset + rowsUpdatedAt; provisional vs final distinguished by dataset | KNOWN | VERIFIED / PASS |
| UK_ONS_HEALTH | REST_READER | DOCUMENTED_API | Poll dataset latest_version per whitelisted id | Dataset id whitelist × latest version | Dataset → editions → versions with next_release metadata | KNOWN | PARTIAL / OWNER_REVIEW_REQUIRED |
| OECD_HEALTH_STATISTICS | SDMX_READER | DOCUMENTED_API | Dataflow version/last-updated poll at ≪ rate limit; weekly | Flow whitelist × REF_AREA={TUR,OECD avg} × recent periods; hard cap on downloads/hour | Dataflow version (e.g., DSD_HEALTH_STAT@DF_LE v1.1) | KNOWN | UNKNOWN / LEGAL_REVIEW_REQUIRED |

Common contract: checkpoint key = `source_id + dataset_id + release/edition + reference_period_slice`; raw response + checksum + URL + fetched-at + source version + upstream org stored; modelled/projected/provisional kept as flags; one dataset per run; fail closed on unknown terms/auth.

## 11. Auditable gap-closure matrix

| Gate | P1 | P2 | P3 | P4 | P5 | Before | After | Evidence | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| TÜİK access | PARTIAL | PARTIAL | PASS | PASS | PASS | UNKNOWN | DOCUMENTED_API_AUTH (SDMX 2.1, token) | portal docs text; 401 on unauthenticated call | owner-created API key (activation) |
| TÜİK dataset identity | PARTIAL | PARTIAL | PASS | PASS | PASS | UNKNOWN | model KNOWN (agency TR, versioned DF/DSD/CL); health IDs behind auth | documented example DF_EMISYON_DEGISIM_ORAN | enumerate health flows with a token |
| TÜİK revision/release | PASS | NOT_RUN | PASS | NOT_RUN | PASS | UNKNOWN | policy + plan + calendar pages exist | Revizyon_Politikasi, Veri_Takvimi | none for architecture |
| Ministry reader model | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | PDF assumed | PDF_RELEASE confirmed; bulletin-then-yearbook cadence | 2025 bulletin, 2023/2024 yearbook headers | revision UNKNOWN |
| HSGM group verification | PARTIAL | PARTIAL | PASS | PARTIAL | PASS | 6 unverified | 3 unverified | grip weekly PDFs, risk-factor 2023, TBSA 2017 | communicable-other, immunization, screening |
| SGK ZIP structure | PASS | PASS | PARTIAL | PASS | PASS | listed only | 5 XLSX inspected; scope corrected | y2024.zip, y2022.zip | monthly bulletin files |
| SGK revision policy | PASS | n/a | PASS | n/a | PASS | UNKNOWN | read; notice-based corrections | Revizyon ve Hata Politikası PDF | none |
| TNSA access model | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | unclassified | reports public; microdata restricted | Raporlar page; WB Microdata Library | 2024 wave unpublished |
| ILOSTAT gap | PARTIAL | PASS | PASS | PASS | PASS | NOT_RUN | ADDED (P2) | rplumber CSV, TOC, sdmx.ilo.org | terms UNKNOWN |
| machine-access unknowns | PASS | PASS | n/a | n/a | PASS | 5 | 0 | access classes in registry | – |
| revision unknowns | PARTIAL | n/a | PARTIAL | n/a | PASS | 4 | 2 explicit UNKNOWN | policies read | MoH, HSGM |
| upstream lineage | PASS | n/a | n/a | n/a | PASS | PARTIAL | PASS for P0/P1 and aggregators; per-chart OWID rule | metadata.json, own source lists | StatBase, CHR detail |
| legal-gate representation | PASS | n/a | n/a | n/a | PASS | 14 unknown (old predicate) | 10 UNKNOWN / 7 PARTIAL / 3 VERIFIED, gates typed | §8 | owner/legal |
| Tier-1 gap convergence | PASS | n/a | n/a | n/a | PASS | 0 | 0 | §4 | – |
| branch/scope hygiene | n/a | n/a | n/a | n/a | PASS | UNKNOWN | SUBOPTIMAL → resolved by `statistics/source-base` (cherry-picked from local main) | §15 | none |
| architecture readiness | PASS | PARTIAL | PASS | PASS | PASS | NO | YES | `statistics-source-readiness-v1.json` | none |

## 12. P1–P5 matrix

| Pillar | Before | After | Evidence | Remaining gap |
|---|---|---|---|---|
| P1 safety | PARTIAL | PASS (source-base scope) | official sources only; no bypass; gates typed; fail-closed on UNKNOWN | production safety not claimed: terms, tokens, canaries |
| P2 real E2E | PARTIAL | PARTIAL | acquisition class known for all P0/P1; SGK XLSX parsed | TÜİK data slice untested (no token); PDF table extraction untested |
| P3 schedulable | PARTIAL | PASS (architecture scope) | release/poll/revision known or explicit UNKNOWN for all 12 | 2 explicit revision UNKNOWN |
| P4 bounded | PASS | PASS | series key, indicator×country, one-file-per-release | – |
| P5 governance | PASS | PASS | no ACTIVE source; legal gates human-controlled; secondary never overrides | owner decisions pending |

## 13. Remaining non-blocking legal gates

Block activation only: all Turkish sources (terms UNKNOWN); OECD (terms + conflicting rate limits, owner/legal); WHO (NC-SA, data licence PARTIAL); IHME (non-commercial agreement); **IARC (terms UNVERIFIED; systematic-retrieval permission UNKNOWN; legal review required)**; UNICEF, UNAIDS, NCD-RisC, ILOSTAT (terms UNKNOWN); WB/Eurostat/ONS/WPP/ECDC (PARTIAL, attribution); IARC (UNVERIFIED). CDC and Census are the only PASS gates, and they still need owner authorization.

## 14. Remaining technical blockers (non-blocking for architecture)

TÜİK health dataflow IDs and live data check need a token. UN WPP API needs a free token; bulk-file URL unverified (`/wpp/downloads` 404). HSGM: 3 groups unverified; `/tr/istatistikler` denied from this network. SGK monthly bulletin files not enumerated; health-benefit statistics location UNVERIFIED. MoH/HSGM/TNSA are PDF-only (extraction fidelity untested). IARC/UNAIDS/ECDC are manual-export only.

## 15. Branch / scope hygiene

`STATISTICS_WORK_BRANCH = SUBOPTIMAL` at the time of the audit; resolved in the isolation phase (below). The docs commit `4e6c71c` sits on `localization-v2` (tracks `origin/localization-v2`, 9 commits ahead of `main`, 1 behind). That branch is the localization V2 feature line; it is not the statistics work and, if pushed or merged, would carry statistics docs with localization code. The commit is local only (not pushed). Recommendation for the next phase (no action taken, no rebase/cherry-pick without owner approval): create `statistics/source-base` from `main`, cherry-pick `4e6c71c` and the commit from this phase there, and leave `localization-v2` untouched.

## 16. Local artifacts updated

`docs/STATISTICS-SOURCE-BASE.md`; `docs/generated/statistics-source-registry-v1.json`, `-dataset-inventory-v1.json`, `-source-lineage-v1.json`, `-source-coverage-v1.json`, `-source-audit-v1.json`, and new `-source-readiness-v1.json`. Local docs-only commit; not pushed.

## 17. Source-base completeness decision

`SOURCE_BASE_ARCHITECTURE_READY = YES` (all 12 P0/P1 sources pass the eight exit conditions: identity, dataset/release model, access class, bounded strategy, revision known-or-explicit-UNKNOWN, provenance role, terms status, explicit activation gate; HSGM stays one family; Turkey and Global stay separate; no Tier-1 gap).
`SOURCE_BASE_COMPLETE = YES` (pending items are all representable in the registry: gated sources, a token, a Turkish-network check, three unverified HSGM groups; none forces a registry redesign).
`SOURCE_ACTIVATION_READY_ALL_SOURCES = NO`.

## 18. Next single step

`DESIGN_HEALTH_STATISTICS_PIPELINE_ARCHITECTURE` (statistical release model, series/observation identity, dimension model, revision history, provenance, reader contracts, polling, checkpointing, failure isolation, cross-source lineage, release-to-TIME_SENSITIVE signalling). Not begun here. Start it on a clean branch (§15).

## Appendix A. Source disposition matrix

| Source | Area | Disposition | Authority | Priority | Reader | Decision |
|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | TR | CANONICAL_GATED | 1_NATIONAL_STATISTICAL_AUTHORITY | P0 | SDMX_READER | ACCEPT_AS_CANONICAL_GATED |
| TR_MINISTRY_OF_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_MINISTRY | P0 | PDF_RELEASE_READER | ACCEPT |
| HSGM_PUBLIC_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_PUBLIC_HEALTH_AGENCY | P1 | PDF_RELEASE_READER | ACCEPT |
| SGK_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_PUBLIC_AUTHORITY | P1 | BULK_FILE_READER | ACCEPT |
| TR_HACETTEPE_HIPS_TNSA | TR | PRIMARY_CANONICAL | 5_ACADEMIC_OFFICIAL_SURVEY_PRODUCER | P2 | PDF_RELEASE_READER | ACCEPT_ADDED_BY_GAP_SEARCH |
| WHO_HEALTH_STATISTICS | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | REST_READER | ACCEPT |
| WORLD_BANK_HEALTH | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | REST_READER | ACCEPT |
| EUROSTAT_HEALTH | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL_REGIONAL_OFFICIAL | P0 | SDMX_READER | ACCEPT |
| UN_WORLD_POPULATION_PROSPECTS | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | REST_READER | ACCEPT |
| UNICEF_DATA | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P1 | SDMX_READER | ACCEPT |
| CDC_NCHS_HEALTH_STATISTICS | GL | PRIMARY_CANONICAL | 1_NATIONAL_PUBLIC_HEALTH_AGENCY | P1 | REST_READER | ACCEPT |
| US_CENSUS_HEALTH | GL | PRIMARY_CANONICAL | 1_NATIONAL_STATISTICAL_AUTHORITY | P2 | REST_READER | ACCEPT_NARROW_ROLE |
| UK_ONS_HEALTH | GL | PRIMARY_CANONICAL | 1_NATIONAL_STATISTICAL_AUTHORITY | P1 | REST_READER | ACCEPT |
| OECD_HEALTH_STATISTICS | GL | CANONICAL_GATED | 3_INTERGOVERNMENTAL | P1 | SDMX_READER | ACCEPT_AS_CANONICAL_GATED |
| IHME_GBD | GL | CANONICAL_GATED | 5_ACADEMIC_RESEARCH_PRODUCER | P2 | AUTHENTICATED_EXPORT_READER | ACCEPT_AS_CANONICAL_GATED |
| IARC_GLOBAL_CANCER_OBSERVATORY | GL | CANONICAL_GATED | 4_DISEASE_SPECIFIC_INTERNATIONAL_AGENCY | P2 | AUTHENTICATED_EXPORT_READER | ACCEPT_AS_CANONICAL_GATED |
| UNAIDS_DATA | GL | CANONICAL_GATED | 4_DISEASE_SPECIFIC_INTERNATIONAL_AGENCY | P2 | BULK_FILE_READER | ACCEPT_AS_CANONICAL_GATED |
| ECDC_SURVEILLANCE | GL | CANONICAL_GATED | 4_DISEASE_SPECIFIC_REGIONAL_AGENCY | P2 | BULK_FILE_READER | ACCEPT_AS_CANONICAL_GATED |
| NCD_RISC | GL | CANONICAL_GATED | 5_ACADEMIC_RESEARCH_PRODUCER | P2 | BULK_FILE_READER | ACCEPT_ADDED_BY_GAP_SEARCH |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | GL | SECONDARY_NORMALIZED | 6_NORMALIZED_PLATFORM | P3 | SECONDARY_QA_READER | ACCEPT_SECONDARY_QA |
| COUNTY_HEALTH_RANKINGS | GL | SECONDARY_NORMALIZED | 5_ACADEMIC_COMPOSITE | P3 | SECONDARY_QA_READER | ACCEPT_SECONDARY_QA_LOW_PRIORITY |
| UN_SDG_GLOBAL_DATABASE | GL | SECONDARY_NORMALIZED | 3_INTERGOVERNMENTAL_AGGREGATOR_OF_CUSTODIANS | P3 | SECONDARY_QA_READER | ADDED_AS_SECONDARY |
| WORLDOMETER | GL | DISCOVERY_CROSSCHECK | 7_AGGREGATOR | P3 | NONE (discovery/QA only) | DOWNGRADED_TO_DISCOVERY |
| WORLD_POPULATION_REVIEW | GL | DISCOVERY_CROSSCHECK | 7_AGGREGATOR | P3 | NONE (discovery/QA only) | DOWNGRADED_TO_DISCOVERY |
| WORLDSTATS_IO | GL | DISCOVERY_CROSSCHECK | 7_AGGREGATOR | P3 | NONE (discovery/QA only) | DOWNGRADED_TO_DISCOVERY |
| STATBASE | GL | DISCOVERY_CROSSCHECK | 7_AGGREGATOR | P3 | NONE (discovery/QA only) | DOWNGRADED_TO_DISCOVERY |
| WORLD_OF_STATISTICS | GL | REFERENCE_METHODOLOGY | 8_REFERENCE | P3 | NONE (not an observation source) | REFERENCE_ONLY |
| STLCC_WORLD_STATISTICS_GUIDE | GL | REFERENCE_METHODOLOGY | 8_REFERENCE | P3 | NONE (not an observation source) | REFERENCE_ONLY |
| NCBI_HEALTH_STATISTICS_REFERENCE | GL | REFERENCE_METHODOLOGY | 8_REFERENCE | P3 | NONE (not an observation source) | REFERENCE_ONLY |
| SCIENCEDIRECT_HEALTH_STATISTICS_REFERENCE | GL | REFERENCE_METHODOLOGY | 8_REFERENCE | P3 | NONE (not an observation source) | REFERENCE_ONLY |
| UN_DIGITAL_LIBRARY_HEALTH_STATISTICS_REFERENCE | GL | REFERENCE_METHODOLOGY | 8_REFERENCE | P3 | NONE (not an observation source) | REFERENCE_ONLY |
| ILOSTAT_OSH | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P2 | REST_READER | ACCEPT_ADDED_BY_GAP_AUDIT |

## Appendix B. Health-domain coverage matrix

P = primary/gated source lists the domain; s = secondary only; . = none.

| Source | POPUL | LIFE_ | ALL_C | CAUSE | MORBI | DISEA | COMMU | CANCE | CARDI | DIABE | RESPI | MENTA | MATER | CHILD | IMMUN | NUTRI | OBESI | RISK_ | DISAB | HEALT | HEALT | HOSPI | HEALT | HEALT | HEALT | PRIMA | SCREE | ENVIR | OCCUP | OTHER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TURKSTAT | P | P | P | P | P | . | . | . | . | . | . | . | P | P | . | . | . | P | P | P | . | . | . | P | . | . | . | . | . | . |
| TR_MINISTRY_OF | . | . | . | P | . | . | . | . | . | . | . | . | P | P | P | . | . | . | . | . | P | P | P | . | . | P | P | . | . | P |
| HSGM_PUBLIC | . | . | . | . | . | . | P | P | . | . | P | . | . | . | P | P | P | P | . | . | . | . | . | . | . | P | P | . | . | P |
| SGK | . | . | . | . | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | P | . | . | . | P | . |
| TR_HACETTEPE_H | P | . | . | . | . | . | . | . | . | . | . | . | P | P | P | P | . | P | . | P | . | . | . | . | . | . | . | . | . | . |
| WHO | . | P | P | P | . | P | P | P | P | P | P | P | P | P | P | P | P | P | . | . | . | P | P | P | . | . | P | P | P | . |
| WORLD_BANK | P | P | . | . | . | . | P | . | . | . | . | . | P | P | P | P | . | P | . | . | . | P | P | P | P | . | . | . | . | . |
| EUROSTAT | P | P | P | P | P | . | . | . | . | . | . | . | . | P | . | . | . | P | P | P | P | P | P | P | . | . | P | . | . | . |
| UN_WORLD_POPUL | P | P | P | . | . | . | . | . | . | . | . | . | P | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| UNICEF_DATA | P | . | . | P | . | . | P | . | . | . | . | . | P | P | P | P | . | . | P | . | . | . | . | . | . | . | . | P | . | . |
| CDC_NCHS | . | P | P | P | P | . | P | . | P | P | . | . | P | P | . | . | . | P | . | P | . | . | . | . | . | . | . | . | . | . |
| US_CENSUS | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | P | P | . | . | . | . | P | . | . | . | . | . |
| UK_ONS | P | P | P | . | P | . | . | . | . | . | . | . | . | . | . | . | . | . | P | P | . | . | . | P | . | . | . | . | . | . |
| OECD | . | P | . | P | . | . | P | P | . | . | . | P | P | P | P | . | P | P | . | . | P | P | P | P | P | . | P | . | . | . |
| IHME_GBD | . | . | . | P | P | P | . | P | P | P | P | P | . | . | . | P | P | P | P | P | . | . | . | . | . | . | . | P | P | . |
| IARC_GLOBAL_CA | . | . | . | P | . | P | . | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| UNAIDS_DATA | . | . | . | . | . | P | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | P | . | . | . | . | . | . |
| ECDC_SURVEILLA | . | . | . | . | P | . | P | . | . | . | . | . | . | . | P | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . |
| NCD_RISC | . | . | . | . | . | . | . | . | P | P | . | . | . | . | . | . | P | P | . | . | . | . | . | . | . | . | . | . | . | . |
| OUR_WORLD_IN_D | . | s | . | s | . | s | s | . | . | . | . | . | . | s | . | s | . | . | . | . | . | . | . | s | . | . | . | . | . | . |
| COUNTY_RANKING | . | . | . | . | s | . | . | . | . | . | . | . | . | . | . | . | s | s | . | s | . | . | . | . | . | . | . | . | . | . |
| UN_SDG_GLOBAL_ | . | . | . | s | . | . | s | . | . | . | . | . | s | s | . | . | . | s | . | . | . | . | s | . | s | . | . | . | . | . |
| ILOSTAT_OSH | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | P | . |

| Domain | Türkiye sources | Global primary w/ Türkiye | Turkey gap | Overlap n |
|---|---|---|---|---|
| POPULATION_DEMOGRAPHY | TURKSTAT_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, UNICEF_DATA | NO | 8 |
| LIFE_EXPECTANCY | TURKSTAT_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, OECD_HEALTH_STATISTICS | NO | 8 |
| ALL_CAUSE_MORTALITY | TURKSTAT_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS | NO | 6 |
| CAUSE_SPECIFIC_MORTALITY | TURKSTAT_HEALTH_STATISTICS, TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, UNICEF_DATA, OECD_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY | NO | 9 |
| MORBIDITY | TURKSTAT_HEALTH_STATISTICS, SGK_HEALTH_STATISTICS | EUROSTAT_HEALTH, IHME_GBD | NO | 7 |
| DISEASE_BURDEN | — | WHO_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY | YES | 4 |
| COMMUNICABLE_DISEASE | HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, UNICEF_DATA, OECD_HEALTH_STATISTICS | NO | 8 |
| CANCER | HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, OECD_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY | NO | 5 |
| CARDIOVASCULAR | — | WHO_HEALTH_STATISTICS, IHME_GBD, NCD_RISC | YES | 4 |
| DIABETES_METABOLIC | — | WHO_HEALTH_STATISTICS, IHME_GBD, NCD_RISC | YES | 4 |
| RESPIRATORY | HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, IHME_GBD | NO | 3 |
| MENTAL_HEALTH | — | WHO_HEALTH_STATISTICS, OECD_HEALTH_STATISTICS, IHME_GBD | YES | 3 |
| MATERNAL_REPRODUCTIVE | TURKSTAT_HEALTH_STATISTICS, TR_MINISTRY_OF_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, UN_WORLD_POPULATION_PROSPECTS, UNICEF_DATA, OECD_HEALTH_STATISTICS | NO | 9 |
| CHILD_NEWBORN | TURKSTAT_HEALTH_STATISTICS, TR_MINISTRY_OF_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, UNICEF_DATA, OECD_HEALTH_STATISTICS | NO | 10 |
| IMMUNIZATION | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, UNICEF_DATA, OECD_HEALTH_STATISTICS | NO | 8 |
| NUTRITION | HSGM_PUBLIC_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, UNICEF_DATA, IHME_GBD | NO | 6 |
| OBESITY | HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, OECD_HEALTH_STATISTICS, IHME_GBD, NCD_RISC | NO | 5 |
| RISK_FACTORS | TURKSTAT_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS, IHME_GBD, NCD_RISC | NO | 10 |
| DISABILITY | TURKSTAT_HEALTH_STATISTICS | EUROSTAT_HEALTH, UNICEF_DATA, IHME_GBD | NO | 6 |
| HEALTH_INEQUALITY | TURKSTAT_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | EUROSTAT_HEALTH, IHME_GBD | NO | 7 |
| HEALTHCARE_UTILIZATION | TR_MINISTRY_OF_HEALTH_STATISTICS | EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 3 |
| HOSPITAL_CAPACITY | TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| HEALTH_WORKFORCE | TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| HEALTH_EXPENDITURE | TURKSTAT_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 7 |
| HEALTH_FINANCING_INSURANCE | SGK_HEALTH_STATISTICS | WORLD_BANK_HEALTH, OECD_HEALTH_STATISTICS | NO | 4 |
| PRIMARY_PREVENTIVE_CARE | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | — | NO | 2 |
| SCREENING | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| ENVIRONMENTAL_HEALTH | — | WHO_HEALTH_STATISTICS, UNICEF_DATA, IHME_GBD | YES | 3 |
| OCCUPATIONAL_HEALTH | SGK_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, IHME_GBD, ILOSTAT_OSH | NO | 4 |
| OTHER_PUBLIC_HEALTH | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | — | NO | 2 |

## Appendix C. P1–P5 per-source matrix

| Source | Disposition | P1 | P2 | P3 | P4 | P5 | Main blocker | Future priority |
|---|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | CANONICAL_GATED | PARTIAL | PARTIAL | PASS | PASS | PARTIAL | Owner-created API key + terms UNKNOWN (activation, not architecture) | P0 |
| TR_MINISTRY_OF_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PDF-only; terms UNKNOWN; revision model explicit UNKNOWN | P0 |
| HSGM_PUBLIC_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PASS | PARTIAL | PARTIAL | PDF-only; terms UNKNOWN; 3 groups unverified (communicable-other, immunization, screening) | P1 |
| SGK_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PASS | PARTIAL | PASS | PARTIAL | Terms UNKNOWN | P1 |
| TR_HACETTEPE_HIPS_TNSA | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Low frequency; 2024 wave not published yet (UNVERIFIED) | P2 |
| WHO_HEALTH_STATISTICS | PRIMARY_CANONICAL | PASS | PASS | PARTIAL | PASS | PARTIAL | Licence NC-SA owner confirmation; latest-value-only revisions | P0 |
| WORLD_BANK_HEALTH | PRIMARY_CANONICAL | PASS | PASS | PASS | PASS | PARTIAL | Lineage: mostly a redistributor | P0 |
| EUROSTAT_HEALTH | PRIMARY_CANONICAL | PASS | PASS | PARTIAL | PASS | PARTIAL | Latest-only → local snapshots required | P0 |
| UN_WORLD_POPULATION_PROSPECTS | PRIMARY_CANONICAL | PARTIAL | PASS | PASS | PASS | PARTIAL | API token (bulk files do not need it) | P0 |
| UNICEF_DATA | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PASS | PARTIAL | Licence UNKNOWN | P1 |
| CDC_NCHS_HEALTH_STATISTICS | PRIMARY_CANONICAL | PASS | PASS | PARTIAL | PASS | PARTIAL | Only benchmark relevance; no Türkiye data | P1 |
| US_CENSUS_HEALTH | PRIMARY_CANONICAL | PASS | PASS | PASS | PASS | PARTIAL | Benchmark-only (no Türkiye) | P2 |
| UK_ONS_HEALTH | PRIMARY_CANONICAL | PASS | PASS | PASS | PASS | PARTIAL | Beta API stability | P1 |
| OECD_HEALTH_STATISTICS | CANONICAL_GATED | BLOCKED | PASS | PARTIAL | PASS | PARTIAL | Terms/automation rights + conflicting rate limits | P1 |
| IHME_GBD | CANONICAL_GATED | BLOCKED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NC licence + authenticated download | P2 |
| IARC_GLOBAL_CANCER_OBSERVATORY | CANONICAL_GATED | UNKNOWN | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Terms UNVERIFIED; no API; manual export only | P2 |
| UNAIDS_DATA | CANONICAL_GATED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Terms/access UNKNOWN | P2 |
| ECDC_SURVEILLANCE | CANONICAL_GATED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | No documented machine endpoint | P2 |
| NCD_RISC | CANONICAL_GATED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Licence unverified | P2 |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | SECONDARY_NORMALIZED | PARTIAL | PASS | PARTIAL | PASS | PARTIAL | Not canonical | P3 |
| COUNTY_HEALTH_RANKINGS | SECONDARY_NORMALIZED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Not relevant to Türkiye | P3 |
| UN_SDG_GLOBAL_DATABASE | SECONDARY_NORMALIZED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Duplicate of custodians | P3 |
| WORLDOMETER | DISCOVERY_CROSSCHECK | FAIL | FAIL | FAIL | FAIL | PASS | Not an upstream producer | P3 |
| WORLD_POPULATION_REVIEW | DISCOVERY_CROSSCHECK | FAIL | FAIL | FAIL | FAIL | PASS | Not an upstream producer | P3 |
| WORLDSTATS_IO | DISCOVERY_CROSSCHECK | FAIL | FAIL | FAIL | FAIL | PASS | Not an upstream producer | P3 |
| STATBASE | DISCOVERY_CROSSCHECK | FAIL | FAIL | FAIL | FAIL | PASS | Not an upstream producer | P3 |
| WORLD_OF_STATISTICS | REFERENCE_METHODOLOGY | FAIL | FAIL | FAIL | FAIL | PASS | Not a data source | P3 |
| STLCC_WORLD_STATISTICS_GUIDE | REFERENCE_METHODOLOGY | FAIL | FAIL | FAIL | FAIL | PASS | Not a data source | P3 |
| NCBI_HEALTH_STATISTICS_REFERENCE | REFERENCE_METHODOLOGY | FAIL | FAIL | FAIL | FAIL | PASS | Not a data source | P3 |
| SCIENCEDIRECT_HEALTH_STATISTICS_REFERENCE | REFERENCE_METHODOLOGY | FAIL | FAIL | FAIL | FAIL | PASS | Not a data source | P3 |
| UN_DIGITAL_LIBRARY_HEALTH_STATISTICS_REFERENCE | REFERENCE_METHODOLOGY | FAIL | FAIL | FAIL | FAIL | PASS | Not a data source | P3 |
| ILOSTAT_OSH | PRIMARY_CANONICAL | PARTIAL | PASS | PASS | PASS | PARTIAL | Terms UNKNOWN | P2 |
