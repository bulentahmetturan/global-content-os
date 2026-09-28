// Deterministic tests for source-matrix.mjs's classify() function (task 7's
// health taxonomy). Extracts the actual function from the script file
// (not a reimplementation) and exercises it against synthetic `live` data
// -- no wrangler/D1 credentials required, so this runs in CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'source-matrix.mjs'), 'utf8');

function extractFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found`);
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(start, i);
}

const sandboxSrc = [
  "const OVERDUE_TOLERANCE_MINUTES = 60;",
  extractFunction('classify'),
  '({ classify })',
].join('\n');
const { classify } = vm.runInNewContext(sandboxSrc, {}, { filename: 'source-matrix.mjs (extracted)' });

function live({ kaduseFeeds = [], hekTelemetry = [], items24h = [], available = true } = {}) {
  return {
    kaduseFeeds: new Map(kaduseFeeds.map((r) => [r.id, r])),
    hekTelemetry: new Map(hekTelemetry.map((r) => [r.source_id, r])),
    items24h: new Map(items24h),
    available,
  };
}

test('RETIRED lifecycle always classifies RETIRED regardless of other fields', () => {
  const row = { lifecycle_state: 'RETIRED', wired: true, enabled: true, source_id: 'x' };
  assert.equal(classify(row, live()), 'RETIRED');
});

test('MANUAL_INTAKE lifecycle always classifies MANUAL_INTAKE', () => {
  const row = { lifecycle_state: 'MANUAL_INTAKE', wired: false, enabled: false, source_id: 'x' };
  assert.equal(classify(row, live()), 'MANUAL_INTAKE');
});

test('not wired (no scheduler owns it) classifies NOT_WIRED even if enabled', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: false, enabled: true, scheduler_path: 'none', source_id: 'x' };
  assert.equal(classify(row, live()), 'NOT_WIRED');
});

test('disabled active source classifies MANUAL_INTAKE (no automatic ingestion)', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: false, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x' };
  assert.equal(classify(row, live()), 'MANUAL_INTAKE');
});

test('never fetched (no last_success anywhere) classifies NEVER_RUN', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  assert.equal(classify(row, live({ kaduseFeeds: [{ id: 'x', last_fetched_at: null, last_error: null }] })), 'NEVER_RUN');
});

test('recent success, within cadence, no items today = HEALTHY_EMPTY', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  const l = live({ kaduseFeeds: [{ id: 'x', last_fetched_at: new Date().toISOString(), last_error: null }] });
  assert.equal(classify(row, l), 'HEALTHY_EMPTY');
});

test('recent success, within cadence, items today = HEALTHY', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  const l = live({
    kaduseFeeds: [{ id: 'x', last_fetched_at: new Date().toISOString(), last_error: null }],
    items24h: [['x', 3]],
  });
  assert.equal(classify(row, l), 'HEALTHY');
});

test('last success far beyond cadence + tolerance = OVERDUE', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  const eightHoursAgo = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
  const l = live({ kaduseFeeds: [{ id: 'x', last_fetched_at: eightHoursAgo, last_error: null }] });
  assert.equal(classify(row, l), 'OVERDUE');
});

test('a recorded last_error classifies DEGRADED', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  const l = live({ kaduseFeeds: [{ id: 'x', last_fetched_at: new Date().toISOString(), last_error: 'timeout' }] });
  assert.equal(classify(row, l), 'DEGRADED');
});

test('live data unavailable never falsely reports HEALTHY', () => {
  const row = { lifecycle_state: 'ACTIVE', wired: true, enabled: true, scheduler_path: 'cloudflare_cron_generic_web', source_id: 'x', poll_minutes: 360 };
  const l = live({ available: false });
  assert.equal(classify(row, l), 'UNKNOWN_LIVE_DATA_UNAVAILABLE');
});
