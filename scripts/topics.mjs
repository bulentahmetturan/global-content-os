#!/usr/bin/env node
// Topic registry tool (Bible v5 sections 4.1, 4.6, 13.4). Source of truth for topics lives under topics/<lane>/.
// A topic is added once, grows only by appending, and every change leaves a ledger row so nothing the owner gave is lost.
//   node scripts/topics.mjs check [--root DIR]                         validate files, ids, ledger, append-only vs git base
//   node scripts/topics.mjs new <lane> <ID> "<name>" --decision <DEC>  scaffold a topic (+ index entry + ledger row)
//   node scripts/topics.mjs add-sub <ID> <CLUSTER> "<name>" "<t1;t2>" <A|B|C> [--list <label>]   append a sub-topic (next id)
//   node scripts/topics.mjs add-cluster <ID> <K..> "<name>"            append a cluster
//   node scripts/topics.mjs sync [--root DIR]                          append missing ledger rows (never edits old rows)
//   node scripts/topics.mjs build [--check] [--root DIR]               write the derived classifier plan (deterministic)
// Nothing here talks to D1 or the network. The derived plan is not read by the Worker yet (status DRAFT_NOT_WIRED).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const STATES = new Set(['PROPOSED', 'ACTIVE', 'REJECTED', 'SNOOZED', 'NOT_RESEARCH_TOPIC', 'NOT_A_TOPIC']);
const TIERS = new Set(['A', 'B', 'C']);
const TODAY = () => new Date().toISOString().slice(0, 10);

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; }
export function topicsRoot(root) { return join(root, 'topics'); }
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };

export function readLedger(root) {
  const p = join(topicsRoot(root), 'LEDGER.ndjson');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function appendLedger(root, rows) {
  if (!rows.length) return;
  const p = join(topicsRoot(root), 'LEDGER.ndjson');
  const prev = existsSync(p) ? readFileSync(p, 'utf8') : '';
  writeFileSync(p, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

export function loadAll(root) {
  const lanes = existsSync(topicsRoot(root)) ? readdirSync(topicsRoot(root), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name) : [];
  const out = [];
  for (const lane of lanes) {
    const ip = join(topicsRoot(root), lane, '_index.json');
    if (!existsSync(ip)) continue;
    const index = readJson(ip);
    const topics = [];
    for (const t of index.topics) {
      if (t.file) topics.push({ entry: t, file: join(topicsRoot(root), lane, t.file), doc: readJson(join(topicsRoot(root), lane, t.file)) });
      else topics.push({ entry: t, file: null, doc: null });
    }
    out.push({ lane, indexPath: ip, index, topics });
  }
  return out;
}

export function validate(root, { base = null } = {}) {
  const errors = [];
  const ledger = readLedger(root);
  ledger.forEach((r, i) => { if (r.seq !== i + 1) errors.push(`ledger: seq ${r.seq} at line ${i + 1} (expected ${i + 1})`); });
  const topicStateRows = new Set(ledger.filter((r) => r.kind === 'TOPIC_STATE').map((r) => `${r.id}|${r.text.split(':')[0]}`));
  const subRows = new Set(ledger.filter((r) => r.kind === 'SUBTOPIC_ADDED').map((r) => r.id));
  const clusterRows = new Set(ledger.filter((r) => r.kind === 'CLUSTER_ADDED').map((r) => r.id));
  const relRows = new Set(ledger.filter((r) => r.kind === 'RELATION_ADDED').map((r) => r.id));
  const seenTopic = new Set();
  for (const { lane, topics } of loadAll(root)) {
    for (const { entry, doc } of topics) {
      if (seenTopic.has(entry.topic_id)) errors.push(`${lane}: duplicate topic_id ${entry.topic_id}`);
      seenTopic.add(entry.topic_id);
      if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(entry.topic_id)) errors.push(`${entry.topic_id}: topic_id must be upper-case letters, digits, '-'`);
      if (!STATES.has(entry.state)) errors.push(`${entry.topic_id}: bad state ${entry.state}`);
      if (!entry.decision_ref) errors.push(`${entry.topic_id}: decision_ref missing (every topic needs an owner decision id)`);
      if (!topicStateRows.has(`${entry.topic_id}|${entry.state}`)) errors.push(`${entry.topic_id}: no ledger TOPIC_STATE row for state ${entry.state} (run: sync)`);
      if (!doc) continue; // decided topic whose sub-topic list is still to come: allowed, listed by `check` as pending
      if (doc.topic_id !== entry.topic_id) errors.push(`${entry.topic_id}: file topic_id mismatch (${doc.topic_id})`);
      if (doc.state !== entry.state) errors.push(`${entry.topic_id}: index state ${entry.state} differs from file state ${doc.state}`);
      const clusters = new Set();
      for (const c of doc.clusters || []) {
        if (!/^K\d+$/.test(c.id)) errors.push(`${entry.topic_id}: bad cluster id ${c.id}`);
        if (clusters.has(c.id)) errors.push(`${entry.topic_id}: duplicate cluster ${c.id}`);
        clusters.add(c.id);
      }
      const ids = new Set();
      const prefix = `${entry.topic_id}-`;
      let last = 0;
      for (const s of doc.subtopics || []) {
        const m = new RegExp(`^${prefix}(\\d{3})$`).exec(s.id);
        if (!m) { errors.push(`${entry.topic_id}: bad subtopic id ${s.id}`); continue; }
        if (ids.has(s.id)) errors.push(`${entry.topic_id}: duplicate subtopic id ${s.id}`);
        ids.add(s.id);
        const n = Number(m[1]);
        if (n !== last + 1) errors.push(`${entry.topic_id}: ids must be contiguous and append-only (${s.id} after ${prefix}${String(last).padStart(3, '0')})`);
        last = n;
        if (!clusters.has(s.cluster)) errors.push(`${s.id}: unknown cluster ${s.cluster}`);
        if (!TIERS.has(s.priority_tier)) errors.push(`${s.id}: priority_tier must be A/B/C`);
        if (!STATES.has(s.state)) errors.push(`${s.id}: bad state ${s.state}`);
        if (!s.name_tr || !Array.isArray(s.search_terms_en) || !s.search_terms_en.length || s.search_terms_en.some((t) => typeof t !== 'string' || !t.trim())) errors.push(`${s.id}: name_tr and non-empty search_terms_en required`);
        if (!subRows.has(s.id)) errors.push(`${s.id}: no ledger SUBTOPIC_ADDED row (run: sync)`);
      }
      for (const c of doc.clusters || []) if (!clusterRows.has(`${entry.topic_id}:${c.id}`) && !(doc.subtopics || []).length) errors.push(`${entry.topic_id}: cluster ${c.id} has no ledger row`);
      if (doc.counts && doc.counts.subtopics !== (doc.subtopics || []).length) errors.push(`${entry.topic_id}: counts.subtopics ${doc.counts.subtopics} != ${(doc.subtopics || []).length}`);
      // Relations: owner-detailed "X–uyku" links with their own detail text; each points at existing sub-topics (no orphan).
      const groups = new Set((doc.relation_groups || []).map((g) => g.id));
      let lastR = 0;
      const relIds = new Set();
      for (const r of doc.relations || []) {
        const m = new RegExp(`^${prefix}R(\\d{2,3})$`).exec(r.id);
        if (!m) { errors.push(`${entry.topic_id}: bad relation id ${r.id}`); continue; }
        if (relIds.has(r.id)) errors.push(`${entry.topic_id}: duplicate relation id ${r.id}`);
        relIds.add(r.id);
        if (Number(m[1]) !== lastR + 1) errors.push(`${entry.topic_id}: relation ids must be contiguous and append-only (${r.id})`);
        lastR = Number(m[1]);
        if (r.group && !groups.has(r.group)) errors.push(`${r.id}: unknown relation group ${r.group}`);
        if (!r.name_tr || !r.details_tr) errors.push(`${r.id}: name_tr and details_tr (owner text) required`);
        if (!Array.isArray(r.maps_to) || !r.maps_to.length) errors.push(`${r.id}: maps_to must list at least one sub-topic`);
        for (const s of r.maps_to || []) if (!ids.has(s)) errors.push(`${r.id}: maps_to unknown sub-topic ${s}`);
        if (!Array.isArray(r.search_terms_en) || !r.search_terms_en.length || r.search_terms_en.some((t) => typeof t !== 'string' || !t.trim())) errors.push(`${r.id}: non-empty search_terms_en required`);
        if (!STATES.has(r.state)) errors.push(`${r.id}: bad state ${r.state}`);
        if (!relRows.has(r.id)) errors.push(`${r.id}: no ledger RELATION_ADDED row (run: sync)`);
      }
      if (doc.counts && doc.relations && doc.counts.relations !== doc.relations.length) errors.push(`${entry.topic_id}: counts.relations ${doc.counts.relations} != ${doc.relations.length}`);
    }
  }
  if (base) {
    // Append-only: the base ledger must be an exact prefix of the current ledger; base ids may never disappear.
    const baseLines = base.ledger;
    ledger.slice(0, baseLines.length).forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(baseLines[i])) errors.push(`ledger: row ${i + 1} was changed (ledger is append-only)`); });
    if (ledger.length < baseLines.length) errors.push('ledger: rows were removed (ledger is append-only)');
    for (const id of base.subIds) if (!subRows.has(id)) errors.push(`${id}: sub-topic existed on the base branch and is gone (REJECT/SNOOZE it instead of deleting)`);
    const live = new Set(loadAll(root).flatMap((l) => l.topics).flatMap((t) => [...((t.doc && t.doc.subtopics) || []), ...((t.doc && t.doc.relations) || [])].map((x) => x.id)));
    for (const id of [...base.subIds, ...(base.relIds || [])]) if (!live.has(id)) errors.push(`${id}: existed on the base branch and is missing from topic files (REJECT/SNOOZE it instead of deleting)`);
  }
  return errors;
}

function gitBase(root) {
  for (const ref of ['origin/main', 'main']) {
    try {
      const txt = execFileSync('git', ['-C', root, 'show', `${ref}:topics/LEDGER.ndjson`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const ledger = txt.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return { ref, ledger, subIds: ledger.filter((r) => r.kind === 'SUBTOPIC_ADDED').map((r) => r.id), relIds: ledger.filter((r) => r.kind === 'RELATION_ADDED').map((r) => r.id) };
    } catch { /* ref or file absent: first introduction, nothing to compare */ }
  }
  return null;
}

export function sync(root) {
  const ledger = readLedger(root);
  let seq = ledger.length;
  const have = new Set(ledger.map((r) => `${r.kind}|${r.id}|${r.kind === 'TOPIC_STATE' ? r.text.split(':')[0] : ''}`));
  const rows = [];
  const push = (kind, id, ref, text) => { rows.push({ seq: ++seq, at: TODAY(), kind, id, ref, text }); };
  for (const { topics } of loadAll(root)) {
    for (const { entry, doc } of topics) {
      if (!have.has(`TOPIC_STATE|${entry.topic_id}|${entry.state}`)) push('TOPIC_STATE', entry.topic_id, entry.decision_ref, `${entry.state}: ${entry.name_tr}`);
      if (!doc) continue;
      for (const c of doc.clusters || []) if (!have.has(`CLUSTER_ADDED|${entry.topic_id}:${c.id}|`) && !(doc.subtopics || []).some((s) => s.cluster === c.id)) push('CLUSTER_ADDED', `${entry.topic_id}:${c.id}`, doc.decision_ref, c.name_tr);
      for (const s of doc.subtopics || []) if (!have.has(`SUBTOPIC_ADDED|${s.id}|`)) push('SUBTOPIC_ADDED', s.id, s.decision_ref || doc.decision_ref, `${s.source_list || 'manual'} / ${s.cluster}: ${s.name_tr}`);
      for (const r of doc.relations || []) if (!have.has(`RELATION_ADDED|${r.id}|`)) push('RELATION_ADDED', r.id, r.decision_ref || doc.decision_ref, `${r.source_list || 'manual'} / ${r.group || '-'}: ${r.name_tr} -> ${r.maps_to.join(',')}`);
    }
  }
  appendLedger(root, rows);
  return rows.length;
}

// Derived, deterministic classifier plan: term -> sub-topics and one query bundle per cluster. Budget numbers stay null (owner Config).
export function buildPlan(root) {
  const topics = [];
  for (const { lane, topics: ts } of loadAll(root)) {
    for (const { entry, doc } of ts) {
      if (!doc || entry.state !== 'ACTIVE') continue;
      const termMap = {};
      const bundles = {};
      for (const s of doc.subtopics) {
        if (s.state !== 'ACTIVE') continue;
        for (const t of s.search_terms_en) {
          const k = t.trim().toLowerCase();
          (termMap[k] ||= []).push(s.id);
          (bundles[s.cluster] ||= new Set()).add(k);
        }
      }
      const relTerms = {};
      const relations = {};
      for (const r of doc.relations || []) {
        if (r.state !== 'ACTIVE') continue;
        relations[r.id] = { name_tr: r.name_tr, group: r.group || null, maps_to: [...r.maps_to].sort() };
        for (const t of r.search_terms_en) (relTerms[t.trim().toLowerCase()] ||= []).push(r.id);
      }
      topics.push({
        lane, topic_id: entry.topic_id, decision_ref: doc.decision_ref,
        relation_count: Object.keys(relations).length,
        relations,
        term_to_relations: Object.fromEntries(Object.keys(relTerms).sort().map((k) => [k, relTerms[k].sort()])),
        study_design_rule: doc.study_design_rule ? doc.study_design_rule.decision_ref : null,
        subtopic_count: doc.subtopics.filter((s) => s.state === 'ACTIVE').length,
        tiers: Object.fromEntries(['A', 'B', 'C'].map((k) => [k, doc.subtopics.filter((s) => s.state === 'ACTIVE' && s.priority_tier === k).map((s) => s.id)])),
        term_to_subtopics: Object.fromEntries(Object.keys(termMap).sort().map((k) => [k, termMap[k].sort()])),
        cluster_query_bundles: Object.fromEntries(Object.keys(bundles).sort().map((c) => [c, [...bundles[c]].sort()])),
        fetch_budget: { max_queries_per_run: null, publication_window_days: null, note: 'OWNER_PENDING (research_scope); never invented' },
      });
    }
  }
  return { schema: 'gcos-topic-plan/1', status: 'DRAFT_NOT_WIRED', generated_by: 'scripts/topics.mjs build', topics: topics.sort((a, b) => a.topic_id.localeCompare(b.topic_id)) };
}

// Source coverage map (Bible 5.5 order, 6.2 plan by source capability). Source-agnostic: every ACTIVE topic applies to every
// discovery-capable source; the method follows the source, never the topic. A new source appears here after it is added to the
// registry and `build` is re-run. Enrichment/integrity/attention roles never discover topics (14.2).
const DISCOVERY_ROLES = new Set(['PRIMARY_RESEARCH_PUBLISHER', 'ACCESSIBLE_SCIENCE_MEDIA', 'RESEARCH_INDEX', 'OPEN_FULL_TEXT', 'SYSTEMATIC_EVIDENCE', 'TRIAL_REGISTRY']);
export function buildCoverage(root) {
  const regPath = join(root, 'packages', 'source-catalog', 'data', 'research-sources.json');
  const feedsPath = join(root, 'config', 'feeds.json');
  if (!existsSync(regPath) || !existsSync(feedsPath)) return { schema: 'gcos-topic-source-coverage/1', status: 'DRAFT_NOT_WIRED', sources: [], summary: {}, note: 'registry not present in this root' };
  const reg = readJson(regPath);
  const feeds = new Map(readJson(feedsPath).feeds.map((f) => [f.id, f]));
  const sources = reg.map((r) => {
    const feed = feeds.get(`research-${r.sourceId}`) || feeds.get(r.sourceId) || null;
    const kind = r.fetchScope && r.fetchScope.kind;
    let method;
    if (r.verificationStatus === 'EXCLUDE') method = 'excluded';
    else if (!DISCOVERY_ROLES.has(r.sourceRole)) method = 'enrichment_only';
    else if (!feed || !feed.enabled) method = 'disabled_or_unfetched';
    else method = kind === 'query' ? 'api_query_then_local_filter' : 'feed_then_local_filter';
    return { source_id: r.sourceId, role: r.sourceRole, verification: r.verificationStatus, enabled: !!(feed && feed.enabled), method, filter_surface: (r.declaredFields || []).includes('abstract') ? 'title_and_abstract' : 'title_only', cadence: feed ? (feed.expected_cadence || 'UNKNOWN') : null };
  }).sort((a, b) => a.source_id.localeCompare(b.source_id));
  const summary = {};
  for (const x of sources) summary[x.method] = (summary[x.method] || 0) + 1;
  return { schema: 'gcos-topic-source-coverage/1', status: 'DRAFT_NOT_WIRED', generated_by: 'scripts/topics.mjs build', rules: ['Tercih sırası resmî API, RSS/Atom, sitemap+HTML, manuel (Bible 5.5); kaynağın desteklemediği arama özelliği ona atfedilmez (6.2).', 'Aynı nesne konu başına çoğaltılmaz; tek nesne çoklu konu ilişkisi taşır (6.2).', 'Kaynakta ifade edilemeyen sınır yerel filtre ve kanıt kapısında uygulanır (6.2).'], summary, sources };
}
// Worker runtime plan (apps/worker/src/topics/plan.generated.ts): ACTIVE topics with anchors, other senses and units
// (sub-topics + relations) as raw terms; the Worker tokenises/stems them once per isolate. Version = content hash, so a
// tag row always says which plan produced it (§1.3 cache key, §6.9 plan version).
export function buildWorkerPlan(root) {
  const rolloutPath = join(topicsRoot(root), 'rollout.json');
  const r = existsSync(rolloutPath) ? readJson(rolloutPath) : { mode: 'off', routes: [], feeds: [] };
  const topics = [];
  for (const { topics: ts } of loadAll(root)) {
    for (const { entry, doc } of ts) {
      if (!doc || entry.state !== 'ACTIVE' || !(doc.anchor_terms_en || []).length) continue;
      const units = [
        ...doc.subtopics.filter((s) => s.state === 'ACTIVE').map((s) => ({ id: s.id, kind: 'subtopic', cluster: s.cluster, tier: s.priority_tier, name: s.name_tr, terms: s.search_terms_en })),
        ...(doc.relations || []).filter((x) => x.state === 'ACTIVE').map((x) => ({ id: x.id, kind: 'relation', cluster: null, tier: null, name: x.name_tr, maps: x.maps_to, terms: x.search_terms_en })),
      ];
      topics.push({ topicId: entry.topic_id, name: doc.name_tr, decision: doc.decision_ref, clusters: doc.clusters.map((c) => ({ id: c.id, name: c.name_tr })), anchors: doc.anchor_terms_en, otherSenses: doc.other_senses_en || [], units });
    }
  }
  topics.sort((a, b) => a.topicId.localeCompare(b.topicId));
  const body = { rollout: { mode: r.mode, routes: r.routes || [], feeds: r.feeds || [] }, clarity: { min_examples_per_class: r.clarity && Number.isInteger(r.clarity.min_examples_per_class) ? r.clarity.min_examples_per_class : null }, topics };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { version, ...body };
}
export function workerPlanSource(root) {
  const plan = buildWorkerPlan(root);
  return `// Generated by scripts/topics.mjs build from topics/ (do not edit by hand).\n`
    + `export interface TopicPlanUnit { id: string; kind: 'subtopic' | 'relation'; cluster: string | null; tier: string | null; name: string; maps?: string[]; terms: string[] }\n`
    + `export interface TopicPlan { version: string; rollout: { mode: 'off' | 'shadow'; routes: string[]; feeds: string[] }; clarity: { min_examples_per_class: number | null }; topics: Array<{ topicId: string; name: string; decision: string; clusters: Array<{ id: string; name: string }>; anchors: string[]; otherSenses: string[]; units: TopicPlanUnit[] }> }\n`
    + `export const TOPIC_PLAN: TopicPlan = ${JSON.stringify(plan)};\n`;
}
const workerPlanPath = (root) => join(root, 'apps', 'worker', 'src', 'topics', 'plan.generated.ts');
const coveragePath = (root) => join(topicsRoot(root), '_generated', 'source-coverage.json');
const planPath = (root) => join(topicsRoot(root), '_generated', 'classifier-plan.json');

function newTopic(root, lane, id, name, decision) {
  const ip = join(topicsRoot(root), lane, '_index.json');
  const index = existsSync(ip) ? readJson(ip) : { schema: 'gcos-topic-index/1', status: 'DRAFT_NOT_WIRED', lane, note: 'Sahibin verdiği her konu burada kalır; hiçbiri silinmez.', topics: [] };
  if (index.topics.some((t) => t.topic_id === id)) throw new Error(`topic ${id} already exists`);
  const dir = id.toLowerCase();
  index.topics.push({ topic_id: id, name_tr: name, state: 'ACTIVE', decision_ref: decision, owner_importance: null, file: `${dir}/topic.json` });
  writeJson(ip, index);
  writeJson(join(topicsRoot(root), lane, dir, 'topic.json'), { schema: 'gcos-topic/1', status: 'DRAFT_NOT_WIRED', lane, topic_id: id, name_tr: name, state: 'ACTIVE', decision_ref: decision, clusters: [], subtopics: [], counts: { subtopics: 0, clusters: 0, tiers: { A: 0, B: 0, C: 0 } } });
  mkdirSync(join(topicsRoot(root), lane, dir, 'intake'), { recursive: true });
  writeFileSync(join(topicsRoot(root), lane, dir, 'intake', '.gitkeep'), '');
  sync(root);
}
function findTopic(root, id) {
  for (const l of loadAll(root)) for (const t of l.topics) if (t.entry.topic_id === id && t.doc) return { ...t, lane: l.lane };
  throw new Error(`topic ${id} not found or has no file`);
}
function recount(doc) { doc.counts = { subtopics: doc.subtopics.length, clusters: doc.clusters.length, ...(doc.relations ? { relations: doc.relations.length } : {}), tiers: { A: doc.subtopics.filter((s) => s.priority_tier === 'A').length, B: doc.subtopics.filter((s) => s.priority_tier === 'B').length, C: doc.subtopics.filter((s) => s.priority_tier === 'C').length } }; }

export function main(argv) {
  const cmd = argv[0];
  const root = resolve(arg(argv, '--root') || join(dirname(fileURLToPath(import.meta.url)), '..'));
  if (cmd === 'check') {
    const errors = validate(root, { base: gitBase(root) });
    const wp = workerPlanPath(root);
    const planStale = (existsSync(planPath(root)) && JSON.stringify(readJson(planPath(root))) !== JSON.stringify(buildPlan(root)))
      || (existsSync(wp) && readFileSync(wp, 'utf8') !== workerPlanSource(root));
    if (planStale) errors.push('derived plan is stale (run: node scripts/topics.mjs build)');
    const pending = loadAll(root).flatMap((l) => l.topics).filter((t) => t.entry.state === 'ACTIVE' && !t.doc).map((t) => t.entry.topic_id);
    if (pending.length) console.log(`SUBTOPICS_PENDING ${pending.join(',')}`);
    const noAnchor = loadAll(root).flatMap((l) => l.topics).filter((t) => t.entry.state === 'ACTIVE' && t.doc && (t.doc.subtopics || []).length && !(t.doc.anchor_terms_en || []).length).map((t) => t.entry.topic_id);
    if (noAnchor.length) console.log(`ANCHORS_MISSING ${noAnchor.join(',')} (not in the Worker plan: add anchor_terms_en)`);
    errors.forEach((e) => console.log(`ERROR ${e}`));
    console.log(`TOPIC_CHECK_ERRORS=${errors.length}`);
    return errors.length ? 1 : 0;
  }
  if (cmd === 'sync') { console.log(`LEDGER_ROWS_ADDED=${sync(root)}`); return 0; }
  if (cmd === 'build') {
    const plan = buildPlan(root);
    const wp = workerPlanPath(root);
    const wantWorker = existsSync(join(root, 'apps', 'worker', 'src')) ? workerPlanSource(root) : null;
    if (argv.includes('--check')) {
      const ok = existsSync(planPath(root)) && JSON.stringify(readJson(planPath(root))) === JSON.stringify(plan)
        && (wantWorker === null || (existsSync(wp) && readFileSync(wp, 'utf8') === wantWorker));
      console.log(ok ? 'PLAN_IN_SYNC' : 'PLAN_STALE'); return ok ? 0 : 1;
    }
    if (wantWorker !== null) { mkdirSync(dirname(wp), { recursive: true }); writeFileSync(wp, wantWorker); }
    writeJson(planPath(root), plan); const cov = buildCoverage(root); writeJson(coveragePath(root), cov); console.log(`PLAN_WRITTEN topics=${plan.topics.length} SOURCES=${cov.sources.length} ${JSON.stringify(cov.summary)}`); return 0;
  }
  if (cmd === 'new') { newTopic(root, argv[1], argv[2], argv[3], arg(argv, '--decision')); console.log(`TOPIC_CREATED ${argv[2]}`); return 0; }
  if (cmd === 'add-cluster') {
    const t = findTopic(root, argv[1]);
    if (!/^K\d+$/.test(argv[2])) throw new Error('cluster id must look like K18');
    if (t.doc.clusters.some((c) => c.id === argv[2])) throw new Error(`cluster ${argv[2]} exists`);
    t.doc.clusters.push({ id: argv[2], name_tr: argv[3] }); recount(t.doc); writeJson(t.file, t.doc); sync(root); console.log(`CLUSTER_ADDED ${argv[1]}:${argv[2]}`); return 0;
  }
  if (cmd === 'add-sub') {
    const t = findTopic(root, argv[1]);
    const terms = String(argv[4] || '').split(';').map((x) => x.trim()).filter(Boolean);
    if (!terms.length) throw new Error('at least one search term required (t1;t2)');
    if (!TIERS.has(argv[5])) throw new Error('tier must be A, B or C');
    if (!t.doc.clusters.some((c) => c.id === argv[2])) throw new Error(`unknown cluster ${argv[2]} (add-cluster first)`);
    const next = t.doc.subtopics.length + 1;
    const id = `${argv[1]}-${String(next).padStart(3, '0')}`;
    t.doc.subtopics.push({ id, cluster: argv[2], name_tr: argv[3], search_terms_en: terms, priority_tier: argv[5], source_list: arg(argv, '--list') || 'manual', state: 'ACTIVE', added_at: TODAY() });
    recount(t.doc); writeJson(t.file, t.doc); sync(root); console.log(`SUBTOPIC_ADDED ${id}`); return 0;
  }
  if (cmd === 'add-relation') {
    // add-relation <ID> "<name>" "<owner detail text>" "<SUB1,SUB2>" "<t1;t2>" [--group G] [--list x]
    const t = findTopic(root, argv[1]);
    const maps = String(argv[4] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const terms = String(argv[5] || '').split(';').map((x) => x.trim()).filter(Boolean);
    if (!argv[2] || !argv[3]) throw new Error('relation name and owner detail text required');
    if (!maps.length || !terms.length) throw new Error('maps_to (SUB1,SUB2) and search terms (t1;t2) required');
    for (const m of maps) if (!t.doc.subtopics.some((s) => s.id === m)) throw new Error(`unknown sub-topic ${m}`);
    const group = arg(argv, '--group');
    t.doc.relation_groups ||= [];
    if (group && !t.doc.relation_groups.some((g) => g.id === group)) t.doc.relation_groups.push({ id: group, name_tr: group });
    t.doc.relations ||= [];
    const id = `${argv[1]}-R${String(t.doc.relations.length + 1).padStart(2, '0')}`;
    t.doc.relations.push({ id, group: group || null, name_tr: argv[2], details_tr: argv[3], maps_to: maps, search_terms_en: terms, source_list: arg(argv, '--list') || 'manual', state: 'ACTIVE', added_at: TODAY() });
    recount(t.doc); writeJson(t.file, t.doc); sync(root); console.log(`RELATION_ADDED ${id}`); return 0;
  }
  console.log('usage: check | sync | build [--check] | new <lane> <ID> "<name>" --decision <DEC> | add-cluster <ID> <K..> "<name>" | add-sub <ID> <K..> "<name>" "<t1;t2>" <A|B|C> | add-relation <ID> "<name>" "<detail>" "<SUB1,SUB2>" "<t1;t2>" [--group G]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`ERROR ${e.message}`); process.exit(1); }
}
