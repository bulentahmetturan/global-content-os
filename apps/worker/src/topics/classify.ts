/**
 * Deterministic topic classifier (Bible v5 §1.3 token friendly, §6.2 one object many topics, §6.10 stage 6 Classify).
 * Input: the English source title and, when the source gives one, the English abstract, at ingest time (before
 * translation replaces the summary). Output: the topic units (sub-topics UYK-NNN and relations UYK-RNN) an item
 * belongs to. No LLM, no network, no D1. The plan comes from topics/ via `node scripts/topics.mjs build`.
 *
 * Matching: text and terms are tokenised and lightly stemmed; a term matches when every one of its content words is
 * present (any order). A topic applies only when one of its anchor terms matches and no "other sense" phrase covers
 * the anchor (e.g. "sleeping cancer cells" is not sleep). Tagging is shadow: it never hides, rejects or promotes an item.
 */
import { TOPIC_PLAN, type TopicPlan } from './plan.generated';

const STOP = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'for', 'to', 'with', 'versus', 'vs', 'or', 'by', 'at', 'from', 'is', 'are']);

/** Light English stemmer: enough to join sleep/sleeping/sleeps and nap/naps/napping without merging nap and naproxen. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && /(ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  // napp -> nap, sitt -> sit (doubled final consonant left by -ing/-ed)
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz|ff)$/.test(w)) w = w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return (text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map(stem);
}

type Compiled = { stems: string[] };
const compileTerm = (term: string): Compiled => ({ stems: tokens(term) });
type Positions = Map<string, number[]>;
/** All content words present, inside a window of (words + 2) positions: "quality of sleep" matches "sleep quality",
 * but "continuous positive airway pressure ... sleep apnoea" does not match "sleep pressure". */
function matches(pos: Positions, t: Compiled): boolean {
  if (!t.stems.length) return false;
  const lists = t.stems.map((s) => pos.get(s));
  if (lists.some((l) => !l || !l.length)) return false;
  if (t.stems.length === 1) return true;
  const window = t.stems.length + 2;
  for (const start of lists[0] as number[]) {
    if (lists.every((l) => (l as number[]).some((p) => Math.abs(p - start) < window))) {
      const ps = lists.map((l) => (l as number[]).reduce((best, p) => (Math.abs(p - start) < Math.abs(best - start) ? p : best)));
      if (Math.max(...ps) - Math.min(...ps) < window) return true;
    }
  }
  return false;
}

/** Phrase (adjacent, in order) match, used for "other sense" phrases that must not count as the topic. */
function phraseAt(seq: string[], phrase: string[]): number[] {
  const at: number[] = [];
  for (let i = 0; i + phrase.length <= seq.length; i++) if (phrase.every((p, j) => seq[i + j] === p)) at.push(i);
  return at;
}

export interface UnitHit { unitId: string; kind: 'subtopic' | 'relation'; clusterId: string | null; tier: string | null; terms: string[] }
export interface TopicHit { topicId: string; anchors: string[]; units: UnitHit[] }
export interface Classification { planVersion: string; matchedOn: 'title' | 'title_abstract'; topics: TopicHit[] }

/**
 * A unit term like "HIIT sleep" or "high-intensity interval training sleep" carries the topic word only as context. When
 * the remaining words are two or more, they must sit together and the topic word may be anywhere (the item is already
 * anchored). A single remaining word ("sleep pressure") keeps the strict proximity rule, so generic words stay tight.
 */
function contextual(raw: string, anchorStems: Set<string>): { raw: string; c: Compiled; ctx: Compiled | null } {
  const c = compileTerm(raw);
  const rest = c.stems.filter((s) => !anchorStems.has(s));
  return { raw, c, ctx: rest.length >= 2 && rest.length < c.stems.length ? { stems: rest } : null };
}

interface CompiledTopic {
  topicId: string;
  anchors: Array<{ raw: string; c: Compiled }>;
  otherSenses: string[][];
  units: Array<{ unitId: string; kind: 'subtopic' | 'relation'; clusterId: string | null; tier: string | null; terms: Array<{ raw: string; c: Compiled; ctx: Compiled | null }> }>;
}
let cache: { plan: TopicPlan; topics: CompiledTopic[] } | null = null;
function compiled(plan: TopicPlan): CompiledTopic[] {
  if (cache && cache.plan === plan) return cache.topics;
  const topics = plan.topics.map((t) => {
    const anchorStems = new Set(t.anchors.map((a) => tokens(a)).filter((x) => x.length === 1).map((x) => x[0]));
    return {
    topicId: t.topicId,
    anchors: t.anchors.map((raw) => ({ raw, c: compileTerm(raw) })),
    otherSenses: t.otherSenses.map((s) => tokens(s)),
    units: t.units.map((u) => ({ unitId: u.id, kind: u.kind, clusterId: u.cluster, tier: u.tier, terms: u.terms.map((raw) => contextual(raw, anchorStems)) })),
  };
  });
  cache = { plan, topics };
  return topics;
}

export function classify(title: string, abstract: string | null | undefined, plan: TopicPlan = TOPIC_PLAN): Classification {
  const text = [title || '', abstract || ''].join(' . ');
  const seq = tokens(text);
  const out: TopicHit[] = [];
  for (const t of compiled(plan)) {
    // Remove words that belong to an "other sense" phrase before anchoring (e.g. "sleeping cell" -> no sleep anchor).
    const masked = seq.slice();
    for (const phrase of t.otherSenses) for (const i of phraseAt(seq, phrase)) for (let j = 0; j < phrase.length; j++) masked[i + j] = '';
    const have: Positions = new Map();
    masked.forEach((w, i) => { if (w) (have.get(w) ?? have.set(w, []).get(w)!).push(i); });
    const anchors = t.anchors.filter((a) => matches(have, a.c)).map((a) => a.raw);
    if (!anchors.length) continue;
    const units: UnitHit[] = [];
    for (const u of t.units) {
      const hit = u.terms.filter((x) => matches(have, x.c) || (x.ctx !== null && matches(have, x.ctx))).map((x) => x.raw);
      if (hit.length) units.push({ unitId: u.unitId, kind: u.kind, clusterId: u.clusterId, tier: u.tier, terms: hit });
    }
    out.push({ topicId: t.topicId, anchors, units });
  }
  return { planVersion: plan.version, matchedOn: abstract && abstract.trim() && abstract.trim() !== (title || '').trim() ? 'title_abstract' : 'title', topics: out };
}

/** Rollout gate: shadow tagging runs only for the configured route/feeds (pilot first, then '*'). */
export function taggingEnabledFor(route: string, feedId: string | null | undefined, plan: TopicPlan = TOPIC_PLAN): boolean {
  const r = plan.rollout;
  if (r.mode !== 'shadow' || !r.routes.includes(route)) return false;
  return r.feeds.includes('*') || (!!feedId && r.feeds.includes(feedId));
}
