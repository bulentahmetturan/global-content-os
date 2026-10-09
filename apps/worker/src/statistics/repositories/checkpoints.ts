import { StatisticsError } from '../errors';
import { checkpointId as makeCheckpointId } from '../identity';
import { assertTs } from '../rules';
import type { D1PreparedLike, StatisticsStorage } from '../storage';

export type UnitKind = 'SDMX_WINDOW' | 'REST_PAGE' | 'API_STAMP' | 'FILE_CHECKSUM' | 'PDF_ARTIFACT' | 'EXPORT_VERSION';

export interface CheckpointRow {
  checkpoint_id: string;
  dataset_id: string;
  scope_key: string;
  unit_kind: UnitKind;
  cursor_text: string | null;
  last_release_id: string | null;
  last_source_stamp: string | null;
  last_content_fingerprint: string | null;
  parser_version: string | null;
  last_run_id: string | null;
  last_success_at: string | null;
  lease_run_id: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  updated_at: string;
}

export interface CheckpointProgress {
  cursor: string | null;
  lastReleaseId?: string | null;
  lastSourceStamp?: string | null;
  lastContentFingerprint?: string | null;
  parserVersion?: string | null;
  /** Success time; defaults to the storage clock. */
  successAt?: string;
}

/**
 * Checkpoint progress statement. It deliberately has NO lease predicate in its WHERE clause: the frozen trigger STAT_CHECKPOINT_NOT_LEASED
 * evaluates the matched row and aborts the surrounding atomic batch when the advancing run does not hold the lease. That makes this
 * statement the atomic lease guard of every bounded write batch (a WHERE predicate would silently match zero rows instead).
 */
export function advanceStatement(s: StatisticsStorage, checkpointIdValue: string, runId: string, p: CheckpointProgress): D1PreparedLike {
  const at = p.successAt ?? s.now();
  assertTs('successAt', at);
  return s.stmt(
    `UPDATE statistics_checkpoints SET cursor_text = ?3, last_release_id = ?4, last_source_stamp = ?5, last_content_fingerprint = ?6, parser_version = ?7, last_run_id = ?2, last_success_at = ?8, updated_at = ?8 WHERE checkpoint_id = ?1`,
    checkpointIdValue, runId, p.cursor, p.lastReleaseId ?? null, p.lastSourceStamp ?? null, p.lastContentFingerprint ?? null, p.parserVersion ?? null, at,
  );
}

export function checkpointRepository(s: StatisticsStorage) {
  const getById = (id: string) => s.first<CheckpointRow>('SELECT * FROM statistics_checkpoints WHERE checkpoint_id = ?1', id);

  return {
    getById,
    async get(datasetId: string, scopeKey: string): Promise<CheckpointRow | null> {
      return getById(await makeCheckpointId(datasetId, scopeKey));
    },

    /** Idempotent creation of the resume record for a bounded unit (never started, no lease). */
    async initialize(datasetId: string, scopeKey: string, unitKind: UnitKind): Promise<{ checkpoint: CheckpointRow; created: boolean }> {
      const id = await makeCheckpointId(datasetId, scopeKey);
      const n = await s.run(`INSERT INTO statistics_checkpoints (checkpoint_id, dataset_id, scope_key, unit_kind, updated_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(checkpoint_id) DO NOTHING`, id, datasetId, scopeKey, unitKind, s.now());
      const row = (await getById(id))!;
      if (row.unit_kind !== unitKind) throw new StatisticsError('STATISTICS_CHECKPOINT_CONFLICT', 'checkpoint exists with a different unit kind', { detail: { checkpointId: id, have: row.unit_kind, want: unitKind } });
      return { checkpoint: row, created: n === 1 };
    },

    /**
     * Lease acquisition: one atomic UPDATE. Succeeds when the checkpoint is unleased or its lease has expired; a live lease can never be stolen.
     * `ttlMs` defaults to the configured budget. Returns the checkpoint with the new lease.
     */
    async acquireLease(datasetId: string, scopeKey: string, unitKind: UnitKind, runId: string, owner: string, ttlMs?: number): Promise<CheckpointRow> {
      const { checkpoint } = await this.initialize(datasetId, scopeKey, unitKind);
      const now = s.now();
      const exp = new Date(Date.parse(now) + (ttlMs ?? s.limits.leaseTtlMs)).toISOString();
      const n = await s.run(
        `UPDATE statistics_checkpoints SET lease_run_id = ?2, lease_owner = ?3, lease_expires_at = ?4, updated_at = ?5
          WHERE checkpoint_id = ?1 AND (lease_run_id IS NULL OR lease_expires_at <= ?5 OR lease_run_id = ?2)`,
        checkpoint.checkpoint_id, runId, owner, exp, now,
      );
      if (n !== 1) {
        const cur = await getById(checkpoint.checkpoint_id);
        throw new StatisticsError('STATISTICS_LEASE_CONFLICT', 'checkpoint is leased by another run', { detail: { checkpointId: checkpoint.checkpoint_id, leaseRunId: cur?.lease_run_id, leaseExpiresAt: cur?.lease_expires_at } });
      }
      return (await getById(checkpoint.checkpoint_id))!;
    },

    /** Extend a held lease (same run only). */
    async renewLease(checkpointIdValue: string, runId: string, ttlMs?: number): Promise<void> {
      const exp = new Date(Date.parse(s.now()) + (ttlMs ?? s.limits.leaseTtlMs)).toISOString();
      const n = await s.run(`UPDATE statistics_checkpoints SET lease_expires_at = ?3 WHERE checkpoint_id = ?1 AND lease_run_id = ?2`, checkpointIdValue, runId, exp);
      if (n !== 1) throw new StatisticsError('STATISTICS_LEASE_CONFLICT', 'lease is not held by this run', { detail: { checkpointId: checkpointIdValue, runId } });
    },

    /** Release by the holder only. Idempotent when the lease is already free. */
    async releaseLease(checkpointIdValue: string, runId: string): Promise<boolean> {
      const n = await s.run(`UPDATE statistics_checkpoints SET lease_run_id = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?3 WHERE checkpoint_id = ?1 AND lease_run_id = ?2`, checkpointIdValue, runId, s.now());
      return n === 1;
    },

    /**
     * Standalone advance (outside a bounded batch). Optional compare-and-set on the previous cursor detects a competing writer
     * (STATISTICS_CHECKPOINT_CONFLICT). The lease rule is enforced by the DB trigger (STATISTICS_LEASE_CONFLICT).
     */
    async advance(checkpointIdValue: string, runId: string, progress: CheckpointProgress, expectedCursor?: string | null): Promise<CheckpointRow> {
      if (expectedCursor !== undefined) {
        const cur = await getById(checkpointIdValue);
        if (!cur) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'checkpoint not found');
        if ((cur.cursor_text ?? null) !== expectedCursor) throw new StatisticsError('STATISTICS_CHECKPOINT_CONFLICT', 'checkpoint cursor moved since it was read', { detail: { expected: expectedCursor, actual: cur.cursor_text } });
      }
      await s.batch([advanceStatement(s, checkpointIdValue, runId, progress)], 'advance checkpoint');
      return (await getById(checkpointIdValue))!;
    },

    /** Checkpoints last written by a run (idx_stat_ckpt_last_run). */
    listForRun: (runId: string, limit: number) => s.all<CheckpointRow>('SELECT * FROM statistics_checkpoints WHERE last_run_id = ?1 ORDER BY checkpoint_id LIMIT ?2', runId, s.requireLimit(limit)),
  };
}
