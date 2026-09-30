/**
 * Sync all registered sources into config/feeds.json for Global Content OS.
 * Canonical inputs (Package 2: ALL source/runtime inputs are local to this repo; no sibling-repo reads):
 * - local runtime: packages/source-catalog/data/kaduse-subscriptions.json (which targets Kaduse subscribes to + acquisition scoping)
 * - local runtime: packages/source-catalog/data/news-registry.json
 * - local runtime: packages/source-catalog/data/research-sources.json
 * - local runtime: adapters/tip-toplulugu-radar/sources/official_sources.yaml
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Output directory (defaults to the repo root). Tests set SYNC_FEEDS_OUT_DIR to generate into a temp dir.
const outRoot = process.env.SYNC_FEEDS_OUT_DIR ? path.resolve(process.env.SYNC_FEEDS_OUT_DIR) : root;

const news = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/source-catalog/data/kaduse-subscriptions.json'), 'utf8')
);
// Data-first: the canonical catalogs are structured JSON. Nothing here parses TypeScript source.
const newsRegistry = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/source-catalog/data/news-registry.json'), 'utf8')
);
const researchRegistry = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/source-catalog/data/research-sources.json'), 'utf8')
);
const tipYaml = fs.readFileSync(
  path.join(root, 'adapters/tip-toplulugu-radar/sources/official_sources.yaml'),
  'utf8'
);

function unquote(v) {
  if (v == null) return null;
  let s = String(v).trim();
  // YAML sometimes yields "'https://..." or "'https://...'" (broken quoting).
  while (
    (s.startsWith("'") || s.startsWith('"')) &&
    s.length > 1
  ) {
    s = s.slice(1).trim();
  }
  while ((s.endsWith("'") || s.endsWith('"')) && s.length > 1) {
    s = s.slice(0, -1).trim();
  }
  return s || null;
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

if (!Array.isArray(newsRegistry.targets) || !Array.isArray(newsRegistry.sources)) {
  console.error('news-registry.json must contain targets[] and sources[]');
  process.exit(1);
}
const targets = newsRegistry.targets.map((t) => ({
  id: t.id,
  sourceId: t.sourceId,
  label: t.label,
  officialUrl: t.officialUrl || null,
  transportStatus: t.transportStatus,
}));
const byTarget = Object.fromEntries(targets.map((t) => [t.id, t]));

// Source-level official URLs (fallback when a target has no officialUrl)
const sourceUrls = {};
for (const s of newsRegistry.sources) {
  if (s.officialUrl) sourceUrls[s.id] = s.officialUrl;
}

const MANUAL_FALLBACK = {
  'resmi-gazete-health-scoped': 'https://www.resmigazete.gov.tr/fihrist',
  'eur-lex-mdr-ivdr-health-query':
    'https://eur-lex.europa.eu/search.html?scope=EURLEX&text=medical+device+OR+MDR+OR+IVDR&type=quick&lang=en',
};

// Disabled subscriptions stay as enabled=false rows so a retirement is visible and D1 is disabled, never orphaned.
const newsFeeds = news.subscriptions
  .map((s) => {
    const t = byTarget[s.targetId];
    const isWho = s.targetId === 'who-newsroom-whole';
    const endpointUrl = isWho
      ? 'https://www.who.int/api/news/newsitems'
      : t?.officialUrl ||
        MANUAL_FALLBACK[s.targetId] ||
        (t?.sourceId ? sourceUrls[t.sourceId] : null) ||
        null;
    return {
      id: `news-${s.targetId}`,
      label: t?.label || s.targetId,
      route: 'kaduse-news',
      channelId: 'kaduse-medikal',
      transport: isWho ? 'JSON_API' : t?.transportStatus || 'WEB_ONLY',
      endpointUrl,
      pollMinutes: isWho ? 60 : 360,
      enabled: s.enabled === true,
      externalRef: s.targetId,
      registrySourceId: s.sourceId,
      inclusionPolicy: s.inclusionPolicy || null,
      exclusionPolicy: s.exclusionPolicy || null,
      rules: isWho
        ? { limit: 20 }
        : {
            mode: 'registered',
            needsFetcher: true,
            inclusionPolicy: s.inclusionPolicy || null,
            exclusionPolicy: s.exclusionPolicy || null,
          },
    };
  });

// Also keep legacy who-newsroom id so dedicated ingest marks both rows.
newsFeeds.push({
  id: 'who-newsroom',
  label: 'WHO Newsroom JSON API',
  route: 'kaduse-news',
  channelId: 'kaduse-medikal',
  transport: 'JSON_API',
  endpointUrl: 'https://www.who.int/api/news/newsitems',
  pollMinutes: 60,
  enabled: true,
  externalRef: 'who-newsroom',
  rules: { limit: 20, aliasOf: 'news-who-newsroom-whole' },
});

const researchFeeds = [];
const seenResearch = new Set();
for (const rs of researchRegistry) {
  const id = rs.sourceId;
  if (seenResearch.has(id)) continue;
  seenResearch.add(id);
  const isEpmc = id === 'europe-pmc-rest';
  const isPubmed = id === 'pubmed-eutilities';
  researchFeeds.push({
    id: `research-${id}`,
    label: rs.publisher,
    route: 'kaduse-research',
    channelId: 'kaduse-medikal',
    transport: isEpmc || isPubmed ? 'REST_BATCH' : 'RESEARCH_REGISTRY',
    endpointUrl: rs.canonicalUrl,
    pollMinutes: isEpmc || isPubmed ? 360 : 1440,
    enabled: rs.verificationStatus !== 'EXCLUDE',
    externalRef: id,
    rules: isEpmc
      ? {
          query:
            'TITLE:auscultation OR TITLE:stethoscope OR ("artificial intelligence" AND medicine)',
          pageSize: 15,
        }
      : isPubmed
        ? {
            term: '(auscultation OR stethoscope OR ("artificial intelligence" AND medicine))',
            retmax: 15,
          }
        : { mode: 'registered' },
  });
}

if (!researchFeeds.some((f) => f.id === 'europe-pmc-batch')) {
  const epmc = researchFeeds.find((f) => f.id === 'research-europe-pmc-rest');
  if (epmc) {
    researchFeeds.push({
      ...epmc,
      id: 'europe-pmc-batch',
      label: 'Europe PMC batch (legacy id)',
      rules: { ...(epmc.rules || {}), aliasOf: 'research-europe-pmc-rest' },
    });
  }
}

const tipFeeds = [];
const blocks = tipYaml.split(/\n(?=- id:)/);
for (const block of blocks) {
  const id = (block.match(/^-?\s*id:\s*(\S+)/m) || [])[1];
  if (!id) continue;
  const name = unquote((block.match(/^\s*name:\s*(.+)$/m) || [])[1]?.trim());
  const url = unquote((block.match(/^\s*url:\s*(\S+)/m) || [])[1]);
  const enabled = /^\s*enabled:\s*true\s*$/m.test(block);
  const mins = Number((block.match(/check_every_minutes:\s*(\d+)/) || [])[1] || 1440);
  const category = (block.match(/^\s*category:\s*(\S+)/m) || [])[1] || null;
  tipFeeds.push({
    id: `tip-${id}`,
    label: name || id,
    route: 'tip-ogrencileri',
    channelId: 'tip-ogrencileri-platformu',
    transport: 'ADAPTER_PUSH',
    endpointUrl: url || null,
    pollMinutes: mins,
    // Global Content OS activates every registered tip source; radar yaml
    // may still disable polling for a few — Hub registry stays enabled.
    enabled: true,
    externalRef: id,
    rules: {
      adapter: 'adapters/tip-radar',
      radarSourceId: id,
      category,
      radarYamlEnabled: enabled,
    },
  });
}

// Keep a single logical tip-radar adapter feed for ingress push, plus per-source registry rows.
const tipAdapterFeed = {
  id: 'tip-radar-adapter',
  label: 'Tip Öğrencileri radar SQLite adapter',
  route: 'tip-ogrencileri',
  channelId: 'tip-ogrencileri-platformu',
  transport: 'ADAPTER_PUSH',
  endpointUrl: null,
  pollMinutes: 120,
  enabled: true,
  externalRef: 'tip-radar',
  rules: { adapter: 'adapters/tip-radar', statusFilter: ['review'] },
};

const feeds = [tipAdapterFeed, ...newsFeeds, ...researchFeeds, ...tipFeeds];

// Same publisher already listed under Tıp Topluluğu Duyuru (or Haber for MNT). Do not resurrect on sync.
// (Carried over from the 2026-09-29 18:09 gcos stash; without it a regeneration re-enables these.)
const RETIRED_DUPLICATE_FEED_IDS = new Set([
  'news-hsgm-news-scoped',
  'news-resmi-gazete-health-scoped',
  'news-titck-general-regulatory',
  'news-tuik-saglik-sosyal-koruma',
  'research-medical-news-today',
]);
for (const f of feeds) {
  if (RETIRED_DUPLICATE_FEED_IDS.has(f.id)) f.enabled = false;
}

// Batch R4 (2026-09-25) research sources were added to the catalog after the last activation.
// Registering them here must NOT silently activate new fetching: activation is an explicit runtime/editorial
// decision. sciencedaily.com additionally already exists under DUYURU (`sciencedaily_nutrition`), so enabling the
// three ScienceDaily research rows breaks the Bible one-heading-per-domain rule (S66) until a heading owner is chosen.
const PENDING_ACTIVATION_FEED_IDS = new Set([
  'research-nature-ageing-subject',
  'research-nature-nutrition-subject',
  'research-sciencedaily-healthy-aging',
  'research-sciencedaily-alternative-medicine',
  'research-sciencedaily-dietary-supplements',
  'research-asn-nutrition-news',
  'research-nccih-news',
]);
for (const f of feeds) {
  if (PENDING_ACTIVATION_FEED_IDS.has(f.id)) {
    f.enabled = false;
    f.rules = { ...(f.rules || {}), activation: 'PENDING_EXPLICIT_DECISION' };
  }
}

// Provenance: config/feeds.json is GENERATED, never hand-edited. Hashes are over LF-normalised bytes so they are
// identical on every checkout regardless of autocrlf.
const PROVENANCE_INPUTS = [
  'packages/source-catalog/data/news-registry.json',
  'packages/source-catalog/data/research-sources.json',
  'packages/source-catalog/data/kaduse-subscriptions.json',
  'adapters/tip-toplulugu-radar/sources/official_sources.yaml',
];
const sha256 = (rel) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(root, rel), 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex');

const out = {
  schemaVersion: '1.1.0',
  provenance: {
    generatedBy: 'scripts/sync-feeds.mjs',
    editable: false,
    inputs: PROVENANCE_INPUTS.map((p) => ({ path: p, sha256: sha256(p) })),
  },
  counts: {
    news: newsFeeds.length,
    research: researchFeeds.length,
    tipSources: tipFeeds.length,
    tipEnabled: tipFeeds.filter((f) => f.enabled).length,
    total: feeds.length,
    registryTargetsParsed: targets.length,
  },
  feeds,
};

fs.mkdirSync(path.join(outRoot, 'config'), { recursive: true });
fs.writeFileSync(path.join(outRoot, 'config/feeds.json'), JSON.stringify(out, null, 2));

// SQL seed migration: batched INSERTs (D1 rejects one giant statement)
const BATCH = 40;
const chunks = [];
for (let i = 0; i < feeds.length; i += BATCH) {
  const slice = feeds.slice(i, i + BATCH);
  const rows = slice.map((f) => {
    const rules = sqlEscape(JSON.stringify(f.rules ?? {}));
    const endpoint = f.endpointUrl ? `'${sqlEscape(f.endpointUrl)}'` : 'NULL';
    const ext = f.externalRef ? `'${sqlEscape(f.externalRef)}'` : 'NULL';
    return `('${sqlEscape(f.id)}', '${sqlEscape(f.label)}', '${sqlEscape(f.route)}', '${sqlEscape(f.channelId)}', '${sqlEscape(f.transport)}', ${endpoint}, ${Number(f.pollMinutes) || 360}, ${f.enabled ? 1 : 0}, ${ext}, '${rules}')`;
  });
  chunks.push(`INSERT OR REPLACE INTO source_feeds
  (id, label, route, channel_id, transport, endpoint_url, poll_minutes, enabled, external_ref, rules_json)
VALUES
${rows.join(',\n')};`);
}

const sql = `-- Auto-generated by scripts/sync-feeds.mjs — do not hand-edit
-- Seeds ALL registered feeds for kaduse-news / kaduse-research / tip-ogrencileri
-- Batched to avoid SQLITE_TOOBIG

${chunks.join('\n\n')}
`;

// migrations/0002_seed_all_feeds.sql is an APPLIED migration: regenerating it rewrites history, so it is only
// written on explicit request (SYNC_FEEDS_WRITE_SEED_MIGRATION=1). config/feeds.json is the generated output.
if (process.env.SYNC_FEEDS_WRITE_SEED_MIGRATION === '1') {
  fs.mkdirSync(path.join(outRoot, 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'migrations/0002_seed_all_feeds.sql'), sql);
}

console.log(JSON.stringify(out.counts, null, 2));
console.log('Wrote config/feeds.json (deterministic; no timestamp)');
