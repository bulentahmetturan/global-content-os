// The ONLY lifecycle write path into canonical source truth (Tıp Topluluğu source-registry-*.json), plus the trace log.
// Guards (same shape as scripts/source-actions.mjs): operator/canonical-owner actor, `authorize` returning exactly
// true (fail closed), `apply === true`, and a byte-stable JSON round trip -- otherwise REQUIRES_MANUAL_EDIT + patch.
// Kaduse catalog stores are written only as a prepared change (catalog + feeds.json + forward migration file); the D1
// migration is never applied from here -- remote apply is the review/authorization gate.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const POOL_FILE = /^adapters\/tip-toplulugu-radar\/content\/(burs|egitim)\/pool\.json$/;
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
export function commitCanonical({ root, file, mutate, apply = false, actor, authorize, op, companions = [] }) {
  if (!file.startsWith('adapters/tip-toplulugu-radar/content/source-registry-')) return { outcome: 'PLAN_ONLY', file, reason: 'not a lifecycle-writable canonical store' };
  const reg = readRegistry(root, file);
  const patch = mutate(reg.data);
  // Companion mirrors (Burs/Eğitim central pool lists every registry source id): same transaction, same guards.
  const comp = companions.map((c) => {
    if (!POOL_FILE.test(c.file)) throw new Error(`not a lifecycle companion path: ${c.file}`);
    const r = readRegistry(root, c.file);
    c.mutate(r.data);
    return { ...c, reg: r };
  });
  if (apply !== true) return { outcome: 'DRY_RUN', file, patch, writable: reg.stable && comp.every((c) => c.reg.stable) };
  const auth = authorizeLifecycle({ actor, authorize, op });
  if (!auth.ok) return { outcome: 'DENIED', file, patch, ...auth };
  const unstable = !reg.stable ? file : comp.find((c) => !c.reg.stable)?.file;
  if (unstable) return { outcome: 'REQUIRES_MANUAL_EDIT', file, patch, reason: `${unstable} is not byte-stable under JSON round trip` };
  const text = (r) => (JSON.stringify(r.data, null, 2) + (r.trailing ? '\n' : '')).split('\n').join(r.eol);
  writeCanonicalFiles(root, [{ file, text: text(reg) }, ...comp.map((c) => ({ file: c.file, text: text(c.reg) }))]);
  return { outcome: 'APPLIED', file, patch };
}

// Kaduse lanes: catalog JSON, the regenerated config/feeds.json and the new forward SQL in scripts/ops (kaduse-change.mjs); never migrations/.
const KADUSE_WRITABLE = /^(packages\/source-catalog\/data\/[a-z-]+\.json|config\/feeds\.json|scripts\/ops\/\d{4}-\d{2}-\d{2}-pending-source_lifecycle_[a-z0-9_]+\.sql)$/;

/** The single repo write path. Callers must have passed authorizeLifecycle and apply === true. */
export function writeCanonicalFiles(root, writes) {
  for (const w of writes) {
    if (!w.file.startsWith('adapters/tip-toplulugu-radar/content/source-registry-') && !POOL_FILE.test(w.file) && !KADUSE_WRITABLE.test(w.file)) throw new Error(`not a lifecycle-writable path: ${w.file}`);
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

/**
 * Target registry file for a NEW Tıp Topluluğu record (additive layers only; never phase1).
 * source-registry-v1.1.json is a CLOSED set (load_v11_registry requires exactly its 23 approved_source_ids, in order), so a new
 * record can never be added there -- doing so broke the registry load for every later source. Duyuru goes to the additive layer.
 */
export function targetFileFor({ heading }) {
  if (heading === 'BURS') return 'adapters/tip-toplulugu-radar/content/source-registry-burs-v1.json';
  if (heading === 'EGITIM') return 'adapters/tip-toplulugu-radar/content/source-registry-egitim-v1.json';
  return 'adapters/tip-toplulugu-radar/content/source-registry-batch3.json';
}

