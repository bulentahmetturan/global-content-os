/**
 * Per-source content policy (owner decisions, dependency-free; used by the ingest gate and by lane purity).
 * A source with a policy admits only items whose title matches `allow` and nothing in `deny`; deny wins.
 * Titles are tested raw (English originals) and Turkish-lower-cased (translated titles: /i alone does not fold 'İ').
 *
 * news-reuters-healthcare-scoped (owner 2026-10-29): keep drug approvals / clinical trials and public health;
 * business, finance and company news, US politics and everything else never enter the system.
 * A trial result reported together with a share move is business news and is refused (deny wins); a public figure's
 * own illness is refused; a striking research/AI-lab story ("wow") is kept.
 */

export interface SourcePolicy {
  allow: RegExp[];
  deny: RegExp[];
  /** Optional: every one of these must also match (e.g. "an FDA/CE approval" AND an allowed topic). */
  allOf?: RegExp[];
  note: string;
}

/** Business, finance and company news (shared by every policy that refuses it). */
const BUSINESS_DENY: RegExp[] = [
  /\b(shares?(?! (principles|guidance|data|findings|results|framework))|stocks?|ipo|listing|nasdaq|nyse|investors?|earnings|revenue|profits?|quarterly|deals?|acquir\w*|acquisition|mergers?|buyout|takeover|stake|valuation|funding|raises|billion|million|ceo|chief executive|lobby\w*|layoffs?|job cuts|prices?|pricing|tariffs?|lawsuits?|sues|settlement|insurers?|insurance|partners? with|partnership|collaborat\w*|sales|strateg\w*|compet\w*|spending|elections?|midterms?|rebates?|discounts?|rall(y|ies|ied)|shareholders?|agreements?)\b/i,
  /\$\s?\d/,
  /\bm&a\b|mergers and acquisitions/i,
  /(hisse\w*|borsa\w*|halka arz\w*|yatırım\w*|milyon dolar\w*|milyar dolar\w*|gelir\w*|kâr\w*|zarar\w*|çeyrek\w*|satın al\w*|devral\w*|birleşme\w*|anlaşma\w*|ortaklık\w*|iş birliği\w*|işbirliği\w*|üst yönetici\w*|lobi\w*|işten çıkar\w*|fiyat\w*|tarife\w*|gümrük\w*|dava\w*|sigorta\w*|satış\w*|strateji\w*|rekabet\w*|harcama\w*|payları|payı yüksel\w*|payı düş\w*|pay sahib\w*|değerleme\w*|değeri yüksel\w*|indirim\w*)/,
  // Company-profile pages ("Nanjing Well Pharmaceutical Group Şirketi").
  /(şirketi|company|co\.?,? ltd\.?|inc\.?|corp\.?|plc)\s*$/i,
];
/** A public figure's own illness is personal news, not medicine (owner 2026-10-29: "Papa Leo'nun kanser tanısı" never enters). */
const PUBLIC_FIGURE_DENY: RegExp[] = [
  /\b(pope|pontiff|vatican|papa|celebrit\w*)\b|papanın|papa['’]/i,
];
/** US politics. */
const US_POLITICS_DENY: RegExp[] = [
  /\b(trump|biden|medicare|medicaid|obamacare|affordable care act|congress\w*|senate|senators?|lawmakers?|republicans?|democrats?|white house|trump administration|biden administration|kennedy|rfk|hhs secretary|abortion)\b/i,
  /(trump|biden|kongre\w*|senato\w*|cumhuriyetçi\w*|demokrat\w*|beyaz saray|seçim\w*|kürtaj\w*|abortion)/,
];

const REUTERS: SourcePolicy = {
  note: 'Reuters Healthcare: only drug approvals, clinical trials and public health (owner 2026-10-29).',
  allow: [
    // Drug approvals and clinical trials.
    /\b(approv\w*|clear(s|ed|ance)|authori[sz]\w*|trials?|study|studies|phase\s?(1|2|3|i{1,3})\b|late-stage|mid-stage|early-stage|efficacy|primary (goal|endpoint)|main goal|vaccin\w*|drugs?|treatments?|therap\w*|cancer|tumou?r|alzheimer\w*|parkinson\w*|obesity|diabetes|glp-1|wegovy|ozempic|zepbound|mounjaro|chmp|recalls?)\b/i,
    /(onay\w*|ruhsat\w*|deney\w*|faz\s?\d|çalışma\w*|araştırma\w*|aşı\w*|ilaç\w*|tedavi\w*|terapi\w*|kanser\w*|tümör\w*|alzheimer\w*|parkinson\w*|obezite\w*|diyabet\w*|geri çağır\w*)/,
    // Public health.
    /\b(outbreaks?|epidemics?|pandemics?|ebola|measles|mpox|cholera|polio|dengue|malaria|influenza|flu|bird flu|h5n1|covid\w*|virus\w*|infections?|cases|deaths?|world health|public health|quarantine\w*|plague|nobel|research\w*|scientists?)\b/i,
    /\b(WHO|CDC|ECDC|FDA|EMA|MHRA)\b/,
    /(salgın\w*|virüs\w*|enfeksiyon\w*|vaka\w*|ölüm\w*|dsö|dünya sağlık|halk sağlığı|karantina\w*|veba|kızamık|ebola|kolera|çocuk felci|grip|covid)/,
  ],
  deny: [...BUSINESS_DENY, ...PUBLIC_FIGURE_DENY, ...US_POLITICS_DENY],
};

/**
 * MedTech Dive (owner 2026-10-29): only device approvals (FDA / CE) and striking device technology (robotics, AI, implants,
 * wearables, neurotech: the "wow" items). Business/finance/company news, people moves, US politics and reimbursement,
 * recalls and safety notices, and clinical data never enter.
 */
const MEDTECH_DIVE: SourcePolicy = {
  note: 'MedTech Dive: only device approvals (FDA/CE) and striking device technology (owner 2026-10-29).',
  allow: [
    /\b(fda|ce mark\w*|510\(k\)|de novo|clear(s|ed|ance|ances)|approv\w*|breakthrough device|authori[sz]\w*|launch\w*|unveil\w*|debut\w*)\b/i,
    /(onay\w*|ce işaret\w*|ce mark\w*|izin\w*|ruhsat\w*|piyasaya sür\w*|kullanıma sun\w*|tanıttı)/,
    /\b(robot\w*|ai|artificial intelligence|machine learning|generative|agentic|implant\w*|wearables?|sensors?|biosensors?|brain-computer|bci|neural|neurotech\w*|exoskeleton\w*|single-port|telesurg\w*|3d-print\w*|nanotech\w*|smart ring)\b/i,
    /(robot\w*|yapay zek\w*|implant\w*|giyilebilir\w*|sensör\w*|beyin-bilgisayar|nöroteknoloji\w*|dış iskelet\w*|tek port\w*|tek-port\w*|telerobot\w*)/,
  ],
  deny: [
    ...BUSINESS_DENY,
    // Companies, markets, contracts, costs.
    /\b(compan(y|ies)|firms?|markets?|contracts?|costs?|award\w*|grants?|prize)\b/i,
    /(şirket\w*|pazar\w*|piyasa(?!ya sür)\w*|sözleşme\w*|maliyet\w*|ödül\w*|hibe\w*)/,
    // People moves.
    /\b(appoint\w*|names?|named|hires?|hired|joins?|chief|officer|cfo|cto|coo|president|director|steps down|retire\w*)\b/i,
    /(atan\w*|görevlendir\w*|müdür\w*|sorumlu\w*|başkan\w*|yönetici\w*|istifa\w*)/,
    // US reimbursement and policy.
    /\b(cms|oig|reimburs\w*|payments?|coverage|medicare advantage|dr\.? oz)\b/i,
    /(geri ödeme\w*|ödeme\w*|kapsam\w*)/,
    // Recalls and safety notices.
    /\b(recall\w*|warning\w*|safety|class i|deaths?|injur\w*|adverse)\b/i,
    /(geri çağır\w*|uyarı\w*|güvenlik\w*|ölüm\w*|yaralan\w*)/,
    // Clinical data.
    /\b(study|studies|trials?|data|clinical|evidence|results?|findings?)\b/i,
    /(çalışma\w*|deney\w*|veri\w*|klinik\w*|sonuç\w*|kanıt\w*|bulgu\w*)/,
    ...PUBLIC_FIGURE_DENY,
    ...US_POLITICS_DENY,
  ],
};

/**
 * RAPS Regulatory Focus (owner 2026-10-29): only AI / digital health / software / robotic device regulation and single-topic
 * approval news. Regulatory detail (other guidance, GMP), warning letters, US politics, business/finance and mixed
 * roundups ("Recon:", "Euro Roundup:", "This Week at FDA", several stories joined by ";") never enter.
 */
const RAPS: SourcePolicy = {
  note: 'RAPS: only AI/digital/software/robotic device regulation and single-topic approvals (owner 2026-10-29).',
  allow: [
    /\b(ai|artificial intelligence|genai|generative|machine learning|digital health|software|samd|apps?|algorithms?|robot\w*|robotically)\b/i,
    /\b(devices?|ivd|in vitro diagnostic\w*|diagnostics?|510\(k\)|ce[ -]?mark\w*|mdr|ivdr|udi|eudamed|mdcg)\b/i,
    /(tıbbi cihaz\w*|cihaz\w*|tanı(?!t)\w*)/,
    /\b(approv(e|es|ed|al)|clear(s|ed|ance|ances)|authori[sz](e|es|ed|ation)|ce mark\w*)\b/i,
    /(yapay zek\w*|dijital sağlık|yazılım\w*|mobil uygulama\w*|sağlık uygulama\w*|robot\w*|onayla\w*|onay verdi|onayı)/,
  ],
  deny: [
    // Mixed roundups: several stories under one title.
    /^\s*(recon|this week at fda)\b/i,
    /;/,
    /(bu hafta|haftalık|özet\w*)/,
    // Warning letters and compliance detail.
    /\b(warn(s|ed|ing)?|warning letters?|admonish\w*|form 483|c?gmp|glp|qsr|qmsr|violations?|inspections?)\b/i,
    /(uyarı mektub\w*|uyar\w*|ihlal\w*|denetim\w*)/,
    /\b(charges?|fees?)\b/i,
    /(ücret\w*)/,
    ...BUSINESS_DENY,
    /\b(hhs|doge|adcomms?|midterms?)\b/i,
    ...US_POLITICS_DENY,
  ],
};

/**
 * Medical News Today (owner 2026-10-29): consumer health journalism stays in Haber, but only inside our interest areas
 * (healthy ageing and longevity, brain and cognition, chronic disease, cancer early detection, metabolic health and weight,
 * menopause, sleep, movement, nutrition, mental health), so noise stays out. A public figure's own illness never enters.
 */
const MEDICAL_NEWS_TODAY: SourcePolicy = {
  note: 'Medical News Today: only our interest areas (longevity, brain, chronic disease, early detection, metabolic, sleep, movement, nutrition, mental health) (owner 2026-10-29).',
  allow: [
    // Healthy ageing, longevity, brain and cognition.
    /\b(aging|ageing|longevity|lifespan|older adults?|later life|midlife|elderly|dementia|alzheimer\w*|parkinson\w*|cognit\w*|brain|memory)\b/i,
    // Chronic and metabolic disease, early detection.
    /\b(diabet\w*|insulin|obesity|weight|glp-1|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|orforglipron|heart|cardio\w*|blood pressure|hypertension|cholesterol|stroke|kidney|liver|cancer\w*|tumou?rs?|arthritis|inflammation|blood test|screening|early detection)\b/i,
    // Lifestyle: movement, nutrition, sleep, women's health, mental health.
    /\b(exercise|physical activity|steps?|walking|fitness|diet\w*|nutrition|foods?|ultra-processed|meat|sleep|insomnia|stress|social|loneliness|smoking|alcohol|menopause|perimenopause|gut|microbiome|vitamins?|supplements?|depression|anxiety|adhd|mental health)\b/i,
    /(yaşlan\w*|uzun ömür\w*|beyin\w*|bilişsel|bunama|alzheimer\w*|diyabet\w*|obezite\w*|kilo\w*|kalp\w*|tansiyon\w*|inme\w*|kanser\w*|egzersiz\w*|fiziksel aktivite|adım\w*|beslenme\w*|diyet\w*|uyku\w*|menopoz\w*|depresyon\w*|kaygı\w*|ruh sağlığı)/,
  ],
  deny: [...PUBLIC_FIGURE_DENY, ...US_POLITICS_DENY, ...BUSINESS_DENY],
};

/**
 * Medical Device Network (owner 2026-10-30): only FDA / CE approvals, and only in areas that matter to people broadly
 * (owner's examples: CE mark for a colorectal cancer screening test, FDA clearance for a blood-pressure smart ring).
 * New product / test launches, business, clinical data, safety notices and everything else never enter.
 */
const MEDICAL_DEVICE_NETWORK: SourcePolicy = {
  note: 'Medical Device Network: only FDA/CE approvals in broad-impact health areas (owner 2026-10-30).',
  allOf: [
    /\b(fda|ce[ -]?mark\w*)\b/i,
    /\b(clear(s|ed|ance|ances)?|approv\w*|authori[sz]\w*|greenlight\w*|nod|ce[ -]?mark\w*)\b/i,
  ],
  allow: [
    // Screening and early detection of common cancers.
    /\b(screening|early detection|cancer tests?|colorectal|colon cancer|breast cancer|lung cancer|prostate|cervical|cologuard)\b/i,
    // Common chronic disease and everyday risk factors.
    /\b(blood pressure|hypertension|glucose|cgm|diabet\w*|insulin|obesity|weight loss|alzheimer\w*|dementia|atrial fibrillation|afib|sleep apnea|hearing aids?)\b/i,
    // Devices for the general public: at home, over the counter, wearables.
    /\b(smart ?rings?|smartwatch\w*|wearables?|at-home|home use|over-the-counter|otc|consumer)\b/i,
  ],
  deny: [
    ...BUSINESS_DENY,
    /\b(introduc\w*|launch\w*|unveil\w*|debut\w*|podcast|webinar)\b/i,
    /\b(recall\w*|warning\w*|alert|safety|deaths?|injur\w*|adverse)\b/i,
    /\b(study|studies|trials?|data|results?|findings?|report)\b/i,
    /\b(paediatric|pediatric)\b/i,
    ...PUBLIC_FIGURE_DENY,
    ...US_POLITICS_DENY,
  ],
};

/**
 * EMA News (owner 2026-10-30, "EMA daralt"): EMA is a primary source, so only what is medicine news for our audiences
 * stays: CHMP / PRAC outcomes, marketing-authorisation recommendations and approvals, vaccines and outbreak guidance,
 * safety signals. Veterinary items (CVMP), management-board and executive-director items, workshops and speeches,
 * administrative deadlines, variation and pilot notices, and general regulatory policy never enter.
 */
const EMA: SourcePolicy = {
  note: 'EMA: only CHMP/PRAC outcomes, authorisation recommendations, vaccines/outbreaks and safety signals (owner 2026-10-30).',
  allow: [
    /\b(chmp|prac|recommend\w*|marketing authori[sz]\w*|authori[sz]ation|approv\w*|vaccin\w*|ebola|outbreaks?|safety signals?|glp-1|shortages?)\b/i,
    /(chmp|prac|öner\w*|ruhsat\w*|onay\w*|aşı\w*|ebola|salgın\w*|güvenlik sinyal\w*|glp-1|yetersizli\w*)/,
  ],
  deny: [
    // Veterinary medicines.
    /\b(veterinar\w*|cvmp|cattle|bovine|livestock|lumpy skin|pets?|dogs?|cats?)\b/i,
    /(veteriner\w*|sığır\w*|hayvan sağlığı|kabarcık cilt)/,
    // Governance, events, speeches.
    /\b(management board|executive director|executive board|board meeting|workshops?|conference|webinar|speech|keynote)\b/i,
    /(i̇?cra kurulu|i̇?cra direktör\w*|yönetim kurulu|çalıştay\w*|konferans\w*|konuşma\w*|webinar\w*)/,
    // Administrative notices: deadlines, variations, pilots, consultations.
    /\b(deadlines?|variations?|pilots?|consultations?|fees?|reflection paper|template|guidance on submission)\b/i,
    /(son tarih\w*|kabul tarih\w*|değişiklik talep\w*|pilot\w*|danışma\w*|ücret\w*|şablon\w*)/,
  ],
};

/**
 * WHO Newsroom (owner 2026-10-30, "dar süzgeç"): guidelines and recommendations, diagnostics and treatment findings,
 * vaccines, outbreaks and health alerts. Nominations, director messages, partnerships and MoUs, summits and forums,
 * schools and academies, youth bodies, climate and finance never enter.
 */
const WHO_NEWSROOM: SourcePolicy = {
  note: 'WHO Newsroom: only guidelines, recommendations, diagnostics/treatment findings, vaccines, outbreaks and health alerts (owner 2026-10-30).',
  allow: [
    /\b(guidelines?|guidance|first global|recommend\w*|vaccin\w*|immuni[sz]\w*|outbreaks?|emergenc\w*|diagnos\w*|tests?|testing|treatment\w*|obesity|hypertension|cancer|tuberculosis|tb|malaria|hiv|cholera|ebola|mpox|measles|polio|rabies|eliminat\w*|contracepti\w*|lead poisoning|heat|antimicrobial|screening|prequalif\w*|essential medicines|safety|toolkit)\b/i,
    /(kılavuz\w*|rehber\w*|öneri\w*|aşı\w*|salgın\w*|tanı(?!t)\w*|tedavi\w*|obezite\w*|hipertansiyon\w*|kanser\w*|tüberküloz\w*|sıtma|kolera|ebola|kuduz\w*|kurşun\w*|sıcak\w*|ön yeterlilik)/,
  ],
  deny: [
    /\b(candidates?|director[- ]general|director'?s? message|message (by|from)|nominat\w*|appoint\w*|elect\w*|partner\w*|sign(s|ed)?|agreement|memorandum|mou|summit|forum|conference|workshop|webinar|summer school|academy|youth council|friends of|coalition|calls? for|invites?|join|host facilit\w*|climate|funding|financ\w*|tax\w*|governance|political declaration|enhypen|training|capacity|commit\w*|social protection|food insecurity|famine|malnutrition|group|advisory|meets?|data requested)\b/i,
    /(aday\w*|genel direktör\w*|direktör\w*|mesaj\w*|ortaklık\w*|mutabakat\w*|anlaşma\w*|zirve\w*|forum\w*|konferans\w*|çalıştay\w*|yaz okulu|akademi\w*|gençlik konsey\w*|koalisyon\w*|iklim\w*|vergi\w*|finansman\w*|yönetişim\w*|siyasi bildirim\w*|sosyal koruma|gıda güvensizli\w*|açlık\w*|malnütrisyon\w*)/,
  ],
};

/**
 * MedPage Today (owner 2026-10-30, "politika şart, yoksa kapat"): the same interest areas as Medical News Today plus public-health
 * events. US politics, business, several stories joined by ";" (podcasts, briefs), events, cyber incidents, personal news and
 * subspecialty trial reports (oncology and rare-disease drug results) never enter.
 */
const MEDPAGE_TODAY: SourcePolicy = {
  note: 'MedPage Today: only our interest areas and public-health events; no US politics, business, roundups or subspecialty trial reports (owner 2026-10-30).',
  allow: [
    ...MEDICAL_NEWS_TODAY.allow,
    /\b(outbreaks?|measles|ebola|dengue|bird flu|h5n1|covid|rsv|influenza|flu|vaccin\w*|mpox)\b/i,
    /(salgın\w*|kızamık|ebola|dang|kuş gribi|aşı\w*|grip)/,
  ],
  deny: [
    ...PUBLIC_FIGURE_DENY,
    ...US_POLITICS_DENY,
    ...BUSINESS_DENY,
    /;/,
    /\b(webinar|podcast|cme|conference|summit|quiz|poll|survey|cyber\w*|data breach|ransomware|dies|obituary|cause of death|actor|singer|nfl|nba)\b/i,
    /\b(chemo\w*|immunotherapy|adjuvant|radiotherapy|radiation|radiosurgery|survival|recurrence|ici|tki|prostate cancer|lung cancer|breast cancer|ovarian|thyroid cancer|colon cancer|rectal|melanoma|carcinoma|oncolog\w*|doublet|regimen|intensified|de-escalation|cancer therapies)\b/i,
    /\b(murder|death penalty|arrest\w*|charged|remembering|hhs|federal|boycott)\b/i,
    /^\s*[A-Z][a-z]+( [A-Z]\.?)? [A-Z][a-z]+( and [A-Z][a-z]+ [A-Z][a-z]+)? on /,
    /\b(pfs|progression-free|overall survival|response rate|her2\w*|egfr|dmmr|msi-h|adc|car-t|metastatic|refractory|relapsed|dlbcl|lymphoma|leukemia|myeloma|myasthenia|sarcoidosis|nephropathy|urticaria|bladder cancer|endometrial|serotypes?|biosimilar\w*|phase [123i]+)\b/i,
    /(webinar\w*|podcast\w*|siber\w*|metastatik|lenfoma|lösemi|miyelom|miyastenia|sarkoidoz\w*)/,
  ],
};

/**
 * FDA Press Announcements (owner 2026-10-30): approvals, clearances and guidance, devices and digital health. Enforcement
 * (counterfeits, consent decrees), tobacco, food, advisory-committee calls, public-input requests and framework launches
 * never enter.
 */
const FDA_PRESS: SourcePolicy = {
  note: 'FDA Press: only approvals, clearances, guidance, devices and digital health (owner 2026-10-30).',
  allow: [
    /\b(approv\w*|clear(s|ed|ance|ances)|authori[sz]\w*|guidance|devices?|ai|artificial intelligence|software|apps?|digital health|first (treatment|drug|heart|device|therapy)|recall\w*)\b/i,
    /(onay\w*|ruhsat\w*|rehber\w*|cihaz\w*|yapay zek\w*|yazılım\w*|uygulama\w*|geri çağır\w*)/,
  ],
  deny: [
    /\b(counterfeit|consent decree|charges?|indict\w*|sentenc\w*|pmta|tobacco|cigarettes?|vap(e|es|ing)|e-cigarettes?|food|infant formula|cosmetics?|pets?|animals?|advisory committee\w*|adcomms?|public input|launch(es)? (a |the )?(new |nationwide )?(program|effort|initiative)|framework|ibogaine|psychedelic\w*|reorgani[sz]\w*)\b/i,
    /(sahte ilaç\w*|rıza kararı|tütün\w*|sigara\w*|gıda\w*|kozmetik\w*|hayvan\w*|danışma kurul\w*|kamuoyu görüş\w*|çerçeve\w*|psikedelik\w*)/,
  ],
};

/**
 * NICE HealthTech (owner 2026-10-30, device / diagnostics / AI filter): NICE news is all of NICE guidance, so only
 * technology items enter: devices, diagnostics, digital and AI tools, screening.
 */
const NICE_HEALTHTECH: SourcePolicy = {
  note: 'NICE: only devices, diagnostics, digital/AI technologies and screening (owner 2026-10-30).',
  allow: [
    /\b(ai|artificial intelligence|digital|apps?|software|devices?|diagnos\w*|tests?|testing|medtech|medical technolog\w*|health ?tech|wearables?|robot\w*|screening|detect\w*|early value assessment)\b/i,
    /(yapay zek\w*|dijital|uygulama\w*|yazılım\w*|cihaz\w*|tanı(?!t)\w*|tarama\w*|erken tespit|robot\w*)/,
  ],
  deny: [/\b(annual report|accounts|podcasts?|webinars?|consultations?|jobs?|vacanc\w*|board)\b/i, /(yıllık rapor\w*|danışma\w*|podcast\w*|webinar\w*)/],
};

/**
 * EC Medical Devices sector page (owner 2026-10-30, device-labelled updates only): MDCG guidance, Eudamed, classification,
 * harmonised standards. Meeting minutes, registrations, webinars, dashboards and form-file updates never enter.
 */
const EC_MEDICAL_DEVICES: SourcePolicy = {
  note: 'EC medical devices: only MDCG/Eudamed/classification/standards updates; no minutes, registrations, webinars (owner 2026-10-30).',
  allow: [
    /\b(mdcg|eudamed|medical devices?|in vitro diagnostic\w*|ivd|mdr|ivdr|harmoni[sz]ed standards?|classification|notified bod\w*|sscp|borderline|implant\w*|well-established technologies|delegated acts?)\b/i,
    /(tıbbi cihaz\w*|sınıflandırma|uyumlaştırılmış standart\w*|onaylanmış kuruluş\w*)/,
  ],
  deny: [/\b(minutes|registration|webinar|summary conclusions|meeting|call for|survey|training|workshop|agenda|dashboard|xsd|changelog)\b/i, /(tutanak\w*|kayıt\b|webinar\w*|toplantı\w*|çalıştay\w*|anket\w*)/],
};

/**
 * HealthAI (owner 2026-10-30, "etkinlikler süzülmeli"): the agency announces events, MoUs, appointments and board changes;
 * only reports, guidance, frameworks and toolkits enter. The monthly AI-and-European-health report is a separate feature.
 */
const HEALTHAI: SourcePolicy = {
  note: 'HealthAI: only reports, guidance, frameworks and toolkits; events, MoUs and appointments never enter (owner 2026-10-30).',
  allow: [
    /\b(reports?|guidance|guidelines?|framework|toolkit|principles|benchmark\w*|study|analysis|policy brief|white paper|assessment)\b/i,
    /(rapor\w*|rehber\w*|çerçeve\w*|araç seti|ilkeler|analiz\w*|değerlendirme\w*)/,
  ],
  deny: [
    /\b(forum|summit|webinar|conference|appointed|welcomes? new|vice[- ]chair|board|co-editor|mou|memorandum|signs?|agreement|joins?|strategic collaboration)\b/i,
    /(forum\w*|zirve\w*|webinar\w*|konferans\w*|atan\w*|yönetim kurulu|mutabakat\w*|anlaşma\w*|katıl\w*|stratejik iş birliği)/,
  ],
};

export const SOURCE_CONTENT_POLICY: Readonly<Record<string, SourcePolicy>> = {
  'news-ema-news-whole': EMA,
  'news-medical-device-network-news-whole': MEDICAL_DEVICE_NETWORK,
  'news-medical-news-today-sitemap': MEDICAL_NEWS_TODAY,
  'news-reuters-healthcare-scoped': REUTERS,
  'news-medtech-dive-news-whole': MEDTECH_DIVE,
  'news-raps-regulatory-focus-scoped': RAPS,
  'news-who-newsroom-whole': WHO_NEWSROOM,
  'news-medpagetoday-sitemap': MEDPAGE_TODAY,
  'news-fda-press-scoped': FDA_PRESS,
  'news-nice-healthtech-scoped': NICE_HEALTHTECH,
  'news-ec-medical-devices-target': EC_MEDICAL_DEVICES,
  'news-healthai-news-whole': HEALTHAI,
};

export const POLICY_FEED_IDS: readonly string[] = Object.keys(SOURCE_CONTENT_POLICY);

/** 'pass' / 'deny' for a source with a policy, null when the source has none. */
export function sourcePolicyVerdict(feedId: string | null | undefined, title: string | null | undefined, titleOrig?: string | null): 'pass' | 'deny' | null {
  const policy = SOURCE_CONTENT_POLICY[feedId ?? ''];
  if (!policy) return null;
  // The source's own (original-language) title decides; the machine translation is used only when no original is stored.
  // Ingestion and the cleanup of stored items then judge the same text.
  const raw = ((titleOrig ?? '').trim() || (title ?? '')).trim();
  const low = raw.toLocaleLowerCase('tr-TR');
  const hit = (re: RegExp) => re.test(raw) || re.test(low);
  if (policy.deny.some(hit)) return 'deny';
  if (policy.allOf && !policy.allOf.every(hit)) return 'deny';
  return policy.allow.some(hit) ? 'pass' : 'deny';
}
