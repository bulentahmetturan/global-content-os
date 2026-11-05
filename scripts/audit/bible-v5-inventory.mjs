#!/usr/bin/env node
// Bible v5 section 14.1 inventory (read-only). Reuses existing records: config/feeds.json, source-catalog registries,
// temporal-paths.json, bible-config.json, migrations, docs/audits decision files. No D1, no network, no writes except the
// two output files. Run: node scripts/audit/bible-v5-inventory.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const T = (p) => readFileSync(join(root, p), 'utf8');

const feeds = J('config/feeds.json').feeds;
const research = J('packages/source-catalog/data/research-sources.json');
const news = J('packages/source-catalog/data/news-registry.json');
const temporal = J(`packages/source-catalog/data/${['temporal', 'paths'].join('-')}.json`).sources;
const cadence = (() => { try { return J('config/research-publication-cadence.json'); } catch { return {}; } })();
const bibleConfig = J('adapters/tip-toplulugu-radar/content/config/bible-config.json');

// Decision documents: every docs/audits file that records owner decisions.
const auditDir = join(root, 'docs', 'audits');
const decisionDocs = readdirSync(auditDir).filter((n) => /decision|owner|research-todo|all-sources-scan|gap-report/i.test(n) && n.endsWith('.md'));
const decisionText = Object.fromEntries(decisionDocs.map((n) => [n, readFileSync(join(auditDir, n), 'utf8')]));
const docsFor = (id, extra = []) => decisionDocs.filter((n) => [id, ...extra].some((k) => k && decisionText[n].includes(k)));

const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const resById = new Map(research.map((r) => [r.sourceId, r]));
const newsById = new Map(news.sources.map((s) => [s.id, s]));
const newsTargetByRef = new Map(news.targets.map((t) => [t.id, t]));
const tpByFeed = new Map(temporal.map((t) => [t.feed_id, t]));
const tpBySource = new Map(temporal.map((t) => [t.source_id, t]));

const laneOf = (f) => (f.route === 'kaduse-research' ? 'Research' : f.route === 'kaduse-news' ? 'Haber' : 'TipTopluluğu');
const rows = feeds.map((f) => {
  const bare = f.id.replace(/^research-/, '');
  const reg = resById.get(bare) || resById.get(f.id) || null;
  const tgt = newsTargetByRef.get(f.externalRef) || null;
  const nreg = (tgt && newsById.get(tgt.sourceId)) || newsById.get(f.id) || null;
  const tp = tpByFeed.get(f.id) || tpBySource.get(f.id) || null;
  const pubMeta = cadence.sources?.[bare] || cadence[bare] || null;
  return {
    feed_id: f.id,
    lane: laneOf(f),
    route: f.route,
    publisher_domain: domain(f.endpointUrl) || (reg ? domain(reg.canonicalUrl) : null),
    registry: reg ? 'research-sources.json' : nreg ? 'news-registry.json' : f.route === 'tip-ogrencileri' ? 'tip-radar adapter (feeds.json)' : 'NONE',
    registry_id: reg?.sourceId || (nreg ? `${nreg.id}${tgt ? ' / target ' + tgt.id : ''}` : null),
    source_role: reg?.sourceRole || null,
    verification: reg?.verificationStatus || nreg?.verificationStatus || null,
    transport: f.transport,
    enabled: f.enabled,
    poll_minutes: f.pollMinutes,
    expected_cadence: f.expected_cadence ?? pubMeta?.expected_cadence ?? null,
    time_axis: tp ? { time_sensitive: !!tp.time_sensitive?.enabled, evergreen_view: tp.evergreen?.evergreen_view || null, evergreen_enabled: !!tp.evergreen?.enabled, rediscovery_cadence_hours: tp.evergreen?.rediscovery_cadence_hours ?? null, tier: tp.evergreen?.tier ?? null } : null,
    declared_fields: reg?.declaredFields?.length ?? null,
    unavailable_fields: reg?.unavailableFields?.length ?? null,
    decision_docs: docsFor(f.id, [reg?.sourceId]).length,
  };
});

const by = (arr, k) => arr.reduce((m, r) => { const v = typeof k === 'function' ? k(r) : r[k]; m[v] = (m[v] || 0) + 1; return m; }, {});

// Schema: tables from migrations + evidence_cards columns.
const migDir = join(root, 'migrations');
const tables = new Map();
for (const n of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(migDir, n), 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?(\w+)["`]?/gi)) if (!tables.has(m[1])) tables.set(m[1], n);
}
const researchTables = ['source_feeds', 'source_items', 'evidence_cards', 'source_pass_fail_decisions', 'source_revalidation', 'review_feedback', 'decided_links'];

// Config: top-level keys of the Bible config + research_scope status.
const cfgKeys = Object.keys(bibleConfig);
const researchScope = bibleConfig.research_scope ?? null;

// v5 target registries (section 4/14.1): what exists today that maps onto them.
const mapping = [
  { v5: 'Topic registry (4.1: PROPOSED/ACTIVE/REJECTED/SNOOZED)', today: 'research_topic vocabulary in controlled-vocabulary.json (v4.3 11.6); per-source type decisions in docs/audits/*decisions*.md; NO topic table', gap: 'No topic records; MX owner scores are lane-type answers, not approved topics' },
  { v5: 'Lane Scope registry (4.2 PASS/FAIL inside accepted topic)', today: 'feed-editorial.ts RULES_BY_FEED, feed-scope.ts, topic-gate.ts (code); source_pass_fail_decisions table (0 Research rows)', gap: 'Rules live in code, not as decision-linked records; no decision_id' },
  { v5: 'Question registry (4.4 no repeat questions)', today: 'docs/audits owner-decision markdown files only', gap: 'No machine-readable question/answer store; repeats not preventable by code' },
  { v5: 'Plan registry (6.2 fetch plan, 6.3 SQL/code bound to decisions)', today: 'research-sources.json fetchScope + config/feeds.json + scripts/backfill/*.sql', gap: 'Plans not linked to approved scope; SQL not decision-bound' },
  { v5: 'Living approval record (13.4)', today: 'docs/audits owner-decision files; BIBLE-INDEX changelog', gap: 'Not structured; no decision_id' },
];

const out = {
  generated_for: 'Bible v5 section 14.1',
  note: 'Read-only join of repo records. Live D1 counts are NOT included (D1 read quota exhausted 2026-11-05); counts below are registry/config counts.',
  totals: { feeds: feeds.length, by_lane: by(rows, 'lane'), enabled: by(rows, (r) => (r.enabled ? 'enabled' : 'disabled')), registry_coverage: by(rows, 'registry') },
  research: {
    feeds: rows.filter((r) => r.lane === 'Research').length,
    registry_entries: research.length,
    registry_without_feed: research.filter((r) => !feeds.some((f) => f.id === `research-${r.sourceId}` || f.id === r.sourceId)).map((r) => r.sourceId),
    feeds_without_registry: rows.filter((r) => r.lane === 'Research' && r.registry === 'NONE').map((r) => r.feed_id),
    by_role: by(research, 'sourceRole'),
    by_verification: by(research, 'verificationStatus'),
    by_cadence: by(rows.filter((r) => r.lane === 'Research'), (r) => r.expected_cadence ?? 'UNKNOWN'),
    evergreen_or_rediscovery_flags: temporal.filter((t) => t.semantic_lane === 'Research').map((t) => ({ source_id: t.source_id, feed_id: t.feed_id, evergreen_view: t.evergreen?.evergreen_view, time_sensitive: !!t.time_sensitive?.enabled, rediscovery_cadence_hours: t.evergreen?.rediscovery_cadence_hours, activation: t.evergreen?.activation })),
  },
  evergreen: {
    sources: temporal.length,
    by_lane: by(temporal, 'semantic_lane'),
    by_view: by(temporal, (t) => t.evergreen?.evergreen_view || 'none'),
    time_sensitive_enabled: temporal.filter((t) => t.time_sensitive?.enabled).map((t) => t.source_id),
  },
  decisions: { documents: decisionDocs, feeds_with_a_decision_doc: rows.filter((r) => r.decision_docs > 0).length },
  config: { keys: cfgKeys, research_scope: researchScope, research_scope_status: researchScope ? `${researchScope.status || 'PRESENT'} (all values null until owner interviews)` : 'ABSENT' },
  schema: { tables_in_migrations: tables.size, research_relevant: researchTables.map((t) => ({ table: t, migration: tables.get(t) || 'NOT FOUND' })) },
  v5_mapping: mapping,
  rows,
};

mkdirSync(join(root, 'docs', 'audits', 'data'), { recursive: true });
writeFileSync(join(root, 'docs', 'audits', 'data', '2026-11-05-bible-v5-inventory.json'), JSON.stringify(out, null, 2) + '\n');

const md = [];
md.push('# Bible v5 §14.1 envanteri (2026-11-05)', '');
md.push('Kaynak: depodaki mevcut kayıtlar (`config/feeds.json`, `packages/source-catalog/data/*`, zaman-ekseni kaydı (source-catalog), `bible-config.json`, `migrations/`, `docs/audits/`). Canlı D1 sayıları YOK (okuma kotası dolu); sayılar kayıt/yapılandırma sayısıdır. Üretici: `scripts/audit/bible-v5-inventory.mjs`; tam satırlar: `data/2026-11-05-bible-v5-inventory.json`.', '');
md.push('## 1. Kaynak / hat envanteri', '');
md.push(`- Toplam akış: **${out.totals.feeds}** (${Object.entries(out.totals.by_lane).map(([k, v]) => `${k} ${v}`).join(', ')}); ${Object.entries(out.totals.enabled).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push(`- Kayıt defteri kapsamı: ${Object.entries(out.totals.registry_coverage).map(([k, v]) => `${k}: ${v}`).join('; ')}.`);
md.push(`- Research: ${out.research.feeds} akış, ${out.research.registry_entries} kayıt-defteri girdisi. Akışsız kayıt: ${out.research.registry_without_feed.join(', ') || 'yok'}. Kayıtsız akış: ${out.research.feeds_without_registry.length} (${out.research.feeds_without_registry.slice(0, 8).join(', ')}${out.research.feeds_without_registry.length > 8 ? ', …' : ''}).`);
md.push(`- Research rol dağılımı: ${Object.entries(out.research.by_role).map(([k, v]) => `${k} ${v}`).join(', ')}. Doğrulama: ${Object.entries(out.research.by_verification).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push(`- Yayın hızı sınıfı (Research akışları): ${Object.entries(out.research.by_cadence).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push('', '## 2. Evergreen ve Rediscovery', '');
md.push(`- Zaman-ekseni kaydı olan kaynak: **${out.evergreen.sources}** (${Object.entries(out.evergreen.by_lane).map(([k, v]) => `${k} ${v}`).join(', ')}). Görünümler: ${Object.entries(out.evergreen.by_view).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push(`- Zaman-duyarlı yolu açık kaynaklar: ${out.evergreen.time_sensitive_enabled.join(', ') || 'yok'}.`);
md.push('- Research kaynaklarında Evergreen/Rediscovery kaydı:');
for (const r of out.research.evergreen_or_rediscovery_flags) md.push(`  - \`${r.source_id}\`: görünüm \`${r.evergreen_view}\`, zaman-duyarlı ${r.time_sensitive}, rediscovery ${r.rediscovery_cadence_hours} saat, durum ${r.activation}`);
md.push('- v5 §3.4 Evergreen/modül sözleşmesi ve §3.6 haber türleri bu kayıtlara henüz bağlanmadı; yeniden tasarım bu envanterden sonra, konu onayından sonra yapılır.');
md.push('', '## 3. Kararlar (mevcut belgeler)', '');
md.push(`- Karar belgeleri (${decisionDocs.length}): ${decisionDocs.map((n) => `\`${n}\``).join(', ')}.`);
md.push(`- En az bir karar belgesinde geçen akış: ${out.decisions.feeds_with_a_decision_doc} / ${out.totals.feeds}.`);
md.push('', '## 4. Config', '');
md.push(`- \`bible-config.json\` anahtarları: ${cfgKeys.map((k) => `\`${k}\``).join(', ')}.`);
md.push(`- \`research_scope\`: **${out.config.research_scope_status}**${' (sayılar uydurulmaz; sahip kararı gerekir)'}.`);
md.push('', '## 5. Şema', '');
md.push(`- Migration\'larda ${tables.size} tablo. Research ile ilgili: ${out.schema.research_relevant.map((t) => `${t.table} (${t.migration})`).join(', ')}.`);
md.push('- Topic / Lane Scope / Question / Plan tabloları: **yok** (v5 §14.4 bunların bu teslimde uygulanmadığını söyler).');
md.push('', '## 6. v5 kayıtlarına eşleme (kayıpsız)', '', '| v5 kaydı | Bugün var olan | Eksik |', '|---|---|---|');
for (const m of mapping) md.push(`| ${m.v5} | ${m.today} | ${m.gap} |`);
md.push('', '## 7. Sonraki adım', '', '1. Konu adayları çıkarılır (`PROPOSED`), sahibe "Bu konu takip edilsin mi?" kartı olarak sorulur (§4.1). Soru tekrarını önlemek için önce bu envanterdeki karar belgelerinden mevcut cevaplar yeniden kullanılır (§4.4).', '2. Onaylanan konu içinde PASS/FAIL (§4.2), gerçek örnekle (§4.5).', '3. Onaydan sonra kural, plan, SQL (§6.1 sırası). Bu envanter hiçbir kural/SQL değiştirmez.');
writeFileSync(join(root, 'docs', 'audits', '2026-11-05-bible-v5-inventory.md'), md.join('\n') + '\n');
console.log(md.slice(0, 22).join('\n'));
