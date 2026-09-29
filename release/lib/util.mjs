// Shared helpers for the P7 release tooling. Dependency-free (node >= 22).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_GCOS_ROOT = resolve(RELEASE_DIR, '..');

export const STATUS_ORDER = { PASS: 0, WARN: 1, FAIL: 2 };
export const worst = (list) => list.reduce((a, s) => (STATUS_ORDER[s] > STATUS_ORDER[a] ? s : a), 'PASS');

/** Build one check record. `defer` names the package whose final binding this check waits on. */
export function check(category, id, status, detail, extra = {}) {
  return { category, id, status, detail, ...extra };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadConfig(path = join(RELEASE_DIR, 'release.config.json')) {
  return readJson(path);
}

/** Resolve repo roots from env (P7_GCOS_ROOT / P7_CCOS_ROOT) or configured candidates. */
export function resolveRoots(config, env = process.env) {
  const gcos = env.P7_GCOS_ROOT ? resolve(env.P7_GCOS_ROOT) : DEFAULT_GCOS_ROOT;
  let ccos = env.P7_CCOS_ROOT ? resolve(env.P7_CCOS_ROOT) : null;
  if (!ccos) {
    for (const cand of config.repos.ccos.candidates) {
      const p = resolve(gcos, cand);
      if (existsSync(join(p, config.repos.ccos.marker))) { ccos = p; break; }
    }
  }
  return { gcos, ccos };
}

export function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Minimal wrangler.toml reader: name, crons, [vars] keys, d1 databases. Never returns secret values (none live here). */
export function parseWrangler(text) {
  const out = { name: null, crons: [], vars: {}, d1: [], hasPreviewEnv: false };
  let section = '';
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = /^\[\[(.+)\]\]$/.exec(line))) {
      section = m[1];
      if (section === 'd1_databases') { cur = {}; out.d1.push(cur); }
      continue;
    }
    if ((m = /^\[(.+)\]$/.exec(line))) {
      section = m[1];
      if (section.startsWith('env.')) out.hasPreviewEnv = true;
      continue;
    }
    if (!(m = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line))) continue;
    const [, k, v] = m;
    const val = v.trim().replace(/^"(.*)"$/, '$1');
    if (section === '' && k === 'name') out.name = val;
    else if (section === 'triggers' && k === 'crons') out.crons = [...v.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    else if (section === 'vars') out.vars[k] = val;
    else if (section === 'd1_databases') cur[k] = val;
  }
  return out;
}

export function listMigrations(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .map((filename) => ({ filename, number: Number.parseInt(filename.split('_')[0], 10), path: join(dir, filename) }))
    .sort((a, b) => a.number - b.number);
}

/** Sibling-repo file read that returns null instead of throwing. */
export function tryRead(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}
