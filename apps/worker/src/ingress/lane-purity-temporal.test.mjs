import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bundle } from '../sqlite-d1.test-helper.mjs';
const reg = await bundle('apps/worker/src/temporal/registry.ts', 'lane-purity-registry');

describe('Keşif/evergreen-only sources are not read by the Haber (time-sensitive) generic ingest', () => {
  it('owner-decided evergreen-only feeds report time_sensitive off', () => {
    for (const id of ['news-sarkac-saglik-whole', 'news-tubitak-bilimteknik-saglik-whole', 'news-bilimgenc-tubitak-saglik-whole']) {
      assert.equal(reg.timeSensitiveEnabledForFeed(id), false, id);
    }
  });
  it('rotation exclusion list: evergreen-only feeds are listed so they cannot starve the one-feed-per-tick cron slot (2026-11-04)', () => {
    const off = reg.timeSensitiveDisabledFeedIds();
    for (const id of ['news-sarkac-saglik-whole', 'news-tubitak-bilimteknik-saglik-whole', 'news-bilimgenc-tubitak-saglik-whole']) assert.ok(off.includes(id), id);
    assert.ok(!off.includes('news-teyit-saglik-whole'));
  });
  it('Haber feeds without an evergreen-only entry keep the time-sensitive path', () => {
    for (const id of ['news-teyit-saglik-whole', 'news-dogrulukpayi-saglik-whole', 'news-who-newsroom-whole']) {
      assert.equal(reg.timeSensitiveEnabledForFeed(id), true, id);
    }
  });
});
