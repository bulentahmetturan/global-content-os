/**
 * Medical / scientific entity preservation guard for Turkish localization (titles and summaries).
 * Pure and deterministic: a curated glossary of disease, imaging, procedure, device and drug terms, accepted Turkish
 * equivalents of acronyms, and an INN (generic drug name) stem check.
 *
 * Every glossary entity found is judged:
 *   same                      the Turkish text uses the accepted rendering
 *   narrower_safe             the Turkish text uses a curated, more specific rendering implied by the source
 *   unsupported_substitution  a different entity appears (tomosynthesis -> tomografi, measles -> çiçek hastalığı),
 *                             the entity is missing from a title, or the Turkish text names an entity the source does not
 * Any unsupported substitution fails closed. Tested in terminology.test.mjs.
 */

export type EntityJudgement = 'same' | 'narrower_safe' | 'unsupported_substitution';

interface Term {
  id: string;
  /** Matched against the lower-cased English source. */
  en: RegExp;
  /** Matched at a word start against the Turkish text (tr-TR lower case): suffixes may follow. */
  tr: string[];
  narrower?: string[];
  /** Entities that are easily confused with each other: a sibling in the target is reported as a substitution. */
  group?: string;
}

const TERMS: Term[] = [
  // Rash illnesses (observed: measles rendered as smallpox / plague).
  { id: 'measles', en: /\b(?<!german )measles\b/, tr: ['kızamık(?!çık)'], group: 'rash' },
  { id: 'rubella', en: /\b(rubella|german measles)\b/, tr: ['kızamıkçık'], group: 'rash' },
  { id: 'smallpox', en: /\bsmallpox\b/, tr: ['çiçek hastalı', 'variola'], group: 'rash' },
  { id: 'chickenpox', en: /\b(chickenpox|chicken pox|varicella)\b/, tr: ['su ?çiçe[ğk]', 'varisella'], group: 'rash' },
  { id: 'mpox', en: /\b(mpox|monkeypox)\b/, tr: ['mpox', 'maymun çiçe[ğk]'], group: 'rash' },
  { id: 'mumps', en: /\bmumps\b/, tr: ['kabakulak'], group: 'rash' },
  { id: 'plague', en: /\bplague\b/, tr: ['veba'], group: 'outbreak' },
  { id: 'cholera', en: /\bcholera\b/, tr: ['kolera'], group: 'outbreak' },
  { id: 'meningitis', en: /\bmeningitis\b/, tr: ['menenjit'], group: 'outbreak' },
  { id: 'tuberculosis', en: /\b(tuberculosis|tb)\b/, tr: ['tüberküloz', 'verem'], group: 'outbreak' },
  { id: 'malaria', en: /\bmalaria\b/, tr: ['sıtma', 'malarya'], group: 'outbreak' },
  // Imaging (observed: tomosynthesis rendered as tomografi).
  { id: 'tomosynthesis', en: /tomosynthesis/, tr: ['tomosentez'], group: 'imaging' },
  { id: 'tomography', en: /\btomograph(y|ic)\b|\bct scans?\b/, tr: ['tomografi'], group: 'imaging' },
  { id: 'mammography', en: /mammogra(m|ms|phy|phic)\b/, tr: ['mamogra'], group: 'imaging' },
  { id: 'ultrasound', en: /ultrasound|ultrasonograph|sonograph/, tr: ['ultrason'], narrower: ['ultrasonografi', 'sonografi'], group: 'imaging' },
  { id: 'mri', en: /\bmri\b|magnetic resonance/, tr: ['mr\\b', 'mrg', 'mri', 'manyetik rezonans'], group: 'imaging' },
  { id: 'xray', en: /\bx-?rays?\b|radiograph/, tr: ['röntgen', 'radyografi', 'x-?ışın'], group: 'imaging' },
  // Cardiovascular events.
  { id: 'heart_attack', en: /heart attacks?|myocardial infarction/, tr: ['kalp kriz', 'miyokard enfarktüs', 'kalp enfarktüs'], group: 'cardiac' },
  { id: 'heart_failure', en: /heart failure|hfpef|hfref/, tr: ['kalp yetmezli'], group: 'cardiac' },
  { id: 'cardiac_arrest', en: /cardiac arrest/, tr: ['kalp durması', 'kardiyak arrest'], group: 'cardiac' },
  // "inme" is also a form of "inmek" (to descend): only stroke-specific forms count.
  { id: 'stroke', en: /\bstrokes?\b/, tr: ['inme(?:\\b|ye\\b|den\\b|nin\\b|li\\b|ler|ge[cç]ir)', 'felç', 'serebrovasküler'], group: 'cardiac' },
  { id: 'afib', en: /atrial fibrillation|\bafib\b|\ba-fib\b/, tr: ['atriyal fibrilasyon', 'afib', 'af\\b'], group: 'cardiac' },
  // Metabolic.
  { id: 'type1_diabetes', en: /type 1 diabetes|\bt1d\b/, tr: ['tip ?-?1 diyabet', 'tip i diyabet'], group: 'diabetes_type' },
  { id: 'type2_diabetes', en: /type 2 diabetes|\bt2d\b/, tr: ['tip ?-?2 diyabet', 'tip ii diyabet'], group: 'diabetes_type' },
  { id: 'diabetes', en: /\bdiabet(es|ic)\b/, tr: ['diyabet', 'şeker hastalı'] },
  { id: 'obesity', en: /\bobes(e|ity)\b/, tr: ['obez'] },
  { id: 'hypertension', en: /hypertension|high blood pressure/, tr: ['hipertansiyon', 'yüksek tansiyon', 'yüksek kan basıncı'] },
  // Infections.
  { id: 'hepatitis_b', en: /hepatitis b\b/, tr: ['hepatit b\\b'], group: 'hepatitis' },
  { id: 'hepatitis_c', en: /hepatitis c\b/, tr: ['hepatit c\\b'], group: 'hepatitis' },
  { id: 'influenza', en: /\binfluenza\b|\bflu\b/, tr: ['grip', 'influenza'], group: 'respiratory' },
  { id: 'covid', en: /covid|sars-cov-2|coronavirus/, tr: ['covid', 'sars-cov-2', 'koronavirüs'], group: 'respiratory' },
  { id: 'pneumonia', en: /pneumonia/, tr: ['pnömoni', 'zatürre'] },
  { id: 'sepsis', en: /\bsep(sis|tic)\b/, tr: ['sepsis', 'septik'] },
  // Neurology / development.
  { id: 'alzheimer', en: /alzheimer/, tr: ['alzheimer'], group: 'neurodegenerative' },
  { id: 'parkinson', en: /parkinson/, tr: ['parkinson'], group: 'neurodegenerative' },
  { id: 'dementia', en: /dementia/, tr: ['demans', 'bunama'], group: 'neurodegenerative' },
  { id: 'autism', en: /\bautis(m|tic)\b/, tr: ['otizm', 'otistik'] },
  // Oncology.
  { id: 'cancer', en: /\bcancers?\b/, tr: ['kanser'] },
  { id: 'breast_cancer', en: /breast cancer/, tr: ['meme kanser'], group: 'cancer_site' },
  { id: 'lung_cancer', en: /lung cancer/, tr: ['akciğer kanser'], group: 'cancer_site' },
  { id: 'prostate_cancer', en: /prostate cancer/, tr: ['prostat kanser'], group: 'cancer_site' },
  { id: 'colorectal_cancer', en: /colorectal cancer|colon cancer/, tr: ['kolorektal', 'kolon kanser'], group: 'cancer_site' },
  { id: 'pancreatic_cancer', en: /pancreatic cancer/, tr: ['pankreas kanser'], group: 'cancer_site' },
  { id: 'leukemia', en: /leuka?emia/, tr: ['lösemi'], group: 'blood_cancer' },
  { id: 'lymphoma', en: /lymphoma/, tr: ['lenfoma'], group: 'blood_cancer' },
  { id: 'melanoma', en: /melanoma/, tr: ['melanom'] },
  // Other conditions.
  { id: 'asthma', en: /\basthma/, tr: ['astım'] },
  { id: 'lymphedema', en: /lympha?edema/, tr: ['lenfödem'] },
  { id: 'menopause', en: /menopaus/, tr: ['menopoz'] },
  { id: 'thrombosis', en: /thrombo(sis|tic)/, tr: ['tromboz', 'trombotik', 'pıhtı'] },
  // Treatments, procedures, devices.
  // "aşırı" (extreme) and "aşındır-" (erode) start with "aşı": only vaccine forms count.
  { id: 'vaccine', en: /\bvaccin/, tr: ['aşı(?:\\b|lar|lı|la|sı|ya\\b|yı\\b|da\\b|dan\\b|nın\\b)'] },
  { id: 'chemotherapy', en: /chemotherap/, tr: ['kemoterapi'], group: 'therapy' },
  { id: 'radiotherapy', en: /radiotherap|radiation therap/, tr: ['radyoterapi', 'ışın tedavisi', 'radyasyon tedavisi'], group: 'therapy' },
  { id: 'immunotherapy', en: /immunotherap/, tr: ['immünoterapi', 'immunoterapi', 'bağışıklık tedavisi'], group: 'therapy' },
  { id: 'gene_therapy', en: /gene therap/, tr: ['gen tedavi', 'gen terapi'], group: 'therapy' },
  { id: 'antibiotic', en: /antibiotic/, tr: ['antibiyotik'] },
  { id: 'insulin', en: /\binsulin/, tr: ['insülin', 'insulin'] },
  { id: 'statin', en: /\bstatins?\b/, tr: ['statin'] },
  { id: 'opioid', en: /\bopioid/, tr: ['opioid', 'opiyoid'] },
  { id: 'stent', en: /\bstents?\b/, tr: ['stent'] },
  { id: 'balloon', en: /\bballoons?\b/, tr: ['balon'] },
  { id: 'catheter', en: /catheter/, tr: ['kateter'] },
  { id: 'pacemaker', en: /pacemaker/, tr: ['kalp pili', 'pacemaker'] },
  { id: 'dialysis', en: /dialysis/, tr: ['diyaliz'] },
  { id: 'bariatric', en: /bariatric/, tr: ['bariatrik', 'obezite cerrahisi'] },
  { id: 'endoscopy', en: /\bendoscop/, tr: ['endoskop'], group: 'scopy' },
  { id: 'colonoscopy', en: /colonoscop/, tr: ['kolonoskop'], group: 'scopy' },
  { id: 'biopsy', en: /biops(y|ies)/, tr: ['biyopsi'] },
  { id: 'mastectomy', en: /mastectom/, tr: ['mastektomi'] },
  { id: 'transplant', en: /transplant/, tr: ['nakil', 'nakl', 'transplant'] },
  { id: 'exome', en: /\bexome/, tr: ['ekzom'], group: 'sequencing' },
  { id: 'genome', en: /\bgenom(e|es|ic)\b/, tr: ['genom'], group: 'sequencing' },
  { id: 'cannabidiol', en: /cannabidiol|\bcbd\b/, tr: ['kannabidiol', 'cannabidiol', 'cbd'] },
];

/** Accepted Turkish equivalents of acronyms (same entity). Any other acronym must survive verbatim (evidence.ts). */
export const ACRONYM_EQUIVALENTS: Record<string, string[]> = {
  CT: ['BT', 'bilgisayarlı tomografi'],
  MRI: ['MR', 'MRG', 'manyetik rezonans'],
  AI: ['YZ', 'yapay zeka', 'yapay zekâ'],
  WHO: ['DSÖ', 'Dünya Sağlık Örgütü'],
  EU: ['AB', 'Avrupa Birliği'],
  UN: ['BM', 'Birleşmiş Milletler'],
  US: ['ABD'],
  USA: ['ABD'],
  UK: ['Birleşik Krallık', 'İngiltere'],
  ICU: ['YBÜ', 'yoğun bakım'],
  AFIB: ['AF', 'atriyal fibrilasyon'],
  COPD: ['KOAH'],
  HHS: ['Sağlık ve İnsan Hizmetleri Bakanlığı'],
};

const trLower = (s: string) => (s || '').toLocaleLowerCase('tr-TR');
const WORD_START = '(?<![a-zçğıöşüâîû0-9])';
// JS `\b` treats Turkish letters as non-word characters, so `\b` in a Turkish pattern means this instead.
const WORD_END = '(?![a-zçğıöşüâîû0-9])';
const compiled = new Map<string, RegExp>();
function trRe(p: string): RegExp {
  let re = compiled.get(p);
  if (!re) {
    re = new RegExp(WORD_START + p.replace(/\\b/g, WORD_END), 'u');
    compiled.set(p, re);
  }
  return re;
}
const hasAny = (text: string, pats: string[] | undefined) => !!pats && pats.some((p) => trRe(p).test(text));

export interface TermMatch {
  id: string;
  judgement: EntityJudgement;
  detail: 'rendered' | 'narrower' | 'sibling' | 'missing' | 'introduced';
}

export interface TerminologyResult {
  verdict: EntityJudgement;
  matches: TermMatch[];
  /** Machine reasons for every unsupported substitution, e.g. ENTITY_SUBSTITUTION:tomosynthesis->tomography. */
  issues: string[];
}

// ---- INN (generic drug name) stem check ------------------------------------------------------------------------------
const INN = /\b[a-z]{3,}(?:mab|nib|limus|glutide|tide|statin|pril|sartan|olol|prazole|azole|cillin|mycin|cycline|vir|parin|platin|taxel|rubicin|abine|semide|dronate|gliflozin|gliptin|zumab|ximab)\b/g;

/** English -> Turkish spelling normalisation for drug names (penicillin ~ penisilin, semaglutide ~ semaglutid). */
function translit(w: string): string {
  return trLower(w)
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/x/g, 'ks')
    .replace(/qu/g, 'kv')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/y/g, 'i')
    .replace(/(.)\1/g, '$1')
    .replace(/e$/, '');
}

export function drugNames(english: string): string[] {
  return [...new Set((english || '').toLowerCase().match(INN) || [])];
}

function drugIssues(source: string, target: string, mode: 'title' | 'summary'): string[] {
  const t = trLower(target)
    .split(/[^a-zçğıöşüâîû0-9]+/)
    .filter(Boolean)
    .map(translit)
    .join(' ');
  const issues: string[] = [];
  if (mode === 'title') for (const d of drugNames(source)) if (!t.includes(translit(d))) issues.push(`DRUG_MISSING:${d}`);
  return issues;
}

/**
 * @param source English text the Turkish text must be faithful to (title; or title + evidence for a summary).
 * @param target Turkish text.
 * @param mode   'title': every glossary entity and drug name of the source must be rendered.
 *               'summary': a summary may omit entities, but must not substitute or introduce one.
 */
export function checkTerminology(source: string, target: string, mode: 'title' | 'summary'): TerminologyResult {
  const s = (source || '').toLowerCase();
  const t = trLower(target);
  const inSource = new Set(TERMS.filter((x) => x.en.test(s)).map((x) => x.id));
  const matches: TermMatch[] = [];
  const issues: string[] = [];
  for (const term of TERMS) {
    const rendered = hasAny(t, term.tr);
    const narrower = !rendered && hasAny(t, term.narrower);
    if (inSource.has(term.id)) {
      if (rendered) matches.push({ id: term.id, judgement: 'same', detail: 'rendered' });
      else if (narrower) matches.push({ id: term.id, judgement: 'narrower_safe', detail: 'narrower' });
      else if (mode === 'title') {
        const sibling = TERMS.find((o) => o.group && o.group === term.group && o.id !== term.id && !inSource.has(o.id) && hasAny(t, o.tr));
        matches.push({ id: term.id, judgement: 'unsupported_substitution', detail: sibling ? 'sibling' : 'missing' });
        issues.push(sibling ? `ENTITY_SUBSTITUTION:${term.id}->${sibling.id}` : `ENTITY_NOT_RENDERED:${term.id}`);
      }
      continue;
    }
    if (rendered || narrower) {
      const original = TERMS.find((o) => o.group && o.group === term.group && inSource.has(o.id));
      matches.push({ id: term.id, judgement: 'unsupported_substitution', detail: original ? 'sibling' : 'introduced' });
      issues.push(original ? `ENTITY_SUBSTITUTION:${original.id}->${term.id}` : `ENTITY_INTRODUCED:${term.id}`);
    }
  }
  issues.push(...drugIssues(source, target, mode));
  return { verdict: issues.length ? 'unsupported_substitution' : matches.some((m) => m.judgement === 'narrower_safe') ? 'narrower_safe' : 'same', matches, issues: [...new Set(issues)] };
}

function displayForm(pattern: string): string {
  return pattern
    .replace(/\(\?[^)]*\)/g, '')
    .replace(/\\b/g, '')
    .replace(/\[ğk\]/g, 'ğ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/ \?-?\?? ?/g, ' ')
    .replace(/[?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mandatory renderings for the glossary entities of a source title (given to the translator, then enforced above). */
export function glossaryHints(source: string): string[] {
  const s = (source || '').toLowerCase();
  const hints: string[] = [];
  for (const term of TERMS) {
    const m = s.match(term.en);
    if (!m) continue;
    hints.push(`${m[0]} = ${displayForm(term.tr[0])}…`);
  }
  for (const [acr, eq] of Object.entries(ACRONYM_EQUIVALENTS)) {
    if (new RegExp(`\\b${acr}\\b`).test(source || '')) hints.push(`${acr} = ${acr} or ${eq[0]}`);
  }
  return hints.slice(0, 12);
}
