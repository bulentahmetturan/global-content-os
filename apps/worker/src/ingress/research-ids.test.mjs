import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { extractDoi, doiFromUrl, pmidFromUrl, originalStudyFromHtml } = await import('./research-ids.ts');

describe('research identifiers (Bible 10.2 / 13.6)', () => {
  it('extracts and normalises a DOI from text and URLs', () => {
    assert.equal(extractDoi('Published: DOI 10.1056/NEJMoa2501234.'), '10.1056/nejmoa2501234');
    assert.equal(extractDoi('https://www.nejm.org/doi/full/10.1056/NEJMoa2501234?query=x'), '10.1056/nejmoa2501234');
    assert.equal(extractDoi('https://doi.org/10.1001%2Fjama.2026.1234'), '10.1001/jama.2026.1234');
    assert.equal(extractDoi('no identifier here'), null);
    assert.equal(extractDoi(null), null);
  });
  it('derives a Springer Nature DOI from the article URL only', () => {
    assert.equal(doiFromUrl('https://www.nature.com/articles/s41591-026-03456-7'), '10.1038/s41591-026-03456-7');
    assert.equal(doiFromUrl('https://www.nature.com/articles/d41586-026-00123-4'), '10.1038/d41586-026-00123-4');
    assert.equal(doiFromUrl('https://www.nature.com/nature/volumes/1'), null);
    assert.equal(doiFromUrl('https://www.statnews.com/2026/11/01/some-story/'), null);
  });
  it('reads a PMID from a PubMed URL', () => {
    assert.equal(pmidFromUrl('https://pubmed.ncbi.nlm.nih.gov/40123456/'), '40123456');
    assert.equal(pmidFromUrl('https://example.org/40123456'), null);
  });
  it('finds the original study on a press page, preferring publisher meta tags', () => {
    const meta = '<meta name="citation_doi" content="10.1016/S0140-6736(26)01234-5">';
    assert.deepEqual(originalStudyFromHtml(meta), { doi: '10.1016/s0140-6736(26)01234-5', link: 'https://doi.org/10.1016/s0140-6736(26)01234-5' });
    const press = '<p>Journal information: <a href="https://doi.org/10.1038/s41591-026-03456-7">DOI</a></p>';
    assert.equal(originalStudyFromHtml(press).doi, '10.1038/s41591-026-03456-7');
    const labelled = '<p>DOI: 10.1136/bmj-2026-123456</p>';
    assert.equal(originalStudyFromHtml(labelled).doi, '10.1136/bmj-2026-123456');
    assert.deepEqual(originalStudyFromHtml('<p>A researcher said the effect was large.</p>'), { doi: null, link: null });
    assert.equal(originalStudyFromHtml('<a href="https://pubmed.ncbi.nlm.nih.gov/40123456/">PubMed</a>').link, 'https://pubmed.ncbi.nlm.nih.gov/40123456/');
  });
});
