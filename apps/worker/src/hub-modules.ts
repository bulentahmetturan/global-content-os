/**
 * Read-only summaries of the system modules (Dossier, Doctors, Protocols, Discovery, Statistics) for the Hub.
 * GET /api/hub/modules (Hub operator token). SELECTs only; every module is collected independently so one failing
 * table is reported as `{ error }` for that module and never hides the others. Counts and compact rows only.
 */
import type { Env } from './db/queries';

type Row = Record<string, unknown>;
export type ModuleResult = { error: string } | Record<string, unknown>;

async function all(db: D1Database, sql: string, ...binds: unknown[]): Promise<Row[]> {
  return (await db.prepare(sql).bind(...binds).all<Row>()).results;
}
async function count(db: D1Database, table: string): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return r?.n ?? 0;
}
async function guarded(fn: () => Promise<Record<string, unknown>>): Promise<ModuleResult> {
  try { return await fn(); } catch (e) { return { error: e instanceof Error ? e.message.slice(0, 120) : 'ERROR' }; }
}

export async function collectHubModules(env: Env): Promise<Record<string, ModuleResult>> {
  const db = env.DB;

  const dossier = guarded(async () => ({
    sources: await all(db, `SELECT control_key AS k, control_value AS v, updated_at FROM dossier_control
      WHERE control_key LIKE 'recurring:dossier-%:state' OR control_key LIKE 'recurring:dossier-%:state_reason' OR control_key = 'recurring_enabled'
      ORDER BY control_key`),
    runs: await all(db, `SELECT reader_id, status, phase, created_at, finished_at,
        json_extract(progress_json, '$.derived') AS derived, json_extract(progress_json, '$.itemsSeen') AS items_seen
      FROM dossier_canary_runs ORDER BY created_at DESC LIMIT 6`),
    observations: await all(db, `SELECT signal_family AS family, COUNT(*) AS n, MAX(observed_at) AS latest FROM dossier_observations GROUP BY signal_family`),
    counts: {
      concepts: await count(db, 'dossier_concepts'),
      candidates: await count(db, 'dossier_candidates'),
      relations: await count(db, 'dossier_relations'),
    },
  }));

  const doctors = guarded(async () => ({
    actors: await all(db, `SELECT a.actor_id, a.canonical_name, a.panel, a.credential_status, a.identity_confidence, a.active_status,
        (SELECT COUNT(*) FROM actor_source_associations s WHERE s.actor_id = a.actor_id) AS sources
      FROM actors a ORDER BY a.created_at, a.canonical_name`),
    candidates: await all(db, `SELECT canonical_name, state FROM candidate_ledger WHERE domain = 'DOCTOR' ORDER BY canonical_name`),
    onboarding: await all(db, `SELECT status, pipeline_stage, COUNT(*) AS n FROM onboarding_intents WHERE domain = 'DOCTOR' GROUP BY status, pipeline_stage`),
  }));

  const protocols = guarded(async () => ({
    counts: {
      protocols: await count(db, 'protocols'),
      versions: await count(db, 'protocol_versions'),
      families: await count(db, 'protocol_families'),
      claims: await count(db, 'protocol_claims'),
    },
    protocols: await all(db, `SELECT protocol_id, canonical_name, protocol_type, registry_state, active_status FROM protocols ORDER BY canonical_name LIMIT 100`),
  }));

  const discovery = guarded(async () => ({
    waves: await all(db, `SELECT domain, wave_number, status FROM discovery_runs ORDER BY domain, wave_number`),
    candidates: await all(db, `SELECT domain, state, COUNT(*) AS n FROM candidate_ledger GROUP BY domain, state ORDER BY domain, state`),
    decisions: await count(db, 'decision_ledger'),
  }));

  const statistics = guarded(async () => {
    if (!env.STATS_DB) return { error: 'STATS_DB_NOT_BOUND' };
    const s = env.STATS_DB;
    return {
      runs: await all(s, `SELECT status, run_mode, planned_at, finished_at, failure_class FROM statistics_ingestion_runs ORDER BY planned_at DESC LIMIT 6`),
      policy: await all(s, `SELECT runtime_state AS state, failure_count AS failures, COUNT(*) AS n FROM statistics_source_runtime_policy GROUP BY runtime_state, failure_count`),
      counts: {
        datasets: await count(s, 'statistics_datasets'),
        series: await count(s, 'statistics_series'),
        current_observations: await count(s, 'statistics_current_observations'),
      },
    };
  });

  const [d, dr, p, di, st] = await Promise.all([dossier, doctors, protocols, discovery, statistics]);
  return { dossier: d, doctors: dr, protocols: p, discovery: di, statistics: st };
}
