import test from 'node:test';
import assert from 'node:assert/strict';
import { compileD4 } from './compile-admission.mjs';

test('D4 evidence maps the real source-lifecycle gates', () => {
  const evidence = compileD4(
    { uri: 'https://source.example', provenanceClass: 'PRIMARY' },
    {
      result: {
        outcome: 'CHANGE_PREPARED',
        gates: {
          IDENTITY: 'PASS',
          ACCESS: 'PASS',
          ENDPOINT: 'PASS',
          PARSER: 'PASS',
          CANARY: 'PASS',
        },
      },
    },
    '.logs/discovery-admission/candidate/source.json',
  );

  assert.equal(evidence.identityMatch, 'PASS');
  assert.equal(evidence.fetchDryRun, 'PASS');
  assert.equal(evidence.parseDryRun, 'PASS');
  assert.equal(evidence.accessTerms, 'ALLOWED');
  assert.equal(evidence.sourceItemShapeValid, true);
});

test('D4 evidence fails closed when access or parser gates fail', () => {
  const evidence = compileD4(
    { uri: 'https://source.example' },
    { result: { outcome: 'BLOCKED_ACCESS', gates: { IDENTITY: 'PASS', ACCESS: 'BLOCKED_ACCESS', ENDPOINT: 'PASS', PARSER: 'FAIL' } } },
    '.logs/discovery-admission/candidate/source.json',
  );

  assert.equal(evidence.fetchDryRun, 'FAIL');
  assert.equal(evidence.parseDryRun, 'FAIL');
  assert.equal(evidence.accessTerms, 'RESTRICTED');
  assert.equal(evidence.sourceItemShapeValid, false);
});
