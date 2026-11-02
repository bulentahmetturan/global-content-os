/**
 * Elementor "loop-item" listing parser (dependency-free: the test imports it directly).
 *
 * Elementor sites (TÜBİTAK Bilim ve Teknik, owner interview 2026-11-03) print each post as a
 * `data-elementor-type="loop-item"` block: title `<h1 class="elementor-heading-title"><a href>`, a `<time>` date and a
 * `theme-post-excerpt` teaser. The generic link scanner drops the root-level slugs and reads SVG `<style>` text as titles, so this
 * reads the blocks themselves. It never invents a date: no `<time>` printed date -> null (the news gate then rejects as undated).
 */
const TR_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12,
};

/** "1 Kasım 2026" (or an ISO date) -> "2026-11-01"; null when absent, impossible or in the future. */
function printedDate(fragment: string, now: Date): string | null {
  const t = text(fragment);
  let y: number, mo: number, d: number;
  const iso = t.match(/(20\d\d)-(\d{2})-(\d{2})/);
  const tr = t.match(/(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(20\d\d)/i);
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (tr) [y, mo, d] = [Number(tr[3]), TR_MONTHS[tr[2].toLocaleLowerCase('tr')], Number(tr[1])];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || dt.getTime() > now.getTime() + 86400000) return null;
  return dt.toISOString().slice(0, 10);
}

export interface ElementorLoopItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

const text = (s: string): string =>
  s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parseElementorLoop(html: string, baseUrl: string, now: Date = new Date(), limit = 30): ElementorLoopItem[] {
  const marker = /<div\b[^>]*data-elementor-type=["']loop-item["'][^>]*>/gi;
  const starts = [...html.matchAll(marker)].map((m) => m.index as number);
  const items: ElementorLoopItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length && items.length < limit; i++) {
    const block = html.slice(starts[i], starts[i + 1] ?? starts[i] + 20000);
    const head = block.match(/<h[1-6]\b[^>]*elementor-heading-title[^>]*>\s*<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!head) continue;
    let url: string;
    try {
      url = new URL(head[1], baseUrl).toString().replace(/^http:/i, 'https:');
    } catch {
      continue;
    }
    const title = text(head[2]);
    if (title.length < 8 || seen.has(url)) continue;
    seen.add(url);
    const printed = printedDate(block.match(/<time\b[^>]*>[\s\S]*?<\/time>/i)?.[0] ?? '', now);
    const excerpt = text(block.match(/theme-post-excerpt[\s\S]*?elementor-widget-container">([\s\S]*?)<\/div>/i)?.[1] ?? '');
    items.push({ title, url, summary: excerpt || title, publishedAt: printed });
  }
  return items;
}
