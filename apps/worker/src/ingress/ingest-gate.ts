/**
 * Central admission gate for Kaduse news/research items (dependency-free; used by upsertSourceItem).
 * A news record that cannot prove it is recent, real and on-topic is not news and is not stored.
 * News (user decision 2026-09-22): dated, not future, <= 10 days, no placeholder title. Research is intentionally NOT
 * age/undated-gated yet: a separate research method is being designed; only placeholder titles, future dates and the
 * GDELT relevance check apply. Publication dates are normalised to ISO (YYYY-MM-DD) when parseable.
 */

export const NEWS_MAX_AGE_DAYS = 10;

/** Listing pages whose newest-first list is current even though items carry no date (first-seen is used). */
const UNDATED_OK_FEEDS = new Set(['news-aa-saglik-scoped']);
/** General-news feeds that must prove health relevance in title/summary. */
const RELEVANCE_FEEDS = new Set(['research-gdelt-doc-api']);

const PLACEHOLDER = /\btitle pending\b|^\s*(untitled|no title|n\/a)\b/i;
const HEALTH =
  /sağlık|saglik|hasta|hekim|doktor|tıp\b|tıbbi|tibbi|ilaç|aşı|tedavi|kanser|kalp|cerrah|klinik|hastane|cihaz|ameliyat|enfeksiyon|salgın|virüs|diyabet|health|medic|clinic|patient|disease|cancer|drug|vaccin|surg|hospital|therap|diagnos|cardi|neuro|covid|infect|pharma|physician|nurs|dental|stethoscope|auscult|wellness|epidemi/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** ISO, RFC 822, "2026 Sep 7", "2026 Sep", "2026" -> "YYYY-MM-DD" (partial dates use day/month 1) or null. */
export function normalizeDate(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{1,2}))?/);
  if (m && MONTHS[m[2].toLowerCase()]) return valid(+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : 1);
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return valid(+m[1], +m[2], 1);
  m = s.match(/^(\d{4})$/);
  if (m) return valid(+m[1], 1, 1);
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface GateInput {
  route: string;
  feedId: string;
  title: string;
  titleOrig?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
}

export type GateVerdict = { ok: true; publishedAt: string | null } | { ok: false; reason: string };

export function ingestGate(input: GateInput, now: Date = new Date()): GateVerdict {
  if (input.route !== 'kaduse-news' && input.route !== 'kaduse-research') return { ok: true, publishedAt: input.publishedAt ?? null };
  const title = (input.title || '').trim();
  if (title.length < 12 || PLACEHOLDER.test(title)) return { ok: false, reason: 'placeholder_title' };
  const date = normalizeDate(input.publishedAt);
  const isNews = input.route === 'kaduse-news';
  if (!date) {
    if (isNews && !UNDATED_OK_FEEDS.has(input.feedId)) return { ok: false, reason: 'undated' };
  } else {
    // Whole calendar days (UTC), so an item dated exactly N days ago is N days old regardless of the hour.
    const ageDays = (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(date)) / 86_400_000;
    // News must not be ahead of today; research allows month-precision issue dates (e.g. "2026 Oct") up to ~3 months ahead.
    if (ageDays < (isNews ? -2 : -92)) return { ok: false, reason: 'future_date' };
    if (isNews && ageDays > NEWS_MAX_AGE_DAYS) return { ok: false, reason: 'stale' };
  }
  if (RELEVANCE_FEEDS.has(input.feedId) && !HEALTH.test(`${title} ${input.titleOrig ?? ''} ${input.summary ?? ''}`)) {
    return { ok: false, reason: 'off_topic' };
  }
  return { ok: true, publishedAt: date };
}
