// Offboarding helpers (O2 in-flight policy, O5 source-exclusive artifact classification, O6 provenance, O7 purge plan).
// Nothing here deletes or mutates anything: it returns plans and classifications. deletions_performed is always 0.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEXT_EXT = /\.(json|py|mjs|js|ts|tsx|yml|yaml|md|sql|toml|html|txt|csv)$/i;
const SKIP_DIR = new Set(['node_modules', '.git', '.logs', '.wrangler', '__pycache__', '.pytest_cache', 'dist', 'coverage']);
// Generated derivative -> the generator that owns it (never hand-edited).
export const REGENERATE = {
  'config/feeds.json': 'node scripts/sync-feeds.mjs',
  'migrations/0002_seed_all_feeds.sql': 'node scripts/sync-feeds.mjs',
  'docs/source-matrix.generated.json': 'node scripts/source-matrix.mjs --out docs/source-matrix.generated.json',
  'apps/worker/src/ingress/tip-toplulugu-automation-ready.ts': 'cd adapters/tip-toplulugu-radar && python -c "from radar.tip_toplulugu_continuous_runner import write_worker_profile_bundle as w; w()"',
  'apps/worker/src/ingress/tip-toplulugu-automation-ready.json': 'cd adapters/tip-toplulugu-radar && python -c "from radar.tip_toplulugu_continuous_runner import write_worker_profile_bundle as w; w()"',
};
const GENERATED = new Set(Object.keys(REGENERATE));
export const TIP_TOPLULUGU_DERIVATIVES = ['apps/worker/src/ingress/tip-toplulugu-automation-ready.ts', 'docs/source-matrix.generated.json'];
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- O2: in-flight work -------------------------------------------------------------------------------------

/** Deterministic treatment using existing triage vocabulary (source_items.triage_status / editorial_decisions.action). */
export function inflightPlan(p, requestId) {
  const col = p.store === 'tip_toplulugu' ? 'source_id' : 'feed_id';
  const key = p.store === 'tip_toplulugu' ? p.source_id : p.feed_id || p.source_id;
  const where = `${col} = ${sqlStr(key)}`;
  return {
    policy: {
      inbox: 'HOLD (unreviewed candidates are held, not deleted; editorial_decisions row records actor source-lifecycle)',
      hold: 'KEEP',
      production: 'KEEP (already promoted; continues to completion)',
      trash: 'KEEP (done/deleted archive untouched)',
      approved_briefs: 'KEEP (handoff + CCOS production continue; provenance preserved)',
      published: 'KEEP (never touched)',
    },
    inspect_sql: [
      `SELECT triage_status, COUNT(*) AS n FROM source_items WHERE ${where} GROUP BY triage_status;`,
      `SELECT COUNT(*) AS briefs FROM approved_briefs b JOIN source_items s ON s.id = b.source_item_id WHERE s.${where};`,
    ],
    treatment_sql: [
      `INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) SELECT 'slr_' || id, id, 'hold', 'inbox', 'hold', ${sqlStr(`source-lifecycle:${requestId}:SOURCE_RETIRED`)} FROM source_items WHERE ${where} AND triage_status = 'inbox';`,
      `UPDATE source_items SET triage_status = 'hold', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${where} AND triage_status = 'inbox';`,
    ],
    execution: 'OPERATOR_D1_STEP -- not executed by this tool (no production mutation); idempotent (only inbox rows move)',
  };
}

// ---------- O5: artifact classification ----------------------------------------------------------------------------

function walk(root, dir = '', out = []) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, rel, out);
    else if (TEXT_EXT.test(e.name) && statSync(join(root, rel)).size < 8_000_000) out.push(rel);
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function classify(rel, p, nameHit) {
  if (rel === p.file) return { class: 'CANONICAL_RECORD', action: 'TOMBSTONE_KEEP' };
  if (GENERATED.has(rel)) return { class: 'GENERATED_DERIVATIVE', action: 'REGENERATE_FROM_CANONICAL', generator: REGENERATE[rel] };
  if (/^migrations\//.test(rel)) return { class: 'APPLIED_MIGRATION_HISTORY', action: 'KEEP' };
  if (/(^|\/)(archive|legacy-cleanup)\//.test(rel) || /SORUN-TESPIT|BIBLE/i.test(rel)) return { class: 'HISTORY', action: 'KEEP' };
  if (/(^|\/)sources\/_/.test(rel) && nameHit) return { class: 'SOURCE_EXCLUSIVE_CACHE', action: 'CLEANUP_CANDIDATE' };
  if (/(^|\/)fixtures?\//.test(rel)) return { class: nameHit ? 'SOURCE_EXCLUSIVE_FIXTURE' : 'SHARED_FIXTURE', action: nameHit ? 'CLEANUP_CANDIDATE' : 'KEEP' };
  if (/source-registry-|packages\/source-catalog\/data\//.test(rel)) return { class: 'CROSS_SOURCE_REFERENCE', action: 'KEEP' };
  if (/\/policies\/.*\.json$/.test(rel)) return { class: 'RUNTIME_POLICY_REFERENCE', action: 'INERT_AFTER_RETIRE_CLEANUP_CANDIDATE' };
  if (/(^|\/)(tests?\/|.*\.test\.)/.test(rel) || /test_/.test(rel.split('/').pop())) return { class: 'TEST_REFERENCE', action: 'KEEP' };
  if (/\.github\/workflows\/|wrangler\.toml$/.test(rel)) return { class: 'RUNTIME_CONFIG_REFERENCE', action: 'REVIEW' };
  if (/\.(py|ts|tsx|mjs|js)$/.test(rel)) return { class: 'SHARED_CODE_REFERENCE', action: 'KEEP_REVIEW' };
  if (/\.md$/.test(rel)) return { class: 'DOCUMENTATION', action: 'KEEP' };
  return { class: 'OTHER_REFERENCE', action: 'KEEP_REVIEW' };
}

export function classifyArtifacts({ root, projection: p, record, projections, files = null }) {
  const id = p.source_id;
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(id)}(?![A-Za-z0-9_-])`);
  const envRe = new RegExp(`\\b${escapeRe(id.toUpperCase().replace(/-/g, '_'))}_[A-Z0-9_]+\\b`);
  // A file name belongs to the LONGEST source id it starts with ("abc_x_2_list.json" is abc_x_2's, not abc_x's).
  const ids = [...new Set([id, ...projections.map((x) => x.source_id)])].sort((a, b) => b.length - a.length);
  const ownerOfName = (n) => ids.find((x) => n === x || (n.startsWith(x) && /[._-]/.test(n[x.length])));
  const refs = [];
  const secrets = [];
  for (const rel of files || walk(root)) {
    const base = rel.split('/').pop();
    const nameHit = ownerOfName(base) === id || re.test(base);
    let body = '';
    try {
      body = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (!nameHit && !re.test(body)) {
      if (/\.github\/workflows\/|wrangler\.toml$|\.example$/.test(rel) && envRe.test(body)) secrets.push({ path: rel, name: body.match(envRe)[0] });
      continue;
    }
    refs.push({ path: rel, ...classify(rel, p, nameHit) });
    if (/\.github\/workflows\/|wrangler\.toml$/.test(rel) && envRe.test(body)) secrets.push({ path: rel, name: body.match(envRe)[0] });
  }
  const parser = record?.parser_profile
    ? (() => {
        const users = projections.filter((x) => x.source_id !== id && x.store === 'tip_toplulugu' && x._parser_profile === record.parser_profile);
        return { profile: record.parser_profile, other_users: users.length, action: users.length ? 'KEEP_SHARED' : 'CLEANUP_CANDIDATE' };
      })()
    : { profile: record?.fetch_mode || record?.transport || 'generic', other_users: 'GENERIC_RUNTIME_PARSER', action: 'KEEP_SHARED' };
  const dependents = projections.filter((x) => x.source_id !== id && (x._upstream || []).includes(id)).map((x) => x.source_id);
  const counts = {};
  for (const r of refs) counts[r.action] = (counts[r.action] || 0) + 1;
  return {
    references: refs.slice(0, 40),
    references_total: refs.length,
    action_counts: counts,
    parser,
    external_secrets: secrets.map((s) => ({ ...s, action: 'NEVER_AUTO_DELETE' })),
    dependents: dependents.map((d) => ({ source_id: d, action: 'KEEP (another source references this one)' })),
    deletions_performed: 0,
  };
}

// ---------- O6: provenance -----------------------------------------------------------------------------------------

export const PRESERVED = [
  'canonical registry record (tombstone: identity, URLs, former role/heading, retirement reason/time/change ref)',
  'source_items rows and their evidence_cards / source_routes / editorial_decisions (ON DELETE CASCADE -> never delete source_items)',
  'approved_briefs + handoff/status callback history',
  'review_feedback, relevance ledger, source_pass_fail_decisions, source_revalidation',
  'tip_toplulugu_source_telemetry row (last success/error history)',
  'git history of the canonical change (lifecycle_history.change_ref)',
];

// ---------- O7: purge plan (dry run only) --------------------------------------------------------------------------

export function purgePlan(p, artifacts) {
  const col = p.store === 'tip_toplulugu' ? 'source_id' : 'feed_id';
  const key = p.store === 'tip_toplulugu' ? p.source_id : p.feed_id || p.source_id;
  return {
    mode: 'DRY_RUN_PLAN_ONLY',
    execution: 'NOT_IMPLEMENTED_IN_FEATURE_TRACK (remote/production purge is out of scope; requires explicit purge intent + legal/data-retention reason)',
    precondition: p.retired ? 'OK: source is RETIRED' : 'BLOCKED: retire first (purge is never inferred from "stop using")',
    dependency_report: {
      canonical_record: `${p.file}:${p.path}`,
      d1_dependency_sql: [
        `SELECT COUNT(*) FROM source_items WHERE ${col} = ${sqlStr(key)};`,
        `SELECT COUNT(*) FROM approved_briefs b JOIN source_items s ON s.id = b.source_item_id WHERE s.${col} = ${sqlStr(key)};`,
        `SELECT COUNT(*) FROM review_feedback WHERE ${col} = ${sqlStr(key)};`,
      ],
      fk_hazards: [
        'source_items.feed_id REFERENCES source_feeds(id): deleting a source_feeds row orphans/blocks items',
        'evidence_cards, source_routes, editorial_decisions ON DELETE CASCADE from source_items: deleting items destroys editorial history',
        'approved_briefs.source_item_id REFERENCES source_items(id): any brief makes item purge a provenance break',
      ],
      artifacts: artifacts ? { references_total: artifacts.references_total, action_counts: artifacts.action_counts, external_secrets: artifacts.external_secrets.length } : null,
    },
    provenance_blockers: 'Any approved_brief or published item -> PURGE must keep a provenance stub (source name, URL, retirement ref).',
  };
}
