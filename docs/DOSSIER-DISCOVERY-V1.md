# DOSSIER DISCOVERY V1 — architecture and production plan

Status: **IN DEVELOPMENT on `dossier-discovery-v1`**. This document is not production truth until merged/released.

## 0. Mission

DOSSIER DISCOVERY exists to answer one question:

> **Which health topic is worth researching for a Turkish-language audience now?**

It does **not** perform the research, synthesize medical evidence, decide whether a claim is true, or write the dossier. Human selection is followed by a separate research workflow.

It must do two things at the same time:

1. represent real Turkish interest and health reality without being captured by one platform, creator, sponsor, or viral spike;
2. connect the Turkish audience to important topics emerging in modern international medicine, biomedical research, public health, geroscience, nutrition and health technology.

Canonical rule:

> **Demand tells us what to investigate. Evidence later tells us what we may say.**

## 1. Relationship to the existing Global Hub

DOSSIER DISCOVERY is **not**:

- a third acquisition path;
- a sixth semantic lane;
- a replacement for Haber / Research / Duyuru / Burs / Eğitim;
- a literature-research engine;
- an automatic publishing path.

Existing canonical temporal paths remain:

- `TIME_SENSITIVE`
- `EVERGREEN`

Existing semantic lanes remain unchanged.

DOSSIER DISCOVERY is an independent bounded-domain module inside GCOS. It may reuse existing GCOS source items when useful, but its sensor observations and candidates have their own runtime tables because numeric public-demand data, geospatial measurements, manual snapshots and creator observations are not ordinary Hub inbox items.

Acute events can still route to existing Haber/Research pipelines. Repeated or structural patterns can separately become DOSSIER candidates.

## 2. Five first-class discovery domains

```text
DOSSIER DISCOVERY
├── HEALTH
├── NUTRITION_PROTOCOL
├── SUPPLEMENT
├── LONGEVITY_TECHNOLOGY
└── POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH
```

All five share one signal fabric and one quality/governance layer, but each domain has its own discovery rules.

### 2.1 HEALTH

Examples: sleep, SIBO, migraine, tinnitus, anxiety, cortisol, type 2 diabetes, PFAS exposure as a health topic.

### 2.2 NUTRITION_PROTOCOL

Examples: intermittent fasting, time-restricted eating, Low-FODMAP, AIP, ketogenic diet, Mediterranean diet, fasting mimicking diet, Wahls Protocol.

The system discovers the protocol and its co-interest relations. It does not decide whether the protocol works.

### 2.3 SUPPLEMENT

Examples: magnesium, magnesium glycinate, creatine, berberine, taurine, NMN.

Forms may be first-class discovery concepts when people specifically search/discuss the form, e.g. `magnesium glycinate`, but the system does not research form superiority, dose, safety or efficacy.

### 2.4 LONGEVITY_TECHNOLOGY

Examples: epigenetic clocks, CGM, senolytics, partial cellular reprogramming, proteomics, photobiomodulation, HBOT.

The system detects attention, research activity and institutional/scientist interest. It does not infer efficacy or clinical readiness.

### 2.5 POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH

This domain covers both Turkey and globally significant public-health issues.

Core v1 subdomains:

- AIR_QUALITY
- WATER
- CLIMATE_HEALTH
- FOOD_SAFETY
- ENVIRONMENTAL_EXPOSURE
- PUBLIC_HEALTH_SURVEILLANCE
- ANTIMICROBIAL_RESISTANCE
- VECTOR_ONE_HEALTH
- POPULATION_RISK_BEHAVIOR

Examples: PM2.5, drinking-water access/quality, heat, antimicrobial resistance, PFAS, microplastics, wastewater surveillance, vector expansion, food adulteration patterns.

Health consequence must be central, not incidental. This module is not a general politics, climate-policy or world-news crawler.

## 3. Shared signal fabric

The canonical signal families are multidimensional. They are not collapsed into one opaque score.

```text
TURKEY_PUBLIC_DEMAND
TURKEY_SOCIAL_MOMENTUM
TR_CLINICIAN_CREATOR_PULSE

TURKEY_HEALTH_BURDEN
TURKEY_PUBLIC_HEALTH_DATA
ENVIRONMENTAL_MEASUREMENT

GLOBAL_MEDICAL_FRONTIER
GLOBAL_RESEARCH_ACTIVITY
GLOBAL_INSTITUTIONAL_FRONTIER
GLOBAL_PUBLIC_HEALTH_DATA
GLOBAL_ENVIRONMENTAL_OBSERVATION

GLOBAL_CREATOR_SCOUT

RELATION_SIGNAL
```

Missing signal = `UNKNOWN`, never zero.

### 3.1 Turkey public demand

Candidate readers:

- Google keyword/search-demand source;
- Google Trends TR;
- TikTok Creator Search Insights — manual/managed snapshot until a lawful production API exists;
- optional secondary keyword source when credits/API are available.

Search magnitude and velocity are separate.

### 3.2 Social momentum

Candidate readers:

- YouTube;
- permitted Instagram tracked-public provider;
- permitted TikTok public/trend data.

Social momentum means discussion/viewing/content activity. It never means prevalence or scientific truth.

### 3.3 Turkish clinician/health creator pulse

This panel contains health professionals who regularly create public health-education content. Posts are classified:

- HEALTH_EDUCATIONAL
- PATIENT_QUESTION
- CLINICAL_OBSERVATION
- RESEARCH_COMMENTARY
- PERSONAL
- PROMOTIONAL
- SPONSORED
- OWN_PRODUCT
- OWN_SERVICE

The first four may create topic observations. Commercial/personal material is excluded or down-weighted as a discovery signal.

A statement such as "my patients ask this often" becomes `CLINICIAN_REPORTED_PUBLIC_QUESTION`, not Turkish prevalence.

### 3.4 Global medical frontier

The global frontier is **not a list of celebrity doctors**.

Primary frontier signals come from:

- research-activity metadata;
- trial activity;
- major biomedical/public-health institutions;
- researcher/scientist topic activity;
- guideline/consensus update activity where available.

Named international clinicians/researchers are topic sensors and provenance, not dossier subjects.

The output is:

> "topic X is rising across independent frontier signals"

not:

> "Dr X says Y."

### 3.5 Global creator scouts

Functional/integrative/health creators may be useful topic scouts, but they are not placed at the same epistemic level as modern medical research activity.

Their role is discovery only. Their visibility must never overpower research/institutional signals through raw mention counts.

## 4. Concept architecture

One common identity layer allows domain separation plus cross-domain relations.

```text
dossier_concepts
├── HEALTH
├── NUTRITION_PROTOCOL
├── SUPPLEMENT
├── LONGEVITY_TECHNOLOGY
└── POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH
```

Minimum concept fields:

- id
- domain
- concept_type
- canonical_label_tr
- canonical_label_en
- parent_concept_id
- aliases
- optional external IDs
- state: PROPOSED / ACTIVE / PAUSED / REJECTED

External ontologies such as MeSH/SNOMED/UMLS/ICD/Wikidata are enrichment, not the canonical master.

Unknown topics/forms/protocols/technologies create proposals. They never become canonical automatically.

## 5. Expert/source identity

Accepted expert/creator records are canonical entities with:

- expert_id
- canonical_name
- exact credentials
- specialties
- country/languages
- panels
- official website/platform identities
- external IDs when available
- commercial profile / COI notes
- status: ACTIVE / WATCH / PAUSED / REJECTED

Entity resolution states:

- AUTO_LINK
- REVIEW_REQUIRED
- UNRESOLVED

Low-confidence merges are never automatic.

Rejected experts and reasons remain durable so the system does not repeatedly resurface them.

## 6. Reader architecture

Each reader uses one runtime contract:

```text
plan()
fetch()
normalize()
checkpoint()
```

Required telemetry:

- reader_id
- source_id
- last_attempt
- last_success
- next_due
- cursor
- items_seen
- items_new
- observations_written
- last_error
- failure_count
- freshness
- coverage
- quota/rate-limit state where applicable

One reader failure must not silence another reader.

Reader classes:

- RSS_WEB
- YOUTUBE_CHANNEL
- PUBLIC_DEMAND
- PUBLIC_DATA_API
- PUBLIC_TABLE
- PUBLICATION_METADATA
- GEO_OBSERVATION
- SURVEILLANCE_RELEASE
- MANUAL_SNAPSHOT

Every source also has a legal/access state:

- APPROVED
- RESTRICTED
- MANUAL_ONLY
- UNRESOLVED
- REJECTED

No unauthorized scraping, bot bypass or commercial use of a restricted research API.

## 7. Source item vs observation

A source item is not a topic.

A single article/video/publication/snapshot may produce several observations and relations.

```text
SOURCE ITEM
    ↓
NORMALIZE / CLASSIFY
    ↓
TOPIC OBSERVATIONS
    ↓
CONCEPT RESOLUTION
    ↓
RELATION OBSERVATIONS
```

The dossier source-item store keeps metadata/snippet/provenance only. Full article/transcript storage is not the default.

Observation kinds can represent:

- content mention;
- search magnitude;
- search velocity;
- social momentum;
- burden/utilization;
- measured environmental value;
- modeled environmental value;
- survey estimate;
- administrative statistic;
- surveillance change;
- research-activity count;
- institution/researcher topic activity.

Measurement provenance is explicit:

- MEASURED
- MODELED
- ADMINISTRATIVE
- SURVEY
- ESTIMATE
- ALERT
- CONTENT
- SEARCH
- SOCIAL

## 8. Relation architecture

Relation depth:

- 1 = SINGLE
- 2 = DOUBLE
- 3 = TRIPLE

V1 candidate generation is bounded to depth <= 3.

Discovery relation types:

- CO_INTEREST
- MENTIONED_WITH
- PUBLIC_SEARCH_ASSOCIATION
- CREATOR_ASSOCIATION
- FRONTIER_ASSOCIATION
- ENVIRONMENTAL_ASSOCIATION

The discovery layer does **not** create:

- CAUSES
- CURES
- TREATS
- IMPROVES
- PREVENTS

Two individually popular topics do not automatically create a pair candidate. A pair needs direct joint signal. Triple generation requires direct triple evidence or a sufficiently supported joint/pair network across at least two independent signal families.

## 9. Candidate generation

Candidate classes:

- STRONG
- EMERGING
- WATCH
- CORRECTIVE
- FRONTIER

### STRONG

Multiple independent signal families and healthy source diversity.

### EMERGING

A rising signal with at least one independent support family.

### WATCH

Interesting but insufficiently independent or persistent.

### CORRECTIVE

High public interest plus high misinformation/hype/commercial-risk characteristics. The system does not decide the claim is false; it says the topic deserves corrective research.

### FRONTIER

Strong global medical/public-health frontier activity even when Turkey demand is still low.

This allows Tıp Topluluğu to bring important global topics to Turkish readers before they are already mainstream.

## 10. Candidate Quality & Integrity Gate

The gate performs **signal hygiene, not medical research**.

Dimensions:

- signal_diversity
- source_quality
- creator_diversity
- platform_diversity
- persistence
- commercial_pressure
- hype_risk
- topic_coherence
- turkey_relevance
- global_significance
- audience_relevance
- relation_integrity
- data_strength
- geographic_spread
- sensationalism_risk

No single public "87/100" truth score.

Reason codes are mandatory, e.g.:

- MULTI_PLATFORM
- MULTI_CREATOR
- STRONG_TR_SEARCH
- GLOBAL_FRONTIER_RISING
- HIGH_COMMERCIAL_CONCENTRATION
- SINGLE_SOURCE_DEPENDENCY
- BURST_ONLY
- DIRECT_RELATION_SIGNAL
- LOW_TURKEY_DATA
- STRONG_OFFICIAL_DATA
- MODELED_DATA_ONLY

Creator concentration is corrected with:

- mention_count
- unique_creator_count
- unique_platform_count
- independent_signal_family_count

Reposts/near-duplicates should be origin-clustered where possible so one viral item is not counted as many independent signals.

## 11. Public / environmental health WOW gate

"Wow" does not mean clickbait. A good candidate is surprising, important, explainable and researchable.

Pattern detectors:

- SURPRISING_BASELINE
- CROSS_COUNTRY_GAP
- RAPID_CHANGE
- HIDDEN_EXPOSURE
- SPATIAL_INEQUALITY
- BEHAVIOR_SURPRISE
- SYSTEM_SURPRISE
- ONE_HEALTH_SIGNAL
- FRONTIER_IMPORT
- SCALE_SHOCK
- GLOBAL_SHIFT
- SCIENCE_TO_PUBLIC_HEALTH
- EVERYDAY_SYSTEM

Quality dimensions:

- SURPRISE
- PUBLIC_REACH
- TURKEY_RELEVANCE
- GLOBAL_SIGNIFICANCE
- AUDIENCE_RELEVANCE
- DATA_STRENGTH
- CONTRAST
- NOVELTY
- PERSONAL_PROXIMITY
- VISUALIZABILITY
- FRONTIER_VALUE
- SENSATIONALISM_RISK

A strong Turkey-specific signal is sufficient; a globally significant frontier topic may also pass with Turkey-specific data UNKNOWN.

Acute one-off events stay Haber. Repeated/structural patterns may become DOSSIER candidates.

## 12. Initial source strategy

### Existing GCOS sources to reuse as sensors where appropriate

Do not duplicate source truth. Existing PubMed, Europe PMC, Nature/NCCIH and related research/news sources may contribute research-activity/frontier observations without becoming evidence synthesis.

### New candidate source families, to be onboarded only through SOURCE-LIFECYCLE

Public demand / social:
- Google demand / Trends;
- YouTube;
- TikTok Creator Search Insights manual snapshot;
- Instagram/TikTok providers only after legal/access approval.

Turkey burden/public health:
- TÜİK;
- Sağlık Bakanlığı;
- Tarım ve Orman Bakanlığı;
- SGK where usable granularity is verified;
- MGM;
- SYGM.

Global/public health:
- WHO / WHO Europe;
- OECD;
- IHME/GBD where lawful machine access is available;
- IARC;
- ECDC / EFSA;
- WHO/UNICEF JMP;
- Copernicus CAMS;
- WHO CAESAR / antimicrobial consumption datasets;
- Lancet Countdown as release-driven context.

No source is considered production-active merely because it is listed in this architecture.

## 13. Cadence

Suggested v1 cadence:

- creator website/RSS: daily;
- YouTube tracked channels: daily;
- permitted social creator panel: daily;
- TikTok Creator Search Insights: weekly manual;
- Google/public demand: weekly;
- research/frontier topic aggregation: daily or weekly depending source;
- topic graph aggregation: daily;
- candidate generation: weekly;
- public-health structured data: release-driven or source-appropriate;
- expert-panel discovery: monthly.

Initial backfill is bounded to 90 days where the source supports it.

## 14. Human review and research handoff

Lifecycle:

```text
DISCOVERED
→ WATCH / CANDIDATE
→ REVIEW
→ ACCEPT | REJECT | SNOOZE
→ RESEARCH_REQUESTED
```

DOSSIER DISCOVERY ends at the research handoff.

The handoff may include:

- canonical topic title;
- aliases;
- domain;
- relation depth;
- WHY NOW;
- signal families;
- common public questions;
- related concepts;
- discovery provenance;
- quality/reason codes.

It does **not** include a scientific conclusion.

Research starts independently after human acceptance.

## 15. P5 governance

Human gate is required for:

- NEW_TOPIC
- NEW_PROTOCOL
- NEW_SUPPLEMENT
- NEW_SUPPLEMENT_FORM
- NEW_LONGEVITY_TECH
- NEW_EXPERT
- NEW_RELATION

Actions:

- ACCEPT
- REJECT
- SNOOZE
- PAUSE

Rejected decisions and reasons persist.

Feedback never autonomously changes canonical registries, weights, source states or cadence.

## 16. Five Pillars

### P1 — Production-ready

- independent module;
- source/readers fail in isolation;
- weekly candidate output;
- no dependency on full Instagram/TikTok automation;
- no research synthesis dependency;
- no change to existing temporal-path semantics.

### P2 — Real E2E

Production proof must show:

```text
real source
→ source item / signal
→ observation
→ concept resolution
→ relation (when applicable)
→ candidate
→ quality gate
→ human review
```

Synthetic-only PASS is not enough.

### P3 — Observable / recoverable

Every reader and candidate is traceable:

- source;
- period;
- geography;
- measurement type;
- cursor;
- timestamps;
- extractor/algorithm version;
- quality reasons;
- signal snapshot IDs.

The system must be able to answer: "Why was this candidate proposed on that date?"

### P4 — Bounded

- no whole-platform crawl;
- bounded 90-day initial backfill;
- max concept/relation depth = 3;
- bounded URLs/videos per run;
- no full-article archive by default;
- raw personal audience data is not stored;
- no person-level patient profiling;
- public/environmental readers fetch only necessary indicators/geography.

### P5 — Governed learning

- all canonical changes are human-gated;
- reject reasons persist;
- feedback is evidence, not autonomous mutation;
- no automatic publication;
- no automatic medical claim generation.

## 17. LOOP control

### L — LIVE STATE

At branch creation:
- GCOS main production remains operational;
- canonical paths remain TIME_SENSITIVE + EVERGREEN;
- DOSSIER DISCOVERY has no production reader, table or route yet;
- existing research/news sources may later be reused as sensors;
- no remote migration or deploy is authorized by this architecture work.

### O — OBJECTIVE

Build a bounded production module that produces 10–20 high-quality weekly DOSSIER candidates across the five domains, including single/double/triple relations, without performing evidence synthesis.

### O — OBSERVABILITY / OUTPUT

Each increment must report:

- readers attempted/succeeded/failed;
- items/signals seen;
- observations written;
- concepts linked/proposed;
- relations created/proposed;
- candidates generated;
- quality reason codes;
- human review outcomes.

Local PASS and live PASS are distinct.

### P — PRODUCTION GATE

V1 can advance when it has:

1. schema + runtime contracts;
2. one real public-demand reader;
3. one real global-frontier/research-activity reader;
4. one real Turkey health/public-health reader;
5. topic normalization;
6. single + pair candidate generation;
7. quality/integrity gate;
8. human review;
9. provenance;
10. scheduler/reader telemetry.

Not blockers for V1:

- every expert onboarded;
- full TikTok automation;
- full Instagram automation;
- triple generation;
- all public-health datasets;
- advanced seasonality;
- full ontology mapping;
- Semrush availability.

When the production gate passes, advance. Do not open a new audit merely because an optional source remains deferred.

## 18. Implementation increments

### Increment A — core contracts and schema

- additive D1 schema;
- domain/status enums in code;
- observation/candidate/review contracts;
- no source activation;
- local tests.

### Increment B — minimal real readers

- reuse one existing global-frontier/research source;
- add one Turkey public-health structured reader through source lifecycle;
- add one public-demand reader or bounded manual snapshot reader;
- write reader telemetry.

### Increment C — normalization and relations

- concept resolver;
- aliasing;
- single + pair relations;
- origin-cluster/duplicate guard.

### Increment D — candidate quality gate

- reason-code based quality snapshots;
- STRONG / EMERGING / WATCH / CORRECTIVE / FRONTIER;
- public-health WOW detector.

### Increment E — Hub review

- DOSYA RADARI route in Hub;
- domain filters;
- WHY NOW;
- source/signal provenance;
- ACCEPT / REJECT / SNOOZE;
- research handoff export.

### Increment F — production canary

- bounded readers;
- bounded candidate output;
- no auto-publish;
- live E2E evidence;
- owner-approved deploy/migration only.

## 19. Non-goals for V1

- medical evidence synthesis;
- automatic truth verdicts;
- automatic "myth" labeling;
- dose/safety/interaction research for supplements;
- protocol efficacy assessment;
- longevity-technology efficacy assessment;
- full literature review;
- patient profiling;
- whole-platform social scraping;
- autonomous source/weight/cadence mutation;
- CCOS contract change unless the later research-handoff workflow explicitly requires one.
