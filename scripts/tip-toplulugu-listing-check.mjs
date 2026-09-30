// For every bundled AUTOMATION_READY profile: does the Worker's own allowlist accept its listing URL?
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `tip-toplulugu-listing-${process.pid}.mjs`);
await build({ entryPoints: ['apps/worker/src/ingress/tip-toplulugu-continuous.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const mod = await import(pathToFileURL(out).href);
const profilesPath = process.env.TIP_TOPLULUGU_PARITY_PROFILES || 'apps/worker/src/ingress/tip-toplulugu-automation-ready.json';
const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')).profiles;
console.log(JSON.stringify(profiles.map((p) => {
  const listing = mod.resolveListingUrl(p);
  return { source_id: p.source_id, listing, allowed: mod.hostPathAllowed(listing, p) };
})));
