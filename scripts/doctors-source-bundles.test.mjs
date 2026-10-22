import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from './doctors-intake-plan.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const intake = read('../release/doctors/expert-intake-2026-10-20.json');
const bundles = read('../release/doctors/expert-source-bundles-2026-10-22.json');
const TYPES = ['OFFICIAL_WEBSITE', 'INSTITUTIONAL_PROFILE', 'UNIVERSITY_PROFILE', 'PROFESSIONAL_SOCIETY', 'ORCID', 'RESEARCHER_PROFILE', 'PODCAST', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'];

test('bundles cover exactly the 15 approved names, nobody from the proposed pool', () => {
  const a = intake.approved.map((p) => norm(p.canonicalName)).sort();
  assert.deepEqual(bundles.people.map((p) => norm(p.canonicalName)).sort(), a);
  const pool = new Set(intake.proposedPool.map((p) => norm(p.canonicalName)));
  assert.ok(bundles.people.every((p) => !pool.has(norm(p.canonicalName))));
});

test('every source is https, a known type, proposed and OFF; no duplicate URL', () => {
  const urls = new Set();
  for (const p of bundles.people) {
    for (const s of p.sources) {
      assert.match(s.url, /^https:\/\//);
      assert.ok(TYPES.includes(s.type), s.type);
      assert.equal(s.activation, 'OFF');
      assert.ok(s.disposition === 'PROPOSED' || s.disposition === 'MANUAL_INTAKE');
      assert.ok(!urls.has(s.url), 'duplicate ' + s.url);
      urls.add(s.url);
    }
  }
});

test('ORCID iDs are well formed and unique; unverified candidates are not recorded as sources', () => {
  const ids = [];
  for (const p of bundles.people) {
    for (const s of p.sources.filter((x) => x.type === 'ORCID')) {
      const id = s.url.replace('https://orcid.org/', '');
      assert.match(id, /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/);
      ids.push(id);
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('0000-0002-9795-0365'));
});

test('social sources stay manual intake and the owner-review flag is kept', () => {
  for (const p of bundles.people) {
    for (const s of p.sources.filter((x) => x.type === 'INSTAGRAM')) assert.equal(s.disposition, 'MANUAL_INTAKE');
  }
  assert.equal(bundles.people.find((p) => p.canonicalName === 'Satchin Panda').ownerReview, 'RECENT_NEWS_REPUTATION_AFFILIATION_CHANGE');
});
