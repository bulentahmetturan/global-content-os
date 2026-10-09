// G fetch-target safety: unit matrix for the pure SSRF checker.
// No network, no DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './sqlite-d1.test-helper.mjs';

const safety = await bundle('apps/worker/src/fetch-safety.ts', 'fetch-safety-g');

const blocked = [
  'http://127.0.0.1/feed',
  'http://127.1/feed',
  'http://2130706433/feed', // 127.0.0.1 as a single integer
  'http://0x7f.0x0.0x0.0x1/feed', // hex quad
  'http://0177.0.0.1/feed', // octal quad
  'http://10.0.0.5/feed',
  'http://172.16.4.9/feed',
  'http://172.31.255.1/feed',
  'http://192.168.1.1/feed',
  'http://169.254.10.20/feed',
  'http://100.64.0.1/feed',
  'http://0.0.0.0/feed',
  'http://224.0.0.1/feed',
  'http://[::1]/feed',
  'http://[::]/feed',
  'http://[fe80::1]/feed',
  'http://[fc00::1]/feed',
  'http://[fd00::1]/feed',
  'http://[ff02::1]/feed',
  'http://localhost/feed',
  'http://LOCALHOST/feed',
  'http://foo.localhost/feed',
  'http://intranet/feed',
  'http://wiki.corp/feed',
  'http://printer.lan/feed',
  'http://nas.home/feed',
  'http://app.internal/feed',
  'http://feed.test/feed',
  'ftp://example.com/feed',
  'file:///etc/passwd',
  'not a url',
  '',
];
for (const url of blocked) {
  test(`blocks ${url || '(empty)'}`, () => {
    assert.equal(safety.checkFetchTarget(url).blocked, true, url);
  });
}

const allowed = [
  'https://www.drahmetekmekci.com/blog/feed/',
  'https://example.com/feed.xml',
  'http://feed.example.org:8080/rss',
  'https://8.8.8.8/feed', // public IP literal passes the range guard
  'https://1.1.1.1/rss.xml',
  'https://[2001:db8::1]/feed', // documentation range is not in the blocked set
];
for (const url of allowed) {
  test(`allows ${url}`, () => {
    assert.deepEqual(safety.checkFetchTarget(url), { blocked: false, reason: null });
  });
}

test('172.15/172.32 boundaries are public', () => {
  assert.equal(safety.checkFetchTarget('http://172.15.0.1/x').blocked, false);
  assert.equal(safety.checkFetchTarget('http://172.32.0.1/x').blocked, false);
  assert.equal(safety.checkFetchTarget('http://172.16.0.1/x').blocked, true);
  assert.equal(safety.checkFetchTarget('http://172.31.255.254/x').blocked, true);
});
