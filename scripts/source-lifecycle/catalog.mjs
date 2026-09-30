// Compact, read-only projections of the canonical source stores + identity resolution (gates G0/G1).
// Projections are built in memory and never printed wholesale: callers receive only matching records (P4).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { storesAt, records } from '../registry-find.mjs';
import { ACTIVATION, TIP_TOPLULUGU_STATUS } from './model.mjs';

const TWO_LEVEL_SUFFIXES = new Set(['gov.tr', 'edu.tr', 'org.tr', 'com.tr', 'k12.tr', 'av.tr', 'bel.tr', 'co.uk', 'ac.uk', 'gov.uk', 'nhs.uk', 'org.uk', 'europa.eu', 'nih.gov', 'com.au', 'gov.au', 'org.au']);
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid)$/i;
// Request filler words (TR/EN), matched as token prefixes so Turkish suffixes ("haberlerini", "kaynağını") drop too.
const STOP_PREFIXES = ['haber', 'news', 'ekle', 'add', 'kayna', 'source', 'feed', 'rss', 'site', 'sayfa', 'page', 'the', 'of', 'and', 've', 'bu', 'lutfen', 'please', 'from', 'icin'];

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP_PREFIXES.some((p) => t.startsWith(p)));

export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Registrable domain (approximation with the suffixes this catalog actually uses). */
export function registrableDomain(url) {
  const h = hostOf(url);
  if (!h) return null;
  const parts = h.split('.');
  const two = parts.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(two) && parts.length >= 3 ? parts.slice(-3).join('.') : two;
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
};

// ---------- projections -------------------------------------------------------------------------------------------

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));

function tipTopluluguProjection(rel, path, r) {
  const plan = r.fetch_plan || {};
  const urls = [r.canonical_url, r.source_url, r.primary_url, ...(plan.surfaces || []).map((s) => s.url)].map(normalizeUrl).filter(Boolean);
  const status = String(r.status || '').toLowerCase();
  const hist = Array.isArray(r.lifecycle_history) ? r.lifecycle_history : [];
  return {
    store: 'tip_toplulugu',
    lane: 'tip_toplulugu',
    source_id: r.source_id,
    name: r.name || r.label || r.source_id,
    urls: [...new Set(urls)],
    fetch_url: r.canonical_url || r.source_url || r.primary_url || null,
    paths: [...(r.allowed_path_patterns || plan.allowed_path_patterns || [])],
    heading: r.source_id.startsWith('burs_') ? 'BURS' : r.source_id.startsWith('egitim_') ? 'EGITIM' : 'DUYURU',
    status: r.status,
    runtime_activation: r.runtime_activation ?? null,
    retired: status === TIP_TOPLULUGU_STATUS.RETIRED,
    active: status !== TIP_TOPLULUGU_STATUS.RETIRED && r.runtime_activation === ACTIVATION.READY,
    lastOutcome: hist.length ? hist[hist.length - 1].outcome : null,
    cadence_min: plan.expected_check_interval_minutes ?? null,
    file: rel,
    path,
    _parser_profile: r.parser_profile ?? null,
    _upstream: [r.upstream_source_id, ...(r.related_upstream_source_ids || []), ...(r.maps_official_source_ids || [])].filter(Boolean),
  };
}

function feedIndex(root) {
  const f = join(root, 'config', 'feeds.json');
  if (!existsSync(f)) return new Map();
  return new Map(readJson(f).feeds.map((x) => [x.id, x]));
}

function feedState(feed) {
  if (!feed) return { active: false, retired: false, pending: false };
  const pending = feed.rules?.activation === 'PENDING_EXPLICIT_DECISION';
  return { active: feed.enabled === true, retired: feed.enabled !== true && !pending, pending };
}

function kaduseProjection(store, lane, rel, path, id, name, url, feed) {
  const s = feedState(feed);
  return {
    store,
    lane,
    source_id: id,
    name: name || id,
    urls: [normalizeUrl(url), normalizeUrl(feed?.endpointUrl)].filter(Boolean),
    fetch_url: url || feed?.endpointUrl || null,
    paths: [],
    heading: lane === 'kaduse-news' ? 'HABER' : 'RESEARCH',
    status: s.pending ? 'PENDING_EXPLICIT_DECISION' : s.active ? 'enabled' : 'disabled',
    runtime_activation: null,
    retired: s.retired,
    active: s.active,
    lastOutcome: null,
    cadence_min: feed?.pollMinutes ?? null,
    feed_id: feed?.id ?? null,
    file: rel,
    path,
  };
}

/** All canonical records as compact projections. Kaduse effective state is read from generated feeds.json. */
export function loadProjections(root) {
  const feeds = feedIndex(root);
  const out = [];
  for (const abs of storesAt(root)) {
    const rel = abs.slice(root.length + 1).split('\\').join('/');
    let data;
    try {
      data = readJson(abs);
    } catch {
      continue;
    }
    if (rel.startsWith('adapters/tip-toplulugu-radar/content/source-registry-')) {
      for (const { path, record } of records(data, '')) if (record.source_id) out.push(tipTopluluguProjection(rel, path, record));
    } else if (rel.endsWith('research-sources.json')) {
      (Array.isArray(data) ? data : []).forEach((r, i) => {
        if (r.sourceId) out.push(kaduseProjection('kaduse-research', 'kaduse-research', rel, `[${i}]`, r.sourceId, r.publisher, r.canonicalUrl, feeds.get(`research-${r.sourceId}`)));
      });
    } else if (rel.endsWith('news-registry.json')) {
      (data.targets || []).forEach((t, i) => {
        out.push(kaduseProjection('kaduse-news', 'kaduse-news', rel, `targets[${i}]`, t.id, t.label, t.officialUrl, feeds.get(`news-${t.id}`)));
      });
    }
  }
  return out;
}

// ---------- G0: request normalization -----------------------------------------------------------------------------

export function normalizeRequest(input, { now = new Date().toISOString(), url, channel } = {}) {
  const raw = String(input ?? '').trim();
  const asUrl = normalizeUrl(raw);
  const idLike = /^[a-z0-9]+([_-][a-z0-9]+)+$/.test(raw);
  const kind = asUrl ? 'url' : idLike ? 'source_id' : 'name';
  const evidenceUrl = normalizeUrl(url) || asUrl;
  const fetchUrl = normalizeUrl(url) ? String(url).trim() : asUrl ? raw : null;
  const request_id = 'slr_' + createHash('sha256').update(`${kind}|${fold(raw)}|${now}`).digest('hex').slice(0, 16);
  return {
    request_id,
    requested_at: now,
    kind,
    raw,
    url: evidenceUrl,
    fetch_url: fetchUrl,
    domain: evidenceUrl ? registrableDomain(evidenceUrl) : null,
    tokens: kind === 'url' ? [] : tokens(raw),
    channel_hint: channel || null,
  };
}

// ---------- G1: identity / duplicate resolution -------------------------------------------------------------------

function group(projs) {
  const m = new Map();
  for (const p of projs) {
    if (!m.has(p.source_id)) m.set(p.source_id, []);
    m.get(p.source_id).push(p);
  }
  return m;
}

// One identity per source_id; a phase1+v1.1 shared id counts once (phase1 activation wins in the runtime merge).
function identityOf(hits) {
  const retired = hits.some((h) => h.retired);
  const active = !retired && hits.some((h) => h.active);
  return { ...hits[0], active, retired, layers: hits.map((h) => `${h.file}:${h.path}`) };
}

const compact = (p) => ({ source_id: p.source_id, store: p.store, name: p.name, url: p.urls[0] ?? null, state: p.retired ? 'RETIRED' : p.active ? 'ACTIVE' : 'INACTIVE', heading: p.heading });

function pathCompatible(reqUrl, p) {
  const rp = pathOf(reqUrl);
  const candidates = [...p.urls.map(pathOf), ...p.paths.map((x) => String(x).replace(/\/+$/, '') || '/')];
  return candidates.some((cp) => cp !== '/' && (rp === cp || rp.startsWith(cp + '/') || cp.startsWith(rp + '/')));
}

export function resolveIdentity(req, projections) {
  const byId = group(projections);
  if (req.kind === 'source_id' && byId.has(req.raw)) return { outcome: 'EXISTING', match: identityOf(byId.get(req.raw)), candidates: [], same_domain: [] };

  if (req.url) {
    const exact = [...byId.values()].filter((hs) => hs.some((h) => h.urls.includes(req.url)));
    const sameDomain = [...byId.values()].filter((hs) => hs.some((h) => h.urls.some((u) => registrableDomain(u) === req.domain)));
    const compatible = exact.length ? exact : sameDomain.filter((hs) => hs.some((h) => h.urls.some((u) => hostOf(u) === hostOf(req.url)) && pathCompatible(req.url, h)));
    const same_domain = sameDomain.map((hs) => compact(identityOf(hs)));
    if (compatible.length === 1) return { outcome: 'EXISTING', match: identityOf(compatible[0]), candidates: [], same_domain };
    if (compatible.length > 1) return { outcome: 'AMBIGUOUS', match: null, candidates: compatible.slice(0, 5).map((hs) => compact(identityOf(hs))), same_domain, question: 'This URL matches more than one registered source. Which one do you mean?' };
    if (req.kind === 'url') return { outcome: 'NEW', match: null, candidates: [], same_domain };
  }

  if (req.tokens.length) {
    const scored = [];
    for (const hs of byId.values()) {
      const p = hs[0];
      const hay = new Set([...tokens(p.name), ...tokens(p.source_id), ...p.urls.flatMap((u) => tokens(hostOf(u)))]);
      if (req.tokens.every((t) => hay.has(t))) scored.push(identityOf(hs));
    }
    const live = scored.filter((p) => !p.retired);
    const pool = live.length ? live : scored;
    if (pool.length === 1) return { outcome: 'EXISTING', match: pool[0], candidates: [], same_domain: [] };
    if (pool.length > 1) {
      return {
        outcome: 'AMBIGUOUS',
        match: null,
        candidates: pool.slice(0, 5).map(compact),
        total_candidates: pool.length,
        same_domain: [],
        question: `"${req.raw}" matches ${pool.length} registered sources. Which one (or give the official URL)?`,
      };
    }
    if (req.url) return { outcome: 'NEW', match: null, candidates: [], same_domain: [] };
    return { outcome: 'UNRESOLVED', match: null, candidates: [], same_domain: [], question: `No registered source matches "${req.raw}". The operating agent must supply official-URL evidence (--url).` };
  }
  return { outcome: 'UNRESOLVED', match: null, candidates: [], same_domain: [], question: 'Empty request.' };
}

export { compact as compactProjection };
