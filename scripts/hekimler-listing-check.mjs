// For every bundled AUTOMATION_READY profile: does the Worker's own allowlist accept its listing URL?
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `hekimler-listing-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/ingress/hekimler-continuous.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const mod = await import(pathToFileURL(out).href);
const profiles = JSON.parse(readFileSync('apps/worker/src/ingress/hekimler-automation-ready.json', 'utf8')).profiles;
console.log(JSON.stringify(profiles.map((p) => {
  const listing = mod.resolveListingUrl(p);
  return { source_id: p.source_id, listing, allowed: mod.hostPathAllowed(listing, p) };
})));
