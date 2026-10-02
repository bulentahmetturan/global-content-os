# DOSSIER DISCOVERY V1 — ARCHITECTURE ONLY

Status: **ARCHITECTURE DESIGN ONLY on `dossier-discovery-v1`**.

**No implementation is authorized by this document.**  
No D1 migration, runtime code, source activation, scheduler change, Hub route, deploy, production write or CCOS contract change is part of the current step.

This document freezes the architecture for the new DOSYA discovery areas discussed to date. Implementation will be a separate owner-approved step.

---

## 0. Mission

DOSSIER DISCOVERY answers one question:

> **Which health-related topic is worth researching for a Turkish-language audience now?**

It must do two things simultaneously:

1. represent real interest, questions and health reality in Türkiye without being captured by one creator, platform, sponsor, viral spike or commercial campaign;
2. connect Turkish readers to important subjects emerging in modern international medicine, biomedical research, geroscience, nutrition, health technology, environmental health and public health.

Canonical epistemic rule:

> **Demand and frontier signals tell us what to investigate. Evidence later tells us what we may say.**

The system discovers and prioritizes **topics**. It does not research those topics.

---

## 1. Hard boundary: DISCOVERY != RESEARCH

DOSSIER DISCOVERY does **not**:

- synthesize scientific literature;
- decide whether a treatment, supplement, protocol or technology works;
- create efficacy claims;
- create causal medical relationships;
- produce dose/safety/interaction guidance;
- label something a myth as a scientific verdict;
- summarize "what Dr X thinks" as the dossier;
- write the dossier;
- publish automatically.

After a human accepts a topic, a separate research workflow starts independently.

Example:

```text
DISCOVERY
Magnesium Glycinate × Sleep
        ↓
HUMAN ACCEPT
        ↓
INDEPENDENT RESEARCH
forms / evidence / myths / safety / dose / mechanisms / etc.
```

The research content is outside this architecture.

---

## 2. Relationship to Global Hub

DOSSIER DISCOVERY is **not**:

- a third temporal acquisition path;
- a sixth existing semantic lane;
- a replacement for Haber / Research / Duyuru / Burs / Eğitim;
- a new automatic publishing channel.

Existing canonical temporal paths remain:

```text
TIME_SENSITIVE
EVERGREEN
```

Existing semantic lanes remain unchanged.

DOSSIER DISCOVERY is a **parallel discovery domain** owned by GCOS. Existing GCOS source material may be reused as sensors when appropriate, but DOSYA candidate logic is separate from ordinary Hub inbox logic.

An acute event may remain Haber while a repeated/structural pattern from the same source becomes a DOSYA candidate.

---

# 3. Top-level architecture

```text
                           DOSSIER DISCOVERY
                                  │
                       SHARED SIGNAL FABRIC
                                  │
        ┌─────────────────────────┼───────────────────────────┐
        │                         │                           │
        ▼                         ▼                           ▼
 TURKEY REALITY             GLOBAL FRONTIER            PUBLIC / SOCIAL
 & DEMAND                   & RESEARCH ACTIVITY         ATTENTION
        │                         │                           │
        └─────────────────────────┼───────────────────────────┘
                                  ▼
                         CONCEPT NORMALIZATION
                                  ▼
                         CANONICAL CONCEPT GRAPH
                                  │
        ┌──────────────┬──────────┼──────────┬──────────────┐
        ▼              ▼          ▼          ▼              ▼
      HEALTH       NUTRITION   SUPPLEMENT  LONGEVITY    POPULATION,
                    PROTOCOL                 TECH        ENVIRONMENTAL
                                                        & PUBLIC HEALTH
        └──────────────┴──────────┼──────────┴──────────────┘
                                  ▼
                     CROSS-DOMAIN RELATION ENGINE
                                  ▼
                       CANDIDATE GENERATION
                                  ▼
                     QUALITY & INTEGRITY GATE
                                  ▼
                            DOSYA RADARI
                                  ▼
                   ACCEPT / REJECT / SNOOZE
                                  ▼
                     EXTERNAL RESEARCH HANDOFF
```

---

# 4. Five first-class DOSYA domains

The five domains share infrastructure but are **not flattened into one generic topic bucket**.

```text
1. HEALTH
2. NUTRITION_PROTOCOL
3. SUPPLEMENT
4. LONGEVITY_TECHNOLOGY
5. POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH
```

Each domain has:

- its own concept taxonomy;
- its own preferred signal mix;
- its own quality rules;
- its own candidate patterns;
- shared cross-domain relations.

---

# 5. HEALTH DOSSIER architecture

## 5.1 Scope

Health concepts can include:

```text
DISEASE_CONDITION
SYMPTOM
PHYSIOLOGY
DIAGNOSTIC
TREATMENT
MEDICATION
EXPOSURE
RISK_FACTOR
BEHAVIOR_LIFESTYLE
BIOMARKER
INTERVENTION
```

Examples:

- Sleep
- SIBO
- Migraine
- Tinnitus
- Anxiety
- Cortisol
- Type 2 Diabetes
- PFAS exposure
- Insulin resistance
- PCOS

## 5.2 Preferred discovery signals

```text
TURKEY_PUBLIC_DEMAND
        +
TURKEY_SOCIAL_MOMENTUM
        +
TR_CLINICIAN_CREATOR_PULSE
        +
TURKEY_HEALTH_BURDEN
        +
GLOBAL_MEDICAL_FRONTIER
        +
GLOBAL_RESEARCH_ACTIVITY
```

Turkey burden is valuable but not mandatory. A focused topic can remain a strong candidate with burden = UNKNOWN / NOT_APPLICABLE.

## 5.3 Candidate forms

```text
Sleep
SIBO
Sleep × Magnesium
SIBO × Probiotics
Sleep × Anxiety × Cortisol
```

No causal meaning is inferred.

---

# 6. NUTRITION PROTOCOL DOSSIER architecture

Nutrition protocols are first-class concepts, not HEALTH aliases.

## 6.1 Protocol families

```text
FASTING
MEAL_TIMING
CARBOHYDRATE_RESTRICTION
ELIMINATION
GI_PROTOCOL
DIETARY_PATTERN
NAMED_PROTOCOL
OTHER
```

Examples:

- Intermittent Fasting
- Time-Restricted Eating
- Alternate-Day Fasting
- Fasting Mimicking Diet
- Low-FODMAP
- AIP
- Ketogenic Diet
- Mediterranean Diet
- Elemental Diet
- Wahls Protocol

## 6.2 Preferred discovery signals

```text
TURKEY_PUBLIC_DEMAND
        +
TURKEY_SOCIAL_MOMENTUM
        +
TR_CLINICIAN_CREATOR_PULSE
        +
GLOBAL_PROTOCOL / NUTRITION SCOUTS
        +
GLOBAL_RESEARCH_ACTIVITY
        +
PERSISTENCE
```

The system discovers that a protocol is becoming worth investigating. It does **not** determine whether the protocol is effective.

## 6.3 Candidate forms

```text
Intermittent Fasting
Low-FODMAP

Intermittent Fasting × Sleep
Low-FODMAP × SIBO
AIP × Hashimoto

Intermittent Fasting × Type 2 Diabetes × Weight Loss
```

The graph records co-interest / joint topic activity only.

---

# 7. SUPPLEMENT DOSSIER architecture

SUPPLEMENT is a discovery domain, **not a supplement knowledge base**.

The system only brings the supplement/topic to us. The later research process may investigate forms, uses, myths, dose, safety and evidence.

## 7.1 Scope

Examples:

- Magnesium
- Magnesium Glycinate
- Creatine
- Berberine
- Taurine
- Glycine
- Omega-3
- NAC
- NMN
- CoQ10

## 7.2 Topic hierarchy

Forms may be separate discovery concepts when there is independent demand:

```text
MAGNESIUM
├── Magnesium Glycinate
├── Magnesium Citrate
├── Magnesium Oxide
└── Magnesium L-Threonate
```

This hierarchy is for **topic identity**, not evidence or chemistry assessment.

## 7.3 Preferred discovery signals

```text
TURKEY_PUBLIC_DEMAND
        +
TURKEY_SOCIAL_MOMENTUM
        +
TR_CLINICIAN / PHARMACIST CREATOR PULSE
        +
GLOBAL_CREATOR_SCOUT
        +
GLOBAL_MEDICAL_FRONTIER
        +
GLOBAL_RESEARCH_ACTIVITY
        +
COMMERCIAL_CONCENTRATION CHECK
```

Commercial-pressure control is stricter in this domain than in most others.

## 7.4 Candidate forms

```text
Magnesium Glycinate
Creatine
Berberine

Magnesium Glycinate × Sleep
Creatine × Cognition
Creatine × Longevity
Berberine × Glucose
```

The system must **not** convert these into:

- "Magnesium glycinate improves sleep."
- "Creatine improves cognition."
- "NMN reverses aging."

Those belong to later research.

---

# 8. LONGEVITY TECHNOLOGY DOSSIER architecture

LONGEVITY_TECHNOLOGY is separate from supplements and health topics.

## 8.1 Technology families

```text
MEASUREMENT
DIAGNOSTIC
DIGITAL_MONITORING
THERAPEUTIC_PLATFORM
DRUG_PLATFORM
REGENERATIVE
GENE_TECH
CELLULAR_TECH
OMICS
DEVICE
CONSUMER_TECH
```

Examples:

- Epigenetic clocks
- Biological-age measurement
- CGM
- Proteomics
- Metabolomics
- Senolytics
- mTOR-related interventions
- Partial cellular reprogramming
- Gene editing
- Stem-cell approaches
- Photobiomodulation
- HBOT
- DEXA
- VO2max measurement

## 8.2 Preferred discovery signals

Here the source hierarchy changes.

```text
GLOBAL_MEDICAL_FRONTIER
        +
GLOBAL_RESEARCH_ACTIVITY
        +
GLOBAL_INSTITUTIONAL_FRONTIER
        +
RESEARCHER / SCIENTIST TOPIC ACTIVITY
        +
TURKEY_PUBLIC_DEMAND
        +
SOCIAL CURIOSITY
```

Global research/scientist/institutional activity is stronger than creator popularity.

## 8.3 International doctors/researchers

International doctors are **topic sensors**, not content subjects.

Wrong model:

```text
"Amy Myers says..."
"Peter Attia thinks..."
```

Correct model:

```text
expert/researcher source
        ↓
topic observation
        ↓
independent corroboration
        ↓
DOSYA candidate
```

A name stays in provenance. The dossier remains topic-centered.

## 8.4 Candidate forms

```text
Epigenetic Clocks
Partial Cellular Reprogramming
CGM

CGM × Intermittent Fasting
VO2max × Healthy Aging
Partial Reprogramming × Aging
```

The system does not infer efficacy or clinical readiness.

---

# 9. POPULATION, ENVIRONMENTAL & PUBLIC HEALTH DOSSIER architecture

This is not merely a Turkey-environment lane. It covers:

1. important realities in Türkiye;
2. globally significant public/environmental health topics;
3. cross-border/transnational health issues.

## 9.1 Three discovery lanes

```text
POPULATION, ENVIRONMENTAL & PUBLIC HEALTH
│
├── TURKEY_REALITY
├── GLOBAL_PUBLIC_HEALTH_FRONTIER
└── TRANSNATIONAL_HEALTH
```

### TURKEY_REALITY

Turkey-specific population, environmental, infrastructure or surveillance signals.

### GLOBAL_PUBLIC_HEALTH_FRONTIER

Globally important or emerging issues may qualify even if Turkey-specific data are weak or unavailable.

### TRANSNATIONAL_HEALTH

Cross-border issues such as:

- antimicrobial resistance;
- air pollution;
- wildfire smoke;
- vector expansion;
- pandemic/wastewater surveillance;
- PFAS;
- water stress;
- food-chain contamination.

## 9.2 Core topic families

```text
AIR_QUALITY
WATER
CLIMATE_HEALTH
FOOD_SAFETY
ENVIRONMENTAL_EXPOSURE
PUBLIC_HEALTH_SURVEILLANCE
ANTIMICROBIAL_RESISTANCE
VECTOR_ONE_HEALTH
POPULATION_RISK_BEHAVIOR
```

Possible future families are architecture-supported but not required now:

```text
NOISE
HOUSING
WASTE_WASTEWATER
OCCUPATIONAL_ENVIRONMENT
VECTOR_ENVIRONMENT
```

## 9.3 WATER is not one concept

```text
WATER
├── DRINKING_WATER_ACCESS
├── DRINKING_WATER_QUALITY
├── WATER_TREATMENT
├── WATER_SECURITY_SCARCITY
├── WASTEWATER
├── BATHING_WATER
└── WATER_CONTAMINANTS
```

Access != quality != treatment != availability.

## 9.4 Primary signal hierarchy

Unlike supplements or social topics, this domain is more data-engine than social-listening engine.

```text
OFFICIAL / STRUCTURED PUBLIC DATA
        +
ENVIRONMENTAL MEASUREMENT
        +
PUBLIC HEALTH SURVEILLANCE
        +
GLOBAL PUBLIC HEALTH DATA
        +
GLOBAL FRONTIER
        +
PUBLIC CURIOSITY
```

Public/social interest is a relevance signal, not the factual health anchor.

## 9.5 Source families

Architecture-level candidate source families:

Turkey:
- TÜİK;
- Sağlık Bakanlığı / HSGM;
- Tarım ve Orman Bakanlığı;
- SYGM;
- MGM;
- SGK where usable granularity exists;
- national surveillance systems.

Global:
- WHO / WHO Europe;
- OECD;
- WHO/UNICEF JMP;
- IARC;
- IHME/GBD where lawful machine access exists;
- ECDC / EFSA;
- Copernicus CAMS;
- WHO CAESAR / antimicrobial consumption datasets;
- major public-health surveillance and environmental-observation systems.

Source inclusion in architecture does not mean production activation.

## 9.6 Observation provenance

Public/environmental data require explicit observation kind:

```text
MEASURED
MODELED
ADMINISTRATIVE
SURVEY
ESTIMATE
ALERT
CONTENT
SEARCH
SOCIAL
```

Measured and modeled values are never treated as the same thing.

## 9.7 WOW architecture

"Wow" means:

> surprising + important + explainable + researchable

not clickbait.

Pattern detectors:

```text
SURPRISING_BASELINE
CROSS_COUNTRY_GAP
RAPID_CHANGE
HIDDEN_EXPOSURE
SPATIAL_INEQUALITY
BEHAVIOR_SURPRISE
SYSTEM_SURPRISE
ONE_HEALTH_SIGNAL
FRONTIER_IMPORT
SCALE_SHOCK
GLOBAL_SHIFT
SCIENCE_TO_PUBLIC_HEALTH
EVERYDAY_SYSTEM
```

Quality dimensions:

```text
SURPRISE
PUBLIC_REACH
TURKEY_RELEVANCE
GLOBAL_SIGNIFICANCE
AUDIENCE_RELEVANCE
DATA_STRENGTH
CONTRAST
NOVELTY
PERSONAL_PROXIMITY
VISUALIZABILITY
FRONTIER_VALUE
SENSATIONALISM_RISK
```

A globally important topic can qualify when:

```text
GLOBAL_SIGNIFICANCE = HIGH
AUDIENCE_RELEVANCE = HIGH
TURKEY_SPECIFIC_DATA = UNKNOWN
```

Unknown is not zero.

## 9.8 Acute event vs DOSYA

```text
single acute event
→ HABER

repeated / structural pattern
→ DOSYA CANDIDATE

new global issue with strong health significance
→ FRONTIER CANDIDATE
```

---

# 10. Shared signal fabric

Canonical signal families:

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

No opaque universal score is allowed to erase these dimensions.

---

# 11. Turkish clinician / health creator architecture

The panel contains public-facing health professionals who regularly create health-education content.

Eligible content classes:

```text
HEALTH_EDUCATIONAL
PATIENT_QUESTION
CLINICAL_OBSERVATION
RESEARCH_COMMENTARY
```

Other classes:

```text
PERSONAL
PROMOTIONAL
SPONSORED
OWN_PRODUCT
OWN_SERVICE
```

Commercial/personal material is excluded or treated with lower confidence.

A creator saying "my patients ask this often" becomes:

```text
CLINICIAN_REPORTED_PUBLIC_QUESTION
```

not prevalence.

## 11.1 Current user-approved Turkish seed panel

These are seed candidates for identity/credential verification and later source wiring. Inclusion does not itself assign scientific authority or production activation.

- Prof. Dr. Nazan Uysal Harzadın
- Prof. Dr. Muhammed Keskin
- Prof. Dr. Osman Müftüoğlu
- Prof. Dr. Derya Uludüz
- Dr. Ayça Kaya
- Prof. Dr. Zeynep Tartan
- Prof. Dr. Halit Yerebakan
- Ecz. Mehmet Müderrisoğlu
- Dt. Tuğba Duymaz
- Dr. Mustafa Kalkan — Instagram seed: `@drmustafakalkan`

---

# 12. Global expert / researcher architecture

Global people are divided by role; they are not all one epistemic tier.

```text
CLINICIAN_RESEARCHER
ACADEMIC_SCIENTIST
CLINICIAN_CREATOR
HEALTH_CREATOR
FUNCTIONAL_INTEGRATIVE_CREATOR
PHARMACIST_CREATOR
INSTITUTION
```

## 12.1 Modern medical frontier

Primary frontier is built from:

- research activity;
- trials;
- major institutions;
- scientist/researcher topic activity;
- guideline/consensus activity where available.

This is the main bridge between Turkish readers and modern international medicine.

## 12.2 Creator scouts

Functional/integrative/health creators can identify topics worth investigating, but their popularity cannot substitute for medical-frontier signals.

Their job:

```text
discover topic
→ create observation
→ await independent signal
```

not:

```text
creator statement
→ dossier truth
```

---

# 13. Expert graph

Accepted expert sources may reveal other experts they repeatedly cite.

```text
EXPERT_A
   └── MENTIONS_EXPERT
          └── EXPERT_B
```

Unknown repeated experts become:

```text
NEW_EXPERT_CANDIDATE
```

They never become ACTIVE automatically.

Entity resolution states:

```text
AUTO_LINK
REVIEW_REQUIRED
UNRESOLVED
```

Low-confidence merge is forbidden.

Rejected experts and reasons persist.

---

# 14. Canonical concept architecture

One shared concept identity layer preserves domain boundaries and allows cross-domain relations.

```text
DOSSIER_CONCEPT
├── HEALTH
├── NUTRITION_PROTOCOL
├── SUPPLEMENT
├── LONGEVITY_TECHNOLOGY
└── POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH
```

Concept-level architecture:

```text
concept_id
domain
concept_type
canonical_label_tr
canonical_label_en
parent_concept_id?
aliases_tr[]
aliases_en[]
acronyms[]
colloquial_terms[]
external_mappings[]
state
```

External ontologies (MeSH, SNOMED CT, ICD, UMLS, Wikidata etc.) are enrichment, not the canonical master.

Unknown concepts create proposals only.

---

# 15. Source → observation architecture

A source is not a topic.

```text
SOURCE / SIGNAL
      ↓
SOURCE ITEM / SNAPSHOT
      ↓
NORMALIZE
      ↓
CONTENT / DATA CLASSIFY
      ↓
CONCEPT RESOLUTION
      ↓
TOPIC OBSERVATION
      ↓
RELATION OBSERVATION
```

The architecture must support content and non-content sources:

- article/video metadata;
- public search demand;
- social trend snapshots;
- burden statistics;
- measured environmental data;
- modeled environmental data;
- survey estimates;
- surveillance releases;
- research-activity counts;
- institution/researcher topic activity.

Full article/transcript storage is not the default.

---

# 16. Reader architecture

Future readers must share one abstract contract:

```text
plan()
fetch()
normalize()
checkpoint()
```

Reader classes:

```text
RSS_WEB
YOUTUBE_CHANNEL
PUBLIC_DEMAND
PUBLIC_DATA_API
PUBLIC_TABLE
PUBLICATION_METADATA
GEO_OBSERVATION
SURVEILLANCE_RELEASE
MANUAL_SNAPSHOT
```

Every source has a legal/access state:

```text
APPROVED
RESTRICTED
MANUAL_ONLY
UNRESOLVED
REJECTED
```

No unauthorized scraping, anti-bot bypass or restricted commercial API use.

---

# 17. Cross-domain relation engine

Relation depth:

```text
1 = SINGLE
2 = DOUBLE
3 = TRIPLE
4+ = COMPOSITE (supported conceptually, not initial automatic generation)
```

Discovery relations:

```text
CO_INTEREST
MENTIONED_WITH
PUBLIC_SEARCH_ASSOCIATION
CREATOR_ASSOCIATION
FRONTIER_ASSOCIATION
ENVIRONMENTAL_ASSOCIATION
```

The discovery layer never creates:

```text
CAUSES
CURES
TREATS
IMPROVES
PREVENTS
```

## 17.1 Pair integrity

```text
Sleep popular
+
Magnesium popular
```

does **not** automatically mean:

```text
Sleep × Magnesium
```

Direct joint signal is required.

## 17.2 Triple integrity

A triple requires:

- direct triple signal; or
- sufficiently supported pair/joint network;
- plus independent evidence across at least two signal families.

This prevents combinatorial spam.

---

# 18. Candidate classes

```text
STRONG
EMERGING
WATCH
CORRECTIVE
FRONTIER
```

### STRONG
Multiple independent signal families, healthy diversity and sufficient persistence.

### EMERGING
Rising topic with at least one independent supporting family.

### WATCH
Interesting, but not yet independent/persistent enough.

### CORRECTIVE
High public interest plus high misinformation, commercial or hype risk. This means "research this carefully," not "this claim is false."

### FRONTIER
Strong global medical/public-health frontier activity even if Turkish demand is still low.

---

# 19. Candidate Quality & Integrity Gate

The gate performs **signal hygiene**, not research.

Dimensions:

```text
signal_diversity
source_quality
creator_diversity
platform_diversity
persistence
commercial_pressure
hype_risk
topic_coherence
turkey_relevance
global_significance
audience_relevance
relation_integrity
data_strength
geographic_spread
sensationalism_risk
```

Missing = UNKNOWN, never 0.

No single public "truth score".

Reason codes explain the decision, for example:

```text
MULTI_PLATFORM
MULTI_CREATOR
STRONG_TR_SEARCH
GLOBAL_FRONTIER_RISING
HIGH_COMMERCIAL_CONCENTRATION
SINGLE_SOURCE_DEPENDENCY
BURST_ONLY
DIRECT_RELATION_SIGNAL
LOW_TURKEY_DATA
STRONG_OFFICIAL_DATA
MODELED_DATA_ONLY
```

Raw mention count is never sufficient.

Independence architecture tracks:

```text
mention_count
unique_creator_count
unique_platform_count
independent_signal_family_count
```

Near-duplicates/reposts should be origin-clustered where possible.

---

# 20. Temporal signal model

Initial architecture uses:

```text
7D  = burst
30D = current momentum
90D = baseline
```

This allows:

- viral spike;
- persistent demand;
- emerging frontier;
- sustained structural issue

to remain distinguishable.

Advanced seasonality/z-score models are optional future improvements, not architectural dependencies.

---

# 21. Candidate output architecture

Weekly radar is separated by domain:

```text
DOSYA RADARI

HEALTH
• ...

NUTRITION PROTOCOLS
• ...

SUPPLEMENTS
• ...

LONGEVITY TECHNOLOGIES
• ...

POPULATION, ENVIRONMENTAL & PUBLIC HEALTH
• ...

RELATIONSHIPS
• ...
```

Each candidate shows **WHY NOW**, not a scientific verdict.

Example:

```text
MAGNESIUM GLYCINATE × SLEEP

Domain:
SUPPLEMENT × HEALTH

Why now:
- Turkish demand rising
- multi-platform discussion
- multiple independent creator mentions
- global topic activity present

Signal quality:
- diversity: HIGH
- persistence: HIGH
- commercial pressure: MEDIUM
- relation integrity: DIRECT

Candidate class:
STRONG

Scientific conclusion:
NONE — research required
```

---

# 22. Human review architecture

Candidate lifecycle:

```text
DISCOVERED
→ WATCH / CANDIDATE
→ REVIEW
→ ACCEPT | REJECT | SNOOZE
→ RESEARCH_REQUESTED
```

Canonical proposal types:

```text
NEW_HEALTH_TOPIC
NEW_PROTOCOL
NEW_SUPPLEMENT
NEW_SUPPLEMENT_FORM
NEW_LONGEVITY_TECH
NEW_PUBLIC_HEALTH_TOPIC
NEW_EXPERT
NEW_RELATION
```

All require human governance.

Reject reasons persist, for example:

```text
NOISE
DUPLICATE
TOO_BROAD
TOO_NARROW
COMMERCIAL_ARTIFACT
NO_AUDIENCE_RELEVANCE
NO_INDEPENDENT_SIGNAL
RELATION_NOT_SUPPORTED
OUT_OF_SCOPE
```

Feedback cannot automatically rewrite registries, weights, source states or cadence.

---

# 23. Research handoff architecture

After ACCEPT, discovery stops.

Handoff contains only:

```text
canonical topic
domain
aliases
relation depth
WHY NOW
signal-family summary
common public questions
related concepts
discovery provenance
quality reason codes
```

It does not contain:

- efficacy conclusion;
- myth verdict;
- treatment recommendation;
- dose;
- safety conclusion;
- literature synthesis.

Research begins independently from that point.

---

# 24. Privacy / legal architecture

The system is not a patient-profiling system.

Do not store or infer:

- commenter health conditions;
- commenter identity unless strictly required by an approved provider contract;
- patient identity;
- person-level medical status;
- person-level location for health inference.

Data minimization by default.

Public professional creators may be represented as canonical source entities.

---

# 25. LOOP control — architecture stage

## L — LIVE STATE

- GCOS production remains unchanged.
- TIME_SENSITIVE + EVERGREEN remain canonical acquisition paths.
- DOSSIER DISCOVERY is architecture only.
- No new production reader exists from this work.
- No D1 migration has been created.
- No scheduler/runtime route has been changed.
- No remote write/deploy has been made.
- Existing sources may later be reused as sensors, but this document does not activate them.

## O — OBJECTIVE

Freeze one coherent architecture for all five new DOSYA discovery domains and their shared signal, relation, quality and governance layers.

## O — OBSERVABILITY / OUTPUT

Architecture is complete only when it explicitly defines:

- five domains;
- signal families;
- source roles;
- international frontier role;
- creator role;
- concept identity;
- relation rules;
- public-health WOW logic;
- quality gate;
- human governance;
- research handoff boundary;
- legal/privacy boundary.

## P — ARCHITECTURE GATE

Architecture PASS requires:

1. discovery vs research boundary is unambiguous;
2. nutrition protocols, supplements and longevity technologies are first-class domains;
3. public/environmental/public health supports both Turkey and global significance;
4. international doctors are topic sensors, not dossier protagonists;
5. global modern medicine/research activity has its own stronger frontier channel;
6. Turkey demand cannot be replaced by social popularity alone;
7. commercial/manipulation controls exist;
8. cross-domain pairs/triples require joint signal;
9. no autonomous canonical mutation;
10. existing GCOS temporal/semantic architecture remains untouched.

**Current step ends at this gate. Implementation is explicitly out of scope.**

---

# 26. Five Pillars — architecture conformance

## P1 — Production-ready by design

The architecture can later be implemented as isolated readers/modules without making every optional source a blocker.

## P2 — Real E2E by design

The future contract is:

```text
real source
→ signal/source item
→ observation
→ concept
→ relation
→ candidate
→ quality gate
→ human review
```

No synthetic-only architecture is accepted as the target state.

## P3 — Observable / recoverable by design

Future observations/candidates must remain attributable to:

- source;
- time window;
- geography where relevant;
- measurement type;
- provenance;
- extractor/algorithm version;
- reason codes.

The design must be able to answer: "Why was this topic proposed then?"

## P4 — Bounded by design

- no whole-platform crawl;
- bounded windows;
- bounded relation depth;
- no default full-text archive;
- no patient profiling;
- no unrestricted source expansion;
- no evidence-synthesis creep inside discovery.

## P5 — Governed by design

- new concepts are proposals;
- new experts are proposals;
- new relations are proposals;
- human ACCEPT / REJECT / SNOOZE remains mandatory;
- feedback does not autonomously mutate canonical behavior.

---

# 27. Current architectural decision

The canonical model is therefore:

```text
FIVE DOMAIN RADARS
        +
SHARED SIGNAL FABRIC
        +
GLOBAL MEDICAL / PUBLIC-HEALTH FRONTIER
        +
CROSS-DOMAIN CONCEPT GRAPH
        +
QUALITY & INTEGRITY GATE
        +
HUMAN REVIEW
        ↓
RESEARCH TOPIC HANDOFF
```

The system's job ends at:

> **"This is a healthy, sufficiently independent, relevant and research-worthy topic to put in front of the editorial team now."**

The system does not answer the topic itself.
