/**
 * Item features and hard gates for the owner-rated selection (channel profiles v0.1, docs/audits/2026-10-23-channel-profile-interview.md).
 * Pure and deterministic: no network, no clock, no randomness. Gates only GROUP items ("elenenler"); nothing is deleted or hidden, and an owner
 * rating that disagrees with a gate is recorded as a gate error so the rules can be corrected.
 */

export interface ScoreInput {
  route?: string | null;
  source?: string | null;
  title?: string | null;
  titleOrig?: string | null;
  summary?: string | null;
  hasDoi?: boolean;
  hasPmid?: boolean;
}

export const GATE_LABELS: Readonly<Record<string, string>> = {
  PREPRINT: 'Hakem onayı yok (preprint)',
  STOP_DRUG: 'İlaç bırakma çağrısı',
  MIRACLE_CURE: 'Mucize ya da doğal tedavi iddiası',
  LOCAL_OUTBREAK: 'Türkiye’yi ilgilendirmeyen yerel salgın',
  US_REGULATORY: 'Tek ülkeye özgü düzenleme ya da politika',
  TRADE_NEWS: 'Ticari ya da şirket haberi',
  LOCAL_STUDY: 'Yerel ya da bölgesel çalışma',
  ANIMAL_NO_HUMAN: 'Hayvan ya da hücre çalışması, insan karşılığı belirtilmemiş',
};
export const GATE_ORDER = Object.keys(GATE_LABELS);

const FLAG_PATTERNS: Readonly<Record<string, RegExp>> = {
  preprint: /\b(preprint|medrxiv|biorxiv|arxiv|ssrn|research square)\b/i,
  animal: /\b(mice|mouse|murine|rats?|rodents?|zebrafish|drosophila|c\. elegans|in vitro|cell lines?|organoids?|sea slug|fare|fareler|sıçan)\b/i,
  human: /\b(humans?|patients?|clinical|translat\w+|people|women|men|children|adults?|participants?|trial|insan|hasta)\b/i,
  rct: /\b(randomi[sz]ed|randomised|rct|placebo-controlled|randomize)\b/i,
  metaAnalysis: /\b(meta-?analys[ie]s|systematic review|umbrella review|network meta|meta-?analiz|sistematik derleme)\b/i,
  cohort: /\b(cohorts?|prospective|longitudinal|population-based|kohort)\b/i,
  guideline: /\b(guidelines?|consensus statement|recommendations?|position statement|rehber)\b/i,
  lifestyle: /\b(diet(ary)?|nutrition|food|foods|sleep|exercise|physical activity|walking|fasting|obesity|weight loss|mediterranean|fib(er|re)|protein|sugar|coffee|alcohol|meditation|stress|longevity|healthspan|ultra-?processed|supplements?|vitamin|beslenme|uyku|egzersiz|diyet|yaşam tarzı|kilo)\b/i,
  chronic: /\b(diabetes|hypertension|blood pressure|cholesterol|cardiovascular|heart disease|stroke|kidney|arthritis|asthma|copd|depression|anxiety|dementia|alzheimer|metabolic|chronic|diyabet|tansiyon|kalp)\b/i,
  ai: /\b(ai|a\.i\.|artificial intelligence|machine learning|deep learning|large language model|llm|chatgpt|yapay zeka)\b/i,
  firstOrBreakthrough: /\b(first-in-human|first (patient|time|ever|of its kind)|world'?s first|breakthrough|pioneering|novel approach|ilk kez|çığır)\b/i,
  mythBusting: /\b(myths?|debunk\w*|challenges?|contrary to|no evidence|does not|fails? to|not associated|surprising|unexpected|şaşırtıcı)\b/i,
  turkey: /\b(turkey|türkiye|turkiye|turkish|türk|istanbul|ankara|anadolu)\b/i,
  drugFocus: /\b(drugs?|inhibitors?|\w+mab|\w+tinib|statins?|agonists?|glp-1|semaglutide|chemotherapy|dosage|prescription|ilaç)\b/i,
  regulatory: /\b(fda|ema|mhra|approval|approves?|approved|cleared|clearance|recall|warning letter|guidance|regulator\w*)\b/i,
  trade: /\b(acquires?|acquisition|merger|buyout|funding round|series [a-d]|ipo|earnings|quarterly|revenue|market share|stock|shares fall|investors?|partnership|licensing deal|collaboration agreement|layoffs?|ceo|launches? (a |its )?(new )?(product|device|platform))\b/i,
  usPolicy: /\b(medicare|medicaid|cms|affordable care act|obamacare|hhs|congress|senate|house bill|executive order|tariffs?|state law|fda|veterans affairs)\b/i,
  localSpecific: /\b(kenya|kenyan|nigeria|nigerian|uganda|tanzania|ghana|ethiopia|zambia|malawi|rwanda|zanzibar|senegal|mozambique|congo|sub-saharan|bangladesh|nepal|vietnam|indonesia|philippines|peru|bolivia|guatemala|native american|american indian|alaska native|first nations|aboriginal|indigenous|veterans?|u\.?s\.? army|military|informal settlement)\b/i,
  outbreak: /\b(ebola|marburg|cholera|dengue|lassa|mpox|monkeypox|outbreak|epidemic)\b/i,
  globalAlert: /\b(global|worldwide|pandemic|international|who warns|travel advisory|turkey|türkiye)\b/i,
  award: /\b(nobel|prize|awards?|appointed|named (chief|president|director)|elected)\b/i,
  stopDrug: /\b(stop taking|ditch (your|the) (meds|medication|drugs?)|quit (your )?(meds|medication)|instead of (medication|drugs|statins|insulin)|replace (your )?(medication|drugs|insulin))\b/i,
  miracle: /\b(miracle|natural cure|cure for (cancer|diabetes)|reverses? (cancer|diabetes)|detox(es)?|cures? cancer)\b/i,
};

const STOPWORDS = new Set('a an the of and or to in on for with by from at as is are was were be been this that these those it its into than then over under after before about new study studies find finds found shows show says say may can could will via using use used among between during their our your you not no more most less very also but if when how why what which who whom whose'.split(' '));

export interface Extracted {
  flags: Record<string, boolean>;
  /** Feature names for the learner: flags that are true, `src:`, `route:`, evidence marks and hashed text tokens. */
  features: string[];
  /** Hard gate codes that apply, in GATE_ORDER; the first one is the primary reason. */
  gates: string[];
}

function tokens(text: string): string[] {
  const words = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ğüşıöç]+/).filter((w) => w.length >= 3 && w.length <= 24 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const out: string[] = [];
  for (let i = 0; i < words.length && out.length < 80; i++) {
    out.push('w:' + words[i]);
    if (i + 1 < words.length) out.push('b:' + words[i] + '_' + words[i + 1]);
  }
  return out;
}

export function extractFeatures(input: ScoreInput): Extracted {
  const text = [input.titleOrig, input.title, input.summary].filter(Boolean).join(' . ');
  const source = (input.source ?? '').toLowerCase();
  const f: Record<string, boolean> = {};
  for (const [name, re] of Object.entries(FLAG_PATTERNS)) f[name] = re.test(text);
  f.preprint = f.preprint || /medrxiv|biorxiv|arxiv|ssrn|preprint/.test(source);
  f.evidenceReachable = !!(input.hasDoi || input.hasPmid);
  const design = f.rct || f.metaAnalysis || f.cohort;

  const gates: string[] = [];
  if (f.preprint) gates.push('PREPRINT');
  if (f.stopDrug) gates.push('STOP_DRUG');
  if (f.miracle && !(f.rct || f.metaAnalysis)) gates.push('MIRACLE_CURE');
  if (f.outbreak && f.localSpecific && !f.globalAlert) gates.push('LOCAL_OUTBREAK');
  if (f.usPolicy && !design) gates.push('US_REGULATORY');
  if (f.trade && !(design || f.guideline)) gates.push('TRADE_NEWS');
  if (f.localSpecific && !f.turkey && !f.globalAlert && !f.metaAnalysis && !gates.includes('LOCAL_OUTBREAK')) gates.push('LOCAL_STUDY');
  if (f.animal && !f.human) gates.push('ANIMAL_NO_HUMAN');

  const features = Object.entries(f).filter(([, v]) => v).map(([k]) => 'f:' + k);
  if (input.source) features.push('src:' + source);
  if (input.route) features.push('route:' + input.route);
  features.push(...tokens(text));
  features.push('bias');
  return { flags: f, features, gates: GATE_ORDER.filter((g) => gates.includes(g)) };
}

/** FNV-1a 32-bit hash into `dim` buckets. */
export function hashFeature(name: string, dim: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % dim;
}
