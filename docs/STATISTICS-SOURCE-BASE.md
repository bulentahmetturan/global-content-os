# HEALTH_STATISTICS — Source Base V1 (research output, 2026-10-05)

Phase: `SOURCE_DISCOVERY_AND_DATASET_AUDIT`. Read-only research + local documentation. No remote mutation, schema change, source activation or pipeline code. No source in this file is ACTIVE; activation needs owner approval (P5).
Machine-readable companions: `docs/generated/statistics-source-registry-v1.json`, `-dataset-inventory-v1.json`, `-source-lineage-v1.json`, `-source-coverage-v1.json`, `-source-audit-v1.json`. They are research outputs, not a runtime registry or schema.
Evidence rule: a claim is VERIFIED only if an official URL was probed read-only on 2026-10-05. Claims from search summaries are marked UNVERIFIED. UNKNOWN != allowed.

## 0. Architectural boundary

HEALTH_STATISTICS is a separate structured-data subsystem. It is not EVERGREEN, not TIME_SENSITIVE, not a third temporal path. `temporal_path` stays `TIME_SENSITIVE | EVERGREEN`; nothing is added to `evergreen_view`; no semantic lane is created. A statistical *release* may later emit an optional TIME_SENSITIVE editorial signal; an *observation* never becomes a content item. Terminology: source family > dataset/dataflow > release > series > observation.

## 1. LOOP

| Loop | Result |
|---|---|
| A identity | 23 distinct supplied URLs (the 24th was a duplicate ONS URL) collapse into the families below; WHO x3 pages, World Bank x2, OECD x2, OWID x2, ONS x2 merged (`statistics-source-lineage-v1.json` → `input_url_dedup`). |
| B lineage | OWID, World Bank (HNP), UN SDG DB, County Health Rankings, WPR, Worldometer mapped to upstreams where evidence exists, else UNKNOWN (§7). |
| C datasets | 75 dataset/dataflow rows for 19 P0/P1/gated families (§6). IDs come only from live API listings; otherwise UNVERIFIED. |
| D machine access | Verified live: WHO GHO OData, World Bank v2, Eurostat SDMX + JSON-stat, OECD SDMX, UNICEF SDMX, ONS beta API, CDC Socrata, Census API catalog, OWID CSV/metadata, UN WPP API (401 without token). No API found: TÜİK (API exists, undocumented), MoH, HSGM, SGK, TNSA, IARC, UNAIDS, ECDC. |
| E terms | Known: Eurostat (reuse with acknowledgement), WB (terms accepted by use; CC BY 4.0 unconfirmed), WHO (CC BY-NC-SA 3.0 IGO), CDC (US Gov Works), Census (CC0), IHME (non-commercial agreement). OECD unresolved. All Turkish sources UNKNOWN. |
| F revision | Latest-only almost everywhere; versions/editions only for ONS, Census, WPP, IHME, IARC, UNAIDS, WB archive source. Local snapshots required for the rest. |
| G bounded | Every verified API supports country/indicator/time bounds. Turkish sources are file/PDF-per-release (bounded by release). |
| H gap | Added NCD-RisC (CANONICAL_GATED) and UN SDG DB (SECONDARY). No Tier-1 *source* gap remains; access gaps remain (§16). |

## 2. Executive source-base conclusion

The source universe is deduplicated into **5 Turkey + 26 Global = 31 families**: 12 PRIMARY_CANONICAL, 7 CANONICAL_GATED, 3 SECONDARY_NORMALIZED, 4 DISCOVERY_CROSSCHECK, 5 REFERENCE_METHODOLOGY, 0 REJECTED.

Identities and global acquisition are well understood. **Turkey is the weak side**: no Turkish source exposes a documented API or an open licence. TÜİK (veriportali) is a JS app whose API answers but is undocumented; MoH/HSGM/TNSA are PDF; SGK is ZIP/PDF. The Turkish base is *identified and reachable*, not *architecture-ready*. `SOURCE_BASE_ARCHITECTURE_READY = NO` until §14 items close.

## 3. TURKEY_HEALTH_STATISTICS_SOURCE_BASE_V1

```
TURKEY_HEALTH_STATISTICS
├── TURKSTAT_HEALTH_STATISTICS        CANONICAL_GATED   (veriportali.tuik.gov.tr; undocumented API; terms UNKNOWN)
├── TR_MINISTRY_OF_HEALTH_STATISTICS  PRIMARY_CANONICAL (Sağlık İstatistikleri Yıllığı PDF TR/EN, 2024 verified)
├── HSGM_PUBLIC_HEALTH_STATISTICS     PRIMARY_CANONICAL (ONE family; groups nested below)
│     ├── CANCER (2009–2022, 14 PDFs verified)
│     ├── HIV/AIDS (PDF verified)
│     ├── TUBERCULOSIS incl. HIV-TB 2009–2023 (PDF verified)
│     └── influenza, communicable surveillance, immunization, nutrition/obesity, chronic/risk factors, screening, other (URLs UNVERIFIED)
├── SGK_HEALTH_STATISTICS             PRIMARY_CANONICAL (yearbook ZIP/year, monthly bulletins, metadata + revision-policy PDFs)
└── TR_HACETTEPE_HIPS_TNSA            PRIMARY_CANONICAL (added by gap search; survey wave PDFs)
```

HSGM nested groups:

| HSGM dataset group | Status | URL | Note |
|---|---|---|---|
| CANCER (Türkiye Kanser İstatistikleri) | VERIFIED | https://hsgm.saglik.gov.tr/tr/kanser-istatistikleri | report years 2009–2022 listed |
| HIV/AIDS | VERIFIED_PDF | https://hsgm.saglik.gov.tr/depo/birimler/bulasici-hastaliklar-ve-erken-uyari-db/Dokumanlar/Istatistikler/HIV_AIDS_Istatistikleri.pdf |  |
| TUBERCULOSIS (incl. HIV-TB co-infection 2009–2023) | VERIFIED_PDF | https://hsgm.saglik.gov.tr/depo/tuberkuloz/6-HIVTB_Birlikteligi_2009-2023.pdf | 2023: 9,527 TB patients, 7,945 HIV-tested (83.4%), 105 positive (1.1%) per secondary summary; verify in PDF |
| INFLUENZA / RESPIRATORY SURVEILLANCE | UNVERIFIED | UNKNOWN | expected group; page URL not found in this phase |
| COMMUNICABLE-DISEASE SURVEILLANCE (notifiable) | UNVERIFIED | UNKNOWN | unit path bulasici-hastaliklar-ve-erken-uyari-db exists in /depo/ |
| IMMUNIZATION (Genişletilmiş Bağışıklama) | UNVERIFIED | UNKNOWN |  |
| NUTRITION / OBESITY (e.g., TBSA) | UNVERIFIED | UNKNOWN |  |
| CHRONIC DISEASE / RISK FACTORS (e.g., tobacco, KHRFA) | UNVERIFIED | UNKNOWN |  |
| SCREENING (cancer screening programmes) | UNVERIFIED | UNKNOWN |  |
| OTHER HSGM RELEASES | OPEN | UNKNOWN | list is illustrative, not closed |

Turkey notes: MoH (consolidated yearbook) is distinct from HSGM (programme surveillance). TÜİK is upstream truth for Turkish mortality; WHO/OECD/Eurostat/WB copies are downstream. The HSGM `/tr/istatistikler` page returned an access-denied body from this network while the cancer page and `/depo/` PDFs returned 200; the repo already treats HSGM as TR-network-sensitive (`adapters/tip-toplulugu-radar/scripts/tip_toplulugu_tr_runner_setup.md`). TÜİK robots.txt lists AI user agents with `Allow: /` (read in full; not disallowed). Turkish press says HSGM stopped publishing cancer data in 2018; HSGM's own page lists reports through 2022, so the page wins.

## 4. GLOBAL_HEALTH_STATISTICS_SOURCE_BASE_V1

```
GLOBAL_HEALTH_STATISTICS
├── PRIMARY_CANONICAL (8)    WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS,
│                            UNICEF_DATA, CDC_NCHS_HEALTH_STATISTICS, US_CENSUS_HEALTH, UK_ONS_HEALTH
├── CANONICAL_GATED (6)      OECD_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY, UNAIDS_DATA, ECDC_SURVEILLANCE, NCD_RISC
├── SECONDARY_NORMALIZED (3) OUR_WORLD_IN_DATA_GLOBAL_HEALTH, COUNTY_HEALTH_RANKINGS, UN_SDG_GLOBAL_DATABASE
├── DISCOVERY_CROSSCHECK (4) WORLDOMETER, WORLD_POPULATION_REVIEW, WORLDSTATS_IO, STATBASE
└── REFERENCE_METHODOLOGY (5) WORLD_OF_STATISTICS, STLCC_WORLD_STATISTICS_GUIDE, NCBI_HEALTH_STATISTICS_REFERENCE,
                              SCIENCEDIRECT_HEALTH_STATISTICS_REFERENCE, UN_DIGITAL_LIBRARY_HEALTH_STATISTICS_REFERENCE
```

Changes from the starting hypotheses (evidence-based): **UNAIDS** and **ECDC** moved PRIMARY → CANONICAL_GATED (no verified machine endpoint; UNAIDS terms unknown). **WHO** stays PRIMARY but carries a CC BY-NC-SA owner-confirmation note (P5). WHO sub-products (Mortality DB, GHED, TB data, World Health Statistics) stay inside the one WHO family. **StatBase** unreachable (HTTP 000) and **UN DL record 4085690** unresolvable (HTTP 202 challenge): both stay UNVERIFIED rather than assumed. NCBI and ScienceDirect block automation (reCAPTCHA / 403); not bypassed.

## 5. Source disposition matrix

| Source | Area | Disposition | Authority | Priority | Reader | Decision |
|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | TR | CANONICAL_GATED | 1_NATIONAL_STATISTICAL_AUTHORITY | P0 | RELEASE_FILE_READER | ACCEPT_AS_CANONICAL_GATED |
| TR_MINISTRY_OF_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_MINISTRY | P0 | PDF_RELEASE_READER | ACCEPT |
| HSGM_PUBLIC_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_PUBLIC_HEALTH_AGENCY | P1 | PDF_RELEASE_READER | ACCEPT |
| SGK_HEALTH_STATISTICS | TR | PRIMARY_CANONICAL | 2_PUBLIC_AUTHORITY | P1 | BULK_FILE_READER | ACCEPT |
| TR_HACETTEPE_HIPS_TNSA | TR | PRIMARY_CANONICAL | 5_ACADEMIC_OFFICIAL_SURVEY_PRODUCER | P2 | PDF_RELEASE_READER | ACCEPT_ADDED_BY_GAP_SEARCH |
| WHO_HEALTH_STATISTICS | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | REST_READER | ACCEPT |
| WORLD_BANK_HEALTH | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | REST_READER | ACCEPT |
| EUROSTAT_HEALTH | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL_REGIONAL_OFFICIAL | P0 | SDMX_READER | ACCEPT |
| UN_WORLD_POPULATION_PROSPECTS | GL | PRIMARY_CANONICAL | 3_INTERGOVERNMENTAL | P0 | BULK_FILE_READER | ACCEPT |
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

## 6. Dataset / dataflow inventory

Full machine-readable rows: `statistics-dataset-inventory-v1.json`. Counts seen live: WHO GHO 3,099 indicators; World Bank topic 8 = 658 indicators and 71 sources; Eurostat 2,672 ESTAT dataflows (136 `HLTH_*` non-EHIS, 61 EHIS, plus demo/SDG); OECD 1,548 dataflows (118 health-related); UNICEF 41 dataflows; UN WPP 86 indicators / 300 locations; ONS 338 datasets; CDC 1,479 data.cdc.gov assets; Census 1,809 API datasets.

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
| SGK_HEALTH_STATISTICS | Istatistik/Yillik (yearbook ZIPs) | SGK İstatistik Yıllıkları | HEALTH_FINANCING_INSURANCE | YES | MANUAL_ONLY | VERIFIED_LINKS |
| SGK_HEALTH_STATISTICS | Istatistik/Aylik (monthly bulletins) | SGK Aylık İstatistik Bültenleri (+ Metaveri, Revizyon ve Hata Politikası) | HEALTHCARE_UTILIZATION | YES | MANUAL_ONLY | VERIFIED_LINKS |
| TR_HACETTEPE_HIPS_TNSA | TNSA 2018 | Turkey Demographic and Health Survey 2018 | MATERNAL_REPRODUCTIVE | YES | MANUAL_ONLY | VERIFIED_PAGE |
| IHME_GBD | GBD Results tool | GBD results (cause/risk/location/age/sex/measure) | DISEASE_BURDEN | UNKNOWN | GATED | UNVERIFIED (search) |
| IARC_GLOBAL_CANCER_OBSERVATORY | GLOBOCAN Cancer Today | GLOBOCAN estimates | CANCER | UNKNOWN | GATED | VERIFIED_PAGE_ONLY |
| UNAIDS_DATA | AIDSinfo HIV estimates | UNAIDS HIV estimates | COMMUNICABLE_DISEASE | UNKNOWN | GATED | VERIFIED_PAGE_ONLY |
| ECDC_SURVEILLANCE | Surveillance Atlas of Infectious Diseases | ECDC Surveillance Atlas | COMMUNICABLE_DISEASE | NO | GATED | VERIFIED_PAGE_ONLY |
| NCD_RISC | NCD-RisC data downloads | Diabetes/BMI/BP/height estimates | DIABETES_METABOLIC | YES | GATED | UNVERIFIED (search) |

## 7. Duplicate + upstream lineage matrix

| Secondary / mirror | Indicator family | Upstream canonical | Role | Evidence |
|---|---|---|---|---|
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | life expectancy (grapher/life-expectancy) | UN WPP / WHO / others — read .metadata.json 'origins' per chart | SECONDARY_NORMALIZED_QA | PARTIAL (metadata endpoint verified; per-chart origin not extracted) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | cause-of-death, TB, HIV, immunisation | WHO / IHME / UNAIDS / UNICEF | SECONDARY_NORMALIZED_QA | UNKNOWN per chart (OWID FAQ states most data is from third parties such as WHO, UN, World Bank) |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | health expenditure | WHO GHED / World Bank | SECONDARY_NORMALIZED_QA | UNKNOWN per chart |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | population | UN WPP / WB | SECONDARY_NORMALIZED_QA | UNKNOWN per chart |
| WORLD_BANK_HEALTH | life expectancy, mortality, immunisation | WHO / UNICEF / UN WPP (HNP source 16; sourceNote per indicator) | MIRROR_WITH_LINEAGE (not independent) | PARTIAL (indicator sourceNote carries upstream) |
| WORLD_BANK_HEALTH | current health expenditure (SH.XPD.CHEX.*) | WHO GHED | MIRROR_WITH_LINEAGE | PARTIAL |
| WORLD_BANK_HEALTH | population (source 40) | UN WPP | MIRROR_WITH_LINEAGE | PARTIAL |
| WORLD_POPULATION_REVIEW | population & demographics | UN WPP / US Census / World Bank | DISCOVERY_CROSSCHECK | UNKNOWN (not evidenced this phase) |
| WORLDOMETER | population/live counters | UN (claimed) / WHO / national offices | DISCOVERY_CROSSCHECK | UNKNOWN; counters are 'proprietary algorithm' estimates |
| WORLDSTATS_IO | population counters | World Bank / other | DISCOVERY_CROSSCHECK | UNKNOWN |
| STATBASE | unknown | UNKNOWN | DISCOVERY_CROSSCHECK | UNKNOWN (homepage unreachable) |
| COUNTY_HEALTH_RANKINGS | US county measures | CDC/NCHS, US Census, BRFSS (per CHR data-documentation page) | SECONDARY_NORMALIZED_QA | PARTIAL (documentation page listed, not parsed) |
| UN_SDG_GLOBAL_DATABASE | SDG 3 series | WHO / UNICEF / UN WPP / UNAIDS / WB custodians | SECONDARY_NORMALIZED_QA | PARTIAL (custodian model per SDG framework) |
| WHO_HEALTH_STATISTICS | Türkiye mortality | TÜİK / MoH Death Notification System | CANONICAL_DERIVED_DOWNSTREAM | PARTIAL — TÜİK remains upstream truth for Türkiye |
| OECD_HEALTH_STATISTICS | Türkiye health statistics | TÜİK / MoH | CANONICAL_GATED_DERIVED | PARTIAL |
| EUROSTAT_HEALTH | Türkiye (geo=TR) health | TÜİK | CANONICAL_DERIVED_DOWNSTREAM | PARTIAL |
| UNICEF_DATA | child mortality (CME) | UN IGME (UNICEF/WHO/WB/UN DESA) | CANONICAL_CO_OWNED | PARTIAL — avoid double counting with WHO GHO |
| WHO_HEALTH_STATISTICS | diabetes/obesity/BMI series | NCD-RisC (inputs) — WHO relays | CANONICAL_DERIVED_DOWNSTREAM | UNKNOWN per indicator |
| IARC_GLOBAL_CANCER_OBSERVATORY | Türkiye cancer | Turkish Cancer Registry (HSGM) as one input among models | INDEPENDENT_MODEL_VS_NATIONAL_REGISTRY | UNKNOWN |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | cancer / disease burden | IHME GBD / IARC | SECONDARY_NORMALIZED_QA | UNKNOWN per chart |

Rule: WHO outranks World Bank, OWID, WPR and Worldometer. A value present in several rows is one observation lineage, not N confirmations.

## 8. Terms / licence / access matrix

| Source | Licence / terms (evidence) | Auth | Automation | Commercial | Attribution | Rate limit | Legal gate |
|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Reuse/automation terms for veriportali NOT found in this phase (UNKNOWN != allowed). robots.txt checked: User-agent list incl. Claude/GPT bots has 'Allow: /' (not disallowed). |
| TR_MINISTRY_OF_HEALTH_STATISTICS | UNKNOWN | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Terms UNKNOWN (no open licence found); owner decision before republishing derived tables. |
| HSGM_PUBLIC_HEALTH_STATISTICS | UNKNOWN | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Terms UNKNOWN. |
| SGK_HEALTH_STATISTICS | UNKNOWN | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Terms UNKNOWN. |
| TR_HACETTEPE_HIPS_TNSA | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Terms UNKNOWN; microdata access conditions UNKNOWN. |
| WHO_HEALTH_STATISTICS | https://creativecommons.org/licenses/by-nc-sa/3.0/igo/ | NONE | UNKNOWN (public API documented; no automated-use policy located) | CONDITIONAL | YES | UNKNOWN | Licence CC BY-NC-SA 3.0 IGO (per WHO data policy, via search summary): non-commercial + share-alike. Owner must confirm channel use qualifies before republishing derived statistics. Official terms page could not be rendered here (JS). |
| WORLD_BANK_HEALTH | https://datacatalog.worldbank.org/public-licenses (CC BY 4.0 per dataset licence; not rendered in this phase) | NONE | YES (documented public API; no key required) | YES | YES | UNKNOWN (not specified in API docs) | Terms accepted by use; licence page for datasets not rendered here — confirm CC BY 4.0 per dataset. |
| EUROSTAT_HEALTH | CC BY 4.0 / Commission Decision 2011/833/EU (per Eurostat copyright notice, via search) | NONE | YES (documented dissemination API) | YES | YES | UNKNOWN (not covered in guide read) | Reuse authorised with source acknowledgement (copyright notice; search summary). |
| UN_WORLD_POPULATION_PROSPECTS | CC BY 3.0 IGO (WPP 2024 publication per search; confirm for data files) | API_KEY (free token by email request; API returned HTTP 401 without it; bulk files at /wpp/downloads need none) | YES for token holders (UNKNOWN for rate) | CONDITIONAL | YES | UNKNOWN | API token request is an owner/UN contact action; licence for data files to confirm. |
| UNICEF_DATA | UNKNOWN | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Licence/terms not located (UNKNOWN). |
| CDC_NCHS_HEALTH_STATISTICS | US Government Works (per dataset metadata licenseId USGOV_WORKS) | NONE (app token optional — UNVERIFIED) | YES | YES | NO | UNKNOWN (Socrata throttles unauthenticated clients) | NONE identified (US Gov Works); confirm no third-party restricted datasets. |
| US_CENSUS_HEALTH | https://creativecommons.org/publicdomain/zero/1.0/ (per catalog entries) | API_KEY (optional/recommended — UNVERIFIED) | YES | YES | NO | UNKNOWN | NONE identified (CC0 in catalog). |
| UK_ONS_HEALTH | Open Government Licence v3.0 (standard for ONS; UNVERIFIED in this phase) | NONE | YES (public beta API) | YES | YES | UNKNOWN | OGL assumed — confirm. |
| OECD_HEALTH_STATISTICS | https://www.oecd.org/en/about/terms-conditions.html (returned 403 to automated fetch) | NONE | UNKNOWN (APIs 'subject to acceptance of OECD Terms and Conditions') | UNKNOWN | YES | CONFLICTING in OECD docs: '20 queries/min & 20 downloads/hr' vs '60 downloads/hr' (search of OECD pages) — treat strictest | UNRESOLVED (project context already flags OECD automated-access/reuse uncertainty). Terms page not retrievable by automation; rate-limit statements conflict. Owner must read & resolve. UNKNOWN != allowed. |
| IHME_GBD | IHME Free-of-Charge Non-Commercial User Agreement | ACCOUNT | UNKNOWN | NO | YES | UNKNOWN | Non-commercial agreement; account required; redistribution/derivative terms need owner & counsel review. |
| IARC_GLOBAL_CANCER_OBSERVATORY | Material may be used 'as is' with citation for non-commercial purposes (GLOBOCAN 2012 statement via search; current terms UNVERIFIED) | NONE | UNKNOWN | UNKNOWN | YES | UNKNOWN | Current terms UNVERIFIED; historical wording is non-commercial w/ citation. |
| UNAIDS_DATA | CC BY-IGO variants reported for some UNAIDS datasets (UNVERIFIED) | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Terms UNKNOWN. |
| ECDC_SURVEILLANCE | CC BY 4.0 (ECDC copyright page, via search) | NONE | UNKNOWN (open-data policy commits to machine access; endpoint not located) | YES | YES | UNKNOWN | Licence clear (CC BY 4.0); TESSy third-party access requires request — not needed for public Atlas. |
| NCD_RISC | CC BY 4.0 reported for outputs (secondary; UNVERIFIED) | NONE | UNKNOWN | UNKNOWN | YES | UNKNOWN | Licence not read from official page this phase. |
| OUR_WORLD_IN_DATA_GLOBAL_HEALTH | CC BY (OWID-produced); third-party data keeps provider licence | NONE | UNKNOWN (endpoints documented as download aids) | CONDITIONAL (provider licences, e.g., WHO NC-SA) | YES | UNKNOWN | Inherits upstream licences. |
| COUNTY_HEALTH_RANKINGS | UNKNOWN | NONE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN. |
| UN_SDG_GLOBAL_DATABASE | UNKNOWN | NONE | UNKNOWN | UNKNOWN | YES | UNKNOWN | UNKNOWN. |

## 9. Revision / release matrix

| Source | Release model | Revision model | History kept? | Local snapshot required? |
|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | Dated bulletin per statistical product (Bülten) + tables | UNKNOWN (TÜİK publishes revision policy per product; not checked) | UNKNOWN | YES |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Annual yearbook PDF (TR + EN) and a news-bulletin summary | UNKNOWN; yearbooks are replaced by the next edition, corrections not documented | PARTIAL | YES |
| HSGM_PUBLIC_HEALTH_STATISTICS | Per-programme PDF report on a stable /depo/ path | UNKNOWN; reports are not versioned | NO | YES |
| SGK_HEALTH_STATISTICS | Yearbook ZIP per year; monthly bulletin with published metadata and revision/error policy PDFs | Published 'Revizyon ve Hata Politikası' PDF exists for monthly bulletins (content not yet read) | UNKNOWN | YES |
| TR_HACETTEPE_HIPS_TNSA | Wave report (PDF) + tables; microdata on request (UNVERIFIED) | Wave-based; no revisions expected | NO | NO |
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

Revision-sensitive (local snapshot required = YES): all rows marked YES above; most acute for WHO GHO (silent back-series restatement), Eurostat, OECD, UNICEF, TÜİK and SGK.

## 10. Health-domain coverage matrix

P = primary/gated source lists the domain; s = secondary only; . = none. A mark is eligibility, not completeness.

| Source | POPUL | LIFE_ | ALL_C | CAUSE | MORBI | DISEA | COMMU | CANCE | CARDI | DIABE | RESPI | MENTA | MATER | CHILD | IMMUN | NUTRI | OBESI | RISK_ | DISAB | HEALT | HEALT | HOSPI | HEALT | HEALT | HEALT | PRIMA | SCREE | ENVIR | OCCUP | OTHER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TURKSTAT | P | P | P | P | P | . | . | . | . | . | . | . | P | P | . | . | . | P | P | P | . | . | . | P | . | . | . | . | . | . |
| TR_MINISTRY_OF | . | . | . | P | . | . | . | . | . | . | . | . | P | P | P | . | . | . | . | . | P | P | P | . | . | P | P | . | . | P |
| HSGM_PUBLIC | . | . | . | . | . | . | P | P | . | . | P | . | . | . | P | P | P | P | . | . | . | . | . | . | . | P | P | . | . | P |
| SGK | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | . | P | . | . | P | P | . | . | . | . | . |
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

Per domain (Türkiye vs global):

| Domain | Türkiye sources | Global primary w/ Türkiye | Turkey gap | Overlap n |
|---|---|---|---|---|
| POPULATION_DEMOGRAPHY | TURKSTAT_HEALTH_STATISTICS, TR_HACETTEPE_HIPS_TNSA | WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, UNICEF_DATA | NO | 8 |
| LIFE_EXPECTANCY | TURKSTAT_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS, OECD_HEALTH_STATISTICS | NO | 8 |
| ALL_CAUSE_MORTALITY | TURKSTAT_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, UN_WORLD_POPULATION_PROSPECTS | NO | 6 |
| CAUSE_SPECIFIC_MORTALITY | TURKSTAT_HEALTH_STATISTICS, TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, UNICEF_DATA, OECD_HEALTH_STATISTICS, IHME_GBD, IARC_GLOBAL_CANCER_OBSERVATORY | NO | 9 |
| MORBIDITY | TURKSTAT_HEALTH_STATISTICS | EUROSTAT_HEALTH, IHME_GBD | NO | 6 |
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
| HEALTHCARE_UTILIZATION | TR_MINISTRY_OF_HEALTH_STATISTICS, SGK_HEALTH_STATISTICS | EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 4 |
| HOSPITAL_CAPACITY | TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| HEALTH_WORKFORCE | TR_MINISTRY_OF_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| HEALTH_EXPENDITURE | TURKSTAT_HEALTH_STATISTICS, SGK_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, WORLD_BANK_HEALTH, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 8 |
| HEALTH_FINANCING_INSURANCE | SGK_HEALTH_STATISTICS | WORLD_BANK_HEALTH, OECD_HEALTH_STATISTICS | NO | 4 |
| PRIMARY_PREVENTIVE_CARE | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | — | NO | 2 |
| SCREENING | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | WHO_HEALTH_STATISTICS, EUROSTAT_HEALTH, OECD_HEALTH_STATISTICS | NO | 5 |
| ENVIRONMENTAL_HEALTH | — | WHO_HEALTH_STATISTICS, UNICEF_DATA, IHME_GBD | YES | 3 |
| OCCUPATIONAL_HEALTH | — | WHO_HEALTH_STATISTICS, IHME_GBD | YES | 2 |
| OTHER_PUBLIC_HEALTH | TR_MINISTRY_OF_HEALTH_STATISTICS, HSGM_PUBLIC_HEALTH_STATISTICS | — | NO | 2 |

Turkey gaps (no Turkish-source mark): DISEASE_BURDEN, CARDIOVASCULAR, DIABETES_METABOLIC, MENTAL_HEALTH, ENVIRONMENTAL_HEALTH, OCCUPATIONAL_HEALTH. CARDIOVASCULAR is derivable from TÜİK cause-of-death; the others are covered for Türkiye only by global modelled sources (WHO, IHME, NCD-RisC, OECD). PRIMARY_PREVENTIVE_CARE and OTHER_PUBLIC_HEALTH have no global source by design (national scope). Unique value: IHME (burden), NCD-RisC (risk-factor trends), TÜİK (Turkish deaths), HSGM (Turkish registry/surveillance), SGK (payer data), TNSA (survey), ECDC/CDC/ONS (peer benchmarks).

## 11. P1–P5 master matrix

| Source | Disposition | P1 | P2 | P3 | P4 | P5 | Main blocker | Future priority |
|---|---|---|---|---|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | CANONICAL_GATED | PARTIAL | UNKNOWN | PARTIAL | UNKNOWN | PARTIAL | Undocumented API + terms UNKNOWN | P0 |
| TR_MINISTRY_OF_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PDF-only + terms UNKNOWN | P0 |
| HSGM_PUBLIC_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PDF-only, terms UNKNOWN, TR-network access variability | P1 |
| SGK_HEALTH_STATISTICS | PRIMARY_CANONICAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Terms UNKNOWN; ZIP layout unverified | P1 |
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
| IARC_GLOBAL_CANCER_OBSERVATORY | CANONICAL_GATED | BLOCKED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | No API; terms unverified | P2 |
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

P5 = PARTIAL for every ingestible source: nothing is ACTIVE until the owner approves. Discovery/reference rows cannot be activated (P5 PASS).

## 12. Sources added during gap search

| Source | Disposition | Why unique |
|---|---|---|
| TR_HACETTEPE_HIPS_TNSA | PRIMARY_CANONICAL | Only Turkish DHS-type survey: fertility, maternal/child, immunization, nutrition |
| NCD_RISC | CANONICAL_GATED | Academic estimates of diabetes/BMI/BP for 200 countries incl. Türkiye; WHO relays only part |
| UN_SDG_GLOBAL_DATABASE | SECONDARY_NORMALIZED | Custodian aggregator; QA/lineage only, adds no truth |

Considered and not added as families: WHO Mortality DB, GHED, TB data (inside WHO); UNICEF/WHO JMP (inside UNICEF WASH flows); UN IGME (inside UNICEF CME); TÜİK health survey (inside TÜİK); Turkish Cancer Registry (inside HSGM). Open, unaudited, non-Tier-1: ILOSTAT for OCCUPATIONAL_HEALTH (not probed this phase).

## 13. Sources rejected or downgraded + why

| Source | From → To | Why |
|---|---|---|
| UNAIDS_DATA | PRIMARY → CANONICAL_GATED | no verified machine endpoint, terms UNKNOWN |
| ECDC_SURVEILLANCE | PRIMARY → CANONICAL_GATED | no machine endpoint located (AtlasService guess 404); EU/EEA only |
| WORLDOMETER, WORLD_POPULATION_REVIEW, WORLDSTATS_IO, STATBASE | DISCOVERY_CROSSCHECK | aggregators; Worldometer's about page calls live counters a 'proprietary algorithm' estimate; no upstream lineage published |
| COUNTY_HEALTH_RANKINGS | SECONDARY_NORMALIZED (low priority) | derived US-only rankings |
| WORLD_BANK_HEALTH | stays PRIMARY, role narrowed | mostly redistributes WHO/UNICEF/UN WPP; treat as lineage-carrying mirror |
| NCBI / ScienceDirect / UN DL / World of Statistics / STLCC | REFERENCE_METHODOLOGY | no observations |
| REJECTED | none | no family was unsuitable beyond the downgrades above |

## 14. Unresolved legal / technical gates

| Source | Legal gate | Technical gate |
|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | Reuse/automation terms for veriportali NOT found in this phase (UNKNOWN != allowed). robots.txt checked: User-agent list incl. Claude/GPT bots has 'Allow: /' (not disallowed). | veriportali is a JS single-page app (3.7 KB shell); public API undocumented; MEDAS is a ZK session UI (manual). Verify the real data endpoints from the owner's browser/TR network before any reader design. |
| TR_MINISTRY_OF_HEALTH_STATISTICS | Terms UNKNOWN (no open licence found); owner decision before republishing derived tables. | PDF-only: table extraction fidelity must be validated per edition. |
| HSGM_PUBLIC_HEALTH_STATISTICS | Terms UNKNOWN. | WAF/geo-variability: /tr/istatistikler returned an access-denied page while /tr/kanser-istatistikleri and /depo/ PDFs returned 200 from this probe; repo already documents HSGM as blocked outside Türkiye (adapters/tip-toplulugu-radar/scripts/tip_toplulugu_tr_runner_setup.md). Poll from the TR runner. |
| SGK_HEALTH_STATISTICS | Terms UNKNOWN. | Some SGK URLs return HTTP 500 for bare paths (/Istatistik/Aylik/Index); use the GUID-suffixed pages. ZIP content layout not inspected. |
| TR_HACETTEPE_HIPS_TNSA | Terms UNKNOWN; microdata access conditions UNKNOWN. | Wave results page for 2023/2024 not located. |
| WHO_HEALTH_STATISTICS | Licence CC BY-NC-SA 3.0 IGO (per WHO data policy, via search summary): non-commercial + share-alike. Owner must confirm channel use qualifies before republishing derived statistics. Official terms page could not be rendered here (JS). | NONE (API verified live: Indicator, Dimension, indicator data with $filter). |
| WORLD_BANK_HEALTH | Terms accepted by use; licence page for datasets not rendered here — confirm CC BY 4.0 per dataset. | NONE (API verified live). |
| EUROSTAT_HEALTH | Reuse authorised with source acknowledgement (copyright notice; search summary). | NONE (SDMX 2.1 dataflow list and JSON-stat data verified live). |
| UN_WORLD_POPULATION_PROSPECTS | API token request is an owner/UN contact action; licence for data files to confirm. | API requires token (401 verified). /wpp/Download/Standard/CSV path 404 (old path) — use the current /wpp/downloads page. |
| UNICEF_DATA | Licence/terms not located (UNKNOWN). | NONE for access (dataflow list verified, 41 flows); data-endpoint query not exercised. |
| CDC_NCHS_HEALTH_STATISTICS | NONE identified (US Gov Works); confirm no third-party restricted datasets. | NHIS/NHANES microdata are file downloads (not Socrata) — not verified here. Not Türkiye-relevant; peer/benchmark value only. |
| US_CENSUS_HEALTH | NONE identified (CC0 in catalog). | NONE. |
| UK_ONS_HEALTH | OGL assumed — confirm. | API is 'beta'; contract may migrate. |
| OECD_HEALTH_STATISTICS | UNRESOLVED (project context already flags OECD automated-access/reuse uncertainty). Terms page not retrievable by automation; rate-limit statements conflict. Owner must read & resolve. UNKNOWN != allowed. | SDMX verified live: 1,548 dataflows (118 health-related). |
| IHME_GBD | Non-commercial agreement; account required; redistribution/derivative terms need owner & counsel review. | Download via login + email link; automation permission UNKNOWN. |
| IARC_GLOBAL_CANCER_OBSERVATORY | Current terms UNVERIFIED; historical wording is non-commercial w/ citation. | No stable API found; interactive/download UI. |
| UNAIDS_DATA | Terms UNKNOWN. | No API verified; export format unverified. |
| ECDC_SURVEILLANCE | Licence clear (CC BY 4.0); TESSy third-party access requires request — not needed for public Atlas. | Stable machine endpoint not located. |
| NCD_RISC | Licence not read from official page this phase. | None beyond file layout. |

Close first: (1) OECD terms and rate limits (two conflicting limits found: 20 queries/min + 20 downloads/hr vs 60 downloads/hr); (2) TÜİK real data endpoints, terms and release calendar; (3) UN WPP API token (bulk files need none); (4) WHO NC-SA applicability to the channel; (5) Turkish terms for MoH/HSGM/SGK/TNSA (owner/legal); (6) HSGM network path (TR runner) and group URLs; (7) SGK ZIP layout and revision-policy content.

## 15. Future adapter recommendations (no code)

| Source | Adapter class | Poll strategy | Bounds |
|---|---|---|---|
| TURKSTAT_HEALTH_STATISTICS | RELEASE_FILE_READER | Poll the bulletin calendar/category page for new dated bulletins; fetch only the new bulletin's table files | One bulletin/product per run; no portal crawl |
| TR_MINISTRY_OF_HEALTH_STATISTICS | PDF_RELEASE_READER | Poll yearbook index page weekly-to-monthly for a new edition link; checksum the PDF | One yearbook PDF per edition; table-level extraction bounded to a whitelisted table list |
| HSGM_PUBLIC_HEALTH_STATISTICS | PDF_RELEASE_READER | Poll each nested group's index page (cancer list verified); detect new /depo/ PDF links; checksum | One group index per run; PDF whitelist per group |
| SGK_HEALTH_STATISTICS | BULK_FILE_READER | Poll yearbook/bulletin pages for new file links; checksum ZIP; read the revision policy before modelling revisions | One year-ZIP or one monthly bulletin per release; health tables only |
| WHO_HEALTH_STATISTICS | REST_READER | Per-indicator: query $filter=Date gt <checkpoint> (Date field present) or re-pull the bounded slice and diff; daily/weekly | IndicatorCode whitelist × SpatialDim in {TUR, regions, selected peers} × TimeDim range; never full /api/Indicator crawl |
| WORLD_BANK_HEALTH | REST_READER | Poll /v2/sources lastupdated per whitelisted source; fetch only changed source's whitelisted indicators | Indicator whitelist × country list × mrv/date range |
| EUROSTAT_HEALTH | SDMX_READER | Poll dataflow structure/lastUpdate per whitelisted flow; re-pull bounded slice, diff by flag/value | Dataflow whitelist × geo={TR, EU27 aggregate, peers} × lastTimePeriod=N |
| UN_WORLD_POPULATION_PROSPECTS | BULK_FILE_READER | Edition-driven: check downloads page for new edition; ingest whole edition files only on new edition (biennial); API for bounded lookups once token exists | Edition × indicator whitelist × locations |
| UNICEF_DATA | SDMX_READER | Poll dataflow list/structure and re-pull bounded slices; weekly | Dataflow × REF_AREA={TUR,..} × time range |
| CDC_NCHS_HEALTH_STATISTICS | REST_READER | Poll view metadata rowsUpdatedAt per whitelisted dataset id; re-pull bounded filter | Dataset-id whitelist × $where year/state × $limit |
| UK_ONS_HEALTH | REST_READER | Poll dataset latest_version per whitelisted id | Dataset id whitelist × latest version |
| OECD_HEALTH_STATISTICS | SDMX_READER | Dataflow version/last-updated poll at ≪ rate limit; weekly | Flow whitelist × REF_AREA={TUR,OECD avg} × recent periods; hard cap on downloads/hour |

Checkpoint key (all): `source_id + dataset_id + release/edition + reference_period_slice`. Release/version key: WPP edition, GBD round, GLOBOCAN edition, ONS version, WB source `lastupdated`, SGK file GUID, MoH yearbook year, HSGM report year. Failure isolation: one dataset per run; fail closed on unknown terms/auth. Provenance: raw response + checksum + URL + fetched-at + source version + upstream org; modelled/projected/provisional kept as explicit flags.

## 16. Source-base completeness test

| # | Question | Answer |
|---|---|---|
| 1 | Major Turkish authorities represented | YES (TÜİK, MoH, HSGM, SGK, TNSA) |
| 2 | HSGM consolidated | YES (one family, groups nested) |
| 3 | Mortality + cause of death | YES (TÜİK; WHO MDB/GHO; Eurostat; OECD) |
| 4 | Population denominator | YES (TÜİK ADNKS, UN WPP, WB) |
| 5 | Maternal/child | YES (TNSA, MoH, UNICEF, OECD) |
| 6 | Communicable surveillance | YES (HSGM, WHO; ECDC and UNAIDS gated) |
| 7 | Cancer | YES (HSGM; IARC gated; OECD) |
| 8 | Disease burden | YES, gated (IHME) |
| 9 | Expenditure/financing | YES (TÜİK, SGK, WHO GHED, OECD, Eurostat, WB) |
| 10 | Workforce/capacity | YES (MoH, OECD, Eurostat) |
| 11 | Surveys | YES (TNSA, TÜİK survey, EHIS, NHIS/NHANES) |
| 12 | Europe | YES (Eurostat, ECDC, OECD) |
| 13 | Global UN/WHO | YES |
| 14 | US primary | YES (CDC/NCHS; Census narrow) |
| 15 | UK primary | YES (ONS) |
| 16 | Secondary identified, not confused | YES |
| 17 | Aggregators prevented from canonical | YES |
| 18 | Legal blockers explicit | YES (14 families with a terms/automation unknown) |
| 19 | Revision-sensitive identified | YES |
| 20 | Acquisition modes known for all P0/P1 | **NO** — TÜİK endpoints undocumented; HSGM/SGK/MoH file layouts not inspected; OECD/UNICEF/WPP terms or token open |

No Tier-1 source is missing (MAJOR_TIER1_SOURCE_GAPS = 0). Item 20 fails and the Turkish side has no documented machine path, so `SOURCE_BASE_COMPLETE = NO` and `SOURCE_BASE_ARCHITECTURE_READY = NO`.

## 17. Auditable master matrix

| Gate | P1 | P2 | P3 | P4 | P5 | Start | End | Evidence | Remaining action |
|---|---|---|---|---|---|---|---|---|---|
| Turkey source discovery | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | 4 families | 5 families | §3 | verify TÜİK endpoints; HSGM group URLs |
| Turkey deduplication | PASS | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | done | TÜİK domains merged; TNSA kept separate | – |
| HSGM consolidation | PASS | PARTIAL | PARTIAL | PARTIAL | PASS | – | one family | §3 nested groups | enumerate 6 unverified groups |
| Global source discovery | PASS | PASS | PARTIAL | PASS | PARTIAL | 23 URLs | 26 families | §4 | ILOSTAT (non-Tier-1) |
| Global deduplication | PASS | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | done | url→family map in lineage JSON | – |
| upstream lineage | PARTIAL | PARTIAL | NOT_RUN | NOT_RUN | PASS | – | 20 rows | §7 | per-chart OWID origins; WPR/Worldometer UNKNOWN |
| official API discovery | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | – | 10 verified live | §1 loop D | TR sources; IARC/UNAIDS/ECDC |
| dataset/dataflow inventory | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | – | 75 rows | §6 | Turkish IDs; per-flow Turkey coverage |
| terms/licensing | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | 14 unknown | §8 | owner/legal on OECD, WHO, TR |
| revision behavior | PARTIAL | PARTIAL | PARTIAL | NOT_RUN | PASS | – | 4 unknown | §9 | read SGK and TÜİK revision policies |
| bounded acquisition | PASS | PASS | PASS | PASS | PASS | – | verified APIs bounded | §1 loop G | TR = per-release files |
| health-domain coverage | PARTIAL | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | 6 TR domain gaps | §10 | accept or add TR sources |
| source-gap search | PASS | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | +3 families | §12 | ILOSTAT optional |
| source classification | PASS | NOT_RUN | NOT_RUN | NOT_RUN | PASS | – | 31 classified | §5 | – |
| architecture readiness | BLOCKED | PARTIAL | PARTIAL | PARTIAL | PARTIAL | – | NO | §16 item 20 | close §14 items |

## 18. Local technical blockers

Not bypassed: NCBI reCAPTCHA, ScienceDirect 403, UN DL bot challenge (202), OECD terms page 403 to automation. HSGM `/tr/istatistikler` access-denied from this network. StatBase homepage unreachable. WebFetch failed on several JS-rendered official pages, so some terms rest on search summaries (marked UNVERIFIED).

## 19. Next single step

`CLOSE_REMAINING_SOURCE_BASE_GAPS`: (1) owner reads OECD terms; (2) owner/TR-network inspection of veriportali.tuik.gov.tr data endpoints and terms; (3) optionally request a WPP token (bulk files suffice); (4) enumerate HSGM groups from a TR runner; (5) inspect one SGK ZIP and the revision-policy PDF. Re-run this audit afterwards. `DESIGN_HEALTH_STATISTICS_PIPELINE_ARCHITECTURE` follows only when `SOURCE_BASE_ARCHITECTURE_READY = YES`.
