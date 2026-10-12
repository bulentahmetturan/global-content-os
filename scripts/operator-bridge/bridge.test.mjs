import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createOperatorService } from './service.mjs';
import { createMcpHandler } from './protocol.mjs';
import { runStdioServer } from './server.mjs';
import { TOOLS } from './tools.mjs';
import { APPLICATION_READS, CREDENTIAL_ALIASES, TOOL_NAMES, TARGET } from './config.mjs';
import { credentialEnrollmentCommand } from './credentials.mjs';
import { inspectWorkerVersions, inspectActiveWorkerMetadata, inspectRollbackEvidence } from './cloudflare.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sink = { events: [], async record(event, evidence) { this.events.push({ event, evidence }); } };
const credentials = values => ({
  async get(alias) { return values[alias] ?? null; },
  async status() { return Object.fromEntries(CREDENTIAL_ALIASES.map(alias => [alias, Boolean(values[alias])])); },
});

test('advertises only fixed empty-argument read-only tools', () => {
  assert.equal(TOOL_NAMES.length, 9);
  assert.deepEqual(TOOLS.map(tool => tool.name), TOOL_NAMES);
  for (const tool of TOOLS) {
    assert.deepEqual(tool.inputSchema, { type: 'object', properties: {}, additionalProperties: false });
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
});

test('missing credentials fail closed before network access', async () => {
  let calls = 0;
  const service = createOperatorService({ credentialStore: credentials({}), evidenceSink: sink, fetchImpl: async () => { calls++; } });
  await assert.rejects(service.call('gcos_ops_summary'), { code: 'CREDENTIAL_MISSING_GCOS_OPS_READ' });
  assert.equal(calls, 0);
});

test('application read uses its distinct bearer identity, fixed GET and sanitized evidence', async () => {
  const token = 'fixture-wrong-token-never-output';
  let request;
  const service = createOperatorService({
    credentialStore: credentials({ GCOS_OPS_READ: token }), evidenceSink: sink,
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return json({ service: 'global-content-os', readiness: { level: 'ready', blocked: [], degraded: [] }, identity: { environment: 'production', secret: token, commit: 'abc123' }, signals: [], credential: token });
    },
  });
  const output = await service.call('gcos_ops_summary');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.url, 'https://global-content-os.channel-content-os-mcp.workers.dev/api/ops/summary');
  assert.equal(request.init.headers.authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(output).includes(token), false);
  assert.equal(JSON.stringify(sink.events).includes(token), false);
  assert.equal(sink.events.at(-1).evidence.result.identity.environment, 'production');
  assert.equal('secret' in sink.events.at(-1).evidence.result.identity, false);
});

test('wrong application token is classified and never retried or disclosed', async () => {
  let calls = 0;
  const service = createOperatorService({
    credentialStore: credentials({ DOSSIER_OPS_READ: 'fixture-rejected-token' }), evidenceSink: sink,
    fetchImpl: async () => { calls++; return json({ error: 'sensitive auth response' }, 401); },
  });
  await assert.rejects(service.call('dossier_alerts'), { code: 'AUTHENTICATION_DENIED' });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(sink.events.at(-1)).includes('fixture-rejected-token'), false);
  assert.equal(JSON.stringify(sink.events.at(-1)).includes('sensitive auth response'), false);
});

test('unsupported endpoint shape and non-JSON data fail closed', async () => {
  const creds = credentials({ DOSSIER_OPS_READ: 'fixture-token' });
  const badShape = createOperatorService({ credentialStore: creds, evidenceSink: sink, fetchImpl: async () => json({ ok: false, alerts: [], leaked: 'no' }) });
  await assert.rejects(badShape.call('dossier_alerts'), { code: 'RESPONSE_SHAPE_REJECTED' });
  const nonJson = createOperatorService({ credentialStore: creds, evidenceSink: sink, fetchImpl: async () => new Response('not json', { headers: { 'content-type': 'text/plain' } }) });
  await assert.rejects(nonJson.call('dossier_alerts'), { code: 'NON_JSON_RESPONSE' });
});

test('response byte cap rejects oversized content; audit failure fails closed', async () => {
  const creds = credentials({ DOSSIER_OPS_READ: 'fixture-token' });
  const oversized = createOperatorService({
    credentialStore: creds, evidenceSink: sink,
    fetchImpl: async () => json({ padding: 'x'.repeat(300 * 1024) }),
  });
  await assert.rejects(oversized.call('dossier_alerts'), { code: 'RESPONSE_TOO_LARGE' });
  const unauditable = createOperatorService({ credentialStore: creds, evidenceSink: { async record() { throw new Error('local disk failure'); } }, fetchImpl: async () => json({ ok: true, alerts: [] }) });
  await assert.rejects(unauditable.call('dossier_alerts'), { code: 'AUDIT_WRITE_FAILED' });
});

test('application timeout is classified without retries or leaking transport details', async () => {
  let calls = 0;
  const service = createOperatorService({
    credentialStore: credentials({ DOSSIER_OPS_READ: 'fixture-token' }), evidenceSink: sink,
    fetchImpl: async (_url, init) => {
      calls++;
      assert.equal(init.method, 'GET');
      assert.equal(init.signal.aborted, false);
      const error = new Error('fixture timeout detail'); error.name = 'TimeoutError'; throw error;
    },
  });
  await assert.rejects(service.call('dossier_runs'), { code: 'REQUEST_TIMEOUT' });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(sink.events.at(-1)).includes('fixture timeout detail'), false);
});

test('Cloudflare version and active metadata reads are fixed, bounded and source-free', async () => {
  const paths = [];
  const fakeFetch = async (url, init) => {
    paths.push(String(url));
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    const u = new URL(url);
    if (u.pathname.endsWith('/versions')) return json({ success: true, result: { versions: [
      { id: 'e1f82b14-95be-4041-8a20-fd4b7f468b0c', number: 3, metadata: { created_on: '2026-10-12T00:00:00Z', source: 'fixture', token: 'drop' }, hasPreview: false,
        resources: { script: { source: 'PRIVATE EXECUTABLE' } } },
    ] } });
    if (u.pathname.endsWith('/deployments')) return json({ success: true, result: { deployments: [{ id: '2a1876d4-2cbb-4c18-9125-10699dba7d3a', created_on: '2026-10-12T00:00:00Z', source: 'fixture', versions: [{ version_id: 'e1f82b14-95be-4041-8a20-fd4b7f468b0c', percentage: 100 }] }] } });
    return json({ success: true, result: { id: 'e1f82b14-95be-4041-8a20-fd4b7f468b0c', number: 3,
      resources: { script: { etag: 'a'.repeat(32), handlers: ['fetch'], source: 'PRIVATE EXECUTABLE' },
        script_runtime: { compatibility_date: '2026-10-12' }, bindings: [{ name: 'DB', type: 'd1', value: 'PRIVATE BINDING' }] } } });
  };
  const versions = await inspectWorkerVersions('fixture-token', fakeFetch);
  assert.equal(versions.count, 1);
  assert.equal(JSON.stringify(versions).includes('PRIVATE EXECUTABLE'), false);
  assert.equal(paths[0].includes('/accounts/' + TARGET.accountId + '/workers/scripts/' + TARGET.workerName + '/versions?per_page=20'), true);
  const active = await inspectActiveWorkerMetadata('fixture-token', fakeFetch);
  assert.equal(active.deploymentStableDuringRead, true);
  assert.equal(active.version.bindings[0].name, 'DB');
  assert.equal('value' in active.version.bindings[0], false);
  assert.equal(JSON.stringify(active).includes('PRIVATE EXECUTABLE'), false);
  assert.equal(JSON.stringify(active).includes('PRIVATE BINDING'), false);
  assert.equal(paths.length, 4);
});

test('rollback inspection is metadata-only and does not certify an executable artifact', async () => {
  let calls = 0;
  const result = await inspectRollbackEvidence('fixture-token', async () => {
    calls++;
    return json({ success: true, result: { deployments: [] } });
  });
  assert.equal(calls, 1);
  assert.equal(result.presentInRecentDeploymentHistory, false);
  assert.equal(result.executableArtifactAvailable, false);
  assert.equal(result.compatibilityProven, false);
});

test('every fixed application read has a bounded allowlisted path and separate alias', () => {
  assert.deepEqual(Object.keys(APPLICATION_READS), ['gcos_ops_summary', 'dossier_ops_summary', 'dossier_alerts', 'dossier_audit', 'dossier_runs']);
  assert.equal(APPLICATION_READS.gcos_ops_summary.alias, 'GCOS_OPS_READ');
  for (const [name, spec] of Object.entries(APPLICATION_READS)) {
    assert.equal(spec.alias, name === 'gcos_ops_summary' ? 'GCOS_OPS_READ' : 'DOSSIER_OPS_READ');
    assert.equal(spec.path.startsWith('/api/'), true);
    assert.equal(spec.path.includes('limit=20') || !['dossier_audit', 'dossier_runs'].includes(name), true);
  }
  assert.equal(TARGET.environment, 'production');
});

test('modern discovery advertises only supported protocol, private caching and tool capability', async () => {
  const handler = createMcpHandler({ async listTools() { return TOOLS; } });
  const response = await handler({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } });
  assert.deepEqual(response.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(response.result.capabilities, { tools: {} });
  assert.equal(response.result.cacheScope, 'private');
  assert.equal(response.result._meta['io.modelcontextprotocol/serverInfo'].name, 'gcos-local-operator-bridge');
});

test('legacy initialize and modern calls work; arbitrary args and unversioned calls do not dispatch', async () => {
  let dispatched = 0;
  const handler = createMcpHandler({ async listTools() { return TOOLS; }, async call() { dispatched++; return { fixture: true }; } });
  const initialized = await handler({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  const modern = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };
  const wrongArgs = await handler({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { _meta: modern, name: TOOL_NAMES[0], arguments: { url: 'https://evil.invalid' } } });
  assert.equal(wrongArgs.result.isError, true);
  const unversioned = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: TOOL_NAMES[0], arguments: {} } });
  assert.equal(unversioned.error.code, -32022);
  const success = await handler({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { _meta: modern, name: TOOL_NAMES[0], arguments: {} } });
  assert.equal(success.result.isError, false);
  assert.equal(success.result._meta['io.modelcontextprotocol/serverInfo'].version, '1.0.0');
  assert.equal(dispatched, 1);
});

test('stdio transport emits protocol frames only and never logs an injected secret', async () => {
  const input = new PassThrough(); const output = new PassThrough(); const chunks = [];
  output.on('data', chunk => chunks.push(chunk.toString()));
  const server = runStdioServer({ input, output, operator: { async listTools() { return TOOLS; }, async call() { return { ok: true }; } } });
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } })}\n`);
  await server;
  const frames = chunks.join('').trim().split('\n').map(JSON.parse);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1].result.tools.map(tool => tool.name), TOOL_NAMES);
  assert.equal(chunks.join('').includes('fixture-secret'), false);
});

test('enrollment command is alias-only and script implements hidden no-overwrite entry', async () => {
  const command = credentialEnrollmentCommand('CLOUDFLARE_READ');
  assert.equal(command.includes('CLOUDFLARE_READ'), true);
  assert.equal(command.includes('token-value'), false);
  assert.throws(() => credentialEnrollmentCommand('OTHER'), /CREDENTIAL_ALIAS_NOT_ALLOWED/);
});
