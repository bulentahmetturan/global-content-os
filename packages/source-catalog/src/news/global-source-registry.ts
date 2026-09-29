// Global News Hub source registry (Batch N2-FINAL). Durable, channel-agnostic
// truth: WHO publishes what, what logical sources exist, what monitored
// targets/sub-feeds are real. Contains ZERO Kaduse-specific editorial
// decisions -- those live in multi_channel_design's
// channels/kaduse-medikal/content/news-sources.json, referencing the IDs
// defined here by ID only.
//
// Verification discipline (batch section 12): official domains for
// well-established government/international-organization/industry sites are
// stated with confidence from general knowledge. No RSS/API feed is marked
// machineReadable:true or transportStatus other than WEB_ONLY/PENDING_MANUAL/
// UNRESOLVED unless this batch actually confirmed it (see the handful of
// WebSearch-verified naming corrections noted per-entry below). This is
// intentionally conservative: it is safe to under-claim transport and correct
// it later, not to invent a feed that does not exist.
//
// Verification vs. transport (Batch N2-FINAL-R1): LogicalSource.verificationStatus
// answers "was this source's identity/naming/ownership freshly checked against
// an official source in a given batch?" -- a completely different question
// from MonitoredTarget.transportStatus ("is there a verified machine-readable
// feed?"). Only 5 of 54 sources carry verificationStatus:
// 'FRESHLY_VERIFIED_THIS_BATCH' (their ambiguous naming/ownership was
// WebSearch-checked in Batch N2-FINAL, 2026-09-04): ec-hta-htacg, healthai-news,
// nhs-aidrs-news, jtc21-ai, fierce-medtech. Every other source is honestly
// 'PENDING_VERIFICATION' (the default) -- their official domains were stated
// from high-confidence general knowledge, not freshly re-checked. Do not mark
// all 54 verified merely to satisfy the schema.
import { GlobalNewsSourceRegistrySchema, type GlobalNewsSourceRegistry } from './schemas.js';

// Intentionally untyped as the literal input (not GlobalNewsSourceRegistry,
// the post-.parse() output type) -- several fields (e.g. MonitoredTarget's
// machineReadable) have Zod defaults, which are only optional on the input
// side. GlobalNewsSourceRegistrySchema.parse() below both validates and
// applies those defaults; the exported constant carries the fully-resolved
// output type.
const registryData = {
  schemaVersion: '1.0.0',

  publishers: [
    { id: 'who', canonicalName: 'World Health Organization', officialUrl: 'https://www.who.int' },
    { id: 'fda', canonicalName: 'U.S. Food and Drug Administration', officialUrl: 'https://www.fda.gov', countryOrRegion: 'US' },
    { id: 'ema', canonicalName: 'European Medicines Agency', officialUrl: 'https://www.ema.europa.eu', countryOrRegion: 'EU' },
    {
      id: 'ec',
      canonicalName: 'European Commission',
      officialUrl: 'https://ec.europa.eu',
      countryOrRegion: 'EU',
      notes:
        'Parent institution for multiple distinct logical sources (Medical Devices, DG SANTE, HERA, HTACG, MDCG) -- these remain separate logical sources per Batch N2-FINAL section 12/section-1-addendum-3, not collapsed into one, and not duplicated as separate publishers.',
    },
    { id: 'tr-mos', canonicalName: 'T.C. Sağlık Bakanlığı', officialUrl: 'https://www.saglik.gov.tr', countryOrRegion: 'TR' },
    {
      id: 'titck',
      canonicalName: 'Türkiye İlaç ve Tıbbi Cihaz Kurumu (TİTCK)',
      officialUrl: 'https://www.titck.gov.tr',
      countryOrRegion: 'TR',
      institutionalParentPublisherId: 'tr-mos',
      notes: 'Distinct regulatory agency with its own domain/identity; institutional parent is the Ministry of Health, recorded for lineage only.',
    },
    { id: 'ecdc', canonicalName: 'European Centre for Disease Prevention and Control', officialUrl: 'https://www.ecdc.europa.eu', countryOrRegion: 'EU' },
    { id: 'medtech-europe', canonicalName: 'MedTech Europe', officialUrl: 'https://www.medtecheurope.org', countryOrRegion: 'EU' },
    { id: 'medtech-dive', canonicalName: 'MedTech Dive (Industry Dive)', officialUrl: 'https://www.medtechdive.com' },
    { id: 'reuters', canonicalName: 'Reuters', officialUrl: 'https://www.reuters.com' },
    {
      id: 'resmi-gazete',
      canonicalName: 'T.C. Resmî Gazete',
      officialUrl: 'https://www.resmigazete.gov.tr',
      countryOrRegion: 'TR',
      notes: 'Published by the Directorate General of Legislation Development and Publication under the Presidency -- distinct publisher from the Ministry of Health.',
    },
    { id: 'observatory', canonicalName: 'European Observatory on Health Systems and Policies', officialUrl: 'https://eurohealthobservatory.who.int' },
    { id: 'hma', canonicalName: 'Heads of Medicines Agencies (HMA)', officialUrl: 'https://www.hma.eu', countryOrRegion: 'EU' },
    { id: 'edqm', canonicalName: 'European Directorate for the Quality of Medicines & HealthCare (EDQM), Council of Europe', officialUrl: 'https://www.edqm.eu', countryOrRegion: 'EU' },
    { id: 'oecd', canonicalName: 'Organisation for Economic Co-operation and Development (OECD)', officialUrl: 'https://www.oecd.org' },
    { id: 'un', canonicalName: 'United Nations', officialUrl: 'https://news.un.org' },
    { id: 'aa', canonicalName: 'Anadolu Ajansı', officialUrl: 'https://www.aa.com.tr', countryOrRegion: 'TR' },
    { id: 'hhs', canonicalName: 'U.S. Department of Health and Human Services', officialUrl: 'https://www.hhs.gov', countryOrRegion: 'US' },
    { id: 'africa-cdc', canonicalName: 'Africa Centres for Disease Control and Prevention (Africa CDC)', officialUrl: 'https://africacdc.org' },
    { id: 'raps', canonicalName: 'Regulatory Affairs Professionals Society (RAPS)', officialUrl: 'https://www.raps.org' },
    { id: 'swissmedic', canonicalName: 'Swissmedic', officialUrl: 'https://www.swissmedic.ch', countryOrRegion: 'CH' },
    {
      id: 'tuseb',
      canonicalName: 'Türkiye Sağlık Enstitüleri Başkanlığı (TÜSEB)',
      officialUrl: 'https://www.tuseb.gov.tr',
      countryOrRegion: 'TR',
      notes: 'TÜYZE (Türkiye Yapay Zekâ Enstitüsü health-AI activity) is represented as a child monitored target under TÜSEB, not a separate publisher.',
    },
    { id: 'bfarm', canonicalName: 'Bundesinstitut für Arzneimittel und Medizinprodukte (BfArM)', officialUrl: 'https://www.bfarm.de', countryOrRegion: 'DE' },
    { id: 'imdrf', canonicalName: 'International Medical Device Regulators Forum (IMDRF)', officialUrl: 'https://www.imdrf.org' },
    { id: 'ansm', canonicalName: "Agence nationale de sécurité du médicament et des produits de santé (ANSM)", officialUrl: 'https://ansm.sante.fr', countryOrRegion: 'FR' },
    { id: 'health-policy-watch', canonicalName: 'Health Policy Watch', officialUrl: 'https://healthpolicy-watch.news' },
    { id: 'sgk', canonicalName: 'Sosyal Güvenlik Kurumu (SGK)', officialUrl: 'https://www.sgk.gov.tr', countryOrRegion: 'TR' },
    { id: 'eu-publications-office', canonicalName: 'Publications Office of the European Union (EUR-Lex)', officialUrl: 'https://eur-lex.europa.eu', countryOrRegion: 'EU' },
    { id: 'hpra', canonicalName: 'Health Products Regulatory Authority (HPRA)', officialUrl: 'https://www.hpra.ie', countryOrRegion: 'IE' },
    { id: 'euractiv', canonicalName: 'Euractiv', officialUrl: 'https://www.euractiv.com' },
    { id: 'ep', canonicalName: 'European Parliament', officialUrl: 'https://www.europarl.europa.eu', countryOrRegion: 'EU' },
    { id: 'team-nb', canonicalName: 'Team-NB (European Association Medical Devices Notified Bodies)', officialUrl: 'https://www.team-nb.org', countryOrRegion: 'EU' },
    { id: 'council-eu', canonicalName: 'Council of the European Union', officialUrl: 'https://www.consilium.europa.eu', countryOrRegion: 'EU' },
    {
      id: 'hsgm',
      canonicalName: 'Halk Sağlığı Genel Müdürlüğü (HSGM)',
      officialUrl: 'https://hsgm.saglik.gov.tr',
      countryOrRegion: 'TR',
      institutionalParentPublisherId: 'tr-mos',
      notes: 'General Directorate organizationally within the Ministry of Health, with its own site/identity; parent recorded for lineage only.',
    },
    { id: 'tuik', canonicalName: 'Türkiye İstatistik Kurumu (TÜİK)', officialUrl: 'https://www.tuik.gov.tr', countryOrRegion: 'TR' },
    { id: 'healthai', canonicalName: 'HealthAI -- The Global Agency for Responsible AI in Health', officialUrl: 'https://healthai.agency', notes: 'Verified via WebSearch (2026-09-04): official name confirmed exactly as canonicalized here; Geneva-based independent nonprofit.' },
    {
      id: 'nhs-aidrs',
      canonicalName: 'AI and Digital Regulations Service for health and social care (AIDRS)',
      officialUrl: 'https://www.digitalregulations.innovation.nhs.uk',
      countryOrRegion: 'UK',
      notes:
        'Verified via WebSearch (2026-09-04): a joint service of MHRA (product regulation), HRA (research governance), NICE (clinical/cost-effectiveness) and CQC (regulation), commissioned by NHS England -- NOT a NICE-only feed and NOT modeled as an MHRA source (MHRA remains excluded as a Kaduse source per prior user decision; this is a distinct multi-body service, not MHRA itself).',
    },
    { id: 'cencenelec', canonicalName: 'CEN-CENELEC', officialUrl: 'https://www.cencenelec.eu', countryOrRegion: 'EU', notes: 'Verified via WebSearch (2026-09-04): official JTC 21 AI page confirmed at cencenelec.eu/areas-of-work/cen-cenelec-topics/artificial-intelligence/.' },
    { id: 'pmda', canonicalName: 'Pharmaceuticals and Medical Devices Agency (PMDA)', officialUrl: 'https://www.pmda.go.jp/english/', countryOrRegion: 'JP' },
    { id: 'hsa', canonicalName: 'Health Sciences Authority (HSA), Singapore', officialUrl: 'https://www.hsa.gov.sg', countryOrRegion: 'SG' },
    {
      id: 'fierce',
      canonicalName: 'Fierce Biotech',
      officialUrl: 'https://www.fiercebiotech.com',
      notes: 'Verified via WebSearch (2026-09-04): "Fierce Medtech" is an editorial vertical (fiercebiotech.com/medtech) of Fierce Biotech, not a separate publisher -- normalized to one logical source under this publisher.',
    },
    { id: 'medica', canonicalName: 'MEDICA (Messe Düsseldorf)', officialUrl: 'https://www.medica-tradefair.com', countryOrRegion: 'DE' },
    { id: 'health-canada', canonicalName: 'Health Canada', officialUrl: 'https://www.canada.ca/en/health-canada.html', countryOrRegion: 'CA' },
    { id: 'nice', canonicalName: 'National Institute for Health and Care Excellence (NICE)', officialUrl: 'https://www.nice.org.uk', countryOrRegion: 'UK' },
    { id: 'advamed', canonicalName: 'Advanced Medical Technology Association (AdvaMed)', officialUrl: 'https://www.advamed.org' },
    { id: 'massdevice', canonicalName: 'MassDevice (WTWH Media)', officialUrl: 'https://www.massdevice.com' },
    { id: 'medical-device-network', canonicalName: 'Medical Device Network (GlobalData)', officialUrl: 'https://www.medicaldevice-network.com' },
    { id: 'aami', canonicalName: 'Association for the Advancement of Medical Instrumentation (AAMI)', officialUrl: 'https://array.aami.org' },
    { id: 'mobihealthnews', canonicalName: 'MobiHealthNews (HIMSS Media)', officialUrl: 'https://www.mobihealthnews.com' },
  ],

  sources: [
    { id: 'who-newsroom', publisherId: 'who', canonicalName: 'WHO Newsroom', officialUrl: 'https://www.who.int/news' },
    { id: 'fda-press-announcements', publisherId: 'fda', canonicalName: 'FDA Press Announcements', officialUrl: 'https://www.fda.gov/news-events/fda-newsroom/press-announcements' },
    { id: 'fda-cdrh', publisherId: 'fda', canonicalName: 'FDA Center for Devices and Radiological Health (CDRH)', officialUrl: 'https://www.fda.gov/medical-devices' },
    { id: 'ema-news', publisherId: 'ema', canonicalName: 'EMA News', officialUrl: 'https://www.ema.europa.eu/en/news' },
    { id: 'ec-medical-devices', publisherId: 'ec', canonicalName: 'European Commission -- Medical Devices', officialUrl: 'https://health.ec.europa.eu/medical-devices-sector_en' },
    { id: 'saglik-bakanligi', publisherId: 'tr-mos', canonicalName: 'T.C. Sağlık Bakanlığı Haberler', officialUrl: 'https://www.saglik.gov.tr/TR,10169/haberler.html' },
    { id: 'titck-announcements', publisherId: 'titck', canonicalName: 'TİTCK Duyurular', officialUrl: 'https://www.titck.gov.tr/duyurular' },
    { id: 'ecdc-news', publisherId: 'ecdc', canonicalName: 'ECDC News', officialUrl: 'https://www.ecdc.europa.eu/en/news-events' },
    { id: 'medtech-europe-news', publisherId: 'medtech-europe', canonicalName: 'MedTech Europe News', officialUrl: 'https://www.medtecheurope.org/news-and-events/news/' },
    { id: 'medtech-dive-news', publisherId: 'medtech-dive', canonicalName: 'MedTech Dive', officialUrl: 'https://www.medtechdive.com' },
    { id: 'reuters-healthcare', publisherId: 'reuters', canonicalName: 'Reuters Healthcare / Pharma', officialUrl: 'https://www.reuters.com/business/healthcare-pharmaceuticals/' },
    { id: 'resmi-gazete-source', publisherId: 'resmi-gazete', canonicalName: 'T.C. Resmî Gazete', officialUrl: 'https://www.resmigazete.gov.tr' },
    { id: 'observatory-news', publisherId: 'observatory', canonicalName: 'European Observatory on Health Systems and Policies -- News', officialUrl: 'https://eurohealthobservatory.who.int/news' },
    { id: 'hma-news', publisherId: 'hma', canonicalName: 'Heads of Medicines Agencies -- News', officialUrl: 'https://www.hma.eu/news.html' },
    { id: 'edqm-news', publisherId: 'edqm', canonicalName: 'EDQM News', officialUrl: 'https://www.edqm.eu/en/news' },
    { id: 'ec-hta-htacg', publisherId: 'ec', canonicalName: 'European Commission / EU Health Technology Assessment -- Member State Coordination Group (HTACG)', officialUrl: 'https://health.ec.europa.eu/health-technology-assessment/implementation-regulation-health-technology-assessment/member-state-coordination-group-hta-htacg_en', verificationStatus: 'FRESHLY_VERIFIED_THIS_BATCH', verificationNote: 'Verified via WebSearch (2026-09-04): official name is "Member State Coordination Group on Health Technology Assessment (HTACG)"; supersedes EUnetHTA 21 per Batch N2-FINAL section 3.' },
    { id: 'oecd-health', publisherId: 'oecd', canonicalName: 'OECD Health', officialUrl: 'https://www.oecd.org/health/' },
    { id: 'un-news-health', publisherId: 'un', canonicalName: 'UN News -- Health', officialUrl: 'https://news.un.org/en/tags/health' },
    { id: 'aa-saglik', publisherId: 'aa', canonicalName: 'Anadolu Ajansı -- Sağlık', officialUrl: 'https://www.aa.com.tr/tr/saglik' },
    { id: 'ec-dg-sante', publisherId: 'ec', canonicalName: 'European Commission -- DG SANTE (Health and Food Safety)', officialUrl: 'https://health.ec.europa.eu' },
    { id: 'hhs-press', publisherId: 'hhs', canonicalName: 'HHS Press Office -- News Releases', officialUrl: 'https://www.hhs.gov/about/news/index.html' },
    { id: 'africa-cdc-news', publisherId: 'africa-cdc', canonicalName: 'Africa CDC News', officialUrl: 'https://africacdc.org/news-item/' },
    { id: 'ec-mdcg', publisherId: 'ec', canonicalName: 'Medical Device Coordination Group (MDCG)', officialUrl: 'https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en' },
    { id: 'raps-regulatory-focus', publisherId: 'raps', canonicalName: 'RAPS Regulatory Focus', officialUrl: 'https://www.raps.org/news-and-articles/news-articles' },
    { id: 'swissmedic-news', publisherId: 'swissmedic', canonicalName: 'Swissmedic News', officialUrl: 'https://www.swissmedic.ch/swissmedic/en/home/news.html' },
    { id: 'tuseb-news', publisherId: 'tuseb', canonicalName: 'TÜSEB Haberler', officialUrl: 'https://www.tuseb.gov.tr/haberler' },
    { id: 'bfarm-news', publisherId: 'bfarm', canonicalName: 'BfArM News', officialUrl: 'https://www.bfarm.de/EN/News/_node.html' },
    { id: 'imdrf-news', publisherId: 'imdrf', canonicalName: 'IMDRF News', officialUrl: 'https://www.imdrf.org/news' },
    { id: 'ansm-news', publisherId: 'ansm', canonicalName: 'ANSM Actualités', officialUrl: 'https://ansm.sante.fr/actualites' },
    { id: 'hpw-news', publisherId: 'health-policy-watch', canonicalName: 'Health Policy Watch', officialUrl: 'https://healthpolicy-watch.news' },
    { id: 'sgk-announcements', publisherId: 'sgk', canonicalName: 'SGK Duyurular', officialUrl: 'https://www.sgk.gov.tr/Duyuru' },
    { id: 'eur-lex-source', publisherId: 'eu-publications-office', canonicalName: 'EUR-Lex', officialUrl: 'https://eur-lex.europa.eu' },
    { id: 'hpra-news', publisherId: 'hpra', canonicalName: 'HPRA Safety Notices', officialUrl: 'https://www.hpra.ie/homepage/medical-devices/safety-information/field-safety-notices' },
    { id: 'euractiv-health', publisherId: 'euractiv', canonicalName: 'Euractiv -- Health', officialUrl: 'https://www.euractiv.com/section/health-consumers/' },
    { id: 'ep-sant', publisherId: 'ep', canonicalName: 'European Parliament -- SANT Committee', officialUrl: 'https://www.europarl.europa.eu/committees/en/sant/home/highlights' },
    { id: 'team-nb-news', publisherId: 'team-nb', canonicalName: 'Team-NB News', officialUrl: 'https://www.team-nb.org/news/' },
    { id: 'council-eu-epsco', publisherId: 'council-eu', canonicalName: 'Council of the EU -- EPSCO (Employment, Social Policy, Health and Consumer Affairs)', officialUrl: 'https://www.consilium.europa.eu/en/meetings/epsco/' },
    { id: 'hsgm-news', publisherId: 'hsgm', canonicalName: 'HSGM Duyurular', officialUrl: 'https://hsgm.saglik.gov.tr/tr/duyurular' },
    { id: 'ec-hera', publisherId: 'ec', canonicalName: 'Health Emergency Preparedness and Response Authority (HERA)', officialUrl: 'https://health.ec.europa.eu/health-emergency-preparedness-and-response-hera_en' },
    { id: 'tuik-saglik-source', publisherId: 'tuik', canonicalName: 'TÜİK -- Sağlık ve Sosyal Koruma', officialUrl: 'https://www.tuik.gov.tr/Kategori/GetKategori?p=Saglik-ve-Sosyal-Koruma-101' },
    { id: 'healthai-news', publisherId: 'healthai', canonicalName: 'HealthAI News', officialUrl: 'https://healthai.agency/news/', verificationStatus: 'FRESHLY_VERIFIED_THIS_BATCH', verificationNote: 'Verified via WebSearch (2026-09-04): publisher canonical name "HealthAI -- The Global Agency for Responsible AI in Health" confirmed exact.' },
    { id: 'nhs-aidrs-news', publisherId: 'nhs-aidrs', canonicalName: 'AI and Digital Regulations Service -- Latest News', officialUrl: 'https://www.digitalregulations.innovation.nhs.uk', verificationStatus: 'FRESHLY_VERIFIED_THIS_BATCH', verificationNote: 'Verified via WebSearch (2026-09-04): joint MHRA/HRA/NICE/CQC service commissioned by NHS England, not an MHRA source and not a NICE-only feed.' },
    { id: 'jtc21-ai', publisherId: 'cencenelec', canonicalName: 'CEN-CENELEC JTC 21 -- Artificial Intelligence', officialUrl: 'https://www.cencenelec.eu/areas-of-work/cen-cenelec-topics/artificial-intelligence/', verificationStatus: 'FRESHLY_VERIFIED_THIS_BATCH', verificationNote: 'Verified via WebSearch (2026-09-04): official CEN-CENELEC AI page confirmed at this URL.' },
    { id: 'pmda-news', publisherId: 'pmda', canonicalName: 'PMDA News', officialUrl: 'https://www.pmda.go.jp/english/about-pmda/whatsnew/0002.html' },
    { id: 'hsa-medical-devices', publisherId: 'hsa', canonicalName: 'HSA -- Medical Devices', officialUrl: 'https://www.hsa.gov.sg/medical-devices' },
    { id: 'fierce-medtech', publisherId: 'fierce', canonicalName: 'Fierce Medtech', officialUrl: 'https://www.fiercebiotech.com/medtech', verificationStatus: 'FRESHLY_VERIFIED_THIS_BATCH', verificationNote: 'Verified via WebSearch (2026-09-04): Fierce Medtech is an editorial vertical of Fierce Biotech, not a separate outlet -- confirmed non-duplication.' },
    { id: 'medica-sphere-medtech', publisherId: 'medica', canonicalName: 'MEDICA Sphere -- MedTech & Devices', officialUrl: 'https://www.medica-tradefair.com/en/News/MEDICA_Sphere' },
    { id: 'health-canada-medical-devices', publisherId: 'health-canada', canonicalName: 'Health Canada -- Medical Devices', officialUrl: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices.html' },
    { id: 'nice-healthtech', publisherId: 'nice', canonicalName: 'NICE HealthTech', officialUrl: 'https://www.nice.org.uk/about/what-we-do/our-programmes/nice-guidance/nice-medical-technologies-guidance' },
    { id: 'advamed-digital-health', publisherId: 'advamed', canonicalName: 'AdvaMed -- Digital Health Tech / Industry Updates', officialUrl: 'https://www.advamed.org/industry-topics/digital-health/' },
    { id: 'massdevice-news', publisherId: 'massdevice', canonicalName: 'MassDevice', officialUrl: 'https://www.massdevice.com' },
    { id: 'medical-device-network-news', publisherId: 'medical-device-network', canonicalName: 'Medical Device Network', officialUrl: 'https://www.medicaldevice-network.com' },
    { id: 'aami-news', publisherId: 'aami', canonicalName: 'AAMI News', officialUrl: 'https://array.aami.org/content/news' },
    { id: 'mobihealthnews-source', publisherId: 'mobihealthnews', canonicalName: 'MobiHealthNews', officialUrl: 'https://www.mobihealthnews.com' },
  ],

  targets: [
    { id: 'who-newsroom-whole', sourceId: 'who-newsroom', label: 'WHO Newsroom (normal stream)', officialUrl: 'https://www.who.int/news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already health-focused by nature; per Batch N2-FINAL section 6, normal stream monitored with standard Kaduse relevance scoring applied downstream.', transportStatus: 'WEB_ONLY' },

    { id: 'fda-press-scoped', sourceId: 'fda-press-announcements', label: 'FDA Press Announcements (medical devices/diagnostics/human medicine/health AI/digital health scope)', officialUrl: 'https://www.fda.gov/news-events/fda-newsroom/press-announcements', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Medical devices, diagnostics, human medicine, health AI, major approvals/safety/regulation, digital health only -- excludes food/tobacco/veterinary/administrative announcements per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'fda-cdrh-digital-health', sourceId: 'fda-cdrh', label: 'FDA CDRH -- Digital Health Center of Excellence', officialUrl: 'https://www.fda.gov/medical-devices/digital-health-center-excellence', scopeType: 'REAL_SUBFEED', scopeDescription: 'Digital Health Center of Excellence child target -- not a separate publisher.', transportStatus: 'WEB_ONLY' },
    { id: 'fda-cdrh-ai-ml-device', sourceId: 'fda-cdrh', label: 'FDA CDRH -- AI/ML-Enabled Medical Devices', officialUrl: 'https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices', scopeType: 'REAL_SUBFEED', scopeDescription: 'AI/ML and generative-AI-enabled medical device developments.', transportStatus: 'WEB_ONLY' },
    { id: 'fda-cdrh-samd', sourceId: 'fda-cdrh', label: 'FDA CDRH -- Software as a Medical Device (SaMD)', officialUrl: 'https://www.fda.gov/medical-devices/digital-health-center-excellence/software-medical-device-samd', scopeType: 'REAL_SUBFEED', scopeDescription: 'SaMD-specific regulatory developments.', transportStatus: 'WEB_ONLY' },
    { id: 'fda-cdrh-device-safety', sourceId: 'fda-cdrh', label: 'FDA CDRH -- Device Safety / Recalls / Post-Market', officialUrl: 'https://www.fda.gov/medical-devices/safety-communications', scopeType: 'REAL_SUBFEED', scopeDescription: 'Device clearances/authorisations, recalls, safety, post-market updates.', transportStatus: 'WEB_ONLY' },

    { id: 'ema-news-whole', sourceId: 'ema-news', label: 'EMA News (normal stream)', officialUrl: 'https://www.ema.europa.eu/en/news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already sufficiently topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'ec-medical-devices-target', sourceId: 'ec-medical-devices', label: 'EC Medical Devices sector -- latest updates', officialUrl: 'https://health.ec.europa.eu/medical-devices-sector_en', scopeType: 'REAL_SUBFEED', scopeDescription: 'Dedicated Medical Devices sector surface only, not the entire EC news stream.', transportStatus: 'WEB_ONLY' },

    { id: 'saglik-bakanligi-whole', sourceId: 'saglik-bakanligi', label: 'T.C. Sağlık Bakanlığı Haberler (normal stream)', officialUrl: 'https://www.saglik.gov.tr/TR,10169/haberler.html', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Ministry of Health press releases -- already health-scoped by nature.', transportStatus: 'WEB_ONLY' },

    { id: 'titck-tibbi-cihaz-duyurulari', sourceId: 'titck-announcements', label: 'TİTCK -- Tıbbi Cihaz Duyuruları', officialUrl: 'https://www.titck.gov.tr/duyurular?catID=93', scopeType: 'REAL_SUBFEED', scopeDescription: 'Focused child target for medical-device announcements; not a second unrelated source.', transportStatus: 'WEB_ONLY' },
    { id: 'titck-general-regulatory', sourceId: 'titck-announcements', label: 'TİTCK -- Drug Safety / Medical-Device Regulation / National Regulatory Changes', officialUrl: 'https://www.titck.gov.tr/duyurular', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Major relevant drug-safety and device-regulation announcements; excludes generic institutional noise.', transportStatus: 'WEB_ONLY' },

    { id: 'ecdc-news-whole', sourceId: 'ecdc-news', label: 'ECDC News (normal stream)', officialUrl: 'https://www.ecdc.europa.eu/en/news-events', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },
    { id: 'medtech-europe-news-whole', sourceId: 'medtech-europe-news', label: 'MedTech Europe News (normal stream)', officialUrl: 'https://www.medtecheurope.org/news-and-events/news/', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },
    { id: 'medtech-dive-news-whole', sourceId: 'medtech-dive-news', label: 'MedTech Dive (normal stream)', officialUrl: 'https://www.medtechdive.com', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'reuters-healthcare-scoped', sourceId: 'reuters-healthcare', label: 'Reuters -- Healthcare/Pharma/Medtech/Diagnostics/Digital Health/AI-in-Health', officialUrl: 'https://www.reuters.com/business/healthcare-pharmaceuticals/', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Healthcare, pharma where medically/news relevant, medtech, medical devices, diagnostics, digital health, AI in healthcare only -- not general Reuters.', transportStatus: 'WEB_ONLY' },

    { id: 'resmi-gazete-health-scoped', sourceId: 'resmi-gazete-source', label: 'T.C. Resmî Gazete -- Health-Only Scope', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'No dedicated official health-only Resmî Gazete feed exists (verified: not invented). Kaduse relevance is restricted to health, healthcare, Ministry of Health, TİTCK, SGK health reimbursement, SUT, medical devices, medicines, diagnostics, public health, health professions, healthcare delivery, and relevant health regulations -- applied as a channel filter over the broader publisher, per Batch N2-FINAL section 5/7/8.', transportStatus: 'PENDING_MANUAL' },

    { id: 'observatory-news-whole', sourceId: 'observatory-news', label: 'European Observatory on Health Systems and Policies (normal stream)', officialUrl: 'https://eurohealthobservatory.who.int/news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },
    { id: 'hma-news-whole', sourceId: 'hma-news', label: 'HMA News (normal stream)', officialUrl: 'https://www.hma.eu/news.html', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Narrow by nature (medicines-agency coordination); not explicitly scoped by the batch, treated as whole-source per its own topical focus.', transportStatus: 'WEB_ONLY' },
    { id: 'edqm-news-whole', sourceId: 'edqm-news', label: 'EDQM News (normal stream)', officialUrl: 'https://www.edqm.eu/en/news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Narrow by nature (medicine quality); not explicitly scoped by the batch, treated as whole-source per its own topical focus.', transportStatus: 'WEB_ONLY' },

    { id: 'ec-hta-htacg-target', sourceId: 'ec-hta-htacg', label: 'HTACG -- Member State Coordination Group on HTA', officialUrl: 'https://health.ec.europa.eu/health-technology-assessment/implementation-regulation-health-technology-assessment/member-state-coordination-group-hta-htacg_en', scopeType: 'REAL_SUBFEED', scopeDescription: 'Current HTA coordination structure, superseding EUnetHTA 21 per Batch N2-FINAL section 3.', transportStatus: 'WEB_ONLY' },

    { id: 'oecd-health-scoped', sourceId: 'oecd-health', label: 'OECD -- Health only', officialUrl: 'https://www.oecd.org/health/', scopeType: 'REAL_SUBFEED', scopeDescription: 'Health section only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },
    { id: 'un-news-health-scoped', sourceId: 'un-news-health', label: 'UN News -- Health only', officialUrl: 'https://news.un.org/en/tags/health', scopeType: 'REAL_SUBFEED', scopeDescription: 'Health tag only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },
    { id: 'aa-saglik-scoped', sourceId: 'aa-saglik', label: 'Anadolu Ajansı -- Sağlık only', officialUrl: 'https://www.aa.com.tr/tr/saglik', scopeType: 'REAL_SUBFEED', scopeDescription: 'Sağlık (Health) section only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'ec-dg-sante-health-scoped', sourceId: 'ec-dg-sante', label: 'DG SANTE -- Health-related updates only', officialUrl: 'https://health.ec.europa.eu', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Health-related DG SANTE updates only; food/agriculture material excluded unless a concrete health/medical-product reason exists, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'hhs-press-scoped', sourceId: 'hhs-press', label: 'HHS Press Office -- AI-health/medtech/public-health/major regulation scope', officialUrl: 'https://www.hhs.gov/about/news/index.html', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'AI-health, medical technology, public health, major healthcare regulation/policy, meaningful HHS technology initiatives; excludes purely administrative/political staffing noise, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'africa-cdc-news-whole', sourceId: 'africa-cdc-news', label: 'Africa CDC News (normal stream)', officialUrl: 'https://africacdc.org/news-item/', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'ec-mdcg-target', sourceId: 'ec-mdcg', label: 'MDCG -- Endorsed guidance / position documents / implementation guidance', officialUrl: 'https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en', scopeType: 'REAL_SUBFEED', scopeDescription: 'Device-relevant MDCG endorsed guidance, position/guidance documents, implementation guidance, meaningful regulatory updates, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'raps-regulatory-focus-scoped', sourceId: 'raps-regulatory-focus', label: 'RAPS Regulatory Focus -- device/digital-health/AI/major pharma-regulation scope', officialUrl: 'https://www.raps.org/news-and-articles/news-articles', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Medical devices, digital health, AI in regulated health products, major pharmaceutical regulation only when broadly newsworthy, health-product regulatory changes, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'swissmedic-news-scoped', sourceId: 'swissmedic-news', label: 'Swissmedic -- Devices/safety/recalls/regulation/digital-AI-health scope', officialUrl: 'https://www.swissmedic.ch/swissmedic/en/home/news.html', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Medical devices, safety, recalls, device regulation, digital/AI health where applicable, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'tuyze-saglikta-yapay-zeka', sourceId: 'tuseb-news', label: 'TÜYZE -- Sağlıkta Yapay Zekâ', officialUrl: 'https://www.tuseb.gov.tr/tuyze', scopeType: 'REAL_SUBFEED', scopeDescription: 'Health-AI monitored target under TÜSEB (TÜYZE = Türkiye Yapay Zekâ Enstitüsü) -- not a duplicate unrelated global publisher.', transportStatus: 'WEB_ONLY' },
    { id: 'tuseb-health-tech-innovation', sourceId: 'tuseb-news', label: 'TÜSEB -- Health Technology / Innovation / Translational Health', officialUrl: 'https://www.tuseb.gov.tr/haberler', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Genuinely relevant health technology/innovation/translational health developments; ceremonial/institutional noise filtered, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'bfarm-news-scoped', sourceId: 'bfarm-news', label: 'BfArM -- Devices/DiGA/digital health/software/AI scope', officialUrl: 'https://www.bfarm.de/EN/News/_node.html', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Medical devices, DiGA/digital health, medical-device regulation/safety, digital health/software/AI where applicable, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'imdrf-news-whole', sourceId: 'imdrf-news', label: 'IMDRF News (normal stream)', officialUrl: 'https://www.imdrf.org/news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'ansm-news-scoped', sourceId: 'ansm-news', label: 'ANSM -- Dispositifs médicaux/alertes/sécurité/surveillance/réglementation', officialUrl: 'https://ansm.sante.fr/actualites', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Dispositifs médicaux, alerts, safety, surveillance, regulation, meaningful enforcement, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'hpw-news-whole', sourceId: 'hpw-news', label: 'Health Policy Watch (normal stream)', officialUrl: 'https://healthpolicy-watch.news', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already health-policy-focused by nature; not explicitly scoped by the batch.', transportStatus: 'WEB_ONLY' },

    { id: 'sgk-health-scoped', sourceId: 'sgk-announcements', label: 'SGK -- GSS/SUT/Reimbursement/MEDULA Health Scope', officialUrl: 'https://www.sgk.gov.tr/Duyuru', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Genel Sağlık Sigortası, Sağlık Uygulama Tebliği/SUT, medical device/material/medicine reimbursement, MEDULA healthcare changes, health-service financing, related attachments/implementation announcements; excludes pensions/employment/retirement/unrelated social-security administration, per Batch N2-FINAL section 5/9.', transportStatus: 'PENDING_MANUAL' },

    { id: 'eur-lex-mdr-ivdr-health-query', sourceId: 'eur-lex-source', label: 'EUR-Lex -- MDR/IVDR/Health/AI-Act-x-Health Saved-Search Query', scopeType: 'QUERY_TARGET', scopeDescription: 'Targeted saved-search/query monitoring around MDR, IVDR, medical devices, IVD, health, HTA, medicines where relevant, AI Act x health, AI Act x medical device, implementing/delegated acts, Commission decisions materially affecting healthcare/medtech. No official machine-readable saved-search mechanism was verified in this batch -- no RSS invented, per Batch N2-FINAL section 5/8/12.', transportStatus: 'PENDING_MANUAL' },

    { id: 'hpra-news-scoped', sourceId: 'hpra-news', label: 'HPRA -- Field Safety Notices / Recalls / Device Safety', officialUrl: 'https://www.hpra.ie/homepage/medical-devices/safety-information/field-safety-notices', scopeType: 'REAL_SUBFEED', scopeDescription: 'Medical-device safety notices, Field Safety Notices, recalls/safety, device regulation, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'euractiv-health-scoped', sourceId: 'euractiv-health', label: 'Euractiv -- Health/Healthcare only', officialUrl: 'https://www.euractiv.com/section/health-consumers/', scopeType: 'REAL_SUBFEED', scopeDescription: 'Health/Healthcare section only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'ep-sant-scoped', sourceId: 'ep-sant', label: 'European Parliament -- SANT press releases / public-health highlights / legislative health decisions', officialUrl: 'https://www.europarl.europa.eu/committees/en/sant/home/highlights', scopeType: 'REAL_SUBFEED', scopeDescription: 'SANT press releases, meaningful public-health committee highlights, legislative health decisions only -- not all Parliament press, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'team-nb-news-whole', sourceId: 'team-nb-news', label: 'Team-NB News (normal stream)', officialUrl: 'https://www.team-nb.org/news/', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Narrow by nature (notified-body coordination); not explicitly scoped by the batch.', transportStatus: 'WEB_ONLY' },

    { id: 'council-eu-epsco-health-scoped', sourceId: 'council-eu-epsco', label: 'Council of the EU -- EPSCO/Health only', officialUrl: 'https://www.consilium.europa.eu/en/meetings/epsco/', scopeType: 'REAL_SUBFEED', scopeDescription: 'Health/EPSCO meeting outcomes, health conclusions, health legislative positions, relevant press releases only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'hsgm-news-scoped', sourceId: 'hsgm-news', label: 'HSGM -- Infectious Disease/Outbreaks/Vaccination/Public Health Operations', officialUrl: 'https://hsgm.saglik.gov.tr/tr/duyurular', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Infectious disease, outbreaks, vaccination, field public health, meaningful operational public-health developments; ceremonies/visits/generic institutional events filtered, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'ec-hera-scoped', sourceId: 'ec-hera', label: 'HERA -- Preparedness/Countermeasures/Procurement/Shortages/Health-Emergency Tech', officialUrl: 'https://health.ec.europa.eu/health-emergency-preparedness-and-response-hera_en', scopeType: 'REAL_SUBFEED', scopeDescription: 'HERA-specific preparedness, health emergency countermeasures, procurement, critical medical products, shortages/supply security, health emergency technology only -- not the entire EC corporate news stream, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'tuik-saglik-sosyal-koruma', sourceId: 'tuik-saglik-source', label: 'TÜİK -- Sağlık ve Sosyal Koruma only', officialUrl: 'https://www.tuik.gov.tr/Kategori/GetKategori?p=Saglik-ve-Sosyal-Koruma-101', scopeType: 'REAL_SUBFEED', scopeDescription: 'Sağlık ve Sosyal Koruma category only, not all TÜİK statistical releases, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'healthai-news-whole', sourceId: 'healthai-news', label: 'HealthAI News (normal stream)', officialUrl: 'https://healthai.agency/news/', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'nhs-aidrs-news-scoped', sourceId: 'nhs-aidrs-news', label: 'AI and Digital Regulations Service -- Latest News / relevant Blog & regulatory updates', officialUrl: 'https://www.digitalregulations.innovation.nhs.uk', scopeType: 'REAL_SUBFEED', scopeDescription: 'Dedicated Latest News / relevant Blog & regulatory updates only -- not all NHS England modeled as this service\'s source, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'jtc21-ai-health-gated', sourceId: 'jtc21-ai', label: 'CEN-CENELEC JTC 21 -- AI activity, health/medtech-gated', officialUrl: 'https://www.cencenelec.eu/areas-of-work/cen-cenelec-topics/artificial-intelligence/', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'JTC 21 AI standardization activity, gated by an ADDITIONAL health/medicine/medtech/medical-device/healthcare relevance constraint before routing to Kaduse -- generic industrial AI standards excluded, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'pmda-news-scoped', sourceId: 'pmda-news', label: 'PMDA -- Devices/SaMD/Review Reports/Safety/AI-Device Developments', officialUrl: 'https://www.pmda.go.jp/english/about-pmda/whatsnew/0002.html', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Medical devices, SaMD, relevant review reports, innovative SaMD, device safety, post-market device information, AI-device developments; not all pharmaceutical administrative notices, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'hsa-medical-devices-scoped', sourceId: 'hsa-medical-devices', label: 'HSA -- Medical Devices / Digital Health / Benefit-Risk / Safety-Regulatory Updates', officialUrl: 'https://www.hsa.gov.sg/medical-devices', scopeType: 'REAL_SUBFEED', scopeDescription: 'Medical Devices, Digital Health, Benefit-Risk Assessment summaries, device safety/regulatory updates only, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'fierce-medtech-scoped', sourceId: 'fierce-medtech', label: 'Fierce Medtech -- medtech/device content only', officialUrl: 'https://www.fiercebiotech.com/medtech', scopeType: 'REAL_SUBFEED', scopeDescription: 'One normalized logical source (verified: not duplicated across Fierce Biotech/Devices/Medtech variants); medtech/device content only.', transportStatus: 'WEB_ONLY' },

    { id: 'medica-sphere-medtech-scoped', sourceId: 'medica-sphere-medtech', label: 'MEDICA Sphere -- MedTech & Devices only', officialUrl: 'https://www.medica-tradefair.com/en/News/MEDICA_Sphere', scopeType: 'REAL_SUBFEED', scopeDescription: 'MedTech & Devices sphere only, not all trade-fair marketing content, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'health-canada-devices-scoped', sourceId: 'health-canada-medical-devices', label: "Health Canada -- Medical Devices / What's New / ML-enabled devices", officialUrl: 'https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices.html', scopeType: 'REAL_SUBFEED', scopeDescription: "Medical Devices, What's New/announcements, ML-enabled medical devices, device guidance/safety, digital-health/device regulation only -- not all Government of Canada news, per Batch N2-FINAL section 5.", transportStatus: 'WEB_ONLY' },

    { id: 'nice-healthtech-scoped', sourceId: 'nice-healthtech', label: 'NICE HealthTech -- devices/diagnostics/digital/AI technology evaluations', officialUrl: 'https://www.nice.org.uk/about/what-we-do/our-programmes/nice-guidance/nice-medical-technologies-guidance', scopeType: 'REAL_SUBFEED', scopeDescription: 'Medical devices, diagnostics, digital technologies, AI technologies, technology evaluations, adoption/recommendations/consultations where newsworthy -- not all NICE guidance, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'advamed-digital-health-scoped', sourceId: 'advamed-digital-health', label: 'AdvaMed -- Digital Health Tech / AI in Medtech / Device Policy', officialUrl: 'https://www.advamed.org/industry-topics/digital-health/', scopeType: 'REAL_SUBFEED', scopeDescription: 'Digital Health Tech, AI in medtech, device policy, meaningful device developments, regulatory/industry changes; industry-association statements not treated as regulatory fact, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },

    { id: 'massdevice-news-whole', sourceId: 'massdevice-news', label: 'MassDevice (normal stream)', officialUrl: 'https://www.massdevice.com', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },
    { id: 'medical-device-network-news-whole', sourceId: 'medical-device-network-news', label: 'Medical Device Network (normal stream)', officialUrl: 'https://www.medicaldevice-network.com', scopeType: 'WHOLE_SOURCE', scopeDescription: 'Already topic-focused per Batch N2-FINAL section 6.', transportStatus: 'WEB_ONLY' },

    { id: 'aami-news-scoped', sourceId: 'aami-news', label: 'AAMI News -- device standards/safety engineering/AI-device standards/lifecycle/HTM', officialUrl: 'https://array.aami.org/content/news', scopeType: 'REAL_SUBFEED', scopeDescription: 'AAMI News / relevant standards-development news only; the complete formal standards library is NOT treated as this news feed (see referenceResources), per Batch N2-FINAL section 5/7.', transportStatus: 'WEB_ONLY' },

    { id: 'mobihealthnews-ai-device-scoped', sourceId: 'mobihealthnews-source', label: 'MobiHealthNews -- AI/ML healthcare, diagnostics, regulated digital health, devices, wearables, digital therapeutics, imaging', officialUrl: 'https://www.mobihealthnews.com', scopeType: 'CHANNEL_FILTER_OVER_BROADER_SOURCE', scopeDescription: 'Strong relevance constraint around AI/ML healthcare, diagnostics, regulated/near-regulated digital health, medical devices, wearables, monitoring, digital therapeutics, imaging, clinically relevant health technology; excludes generic funding/hospital-IT/enterprise-software/broad digital-health-business stories unless directly material to Kaduse, per Batch N2-FINAL section 5.', transportStatus: 'WEB_ONLY' },
  ],

  referenceResources: [
    { id: 'fda-ai-enabled-device-list', publisherId: 'fda', label: 'FDA AI-Enabled Medical Device List', role: 'VERIFICATION', officialUrl: 'https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices', notes: 'Reference/verification/enrichment dataset, NOT an independent News publisher, per Batch N2-FINAL section 7.', isNewsPublisher: false },
    { id: 'hsa-device-registration-dataset', publisherId: 'hsa', label: 'HSA Registered Medical Device Dataset', role: 'ENRICHMENT', officialUrl: 'https://www.hsa.gov.sg/medical-devices/register', notes: 'Machine-readable registration dataset, NOT an independent News publisher, per Batch N2-FINAL section 7.', isNewsPublisher: false },
    { id: 'aami-standards-library', publisherId: 'aami', label: 'AAMI Standards Library', role: 'STANDARDS_KNOWLEDGE', officialUrl: 'https://array.aami.org/content/standards', notes: 'Formal standards documents -- reference/standards knowledge, NOT the event/news feed, per Batch N2-FINAL section 7.', isNewsPublisher: false },
    { id: 'nice-evidence-standards-framework', publisherId: 'nice', label: 'NICE Evidence Standards Framework', role: 'EVIDENCE_KNOWLEDGE', officialUrl: 'https://www.nice.org.uk/about/what-we-do/our-programmes/evidence-standards-framework-for-digital-health-technologies', notes: 'Evidence knowledge reference, NOT event News, per Batch N2-FINAL section 7.', isNewsPublisher: false },
    { id: 'pmda-regulatory-science-reports', publisherId: 'pmda', label: 'PMDA Regulatory Science Reports', role: 'RESEARCH_BACKGROUND', officialUrl: 'https://www.pmda.go.jp/english/rs-std-jp/reports/0001.html', notes: 'Background/reference/research as appropriate, NOT a separate publisher feed, per Batch N2-FINAL section 7.', isNewsPublisher: false },
  ],

  supersededOrExcluded: [
    { id: 'eunethta-21', label: 'EUnetHTA 21', status: 'SUPERSEDED', reason: 'Legacy/time-bounded structure, per Batch N2-FINAL section 3.', supersededByTargetId: 'ec-hta-htacg-target' },
    { id: 'lexxion-ehpl', label: 'Lexxion / European Pharmaceutical Law Review (EHPL)', status: 'EXCLUDED', reason: 'Not registered as active Kaduse News, per Batch N2-FINAL section 3.' },
    { id: 'topra-regulatory-rapporteur', label: 'TOPRA Regulatory Rapporteur', status: 'EXCLUDED', reason: 'Not registered as active Kaduse News, per Batch N2-FINAL section 3.' },
    { id: 'meddeviceguide', label: 'MedDeviceGuide', status: 'EXCLUDED', reason: 'Not registered as active Kaduse News, per Batch N2-FINAL section 3.' },
    { id: 'mhra', label: 'MHRA', status: 'EXCLUDED', reason: 'Remains explicitly excluded by prior user decision -- not silently reintroduced despite technical relevance, per Batch N2-FINAL section 3.' },
  ],
};

export const globalNewsSourceRegistry: GlobalNewsSourceRegistry = GlobalNewsSourceRegistrySchema.parse(registryData);

// Batch N2-FINAL-R1: the JSON snapshot file that used to live in this
// directory was removed. It existed only so multi_channel_design's test
// suite could read the registry without a TS toolchain -- that coupling was
// architecturally wrong (a channel repo's normal tests should not depend on
// a sibling checkout, and the snapshot risked becoming a second, driftable
// copy of this truth). The cross-repo referential-integrity check now lives
// HERE instead, as an explicit integration/contract test
// (kaduse-subscription-contract.test.ts) that imports this module directly
// and reads multi_channel_design's news-sources.json from an explicit
// sibling path, skipping (not failing) when that sibling isn't present.

export function getPublisher(id: string) {
  return globalNewsSourceRegistry.publishers.find((p) => p.id === id);
}
export function getSource(id: string) {
  return globalNewsSourceRegistry.sources.find((s) => s.id === id);
}
export function getTarget(id: string) {
  return globalNewsSourceRegistry.targets.find((t) => t.id === id);
}
export function getTargetsForSource(sourceId: string) {
  return globalNewsSourceRegistry.targets.filter((t) => t.sourceId === sourceId);
}
export function getSourcesForPublisher(publisherId: string) {
  return globalNewsSourceRegistry.sources.filter((s) => s.publisherId === publisherId);
}
export function isSupersededOrExcluded(idOrLabel: string) {
  const needle = idOrLabel.toLowerCase();
  return globalNewsSourceRegistry.supersededOrExcluded.some(
    (e) => e.id.toLowerCase() === needle || e.label.toLowerCase() === needle
  );
}

// Derived counts -- computed, never hand-typed, so the final report cannot drift from the data.
export function computeRegistryCounts() {
  const uniquePublisherIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.publisherId));
  const freshlyVerifiedSources = globalNewsSourceRegistry.sources.filter((s) => s.verificationStatus === 'FRESHLY_VERIFIED_THIS_BATCH');
  const pendingVerificationSources = globalNewsSourceRegistry.sources.filter((s) => s.verificationStatus === 'PENDING_VERIFICATION');
  const webOnlyTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'WEB_ONLY');
  const pendingManualTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'PENDING_MANUAL');
  const unresolvedTargets = globalNewsSourceRegistry.targets.filter((t) => t.transportStatus === 'UNRESOLVED');
  return {
    logicalSourceCount: globalNewsSourceRegistry.sources.length,
    uniquePublisherCount: uniquePublisherIds.size,
    monitoredTargetCount: globalNewsSourceRegistry.targets.length,
    referenceResourceCount: globalNewsSourceRegistry.referenceResources.length,
    freshlyVerifiedSourceCount: freshlyVerifiedSources.length,
    pendingVerificationSourceCount: pendingVerificationSources.length,
    webOnlyTargetCount: webOnlyTargets.length,
    pendingManualTargetCount: pendingManualTargets.length,
    unresolvedTargetCount: unresolvedTargets.length,
  };
}
