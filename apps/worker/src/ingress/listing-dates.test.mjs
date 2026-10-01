import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
const { assignListingDates, findPrintedDate, stripPrintedDateFromTitle } = await import('./listing-dates.ts');

const NOW = new Date('2026-10-01T12:00:00Z');
const anchorsOf = (html) =>
  [...html.matchAll(/<a\s[^>]*>[\s\S]*?<\/a>/gi)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
const run = (html) => assignListingDates(html, anchorsOf(html), NOW);

describe('findPrintedDate', () => {
  it('reads <time datetime>, ISO, "D Month YYYY", "Month D, YYYY", dotted day-first and French/Turkish months', () => {
    assert.equal(findPrintedDate('<time datetime="2026-09-21T09:02:25+02:00">x</time>', NOW)?.date, '2026-09-21');
    assert.equal(findPrintedDate('<p>2026-09-20</p>', NOW)?.date, '2026-09-20');
    assert.equal(findPrintedDate('<p>24 September 2026 | Press Releases</p>', NOW)?.date, '2026-09-24');
    assert.equal(findPrintedDate('<p>Sep 30, 2026</p>', NOW)?.date, '2026-09-30');
    assert.equal(findPrintedDate('PUBLIÉ LE 30/09/2026', NOW)?.date, '2026-09-30');
    assert.equal(findPrintedDate('<span>30.09.2026</span>', NOW)?.date, '2026-09-30');
    assert.equal(findPrintedDate('3 octobre 2025', NOW)?.date, '2025-10-03');
    assert.equal(findPrintedDate('28 Eylül 2026', NOW)?.date, '2026-09-28');
  });
  it('never invents a date: no date, impossible date and future date give null', () => {
    assert.equal(findPrintedDate('<p>Read more about our work</p>', NOW), null);
    assert.equal(findPrintedDate('31 February 2026', NOW), null);
    assert.equal(findPrintedDate('12 December 2026', NOW), null);
    assert.equal(findPrintedDate('Call number 2026 and room 31', NOW), null);
  });
});

describe('assignListingDates', () => {
  it('date printed after the headline (card layout) goes to its own card, not the neighbour', () => {
    const html =
      '<article><a href="/a">First headline of the day</a><time datetime="2026-09-30">30 Sep 2026</time></article>' +
      '<article><a href="/b">Second headline of the day</a><time datetime="2026-09-25">25 Sep 2026</time></article>';
    assert.deepEqual(run(html), ['2026-09-30', '2026-09-25']);
  });
  it('date printed before the headline goes to the headline that follows it', () => {
    const html =
      '<li><span class="d">30/09/2026</span><a href="/a">First headline of the day</a></li>' +
      '<li><span class="d">25/09/2026</span><a href="/b">Second headline of the day</a></li>' +
      '<li><span class="d">20/09/2026</span><a href="/c">Third headline of the day</a></li>';
    assert.deepEqual(run(html), ['2026-09-30', '2026-09-25', '2026-09-20']);
  });
  it('date inside the link text wins (card-wrapping anchor)', () => {
    const html =
      '<a href="/a"><h4>First headline of the day</h4><p>24 September 2026 | Press Releases</p></a>' +
      '<a href="/b"><h4>Second headline of the day</h4><p>19 September 2026 | Statements</p></a>';
    assert.deepEqual(run(html), ['2026-09-24', '2026-09-19']);
  });
  it('card with a long body and a decoy date: the date next to the read-more button wins (before-mode, last date)', () => {
    const body = '<p>' + 'Akreditasyon kurulu kararı, 16 Temmuz 2026 tarihinde alındı ve ' + 'uzun açıklama '.repeat(60) + '</p>';
    const card = (title, date, href) =>
      `<div class="card"><img src="x.jpg"><div><h5>${title}</h5>${body}</div><div class="card-date"><a>${date}</a></div><a class="stretched-link" href="${href}">DEVAMINI OKU</a></div>`;
    const html = card('First card headline here', 'Eylül 4, 2026', '/a') + card('Second card headline here', 'Eylül 2, 2026', '/b');
    assert.deepEqual(run(html), ['2026-09-04', '2026-09-02']);
  });
  it('entries without any printed date stay undated (the gate keeps rejecting them)', () => {
    const html = '<nav><a href="/about">About the organisation and its work</a><a href="/jobs">Jobs and careers at the agency</a></nav>';
    assert.deepEqual(run(html), [null, null]);
  });
  it('a lone date after a long unrelated block is not attributed', () => {
    const filler = '<div>' + 'lorem ipsum '.repeat(120) + '</div>';
    const html = `<a href="/a">Lonely headline without a date</a>${filler}<p>30 September 2026</p>`;
    assert.deepEqual(run(html), [null]);
  });
});

describe('stripPrintedDateFromTitle', () => {
  it('removes the date, its label and a trailing category', () => {
    assert.equal(stripPrintedDateFromTitle('PUBLIÉ LE 30/09/2026 Tensions d’approvisionnement en Verkazia'), 'Tensions d’approvisionnement en Verkazia');
    assert.equal(stripPrintedDateFromTitle('G20+ mobilises funds for the Ebola response 24 September 2026 | Press Releases'), 'G20+ mobilises funds for the Ebola response');
  });
  it('leaves a title without a printed date untouched', () => {
    assert.equal(stripPrintedDateFromTitle('EMA Management Board: highlights of September meeting'), 'EMA Management Board: highlights of September meeting');
  });
});
