// ADR-0004: the production-status callback from channel-content-os must FAIL CLOSED.
// Regression for the audited fail-open behaviour: `if (env.STATUS_CALLBACK_TOKEN && token !== ...)`
// let anyone write production status whenever the secret was unset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `worker-index-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const worker = (await import(pathToFileURL(out).href)).default;

/** D1 stub: records writes; `briefExists` controls whether the brief lookup succeeds. */
function makeEnv(extra = {}, { briefExists = true } = {}) {
  const writes = [];
  return {
    writes,
    env: {
      ENVIRONMENT: 'test',
      DB: {
        prepare(sql) {
          const stmt = {
            bind: () => stmt,
            first: async () => (/FROM approved_briefs/.test(sql) && briefExists ? { brief_id: 'b1' } : null),
            run: async () => {
              writes.push(sql);
              return { success: true };
            },
            all: async () => ({ results: [] }),
          };
          return stmt;
        },
      },
      ...extra,
    },
  };
}

const call = (env, { auth, body } = {}) =>
  worker.fetch(
    new Request('https://gcos.test/api/handoff/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body ?? { briefId: 'b1', status: 'ready' }),
    }),
    env,
    { waitUntil() {} }
  );

test('unset STATUS_CALLBACK_TOKEN does NOT make the endpoint public (503, no write)', async () => {
  const { env, writes } = makeEnv({});
  for (const auth of [undefined, 'Bearer anything', 'Bearer ']) {
    const res = await call(env, { auth });
    assert.equal(res.status, 503, `auth=${auth}`);
  }
  assert.equal(writes.length, 0);
});

test('empty-string token is treated as unset (503)', async () => {
  const { env, writes } = makeEnv({ STATUS_CALLBACK_TOKEN: '' });
  assert.equal((await call(env, { auth: 'Bearer ' })).status, 503);
  assert.equal(writes.length, 0);
});

test('configured token: missing or wrong bearer is 401 and writes nothing', async () => {
  const { env, writes } = makeEnv({ STATUS_CALLBACK_TOKEN: 's3cret' });
  assert.equal((await call(env)).status, 401);
  assert.equal((await call(env, { auth: 'Bearer nope' })).status, 401);
  assert.equal(writes.length, 0);
});

test('configured token: correct bearer + contract status is accepted and recorded', async () => {
  const { env, writes } = makeEnv({ STATUS_CALLBACK_TOKEN: 's3cret' });
  const res = await call(env, { auth: 'Bearer s3cret', body: { briefId: 'b1', status: 'designing', detail: 'x' } });
  assert.equal(res.status, 200);
  assert.ok(writes.some((s) => /INSERT INTO production_status/.test(s)));
  assert.ok(writes.some((s) => /INSERT INTO handoff_log/.test(s)));
});

test('non-contract status values are rejected (400) even with a valid token', async () => {
  const { env, writes } = makeEnv({ STATUS_CALLBACK_TOKEN: 's3cret' });
  for (const status of ['done', 'PUBLISHED', '', undefined]) {
    const res = await call(env, { auth: 'Bearer s3cret', body: { briefId: 'b1', status } });
    assert.equal(res.status, 400, String(status));
  }
  assert.equal(writes.length, 0);
});
