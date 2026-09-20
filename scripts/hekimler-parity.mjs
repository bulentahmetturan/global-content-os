// Runs the shared Hekimler parity fixtures through the real Worker TypeScript gate.
// Usage: node scripts/hekimler-parity.mjs <fixtures.json>  -> prints JSON results to stdout
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `hekimler-parity-${process.pid}.mjs`);
await build({
  entryPoints: ['apps/worker/src/ingress/hekimler-continuous.ts'],
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
});
const mod = await import(pathToFileURL(out).href);
const bundle = (await import(pathToFileURL(out).href)).default ?? null;
const profiles = JSON.parse(readFileSync('apps/worker/src/ingress/hekimler-automation-ready.json', 'utf8')).profiles;
const fixtures = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const results = fixtures.cases.map((c) => {
  const profile = profiles.find((p) => p.source_id === c.source_id);
  if (!profile) return { id: c.id, error: 'unknown_source' };
  const gate = mod.classifyTitle(profile, c.title, '');
  let final = gate.decision;
  let reason = gate.reason;
  if (gate.decision === 'ACCEPT') {
    const dv = mod.dateVerdict(c.source_id, { publishedAt: c.published_at || null, title: c.title, url: c.url || '' }, new Date(fixtures.today + 'T12:00:00Z'));
    if (dv.verdict === 'STALE') { final = 'DISCARD'; reason = 'stale'; }
    return { id: c.id, decision: final, reason, date_verdict: dv.verdict };
  }
  return { id: c.id, decision: final, reason, date_verdict: null };
});
console.log(JSON.stringify(results));
