/**
 * Lane purity enforcement (owner decision 2026-10-26, Bible v4.1 §1.2, §2.3, §12.0, SPF-8..10).
 * Runs in the daily housekeeping tick so that no lane keeps items that belong elsewhere or have expired, without anyone
 * deciding item by item. Every change leaves the same trail as a Hub decision (editorial_decisions + review_feedback for rejects).
 * Pure decision function (`decideLanePurity`) is separate from the writer so it can be tested without a database.
 */
import { newId, type Env } from '../db/queries';
import { AUDIENCE_BLOCKED_SOURCES, NEWS_LANE_SOURCES } from '../ingress/lane-map';
import { normalizeDate, NEWS_MAX_AGE_DAYS } from '../ingress/ingest-gate';
import { extractDeadline } from '../ingress/deadline';
import { POLICY_FEED_IDS, SOURCE_CONTENT_POLICY, sourcePolicyVerdict } from '../ingress/source-policy';
import type { ReasonCode } from './feedback';

export const LANE_PURITY_ACTOR = 'system:lane-purity';
/** Duyuru items with no known deadline are treated as expired once this old (SPF-10: expired or non-actionable cannot pass). */
export const DUYURU_EXPIRED_AFTER_DAYS = 90;
const MAX_PER_RUN = 200;
const CHUNK = 25;

export interface PurityRow {
  id: string;
  feed_id: string | null;
  route: string;
  channel_id: string | null;
  source_id: string | null;
  title: string | null;
  published_at: string | null;
  deadline_at: string | null;
  acquisition_path: string | null;
  evergreen_view: string | null;
  canonical_url?: string | null;
  canonical_work_id?: string | null;
  summary?: string | null;
}

export type PurityDecision =
  | { kind: 'reject'; reason: ReasonCode; note: string }
  | { kind: 'hold'; note: string; candidate?: boolean }
  | { kind: 'move'; to: 'kaduse-news' };

/** Result / placement announcements describe something that already happened; not actionable once a couple of weeks old (SPF-10). */
const RESULT_TITLE = /(sonuçları?\s+açıklandı|sonuçlarına\s+ilişkin|yerleştirme\s+sonuçları|ek\s+yerleştirme|sayısı\s+yayınlandı|cevap\s+anahtar)/i;
export const RESULT_ANNOUNCEMENT_MAX_AGE_DAYS = 14;
/** Search-engine / aggregator redirect URLs: no primary source behind the item (Bible 24.3). */
const AGGREGATOR_URL = /^https?:\/\/(news\.google\.com|www\.bing\.com\/news|www\.bing\.com\/search)/i;
export const PRIMARY_RESEARCH_URL = /^https?:\/\/(doi\.org|dx\.doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|www\.ncbi\.nlm\.nih\.gov\/pmc|europepmc\.org)\//i;

/**
 * Freshness line X for Time Sensitive Research (owner rule 2026-10-29): newer than X = New Research; older than X leaves New Research
 * and appears only in Research Rediscovery, and only if the owner judges it very important ("Rediscovery'ye al"). Importance decides, age only routes.
 * Older items are held (never deleted); those with a DOI/PMID are marked `rediscovery_candidate` so the owner can promote them.
 */
export const RESEARCH_CURRENT_MAX_AGE_DAYS = 90;
export const REDISCOVERY_CANDIDATE = 'rediscovery_candidate';

/**
 * Audience gate #1 (Bible 12.0): US domestic politics and local policy fights do not serve Turkish medical students, professionals or health-minded readers.
 * Terms are ASCII so the same list drives the SQL scan (SQLite lower() is ASCII-only). Studies with a DOI/PMID URL are never touched.
 */
export const US_POLITICS_TERMS = ['trump', 'biden', 'medicaid', 'medicare', 'obamacare', 'senato', 'beyaz saray', 'white house', 'capitol hill'] as const;
const US_POLITICS_TITLE = new RegExp(`(^|[^a-z])(${US_POLITICS_TERMS.join('|')})`, 'i');
const usPoliticsSql = US_POLITICS_TERMS.map((t) => `lower(title) LIKE '%${t}%'`).join(' OR ');

/** Not content at all: journal housekeeping pages and dataset registry records (audit 2026-10-29, item 14g). */
const NON_CONTENT_TITLE = /(information for authors|instructions for authors|table of contents|editorial board|front cover|back cover|masthead|issue information)/i;
const DATASET_URL = /\/projects\/gap\/cgi-bin\/study\.cgi/i;
/** Duyuru must be actionable (SPF-10): an institution reporting its own past activity is neither an announcement nor Haber. */
const INSTITUTION_ACTIVITY_TITLE = /(görüşme\s+gerçekleştirdik|ziyaret\s+(etti|ettik|gerçekleştirdi)|ziyaretinde\s+bulundu|sayısı\s+yay[ıi]mlandı|sayısı\s+yayınlandı|çalıştayı\s+düzenlendi|toplantısı\s+(yapıldı|gerçekleştirildi)|kongreye\s+katıl|başsağlığı|taziye|anma\s+töreni|kutlu\s+olsun)/i;

const dayNumber = (iso: string): number => Date.parse(iso.slice(0, 10)) / 86_400_000;

/** One decision for an open inbox item, or null to leave it. */
export function decideLanePurity(r: PurityRow, now: Date = new Date()): PurityDecision | null {
  const today = dayNumber(now.toISOString());
  const date = normalizeDate(r.published_at);
  const age = date ? today - dayNumber(date) : null;
  const evergreen = !!r.evergreen_view || r.acquisition_path === 'EVERGREEN';

  if (r.route === 'tip-ogrencileri') {
    const sid = r.source_id ?? '';
    // Turkish-aware lower case: /i alone does not fold 'İ' to 'i', so upper-case titles (TDB, ÖSYM) would slip through.
    const low = (r.title ?? '').toLocaleLowerCase('tr-TR');
    if (!(r.title ?? '').trim()) return { kind: 'reject', reason: 'bad_title_or_summary', note: 'Empty title: not an actionable announcement (SPF-10).' };
    if (AUDIENCE_BLOCKED_SOURCES.has(sid)) return { kind: 'reject', reason: 'not_relevant_for_channel', note: 'Audience gate #1 (Bible 12.0): source does not fit our audiences.' };
    if (NEWS_LANE_SOURCES.has(sid)) {
      if (age !== null && age <= NEWS_MAX_AGE_DAYS) return { kind: 'move', to: 'kaduse-news' };
      return { kind: 'reject', reason: 'stale', note: 'News-type item in Duyuru (lane purity, Bible 2.3); older than the 10-day Haber window or undated.' };
    }
    if (INSTITUTION_ACTIVITY_TITLE.test(low)) return { kind: 'reject', reason: 'wrong_category', note: 'Institution reporting its own past activity: nothing to act on, not an announcement (SPF-10, lane purity).' };
    if (RESULT_TITLE.test(low) && age !== null && age > RESULT_ANNOUNCEMENT_MAX_AGE_DAYS) return { kind: 'reject', reason: 'expired_opportunity', note: `Result announcement ${age} days old: nothing left to act on (SPF-10).` };
    const deadline = normalizeDate(r.deadline_at) ?? extractDeadline(`${r.title ?? ''} ${r.summary ?? ''}`, date);
    if (deadline && dayNumber(deadline) < today) return { kind: 'reject', reason: 'expired_opportunity', note: `Deadline ${deadline} has passed (SPF-10, Bible 20.3).` };
    if (!deadline && age !== null && age > DUYURU_EXPIRED_AFTER_DAYS) return { kind: 'reject', reason: 'expired_opportunity', note: `Published ${age} days ago and no deadline known; expired items cannot pass (SPF-10, Bible 20.3).` };
    return null;
  }
  if ((r.route === 'kaduse-research' || r.route === 'kaduse-news') && !evergreen && US_POLITICS_TITLE.test(r.title ?? '') && !PRIMARY_RESEARCH_URL.test(r.canonical_url ?? '')) {
    return { kind: 'reject', reason: 'not_relevant_for_channel', note: 'US domestic politics / policy news: fails audience gate #1 (Bible 12.0) for Turkish medical and health audiences.' };
  }
  if (r.route === 'kaduse-research') {
    const url = r.canonical_url ?? '';
    if (NON_CONTENT_TITLE.test(r.title ?? '') || DATASET_URL.test(url)) {
      return { kind: 'reject', reason: 'wrong_category', note: 'Journal housekeeping page or dataset registry record (dbGaP): not a study (audit 14g).' };
    }
    if (r.evergreen_view === 'research_rediscovery' && url && !PRIMARY_RESEARCH_URL.test(url)) {
      return { kind: 'reject', reason: 'wrong_category', note: 'Research Rediscovery keeps studies with a reachable DOI/PMID; patient guides and guideline pages do not qualify (audit item 19).' };
    }
    if (!evergreen && AGGREGATOR_URL.test(url)) {
      if ((r.feed_id ?? '') === 'research-nature-news') return { kind: 'reject', reason: 'misleading_or_untrusted', note: 'Search-proxy residue from a news.google.com redirect: off-domain, no primary source (audit 14a/14j).' };
      return { kind: 'hold', note: 'Aggregator redirect URL, primary source unknown: held (Bible 24.3).' };
    }
    if (!evergreen && age !== null && age > RESEARCH_CURRENT_MAX_AGE_DAYS) {
      const candidate = PRIMARY_RESEARCH_URL.test(url) || !!(r.canonical_work_id ?? '').trim();
      return { kind: 'hold', candidate, note: `Published ${age} days ago: not New Research (time axis, Bible 2.3). ${candidate ? 'Rediscovery candidate: the owner promotes it only if very important.' : 'No DOI/PMID, so it cannot enter Rediscovery; held.'}` };
    }
  }
  if ((r.route === 'kaduse-news' || r.route === 'kaduse-research') && !evergreen && age === null) {
    return { kind: 'hold', note: 'Undated item: unknown beats guess (Bible 0.4, SPF-8/9); held for review.' };
  }
  return null;
}

export interface LanePurityResult { scanned: number; rejected: number; held: number; moved: number }

/** Haber held by the system (never by the owner) and older than this has missed its news window for good: nothing left to decide. */
export const HELD_NEWS_EXPIRES_AFTER_DAYS = 30;

/** Second pass: reject system-held, long-expired Haber items with the same trail as a Hub reject. Owner-held items are never touched. */
async function expireSystemHeldNews(env: Env, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - HELD_NEWS_EXPIRES_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.feed_id, i.source_id, i.route, i.channel_id FROM source_items i
      WHERE i.route = 'kaduse-news' AND i.triage_status = 'hold' AND i.evergreen_view IS NULL AND COALESCE(i.acquisition_path, '') != 'EVERGREEN'
        AND i.published_at GLOB '[0-9][0-9][0-9][0-9]-*' AND substr(i.published_at, 1, 10) < ?
        AND (SELECT d.actor FROM editorial_decisions d WHERE d.source_item_id = i.id ORDER BY d.decided_at DESC LIMIT 1) LIKE 'system:%'
      ORDER BY i.updated_at LIMIT ${MAX_PER_RUN}`
  ).bind(cutoff).all<{ id: string; feed_id: string | null; source_id: string | null; route: string; channel_id: string | null }>();
  const rows = results ?? [];
  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const stmts: D1PreparedStatement[] = [];
    for (const row of rows.slice(i, i + CHUNK)) {
      stmts.push(
        env.DB.prepare(`UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = ${stamp} WHERE id = ? AND triage_status = 'hold'`).bind(row.id),
        env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'delete', 'hold', 'trash', ?)`).bind(newId('dec'), row.id, LANE_PURITY_ACTOR),
        env.DB.prepare(
          `INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer) VALUES (?, ?, ?, ?, ?, ?, 'rejected', 'stale', ?, ?)`
        ).bind(newId('fb'), row.id, row.feed_id, row.source_id, row.route, row.channel_id, `System-held news older than ${HELD_NEWS_EXPIRES_AFTER_DAYS} days: outside the news window, nothing left to decide (Bible 2.3).`, LANE_PURITY_ACTOR)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return rows.length;
}

/** Third pass: open items (inbox or hold) of a source with an owner content policy that the policy refuses (ingress/source-policy.ts). */
async function enforceSourcePolicies(env: Env): Promise<number> {
  if (!POLICY_FEED_IDS.length) return 0;
  const marks = POLICY_FEED_IDS.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT id, feed_id, source_id, route, channel_id, title, title_orig, triage_status FROM source_items
      WHERE feed_id IN (${marks}) AND triage_status IN ('inbox', 'hold') ORDER BY updated_at LIMIT 1000`
  ).bind(...POLICY_FEED_IDS).all<{ id: string; feed_id: string; source_id: string | null; route: string; channel_id: string | null; title: string | null; title_orig: string | null; triage_status: 'inbox' | 'hold' }>();
  const refused = (results ?? []).filter((r) => sourcePolicyVerdict(r.feed_id, r.title, r.title_orig) === 'deny').slice(0, MAX_PER_RUN);
  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  for (let i = 0; i < refused.length; i += CHUNK) {
    const stmts: D1PreparedStatement[] = [];
    for (const row of refused.slice(i, i + CHUNK)) {
      stmts.push(
        env.DB.prepare(`UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = ${stamp} WHERE id = ? AND triage_status = ?`).bind(row.id, row.triage_status),
        env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'delete', ?, 'trash', ?)`).bind(newId('dec'), row.id, row.triage_status, LANE_PURITY_ACTOR),
        env.DB.prepare(
          `INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer) VALUES (?, ?, ?, ?, ?, ?, 'rejected', 'not_relevant_for_channel', ?, ?)`
        ).bind(newId('fb'), row.id, row.feed_id, row.source_id, row.route, row.channel_id, SOURCE_CONTENT_POLICY[row.feed_id]?.note ?? 'Source content policy.', LANE_PURITY_ACTOR)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  return refused.length;
}

export async function enforceLanePurity(env: Env, now: Date = new Date()): Promise<LanePurityResult> {
  const { results } = await env.DB.prepare(
    `SELECT id, feed_id, route, channel_id, source_id, title, published_at, deadline_at, acquisition_path, evergreen_view, canonical_url, canonical_work_id, substr(summary, 1, 600) AS summary
     FROM source_items
     WHERE triage_status = 'inbox'
       AND (route = 'tip-ogrencileri'
         OR (route IN ('kaduse-news', 'kaduse-research')
             AND (published_at IS NULL OR published_at = '' OR published_at NOT GLOB '[0-9][0-9][0-9][0-9]-*'))
         OR (route IN ('kaduse-news', 'kaduse-research') AND (${usPoliticsSql}))
         OR (route = 'kaduse-research' AND (canonical_url LIKE '%/projects/gap/cgi-bin/study.cgi%' OR lower(title) LIKE '%information for authors%' OR lower(title) LIKE '%instructions for authors%'
             OR lower(title) LIKE '%table of contents%' OR lower(title) LIKE '%editorial board%' OR lower(title) LIKE '%issue information%'))
         OR (route = 'kaduse-research' AND (canonical_url LIKE 'http%://news.google.com/%' OR canonical_url LIKE 'http%://www.bing.com/%' OR evergreen_view = 'research_rediscovery'
             OR (published_at GLOB '[0-9][0-9][0-9][0-9]-*' AND substr(published_at, 1, 10) < date('now', '-90 days')))))
     ORDER BY CASE WHEN route = 'tip-ogrencileri' THEN 0 ELSE 1 END, updated_at LIMIT 3000`
  ).all<PurityRow>();
  const rows = results ?? [];
  const acts: { row: PurityRow; d: PurityDecision }[] = [];
  for (const row of rows) {
    const d = decideLanePurity(row, now);
    if (d) acts.push({ row, d });
    if (acts.length >= MAX_PER_RUN) break;
  }
  const out: LanePurityResult = { scanned: rows.length, rejected: 0, held: 0, moved: 0 };
  const stamp = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

  for (let i = 0; i < acts.length; i += CHUNK) {
    const stmts: D1PreparedStatement[] = [];
    for (const { row, d } of acts.slice(i, i + CHUNK)) {
      if (d.kind === 'reject') {
        stmts.push(
          env.DB.prepare(`UPDATE source_items SET triage_status = 'trash', archive_kind = 'deleted', updated_at = ${stamp} WHERE id = ? AND triage_status = 'inbox'`).bind(row.id),
          env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'delete', 'inbox', 'trash', ?)`).bind(newId('dec'), row.id, LANE_PURITY_ACTOR),
          env.DB.prepare(
            `INSERT INTO review_feedback (id, item_id, feed_id, source_id, route, channel_id, decision, reason_code, reason_note, reviewer) VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?)`
          ).bind(newId('fb'), row.id, row.feed_id, row.source_id, row.route, row.channel_id, d.reason, d.note, LANE_PURITY_ACTOR)
        );
        out.rejected += 1;
      } else if (d.kind === 'hold') {
        stmts.push(
          env.DB.prepare(
            `UPDATE source_items SET triage_status = 'hold', discovery_reason = CASE WHEN ? = 1 THEN '${REDISCOVERY_CANDIDATE}' ELSE discovery_reason END, updated_at = ${stamp} WHERE id = ? AND triage_status = 'inbox'`
          ).bind(d.candidate ? 1 : 0, row.id),
          env.DB.prepare(`INSERT INTO editorial_decisions (id, source_item_id, action, from_status, to_status, actor) VALUES (?, ?, 'hold', 'inbox', 'hold', ?)`).bind(newId('dec'), row.id, LANE_PURITY_ACTOR)
        );
        out.held += 1;
      } else {
        // Move to Haber unless the twin already exists there (unique (route, dedupe_key)); the Tıp brand, family and decision route are dropped like at ingestion.
        stmts.push(
          env.DB.prepare(
            `UPDATE source_items SET route = 'kaduse-news', channel_id = 'kaduse-medikal', editorial_brand = NULL, content_family = NULL, decision_route = NULL, enrichment_status = 'pending', updated_at = ${stamp}
             WHERE id = ? AND route = 'tip-ogrencileri' AND triage_status = 'inbox'
               AND NOT EXISTS (SELECT 1 FROM source_items x WHERE x.route = 'kaduse-news' AND x.dedupe_key = source_items.dedupe_key)`
          ).bind(row.id)
        );
        out.moved += 1;
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
  }
  out.rejected += await expireSystemHeldNews(env, now);
  out.rejected += await enforceSourcePolicies(env);
  // One log line per sweep so a silent run (nothing to do) is distinguishable from a run that never happened.
  console.log(JSON.stringify({ event: 'lane_purity_run', ...out }));
  return out;
}
