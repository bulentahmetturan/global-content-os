/**
 * Run ledger — bounded batch state, progress visibility, quarantine, replay.
 *
 * In-memory only (no new D1 tables in this sprint: 0045 stays free). Existing
 * discovery ledgers remain authoritative for admission; this ledger tracks the
 * Protocols ingestion run itself so operators can diagnose without new schema.
 */

import { INGESTION_BOUNDS, type Diagnostic, type DiagnosticCode } from './types';
import type { Env } from '../../db/queries';

export interface IngestionRunState {
  runId: string;
  protocolId: string;
  startedAt: string;
  sourcesPlanned: number;
  sourcesPermitted: number;
  recordsMapped: number;
  recordsPersisted: number;
  quarantined: string[];
  diagnostics: Diagnostic[];
  status: 'OPEN' | 'DRY_RUN_COMPLETE' | 'PERSISTED' | 'PARTIAL' | 'BLOCKED';
}

let sequence = 0;

export function openRun(protocolId: string): IngestionRunState {
  sequence += 1;
  return {
    runId: `ingest-${Date.now()}-${sequence}`,
    protocolId,
    startedAt: new Date().toISOString(),
    sourcesPlanned: 0,
    sourcesPermitted: 0,
    recordsMapped: 0,
    recordsPersisted: 0,
    quarantined: [],
    diagnostics: [],
    status: 'OPEN',
  };
}

export function noteRun(run: IngestionRunState, code: DiagnosticCode, detail: string, key?: string): void {
  run.diagnostics.push({ code, detail, key });
}

export function enforceBounds(input: { sources: number; components: number; claims: number; evidence: number; safety: number }): void {
  if (input.sources > INGESTION_BOUNDS.MAX_SOURCES_PER_RUN) throw new Error(`BOUND_EXCEEDED:sources ${input.sources}`);
  if (input.components > INGESTION_BOUNDS.MAX_COMPONENTS_PER_VERSION) throw new Error('BOUND_EXCEEDED:components');
  if (input.claims > INGESTION_BOUNDS.MAX_CLAIMS_PER_RUN) throw new Error('BOUND_EXCEEDED:claims');
  if (input.evidence > INGESTION_BOUNDS.MAX_EVIDENCE_PER_RUN) throw new Error('BOUND_EXCEEDED:evidence');
  if (input.safety > INGESTION_BOUNDS.MAX_SAFETY_RULES_PER_RUN) throw new Error('BOUND_EXCEEDED:safety');
}

export function closeRun(run: IngestionRunState, status: IngestionRunState['status']): IngestionRunState {
  run.status = status;
  return run;
}

export interface DurableRunInput {
  protocolId: string;
  candidateId: string;
  admissionVersion: string;
  contentHash: string;
  decidedBy: string;
}

/**
 * Durable run record (migration 0045). Replay-safe: the same
 * (protocol, admission version, content hash) returns the existing row
 * instead of creating a duplicate run.
 *
 * Atomic claim: INSERT ... ON CONFLICT DO NOTHING + re-SELECT, so two
 * concurrent workers racing on the same content converge on one run_id
 * (the UNIQUE replay-guard index is the arbiter, not application logic).
 * Resume semantics: PERSISTED runs replay (no new work); OPEN / PARTIAL /
 * QUARANTINED / BLOCKED runs resume (idempotent re-execution is safe).
 */
export async function recordDurableRun(
  db: Env['DB'],
  input: DurableRunInput,
): Promise<{ runId: string; replayed: boolean; resumed: boolean }> {
  const runId = `ingest_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(16)}`;
  await db.prepare(
    `INSERT INTO protocol_ingestion_runs
      (run_id, protocol_id, candidate_id, admission_package_version, content_hash, status, decided_by)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?)
     ON CONFLICT(protocol_id, admission_package_version, content_hash) DO NOTHING`,
  ).bind(runId, input.protocolId, input.candidateId, input.admissionVersion, input.contentHash, input.decidedBy).run();
  const winner = await db.prepare(
    `SELECT run_id, status FROM protocol_ingestion_runs
      WHERE protocol_id = ? AND admission_package_version = ? AND content_hash = ?`,
  ).bind(input.protocolId, input.admissionVersion, input.contentHash)
    .first<{ run_id: string; status: string }>();
  if (!winner) throw new Error('INGESTION_RUN_CLAIM_FAILED');
  if (winner.run_id !== runId) {
    return { runId: winner.run_id, replayed: winner.status === 'PERSISTED', resumed: winner.status !== 'PERSISTED' };
  }
  return { runId, replayed: false, resumed: false };
}

export async function updateDurableRun(
  db: Env['DB'],
  runId: string,
  patch: {
    status: IngestionRunState['status'] | 'QUARANTINED';
    sourcesPlanned?: number;
    sourcesPermitted?: number;
    recordsMapped?: number;
    recordsPersisted?: number;
    quarantinedIds?: string[];
    diagnostics?: Diagnostic[];
  },
): Promise<void> {
  const status = patch.status === 'DRY_RUN_COMPLETE' || patch.status === 'OPEN' ? patch.status
    : patch.status === 'PERSISTED' ? 'PERSISTED'
    : patch.status === 'PARTIAL' ? 'PARTIAL'
    : patch.status === 'BLOCKED' ? 'BLOCKED'
    : 'QUARANTINED';
  await db.prepare(
    `UPDATE protocol_ingestion_runs SET status = ?, sources_planned = COALESCE(?, sources_planned),
      sources_permitted = COALESCE(?, sources_permitted), records_mapped = COALESCE(?, records_mapped),
      records_persisted = COALESCE(?, records_persisted),
      quarantined_ids_json = COALESCE(?, quarantined_ids_json),
      diagnostics_json = COALESCE(?, diagnostics_json),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE run_id = ?`,
  ).bind(
    status,
    patch.sourcesPlanned ?? null, patch.sourcesPermitted ?? null,
    patch.recordsMapped ?? null, patch.recordsPersisted ?? null,
    patch.quarantinedIds ? JSON.stringify(patch.quarantinedIds) : null,
    patch.diagnostics ? JSON.stringify(patch.diagnostics) : null,
    runId,
  ).run();
}
