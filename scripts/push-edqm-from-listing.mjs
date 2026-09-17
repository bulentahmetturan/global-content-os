/**
 * Push official EDQM newsroom items parsed from a fetched listing.
 * Usage: node scripts/push-edqm-from-listing.mjs [path-to-listing.md] [hub]
 */
import fs from 'node:fs';

const listingPath =
  process.argv[2] ||
  'C:/Users/W11/.cursor/projects/c-Users-W11-Desktop-projects-multi-channel-design/agent-tools/a7a0adf3-7dc7-4419-af94-9c9a3dbb6c3d.txt';
const hub = process.argv[3] || 'http://127.0.0.1:8787';

const text = fs.readFileSync(listingPath, 'utf8');
const lines = text.split(/\r?\n/);
const items = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^###\s+(.+)$/);
  if (!m) continue;
  const title = m[1].trim();
  let url = null;
  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
    const u = lines[j].match(/^(https:\/\/www\.edqm\.eu\/\S+)/);
    if (u) {
      url = u[1].trim();
      break;
    }
  }
  if (!title || !url) continue;
  items.push({ title, url, summary: title, publishedAt: null });
  if (items.length >= 20) break;
}

console.log('parsed', items.length);
const res = await fetch(`${hub}/api/ingress/feed-items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ feedId: 'news-edqm-news-whole', items }),
});
console.log(await res.json());
