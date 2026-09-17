/**
 * One full continuity pass across all routes (real listings only).
 * Prefer `pnpm flow:continuous` for ongoing rotation.
 *
 * Usage: node scripts/ensure-complete-continuity.mjs [hubUrl]
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hub = process.argv[2] || process.env.GCOS_HUB_URL || 'http://127.0.0.1:8787';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function post(p, body, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${hub}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${p} ${res.status}`);
    return data;
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, attempt * 2000));
    return post(p, body, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function fullWalk(route, batch) {
  let offset = 0;
  const totals = { scanned: 0, created: 0, updated: 0, empty: 0, errors: 0 };
  for (let i = 0; i < 250; i++) {
    const r = await post('/api/ingress/generic', {
      route,
      offset,
      limit: batch,
      onlyEmpty: false,
    });
    totals.scanned += r.scanned || 0;
    totals.created += r.created || 0;
    totals.updated += r.updated || 0;
    totals.empty += r.empty || 0;
    totals.errors += r.errors || 0;
    console.log(route, 'offset', offset, r);
    if (r.nextOffset == null || !r.scanned) break;
    offset = r.nextOffset;
  }
  return totals;
}

function tipPush() {
  return new Promise((resolve) => {
    const script = path.join(root, 'adapters/tip-radar/push_to_hub.py');
    const child = spawn(
      'python',
      [script, '--hub', hub, '--status', 'all', '--limit', '5000'],
      { cwd: root, shell: true }
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function main() {
  console.log('Continuity pass →', hub);
  console.log('WHO', await post('/api/ingress/news'));
  console.log('research APIs', await post('/api/ingress/research'));
  console.log('news walk', await fullWalk('kaduse-news', 6));
  console.log('research walk', await fullWalk('kaduse-research', 5));
  console.log('tip walk', await fullWalk('tip-ogrencileri', 10));
  const tip = await tipPush();
  console.log('tip radar push', tip.code, tip.out.slice(-800));
  const coverage = await fetch(`${hub}/api/coverage`).then((r) => r.json());
  console.log(JSON.stringify(coverage, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
