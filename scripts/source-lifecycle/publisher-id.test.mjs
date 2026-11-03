import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publisherIdFromHost } from './kaduse-change.mjs';

describe('publisherIdFromHost', () => {
  it('uses the registrable label, also under Turkish second-level suffixes', () => {
    assert.equal(publisherIdFromHost('www.cumhuriyet.com.tr'), 'cumhuriyet');
    assert.equal(publisherIdFromHost('www.titck.gov.tr'), 'titck');
    assert.equal(publisherIdFromHost('kurious.ku.edu.tr'), 'ku');
    assert.equal(publisherIdFromHost('www.indyturk.com'), 'indyturk');
    assert.equal(publisherIdFromHost('teyit.org'), 'teyit');
  });
});
