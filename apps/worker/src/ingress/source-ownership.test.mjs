// S57 — single-channel-per-source regression (Kaduse side).
//
// resmigazete.gov.tr was independently registered on both Kaduse
// ('news-resmi-gazete-health-scoped', route=kaduse-news) and Hekimler
// ('tip-resmi_gazete', route=tip-ogrencileri), each polling the same daily
// gazette index page with only a downstream keyword filter as the
// differentiator. User decision: resmigazete.gov.tr -> Duyuru (Hekimler)
// exclusively. The fix must be structural (the row disabled in D1 via
// migrations/0022_resmi_gazete_single_channel.sql), not a keyword gate --
// this test proves (a) the Kaduse-side generic-web feed-selection query
// still hard-filters on `enabled = 1` (so a disabled row can never be
// fetched, regardless of any keyword policy), and (b) the migration that
// disables the Kaduse-side row targets the correct id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');

test('single-channel-per-source: resmigazete.gov.tr (Kaduse side disabled structurally)', async (t) => {
  await t.test('generic-web feed selection is gated on enabled = 1, not a keyword filter', () => {
    const src = readFileSync(join(here, 'generic-web.ts'), 'utf8');
    assert.match(
      src,
      /SELECT \* FROM source_feeds WHERE route = \? AND enabled = 1/,
      'the route-scoped feed selection query must hard-filter on enabled = 1 so a disabled row structurally cannot be fetched'
    );
  });

  await t.test('migration 0022 disables exactly the Kaduse-side resmi-gazete row', () => {
    const migration = readFileSync(
      join(repoRoot, 'migrations', '0022_resmi_gazete_single_channel.sql'),
      'utf8'
    );
    assert.match(migration, /UPDATE\s+source_feeds/i);
    assert.match(migration, /SET\s+enabled\s*=\s*0/i);
    assert.match(migration, /news-resmi-gazete-health-scoped/);
    // the executable UPDATE statement itself must target only the
    // Kaduse-side id, never the Hekimler-side one (the comment header may
    // still mention it for context)
    const statement = migration.slice(migration.indexOf('UPDATE source_feeds'));
    assert.doesNotMatch(statement, /tip-resmi_gazete/);
  });

  await t.test('seed still defines the disabled row as route=kaduse-news (proves we disabled the right side)', () => {
    const seed = readFileSync(join(repoRoot, 'migrations', '0002_seed_all_feeds.sql'), 'utf8');
    const row = seed.split('\n').find((l) => l.includes("'news-resmi-gazete-health-scoped'"));
    assert.ok(row, 'expected seed row for news-resmi-gazete-health-scoped');
    assert.match(row, /'kaduse-news'/);
  });

  await t.test('aa.com.tr Kaduse-side registration remains enabled (Kaduse keeps exclusive ownership)', () => {
    const seed = readFileSync(join(repoRoot, 'migrations', '0002_seed_all_feeds.sql'), 'utf8');
    const row = seed.split('\n').find((l) => l.includes("'news-aa-saglik-scoped'"));
    assert.ok(row, 'expected seed row for news-aa-saglik-scoped');
    assert.match(row, /'kaduse-news'/);
    // columns: id, label, route, channelId, transport, endpointUrl, pollMinutes, enabled, ...
    const cols = row.match(/'[^']*'|\d+/g);
    assert.equal(cols[7], '1', 'news-aa-saglik-scoped must stay enabled=1 in the seed');
  });
});
