// The recurring operator CLI (scripts/dossier-ops-operator.mjs): explicit https base, read token for reads and write token for changes with NO fallback, never prints or
// URL-encodes a token, and drives the REAL handler end to end through the owner's activation sequence (capacity -> recurring on -> source state), nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundle } from '../sqlite-d1.test-helper.mjs';
import { recWorld, CT_ID, EU_ID } from './recurring-support.mjs';
import * as CLI from '../../../../scripts/dossier-ops-operator.mjs';

const OPS = await bundle('apps/worker/src/dossier-ops-routes.ts', 'cli-ops-routes');
const R = 'read-token-aaaaaaaaaaaaaaaa', W = 'write-token-bbbbbbbbbbbbbbbb', G = 'gcos-ops-token-cccccccccccc';
const ENV = { DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W };

const viaHandler = (w, seen) => async (url, init) => {
  const u = new URL(url);
  seen.push({ url, method: init.method, auth: init.headers.authorization });
  const res = await OPS.handleDossierOps(new Request(url, init), { DB: w.db, OPS_TOKEN: G, DOSSIER_OPS_READ_TOKEN: R, DOSSIER_OPS_WRITE_TOKEN: W, DOSSIER_RECURRING_ENABLED: 'true' }, u.pathname);
  return { status: res.status, text: () => res.text() };
};
const run = async (w, seen, cmd, x, y, a = {}) => {
  const req = CLI.buildRequest(cmd, x, y, a, ENV);
  return CLI.callOps({ base: 'https://worker.test', ...req, fetchImpl: viaHandler(w, seen) });
};

test('safety: explicit https base, tokens only from the environment, a missing token is an error (never a fallback), unknown commands are refused', async () => {
  await assert.rejects(() => CLI.callOps({ token: 't', tokenName: 'X', path: 'summary' }), /--base/);
  await assert.rejects(() => CLI.callOps({ base: 'http://worker.test', token: 't', tokenName: 'X', path: 'summary' }), /https/);
  await assert.rejects(() => CLI.callOps({ base: 'https://worker.test', tokenName: 'DOSSIER_OPS_READ_TOKEN', path: 'summary' }), /DOSSIER_OPS_READ_TOKEN is required/);
  const ok = await CLI.callOps({ base: 'http://localhost:8787', token: 't', tokenName: 'X', path: 'summary', fetchImpl: async () => ({ status: 200, text: async () => '{}' }) });
  assert.equal(ok.httpStatus, 200);
  assert.equal(CLI.buildRequest('nope', undefined, undefined, {}, ENV), null);
  // a read never uses the write token and a change never uses the read token or OPS_TOKEN; with only the other token present it fails instead of falling back
  assert.equal(CLI.buildRequest('summary', undefined, undefined, {}, { DOSSIER_OPS_WRITE_TOKEN: W }).token, undefined);
  assert.equal(CLI.buildRequest('recurring', 'on', undefined, { operator: 'o' }, { DOSSIER_OPS_READ_TOKEN: R, OPS_TOKEN: G }).token, undefined);
  assert.equal(CLI.buildRequest('summary', undefined, undefined, {}, ENV).token, R);
  assert.equal(CLI.buildRequest('recurring', 'on', undefined, { operator: 'o' }, ENV).token, W);
  assert.throws(() => CLI.buildRequest('recurring', 'on', undefined, {}, ENV), /--operator/);
  assert.throws(() => CLI.buildRequest('recurring', 'maybe', undefined, { operator: 'o' }, ENV), /on\|off/);
  assert.throws(() => CLI.buildRequest('capacity', 'd1', '0', { operator: 'o' }, ENV), /positive integer/);
  assert.throws(() => CLI.buildRequest('changes', undefined, undefined, {}, ENV), /--run-id/);
  const src = readFileSync('scripts/dossier-ops-operator.mjs', 'utf8');
  assert.ok(!/console\.(log|error)\([^)]*(token|TOKEN)/.test(src.replace(/tokenName/g, '')), 'a token is never printed');
  assert.ok(!/setInterval|setTimeout|while \(true\)/.test(src), 'nothing loops, polls or runs on a timer');
  assert.ok(!/OPS_TOKEN/.test(src.replace(/^\/\/.*$/gm, '').replace(/DOSSIER_OPS_(READ|WRITE)_TOKEN/g, '')), 'the GCOS OPS_TOKEN is never used by this tool');
});

test('end to end through the real handler: the owner activation sequence (capacity, verify, recurring on, burn-in) and the read model, using the right token each time', async () => {
  const w = await recWorld({ states: {}, enabled: false, capacity: false });
  const seen = [];
  const op = { operator: 'owner-a' };
  for (const [k, v] of [['d1', '1000'], ['subrequests', '10000'], ['cpu-ms', '30000']]) assert.equal((await run(w, seen, 'capacity', k, v, op)).httpStatus, 200);
  assert.equal((await run(w, seen, 'capacity', 'verify', undefined, op)).httpStatus, 200);
  assert.equal((await run(w, seen, 'recurring', 'on', undefined, op)).httpStatus, 200);
  assert.equal((await run(w, seen, 'source-state', CT_ID, 'BURN_IN', { ...op, reason: 'start burn-in' })).httpStatus, 200);
  assert.equal((await run(w, seen, 'source-state', EU_ID, 'ACTIVE', op)).httpStatus, 400, 'DISABLED -> ACTIVE is refused');
  assert.equal(w.state(CT_ID), 'BURN_IN');
  const s = await run(w, seen, 'summary');
  assert.equal(s.httpStatus, 200);
  assert.deepEqual([s.data.global.recurring_enabled, s.data.global.capacity_verified, s.data.sources[0].state], [true, true, 'BURN_IN']);
  const h = await run(w, seen, 'health', CT_ID);
  assert.equal(h.data.health.state, 'BURN_IN');
  assert.equal((await run(w, seen, 'alerts')).httpStatus, 200);
  assert.equal((await run(w, seen, 'runs', undefined, undefined, { limit: '5' })).httpStatus, 200);
  assert.equal((await run(w, seen, 'candidates')).data.candidates.length, 0);
  for (const r of seen) assert.equal(r.auth, r.method === 'GET' ? `Bearer ${R}` : `Bearer ${W}`, `${r.method} ${r.url}`);
  assert.ok(seen.every((r) => !r.url.includes(R) && !r.url.includes(W)), 'a token is never in a URL');
  // the owner can turn everything off again
  assert.equal((await run(w, seen, 'persistence', 'off', undefined, op)).httpStatus, 200);
  assert.equal((await run(w, seen, 'recurring', 'off', undefined, op)).httpStatus, 200);
  assert.equal(w.controls().recurring_enabled, '0');
});
