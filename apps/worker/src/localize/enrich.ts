/**
 * LLM + structured evidence enrichment (Workers AI, free-tier friendly).
 * A: extract route-specific evidence JSON (no invention)
 * B: titleTr + one-sentence gistTr from that evidence only
 */

import type { Env, RouteId } from '../db/queries';
import { looksMostlyEnglish } from './tr';

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const BATCH_DEFAULT = 6;

export type EnrichmentStatus = 'pending' | 'done' | 'failed' | 'skipped';

function stripHtml(s: string): string {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFromAi(out: unknown): string {
  if (typeof out === 'string') return out.trim();
  if (!out || typeof out !== 'object') return String(out ?? '');
  const o = out as AiRunResult & Record<string, unknown>;
  if (typeof o.response === 'string') return o.response.trim();
  if (typeof o.result === 'string') return o.result.trim();
  if (Array.isArray(o.response)) {
    return o.response
      .map((p) => (typeof p === 'string' ? p : (p as { content?: string })?.content || ''))
      .join('')
      .trim();
  }
  // Some models return { response: { response: "..." } } nesting
  if (o.response && typeof o.response === 'object') {
    const inner = o.response as Record<string, unknown>;
    if (typeof inner.response === 'string') return inner.response.trim();
  }
  return JSON.stringify(out);
}

async function runLlm(env: Env, system: string, user: string): Promise<string> {
  if (!env.AI) throw new Error('AI_BINDING_MISSING');
  const out = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 500,
  });
  const text = textFromAi(out);
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return text;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] || raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function schemaForRoute(route: RouteId): { systemA: string; fields: string[] } {
  if (route === 'kaduse-research') {
    return {
      fields: ['finding', 'population', 'outcome', 'limitation'],
      systemA: `You extract structured medical-research evidence from a paper title and abstract.
Return ONLY valid JSON with keys: finding, population, outcome, limitation (strings; use "" if unknown).
Rules: use only facts present in the text; never invent results, numbers, or claims.
Prefer the strongest concrete finding/outcome for "finding" and "outcome".`,
    };
  }
  if (route === 'tip-ogrencileri') {
    return {
      fields: ['topic', 'announcement'],
      systemA: `You extract structured facts from a Turkish/English medical-student announcement.
Return ONLY valid JSON with keys: topic, announcement (strings; use "" if unknown).
Rules: use only facts in the text; never invent dates, deadlines, or eligibility.`,
    };
  }
  return {
    fields: ['actor', 'action', 'whatsNew', 'audience'],
    systemA: `You extract structured news evidence from a health/medtech/regulatory headline and blurb.
Return ONLY valid JSON with keys: actor, action, whatsNew, audience (strings; use "" if unknown).
Rules: use only facts in the text; never invent approvals, products, or outcomes.`,
  };
}

async function extractEvidence(
  env: Env,
  route: RouteId,
  title: string,
  summary: string
): Promise<Record<string, string>> {
  const { systemA, fields } = schemaForRoute(route);
  const user = `TITLE: ${title}\nTEXT: ${summary.slice(0, 1200)}\n\nJSON:`;
  const raw = await runLlm(env, systemA, user);
  const parsed = extractJsonObject(raw) || {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = parsed[f];
    out[f] = typeof v === 'string' ? v.trim() : '';
  }
  return out;
}

async function toTurkish(env: Env, text: string): Promise<string> {
  const raw = (text || '').trim();
  if (!raw) return raw;
  if (!looksMostlyEnglish(raw) || /[ğüşıöçĞÜŞİÖÇ]/.test(raw)) return raw;
  const out = await runLlm(
    env,
    'Translate the user text into natural Turkish. Return ONLY the Turkish translation, no quotes, no JSON, no explanation.',
    raw.slice(0, 500)
  );
  const line = out.split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('{')) || out.trim();
  return line || raw;
}

async function renderHubTr(
  env: Env,
  route: RouteId,
  titleOrig: string,
  evidence: Record<string, string>
): Promise<{ titleTr: string; gistTr: string }> {
  const systemB = `Sen bir Türkçe editörsün. Sadece verilen EVIDENCE_JSON ve ORIGINAL_TITLE kullan.
SADECE geçerli JSON döndür: {"titleTr":"...","gistTr":"..."}.
Kurallar:
- titleTr: orijinal başlığın doğal Türkçe çevirisi.
- gistTr: kanıttan çıkan EN GÜÇLÜ sonucu anlatan TEK kısa Türkçe cümle (max ~120 karakter).
- Örnek: "DSÖ, geleneksel tıp için daha fazla araştırma istiyor."
- İki alan da MUTLAKA Türkçe. İngilizce yasak. Uydurma yasak.`;

  const user = `ROUTE: ${route}
ORIGINAL_TITLE: ${titleOrig}
EVIDENCE_JSON: ${JSON.stringify(evidence)}

JSON:`;
  const raw = await runLlm(env, systemB, user);
  const parsed = extractJsonObject(raw) || {};
  let titleTr =
    typeof parsed.titleTr === 'string' && parsed.titleTr.trim()
      ? parsed.titleTr.trim()
      : titleOrig;
  let gistTr =
    typeof parsed.gistTr === 'string' && parsed.gistTr.trim()
      ? parsed.gistTr.trim()
      : '';

  // If model ignored Turkish, force-translate (still free Workers AI).
  titleTr = await toTurkish(env, titleTr);
  if (!gistTr) {
    const bits = [evidence.actor, evidence.action, evidence.whatsNew, evidence.finding, evidence.outcome]
      .filter(Boolean)
      .join(' — ');
    gistTr = bits || titleOrig;
  }
  gistTr = await toTurkish(env, gistTr);

  if (gistTr.length > 160) {
    const cut = gistTr.slice(0, 160);
    const sp = cut.lastIndexOf(' ');
    gistTr = (sp > 80 ? cut.slice(0, sp) : cut).trim();
  }
  return { titleTr, gistTr };
}

export async function enrichOneItem(
  env: Env,
  row: {
    id: string;
    route: RouteId;
    title: string;
    title_orig: string | null;
    summary: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const sourceTitle = (row.title_orig || row.title || '').trim();
  const sourceSummary = stripHtml(row.summary || sourceTitle);

  // Already Turkish → skip LLM (free-tier thrift)
  // Force-enrich clear EN regulatory/news cues even if detector is unsure.
  const forceEn =
    /\b(WHO|FDA|NIH|EMA|U\.S\.|United States|approved|licensed|prequalif|Council|Press Release)\b/i.test(
      sourceTitle
    );
  if (
    !forceEn &&
    !looksMostlyEnglish(sourceTitle) &&
    !looksMostlyEnglish(sourceSummary.slice(0, 160))
  ) {
    await env.DB.prepare(
      `UPDATE source_items
       SET enrichment_status = 'skipped',
           enrichment_json = ?,
           enrichment_error = NULL,
           enriched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(JSON.stringify({ reason: 'already_turkish' }), row.id)
      .run();
    return { ok: true };
  }

  try {
    const evidence = await extractEvidence(env, row.route, sourceTitle, sourceSummary);
    const { titleTr, gistTr } = await renderHubTr(env, row.route, sourceTitle, evidence);

    await env.DB.prepare(
      `UPDATE source_items
       SET title = ?,
           title_orig = ?,
           summary = ?,
           gists_json = ?,
           enrichment_status = 'done',
           enrichment_json = ?,
           enrichment_error = NULL,
           enriched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(
        titleTr,
        sourceTitle,
        gistTr,
        JSON.stringify([gistTr]),
        JSON.stringify({ route: row.route, evidence, model: MODEL }),
        row.id
      )
      .run();

    // Mirror finding into evidence_cards when research
    if (row.route === 'kaduse-research' && evidence.finding) {
      const existing = await env.DB.prepare(
        `SELECT id FROM evidence_cards WHERE source_item_id = ?`
      )
        .bind(row.id)
        .first<{ id: string }>();
      if (existing) {
        await env.DB.prepare(
          `UPDATE evidence_cards SET finding = ?, limitation = ? WHERE id = ?`
        )
          .bind(evidence.finding || null, evidence.limitation || null, existing.id)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO evidence_cards (id, source_item_id, finding, limitation)
           VALUES (?, ?, ?, ?)`
        )
          .bind(
            `ev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            row.id,
            evidence.finding || null,
            evidence.limitation || null
          )
          .run();
      }
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE source_items
       SET enrichment_status = 'failed',
           enrichment_error = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(message.slice(0, 500), row.id)
      .run();
    return { ok: false, error: message };
  }
}

/** Process pending (and retry failed) inbox items — small batches for free tier. */
export async function runEnrichmentBatch(
  env: Env,
  opts: { limit?: number; route?: RouteId; ids?: string[] } = {}
): Promise<{ scanned: number; done: number; failed: number; skipped: number }> {
  const limit = Math.min(Math.max(opts.limit ?? BATCH_DEFAULT, 1), 20);

  let results: Array<{
    id: string;
    route: RouteId;
    title: string;
    title_orig: string | null;
    summary: string;
  }> = [];

  if (opts.ids?.length) {
    for (const id of opts.ids.slice(0, limit)) {
      const row = await env.DB.prepare(
        `SELECT id, route, title, title_orig, summary FROM source_items WHERE id = ?`
      )
        .bind(id)
        .first<{
          id: string;
          route: RouteId;
          title: string;
          title_orig: string | null;
          summary: string;
        }>();
      if (row) results.push(row);
    }
  } else {
    const binds: (string | number)[] = [];
    let sql = `SELECT id, route, title, title_orig, summary
             FROM source_items
             WHERE triage_status = 'inbox'
               AND enrichment_status IN ('pending', 'failed')`;
    if (opts.route) {
      sql += ` AND route = ?`;
      binds.push(opts.route);
    }
    sql += ` ORDER BY CASE
              WHEN title LIKE '%FDA %' OR title LIKE '%WHO %' OR title LIKE '% the %'
                OR title LIKE '%Approved%' OR title LIKE '%Licenses%' OR title LIKE '%Study%'
                OR title LIKE '%Health%' OR title LIKE '%Vaccine%' OR title LIKE '%Device%'
                OR title LIKE '%Plasma%' OR title LIKE '%Council%' OR title LIKE '%Press%'
              THEN 0 ELSE 1 END,
            fetched_at ASC
            LIMIT ?`;
    binds.push(limit);

    const q = await env.DB.prepare(sql).bind(...binds).all<{
      id: string;
      route: RouteId;
      title: string;
      title_orig: string | null;
      summary: string;
    }>();
    results = q.results ?? [];
  }

  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of results ?? []) {
    const r = await enrichOneItem(env, row);
    if (!r.ok) failed += 1;
    else {
      const st = await env.DB.prepare(
        `SELECT enrichment_status AS s FROM source_items WHERE id = ?`
      )
        .bind(row.id)
        .first<{ s: string }>();
      if (st?.s === 'skipped') skipped += 1;
      else done += 1;
    }
  }

  return { scanned: results?.length ?? 0, done, failed, skipped };
}

/** Mark new/updated English items pending without wiping prior TR enrichments. */
export function shouldSkipEnrichment(title: string, summary: string): boolean {
  return !looksMostlyEnglish(title) && !looksMostlyEnglish((summary || '').slice(0, 160));
}
