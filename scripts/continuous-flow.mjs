/**
 * Continuous source flow daemon.
 * Keeps cycling ALL enabled feeds forever so every route stays live:
 *   - WHO + research APIs each cycle
 *   - stale-first generic walks (offset 0 → oldest last_fetched_at)
 *   - tip radar crawl (every RADAR_EVERY cycles) + adapter push
 *
 * Usage:
 *   node scripts/continuous-flow.mjs
 *   node scripts/continuous-flow.mjs http://127.0.0.1:8787
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hub = process.argv[2] || process.env.GCOS_HUB_URL || 'http://127.0.0.1:8787';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tipRoot = path.resolve(root, '../multi_channel_design/channels/tip-ogrencileri-platformu');
const CYCLE_PAUSE_MS = Number(process.env.GCOS_CYCLE_PAUSE_MS || 10_000);
const RADAR_EVERY = Number(process.env.GCOS_RADAR_EVERY || 3);
const WALK_BATCH = {
  'kaduse-news': 8,
  'kaduse-research': 6,
  'tip-ogrencileri': 12,
};

async function post(p, body, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);
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
    await new Promise((r) => setTimeout(r, attempt * 3000));
    return post(p, body, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

/** One continuity slice: keep pulling stale-first batches until a soft budget. */
async function walkRoute(route, batches = 8) {
  let created = 0;
  let updated = 0;
  let scanned = 0;
  let empty = 0;
  let errors = 0;
  const batch = WALK_BATCH[route] || 8;
  for (let i = 0; i < batches; i++) {
    // Prefer empty/never-ok feeds until readyPct≈100, then keep stale-first.
    const onlyEmpty = i % 2 === 0;
    const r = await post('/api/ingress/generic', {
      route,
      offset: 0,
      limit: batch,
      onlyEmpty,
    });
    created += r.created || 0;
    updated += r.updated || 0;
    scanned += r.scanned || 0;
    empty += r.empty || 0;
    errors += r.errors || 0;
    if (!r.scanned && onlyEmpty) {
      // No empties left for this route — finish with stale-first sweeps.
      continue;
    }
    if (!r.scanned) break;
  }
  return { route, scanned, created, updated, empty, errors };
}

function runCmd(command, args, cwd, timeoutMs = 0) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: true });
    let out = '';
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            try {
              child.kill();
            } catch {
              /* ignore */
            }
          }, timeoutMs)
        : null;
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, out: out.slice(-800) });
    });
  });
}

async function pushTipRadar() {
  const script = path.join(root, 'adapters/tip-radar/push_to_hub.py');
  return runCmd('python', [script, '--hub', hub, '--status', 'all', '--limit', '5000'], root);
}

async function runTipRadarCrawl() {
  // Full radar pass can be long; budget ~12 min then resume next cycle.
  const py = process.env.GCOS_PYTHON || 'C:\\Users\\W11\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
  return runCmd(py, ['-m', 'radar', 'run'], tipRoot, 12 * 60_000);
}

async function cycle(n) {
  const started = new Date().toISOString();
  console.log(`\n=== CYCLE ${n} @ ${started} ===`);

  try {
    console.log('WHO', await post('/api/ingress/news'));
  } catch (e) {
    console.warn('WHO fail', e.message);
  }
  try {
    console.log('research APIs', await post('/api/ingress/research'));
  } catch (e) {
    console.warn('research fail', e.message);
  }

  try {
    console.log('journal fallback', await post('/api/ingress/journal-fallback'));
  } catch (e) {
    console.warn('journal fallback fail', e.message);
  }

  for (const route of ['kaduse-news', 'kaduse-research', 'tip-ogrencileri']) {
    try {
      const w = await walkRoute(route, route === 'tip-ogrencileri' ? 12 : 6);
      console.log('walk', w);
    } catch (e) {
      console.warn('walk fail', route, e.message);
    }
  }

  if (n % RADAR_EVERY === 1) {
    try {
      console.log('tip radar crawl starting…');
      const crawl = await runTipRadarCrawl();
      console.log('tip radar crawl exit', crawl.code, crawl.out.split('\n').slice(-4).join(' | '));
    } catch (e) {
      console.warn('tip radar crawl fail', e.message);
    }
  }

  try {
    const tip = await pushTipRadar();
    console.log('tip radar push exit', tip.code, tip.out.split('\n').slice(-3).join(' | '));
  } catch (e) {
    console.warn('tip push fail', e.message);
  }

  // Outside-Worker closer for bot-blocked / TLS-broken hosts
  try {
    const closer = await runCmd('node', ['scripts/close-empty-feeds.mjs', hub], root, 180_000);
    console.log('close-empty', closer.code, closer.out.split('\n').slice(-5).join(' | '));
  } catch (e) {
    console.warn('close-empty fail', e.message);
  }
  try {
    const curlClose = await runCmd('node', ['scripts/curl-close-empty.mjs', hub], root, 120_000);
    console.log('curl-close', curlClose.code, curlClose.out.split('\n').slice(-5).join(' | '));
  } catch (e) {
    console.warn('curl-close fail', e.message);
  }

  try {
    const coverage = await fetch(`${hub}/api/coverage`).then((r) => r.json());
    console.log('coverage', JSON.stringify(coverage.byRoute));
  } catch (e) {
    console.warn('coverage fail', e.message);
  }
}

async function main() {
  console.log('Continuous flow daemon →', hub);
  console.log('Pause between cycles:', CYCLE_PAUSE_MS, 'ms; tip radar every', RADAR_EVERY, 'cycles');
  let n = 0;
  for (;;) {
    n += 1;
    try {
      await cycle(n);
    } catch (e) {
      console.error('cycle crashed', e);
    }
    await new Promise((r) => setTimeout(r, CYCLE_PAUSE_MS));
  }
}

main();
