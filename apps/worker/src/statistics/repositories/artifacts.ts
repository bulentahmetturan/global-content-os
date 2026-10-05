import { StatisticsError } from '../errors';
import { artifactIdFromContent, artifactIdFromRequest } from '../identity';
import { assertNoSecretFields, assertSafeUrl, assertTs } from '../rules';
import type { StatisticsStorage } from '../storage';

export type BackendType = 'NONE' | 'R2' | 'EXTERNAL_REPRODUCIBLE' | 'OTHER';
export type ParseStatus = 'PENDING' | 'PARSED' | 'FAILED' | 'QUARANTINED';
export type RetentionClass = 'R0_TRANSIENT' | 'R1_EVIDENCE' | 'R2_FAILED_QUARANTINE' | 'R3_CANARY';

/** Metadata only. There is deliberately no field that can carry a payload: binaries never enter D1. */
export interface ArtifactInput {
  releaseId: string;
  /** Content-addressed file artifact: sha256 of the bytes (artifact_id = art_<sha>). */
  contentSha256: string;
  /** Alternatively, an API capture: request descriptor (no secrets) + response digest (artifact_id = req_<sha>). */
  apiCapture?: { requestDescriptor: string; responseDigest: string };
  sourceUrl?: string | null;
  backendType?: BackendType;
  /** Future R2 key; required when backendType is R2/OTHER. */
  backendLocator?: string | null;
  reproducibilityLocator?: string | null;
  filename?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  sourceChecksum?: string | null;
  retrievedAt: string;
  parserVersion?: string | null;
  parseStatus?: ParseStatus;
  retentionClass: RetentionClass;
  expiresAt?: string | null;
  extractionSummary?: string | null;
}

export interface ArtifactRow {
  artifact_id: string;
  release_id: string;
  source_url: string | null;
  backend_type: BackendType;
  backend_locator: string | null;
  reproducibility_locator: string | null;
  filename: string | null;
  content_type: string | null;
  byte_size: number | null;
  source_checksum: string | null;
  local_sha256: string;
  retrieved_at: string;
  parser_version: string | null;
  parse_status: ParseStatus;
  retention_class: RetentionClass;
  expires_at: string | null;
  extraction_summary: string | null;
}

const PARSE_TRANSITIONS: Record<ParseStatus, ParseStatus[]> = {
  PENDING: ['PARSED', 'FAILED', 'QUARANTINED'],
  PARSED: ['QUARANTINED'],
  FAILED: ['PENDING', 'PARSED', 'QUARANTINED'],
  QUARANTINED: ['PENDING'],
};

export function artifactRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<ArtifactRow>('SELECT * FROM statistics_raw_artifacts WHERE artifact_id = ?1', id);

  return {
    get,

    /** Idempotent by checksum: the same bytes for the same release never create a second row. */
    async register(input: ArtifactInput): Promise<{ artifact: ArtifactRow; created: boolean }> {
      assertNoSecretFields('artifact', input);
      assertSafeUrl('artifact.sourceUrl', input.sourceUrl);
      assertTs('retrievedAt', input.retrievedAt);
      if (input.apiCapture) assertNoSecretFields('artifact.apiCapture', { requestDescriptor: input.apiCapture.requestDescriptor.replace(/^[A-Z]+ /, '') });
      if (!/^[0-9a-f]{64}$/.test(input.contentSha256)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'contentSha256 must be lowercase sha256 hex');
      const id = input.apiCapture ? await artifactIdFromRequest(input.apiCapture.requestDescriptor, input.apiCapture.responseDigest) : artifactIdFromContent(input.contentSha256);
      if (input.byteSize !== null && input.byteSize !== undefined && (!Number.isInteger(input.byteSize) || input.byteSize < 0)) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'byteSize must be a non-negative integer');
      const backend = input.backendType ?? 'NONE';
      const inserted = await s.all<{ artifact_id: string }>(
        `INSERT INTO statistics_raw_artifacts (artifact_id, release_id, source_url, backend_type, backend_locator, reproducibility_locator, filename, content_type, byte_size, source_checksum, local_sha256, retrieved_at, parser_version, parse_status, retention_class, expires_at, extraction_summary)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17) ON CONFLICT(artifact_id) DO NOTHING RETURNING artifact_id`,
        id, input.releaseId, input.sourceUrl ?? null, backend, input.backendLocator ?? null, input.reproducibilityLocator ?? null, input.filename ?? null, input.contentType ?? null, input.byteSize ?? null, input.sourceChecksum ?? null,
        input.contentSha256, input.retrievedAt, input.parserVersion ?? null, input.parseStatus ?? 'PENDING', input.retentionClass, input.expiresAt ?? null, input.extractionSummary ?? null,
      );
      const row = (await get(id))!;
      if (inserted.length === 0 && row.release_id !== input.releaseId) {
        throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'identical artifact content is already attached to a different release', { detail: { artifactId: id, existingRelease: row.release_id } });
      }
      return { artifact: row, created: inserted.length === 1 };
    },

    /** Parser metadata: the only mutable facts of an artifact besides its backend locator. Identity columns are trigger-protected. */
    async updateParseMetadata(artifactId: string, patch: { parserVersion?: string | null; parseStatus?: ParseStatus; extractionSummary?: string | null; expiresAt?: string | null }): Promise<ArtifactRow> {
      const cur = await get(artifactId);
      if (!cur) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'artifact not found', { detail: { artifactId } });
      if (patch.parseStatus && patch.parseStatus !== cur.parse_status && !PARSE_TRANSITIONS[cur.parse_status].includes(patch.parseStatus)) {
        throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', `parse_status transition ${cur.parse_status} → ${patch.parseStatus} is not allowed`);
      }
      await s.run(
        `UPDATE statistics_raw_artifacts SET parser_version = COALESCE(?2, parser_version), parse_status = COALESCE(?3, parse_status), extraction_summary = COALESCE(?4, extraction_summary), expires_at = COALESCE(?5, expires_at) WHERE artifact_id = ?1`,
        artifactId, patch.parserVersion ?? null, patch.parseStatus ?? null, patch.extractionSummary ?? null, patch.expiresAt ?? null,
      );
      return (await get(artifactId))!;
    },

    /** Records a future R2 location once an ArtifactStore has persisted the bytes (backend metadata, not payload). */
    async attachBackend(artifactId: string, backendType: Exclude<BackendType, 'NONE'>, backendLocator: string): Promise<ArtifactRow> {
      await s.run('UPDATE statistics_raw_artifacts SET backend_type = ?2, backend_locator = ?3 WHERE artifact_id = ?1', artifactId, backendType, backendLocator);
      return (await get(artifactId))!;
    },

    listByRelease: (releaseId: string, limit: number) => s.all<ArtifactRow>('SELECT * FROM statistics_raw_artifacts WHERE release_id = ?1 ORDER BY artifact_id LIMIT ?2', releaseId, s.requireLimit(limit)),
  };
}
