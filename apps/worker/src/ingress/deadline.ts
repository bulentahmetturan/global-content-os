/**
 * Deadline extraction for Duyuru items (SPF-10: an announcement is actionable only while its deadline is open).
 * Pure and conservative: a date counts only when a deadline cue sits right next to it; no cue, no deadline (unknown beats guess, Bible 0.4).
 */
const MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, şubat: 2, mart: 3, nisan: 4, mayis: 5, mayıs: 5, haziran: 6, temmuz: 7, agustos: 8, ağustos: 8, eylul: 9, eylül: 9, ekim: 10, kasim: 11, kasım: 11, aralik: 12, aralık: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const CUE = /(son\s+ba[sş]vuru|ba[sş]vuru\s+son|son\s+tarih|son\s+g[uü]n|tarihine\s+kadar|tarihinde\s+sona|deadline|apply\s+by|applications?\s+close|closes?\s+on|due\s+(on|by)|until)/i;
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const TEXT_DATE = new RegExp(`(\\d{1,2})\\s+(${MONTH_NAMES})\\.?(?:\\s+(\\d{4}))?|(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi');
const NUM_DATE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/g;

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : null;
};

/** Latest cue-adjacent date in `text`, as YYYY-MM-DD. A year-less date is placed on the first occurrence on/after `published` (or this year). */
export function extractDeadline(text: string | null | undefined, publishedIso?: string | null): string | null {
  const s = (text ?? '').replace(/\s+/g, ' ');
  if (!s) return null;
  const base = publishedIso && /^\d{4}-\d{2}-\d{2}/.test(publishedIso) ? publishedIso.slice(0, 10) : null;
  const baseYear = base ? Number(base.slice(0, 4)) : new Date().getUTCFullYear();
  const found: string[] = [];
  const consider = (index: number, length: number, date: string | null) => {
    if (!date) return;
    const around = s.slice(Math.max(0, index - 45), index + length + 25);
    if (CUE.test(around)) found.push(date);
  };
  for (const m of s.matchAll(NUM_DATE)) consider(m.index ?? 0, m[0].length, iso(Number(m[3]), Number(m[2]), Number(m[1])));
  for (const m of s.matchAll(TEXT_DATE)) {
    const day = Number(m[1] ?? m[5]);
    const month = MONTHS[(m[2] ?? m[4]).toLowerCase()];
    const yearRaw = m[3] ?? m[6];
    let date = iso(yearRaw ? Number(yearRaw) : baseYear, month, day);
    if (date && !yearRaw && base && date < base) date = iso(baseYear + 1, month, day);
    consider(m.index ?? 0, m[0].length, date);
  }
  return found.length ? found.sort().at(-1)! : null;
}
