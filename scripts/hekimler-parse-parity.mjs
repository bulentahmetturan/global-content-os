// Runs the shared parse fixtures through the real Worker parseHtmlAnchors and prints [{title,url,published_at}].
// Usage: node scripts/hekimler-parse-parity.mjs <fixtures-dir>
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `hekimler-parse-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/ingress/hekimler-continuous.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const mod = await import(pathToFileURL(out).href);
const dir = process.argv[2];
const result = {};
for (const f of readdirSync(dir).filter((x) => x.startsWith('parse_'))) {
  const body = readFileSync(join(dir, f), 'utf8');
  result[f] = mod.parseHtmlAnchors(body, 'https://example.org/list').map((i) => ({ title: i.title, url: i.url, published_at: i.published_at ?? null }));
}
console.log(JSON.stringify(result));
