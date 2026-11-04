/**
 * Bible 10.2 / 13.6: work identifiers and the original-study link for Research items that arrive from publisher web/RSS
 * and press feeds. Pure and dependency-free: nothing here fetches; callers pass the URL, title, summary or article HTML.
 */

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>?#]+)/i;
const TRAILING = /[.,;:)\]}]+$/;

/** First DOI found in free text or a URL (decoded), lower-cased and stripped of trailing punctuation; null when none. */
export function extractDoi(text: string | null | undefined): string | null {
  if (!text) return null;
  let t = text;
  try {
    t = decodeURIComponent(text);
  } catch {
    /* keep raw */
  }
  const m = t.match(DOI_RE);
  return m ? m[1].replace(TRAILING, '').toLowerCase() : null;
}

/**
 * DOI recoverable from the article URL alone: any URL embedding "10.xxxx/...", and nature.com/articles/<id>
 * (Springer Nature DOIs are 10.1038/<id>). Everything else is null (no guessing).
 */
export function doiFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const direct = extractDoi(url);
  if (direct) return direct;
  const nature = url.match(/^https?:\/\/(?:www\.)?nature\.com\/articles\/(s\d{5}-\d{3}-\d{4,6}-[0-9a-z]|d\d{5}-\d{3}-\d{5}-\d)(?:[/?#]|$)/i);
  return nature ? `10.1038/${nature[1].toLowerCase()}` : null;
}

/** PMID from a PubMed URL ("pubmed.ncbi.nlm.nih.gov/12345678/"), else null. */
export function pmidFromUrl(url: string | null | undefined): string | null {
  const m = (url ?? '').match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']+)["']/i);
  return c ? c[1] : null;
}

export type OriginalStudy = { doi: string | null; link: string | null };

/**
 * Original-study reference from an article or press page (Bible 13.6): publisher meta tags first
 * (citation_doi, dc.identifier), then an explicit "DOI:" / "Journal reference" statement, then a doi.org or PubMed link.
 * `link` is the DOI URL when a DOI is known, else a PubMed link; null when the page names no original study.
 */
export function originalStudyFromHtml(html: string | null | undefined): OriginalStudy {
  const h = html ?? '';
  if (!h) return { doi: null, link: null };
  const fromMeta = extractDoi(metaContent(h, 'citation_doi')) || extractDoi(metaContent(h, 'dc.identifier')) || extractDoi(metaContent(h, 'DC.Identifier'));
  const labelled = h.match(/(?:\bDOI\b|Journal reference|Journal information)[^<]{0,40}(?:<[^>]+>\s*){0,3}[^<]{0,40}?(10\.\d{4,9}\/[^\s"'<>]+)/i);
  const anchor = h.match(/href=["']https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^"'<>\s]+)["']/i);
  const doi = fromMeta || (labelled ? extractDoi(labelled[1]) : null) || (anchor ? extractDoi(anchor[1]) : null);
  if (doi) return { doi, link: `https://doi.org/${doi}` };
  const pm = h.match(/href=["'](https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d{1,9}\/?)["']/i);
  return { doi: null, link: pm ? pm[1] : null };
}
