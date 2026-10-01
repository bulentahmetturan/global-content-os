/**
 * Publication-date recovery for HTML listing pages (dependency-free).
 *
 * The news ingest gate (ingest-gate.ts) only admits dated, recent items. An HTML listing scraped by
 * parseHtmlLinks() used to carry `publishedAt: null` for every entry, so every WEB_ONLY feed that is not
 * RSS/sitemap-backed extracted items and then lost all of them at the gate as `undated` (audit 2026-10-01).
 * This reads the date a listing prints next to each entry. It never invents one: no printed date -> null,
 * and the gate keeps rejecting the item exactly as before.
 */
const MONTHS: Record<string, number> = {
  // en
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  // fr
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
  // de
  januar: 1, februar: 2, märz: 3, maerz: 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
  // tr
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

const DAY_MONTH_YEAR = new RegExp(`(?<![\\d])(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(${MONTH_RE})\\.?,?\\s+(20\\d\\d)(?!\\d)`, 'i');
const MONTH_DAY_YEAR = new RegExp(`(?<![a-zçğıöşü])(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)(?!\\d)`, 'i');
const ISO_DATE = /(?<![\d-])(20\d\d)-(\d{2})-(\d{2})(?![\d])/;
const DOTTED_DATE = /(?<![\d.\/])(\d{1,2})[./](\d{1,2})[./](20\d\d)(?![\d])/;
const TIME_TAG = /<time\b[^>]*\bdatetime=["']([^"']+)["']/i;

function iso(y: number, m: number, d: number, now: Date): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  if (new Date(t).getUTCMonth() !== m - 1) return null; // 31 Feb etc.
  if (t > now.getTime() + 2 * 86_400_000) return null; // printed future dates are not publication dates
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Tag-stripped text with the same length as the HTML (tags/entities become spaces), so offsets stay raw offsets. */
function maskedText(fragment: string): string {
  const blank = (m: string) => ' '.repeat(m.length);
  return fragment
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<[^>]+>/g, blank)
    .replace(/&nbsp;|&#160;/g, blank);
}

/** First printed publication date inside an HTML fragment as { date: 'YYYY-MM-DD', at: index in fragment } or null. */
export function findPrintedDate(
  fragment: string,
  now: Date = new Date(),
  pick: 'first' | 'last' = 'first'
): { date: string; at: number; end: number } | null {
  const tags = [...fragment.matchAll(new RegExp(TIME_TAG.source, 'gi'))];
  const tag = pick === 'last' ? tags[tags.length - 1] : tags[0];
  if (tag) {
    const dt = tag[1].match(/^\s*(20\d\d)-(\d{1,2})-(\d{1,2})/);
    const ok = dt && iso(+dt[1], +dt[2], +dt[3], now);
    if (ok) return { date: ok, at: tag.index ?? 0, end: (tag.index ?? 0) + tag[0].length };
  }
  const text = maskedText(fragment);
  const found: Array<{ date: string; at: number; end: number }> = [];
  const scan = (re: RegExp, toDate: (m: RegExpMatchArray) => string | null) => {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
      const d = toDate(m);
      // A date inside a long run of prose is a date the text talks about (an event, a decision), not a dateline.
      const at = m.index ?? 0;
      const nodeStart = fragment.lastIndexOf('>', at) + 1;
      const nodeEnd = fragment.indexOf('<', at + m[0].length);
      if ((nodeEnd < 0 ? fragment.length : nodeEnd) - nodeStart > MAX_DATELINE_NODE) continue;
      if (d) found.push({ date: d, at: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  };
  scan(ISO_DATE, (m) => iso(+m[1], +m[2], +m[3], now));
  scan(DAY_MONTH_YEAR, (m) => iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1], now));
  scan(MONTH_DAY_YEAR, (m) => iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2], now));
  scan(DOTTED_DATE, (m) => {
    // Day-first (European / Turkish listings); month-first only when the first field cannot be a month.
    const a = +m[1];
    const b = +m[2];
    return a > 12 || b <= 12 ? iso(+m[3], b, a, now) : iso(+m[3], a, b, now);
  });
  if (!found.length) return null;
  found.sort((x, y) => x.at - y.at);
  return pick === 'last' ? found[found.length - 1] : found[0];
}

export interface ListingAnchor {
  /** Offset of `<a` in the page HTML. */
  start: number;
  /** Offset just after `</a>`. */
  end: number;
}

/** Longest text node (between two tags) that still counts as a dateline. */
const MAX_DATELINE_NODE = 160;
const MAX_GAP = 800;
const EDGE = 400;

/**
 * One date (or null) per listing entry. Priority: a date printed inside the entry's own anchor, then the date
 * printed between this entry and its neighbour. Whether a listing prints the date after or before the headline is
 * decided once per page from the gaps between consecutive entries (nearest-edge vote), so a date is never handed to
 * the neighbouring card.
 */
export function assignListingDates(html: string, anchors: ListingAnchor[], now: Date = new Date()): Array<string | null> {
  const n = anchors.length;
  const inner = anchors.map((a) => findPrintedDate(html.slice(a.start, a.end), now)?.date ?? null);
  const gaps: string[] = [];
  for (let i = 0; i < n - 1; i++) gaps.push(html.slice(anchors[i].end, anchors[i + 1].start));

  let after = 0;
  let before = 0;
  for (const g of gaps) {
    if (g.length > MAX_GAP) {
      // Long card body between two entries: only a date hugging one of the edges says which entry owns it.
      if (findPrintedDate(g.slice(0, EDGE), now)) after += 1;
      if (findPrintedDate(g.slice(-EDGE), now)) before += 1;
      continue;
    }
    const hit = findPrintedDate(g, now);
    if (!hit) continue;
    // Raw distance (tag markup included) to the entry before vs after: a card closes its own markup right after its date.
    if (hit.at < g.length - hit.end) after += 1;
    else before += 1;
  }
  const dateAfter = after >= before;

  return anchors.map((a, i) => {
    if (inner[i]) return inner[i];
    if (dateAfter) {
      const g = i < n - 1 ? gaps[i] : html.slice(a.end, a.end + EDGE);
      return findPrintedDate(g.length > MAX_GAP ? g.slice(0, EDGE) : g, now)?.date ?? null;
    }
    const g = i > 0 ? gaps[i - 1] : html.slice(Math.max(0, a.start - EDGE), a.start);
    return findPrintedDate(g.length > MAX_GAP ? g.slice(-EDGE) : g, now, 'last')?.date ?? null;
  });
}

const DATE_LABEL = /\b(publi[ée]e?|mis\s+[àa]\s+jour|published|updated|posted|ver[öo]ffentlicht|aktualisiert|yay[ıi]nlanma|g[üu]ncelleme)(\s+(le|on|am|tarihi))?\s*:?\s*$/i;

/**
 * Card-wrapping anchors put the printed date (and often a category) into the link text, e.g.
 * "PUBLIÉ LE 30/09/2026 <headline>" or "<headline> 24 September 2026 | Press Releases". Remove the date, its label and a
 * trailing "| Category" so the stored headline is only the headline. Returns the input when nothing would be left.
 */
export function stripPrintedDateFromTitle(title: string): string {
  let t = title;
  let removed = false;
  for (const re of [DAY_MONTH_YEAR, MONTH_DAY_YEAR, ISO_DATE, DOTTED_DATE]) {
    for (;;) {
      const m = t.match(re);
      if (!m || m.index === undefined) break;
      const label = t.slice(0, m.index).match(DATE_LABEL);
      const from = label ? m.index - label[0].length : m.index;
      t = `${t.slice(0, from)} ${t.slice(m.index + m[0].length)}`;
      removed = true;
    }
  }
  if (!removed) return title;
  t = t
    .replace(/\b(mis\s+[àa]\s+jour|updated|aktualisiert)(\s+(le|on|am))?\s*:?\s*/gi, ' ')
    .replace(/\s*[|·–-]\s*[\p{L} &]{1,40}$/u, '')
    .replace(/^[\s|·–:-]+|[\s|·–:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length >= 12 ? t : title;
}
