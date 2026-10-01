// Temporal V2 Group 0: the deadline-bearing marking and the Group 0 cadence invariants (no expiry engine here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProjections } from './source-lifecycle/catalog.mjs';
import { LADDER, LANE_POLICY } from './source-lifecycle/cadence.mjs';

const root = process.cwd();
const profile = JSON.parse(readFileSync('adapters/tip-toplulugu-radar/content/policies/tip-toplulugu-temporal-profile.json', 'utf8'));
const projections = loadProjections(root);
const byId = new Map();
for (const p of projections) if (!byId.has(p.source_id)) byId.set(p.source_id, p);

test('every marked source exists in a canonical store and carries a valid class', () => {
  for (const s of profile.sources) {
    assert.ok(byId.has(s.source_id), `unknown source ${s.source_id}`);
    assert.equal(s.deadline_bearing, true);
    assert.ok(['HIGH', 'MEDIUM'].includes(s.expiry_sensitivity), s.source_id);
    assert.ok(['RECORD_EVIDENCE', 'ROLE_INFERRED'].includes(s.evidence_tier), s.source_id);
    assert.ok(s.basis && s.basis.length > 10, s.source_id);
  }
  assert.equal(new Set(profile.sources.map((s) => s.source_id)).size, profile.sources.length, 'no duplicates');
});

test('no cadence value is stored in the profile (single canonical field)', () => {
  assert.equal(JSON.stringify(profile.sources).includes('expected_check_interval'), false);
});

test('active Tıp Topluluğu cadences stay on the ladder and inside the lane maximum', () => {
  const pol = LANE_POLICY.tip_toplulugu;
  const tooSlow = [];
  for (const p of projections) {
    if (p.store !== 'tip_toplulugu' || !p.active) continue;
    assert.ok(LADDER.includes(p.cadence_min), `${p.source_id}: ${p.cadence_min} not on the ladder`);
    if (p.cadence_min > pol.max) tooSlow.push(`${p.source_id}:${p.cadence_min}`);
  }
  // Login-walled / robots-disallowed / unreachable sources could not be evaluated in Group 0 and keep their old value (reported, not hidden).
  // abroad_es_mir_fse: target 2880 is blocked because source-registry-abroad-career-v1.json is not byte-stable (REQUIRES_MANUAL_EDIT); owner edit pending.
  const UNEVALUATED = new Set(['abroad_au_medical_board', 'abroad_au_ahpra', 'klimık_infectious_diseases', 't24_saglik', 'ttb_national', 'abroad_es_mir_fse']);
  assert.deepEqual(tooSlow.filter((s) => !UNEVALUATED.has(s.split(':')[0])), []);
});

test('Resmî Gazete is checked daily (published every day): cadence <= 1440 in every registry layer', () => {
  const layers = projections.filter((p) => p.source_id === 'resmi_gazete_medical_regulation');
  assert.ok(layers.length >= 1);
  for (const l of layers) assert.ok(l.cadence_min <= 1440, `${l.file}: ${l.cadence_min}`);
});
