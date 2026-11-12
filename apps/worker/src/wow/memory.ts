/**
 * Wow editorial memory (DEC-R-20261112-027; DEC-R-20261111-025 stages 2-4; Bible v5 §1.3, §1.4, §4.1, §4.4, §4.6, §10).
 * The memory holds what the owner finds valuable and why, and what the system did with it. Tables: migrations/addons/a005.
 *   extract   one introduced article -> topic units (deterministic classifier) + the two sides of its relation + the PROBABLE wow
 *             reason. The LLM (Workers AI, the binding the Hub already uses) is called at most once per article and version, under a
 *             daily cap; its terms are kept only when every word is in the article text. No AI binding / cap reached -> rules only.
 *   decide    the owner confirms, corrects or rejects the proposal. Only a confirmed/corrected proposal opens a relation + one query.
 *   hits      every item a relation query brings is recorded with the query id: the "why it came" text is built from these rows only.
 *   feedback  score + kind (which part must change) + the owner's own reason tags and sentence + item/general scope. One answer
 *             touches only its dependents: the learner and the queries that brought that item. A low-scoring query is never closed
 *             by the system: it goes to REVIEW and the owner is asked (keep / narrow / close).
 * Routes (Hub operator token, ROUTE_GATES): GET /api/wow/memory, GET /api/wow/candidates, POST /api/wow/extraction,
 * POST /api/wow/feedback, POST /api/wow/query.
 */
import { newId, type Env } from '../db/queries';
import { classify, tokens } from '../topics/classify';
import { TOPIC_PLAN, type TopicPlan } from '../topics/plan.generated';
import { recordRating } from '../ratings';
import { runScoring } from '../scoring';
import { RESEARCH_CURRENT_MAX_AGE_DAYS } from '../triage/lane-purity';

export interface MemoryResult { status: number; body: unknown }
export const EXTRACTOR_VERSION = 'x1';
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
/** Budgets and thresholds of the loop (Bible §1.4). One place; change here, not at the call sites. */
export const WOW_CONFIG = { llmCallsPerDay: 40, termsPerSide: 4, queriesPerRun: 12, reviewMinRated: 4, reviewMaxAvg: 4, suggestFromWow: 8, selectionWow: 6, journalsPerBatch: 20, scopedPerRun: 6, evergreenPerRun: 4, authorityMinAnswers: 5, skipSnoozeDays: 30 } as const;
export const FEEDBACK_KINDS = ['wow', 'ordinary', 'topic_wrong', 'weak_evidence', 'channel', 'repeat', 'study_type', 'skip'] as const;
const STUDY_TYPES = ['RCT', 'COHORT', 'CASE_CONTROL', 'CROSS_SECTIONAL', 'META_ANALYSIS', 'REVIEW', 'ANIMAL', 'IN_VITRO', 'CASE_REPORT', 'OTHER'];
const OWNER_WOW = 'owner_wow_example';

const notReady = (e: unknown): boolean => /no such table/i.test(e instanceof Error ? e.message : String(e));
const NOT_READY: MemoryResult = { status: 503, body: { error: 'WOW_MEMORY_NOT_READY', hint: 'apply migrations/addons/a005_wow_memory.sql' } };
const arr = (s: string | null | undefined): string[] => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Search terms: short, plain words only (they go inside a quoted Europe PMC phrase). */
export function cleanTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const v = t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (v.length < 3 || v.length > 60 || !/^[a-z0-9][a-z0-9 '\-]*$/.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= WOW_CONFIG.termsPerSide) break;
  }
  return out;
}

/** One journal-free Europe PMC query for a relation: (any A term) AND (any B term), title or abstract. */
export function buildQuery(a: string[], b: string[]): string {
  const side = (ts: string[]) => `(${ts.map((t) => `TITLE:"${t}" OR ABSTRACT:"${t}"`).join(' OR ')})`;
  return `${side(a)} AND ${side(b)}`;
}

function textFromAi(out: unknown): string {
  if (typeof out === 'string') return out;
  const o = out as { response?: unknown; result?: { response?: unknown } } | null;
  const r = o?.response ?? o?.result?.response;
  return typeof r === 'string' ? r : r ? JSON.stringify(r) : '';
}

interface LlmGuess { sideA: string[]; sideB: string[]; studyType: string | null; reason: string | null }
/** Structured guess; every kept term is checked against the article text (nothing invented, CORE rule 3). */
async function llmGuess(env: Env, title: string, abstract: string, reasonCodes: string[]): Promise<LlmGuess | null> {
  if (!env.AI) return null;
  const system = `You read one medical research title and abstract. Answer with JSON only, no other text:
{"exposure":["1-3 short English search terms for the studied factor or intervention"],"outcome":["1-3 short English search terms for the main outcome"],"study_type":"one of ${STUDY_TYPES.join(', ')}","reason":"one of ${reasonCodes.join(', ')} or null"}
Use only words that appear in the text. "reason" is why a general medical audience may find the result striking; null when unsure.`;
  const raw = textFromAi(await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: `Title: ${title}\nAbstract: ${abstract.slice(0, 2500) || '(none)'}` }], max_tokens: 250 }));
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const have = new Set(tokens(`${title} ${abstract}`));
  const inText = (ts: string[]) => ts.filter((t) => { const st = tokens(t); return st.length > 0 && st.every((s) => have.has(s)); });
  const sideA = inText(cleanTerms(j.exposure));
  const sideB = inText(cleanTerms(j.outcome)).filter((t) => !sideA.includes(t));
  return {
    sideA, sideB,
    studyType: typeof j.study_type === 'string' && STUDY_TYPES.includes(j.study_type) ? j.study_type : null,
    reason: typeof j.reason === 'string' && reasonCodes.includes(j.reason) ? j.reason : null,
  };
}

/**
 * Extraction for one introduced article. Cached per (item, extractor version): a second call returns the stored row and calls
 * nothing. Never throws: the memory must not break the introduction.
 */
export async function extractArticle(env: Env, input: { itemId: string; title: string; abstract: string | null; ownerArticle?: boolean }, plan: TopicPlan = TOPIC_PLAN): Promise<{ created: boolean; basis: 'rules' | 'llm'; deferred?: true; autoRelation?: string } | null> {
  try {
    const have = await env.DB.prepare(`SELECT basis FROM wow_extractions WHERE item_id = ? AND extractor_version = ?`).bind(input.itemId, EXTRACTOR_VERSION).first<{ basis: 'rules' | 'llm' }>();
    if (have) return { created: false, basis: have.basis };
    const c = classify(input.title, input.abstract, plan);
    const topicIds = c.topics.map((t) => t.topicId);
    const units = c.topics.flatMap((t) => t.units.map((u) => u.unitId));
    let guess: LlmGuess | null = null;
    const used = await env.DB.prepare(`SELECT COUNT(*) AS n FROM wow_extractions WHERE basis = 'llm' AND created_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')`).first<{ n: number }>();
    // Cap reached: store nothing, so the article is read with the LLM on a later day instead of being fixed as rules-only forever.
    if (env.AI && Number(used?.n ?? 0) >= WOW_CONFIG.llmCallsPerDay) return { created: false, basis: 'rules', deferred: true };
    if (env.AI) {
      const codes = (await env.DB.prepare(`SELECT code FROM wow_reasons WHERE state <> 'REJECTED' ORDER BY code`).all<{ code: string }>()).results.map((r) => r.code);
      guess = await llmGuess(env, input.title, input.abstract || '', codes).catch(() => null);
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO wow_extractions (item_id, extractor_version, basis, topic_ids, plan_units, side_a, side_b, probable_reason, study_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.itemId, EXTRACTOR_VERSION, guess ? 'llm' : 'rules', JSON.stringify(topicIds), JSON.stringify(units), JSON.stringify(guess?.sideA ?? []), JSON.stringify(guess?.sideB ?? []), guess?.reason ?? null, guess?.studyType ?? null).run();
    // DEC-R-20261112-029: an article the owner introduced himself is the owner's own PASS. When it falls in an accepted topic and the system
    // read both sides of the relation out of the text, the relation and its search open at once; the owner corrects or closes it later in the Hub.
    // Articles that only came out of a search never open a relation by themselves (they stay a proposal).
    if (input.ownerArticle && guess && topicIds.length && guess.sideA.length && guess.sideB.length) {
      const d = await decideExtraction(env, { itemId: input.itemId, decision: 'confirm' });
      const rel = d.status === 200 ? (d.body as { relationId?: string }).relationId : undefined;
      return { created: true, basis: 'llm', ...(rel ? { autoRelation: rel } : {}) };
    }
    return { created: true, basis: guess ? 'llm' : 'rules' };
  } catch {
    return null;
  }
}

/** Extraction for an article that is already stored (backfill of articles introduced before the memory existed). */
export async function extractStored(env: Env, raw: unknown): Promise<MemoryResult> {
  const itemId = raw && typeof raw === 'object' && typeof (raw as { itemId?: unknown }).itemId === 'string' ? ((raw as { itemId: string }).itemId).trim() : '';
  if (!itemId) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  const it = await env.DB.prepare(`SELECT id, COALESCE(title_orig, title) AS title, summary, discovery_reason FROM source_items WHERE id = ? AND (discovery_reason = ? OR EXISTS (SELECT 1 FROM wow_hits h WHERE h.item_id = source_items.id))`).bind(itemId, OWNER_WOW).first<{ id: string; title: string; summary: string | null; discovery_reason: string | null }>();
  if (!it) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
  const r = await extractArticle(env, { itemId: it.id, title: it.title, abstract: it.summary && it.summary !== it.title ? it.summary : null, ownerArticle: it.discovery_reason === OWNER_WOW });
  if (r?.deferred) return { status: 429, body: { ok: false, error: 'LLM_DAILY_CAP', deferred: true, itemId, limit: WOW_CONFIG.llmCallsPerDay } };
  return r ? { status: r.created ? 201 : 200, body: { ok: true, itemId, ...r } } : NOT_READY;
}

/** Owner decision on a proposal (§4.1: an unanswered proposal waits; nothing is accepted by silence). */
export async function decideExtraction(env: Env, raw: unknown): Promise<MemoryResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['itemId', 'decision', 'sideA', 'sideB', 'name'].includes(k)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '';
  const decision = b.decision;
  if (!itemId) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  if (decision !== 'confirm' && decision !== 'correct' && decision !== 'reject') return { status: 400, body: { error: 'INVALID_DECISION' } };
  try {
    const ex = await env.DB.prepare(`SELECT side_a, side_b FROM wow_extractions WHERE item_id = ? AND extractor_version = ?`).bind(itemId, EXTRACTOR_VERSION).first<{ side_a: string; side_b: string }>();
    if (!ex) return { status: 404, body: { error: 'EXTRACTION_NOT_FOUND' } };
    if (decision === 'reject') {
      await env.DB.prepare(`UPDATE wow_extractions SET state = 'REJECTED', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE item_id = ? AND extractor_version = ?`).bind(itemId, EXTRACTOR_VERSION).run();
      return { status: 200, body: { ok: true, itemId, state: 'REJECTED' } };
    }
    const a = decision === 'correct' ? cleanTerms(b.sideA) : cleanTerms(arr(ex.side_a));
    const bb = (decision === 'correct' ? cleanTerms(b.sideB) : cleanTerms(arr(ex.side_b))).filter((t) => !a.includes(t));
    if (!a.length || !bb.length) return { status: 400, body: { error: 'SIDES_REQUIRED', hint: 'both sides of the relation need at least one English term' } };
    const relationId = `wr-${slug(a[0])}-x-${slug(bb[0])}`.slice(0, 90);
    const name = (typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `${a[0]} × ${bb[0]}`).slice(0, 160);
    await env.DB.prepare(`INSERT OR IGNORE INTO wow_relations (relation_id, name, a_terms, b_terms, state, origin_item_id, decided_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).bind(relationId, name, JSON.stringify(a), JSON.stringify(bb), itemId).run();
    await env.DB.prepare(`UPDATE wow_relations SET state = 'ACTIVE', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE relation_id = ? AND state <> 'ACTIVE'`).bind(relationId).run();
    const q = await env.DB.prepare(`SELECT query_id FROM wow_queries WHERE relation_id = ? AND state <> 'CLOSED' LIMIT 1`).bind(relationId).first<{ query_id: string }>();
    const queryId = q?.query_id ?? `${relationId}-v1`;
    if (!q) await env.DB.prepare(`INSERT OR IGNORE INTO wow_queries (query_id, relation_id, version, query) VALUES (?, ?, 1, ?)`).bind(queryId, relationId, buildQuery(a, bb)).run();
    const state = decision === 'correct' ? 'CORRECTED' : 'CONFIRMED';
    await env.DB.prepare(`UPDATE wow_extractions SET state = ?, side_a = ?, side_b = ?, relation_id = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE item_id = ? AND extractor_version = ?`).bind(state, JSON.stringify(a), JSON.stringify(bb), relationId, itemId, EXTRACTOR_VERSION).run();
    return { status: 200, body: { ok: true, itemId, state, relationId, queryId, name } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

export interface RunQuery { queryId: string; relationId: string; query: string }
/** Owner-relation queries for one ingest run: the least recently run first, capped (§1.4 budget). Empty when the memory is absent. */
export async function queriesForRun(env: Env): Promise<RunQuery[]> {
  try {
    const rows = (await env.DB.prepare(
      `SELECT q.query_id, q.relation_id, q.query FROM wow_queries q JOIN wow_relations r ON r.relation_id = q.relation_id
        WHERE q.state IN ('ACTIVE', 'REVIEW') AND r.state = 'ACTIVE' ORDER BY COALESCE(q.last_run_at, '') ASC, q.query_id ASC LIMIT ?`,
    ).bind(WOW_CONFIG.queriesPerRun).all<{ query_id: string; relation_id: string; query: string }>()).results;
    return rows.map((r) => ({ queryId: r.query_id, relationId: r.relation_id, query: r.query }));
  } catch {
    return [];
  }
}

/** Which query brought the item. Idempotent; never throws (ingestion must not depend on the memory). */
export async function recordHits(env: Env, itemId: string, hits: Array<{ queryId: string; relationId: string }>): Promise<void> {
  try {
    for (const h of hits) await env.DB.prepare(`INSERT OR IGNORE INTO wow_hits (item_id, query_id, relation_id) VALUES (?, ?, ?)`).bind(itemId, h.queryId, h.relationId).run();
  } catch { /* memory absent */ }
}

export async function markQueryRun(env: Env, queryId: string, r: { total: number; created: number; error: string | null }): Promise<void> {
  try {
    await env.DB.prepare(`UPDATE wow_queries SET last_run_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_total = ?, last_created = ?, last_error = ? WHERE query_id = ?`).bind(r.total, r.created, r.error, queryId).run();
  } catch { /* memory absent */ }
}

interface QueryStat { queryId: string; relationId: string; state: string; rated: number; avg: number | null }
/** Only the queries that brought this item are re-measured. Low average after enough answers -> REVIEW (the owner is asked). */
async function refreshQueries(env: Env, itemId: string): Promise<QueryStat[]> {
  const hits = (await env.DB.prepare(`SELECT query_id, relation_id FROM wow_hits WHERE item_id = ?`).bind(itemId).all<{ query_id: string; relation_id: string }>()).results;
  const out: QueryStat[] = [];
  for (const h of hits) {
    const s = await env.DB.prepare(
      `SELECT COUNT(*) AS n, AVG(r.wow) AS avg FROM wow_hits x JOIN item_ratings r ON r.item_id = x.item_id AND r.rated_at = (SELECT MAX(y.rated_at) FROM item_ratings y WHERE y.item_id = x.item_id) WHERE x.query_id = ?`,
    ).bind(h.query_id).first<{ n: number; avg: number | null }>();
    const rated = Number(s?.n ?? 0);
    const avg = s?.avg === null || s?.avg === undefined ? null : Math.round(Number(s.avg) * 10) / 10;
    if (rated >= WOW_CONFIG.reviewMinRated && avg !== null && avg <= WOW_CONFIG.reviewMaxAvg) await env.DB.prepare(`UPDATE wow_queries SET state = 'REVIEW' WHERE query_id = ? AND state = 'ACTIVE'`).bind(h.query_id).run();
    const q = await env.DB.prepare(`SELECT state FROM wow_queries WHERE query_id = ?`).bind(h.query_id).first<{ state: string }>();
    out.push({ queryId: h.query_id, relationId: h.relation_id, state: q?.state ?? 'PLAN', rated, avg });
  }
  return out;
}

/** Owner answer on any Research item: score, which part must change, own reasons, item/general scope. */
export async function recordFeedback(env: Env, raw: unknown): Promise<MemoryResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['itemId', 'wow', 'channels', 'kind', 'reasons', 'newReason', 'sentence', 'scope', 'lane', 'authority'].includes(k)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '';
  if (!itemId) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  // One card, every question at once: the owner's lane answer (Time Sensitive / Evergreen Research) and, for Evergreen, the authority answer.
  if (b.lane !== undefined && b.lane !== null && b.lane !== 'TIME_SENSITIVE' && b.lane !== 'EVERGREEN') return { status: 400, body: { error: 'INVALID_LANE' } };
  if (b.authority !== undefined && b.authority !== null && b.authority !== 'AUTHORITY' && b.authority !== 'NOT_AUTHORITY') return { status: 400, body: { error: 'INVALID_VERDICT' } };
  const kind = b.kind as (typeof FEEDBACK_KINDS)[number];
  if (typeof kind !== 'string' || !FEEDBACK_KINDS.includes(kind)) return { status: 400, body: { error: 'INVALID_KIND' } };
  const skip = kind === 'skip';
  const hasWow = b.wow !== undefined && b.wow !== null;
  // "Şimdilik geçiyorum" is a wait state, never a negative example.
  if (skip && hasWow) return { status: 400, body: { error: 'SKIP_HAS_NO_SCORE' } };
  if (!skip && (typeof b.wow !== 'number' || !Number.isInteger(b.wow) || b.wow < 1 || b.wow > 10)) return { status: 400, body: { error: 'INVALID_WOW' } };
  const scope = b.scope === undefined ? 'item' : b.scope;
  if (scope !== 'item' && scope !== 'general') return { status: 400, body: { error: 'INVALID_SCOPE' } };
  const sentence = typeof b.sentence === 'string' ? b.sentence.trim() : '';
  if (sentence.length > 400) return { status: 400, body: { error: 'INVALID_SENTENCE' } };
  if (b.reasons !== undefined && (!Array.isArray(b.reasons) || b.reasons.some((x) => typeof x !== 'string') || b.reasons.length > 6)) return { status: 400, body: { error: 'INVALID_REASONS' } };
  const newReason = typeof b.newReason === 'string' ? b.newReason.replace(/\s+/g, ' ').trim() : '';
  if (newReason.length > 80) return { status: 400, body: { error: 'INVALID_NEW_REASON' } };
  try {
    const it = await env.DB.prepare(`SELECT COALESCE(title_orig, title) AS title FROM source_items WHERE id = ?`).bind(itemId).first<{ title: string }>();
    if (!it) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
    const reasons = [...new Set((b.reasons as string[] | undefined) ?? [])];
    for (const code of reasons) {
      const known = await env.DB.prepare(`SELECT code FROM wow_reasons WHERE code = ? AND state <> 'REJECTED'`).bind(code).first();
      if (!known) return { status: 400, body: { error: 'UNKNOWN_REASON', code } };
    }
    // A reason that does not fit the list is added as its own tag, never squeezed into an existing one.
    if (newReason) {
      const code = slug(newReason).replace(/-/g, '_').toUpperCase().slice(0, 48);
      if (!code) return { status: 400, body: { error: 'INVALID_NEW_REASON' } };
      await env.DB.prepare(`INSERT OR IGNORE INTO wow_reasons (code, name_tr, state) VALUES (?, ?, 'ACTIVE')`).bind(code, newReason).run();
      if (!reasons.includes(code)) reasons.push(code);
    }
    let learner: unknown = null;
    if (!skip) {
      const c = (b.channels && typeof b.channels === 'object' && !Array.isArray(b.channels) ? b.channels : {}) as Record<string, unknown>;
      const rating = await recordRating(env, { itemId, wow: b.wow, channels: { tt: c.tt === true, ik: c.ik === true, km: c.km === true }, note: `[${kind.toUpperCase()}] ${sentence}`.trim().slice(0, 500) });
      if (rating.status >= 400) return { status: rating.status, body: { error: 'RATING_NOT_RECORDED', detail: rating.body } };
    }
    const feedbackId = newId('wowfb');
    await env.DB.prepare(`INSERT INTO wow_feedback (feedback_id, item_id, wow, kind, reason_codes, sentence, scope, title_orig) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(feedbackId, itemId, skip ? null : (b.wow as number), kind, JSON.stringify(reasons), sentence || null, scope, it.title).run();
    for (const code of reasons) await env.DB.prepare(`UPDATE wow_reasons SET state = 'ACTIVE' WHERE code = ? AND state = 'PROPOSED'`).bind(code).run();
    let queries: QueryStat[] = [];
    if (!skip) {
      learner = (await runScoring(env).catch(() => null) as { body?: unknown } | null)?.body ?? null;
      queries = await refreshQueries(env, itemId);
    }
    // A high score on an item a relation query brought is a candidate for a NEW relation (Bible §4.7): the system reads the item and
    // proposes; nothing opens until the owner answers. Capped by the same daily LLM limit; a deferral is simply tried again later.
    let relationProposal: string | null = null;
    if (!skip && (b.wow as number) >= WOW_CONFIG.suggestFromWow && queries.length) {
      const src = await env.DB.prepare(`SELECT summary FROM source_items WHERE id = ?`).bind(itemId).first<{ summary: string | null }>();
      const ex = await extractArticle(env, { itemId, title: it.title, abstract: src?.summary && src.summary !== it.title ? src.summary : null });
      relationProposal = !ex ? null : ex.deferred ? 'deferred' : ex.created ? 'proposed' : 'exists';
    }
    let lane: string | null = null;
    let authority: string | null = null;
    if (typeof b.lane === 'string') {
      try { await env.DB.prepare(`INSERT INTO wow_lane_answers (item_id, lane) VALUES (?, ?) ON CONFLICT(item_id) DO UPDATE SET lane = excluded.lane, answered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(itemId, b.lane).run(); lane = b.lane; } catch { /* a006 not applied: the lane answer is not stored */ }
    }
    if (typeof b.authority === 'string') {
      const a = await recordAuthority(env, { itemId, verdict: b.authority, ...(sentence ? { note: sentence.slice(0, 400) } : {}) });
      authority = a.status < 400 ? b.authority : null;
    }
    return { status: 201, body: { ok: true, feedbackId, itemId, kind, scope, reasons, queries, learner, relationProposal, lane, authority, needsBibleDecision: scope === 'general' } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/** Owner decision on a query in REVIEW (or any owner-relation query): keep, close, or narrow to a new version. */
export async function decideQuery(env: Env, raw: unknown): Promise<MemoryResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['queryId', 'action', 'sideA', 'sideB'].includes(k)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const queryId = typeof b.queryId === 'string' ? b.queryId.trim() : '';
  if (b.action !== 'keep' && b.action !== 'close' && b.action !== 'narrow') return { status: 400, body: { error: 'INVALID_ACTION' } };
  try {
    const q = await env.DB.prepare(`SELECT relation_id, version, state FROM wow_queries WHERE query_id = ?`).bind(queryId).first<{ relation_id: string; version: number; state: string }>();
    if (!q) return { status: 404, body: { error: 'QUERY_NOT_FOUND' } };
    if (b.action === 'keep') {
      await env.DB.prepare(`UPDATE wow_queries SET state = 'ACTIVE' WHERE query_id = ?`).bind(queryId).run();
      return { status: 200, body: { ok: true, queryId, state: 'ACTIVE' } };
    }
    if (b.action === 'close') {
      await env.DB.prepare(`UPDATE wow_queries SET state = 'CLOSED' WHERE query_id = ?`).bind(queryId).run();
      return { status: 200, body: { ok: true, queryId, state: 'CLOSED' } };
    }
    const a = cleanTerms(b.sideA);
    const bb = cleanTerms(b.sideB).filter((t) => !a.includes(t));
    if (!a.length || !bb.length) return { status: 400, body: { error: 'SIDES_REQUIRED' } };
    const next = `${q.relation_id}-v${q.version + 1}`;
    await env.DB.prepare(`UPDATE wow_queries SET state = 'CLOSED' WHERE query_id = ?`).bind(queryId).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO wow_queries (query_id, relation_id, version, query) VALUES (?, ?, ?, ?)`).bind(next, q.relation_id, q.version + 1, buildQuery(a, bb)).run();
    await env.DB.prepare(`UPDATE wow_relations SET a_terms = ?, b_terms = ? WHERE relation_id = ?`).bind(JSON.stringify(a), JSON.stringify(bb), q.relation_id).run();
    return { status: 201, body: { ok: true, closed: queryId, queryId: next, version: q.version + 1 } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/**
 * Candidates the relation queries brought, not yet answered, each with why it came (query -> relation -> the owner's article).
 * Order: learner score when there is one, then how many relations it hit, then newest. Skipped items wait outside the queue.
 */
export async function wowCandidates(env: Env, params: URLSearchParams, plan: TopicPlan = TOPIC_PLAN): Promise<MemoryResult> {
  const n = Number(params.get('limit') ?? '');
  const limit = Number.isInteger(n) && n > 0 ? Math.min(100, n) : 20;
  try {
    const rows = (await env.DB.prepare(
      `SELECT h.item_id, h.query_id, h.relation_id, COALESCE(s.title_orig, s.title) AS title, s.canonical_url AS url, s.publisher AS journal, s.published_at,
              (SELECT e.study_type FROM evidence_cards e WHERE e.source_item_id = h.item_id LIMIT 1) AS study_type,
              r.name AS relation_name, o.title_orig AS origin_title, o.title AS origin_title_tr
         FROM wow_hits h JOIN source_items s ON s.id = h.item_id
         LEFT JOIN wow_relations r ON r.relation_id = h.relation_id
         LEFT JOIN source_items o ON o.id = r.origin_item_id
        WHERE COALESCE(s.discovery_reason, '') <> ?
          AND NOT EXISTS (SELECT 1 FROM item_ratings x WHERE x.item_id = h.item_id)
          AND NOT EXISTS (SELECT 1 FROM wow_feedback f WHERE f.item_id = h.item_id AND (f.kind <> 'skip' OR f.created_at >= ?))
          AND NOT EXISTS (SELECT 1 FROM wow_authority a WHERE a.item_id = h.item_id)`,
    ).bind(OWNER_WOW, new Date(Date.now() - WOW_CONFIG.skipSnoozeDays * 86_400_000).toISOString()).all<{ item_id: string; query_id: string; relation_id: string; title: string; url: string; journal: string | null; published_at: string | null; study_type: string | null; relation_name: string | null; origin_title: string | null; origin_title_tr: string | null }>()).results;
    const decided = await decidedSets(env);
    const laneAns = new Map<string, string>();
    try { for (const r of (await env.DB.prepare(`SELECT item_id, lane FROM wow_lane_answers`).all<{ item_id: string; lane: string }>()).results) laneAns.set(r.item_id, r.lane); } catch { /* a006 absent */ }
    const planNames = new Map(plan.discovery.map((d) => [d.id, d.name]));
    const by = new Map<string, { itemId: string; title: string; url: string; journal: string | null; publishedAt: string | null; score: number | null; uncertainty: number | null; lane: 'TIME_SENSITIVE' | 'EVERGREEN' | null; studyType: string | null; authorityRate: number | null; why: Array<{ queryId: string; relationId: string; relation: string; fromArticle: string | null }> }>();
    for (const r of rows) {
      const tk = normTitleKey(r.title);
      if (tk && decided.titles.has(tk)) continue; // the same finding was already decided under another id
      const cur = by.get(r.item_id) ?? { itemId: r.item_id, title: r.title, url: r.url, journal: r.journal, publishedAt: r.published_at, score: null, uncertainty: null, lane: (laneAns.get(r.item_id) as 'TIME_SENSITIVE' | 'EVERGREEN' | undefined) ?? laneOf(r.published_at), studyType: r.study_type, authorityRate: null, why: [] };
      cur.why.push({ queryId: r.query_id, relationId: r.relation_id, relation: r.relation_name || planNames.get(r.relation_id) || r.relation_id, fromArticle: r.origin_title || r.origin_title_tr || null });
      by.set(r.item_id, cur);
    }
    const list = [...by.values()];
    // Learned authority rate (owner answers per study type and per journal) orders Evergreen candidates; below the minimum answers there is no rate.
    let learned: Awaited<ReturnType<typeof authorityLearned>> | null = null;
    try { learned = await authorityLearned(env); } catch { learned = null; }
    if (learned) {
      const rateBy = (rows: AuthorityTally[]) => new Map(rows.filter((r) => r.rate !== null).map((r) => [r.key, r.rate as number]));
      const byType = rateBy(learned.byStudyType), byJ = rateBy(learned.byJournal);
      for (const c of list) {
        const rates = [c.studyType ? byType.get(c.studyType) : undefined, c.journal ? byJ.get(c.journal) : undefined].filter((x): x is number => typeof x === 'number');
        c.authorityRate = rates.length ? Math.round(rates.reduce((a, x) => a + x, 0) / rates.length) : null;
      }
    }
    if (list.length) {
      try {
        const sc = (await env.DB.prepare(`SELECT item_id, wow, uncertainty FROM item_scores WHERE item_id IN (SELECT item_id FROM wow_hits)`).all<{ item_id: string; wow: number; uncertainty: number }>()).results;
        for (const s of sc) { const c = by.get(s.item_id); if (c) { c.score = Math.round(s.wow * 10) / 10; c.uncertainty = Math.round(s.uncertainty * 100) / 100; } }
      } catch { /* scoring addon absent: order by relation hits and date */ }
    }
    const byUncertain = params.get('order') === 'uncertain';
    // Most informative first (Bible §1.4: every round must reduce a doubt): the item the learner is least sure about teaches most.
    list.sort((a, b) => (byUncertain ? (b.uncertainty ?? 1) - (a.uncertainty ?? 1) : 0) || (b.score ?? -1) - (a.score ?? -1) || (b.authorityRate ?? 50) - (a.authorityRate ?? 50) || b.why.length - a.why.length || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    return { status: 200, body: { ok: true, total: list.length, items: list.slice(0, limit) } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/** The whole memory on one read: the owner's articles with the system's proposal and the owner's answer, relations with their
 * queries and measured results, the reason list, answers that wait for a Bible decision, and today's LLM use against its cap. */
export async function wowMemory(env: Env): Promise<MemoryResult> {
  try {
    const articles = (await env.DB.prepare(
      `SELECT s.id AS itemId, COALESCE(s.title_orig, s.title) AS title, s.publisher AS journal, s.canonical_url AS url,
              e.basis, e.state AS proposalState, e.topic_ids, e.plan_units, e.side_a, e.side_b, e.probable_reason, e.study_type, e.relation_id,
              r.wow, f.kind AS ownerKind, f.reason_codes AS ownerReasons, f.sentence AS ownerSentence
         FROM source_items s
         LEFT JOIN wow_extractions e ON e.item_id = s.id AND e.extractor_version = ?
         LEFT JOIN item_ratings r ON r.item_id = s.id AND r.rated_at = (SELECT MAX(x.rated_at) FROM item_ratings x WHERE x.item_id = s.id)
         LEFT JOIN wow_feedback f ON f.item_id = s.id AND f.created_at = (SELECT MAX(y.created_at) FROM wow_feedback y WHERE y.item_id = s.id)
        WHERE s.discovery_reason = ? OR (e.item_id IS NOT NULL AND e.state = 'PROPOSED') ORDER BY s.fetched_at ASC LIMIT 300`,
    ).bind(EXTRACTOR_VERSION, OWNER_WOW).all<Record<string, unknown>>()).results.map((a) => ({
      ...a, topic_ids: arr(a.topic_ids as string), plan_units: arr(a.plan_units as string), side_a: arr(a.side_a as string), side_b: arr(a.side_b as string), ownerReasons: arr(a.ownerReasons as string),
    }));
    const relations = (await env.DB.prepare(
      `SELECT r.relation_id AS relationId, r.name, r.state, r.a_terms, r.b_terms, r.origin_item_id AS originItemId,
              q.query_id AS queryId, q.version, q.state AS queryState, q.last_run_at AS lastRunAt, q.last_total AS lastTotal, q.last_created AS lastCreated, q.last_error AS lastError,
              (SELECT COUNT(*) FROM wow_hits h WHERE h.query_id = q.query_id) AS hits,
              (SELECT COUNT(*) FROM wow_hits h JOIN item_ratings x ON x.item_id = h.item_id WHERE h.query_id = q.query_id AND x.rated_at = (SELECT MAX(y.rated_at) FROM item_ratings y WHERE y.item_id = h.item_id)) AS rated,
              (SELECT ROUND(AVG(x.wow), 1) FROM wow_hits h JOIN item_ratings x ON x.item_id = h.item_id WHERE h.query_id = q.query_id AND x.rated_at = (SELECT MAX(y.rated_at) FROM item_ratings y WHERE y.item_id = h.item_id)) AS avgWow,
              (SELECT COUNT(*) FROM wow_hits h JOIN item_ratings x ON x.item_id = h.item_id WHERE h.query_id = q.query_id AND x.wow >= ? AND x.rated_at = (SELECT MAX(y.rated_at) FROM item_ratings y WHERE y.item_id = h.item_id)) AS selected
         FROM wow_relations r LEFT JOIN wow_queries q ON q.relation_id = r.relation_id AND q.state <> 'CLOSED'
        ORDER BY r.created_at ASC`,
    ).bind(WOW_CONFIG.selectionWow).all<Record<string, unknown>>()).results.map((r) => ({ ...r, a_terms: arr(r.a_terms as string), b_terms: arr(r.b_terms as string), selectionRate: Number(r.rated) >= WOW_CONFIG.reviewMinRated ? Math.round((Number(r.selected) / Number(r.rated)) * 100) : null }));
    const reasons = (await env.DB.prepare(`SELECT code, name_tr AS name, state FROM wow_reasons WHERE state <> 'REJECTED' ORDER BY state, code`).all()).results;
    const general = (await env.DB.prepare(`SELECT feedback_id AS feedbackId, item_id AS itemId, title_orig AS title, kind, sentence, created_at AS createdAt FROM wow_feedback WHERE scope = 'general' ORDER BY created_at DESC LIMIT 50`).all()).results;
    const llm = await env.DB.prepare(`SELECT COUNT(*) AS n FROM wow_extractions WHERE basis = 'llm' AND created_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now')`).first<{ n: number }>();
    return { status: 200, body: { ok: true, extractorVersion: EXTRACTOR_VERSION, articles, relations, reasons, waitingBibleDecision: general,
      usage: { llmCallsToday: Number(llm?.n ?? 0), llmCallsPerDay: WOW_CONFIG.llmCallsPerDay, queriesPerRun: WOW_CONFIG.queriesPerRun },
      window: { days: RESEARCH_CURRENT_MAX_AGE_DAYS }, authority: await authorityLearned(env).catch(() => null),
      measured: { note: 'Seçim oranı ve netlik yüzdesi yeterli puan olmadan hesaplanmaz (Bible §10.4): veri toplanıyor.' } } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Article-source scope and Evergreen candidates (DEC-R-20261112-028)
// ---------------------------------------------------------------------------------------------------------------------
export interface ScopeQuery { q: string; queryId: string; relationId: string; scopeKey: string; kind: 'scoped' | 'evergreen' }

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Europe PMC journal filter value: the title as stored, without a leading "The", quotes removed. */
export function journalTerm(label: string): string {
  return label.replace(/^the\s+/i, '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Every journal a stored article came from: record-only rows made by registerArticleSource (DEC-026), now also the search scope. */
export async function articleSourceJournals(env: Env): Promise<string[]> {
  try {
    const rows = (await env.DB.prepare(`SELECT label FROM source_feeds WHERE route = 'kaduse-research' AND external_ref = 'article-source' ORDER BY lower(label)`).all<{ label: string }>()).results;
    return [...new Set(rows.map((r) => journalTerm(r.label)).filter((t) => t.length >= 3))];
  } catch {
    return [];
  }
}

/**
 * Searches for one run, beyond the plain topic search:
 *  - scoped: every relation query again, limited to a batch of article-source journals, so a Lancet or Nature paper is not pushed out of the
 *    top results of the all-journals search. The relation terms are the same; nothing about a journal changes the narrowing.
 *  - evergreen: the same relation, older than the "son dönem" window, ordered by citations. Citations only bring candidates; what is authority is
 *    decided by the owner's answers (wow_authority), never by this number.
 * Both take the least recently run first (wow_scope_runs) and stay inside WOW_CONFIG budgets (Bible §1.4).
 */
export async function scopeQueriesForRun(env: Env, base: Array<{ queryId: string; relationId: string; query: string }>, now: Date = new Date()): Promise<ScopeQuery[]> {
  if (!base.length) return [];
  try {
    const journals = await articleSourceJournals(env);
    const runs = new Map((await env.DB.prepare(`SELECT scope_key, last_run_at FROM wow_scope_runs`).all<{ scope_key: string; last_run_at: string | null }>()).results.map((r) => [r.scope_key, r.last_run_at || '']));
    const cutoff = isoDay(new Date(now.getTime() - RESEARCH_CURRENT_MAX_AGE_DAYS * 86_400_000));
    const all: ScopeQuery[] = [];
    const batches = Math.ceil(journals.length / WOW_CONFIG.journalsPerBatch);
    for (const b of base) {
      for (let i = 0; i < batches; i++) {
        const part = journals.slice(i * WOW_CONFIG.journalsPerBatch, (i + 1) * WOW_CONFIG.journalsPerBatch);
        all.push({ q: `(${b.query}) AND (${part.map((j) => `JOURNAL:"${j}"`).join(' OR ')})`, queryId: b.queryId, relationId: b.relationId, scopeKey: `${b.queryId}|j${i}`, kind: 'scoped' });
      }
      all.push({ q: `(${b.query}) AND FIRST_PDATE:[1900-01-01 TO ${cutoff}]`, queryId: b.queryId, relationId: b.relationId, scopeKey: `${b.queryId}|evergreen`, kind: 'evergreen' });
    }
    const take = (kind: 'scoped' | 'evergreen', n: number) => all.filter((x) => x.kind === kind).sort((a, b) => (runs.get(a.scopeKey) ?? '').localeCompare(runs.get(b.scopeKey) ?? '') || a.scopeKey.localeCompare(b.scopeKey)).slice(0, n);
    return [...take('scoped', WOW_CONFIG.scopedPerRun), ...take('evergreen', WOW_CONFIG.evergreenPerRun)];
  } catch {
    return [];
  }
}

export async function markScopeRun(env: Env, s: { scopeKey: string; kind: 'scoped' | 'evergreen' }, r: { total: number; created: number; error: string | null }): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO wow_scope_runs (scope_key, kind, last_run_at, last_total, last_created, last_error) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?)
       ON CONFLICT(scope_key) DO UPDATE SET last_run_at = excluded.last_run_at, last_total = excluded.last_total, last_created = excluded.last_created, last_error = excluded.last_error`,
    ).bind(s.scopeKey, s.kind, r.total, r.created, r.error).run();
  } catch { /* memory absent */ }
}

/** Time-sensitive ("son dönem") or Evergreen candidate, by the one Research window. No date: no guess. */
export function laneOf(publishedAt: string | null | undefined, now: Date = new Date()): 'TIME_SENSITIVE' | 'EVERGREEN' | null {
  const d = (publishedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const age = (Date.parse(isoDay(now)) - Date.parse(d)) / 86_400_000;
  return age > RESEARCH_CURRENT_MAX_AGE_DAYS ? 'EVERGREEN' : 'TIME_SENSITIVE';
}

interface AuthorityTally { key: string; yes: number; no: number; rate: number | null }
const tally = (rows: Array<{ key: string | null; verdict: string }>): AuthorityTally[] => {
  const m = new Map<string, { yes: number; no: number }>();
  for (const r of rows) { const k = r.key || 'bilinmiyor'; const c = m.get(k) ?? { yes: 0, no: 0 }; if (r.verdict === 'AUTHORITY') c.yes += 1; else c.no += 1; m.set(k, c); }
  return [...m.entries()].map(([key, c]) => ({ key, ...c, rate: c.yes + c.no >= WOW_CONFIG.authorityMinAnswers ? Math.round((c.yes / (c.yes + c.no)) * 100) : null })).sort((a, b) => (b.yes + b.no) - (a.yes + a.no));
};
/** What the owner's answers say about authority, per study type and per journal. A rate shows only from 5 answers (Bible §10.4). */
export async function authorityLearned(env: Env): Promise<{ answers: number; byStudyType: AuthorityTally[]; byJournal: AuthorityTally[] }> {
  const rows = (await env.DB.prepare(`SELECT a.verdict, a.study_type, a.journal FROM wow_authority a WHERE a.created_at = (SELECT MAX(x.created_at) FROM wow_authority x WHERE x.item_id = a.item_id)`).all<{ verdict: string; study_type: string | null; journal: string | null }>()).results;
  return { answers: rows.length, byStudyType: tally(rows.map((r) => ({ key: r.study_type, verdict: r.verdict }))), byJournal: tally(rows.map((r) => ({ key: r.journal, verdict: r.verdict }))).slice(0, 12) };
}

/** Owner answer on an Evergreen candidate: is this an accepted authority work for its topic? Stored with the facts the system can learn from. */
export async function recordAuthority(env: Env, raw: unknown): Promise<MemoryResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const b = raw as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!['itemId', 'verdict', 'note'].includes(k)) return { status: 400, body: { error: 'INVALID_BODY' } };
  const itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '';
  if (!itemId) return { status: 400, body: { error: 'INVALID_ITEM_ID' } };
  if (b.verdict !== 'AUTHORITY' && b.verdict !== 'NOT_AUTHORITY') return { status: 400, body: { error: 'INVALID_VERDICT' } };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > 400) return { status: 400, body: { error: 'INVALID_NOTE' } };
  try {
    const it = await env.DB.prepare(
      `SELECT COALESCE(s.title_orig, s.title) AS title, s.publisher AS journal, s.published_at,
              (SELECT e.study_type FROM evidence_cards e WHERE e.source_item_id = s.id LIMIT 1) AS study_type
         FROM source_items s WHERE s.id = ?`,
    ).bind(itemId).first<{ title: string; journal: string | null; published_at: string | null; study_type: string | null }>();
    if (!it) return { status: 404, body: { error: 'ITEM_NOT_FOUND' } };
    const id = newId('wowau');
    await env.DB.prepare(`INSERT INTO wow_authority (label_id, item_id, verdict, note, journal, study_type, published_at, title_orig) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, itemId, b.verdict, note || null, it.journal, it.study_type, it.published_at, it.title).run();
    return { status: 201, body: { ok: true, labelId: id, itemId, verdict: b.verdict, learned: await authorityLearned(env) } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/** Same finding under another id (preprint and published version, DOI and PMID records): lower-case letters and digits of the title. */
export function normTitleKey(title: string | null | undefined): string {
  const k = (title || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return k.length >= 25 ? k.slice(0, 160) : '';
}

/**
 * The seen ledger: DOIs/ids and normalized titles of every work the owner has decided. Decided = scored, any feedback except a still-snoozed
 * "skip" (skip waits skipSnoozeDays and then returns), or an authority verdict. Read before an item is processed and before a candidate is shown,
 * so an accepted or rejected work, or its other version, does not come in front of the owner again (Bible §7.5, §1.5 no repeated review).
 */
export async function decidedSets(env: Env, now: Date = new Date()): Promise<{ keys: Set<string>; titles: Set<string> }> {
  const keys = new Set<string>();
  const titles = new Set<string>();
  const since = new Date(now.getTime() - WOW_CONFIG.skipSnoozeDays * 86_400_000).toISOString();
  try {
    const rows = (await env.DB.prepare(
      `SELECT COALESCE(s.title_orig, s.title) AS title, s.dedupe_key AS key, s.canonical_work_id AS work
         FROM source_items s
        WHERE EXISTS (SELECT 1 FROM item_ratings r WHERE r.item_id = s.id)
           OR EXISTS (SELECT 1 FROM wow_feedback f WHERE f.item_id = s.id AND (f.kind <> 'skip' OR f.created_at >= ?))
           OR EXISTS (SELECT 1 FROM wow_authority a WHERE a.item_id = s.id)`,
    ).bind(since).all<{ title: string | null; key: string | null; work: string | null }>()).results;
    for (const r of rows) {
      if (r.key) keys.add(r.key.toLowerCase());
      if (r.work) keys.add(r.work.toLowerCase());
      const tk = normTitleKey(r.title);
      if (tk) titles.add(tk);
    }
  } catch { /* memory or ratings absent: nothing is decided yet */ }
  return { keys, titles };
}
