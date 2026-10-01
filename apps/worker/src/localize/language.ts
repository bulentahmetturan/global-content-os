/**
 * Language gate for the Turkish localization contract.
 * Turkish items are never translated; foreign / mixed items take the Turkish title + grounded summary path.
 * Pure, heuristic and deterministic (no model call). `unknown` is treated as foreign by the pipeline (fail closed:
 * an unrecognised text is never silently passed through as already Turkish).
 */
export type Language = 'tr' | 'foreign' | 'unknown';

const TR_LETTERS = /[ğüşıöçĞÜŞİÖÇ]/;

// Function words. Turkish list includes ASCII spellings, because feeds often strip diacritics (observed: AA headlines).
const TR_WORDS = new Set([
  've', 'ile', 'için', 'icin', 'bir', 'bu', 'şu', 'olan', 'olarak', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'gibi', 'daha', 'çok', 'cok',
  'en', 'ancak', 'ise', 'veya', 'ya', 'ama', 'fakat', 'oluyor', 'olan', 'oldu', 'etti', 'edildi', 'yapıldı', 'yapildi', 'sonra', 'önce', 'once',
  'hasta', 'hastalara', 'hastalar', 'hastane', 'hastanesi', 'merkezi', 'umut', 'kalp', 'kanser', 'tedavi', 'saglik', 'sağlık', 'haber', 'haberi',
  'yeni', 'ilk', 'son', 'üniversitesi', 'universitesi', 'bakanlığı', 'bakanligi', 'başvuru', 'basvuru', 'duyuru', 'duyurusu', 'öğrenci', 'ogrenci',
]);
const TR_SUFFIX = /(?:daki|deki|taki|teki|nın|nin|nun|nün|ların|lerin|ları|leri|larda|lerde|lara|lere|dır|dir|dur|dür|yor|ıyor|iyor|uyor|üyor|mış|miş|muş|müş|acak|ecek)$/i;

const EN_WORDS = new Set([
  'the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'at', 'from', 'by', 'is', 'are', 'was', 'were', 'as', 'an', 'it', 'its', 'that', 'this',
  'new', 'how', 'why', 'what', 'after', 'before', 'between', 'among', 'into', 'over', 'under', 'about', 'says', 'could', 'may', 'might', 'will',
  'study', 'patients', 'health', 'risk', 'tied', 'linked', 'cases', 'approval', 'approved', 'clears', 'wins', 'shares', 'help', 'protect',
]);

function words(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .split(/[^a-zğüşıöçâîû]+/i)
    .filter((w) => w.length > 1);
}

export function detectLanguage(text: string): Language {
  const t = (text || '').trim();
  const ws = words(t);
  if (ws.length < 3) return TR_LETTERS.test(t) ? 'tr' : 'unknown';
  let tr = 0;
  let en = 0;
  for (const w of ws) {
    if (TR_WORDS.has(w) || TR_SUFFIX.test(w)) tr++;
    if (EN_WORDS.has(w)) en++;
  }
  const trLetters = TR_LETTERS.test(t);
  if (trLetters && en < 3) return 'tr';
  if (tr >= 2 && tr > en) return 'tr';
  if (en >= 2 && en > tr) return 'foreign';
  if (trLetters) return en >= 2 ? 'foreign' : 'tr';
  if (tr > en) return 'tr';
  if (en > tr) return 'foreign';
  // No function-word signal either way: long Latin text with no Turkish letters is not claimed as Turkish.
  return ws.length >= 4 ? 'foreign' : 'unknown';
}

/** Title-first decision with the excerpt as a tie-breaker (a Turkish title with an English boilerplate excerpt stays Turkish). */
export function detectItemLanguage(title: string, excerpt: string): Language {
  const t = detectLanguage(title);
  if (t !== 'unknown') return t;
  return detectLanguage((excerpt || '').slice(0, 200));
}
