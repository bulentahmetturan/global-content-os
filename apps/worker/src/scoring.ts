/**
 * Owner-rating learner runner: trains from item_ratings, scores inbox items, reports quality.
 * Routes: POST /api/scoring/run, GET /api/scores/latest, GET /api/scoring/status (Hub operator token, ROUTE_GATES).
 * Needs migrations/addons/a002_scoring.sql; until then every call answers 503 SCORING_NOT_READY.
 * Nothing here changes triage_status; scores and gates only order and group items in the Hub.
 */
import { newId, type Env } from './db/queries';
import { extractFeatures } from './scoring/features';
import { emptyWeights, evaluate, parseWeights, predict, serializeWeights, topReasons, train, type Metrics, type Sample } from './scoring/model';

export interface ScoringResult { status: number; body: unknown }

/** A trained model replaces the rules-only prior only with enough ratings and a held-out result that is not worse than the rules. */
export const MIN_RATINGS_TO_ACTIVATE = 30;
const SCORE_LIMIT = 400;
const notReady = (e: unknown): boolean => /no such table/i.test(e instanceof Error ? e.message : String(e));

export function activationDecision(m: Metrics): { activate: boolean; reason: string } {
  if (m.insufficient || m.n < MIN_RATINGS_TO_ACTIVATE) return { activate: false, reason: `RULES_ONLY: ${m.n}/${MIN_RATINGS_TO_ACTIVATE} puan` };
  if (m.worthyAcc < m.baseline.worthyAcc) return { activate: false, reason: 'RULES_ONLY: öğrenilen model kurallardan kötü (değerli/değersiz isabeti)' };
  if (m.maeWow > m.baseline.maeWow) return { activate: false, reason: 'RULES_ONLY: öğrenilen modelin wow hatası kurallardan yüksek' };
  return { activate: true, reason: 'LEARNED: kurallardan kötü değil' };
}

interface SnapshotRow { item_id: string; wow: number; ch_tt: number; ch_ik: number; ch_km: number; snapshot_json: string }

function featuresOfSnapshot(json: string): { features: string[]; gates: string[] } {
  let s: Record<string, string | null> = {};
  try { s = JSON.parse(json); } catch { /* empty snapshot */ }
  return extractFeatures({ route: s.route, source: s.source, title: s.title, titleOrig: s.titleOrig, summary: s.summary });
}

async function loadLatestRatings(env: Env): Promise<SnapshotRow[]> {
  return (await env.DB.prepare(
    `SELECT r.item_id, r.wow, r.ch_tt, r.ch_ik, r.ch_km, r.snapshot_json
       FROM item_ratings r
      WHERE r.rated_at = (SELECT MAX(x.rated_at) FROM item_ratings x WHERE x.item_id = r.item_id)`,
  ).all<SnapshotRow>()).results;
}

export async function runScoring(env: Env): Promise<ScoringResult> {
  try {
    const rows = await loadLatestRatings(env);
    const parsed = rows.map((r) => ({ r, ...featuresOfSnapshot(r.snapshot_json) }));
    const samples: Sample[] = parsed.map((p) => ({ features: p.features, wow: p.r.wow, tt: p.r.ch_tt === 1, ik: p.r.ch_ik === 1, km: p.r.ch_km === 1 }));
    const metrics = evaluate(samples);
    const decision = activationDecision(metrics);
    const weights = decision.activate ? train(samples) : emptyWeights();
    // Gate errors: the owner rated something the rules would have set aside as worth publishing (wow >= 6).
    const gateErrors = parsed.filter((p) => p.gates.length && p.r.wow >= 6).map((p) => ({ itemId: p.r.item_id, gates: p.gates, wow: p.r.wow }));
    const modelId = newId('model');
    await env.DB.batch([
      env.DB.prepare(`UPDATE scoring_models SET active = 0 WHERE active = 1`),
      env.DB.prepare(`INSERT INTO scoring_models (model_id, n_ratings, active, activation, weights_json, metrics_json) VALUES (?, ?, 1, ?, ?, ?)`)
        .bind(modelId, samples.length, decision.reason, serializeWeights(weights), JSON.stringify({ ...metrics, gateErrors: gateErrors.length })),
    ]);

    const items = (await env.DB.prepare(
      `SELECT id, route, COALESCE(source_id, feed_id) AS source, title, title_orig, substr(summary, 1, 400) AS summary
         FROM source_items WHERE triage_status = 'inbox' ORDER BY fetched_at DESC LIMIT ?`,
    ).bind(SCORE_LIMIT).all<{ id: string; route: string; source: string | null; title: string | null; title_orig: string | null; summary: string | null }>()).results;
    const stmts = items.map((it) => {
      const x = extractFeatures({ route: it.route, source: it.source, title: it.title, titleOrig: it.title_orig, summary: it.summary });
      const p = predict(weights, x.features);
      return env.DB.prepare(
        `INSERT OR REPLACE INTO item_scores (item_id, model_id, wow, p_tt, p_ik, p_km, uncertainty, gates_json, reasons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(it.id, modelId, Math.round(p.wow * 10) / 10, p.tt, p.ik, p.km, p.uncertainty, JSON.stringify(x.gates), JSON.stringify(topReasons(weights, x.features)));
    });
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return { status: 200, body: { ok: true, modelId, activation: decision.reason, learned: decision.activate, ratings: samples.length, scored: items.length, metrics, gateErrors: gateErrors.slice(0, 20) } };
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'SCORING_NOT_READY' } };
    throw e;
  }
}

export async function latestScores(env: Env, ids: string[]): Promise<ScoringResult> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter((s) => s && s.length <= 80))].slice(0, 200);
  if (!clean.length) return { status: 200, body: { ok: true, scores: {} } };
  try {
    const rows = (await env.DB.prepare(
      `SELECT item_id, wow, p_tt, p_ik, p_km, uncertainty, gates_json, reasons_json FROM item_scores WHERE item_id IN (${clean.map(() => '?').join(',')})`,
    ).bind(...clean).all<{ item_id: string; wow: number; p_tt: number; p_ik: number; p_km: number; uncertainty: number; gates_json: string; reasons_json: string }>()).results;
    const scores: Record<string, unknown> = {};
    for (const r of rows) {
      scores[r.item_id] = { wow: r.wow, tt: r.p_tt, ik: r.p_ik, km: r.p_km, uncertainty: r.uncertainty, gates: JSON.parse(r.gates_json || '[]'), reasons: JSON.parse(r.reasons_json || '{}') };
    }
    return { status: 200, body: { ok: true, scores } };
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'SCORING_NOT_READY' } };
    throw e;
  }
}

export async function scoringStatus(env: Env): Promise<ScoringResult> {
  try {
    const models = (await env.DB.prepare(
      `SELECT model_id, created_at, n_ratings, active, activation, metrics_json FROM scoring_models ORDER BY created_at DESC LIMIT 10`,
    ).all<{ model_id: string; created_at: string; n_ratings: number; active: number; activation: string; metrics_json: string }>()).results;
    const history = models.map((m) => ({ modelId: m.model_id, createdAt: m.created_at, nRatings: m.n_ratings, active: m.active === 1, activation: m.activation, metrics: JSON.parse(m.metrics_json || '{}') }));
    const rated = await env.DB.prepare(`SELECT COUNT(DISTINCT item_id) AS n FROM item_ratings`).first<{ n: number }>();
    return { status: 200, body: { ok: true, minRatingsToActivate: MIN_RATINGS_TO_ACTIVATE, ratedItems: rated?.n ?? 0, current: history[0] ?? null, history } };
  } catch (e) {
    if (notReady(e)) return { status: 503, body: { error: 'SCORING_NOT_READY' } };
    throw e;
  }
}

export { parseWeights };
