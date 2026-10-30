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
  /\b(shares?|stocks?|ipo|listing|nasdaq|nyse|investors?|earnings|revenue|profits?|quarterly|deals?|acquir\w*|acquisition|mergers?|buyout|takeover|stake|valuation|funding|raises|billion|million|ceo|chief executive|lobby\w*|layoffs?|job cuts|prices?|pricing|tariffs?|lawsuits?|sues|settlement|insurers?|insurance|partners? with|partnership|collaborat\w*|sales|strateg\w*|compet\w*|spending|elections?|midterms?|rebates?|discounts?|rall(y|ies|ied)|shareholders?|agreements?)\b/i,
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
    /\b(approv(e|es|ed|al)|clear(s|ed|ance|ances)|authori[sz](e|es|ed|ation)|ce mark\w*)\b/i,
    /(yapay zek\w*|dijital sağlık|yazılım\w*|mobil uygulama\w*|sağlık uygulama\w*|robot\w*|onayla\w*|onay verdi|onayı)/,
  ],
  deny: [
    // Mixed roundups: several stories under one title.
    /^\s*(recon|euro roundup|asia-pacific roundup|this week at fda)\b/i,
    /;/,
    /(bu hafta|haftalık|özet\w*|avrupa haberleri|asya-pasifik haberleri|avrupa-pasifik haberleri)/,
    // Warning letters and compliance detail.
    /\b(warn(s|ed|ing)?|warning letters?|admonish\w*|form 483|c?gmp|glp|qsr|qmsr|violations?|inspections?)\b/i,
    /(uyarı mektub\w*|uyar\w*|ihlal\w*|denetim\w*)/,
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

export const SOURCE_CONTENT_POLICY: Readonly<Record<string, SourcePolicy>> = {
  'news-ema-news-whole': EMA,
  'news-medical-device-network-news-whole': MEDICAL_DEVICE_NETWORK,
  'news-medical-news-today-sitemap': MEDICAL_NEWS_TODAY,
  'news-reuters-healthcare-scoped': REUTERS,
  'news-medtech-dive-news-whole': MEDTECH_DIVE,
  'news-raps-regulatory-focus-scoped': RAPS,
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
