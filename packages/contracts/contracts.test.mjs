// Invariant tests for the GCOS -> CCOS approved_brief contract (ADR-0004).
// Run: node --test packages/contracts/contracts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(path.join(here, 'approved-brief.schema.json'), 'utf8'));
const tsSource = readFileSync(path.join(here, 'src/index.ts'), 'utf8').replaceAll('\r\n', '\n');
const actionsSource = readFileSync(path.join(here, '../../apps/worker/src/triage/actions.ts'), 'utf8');
const fixtures = ['approved-brief.v1.json', 'approved-brief.v1.no-evidence.json'].map((f) =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', f), 'utf8'))
);

function interfaceKeys(name) {
  const m = tsSource.match(new RegExp(String.raw`export interface ${name} \{([\s\S]*?)\n\}`));
  assert.ok(m, `interface ${name} not found`);
  return [...m[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((x) => x[1]);
}

function check(value, sch, pointer = '$') {
  const errs = [];
  if (sch.const !== undefined && value !== sch.const) errs.push(`${pointer}: expected const ${sch.const}`);
  if (sch.enum && !sch.enum.includes(value)) errs.push(`${pointer}: not in enum`);
  if (sch.oneOf && !sch.oneOf.some((s) => check(value, s, pointer).length === 0)) errs.push(`${pointer}: no oneOf branch matches`);
  if (sch.type) {
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actual)) errs.push(`${pointer}: expected ${types}, got ${actual}`);
  }
  if (typeof value === 'string' && sch.minLength && value.length < sch.minLength) errs.push(`${pointer}: too short`);
  if (Array.isArray(value) && sch.items) value.forEach((v, i) => errs.push(...check(v, sch.items, `${pointer}[${i}]`)));
  if (value && typeof value === 'object' && !Array.isArray(value) && sch.properties) {
    for (const k of sch.required ?? []) if (!(k in value)) errs.push(`${pointer}.${k}: required`);
    for (const [k, v] of Object.entries(value)) {
      if (!sch.properties[k]) {
        if (sch.additionalProperties === false) errs.push(`${pointer}.${k}: unexpected`);
      } else errs.push(...check(v, sch.properties[k], `${pointer}.${k}`));
    }
  }
  return errs;
}

test('ApprovedBrief interface keys equal the JSON Schema properties', () => {
  assert.deepEqual(interfaceKeys('ApprovedBrief').sort(), Object.keys(schema.properties).sort());
});

test('every ApprovedBrief field is required by the schema (no silent optional fields)', () => {
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
});

test('schema contractVersion matches APPROVED_BRIEF_CONTRACT_VERSION', () => {
  const m = tsSource.match(/APPROVED_BRIEF_CONTRACT_VERSION = '([^']+)'/);
  assert.ok(m);
  assert.equal(schema.properties.contractVersion.const, m[1]);
  assert.ok(schema.$id.endsWith(`/${m[1]}`));
});

test('golden fixtures validate against the schema', () => {
  for (const f of fixtures) assert.deepEqual(check(f, schema), []);
});

test('schema rejects raw-feed style extras (no widening of the boundary)', () => {
  const bad = { ...fixtures[0], rawFeedItem: { any: 'thing' } };
  assert.ok(check(bad, schema).length > 0);
});

test('the worker does not redeclare the payload shape', () => {
  assert.doesNotMatch(actionsSource, /export interface ApprovedBriefPayload/);
  assert.match(actionsSource, /type ApprovedBriefPayload = ApprovedBrief/);
});

test('production status values are the five contract states', () => {
  const m = tsSource.match(/PRODUCTION_STATUS_VALUES = \[([^\]]+)\]/);
  assert.ok(m);
  assert.deepEqual(
    [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]),
    ['accepted', 'designing', 'ready', 'published', 'failed']
  );
});
