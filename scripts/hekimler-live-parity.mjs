// Runs a REAL page body through the Worker parse + gates and prints eligible/rejected URLs.
// Usage: node scripts/hekimler-live-parity.mjs <profiles.json> <sourceId> <body.html>
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `hekimler-live-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/ingress/hekimler-continuous.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const mod = await import(pathToFileURL(out).href);
const [, , profilesPath, sourceId, bodyPath] = process.argv;
const profile = JSON.parse(readFileSync(profilesPath, 'utf8')).profiles.find((p) => p.source_id === sourceId);
const body = readFileSync(bodyPath, 'utf8');
const listing = profile.source_url || profile.primary_url;
const items = mod.parseHtmlAnchors(body, listing);
const rows = [];
for (const it of items) {
  let decision = 'ACCEPT', reason = '';
  if (!mod.itemShapeAllowed(profile, it.title, it.url)) { decision = 'DISCARD'; reason = 'shape'; }
  else {
    const g = mod.classifyTitle(profile, it.title, '');
    if (g.decision === 'DISCARD') { decision = 'DISCARD'; reason = g.reason; }
    else {
      const dv = mod.dateVerdict(sourceId, { publishedAt: it.published_at, title: it.title, url: it.url });
      if (dv.verdict === 'STALE') { decision = 'DISCARD'; reason = 'stale'; }
    }
  }
  rows.push({ url: it.url, title: it.title.slice(0, 80), decision, reason });
}
console.log(JSON.stringify({ parsed: items.length, rows }));
