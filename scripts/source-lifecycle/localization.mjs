// Localization readiness gate for source add / reactivate (docs/SOURCE-LIFECYCLE.md, gate G8b).
// A readiness / diagnostic outcome, NOT a lifecycle state: it never adds a state to the canonical lifecycle and never retires a source.
//   source -> fetch -> parse -> (this gate) language -> Turkish title -> extractive evidence -> grounded summary -> audit -> class
// The measurements come from the production pipeline itself (Worker POST /api/localize/canary, operator-gated, no writes), so the
// canary exercises the same code, models and contract version that will run in production.

export const LOCALIZATION_CLASSES = ['LOCALIZATION_READY', 'LOCALIZATION_TITLE_ONLY', 'LOCALIZATION_INSUFFICIENT_EVIDENCE', 'LOCALIZATION_MODEL_UNSAFE', 'LOCALIZATION_NOT_REQUIRED'];
/** Classes that stop activation. Everything else is activatable (a missing summary is acceptable; a wrong one is not). */
export const BLOCKING = new Set(['LOCALIZATION_MODEL_UNSAFE', 'LOCALIZATION_CANARY_UNAVAILABLE']);
export const SAMPLE_SIZE = 8;

// ---- language gate (parity with apps/worker/src/localize/language.ts, checked by localization.test.mjs) ------------------
const TR_LETTERS = /[ğüşıöçĞÜŞİÖÇ]/;
const TR_WORDS = new Set(['ve', 'ile', 'için', 'icin', 'bir', 'bu', 'şu', 'olan', 'olarak', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'gibi', 'daha', 'çok', 'cok',
  'en', 'ancak', 'ise', 'veya', 'ya', 'ama', 'fakat', 'oluyor', 'oldu', 'etti', 'edildi', 'yapıldı', 'yapildi', 'sonra', 'önce', 'once',
  'hasta', 'hastalara', 'hastalar', 'hastane', 'hastanesi', 'merkezi', 'umut', 'kalp', 'kanser', 'tedavi', 'saglik', 'sağlık', 'haber', 'haberi',
  'yeni', 'ilk', 'son', 'üniversitesi', 'universitesi', 'bakanlığı', 'bakanligi', 'başvuru', 'basvuru', 'duyuru', 'duyurusu', 'öğrenci', 'ogrenci']);
const TR_SUFFIX = /(?:daki|deki|taki|teki|nın|nin|nun|nün|ların|lerin|ları|leri|larda|lerde|lara|lere|dır|dir|dur|dür|yor|ıyor|iyor|uyor|üyor|mış|miş|muş|müş|acak|ecek)$/i;
const EN_WORDS = new Set(['the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'at', 'from', 'by', 'is', 'are', 'was', 'were', 'as', 'an', 'it', 'its', 'that', 'this',
  'new', 'how', 'why', 'what', 'after', 'before', 'between', 'among', 'into', 'over', 'under', 'about', 'says', 'could', 'may', 'might', 'will',
  'study', 'patients', 'health', 'risk', 'tied', 'linked', 'cases', 'approval', 'approved', 'clears', 'wins', 'shares', 'help', 'protect']);

const wordsOf = (text) => String(text || '').toLowerCase().replace(/&#x?[0-9a-f]+;/gi, ' ').split(/[^a-zğüşıöçâîû]+/i).filter((w) => w.length > 1);

export function detectLanguage(text) {
  const t = String(text || '').trim();
  const ws = wordsOf(t);
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
  return ws.length >= 4 ? 'foreign' : 'unknown';
}

export function detectItemLanguage(title, excerpt) {
  const t = detectLanguage(title);
  return t !== 'unknown' ? t : detectLanguage(String(excerpt || '').slice(0, 200));
}

/** Sample of the source's candidate items that the lifecycle already parsed (title + feed summary when the transport has one). */
export function sampleFromItems(items, n = SAMPLE_SIZE) {
  return (items || [])
    .filter((i) => i && i.title)
    .slice(0, n)
    .map((i) => ({ title: i.title, excerpt: i.summary || '' }));
}

// ---- classification (pure) -------------------------------------------------------------------------------------------------
const AUDIT_FLAGS = ['english_leak', 'foreign_script', 'numeric_error', 'entity_error', 'garbled', 'unsupported_claim', 'subject_inversion', 'title_wrong'];

/**
 * @param {{ sample: {title:string, excerpt:string}[], results: any[] | null }} a
 * results[i] aligns with the FOREIGN items of the sample, in order (the Worker canary returns the pipeline outcome + audit).
 */
export function classifyLocalization({ sample, results }) {
  const langs = sample.map((s) => detectItemLanguage(s.title, s.excerpt));
  const foreign = sample.filter((_, i) => langs[i] !== 'tr');
  const m = { items_sampled: sample.length, turkish_items: langs.filter((l) => l === 'tr').length, foreign_items: foreign.length };
  const source_language = !foreign.length ? 'turkish' : foreign.length === sample.length ? 'foreign' : 'mixed';
  if (!sample.length) return { class: 'LOCALIZATION_CANARY_UNAVAILABLE', blocking: true, reason: 'NO_SAMPLE_ITEMS', source_language: 'unknown', measurements: m };
  if (!foreign.length) return { class: 'LOCALIZATION_NOT_REQUIRED', blocking: false, reason: 'SOURCE_IS_TURKISH', source_language, measurements: m };
  if (!Array.isArray(results) || results.length !== foreign.length) {
    return { class: 'LOCALIZATION_CANARY_UNAVAILABLE', blocking: true, reason: 'NO_CANARY_RESULTS', source_language, measurements: m };
  }
  // An audit that could not run is not a pass.
  if (results.some((r) => !r || r.outcome === 'NOT_REQUIRED' || (r.outcome !== 'FAILED' && (!r.audit || r.audit.error)))) {
    return { class: 'LOCALIZATION_CANARY_UNAVAILABLE', blocking: true, reason: 'AUDIT_INCOMPLETE', source_language, measurements: m };
  }
  const n = results.length;
  const count = (pred) => results.filter(pred).length;
  const flagged = (f) => count((r) => r.audit && r.audit[f] === true);
  const measurements = {
    ...m,
    title_success: count((r) => r.outcome !== 'FAILED' && !!r.titleTr),
    title_success_rate: count((r) => r.outcome !== 'FAILED' && !!r.titleTr) / n,
    evidence_available: count((r) => r.evidence?.sufficient === true),
    evidence_availability_rate: count((r) => r.evidence?.sufficient === true) / n,
    grounded_summaries: count((r) => r.outcome === 'READY'),
    grounded_summary_rate: count((r) => r.outcome === 'READY') / n,
    insufficient_evidence: count((r) => r.outcome === 'INSUFFICIENT_EVIDENCE'),
    insufficient_evidence_rate: count((r) => r.outcome === 'INSUFFICIENT_EVIDENCE') / n,
    english_or_foreign_leak: count((r) => r.audit && (r.audit.english_leak || r.audit.foreign_script)),
    unsupported_claim: flagged('unsupported_claim'),
    subject_inversion: flagged('subject_inversion'),
    numeric_or_entity_error: count((r) => r.audit && (r.audit.numeric_error || r.audit.entity_error)),
    garbled: flagged('garbled'),
    title_mistranslation: flagged('title_wrong'),
  };
  const unsafe = ['english_or_foreign_leak', 'unsupported_claim', 'subject_inversion', 'numeric_or_entity_error', 'garbled', 'title_mistranslation'].filter((k) => measurements[k] > 0);
  const base = { source_language, measurements, models: null, failures: results.filter((r) => r.failure).map((r) => r.failure).slice(0, 6) };
  if (unsafe.length) return { ...base, class: 'LOCALIZATION_MODEL_UNSAFE', blocking: true, reason: `UNSAFE_OUTPUT:${unsafe.join(',')}` };
  if (measurements.title_success_rate < 1) return { ...base, class: 'LOCALIZATION_MODEL_UNSAFE', blocking: true, reason: 'TITLE_NOT_LOCALIZED' };
  // Past this point every generated title/summary passed the audit: "grounded whenever generated". Missing summaries are acceptable.
  if (measurements.grounded_summary_rate >= 0.5) return { ...base, class: 'LOCALIZATION_READY', blocking: false, reason: null };
  if (measurements.insufficient_evidence_rate >= 0.5) return { ...base, class: 'LOCALIZATION_INSUFFICIENT_EVIDENCE', blocking: false, reason: 'EVIDENCE_MISSING_IN_SOURCE_EXCERPTS' };
  return { ...base, class: 'LOCALIZATION_TITLE_ONLY', blocking: false, reason: 'SUMMARIES_NOT_GROUNDED_OR_REJECTED' };
}

// ---- localizer (Worker canary endpoint) ----------------------------------------------------------------------------------------
/**
 * @param {{ url: string, token: string, fetchImpl?: typeof fetch }} o
 * @returns {{ canary(items: {title:string, excerpt:string}[]): Promise<{ results: any[], models?: any }> }}
 */
export function createWorkerLocalizer({ url, token, fetchImpl = fetch }) {
  return {
    async canary(items) {
      const res = await fetchImpl(`${String(url).replace(/\/$/, '')}/api/localize/canary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`LOCALIZER_HTTP_${res.status}`);
      const body = await res.json();
      return { results: body.results, models: body.models };
    },
  };
}

export function localizerFromEnv(env = process.env, fetchImpl = fetch) {
  const url = env.GCOS_LOCALIZE_CANARY_URL || env.GCOS_URL || 'https://global-content-os.channel-content-os-mcp.workers.dev';
  const token = env.HUB_OPERATOR_TOKEN;
  return token ? createWorkerLocalizer({ url, token, fetchImpl }) : null;
}

/**
 * Runs the localization readiness gate for one source sample.
 * Fail closed: a foreign / mixed source with no reachable canary is blocked (never silently activated).
 */
export async function localizationGate({ items, localizer }) {
  const sample = sampleFromItems(items);
  const langs = sample.map((s) => detectItemLanguage(s.title, s.excerpt));
  const foreign = sample.filter((_, i) => langs[i] !== 'tr');
  if (!sample.length || !foreign.length) return classifyLocalization({ sample, results: [] });
  if (!localizer) return { ...classifyLocalization({ sample, results: null }), reason: 'LOCALIZER_NOT_CONFIGURED' };
  try {
    const { results, models } = await localizer.canary(foreign);
    const r = classifyLocalization({ sample, results });
    return { ...r, models: models || null };
  } catch (e) {
    return { ...classifyLocalization({ sample, results: null }), reason: `LOCALIZER_ERROR:${String(e.message || e).slice(0, 80)}` };
  }
}

export function localizationNextStep(loc) {
  switch (loc.class) {
    case 'LOCALIZATION_MODEL_UNSAFE':
      return `Localization is not safe for this source (${loc.reason}). Review with the operator: prompt improvement, model change, source-specific extraction fix or evidence extractor fix; then re-run add (bounded canary). Nothing was activated.`;
    case 'LOCALIZATION_CANARY_UNAVAILABLE':
      return `Localization canary could not run (${loc.reason}). Set HUB_OPERATOR_TOKEN (and GCOS_LOCALIZE_CANARY_URL if not production) and re-run; foreign-language sources are never activated without it.`;
    default:
      return null;
  }
}

export const AUDIT_FIELDS = AUDIT_FLAGS;
