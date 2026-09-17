/**
 * Sync all registered sources into config/feeds.json for Global Content OS.
 * Sources of truth (not invented here):
 * - multi_channel_design/.../news-sources.json + channel-content-os global-source-registry.ts
 * - channel-content-os research/source-registry.ts
 * - tip-ogrencileri-platformu/sources/official_sources.yaml
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcd = path.join(root, '..', 'multi_channel_design');
const ccos = path.join(root, '..', 'channel-content-os');

const news = JSON.parse(
  fs.readFileSync(path.join(mcd, 'channels/kaduse-medikal/content/news-sources.json'), 'utf8')
);
const registryTs = fs.readFileSync(
  path.join(ccos, 'mcp-server/src/news/global-source-registry.ts'),
  'utf8'
);
const researchTs = fs.readFileSync(
  path.join(ccos, 'mcp-server/src/research/source-registry.ts'),
  'utf8'
);
const tipYaml = fs.readFileSync(
  path.join(mcd, 'channels/tip-ogrencileri-platformu/sources/official_sources.yaml'),
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

const targets = [];
const targetBlock = registryTs.match(/targets:\s*\[([\s\S]*?)\],\s*referenceResources/);
if (!targetBlock) {
  console.error('Could not find targets[] in global-source-registry.ts');
  process.exit(1);
}
const tre =
  /\{\s*id:\s*'([^']+)'\s*,\s*sourceId:\s*'([^']+)'\s*,\s*label:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")\s*,(?:\s*officialUrl:\s*'([^']+)',)?[\s\S]*?transportStatus:\s*'([^']+)'/g;
let m;
while ((m = tre.exec(targetBlock[1]))) {
  targets.push({
    id: m[1],
    sourceId: m[2],
    label: (m[3] || m[4] || '').replace(/\\'/g, "'").replace(/\\"/g, '"'),
    officialUrl: m[5] || null,
    transportStatus: m[6],
  });
}
const byTarget = Object.fromEntries(targets.map((t) => [t.id, t]));

// Source-level official URLs (fallback when a target has no officialUrl)
const sourceUrls = {};
const sre =
  /\{\s*id:\s*'([^']+)'[\s\S]*?officialUrl:\s*'([^']+)'/g;
let sm;
const sourcesBlock = registryTs.match(/sources:\s*\[([\s\S]*?)\],\s*targets:/);
if (sourcesBlock) {
  while ((sm = sre.exec(sourcesBlock[1]))) {
    sourceUrls[sm[1]] = sm[2];
  }
}

const MANUAL_FALLBACK = {
  'resmi-gazete-health-scoped': 'https://www.resmigazete.gov.tr/fihrist',
  'eur-lex-mdr-ivdr-health-query':
    'https://eur-lex.europa.eu/search.html?scope=EURLEX&text=medical+device+OR+MDR+OR+IVDR&type=quick&lang=en',
};

const newsFeeds = news.subscriptions
  .filter((s) => s.enabled)
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
      enabled: true,
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
const rre =
  /sourceId:\s*'([^']+)'[\s\S]*?publisher:\s*'((?:\\'|[^'])*)'[\s\S]*?canonicalUrl:\s*'([^']+)'/g;
while ((m = rre.exec(researchTs))) {
  const id = m[1];
  if (seenResearch.has(id)) continue;
  seenResearch.add(id);
  const isEpmc = id === 'europe-pmc-rest';
  const isPubmed = id === 'pubmed-eutilities';
  researchFeeds.push({
    id: `research-${id}`,
    label: m[2].replace(/\\'/g, "'"),
    route: 'kaduse-research',
    channelId: 'kaduse-medikal',
    transport: isEpmc || isPubmed ? 'REST_BATCH' : 'RESEARCH_REGISTRY',
    endpointUrl: m[3],
    pollMinutes: isEpmc || isPubmed ? 360 : 1440,
    enabled: true,
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

const out = {
  schemaVersion: '1.1.0',
  generatedAt: new Date().toISOString(),
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

fs.writeFileSync(path.join(root, 'config/feeds.json'), JSON.stringify(out, null, 2));

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

fs.writeFileSync(path.join(root, 'migrations/0002_seed_all_feeds.sql'), sql);

console.log(JSON.stringify(out.counts, null, 2));
console.log('Wrote config/feeds.json and migrations/0002_seed_all_feeds.sql');
