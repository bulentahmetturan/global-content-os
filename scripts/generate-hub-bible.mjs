#!/usr/bin/env node
// Generates the Hub copy of the Hekimler Bible v4 from its one canonical source (D-BIBLE-V4-HUB-COPY, evidence E22).
// The Hub is served as Workers static assets (wrangler.toml [assets] directory = "apps/hub"), which needs a physical
// file there; that file is GENERATED and must never be edited by hand. Edit the canonical file, then run:
//   node scripts/generate-hub-bible.mjs           write the Hub copy
//   node scripts/generate-hub-bible.mjs --check   exit 1 if the Hub copy is stale or was edited independently
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const HUB_BIBLE = {
  source: 'adapters/hekimler-radar/content/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md',
  destination: 'apps/hub/00_TURK_TIP_CONTENT_OS_BIBLE_v4.md',
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function checkHubBible(base = root) {
  const src = readFileSync(join(base, HUB_BIBLE.source));
  const dstPath = join(base, HUB_BIBLE.destination);
  const dst = existsSync(dstPath) ? readFileSync(dstPath) : null;
  const sourceSha256 = sha256(src);
  const destinationSha256 = dst ? sha256(dst) : null;
  return { ...HUB_BIBLE, sourceSha256, destinationSha256, inSync: sourceSha256 === destinationSha256 };
}

export function generateHubBible(base = root) {
  writeFileSync(join(base, HUB_BIBLE.destination), readFileSync(join(base, HUB_BIBLE.source)));
  return checkHubBible(base);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const r = check ? checkHubBible() : generateHubBible();
  console.log(JSON.stringify(r, null, 1));
  if (!r.inSync) {
    console.error(`HUB_BIBLE_STALE: ${HUB_BIBLE.destination} differs from ${HUB_BIBLE.source}; run: node scripts/generate-hub-bible.mjs (never edit the Hub copy)`);
    process.exit(1);
  }
}
