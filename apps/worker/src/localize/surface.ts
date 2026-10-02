/**
 * Token-level surface checks for Turkish output (deterministic, no model):
 * - sourceCopyLeaks: ordinary English words copied from the source into the Turkish text (observed: "Persistent HIV…",
 *   "measles" left in a summary). A fixed English word list cannot cover these, and whole-string language detection
 *   misses one stray word.
 * - malformedTokens: clear generation corruption (observed: "Konsjenital", "etklerinden"). Not a spellchecker: only letter
 *   sequences Turkish orthography does not produce.
 * A token copied from the source is not a leak when it is a proper name, acronym, code, drug name or a word Turkish shares.
 */
import { drugNames } from './terminology';

// Words written the same in Turkish and English (medical and general); copying them is a correct translation.
const SHARED = new Set([
  'risk', 'riski', 'test', 'protein', 'plan', 'normal', 'global', 'total', 'stent', 'sepsis', 'lupus', 'herpes', 'influenza',
  'ebola', 'zika', 'mpox', 'covid', 'model', 'panel', 'final', 'trend', 'format', 'robot', 'oral', 'anal', 'dental', 'ideal',
  'minimal', 'optimal', 'internet', 'online', 'start', 'radar', 'insan', 'tablet', 'implant', 'transplant', 'gen', 'genom',
  'kolera', 'tetanoz', 'polio', 'demans', 'stres', 'travma', 'koma', 'vital', 'sinyal', 'serum', 'plazma', 'kist', 'tumor',
  'virus', 'bakteri', 'hormon', 'enzim', 'organ', 'doz', 'kanal', 'portal', 'pilot', 'faz', 'veto', 'agenda', 'data',
  'aspirin', 'metformin', 'ibuprofen', 'heparin', 'morfin', 'kodein', 'ketamin', 'melatonin', 'kolesterol', 'gene',
  'opioid', 'opioidler', 'ultra', 'form', 'norm', 'film', 'park', 'problem', 'program', 'metal', 'mental', 'moral', 'liberal',
  'yoga', 'alarm', 'vitamin', 'mineral', 'gluten', 'video', 'fatal', 'neonatal', 'prenatal', 'postnatal', 'perinatal',
  'renal', 'spinal', 'fetal', 'maternal', 'paternal', 'terminal', 'tremor', 'steroid', 'serotonin', 'adrenalin', 'heroin',
  'mega', 'mini', 'bonus', 'sonar', 'premium', 'kampus', 'status', 'atlas', 'menu', 'kilo', 'gram', 'litre', 'metre',
  'statin', 'statinler', 'bolus', 'pluripotent', 'multipotent', 'totipotent', 'triaj', 'insulin',
]);

// Latin binomial epithet ("C. difficile", "Staphylococcus aureus"): kept verbatim in Turkish.
function speciesEpithets(source: string): Set<string> {
  const out = new Set<string>();
  for (const m of (source || '').matchAll(/\b(?:[A-Z]\.|[A-Z][a-z]+(?:ium|us|oides|ella|coccus|bacter|monas|ia))\s+([a-z]{4,})\b/g)) out.add(m[1]);
  return out;
}

const LETTERS = 'A-Za-zÇĞİÖŞÜçğıöşüâîûÂÎÛ';
const WORD_RE = new RegExp(`[${LETTERS}]+`, 'g');
const ASCII_WORD_RE = /[A-Za-z]+/g;
const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
const enLower = (s: string) => s.toLowerCase();

// English morphology / orthography: a copied word with these is an ordinary English word, not a name.
const ENGLISH_SHAPE = /(?:tion|sion|ness|ment|ship|ings?|ed|ly|ous|ive|ful|less|ity|ies|ents?|ants?|ence|ance|able|ible|ers?|ists?|ism|ize|ise|ates?|ical|cal)$|th|sh|ph|ck|wh|ee|oo|ea|ou|ay|ey|ow|aw|ew|[wqx]/i;

/** Source words that are names: capitalised mid-sentence in sentence-case text, or acronyms / codes. */
function properNames(reference: string): Set<string> {
  const names = new Set<string>();
  for (const sentence of (reference || '').split(/(?<=[.!?:])\s+/)) {
    const words = sentence.match(WORD_RE) || [];
    words.forEach((w, i) => {
      if (i > 0 && /^[A-ZÇĞİÖŞÜ]/.test(w)) names.add(enLower(w));
    });
  }
  return names;
}

/** Words of the reference that occur in lower case (ordinary words, whatever the title's capitalisation). */
function ordinaryWords(reference: string): Set<string> {
  const out = new Set<string>();
  for (const w of (reference || '').match(WORD_RE) || []) if (/^[a-z]/.test(w)) out.add(w);
  return out;
}

function isTitleCase(s: string): boolean {
  const words = (s || '').match(/[A-Za-z]{4,}/g) || [];
  return words.length >= 3 && words.filter((w) => /^[A-Z]/.test(w)).length / words.length >= 0.75;
}

/**
 * @param target    Turkish output.
 * @param source    the English text being translated (title, or title + evidence).
 * @param reference sentence-case English text about the same item (excerpt / evidence) used to tell names from ordinary words.
 */
export function sourceCopyLeaks(target: string, source: string, reference = ''): string[] {
  const srcWords = new Map<string, string>(); // lower -> as written
  for (const w of (source || '').match(WORD_RE) || []) if (w.length >= 4) srcWords.set(enLower(w), w);
  const names = properNames(`${reference} ${isTitleCase(source) ? '' : source}`);
  const ordinary = ordinaryWords(`${reference} ${source}`);
  const drugs = new Set(drugNames(source));
  const species = speciesEpithets(`${source} ${reference}`);
  const titleCase = isTitleCase(source);
  const out: string[] = [];
  // Roots only: what follows an apostrophe is a Turkish suffix ("framework'ini" -> "framework").
  const words = (target || '').split(/[\s"“”()[\]]+/).flatMap((p) => p.split(/[’'`]/)[0].match(WORD_RE) || []);
  // A run of capitalised non-acronym words is a proper-name-shaped span ("Health Canada"). Surface validation allows it;
  // source support is checked separately by grounding.
  const inNamePhrase = (i: number) => {
    const nameWord = (x: string) => /^[A-Z][a-z]+$/.test(x);
    return [[words[i - 1], words[i]], [words[i], words[i + 1]]].some(([a, b]) => a && b && nameWord(a) && nameWord(b));
  };
  words.forEach((w, i) => {
    if (!w || w.length < 4 || /^[A-ZÇĞİÖŞÜ0-9]+$/.test(w)) return; // acronyms / codes are preserved by design
    const lw = enLower(w);
    const asWritten = srcWords.get(lw);
    if (!asWritten || SHARED.has(trLower(w)) || drugs.has(lw) || species.has(lw) || inNamePhrase(i)) return;
    if (/[a-z][A-Z]/.test(asWritten)) return; // camelCase product / gene names (iPSC, mRNA-style)
    {
      if (ordinary.has(lw)) {
        out.push(lw);
        return;
      }
      if (names.has(lw)) return;
      // Not seen in sentence case: a Title Case word is judged by its English shape; otherwise its capital marks a name.
      if (titleCase ? ENGLISH_SHAPE.test(lw) : !/^[A-Z]/.test(asWritten)) out.push(lw);
    }
  });
  return [...new Set(out)];
}

/**
 * Foreign proper-name spans present in a Turkish output but absent from the source evidence.
 * Surface checks deliberately do not reject these; the grounding layer owns support for inserted names/entities.
 */
export function unsupportedProperNameSpans(target: string, sourceEvidence: string): string[] {
  const evidence = ` ${sourceEvidence || ''} `.toLowerCase();
  const out: string[] = [];
  for (const m of (target || '').matchAll(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g)) {
    const phrase = m[0].trim();
    const words = phrase.match(ASCII_WORD_RE) || [];
    if (words.length < 2 || words.some((w) => SHARED.has(trLower(w)))) continue;
    if (!evidence.includes(` ${phrase.toLowerCase()} `)) out.push(phrase);
  }
  return [...new Set(out)];
}

// ---- malformed Turkish -------------------------------------------------------------------------------------------
const VOWELS = 'aeıioöuüâîû';
const isVowel = (c: string) => VOWELS.includes(c);
// Consonant pairs Turkish orthography does not produce inside a word (not th / ph / sh / zs / dj: ithal, şüphe, ishal,
// hızsız, adjuvan are Turkish).
const BAD_PAIRS = /sj|tj|kj|pj|gh|kh|ck|wh|cz|tz/;
// Syllable onsets: native Turkish has one consonant; loanwords allow these clusters.
const ONSETS = new Set(['tr', 'kr', 'pr', 'br', 'gr', 'dr', 'fr', 'pl', 'kl', 'bl', 'fl', 'gl', 'sk', 'sp', 'st', 'sl', 'sm', 'sn', 'sf', 'ps', 'ks', 'pn', 'ts', 'str', 'spr', 'skr', 'spl', 'skl']);
// Word-final consonant clusters of Turkish and established loanwords (Türk, renk, film, test, akt, kompleks...).
const FINALS = new Set(['rk', 'rt', 'rp', 'rç', 'rs', 'rm', 'rf', 'rd', 'rb', 'rn', 'lk', 'lt', 'lp', 'lç', 'ls', 'lm', 'lf', 'nk', 'nt', 'nç', 'ns', 'nd', 'ng', 'mp', 'mb', 'st', 'şt', 'şk', 'sk', 'ft', 'ht', 'kt', 'ks', 'ps', 'vk', 'yt', 'yk', 'yf', 'yp', 'yn', 'yl', 'yr', 'ys', 'yz', 'yd', 'zm', 'sm', 'hl', 'hs', 'rj', 'rz', 'rv', 'ğl', 'ğr', 'ğm']);
// A coda consonant before a loanword onset cluster (elek.tr-ik, en.fl-amasyon, as.kl-eroz, ob.str-üksiyon).
const CODA_BEFORE_CLUSTER = new Set(['n', 'm', 'l', 'r', 's', 'ş', 'k', 'b', 'p']);

function runOk(run: string, position: 'start' | 'inner' | 'end'): boolean {
  if (run.length < 2) return true;
  if (position === 'start') return run.length === 1 || ONSETS.has(run);
  if (position === 'end') return run.length <= 2 ? FINALS.has(run) || run[0] === run[1] : false;
  if (run.length === 2) return true; // any coda + onset
  for (let i = 1; i < run.length; i++) {
    const coda = run.slice(0, i);
    const onset = run.slice(i);
    const codaOk = coda.length === 1 ? onset.length === 1 || CODA_BEFORE_CLUSTER.has(coda) : FINALS.has(coda) || coda[0] === coda[1];
    const onsetOk = onset.length === 1 || ONSETS.has(onset);
    if (codaOk && onsetOk) return true;
  }
  return false;
}

/** Words that look corrupted (clear generation errors). Words copied from the source and acronyms / names are exempt. */
export function malformedTokens(target: string, source = ''): string[] {
  const src = new Set(((source || '').match(WORD_RE) || []).map(enLower));
  const out: string[] = [];
  for (const part of (target || '').split(/[\s"“”()[\]/]+/)) {
    // The root only: after an apostrophe comes a suffix ("Üniversitesi'nden").
    for (const piece of part.split(/[’'`]/)[0].split('-')) {
      for (const w of piece.match(WORD_RE) || []) {
        if (w.length < 4 || /^[A-ZÇĞİÖŞÜ]+$/.test(w) || src.has(enLower(w))) continue;
        const lw = trLower(w);
        if (BAD_PAIRS.test(lw)) {
          out.push(lw);
          continue;
        }
        // A capitalised word may be a foreign name not in the source (Schmidt, Wegovy): only impossible pairs are judged.
        if (/^[A-ZÇĞİÖŞÜ]/.test(w)) continue;
        if (/[wqx]/.test(lw) || ![...lw].some(isVowel)) {
          out.push(lw);
          continue;
        }
        const runs = [...lw.matchAll(/[^aeıioöuüâîû]+/g)];
        const bad = runs.some((m) => !runOk(m[0], m.index === 0 ? 'start' : m.index! + m[0].length === lw.length ? 'end' : 'inner'));
        if (bad) out.push(lw);
      }
    }
  }
  return [...new Set(out)];
}

/** Hyphenated hybrids: an English source word glued to Turkish ("sirolimus-elüyerek", "Ultra-ispiyonlu"). */
export function hybridCompounds(target: string, source = '', reference = ''): string[] {
  const src = new Set((`${source} ${reference}`.match(WORD_RE) || []).map(enLower));
  const names = properNames(`${reference} ${isTitleCase(source) ? '' : source}`);
  const out: string[] = [];
  for (const m of (target || '').matchAll(new RegExp(`([${LETTERS}]{3,})-([${LETTERS}]{3,})`, 'g'))) {
    const [all, left, right] = m;
    if (/^(anti|covid|post|non|pre|sosyo|psiko|nöro|kardiyo)$/i.test(left) || /^[A-ZÇĞİÖŞÜ0-9]+$/.test(left) || names.has(enLower(left))) continue;
    if (src.has(enLower(left)) && !src.has(enLower(right))) out.push(trLower(all));
  }
  return out;
}

/** All surface findings for Turkish output, as machine reasons. */
export function surfaceIssues(target: string, source: string, reference = ''): string[] {
  return [
    ...sourceCopyLeaks(target, source, reference).map((w) => `ENGLISH_COPY:${w}`),
    ...malformedTokens(target, `${source} ${reference}`).map((w) => `MALFORMED:${w}`),
    ...hybridCompounds(target, source, reference).map((w) => `HYBRID:${w}`),
  ];
}
