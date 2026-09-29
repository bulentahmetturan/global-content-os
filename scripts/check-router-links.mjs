#!/usr/bin/env node
// Deterministic router link + coverage check. No dependencies, read-only.
// Identical copy lives in global-content-os and channel-content-os.
//
//   node scripts/check-router-links.mjs              -> link/coverage check (exit 1 on breakage)
//   node scripts/check-router-links.mjs --simulate   -> per-route initial-context estimate
//
// Cross-repo pointers use @gcos/ @ccos/ prefixes. @mcd/ is no longer legal anywhere
// (multi_channel_design is merged into channel-content-os, ADR-0005): each use counts as TRANSITIONAL_MCD_ROUTES.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIBLINGS = { gcos: 'global-content-os', ccos: 'channel-content-os', mcd: 'multi_channel_design' };
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', '.logs', '_history', '.p4wt', '.p5wt', '.p7wt', '.pfinal']);
let mcdRoutes = 0;
const simulate = process.argv.includes('--simulate');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIRS.has(n)) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const routerFiles = walk(ROOT).filter((p) => {
  const b = p.split(sep).pop();
  return b === 'AGENTS.md' || b === 'CLAUDE.md' || b.endsWith('BIBLE-INDEX.md') ||
    ['CORE.md', 'INDEX.md', 'CURRENT.md'].includes(b) && dirname(p) === join(ROOT, 'docs');
});

function siblingRoot(key) {
  // Prefer a short-named sibling (isolated worktrees: .p4wt/gcos, .p4wt/ccos), then the real checkout.
  const names = [key, SIBLINGS[key]];
  const bases = [dirname(ROOT), dirname(dirname(ROOT))];
  for (const b of bases) for (const n of names) if (existsSync(join(b, n, 'AGENTS.md')) || existsSync(join(b, n, '.git'))) return join(b, n);
  return null;
}

const errors = [];
const notes = [];
let checked = 0;

function pathLike(tok) {
  if (/[\s*<>{}$|()]/.test(tok)) return false;
  if (/^(https?:|mailto:|\.logs|(feat|fix|arch|chore|preserve|integration|feature)\/)/.test(tok)) return false;
  return /^(@[a-z]+\/)?[\w.\-\/]+$/.test(tok) && (tok.includes('/') || /\.(md|json|mjs|ts|py|sql|toml|yml|yaml|html)$/.test(tok));
}

function resolveToken(tok, fileDir) {
  let t = tok.replace(/:\d+(-\d+)?$/, '');
  const m = t.match(/^@([a-z]+)\/(.*)$/);
  if (m) {
    const r = siblingRoot(m[1]);
    if (!r) return { skip: true };
    return { path: join(r, m[2]), cross: m[1] };
  }
  for (const base of [ROOT, fileDir]) {
    const p = resolve(base, t);
    if (existsSync(p)) return { path: p };
  }
  return { path: resolve(ROOT, t), missing: true };
}

function tokens(text) {
  const out = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) out.push(m[1]);
  for (const m of text.matchAll(/\]\(([^)\s#]+)\)/g)) out.push(m[1]);
  return out;
}

for (const f of routerFiles) {
  const text = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  const lines = text.split(/\r?\n/);
  let bible = null;
  const bm = text.match(/^BIBLE:\s*`([^`]+)`/m);
  if (bm) { const r = resolveToken(bm[1], dirname(f)); bible = r.path && existsSync(r.path) ? readFileSync(r.path, 'utf8').split(/\r?\n/) : null; if (!bible) errors.push(`${rel}: BIBLE target missing (${bm[1]})`); }
  // Pointers inside a "Do not load" section / a `DO NOT LOAD:` line are EXCLUSIONS, not required-to-exist links
  // (e.g. artifacts/ may be absent in a working copy); they are not existence-checked.
  let inDoNotLoad = false;
  lines.forEach((line, i) => {
    if (/^#{1,6}\s/.test(line)) inDoNotLoad = /do not load/i.test(line);
    const exclusion = inDoNotLoad || /^\s*DO NOT LOAD:/i.test(line);
    for (const tok of tokens(line)) {
      if (exclusion && !tok.startsWith('@mcd/') && !/^#{2,3} /.test(tok)) { checked++; continue; }
      if (/^#{2,3} /.test(tok)) {
        checked++;
        if (bible && !bible.some((l) => l.startsWith(tok))) errors.push(`${rel}:${i + 1}: heading not found in Bible: ${tok}`);
        continue;
      }
      if (!pathLike(tok)) continue;
      checked++;
      if (tok.startsWith('@mcd/')) { mcdRoutes++; errors.push(`${rel}:${i + 1}: transitional @mcd route (MCD is merged; use in-repo path): ${tok}`); }
      if (/^\.\.\/(multi_channel_design|global-content-os|channel-content-os)/.test(tok)) errors.push(`${rel}:${i + 1}: use @gcos/@ccos/@mcd prefix, not raw ../ sibling path: ${tok}`);
      const r = resolveToken(tok, dirname(f));
      if (r.skip) { notes.push(`${rel}:${i + 1}: sibling not checked out, skipped ${tok}`); continue; }
      if (r.missing || !existsSync(r.path)) errors.push(`${rel}:${i + 1}: broken pointer ${tok}`);
    }
  });
}

// INDEX coverage: every route block needs all four fields.
let routes = 0, complete = 0;
const routeTable = [];
const idx = join(ROOT, 'docs', 'INDEX.md');
if (existsSync(idx)) {
  const blocks = readFileSync(idx, 'utf8').split(/^### /m).slice(1);
  for (const b of blocks) {
    routes++;
    const name = b.split('\n')[0].trim();
    const get = (k) => (b.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1];
    const f = { read: get('READ'), opt: get('OPTIONAL'), no: get('DO NOT LOAD'), second: get('SECOND REPO') };
    if (f.read && f.opt && f.no && f.second && /^(YES|NO)\b/.test(f.second)) complete++;
    else errors.push(`docs/INDEX.md: route "${name}" missing READ/OPTIONAL/DO NOT LOAD/SECOND REPO`);
    routeTable.push({ name, read: f.read || '', second: f.second || '' });
  }
}

const FORBIDDEN_DEFAULT = [/_history\//, /\/archive\//, /legacy-cleanup\//, /\.generated\.json$/, /(^|\/)feeds\.json$/, /migrations\/0002_seed/, /\/fixtures\//, /rendered-examples\//, /\.(png|jpg|ttf|pem)$/, /SORUN-TESPIT/, /RUNTIME-AUDIT|RAPOR-1/];

if (simulate) {
  const base = ['AGENTS.md', 'docs/CORE.md', 'docs/CURRENT.md', 'docs/INDEX.md'];
  const cost = (f, range) => {
    if (!existsSync(f) || statSync(f).isDirectory()) return 0; // directory pointers cost nothing until a file is chosen
    const raw = readFileSync(f, 'utf8');
    if (!range) return Math.ceil(raw.length / 4);
    const [a, b = a] = range.split('-').map(Number);
    return Math.ceil(raw.split(/\r?\n/).slice(a - 1, b).join('\n').length / 4);
  };
  const baseCost = base.reduce((s, f) => s + cost(join(ROOT, f)), 0);
  console.log(`BASE (AGENTS+CORE+CURRENT+INDEX) ~${baseCost} tokens`);
  let fail = 0;
  for (const r of routeTable) {
    let total = baseCost, bad = [];
    for (const tok of r.read.match(/`[^`]+`/g) || []) {
      const t = tok.slice(1, -1);
      if (!pathLike(t)) continue;
      const rg = (t.match(/:(\d+(?:-\d+)?)$/) || [])[1];
      const res = resolveToken(t, ROOT);
      if (res.cross) continue; // cross-repo files are counted by their own repo's run
      total += cost(res.path, rg);
      if (FORBIDDEN_DEFAULT.some((re) => re.test(t) && !rg)) bad.push(t);
    }
    const ok = bad.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ~${String(total).padStart(6)} tok  cross-repo=${r.second.split(/\s/)[0]}  ${r.name}${bad.length ? '  FORBIDDEN: ' + bad.join(', ') : ''}`);
  }
  process.exit(fail ? 1 : 0);
}

const cov = routes ? Math.round((complete / routes) * 100) : 0;
for (const e of errors) console.error('BROKEN: ' + e);
for (const n of notes) console.log('note: ' + n);
console.log(`checked=${checked} routes=${routes} ROUTING_COVERAGE=${cov}%`);
console.log(`BROKEN_ROUTER_LINKS=${errors.length}`);
console.log(`TRANSITIONAL_MCD_ROUTES=${mcdRoutes}`);
process.exit(errors.length ? 1 : 0);
