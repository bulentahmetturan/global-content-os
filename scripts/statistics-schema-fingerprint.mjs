// Schema fingerprint for the HEALTH_STATISTICS database (items 39 and 41). The production check runs the read-only query below through
// `wrangler d1 execute <db> --remote --json --command "<QUERY>"`, pipes the JSON to this script, and compares the fingerprint with the frozen one.
//   QUERY: SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type, name
//   npx wrangler d1 execute global-content-os-stats --remote --json --command "<QUERY>" | node scripts/statistics-schema-fingerprint.mjs
// The frozen value is derived from migrations/statistics/0001_statistics_schema_v1.sql applied to an empty database (see prod-infra.test.mjs).
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const FINGERPRINT_QUERY = "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type, name";

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Accepts the rows themselves or wrangler's JSON output ([{ results: [...] }]). */
export function rowsOf(json) {
  if (Array.isArray(json) && json.length && json[0] && Array.isArray(json[0].results)) return json.flatMap((x) => x.results);
  if (json && Array.isArray(json.results)) return json.results;
  return Array.isArray(json) ? json : [];
}

export function fingerprint(rows) {
  const sorted = [...rows].sort((a, b) => (`${a.type}|${a.name}` < `${b.type}|${b.name}` ? -1 : 1));
  const counts = {};
  for (const r of sorted) counts[r.type] = (counts[r.type] ?? 0) + 1;
  return { counts, sha256: createHash('sha256').update(sorted.map((r) => `${r.type}|${r.name}|${norm(r.sql)}`).join('\n')).digest('hex') };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    const f = fingerprint(rowsOf(JSON.parse(raw)));
    console.log(JSON.stringify(f));
  });
}
