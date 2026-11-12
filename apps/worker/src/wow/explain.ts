/**
 * Plain Turkish explanation of an item (DEC-R-20261112-044, hard gate): ONE simple sentence that says why the item matters (its single most important point),
 * so the owner never has to open other pages to learn what the article means. Stored in item_explain (a014). Made from the item's own title and
 * summary only; a text that is too short, too long, equals the title or is not Turkish-looking is dropped and tried again later.
 */
import type { Env } from '../db/queries';
import { MODEL, textFromAi, type MemoryResult } from './memory';

const MAX_PER_CALL = 8;
const NOT_READY: MemoryResult = { status: 503, body: { error: 'EXPLAIN_NOT_READY', hint: 'apply migrations/addons/a014_item_explain.sql' } };
const notReady = (e: unknown) => /no such table/i.test(String(e));

export function validExplanation(text: unknown, title: string): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 30 || t.length > 260) return null;
  if (/[.!?](\s+\S)/.test(t.replace(/(?:Dr|Prof|Doç|vb|vs|örn|yy)\./gi, '$1'))) return null; // exactly one sentence
  if (/[{}\[\]<>]/.test(t)) return null;
  if (t.toLocaleLowerCase('tr-TR') === title.trim().toLocaleLowerCase('tr-TR')) return null;
  return /[çğıöşüÇĞİÖŞÜ]| ve | bir | için | ile /.test(t) ? t : null; // Turkish-looking
}

/** Existing explanations for the given item ids: { id: text }. */
export async function getExplains(env: Env, ids: string[]): Promise<MemoryResult> {
  const list = [...new Set(ids.filter((x) => typeof x === 'string' && x).slice(0, 300))];
  if (!list.length) return { status: 200, body: { ok: true, explains: {} } };
  try {
    const { results } = await env.DB.prepare(`SELECT item_id, text_tr FROM item_explain WHERE text_tr NOT LIKE '%. %' AND item_id IN (${list.map(() => '?').join(',')})`).bind(...list).all<{ item_id: string; text_tr: string }>();
    return { status: 200, body: { ok: true, explains: Object.fromEntries((results ?? []).map((r) => [r.item_id, r.text_tr])) } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

/** An older two-sentence explanation counts as missing and is replaced by the one-sentence text (DEC-R-20261112-044). Makes the missing explanations of up to 8 items (the given ids, or, without ids, the owner's articles first and then incoming items). */
export async function explainBatch(env: Env, ids?: string[]): Promise<MemoryResult> {
  try {
    let rows: Array<{ id: string; title: string; summary: string }>;
    if (ids && ids.length) {
      const list = [...new Set(ids.filter((x) => typeof x === 'string' && x))].slice(0, 60);
      rows = (await env.DB.prepare(
        `SELECT i.id AS id, COALESCE(i.title_orig, i.title) AS title, substr(COALESCE(i.summary, ''), 1, 900) AS summary FROM source_items i
          WHERE i.id IN (${list.map(() => '?').join(',')}) AND NOT EXISTS (SELECT 1 FROM item_explain x WHERE x.item_id = i.id AND x.text_tr NOT LIKE '%. %') LIMIT ${MAX_PER_CALL}`,
      ).bind(...list).all<{ id: string; title: string; summary: string }>()).results ?? [];
    } else {
      rows = (await env.DB.prepare(
        `SELECT i.id AS id, COALESCE(i.title_orig, i.title) AS title, substr(COALESCE(i.summary, ''), 1, 900) AS summary FROM source_items i
          WHERE NOT EXISTS (SELECT 1 FROM item_explain x WHERE x.item_id = i.id AND x.text_tr NOT LIKE '%. %')
            AND (i.discovery_reason = 'owner_wow_example' OR (i.triage_status = 'inbox' AND i.route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')))
          ORDER BY (i.discovery_reason = 'owner_wow_example') DESC, COALESCE(i.fetched_at, i.published_at) DESC LIMIT ${MAX_PER_CALL}`,
      ).all<{ id: string; title: string; summary: string }>()).results ?? [];
    }
    if (!rows.length) return { status: 200, body: { ok: true, generated: 0, remaining: await remaining(env) } };
    if (!env.AI) return { status: 503, body: { error: 'AI_NOT_BOUND' } };
    const list = rows.map((r, i) => ({ i, title: r.title, text: r.summary }));
    const system = `You explain items for a Turkish health-content editor who must understand an item without opening any other page. For each input item write exactly ONE SIMPLE Turkish sentence (everyday words a non-expert understands, no jargon, no abbreviations, at most 30 words) that says why this item is important to know: for a study, what it found and why that matters; for news, what happened; for an announcement, what is announced and the key date or deadline. Use only what the title and text say; never add facts. Answer with JSON only: [{"i":0,"t":"..."}] with one object per input item, same "i".`;
    const raw = textFromAi(await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(list) }], max_tokens: 1500 }));
    const m = /\[[\s\S]*\]/.exec(raw);
    let out: Array<{ i?: unknown; t?: unknown }> = [];
    try { out = m ? JSON.parse(m[0]) : []; } catch { out = []; }
    let generated = 0;
    for (const o of Array.isArray(out) ? out : []) {
      const r = typeof o.i === 'number' ? rows[o.i] : undefined;
      const t = r ? validExplanation(o.t, r.title) : null;
      if (!r || !t) continue;
      await env.DB.prepare(`INSERT OR REPLACE INTO item_explain (item_id, text_tr) VALUES (?, ?)`).bind(r.id, t).run();
      generated += 1;
    }
    return { status: 200, body: { ok: true, generated, remaining: await remaining(env) } };
  } catch (e) {
    if (notReady(e)) return NOT_READY;
    throw e;
  }
}

async function remaining(env: Env): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM source_items i WHERE NOT EXISTS (SELECT 1 FROM item_explain x WHERE x.item_id = i.id AND x.text_tr NOT LIKE '%. %')
        AND (i.discovery_reason = 'owner_wow_example' OR (i.triage_status = 'inbox' AND i.route IN ('kaduse-news', 'kaduse-research', 'tip-ogrencileri')))`,
  ).first<{ n: number }>();
  return Number(r?.n ?? 0);
}
