/**
 * Immutable source references + content hashing + excerpt binding (Phase 3).
 *
 * Every parsed record must bind to:
 *   1. an immutable source reference — an existing source_items row, re-read
 *      server-side (id + canonical_url + publisher must all match; the row is
 *      never created by the engine, only referenced),
 *   2. a content hash (SHA-256 over the canonical payload), so re-ingest of
 *      identical content is a deterministic replay, not a duplicate,
 *   3. an excerpt that is a verifiable substring of the bound content
 *      (excerpt-to-source binding; unbound excerpts quarantine).
 *
 * Pure + read-only, except the D1 SELECT for reference verification. No fetch.
 */

import type { Env } from '../../db/queries';

export interface BoundSourceRef {
  sourceItemId: string;
  canonicalUrl: string;
  publisher: string;
  contentHash: string;
}

/** SHA-256 hex over UTF-8 text. Async (SubtleCrypto); deterministic. */
export async function hashContent(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a source_items row exists with exactly the expected locator fields.
 * Returns the bound reference; throws SOURCE_REF_UNKNOWN / SOURCE_REF_MISMATCH.
 */
export async function bindSourceRef(
  db: Env['DB'],
  input: { sourceItemId: string; canonicalUrl: string; publisher: string; contentText: string },
): Promise<BoundSourceRef> {
  const row = await db.prepare('SELECT id, canonical_url, publisher FROM source_items WHERE id = ?')
    .bind(input.sourceItemId).first<{ id: string; canonical_url: string; publisher: string }>();
  if (!row) throw new Error(`SOURCE_REF_UNKNOWN:${input.sourceItemId}`);
  if (row.canonical_url !== input.canonicalUrl || row.publisher !== input.publisher) {
    throw new Error(`SOURCE_REF_MISMATCH:${input.sourceItemId}`);
  }
  return {
    sourceItemId: row.id,
    canonicalUrl: row.canonical_url,
    publisher: row.publisher,
    contentHash: await hashContent(`${row.canonical_url}\n${row.publisher}\n${input.contentText}`),
  };
}

/** Excerpt must occur verbatim (whitespace-collapsed) in the bound content. */
export function assertExcerptBound(contentText: string, excerpt: string): void {
  const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const content = collapse(contentText);
  const needle = collapse(excerpt);
  if (!needle) throw new Error('EXCERPT_EMPTY');
  if (!content.includes(needle)) throw new Error('EXCERPT_UNBOUND:excerpt not found in source content');
}
