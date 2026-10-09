// D source-type capabilities: only OFFICIAL_WEBSITE is vehicle-allowed;
// every other (and unknown) type is manual-only, fail-closed. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './sqlite-d1.test-helper.mjs';

const caps = await bundle('apps/worker/src/doctor-source-capabilities.ts', 'doctor-caps-d');

test('official website is the sole vehicle-allowed type with the verbatim parser', () => {
  assert.deepEqual(caps.vehicleAllowedTypes(), ['OFFICIAL_WEBSITE']);
  const web = caps.capabilityFor('OFFICIAL_WEBSITE');
  assert.equal(web.acquisition, 'rss');
  assert.equal(web.parser, 'verbatim-title-link-date-author-body-v1');
  assert.equal(web.vehicleAllowed, true);
});

test('social/video/academic types are manual-only with verification requirements', () => {
  for (const t of ['INSTAGRAM', 'YOUTUBE', 'PODCAST', 'NEWSLETTER', 'ORCID', 'UNIVERSITY_PROFILE', 'PROFESSIONAL_SOCIETY', 'LINKEDIN', 'X_TWITTER']) {
    const c = caps.capabilityFor(t);
    assert.equal(c.acquisition, 'manual-only', t);
    assert.equal(c.parser, null, t);
    assert.equal(c.vehicleAllowed, false, t);
  }
  assert.equal(caps.capabilityFor('INSTAGRAM').verification, 'platform-account-match');
  assert.equal(caps.capabilityFor('ORCID').verification, 'institutional-profile');
  assert.equal(caps.capabilityFor('LINKEDIN').updateStrategy, 'manual-revisit');
  assert.equal(caps.capabilityFor('OFFICIAL_WEBSITE').updateStrategy, 'feed-poll');
  assert.equal(caps.capabilityFor('OFFICIAL_WEBSITE').provenanceLevel, 'feed-bytes');
  assert.equal(caps.capabilityFor('ORCID').provenanceLevel, 'profile-page');
});

test('unknown types fail closed to manual-only', () => {
  const c = caps.capabilityFor('TIKTOK');
  assert.equal(c.acquisition, 'manual-only');
  assert.equal(c.vehicleAllowed, false);
});
