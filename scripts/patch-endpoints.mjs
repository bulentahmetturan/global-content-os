/**
 * Write a SQL file that sets endpoint_url from config/feeds.json, then apply it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feeds = JSON.parse(fs.readFileSync(path.join(root, 'config/feeds.json'), 'utf8')).feeds;
const out = path.join(root, 'scripts/_patch-endpoints.sql');

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const lines = [];
for (const f of feeds) {
  if (!f.endpointUrl) continue;
  lines.push(
    `UPDATE source_feeds SET endpoint_url = '${esc(f.endpointUrl)}' WHERE id = '${esc(f.id)}';`
  );
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'updates →', out);

const r = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'global-content-os', '--local', '--file', out],
  { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024 }
);
console.log(r.stdout.slice(-500));
if (r.status !== 0) {
  console.error(r.stderr.slice(-1000));
  process.exit(r.status || 1);
}
