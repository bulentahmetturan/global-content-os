// Phase 6 parser acceptance: the verbatim contract holds against the real
// capture (trimmed fixture), with zero generated/summarized text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './sqlite-d1.test-helper.mjs';
import { CAPTURED_CHANNEL_HEAD, CAPTURED_ITEMS } from './__fixtures__/doctor-feed.mjs';

const parser = await bundle('apps/worker/src/doctor-parser.ts', 'doctor-parser-phase6');

const FEED_XML = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">${CAPTURED_CHANNEL_HEAD}${CAPTURED_ITEMS.join('')}</rss>`;

test('parser extracts the real capture verbatim', () => {
  const parsed = parser.parseDoctorFeed(FEED_XML);
  assert.equal(parsed.itemCount, 2);
  assert.equal(parsed.channelTitle, 'Blog – Ahmet Ekmekci');
  const [first] = parsed.items;
  assert.ok(first.title.includes('Kuruyemiş'));
  assert.equal(first.link, 'https://www.drahmetekmekci.com/en-saglikli-kuruyemis-hangisi-ceviz-mi-badem-mi-antep-fistigi-mi/');
  assert.equal(first.publishedAt, 'Mon, 28 Sep 2026 20:11:48 +0000');
  assert.equal(first.author, 'admin');
  assert.ok(first.categories.includes('Kardiyoloji'));
  assert.ok(first.excerpt.startsWith('Kuruyemişler'));
  assert.ok(first.bodyHtml.startsWith('<p'), 'bodyHtml is the verbatim content:encoded');
  assert.equal(first.guid, 'https://www.drahmetekmekci.com/?p=11385');
});

test('no field is summarized or generated: excerpt and body are raw source bytes', () => {
  const parsed = parser.parseDoctorFeed(FEED_XML);
  const first = parsed.items[0];
  // excerpt is the feed's own description, byte-equal after CDATA unwrap.
  const raw = CAPTURED_ITEMS[0];
  const descMatch = raw.match(/<description>([\s\S]*?)<\/description>/);
  const cdata = descMatch[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  assert.equal(first.excerpt, cdata[1].trim());
  // No added text anywhere in the record.
  assert.equal(first.categories.filter((c) => /özet|summary|generated|ai/i.test(c)).length, 0);
});

test('second real item parses independently', () => {
  const parsed = parser.parseDoctorFeed(FEED_XML);
  const second = parsed.items[1];
  assert.ok(second.title.length > 10);
  assert.notEqual(second.link, parsed.items[0].link);
  assert.ok(second.link.startsWith('https://www.drahmetekmekci.com/'));
});
