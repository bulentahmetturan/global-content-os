#!/usr/bin/env node
// Generates every Hub static asset that mirrors a canonical Hekimler file (D-BIBLE-V4-HUB-COPY, evidence E22; same
// model for the Hub config copies and source catalogs, MANUAL_SYNC_MIRRORS=0). The Hub is served as Workers static
// assets (wrangler.toml [assets] directory = "apps/hub"), which needs physical files there; they are GENERATED and must
// never be edited by hand. Edit the canonical file, then run:
//   node scripts/generate-hub-assets.mjs           write the Hub copies
//   node scripts/generate-hub-assets.mjs --check   exit 1 if any Hub copy is stale or was edited independently
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = 'adapters/hekimler-radar/content';

const copy = (buf) => buf;
// Hub catalog = the registry's sources in registry order, projected to what the Hub UI reads.
const catalog = (buf) => {
  const reg = JSON.parse(buf.toString('utf8'));
  const rows = reg.sources.map((s) => ({ id: s.source_id ?? s.id, name: s.name, url: s.source_url, mode: s.runtime_activation }));
  return Buffer.from(JSON.stringify(rows, null, 2) + '\n', 'utf8');
};

export const HUB_ASSETS = [
  { source: `${CONTENT}/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md`, destination: 'apps/hub/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md', transform: copy },
  { source: `${CONTENT}/config/bible-config.json`, destination: 'apps/hub/bible-config.json', transform: copy },
  { source: `${CONTENT}/taxonomy/controlled-vocabulary.json`, destination: 'apps/hub/controlled-vocabulary.json', transform: copy },
  { source: `${CONTENT}/source-registry-burs-v1.json`, destination: 'apps/hub/burs-sources.json', transform: catalog },
  { source: `${CONTENT}/source-registry-egitim-v1.json`, destination: 'apps/hub/egitim-sources.json', transform: catalog },
];

// Git may check text out with CRLF on Windows; compare content, not line endings.
const normalize = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function expected(base, asset) {
  return normalize(asset.transform(normalize(readFileSync(join(base, asset.source)))));
}

export function checkHubAssets(base = root) {
  return HUB_ASSETS.map((asset) => {
    const want = expected(base, asset);
    const dstPath = join(base, asset.destination);
    const have = existsSync(dstPath) ? normalize(readFileSync(dstPath)) : null;
    const expectedSha256 = sha256(want);
    const destinationSha256 = have ? sha256(have) : null;
    return { source: asset.source, destination: asset.destination, expectedSha256, destinationSha256, inSync: expectedSha256 === destinationSha256 };
  });
}

export function generateHubAssets(base = root) {
  for (const asset of HUB_ASSETS) writeFileSync(join(base, asset.destination), expected(base, asset));
  return checkHubAssets(base);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = process.argv.includes('--check') ? checkHubAssets() : generateHubAssets();
  console.log(JSON.stringify(results, null, 1));
  const stale = results.filter((r) => !r.inSync);
  if (stale.length) {
    for (const r of stale) console.error(`HUB_ASSET_STALE: ${r.destination} differs from its generation from ${r.source}`);
    console.error('run: node scripts/generate-hub-assets.mjs (never edit the Hub copies)');
    process.exit(1);
  }
}
