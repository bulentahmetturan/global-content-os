// The ONLY lifecycle write path into canonical source truth (Hekimler source-registry-*.json), plus the trace log.
// Guards (same shape as scripts/source-actions.mjs): operator/canonical-owner actor, `authorize` returning exactly
// true (fail closed), `apply === true`, and a byte-stable JSON round trip -- otherwise REQUIRES_MANUAL_EDIT + patch.
// Kaduse catalog stores are written only as a prepared change (catalog + feeds.json + forward migration file); the D1
// migration is never applied from here -- remote apply is the review/authorization gate.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const MUTATING_ACTORS = new Set(['operator', 'canonical_owner']);
const FEEDBACK_ACTORS = new Set(['feedback', 'pillar5', 'learning', 'relevance_ledger', 'machine']);

export function authorizeLifecycle({ actor, authorize, op }) {
  if (actor && FEEDBACK_ACTORS.has(actor.kind)) return { ok: false, code: 'FEEDBACK_CANNOT_MUTATE_SOURCE', detail: 'feedback produces reviewed proposals; a canonical owner action is required' };
  if (typeof authorize !== 'function') return { ok: false, code: 'AUTH_FAIL_CLOSED', detail: 'authorize is required' };
  let allowed = false;
  try {
    allowed = authorize(actor, op) === true;
  } catch {
    allowed = false;
  }
  if (!allowed || !MUTATING_ACTORS.has(actor?.kind)) return { ok: false, code: 'AUTH_FAIL_CLOSED', detail: 'operator or canonical owner authorization required' };
  return { ok: true };
}

export function readRegistry(root, file) {
  const raw = readFileSync(join(root, file), 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.split('\r\n').join('\n');
  const data = JSON.parse(text);
  const trailing = text.endsWith('\n');
  const stable = JSON.stringify(data, null, 2) + (trailing ? '\n' : '') === text;
  return { data, eol, trailing, stable };
}

export const getAt = (data, path) => path.split(/[.[\]]+/).filter(Boolean).reduce((o, k) => o?.[k], data);

/**
 * mutate(data) performs the in-memory change and returns a compact patch description.
 * Returns { outcome: DRY_RUN | APPLIED | REQUIRES_MANUAL_EDIT, file, patch }.
 */
export function commitCanonical({ root, file, mutate, apply = false, actor, authorize, op }) {
  if (!file.startsWith('adapters/hekimler-radar/content/source-registry-')) return { outcome: 'PLAN_ONLY', file, reason: 'not a lifecycle-writable canonical store' };
  const reg = readRegistry(root, file);
  const patch = mutate(reg.data);
  if (apply !== true) return { outcome: 'DRY_RUN', file, patch, writable: reg.stable };
  const auth = authorizeLifecycle({ actor, authorize, op });
  if (!auth.ok) return { outcome: 'DENIED', file, patch, ...auth };
  if (!reg.stable) return { outcome: 'REQUIRES_MANUAL_EDIT', file, patch, reason: 'file is not byte-stable under JSON round trip' };
  writeCanonicalFiles(root, [{ file, text: (JSON.stringify(reg.data, null, 2) + (reg.trailing ? '\n' : '')).split('\n').join(reg.eol) }]);
  return { outcome: 'APPLIED', file, patch };
}

// Kaduse lanes: catalog JSON, the regenerated config/feeds.json and the new forward migration (kaduse-change.mjs).
const KADUSE_WRITABLE = /^(packages\/source-catalog\/data\/[a-z-]+\.json|config\/feeds\.json|migrations\/\d{4}_source_lifecycle_[a-z0-9_]+\.sql)$/;

/** The single repo write path. Callers must have passed authorizeLifecycle and apply === true. */
export function writeCanonicalFiles(root, writes) {
  for (const w of writes) {
    if (!w.file.startsWith('adapters/hekimler-radar/content/source-registry-') && !KADUSE_WRITABLE.test(w.file)) throw new Error(`not a lifecycle-writable path: ${w.file}`);
    writeCanonical(join(root, w.file), w.text);
  }
}

function writeCanonical(abs, text) {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

/** Full per-operation trace: outside git and outside default agent context (.logs/ is ignored). */
export function writeTrace(root, trace) {
  const f = join(root, '.logs', 'source-lifecycle', `${trace.request_id}.json`);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(trace, null, 1));
  return f.slice(root.length + 1).split('\\').join('/');
}

/** Target registry file for a NEW Hekimler record (additive layers only; never phase1). */
export function targetFileFor({ heading, url }) {
  if (heading === 'BURS') return 'adapters/hekimler-radar/content/source-registry-burs-v1.json';
  if (heading === 'EGITIM') return 'adapters/hekimler-radar/content/source-registry-egitim-v1.json';
  return /\.tr$/.test(new URL(url).hostname) ? 'adapters/hekimler-radar/content/source-registry-v1.1.json' : 'adapters/hekimler-radar/content/source-registry-batch3.json';
}
