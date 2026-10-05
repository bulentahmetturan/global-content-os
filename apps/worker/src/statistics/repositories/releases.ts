import { StatisticsError } from '../errors';
import { computeReleaseRank, releaseId as makeReleaseId } from '../identity';
import { assertNoSecretFields, assertSafeUrl, assertTs } from '../rules';
import type { StatisticsStorage } from '../storage';

export type ReleaseKind = 'EDITION' | 'PUBLICATION' | 'FILE_VERSION' | 'API_SNAPSHOT';
export type ReleaseStatus = 'CURRENT' | 'SUPERSEDED' | 'CORRECTED' | 'WITHDRAWN' | 'UNKNOWN';

export interface ReleaseInput {
  datasetId: string;
  releaseKind: ReleaseKind;
  /** Edition label | source version stamp | content digest. Part of the release identity. */
  releaseKey: string;
  sourceNativeReleaseId?: string | null;
  editionLabel?: string | null;
  /** Source publication time/date. NEVER an observation period. Retrieval time is not release semantics. */
  publishedAt?: string | null;
  retrievedFirstAt: string;
  referenceCoverageStart?: string | null;
  referenceCoverageEnd?: string | null;
  releaseClass?: 'PRODUCTION' | 'CANARY';
  supersedesReleaseId?: string | null;
  /** Writer-contract override for edition ordering; default is derived from publishedAt (else retrievedFirstAt). */
  releaseRank?: number;
  sourceUrl?: string | null;
  /** sha256 of the release's identifying content descriptor. A different fingerprint under the same key is a conflict. */
  releaseFingerprint: string;
  termsStatusAtRetrieval?: 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  termsSnapshotRef?: string | null;
}

export interface ReleaseRow {
  release_id: string;
  dataset_id: string;
  release_kind: ReleaseKind;
  release_key: string;
  source_native_release_id: string | null;
  edition_label: string | null;
  published_at: string | null;
  retrieved_first_at: string;
  reference_coverage_start: string | null;
  reference_coverage_end: string | null;
  release_class: 'PRODUCTION' | 'CANARY';
  status: ReleaseStatus;
  supersedes_release_id: string | null;
  release_rank: number;
  source_url: string | null;
  release_fingerprint: string;
  terms_status_at_retrieval: string;
  terms_snapshot_ref: string | null;
}

export interface ReleaseOrdering {
  releaseId: string;
  releaseRank: number;
  status: ReleaseStatus;
  releaseClass: string;
}

export function releaseRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<ReleaseRow>('SELECT * FROM statistics_releases WHERE release_id = ?1', id);

  return {
    get,

    getByKey: async (datasetId: string, kind: ReleaseKind, key: string) => s.first<ReleaseRow>('SELECT * FROM statistics_releases WHERE dataset_id = ?1 AND release_kind = ?2 AND release_key = ?3', datasetId, kind, key),

    /**
     * Source-native release identity lookup. Scans only the newest `scanLimit` releases of one dataset (bounded), never the whole table.
     */
    async findBySourceNativeId(datasetId: string, nativeReleaseId: string, scanLimit: number): Promise<ReleaseRow | null> {
      const n = s.requireLimit(scanLimit, 'scanLimit');
      return s.first<ReleaseRow>(
        `SELECT * FROM (SELECT * FROM statistics_releases WHERE dataset_id = ?1 ORDER BY release_rank DESC LIMIT ?2) WHERE source_native_release_id = ?3 LIMIT 1`,
        datasetId, n, nativeReleaseId,
      );
    },

    /** Idempotent registration. Same identity + same fingerprint → existing row; same identity + different fingerprint → conflict. */
    async register(input: ReleaseInput): Promise<{ release: ReleaseRow; created: boolean }> {
      assertNoSecretFields('release', input);
      assertSafeUrl('release.sourceUrl', input.sourceUrl);
      assertTs('retrievedFirstAt', input.retrievedFirstAt);
      if (!/^[0-9a-f]{64}$/.test(input.releaseFingerprint)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'releaseFingerprint must be lowercase sha256 hex');
      const id = await makeReleaseId(input.datasetId, input.releaseKind, input.releaseKey);
      const rank = input.releaseRank ?? computeReleaseRank(input.publishedAt, input.retrievedFirstAt);
      if (!Number.isSafeInteger(rank) || rank < 0) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'release_rank must be a non-negative integer');

      const existing = await get(id);
      if (existing) {
        if (existing.release_fingerprint !== input.releaseFingerprint || existing.dataset_id !== input.datasetId || existing.release_kind !== input.releaseKind) {
          throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'release key already registered with a different content fingerprint', { detail: { releaseId: id } });
        }
        return { release: existing, created: false };
      }

      const stmts = [
        s.stmt(
          `INSERT INTO statistics_releases (release_id, dataset_id, release_kind, release_key, source_native_release_id, edition_label, published_at, retrieved_first_at, reference_coverage_start, reference_coverage_end, release_class, status, supersedes_release_id, release_rank, source_url, release_fingerprint, terms_status_at_retrieval, terms_snapshot_ref)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'CURRENT',?12,?13,?14,?15,?16,?17) ON CONFLICT(release_id) DO NOTHING`,
          id, input.datasetId, input.releaseKind, input.releaseKey, input.sourceNativeReleaseId ?? null, input.editionLabel ?? null, input.publishedAt ?? null, input.retrievedFirstAt, input.referenceCoverageStart ?? null, input.referenceCoverageEnd ?? null,
          input.releaseClass ?? 'PRODUCTION', input.supersedesReleaseId ?? null, rank, input.sourceUrl ?? null, input.releaseFingerprint, input.termsStatusAtRetrieval ?? 'UNKNOWN', input.termsSnapshotRef ?? null,
        ),
      ];
      if (input.supersedesReleaseId) {
        // Supersession validity is checked in-statement: same dataset, not newer than the superseding release. The status move is a controlled-mutable field.
        const old = await get(input.supersedesReleaseId);
        if (!old) throw new StatisticsError('STATISTICS_REVISION_CONFLICT', 'superseded release does not exist', { detail: { supersedes: input.supersedesReleaseId } });
        if (old.dataset_id !== input.datasetId) throw new StatisticsError('STATISTICS_REVISION_CONFLICT', 'a release can only supersede a release of the same dataset');
        if (old.release_rank > rank) throw new StatisticsError('STATISTICS_REVISION_CONFLICT', 'a release cannot supersede a release that is newer than itself', { detail: { supersedesRank: old.release_rank, rank } });
        if (old.status === 'CURRENT') stmts.push(s.stmt(`UPDATE statistics_releases SET status = 'SUPERSEDED' WHERE release_id = ?1 AND status = 'CURRENT'`, old.release_id));
      }
      await s.batch(stmts, 'register release');
      const row = (await get(id))!;
      if (row.release_fingerprint !== input.releaseFingerprint) throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'concurrent registration with a different fingerprint', { detail: { releaseId: id } });
      return { release: row, created: true };
    },

    /** Controlled status move (reinstating a WITHDRAWN release is allowed, schema proof R-10). WITHDRAWN/CORRECTED change which version wins: call reprojectRelease afterwards (bounded chunks). */
    async setStatus(releaseIdValue: string, status: ReleaseStatus): Promise<ReleaseRow> {
      const cur = await get(releaseIdValue);
      if (!cur) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'release not found', { detail: { releaseId: releaseIdValue } });
      await s.run('UPDATE statistics_releases SET status = ?2 WHERE release_id = ?1', releaseIdValue, status);
      return (await get(releaseIdValue))!;
    },

    /** Newest releases of a dataset (idx_stat_releases_ds_rank). */
    latestByDataset: (datasetId: string, limit: number) =>
      s.all<ReleaseRow>('SELECT * FROM statistics_releases WHERE dataset_id = ?1 ORDER BY release_rank DESC, release_id DESC LIMIT ?2', datasetId, s.requireLimit(limit)),

    /** Ordering data the projection uses for a release. */
    async ordering(releaseIdValue: string): Promise<ReleaseOrdering | null> {
      const r = await get(releaseIdValue);
      return r ? { releaseId: r.release_id, releaseRank: r.release_rank, status: r.status, releaseClass: r.release_class } : null;
    },
  };
}
