import { StatisticsError } from '../errors';
import { assertSourceId } from '../identity';
import { assertNoSecretFields, assertSafeUrl } from '../rules';
import type { StatisticsStorage } from '../storage';

export type SourceArea = 'TURKEY_HEALTH_STATISTICS' | 'GLOBAL_HEALTH_STATISTICS';
export type SourceDisposition = 'PRIMARY_CANONICAL' | 'CANONICAL_GATED' | 'SECONDARY_NORMALIZED' | 'DISCOVERY_CROSSCHECK' | 'REFERENCE_METHODOLOGY' | 'REJECTED';
export type UpstreamRole = 'PRIMARY_PRODUCER' | 'INTERNATIONAL_RELAY' | 'SECONDARY_NORMALIZED' | 'DISCOVERY' | 'REFERENCE';

export interface SourceInput {
  sourceId: string;
  displayName: string;
  organization: string;
  /** Property of the source FAMILY. Series carry subject geography only (INV-008). */
  sourceArea: SourceArea;
  disposition: SourceDisposition;
  authorityLevel: string;
  upstreamRole: UpstreamRole;
  officialHomepage?: string | null;
  architectureStatus: 'ARCHITECTURE_READY' | 'DESIGN_ONLY' | 'NOT_APPLICABLE';
  registryVersion: string;
}

export interface SourceRow {
  source_id: string;
  display_name: string;
  organization: string;
  source_area: SourceArea;
  disposition: SourceDisposition;
  authority_level: string;
  upstream_role: UpstreamRole;
  official_homepage: string | null;
  architecture_status: string;
  registry_version: string;
  created_at: string;
}

const IDENTITY_FIELDS: Array<[keyof SourceInput, keyof SourceRow]> = [
  ['sourceArea', 'source_area'],
  ['disposition', 'disposition'],
  ['upstreamRole', 'upstream_role'],
  ['organization', 'organization'],
];

export function sourceRepository(s: StatisticsStorage) {
  const get = (sourceId: string) => s.first<SourceRow>('SELECT * FROM statistics_sources WHERE source_id = ?1', sourceId);
  return {
    get,

    /**
     * Idempotent identity registration. NEVER creates or changes runtime policy: a registered source is DISABLED by default (P5).
     * Re-registering with a different source area / disposition / role / organization is a semantic identity conflict.
     */
    async register(input: SourceInput): Promise<{ source: SourceRow; created: boolean }> {
      assertSourceId(input.sourceId);
      assertNoSecretFields('source', input);
      assertSafeUrl('officialHomepage', input.officialHomepage);
      const inserted = await s.all<{ source_id: string }>(
        `INSERT INTO statistics_sources (source_id, display_name, organization, source_area, disposition, authority_level, upstream_role, official_homepage, architecture_status, registry_version, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(source_id) DO NOTHING RETURNING source_id`,
        input.sourceId, input.displayName, input.organization, input.sourceArea, input.disposition, input.authorityLevel, input.upstreamRole, input.officialHomepage ?? null, input.architectureStatus, input.registryVersion, s.now(),
      );
      const row = (await get(input.sourceId))!;
      if (inserted.length === 0) {
        const diffs = IDENTITY_FIELDS.filter(([a, b]) => input[a] !== row[b]).map(([a]) => a);
        if (diffs.length) throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'source already registered with different identity-defining attributes', { detail: { sourceId: input.sourceId, fields: diffs } });
      }
      return { source: row, created: inserted.length === 1 };
    },

    /** Bounded keyset listing ordered by source_id. */
    async list(opts: { limit: number; area?: SourceArea; afterSourceId?: string }): Promise<SourceRow[]> {
      const limit = s.requireLimit(opts.limit);
      return s.all<SourceRow>(
        `SELECT * FROM statistics_sources WHERE (?1 IS NULL OR source_area = ?1) AND source_id > COALESCE(?2, '') ORDER BY source_id LIMIT ?3`,
        opts.area ?? null, opts.afterSourceId ?? null, limit,
      );
    },
  };
}
