import test from 'node:test';
import assert from 'node:assert/strict';
import { processIntent } from './onboarding-executor.mjs';

for (const outcome of ['ACTIVE', 'ALREADY_ACTIVE', 'READY', undefined]) test(`successful ${outcome ?? 'ok:true'} plan never authorizes source activation`, async () => {
  const commands = []; const posted = [];
  await processIntent('https://example.invalid', 'fixture-token', {
    intent_id: 'local-only', admission_package_version: 'v1', candidate: { admission_package_version: 'v1' },
    sources: [{ source_id: 'fixture', source_disposition: 'ACTIVATE', lifecycle_target: 'fixture', lifecycle_channel: 'test', d4_evidence_json: JSON.stringify({ observedAt: new Date().toISOString() }) }],
  }, {
    runLifecycle(command) { commands.push(command); return { exitCode: 0, result: { outcome, ok: true } }; },
    requestJson: async (_url, _token, path, body) => { posted.push({ path, body }); return {}; },
  });
  assert.deepEqual(commands, ['plan']);
  assert.equal(posted[0].body.outcome, 'MANUAL_INTAKE');
  assert.equal(posted[0].body.lifecycleResult.activation, 'SEPARATE_OWNER_AUTHORITY_REQUIRED');
});
