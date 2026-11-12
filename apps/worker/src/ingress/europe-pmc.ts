import { upsertSourceItem, type Env } from '../db/queries';
import { tagIngestedItem } from '../topics/store';
import { TOPIC_PLAN } from '../topics/plan.generated';
import { registerArticleSource } from '../wow/introduce';
import { queriesForRun, recordHits, markQueryRun, scopeQueriesForRun, markScopeRun, decidedSets, normTitleKey, laneOf, WOW_CONFIG } from '../wow/memory';
import { protectedBibliographicProtocol } from '../protocols/approved-display';
import { inferStudyType } from './study-type';
import { hasNoticePubType, isNonArticleNotice } from './research-quality';

interface EuropePmcResult {
  pubTypeList?: { pubType?: string[] };
  title?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  firstPublicationDate?: string;
  abstractText?: string;
}

/**
 * Kaduse Research ingress: Europe PMC REST batch (not a continuous crawler).
 */
export async function ingestEuropePmc(
  env: Env,
  opts?: { force?: boolean }
): Promise<{ created: number; updated: number; total: number }> {
  const due = opts?.force
    ? ''
    : ` AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || COALESCE(poll_minutes, 360) || ' minutes') <= datetime('now'))`;
  const feed = await env.DB.prepare(
    `SELECT * FROM source_feeds WHERE id IN ('europe-pmc-batch', 'research-europe-pmc-rest') AND enabled = 1${due} LIMIT 1`
  ).first<{
    id: string;
    endpoint_url: string;
    rules_json: string | null;
    channel_id: string;
  }>();
  if (!feed?.endpoint_url) {
    if (opts?.force) throw new Error('Europe PMC feed missing or disabled');
    return { created: 0, updated: 0, total: 0 };
  }

  let query =
    'TITLE:auscultation OR TITLE:stethoscope OR ("artificial intelligence" AND medicine)';
  let pageSize = 15;
  let topicMode = false;
  try {
    if (feed.rules_json) {
      const rules = JSON.parse(feed.rules_json);
      query = rules.query ?? query;
      pageSize = rules.pageSize ?? pageSize;
      topicMode = rules.mode === 'topics';
    }
  } catch {
    /* defaults */
  }

  // Topic-driven discovery (DEC-R-20261106-024): one search per relation, newest first, across every journal Europe PMC indexes.
  // Beyond that (DEC-R-20261112-028): the same relations again limited to the journals our articles came from (scoped), and the same
  // relations older than the "son dönem" window ordered by citations (evergreen candidates). Every result keeps the id of the query that
  // brought it; a failing owner, scoped or evergreen search is recorded and does not stop the others.
  type RunQ = { q: string; sort: string | null; queryId: string | null; relationId: string | null; owner: boolean; scope: { key: string; kind: 'scoped' | 'evergreen' } | null };
  const ownerQueries = topicMode ? await queriesForRun(env) : [];
  const planBase = TOPIC_PLAN.discovery.map((d) => ({ queryId: `plan:${d.id}`, relationId: d.id, query: d.query }));
  const scopeQueries = topicMode ? await scopeQueriesForRun(env, [...planBase, ...ownerQueries.map((o) => ({ queryId: o.queryId, relationId: o.relationId, query: o.query }))]) : [];
  const queries: RunQ[] = topicMode && (planBase.length || ownerQueries.length)
    ? [
        ...planBase.map((d) => ({ q: d.query, sort: 'P_PDATE_D desc', queryId: d.queryId, relationId: d.relationId, owner: false, scope: null })),
        ...ownerQueries.map((d) => ({ q: d.query, sort: 'P_PDATE_D desc', queryId: d.queryId, relationId: d.relationId, owner: true, scope: null })),
        ...scopeQueries.map((d) => ({ q: d.q, sort: d.kind === 'evergreen' ? 'CITED desc' : 'P_PDATE_D desc', queryId: d.queryId, relationId: d.relationId, owner: false, scope: { key: d.scopeKey, kind: d.kind } })),
      ]
    : [{ q: query, sort: null, queryId: null, relationId: null, owner: false, scope: null }];
  const items: EuropePmcResult[] = [];
  const seen = new Set<string>();
  const broughtBy = new Map<EuropePmcResult, Array<{ queryId: string; relationId: string }>>();
  const byKey = new Map<string, EuropePmcResult>();
  const ownerRun = new Map<string, { total: number; created: number; error: string | null }>();
  const scopeRun = new Map<string, { kind: 'scoped' | 'evergreen'; total: number; created: number; error: string | null }>();
  for (const one of queries) {
    const url = new URL(feed.endpoint_url);
    url.searchParams.set('query', one.q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('resultType', 'core');
    if (one.sort) url.searchParams.set('sort', one.sort);
    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'global-content-os/0.1' } });
    } catch (e) {
      if (one.owner || one.scope) { const msg = String((e as Error)?.message || e).slice(0, 120); if (one.scope) scopeRun.set(one.scope.key, { kind: one.scope.kind, total: 0, created: 0, error: msg }); else if (one.queryId) ownerRun.set(one.queryId, { total: 0, created: 0, error: msg }); continue; }
      throw e;
    }
    if (!res.ok) {
      if (one.scope) { scopeRun.set(one.scope.key, { kind: one.scope.kind, total: 0, created: 0, error: `HTTP ${res.status}` }); continue; }
      if (one.owner && one.queryId) { ownerRun.set(one.queryId, { total: 0, created: 0, error: `HTTP ${res.status}` }); continue; }
      throw new Error(`Europe PMC fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { resultList?: { result?: EuropePmcResult[] } };
    const results = body.resultList?.result ?? [];
    if (one.scope) scopeRun.set(one.scope.key, { kind: one.scope.kind, total: results.length, created: 0, error: null });
    else if (one.owner && one.queryId) ownerRun.set(one.queryId, { total: results.length, created: 0, error: null });
    for (const r of results) {
      const key = (r.doi || r.pmid || r.pmcid || r.title || '').toLowerCase();
      const first = key ? byKey.get(key) ?? r : r;
      if (one.queryId && one.relationId) broughtBy.set(first, [...(broughtBy.get(first) ?? []), { queryId: one.queryId, relationId: one.relationId }]);
      if (key && seen.has(key)) continue;
      if (key) { seen.add(key); byKey.set(key, r); }
      items.push(r);
    }
  }

  // Seen ledger (DEC-R-20261112-028): a work the owner already decided (scored, answered, authority verdict, or the same finding under another
  // id such as a preprint and its published version) is not processed again and never returns to the queue. Empty when the memory is absent.
  const decided = topicMode ? await decidedSets(env) : { keys: new Set<string>(), titles: new Set<string>() };
  let skippedDecided = 0;

  let created = 0;
  let updated = 0;

  for (const it of items) {
    const title = (it.title || '').replace(/<[^>]+>/g, '').trim();
    if (!title || isNonArticleNotice(title) || hasNoticePubType(it.pubTypeList?.pubType)) continue;
    {
      const k = (it.doi || it.pmid || it.pmcid || '').toLowerCase();
      const tk = normTitleKey(title);
      if ((k && decided.keys.has(k)) || (tk && decided.titles.has(tk))) { skippedDecided += 1; continue; }
    }

    const doi = it.doi?.trim() || null;
    const pmid = it.pmid?.trim() || null;
    const pmcid = it.pmcid?.trim() || null;
    if (await protectedBibliographicProtocol(env.DB, { doi, pmid })) {
      updated += 1;
      continue;
    }
    const canonicalUrl = doi
      ? `https://doi.org/${doi}`
      : pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : pmcid
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`
          : `https://europepmc.org/search?query=${encodeURIComponent(title)}`;

    const abstract = (it.abstractText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = abstract
      ? abstract.slice(0, 480)
      : `${it.journalTitle || 'Journal'} — ${it.authorString || 'Authors unknown'}`;
    const publishedAt = it.firstPublicationDate || (it.pubYear ? `${it.pubYear}-01-01` : null);
    const publisher = it.journalTitle || 'Europe PMC';

    // One Research window decides the path: newer = time-sensitive Research, older = Evergreen/Rediscovery candidate (owner decision: 500 days).
    const evergreen = laneOf(publishedAt) === 'EVERGREEN';
    const result = await upsertSourceItem(env.DB, {
      feedId: feed.id,
      route: 'kaduse-research',
      channelId: feed.channel_id,
      title,
      titleOrig: title,
      summary,
      gists: [summary],
      canonicalUrl,
      publisher,
      publishedAt,
      dedupeKey: (doi || pmid || pmcid || canonicalUrl).toLowerCase(),
      ...(topicMode && evergreen ? { acquisitionPath: 'EVERGREEN' as const, evergreenView: 'research_rediscovery' as const, discoveryMode: 'EVERGREEN_REDISCOVERY' as const, discoveryReason: 'relation_authority_candidate' } : {}),
      evidence: {
        doi,
        pmid,
        pmcid,
        finding: abstract ? abstract.slice(0, 600) : null,
        limitation: null,
        studyType: inferStudyType(it.pubTypeList?.pubType, title),
      },
    });
    if (result.created && result.id) await tagIngestedItem(env, { itemId: result.id, route: 'kaduse-research', feedId: feed.id, title, abstract: abstract || null });
    // The journal of a topic-discovered article enters Research as a record-only source (DEC-R-20261111-026).
    if (result.created && topicMode && it.journalTitle) await registerArticleSource(env, it.journalTitle).catch(() => null);

    const hits = broughtBy.get(it) ?? [];
    if (result.id && hits.length) await recordHits(env, result.id, hits);
    if (result.created) for (const h of hits) { const run = ownerRun.get(h.queryId); if (run) run.created += 1; }
    if (result.created) for (const sc of scopeRun.values()) if (sc.total > 0 && hits.some((h) => queries.some((q) => q.queryId === h.queryId && q.scope && scopeRun.get(q.scope.key) === sc))) sc.created += 1;

    if (result.created) created += 1;
    else updated += 1;
  }
  for (const [queryId, run] of ownerRun) await markQueryRun(env, queryId, run);
  for (const [scopeKey, run] of scopeRun) await markScopeRun(env, { scopeKey, kind: run.kind }, run);
  void skippedDecided; void WOW_CONFIG;

  await env.DB.prepare(
    `UPDATE source_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_ok_items = ?, last_error = NULL, fetch_attempts = COALESCE(fetch_attempts, 0) + 1 WHERE id IN ('europe-pmc-batch', 'research-europe-pmc-rest')`
  )
    .bind(created + updated)
    .run();

  return { created, updated, total: items.length };
}
