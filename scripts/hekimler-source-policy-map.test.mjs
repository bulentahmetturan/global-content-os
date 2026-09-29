// Validates the Hekimler Topluluğu Source Policy Map (canonical in global-content-os) against its schema (hand-rolled
// JSON Schema subset + $ref/$defs, same approach as product-image-geometry.test.mjs).
// Run: node --test scripts/hekimler-source-policy-map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function loadJson(relPath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relPath), 'utf-8'));
}

function resolveRef(schema, root) {
  if (schema && typeof schema === 'object' && typeof schema.$ref === 'string') {
    const key = schema.$ref.replace('#/$defs/', '');
    return root.$defs[key];
  }
  return schema;
}

function validate(schemaIn, value, root, pointer = '') {
  const schema = resolveRef(schemaIn, root);
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${pointer}: expected const ${JSON.stringify(schema.const)}`);
    return errors;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${pointer}: expected one of ${JSON.stringify(schema.enum)}`);
    return errors;
  }
  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object') && value && typeof value === 'object' && !Array.isArray(value))) {
    if (schema.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${pointer}: expected object`);
        return errors;
      }
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const req of schema.required ?? []) {
        if (!(req in value)) errors.push(`${pointer}: missing "${req}"`);
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(value)) {
          if (!allowed.has(key)) errors.push(`${pointer}: unexpected property "${key}"`);
        }
      }
      for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
        if (key in value) {
          errors.push(...validate(propSchema, value[key], root, `${pointer}.${key}`));
        }
      }
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${pointer}: expected array`);
      return errors;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${pointer}: minItems ${schema.minItems}`);
    }
    value.forEach((item, i) => {
      errors.push(...validate(schema.items, item, root, `${pointer}[${i}]`));
    });
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${pointer}: expected string`);
    else {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${pointer}: minLength`);
      }
      if (schema.pattern) {
        const re = new RegExp(schema.pattern);
        if (!re.test(value)) errors.push(`${pointer}: pattern ${schema.pattern}`);
      }
    }
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${pointer}: expected boolean`);
  }
  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) errors.push(`${pointer}: expected integer`);
  }
  if (Array.isArray(schema.type)) {
    // union — accept if any branch matches loosely for null|string used in decision schema
    const ok = schema.type.some((t) => {
      if (t === 'null') return value === null;
      if (t === 'string') return typeof value === 'string';
      if (t === 'object') return value && typeof value === 'object' && !Array.isArray(value);
      return false;
    });
    if (!ok) errors.push(`${pointer}: expected one of types ${JSON.stringify(schema.type)}`);
  }
  return errors;
}

const schema = loadJson('adapters/hekimler-radar/content/schemas/hekimler-source-policy-map.schema.json');
const decisionSchema = loadJson('adapters/hekimler-radar/content/schemas/hekimler-candidate-decision.schema.json');
// Canonical policy owner: global-content-os (Package 2). The only editable copy lives beside the runtime that consumes it.
const POLICY_REL = 'adapters/hekimler-radar/content/policies/hekimler-source-policy-map.json';
const policy = loadJson(POLICY_REL);

const REQUIRED_POLICY_IDS = [
  'osym',
  'yok-yokak',
  'tuk-official-gazette',
  'moh-public-health',
  'ttb-chambers-societies',
  'research-ai',
  'consumer-health-media',
  'faculty-and-curator',
  'congresses',
  'abroad-career-core',
  'abroad-gulf-watch',
  'trend-radar'
];

const ROUTES = new Set([
  'FEED',
  'PROFESSIONAL_BRIEF',
  'OPPORTUNITY',
  'CONGRESS_CALENDAR',
  'ABROAD_CAREER',
  'TREND_INBOX',
  'DISCARD'
]);

test('1. policy map validates against schema', () => {
  const errors = validate(schema, policy, schema);
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('2. channel and brand identity', () => {
  assert.equal(policy.channelId, 'tip-ogrencileri-platformu');
  assert.equal(policy.editorialBrand, 'Hekimler Topluluğu');
  assert.equal(policy.approvalStatus, 'USER_APPROVED');
});

test('3. all seven routes are declared', () => {
  const ids = policy.routes.map((r) => r.id).sort();
  assert.deepEqual([...ROUTES].sort(), ids);
});

test('4. every required source policy class exists', () => {
  const ids = new Set(policy.sourcePolicies.map((p) => p.id));
  for (const id of REQUIRED_POLICY_IDS) {
    assert.ok(ids.has(id), `missing source policy ${id}`);
  }
});

test('5. OSYM: medical-only, opportunity transform, virality must not reduce opportunity', () => {
  const osym = policy.sourcePolicies.find((p) => p.id === 'osym');
  assert.ok(osym.exclude_keywords.some((k) => /kpss/i.test(k)));
  assert.ok(osym.include_keywords.some((k) => /tus/i.test(k)));
  assert.ok(osym.allowed_routes.includes('OPPORTUNITY'));
  assert.ok(!osym.allowed_routes.includes('FEED'));
  assert.equal(osym.viralityMustNotReduceOpportunity, true);
  assert.ok(osym.required_transform.includes('impact_card'));
  assert.equal(osym.primary_url_required, true);
});

test('6. consumer health media is discovery_only and cannot FEED', () => {
  const c = policy.sourcePolicies.find((p) => p.id === 'consumer-health-media');
  assert.equal(c.discovery_only, true);
  assert.deepEqual(c.allowed_routes.sort(), ['DISCARD', 'TREND_INBOX'].sort());
});

test('7. research-ai blocks FEED for preprint/consumer without primary', () => {
  const r = policy.sourcePolicies.find((p) => p.id === 'research-ai');
  assert.ok(r.required_evidence.includes('study_design'));
  assert.ok(r.score_penalties.some((p) => /preprint/i.test(p.when)));
});

test('8. trend radar requires triple URL and forbids copying reference accounts', () => {
  const t = policy.sourcePolicies.find((p) => p.id === 'trend-radar');
  assert.ok(t.required_evidence.includes('signal_url'));
  assert.ok(t.required_evidence.includes('reference_url'));
  assert.ok(t.required_evidence.includes('primary_url_before_publish'));
  assert.ok(t.rules.some((rule) => /Never copy/i.test(rule)));
});

test('9. abroad core vs gulf watch-only', () => {
  const core = policy.sourcePolicies.find((p) => p.id === 'abroad-career-core');
  const gulf = policy.sourcePolicies.find((p) => p.id === 'abroad-gulf-watch');
  assert.ok(core.allowed_routes.includes('ABROAD_CAREER'));
  assert.equal(gulf.watch_only_v1, true);
  assert.ok(gulf.rules.some((r) => /watch-only/i.test(r)));
});

test('10. faculty/curator routes only to OPPORTUNITY or DISCARD', () => {
  const f = policy.sourcePolicies.find((p) => p.id === 'faculty-and-curator');
  for (const route of f.allowed_routes) {
    assert.ok(route === 'OPPORTUNITY' || route === 'DISCARD');
  }
  assert.equal(f.viralityMustNotReduceOpportunity, true);
});

test('11. every policy has required control fields', () => {
  for (const p of policy.sourcePolicies) {
    assert.ok(Array.isArray(p.include_keywords));
    assert.ok(Array.isArray(p.exclude_keywords));
    assert.ok(p.audience_segments.length >= 1);
    assert.ok(p.allowed_routes.length >= 1);
    assert.ok(p.required_evidence.length >= 1);
    assert.ok(p.required_transform.length >= 1);
    assert.equal(typeof p.primary_url_required, 'boolean');
    assert.ok(p.rules.length >= 1);
  }
});

test('12. sample candidate decision validates', () => {
  const sample = {
    schemaVersion: '1.0.0',
    candidateId: 'cand-osym-tus-example',
    channelId: 'tip-ogrencileri-platformu',
    sourcePolicyId: 'osym',
    sourcePolicyApplied: 'osym',
    route: 'OPPORTUNITY',
    routeReason: 'TUS schedule change with deadline; medical specialty exam',
    audienceSegments: ['medical_student', 'intern', 'resident'],
    evidenceStatus: 'verified',
    primaryUrl: 'https://www.osym.gov.tr/example',
    primaryUrlRequired: true,
    requiredTransform: ['impact_card', 'opportunity_card'],
    riskFlags: [],
    claimScope: 'national_fact',
    contentAngle: 'opportunity',
    viralSignal: 1,
    decidedAt: '2026-09-19T00:00:00.000Z'
  };
  const errors = validate(decisionSchema, sample, decisionSchema);
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('13. AI bounds forbid inventing evidence', () => {
  assert.ok(policy.aiBounds.mustNot.some((x) => /Invent/i.test(x)));
  assert.ok(policy.aiBounds.may.some((x) => /Classify/i.test(x)));
});

test('14. academic physicians are non-primary audience', () => {
  assert.ok(policy.audience.nonPrimary.includes('academic_physician'));
  assert.ok(!policy.audience.primary.includes('academic_physician'));
});
