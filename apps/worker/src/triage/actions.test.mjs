// S63 feedback-loop regression: every reject (action === 'delete') must
// atomically produce exactly one review_feedback row, reason codes are
// validated, and a missing/failed feedback write must never leave the item
// silently rejected with no trail (no split-brain).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(tmpdir(), `triage-actions-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/triage/actions.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { applyTriage } = await import(pathToFileURL(out).href);

const BASE_ROW = {
  id: 'item_1',
  feed_id: 'tip-radar-adapter',
  route: 'tip-ogrencileri', // avoids the recordDecidedLink (kaduse-only) branch, which needs crypto.subtle
  channel_id: 'tip_toplulugu',
  title: 'Başlık',
  title_orig: 'Original',
  summary: 'özet',
  gists_json: '["özet"]',
  canonical_url: 'https://example.org/a',
  publisher: 'Pub',
  published_at: '2026-09-20',
  triage_status: 'inbox',
  dedupe_key: 'dk1',
  fetched_at: '2026-09-20T00:00:00.000Z',
  source_id: 'ttb_national',
  intake_meta_json: '{}',
};

/** Fake D1 binding: records every statement in a batch() call (or as a
 * standalone run()) so tests can assert on exactly what was written,
 * without a real Cloudflare/D1 connection. */
function fakeDb({ failBatch = false } = {}) {
  const batches = [];
  const runs = [];
  function stmt(sql, args) {
    return {
      sql,
      args,
      bind(...bindArgs) {
        return stmt(sql, bindArgs);
      },
      first: async () => (/FROM source_items/.test(sql) ? BASE_ROW : null),
      run: async () => {
        runs.push({ sql: sql.trim().split(/\s+/).slice(0, 3).join(' '), args });
        return { success: true };
      },
    };
  }
  return {
    batches,
    runs,
    prepare(sql) {
      return stmt(sql, []);
    },
    async batch(statements) {
      if (failBatch) throw new Error('SIMULATED_D1_BATCH_FAILURE');
      const recorded = statements.map((s) => ({
        sql: s.sql.trim().split(/\s+/).slice(0, 3).join(' '),
        args: s.args,
      }));
      batches.push(recorded);
      return statements.map(() => ({ success: true }));
    },
  };
}

test('reject without a reason code is rejected before any write happens', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => applyTriage({ DB: db }, 'item_1', 'delete', 'hub-user', undefined),
    /REJECT_REASON_CODE_REQUIRED/
  );
  assert.equal(db.batches.length, 0, 'no batch should have been attempted');
});

test('reject with an invalid reason code is rejected before any write happens', async () => {
  const db = fakeDb();
  await assert.rejects(
    () =>
      applyTriage({ DB: db }, 'item_1', 'delete', 'hub-user', {
        reasonCode: 'not_a_real_code',
      }),
    /REJECT_REASON_CODE_REQUIRED/
  );
  assert.equal(db.batches.length, 0);
});

test('reject with a valid reason code writes status update + editorial_decisions + review_feedback atomically in one batch', async () => {
  const db = fakeDb();
  const result = await applyTriage({ DB: db }, 'item_1', 'delete', 'hub-user', {
    reasonCode: 'off_topic',
    reasonNote: 'not about medicine',
  });

  assert.equal(db.batches.length, 1, 'exactly one atomic batch call, not separate awaited writes');
  const [batch] = db.batches;
  assert.equal(batch.length, 3, 'update + editorial_decisions + review_feedback, together');
  assert.match(batch[0].sql, /UPDATE source_items/);
  assert.match(batch[1].sql, /INSERT INTO editorial_decisions/);
  assert.match(batch[2].sql, /INSERT INTO review_feedback/);

  // review_feedback bind order: id, item_id, feed_id, source_id, route, channel_id, reason_code, reason_note, reviewer
  const fbArgs = batch[2].args;
  assert.equal(fbArgs[1], 'item_1');
  assert.equal(fbArgs[2], 'tip-radar-adapter');
  assert.equal(fbArgs[3], 'ttb_national');
  assert.equal(fbArgs[4], 'tip-ogrencileri');
  assert.equal(fbArgs[6], 'off_topic');
  assert.equal(fbArgs[7], 'not about medicine');

  assert.ok(result.feedbackId, 'applyTriage must return the feedback row id');
  assert.equal(result.item.triageStatus, 'trash');
});

test('a failed D1 batch leaves no partial state observable by the caller (no split-brain)', async () => {
  const db = fakeDb({ failBatch: true });
  await assert.rejects(
    () => applyTriage({ DB: db }, 'item_1', 'delete', 'hub-user', { reasonCode: 'duplicate' }),
    /SIMULATED_D1_BATCH_FAILURE/
  );
  // The only DB effects for a rejected item are inside the batch; since the
  // batch itself throws, D1 guarantees no partial statements from it were
  // committed. No separate non-batched run() calls should exist either.
  assert.equal(db.runs.length, 0, 'no standalone (non-atomic) writes were attempted for a reject');
});

test('non-reject actions (e.g. hold) do not require or write feedback', async () => {
  const db = fakeDb();
  const result = await applyTriage({ DB: db }, 'item_1', 'hold', 'hub-user');
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 2, 'update + editorial_decisions only, no review_feedback');
  assert.equal(result.feedbackId, undefined);
});
