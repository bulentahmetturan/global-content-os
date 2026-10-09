import { StatisticsError } from '../errors';
import { datasetId } from '../identity';
import { assertNoSecretFields } from '../rules';
import type { StatisticsStorage } from '../storage';

export type DatasetType = 'SDMX_DATAFLOW' | 'ODATA_INDICATOR' | 'REST_INDICATOR_SET' | 'FILE_WORKBOOK' | 'PDF_REPORT_SERIES' | 'EXPORT_FILE' | 'OTHER';
export type ReaderClass = 'SDMX_READER' | 'ODATA_READER' | 'REST_READER' | 'BULK_FILE_READER' | 'RELEASE_FILE_READER' | 'PDF_RELEASE_READER' | 'AUTHENTICATED_EXPORT_READER' | 'SECONDARY_QA_READER';
export type AccessClass = 'DOCUMENTED_API' | 'DOCUMENTED_API_AUTH' | 'PUBLIC_SDMX_ENDPOINT' | 'PUBLIC_DOCUMENTED_DOWNLOAD' | 'BULK_FILE' | 'PDF_RELEASE' | 'AUTH_EXPORT' | 'MANUAL_ONLY' | 'REFERENCE_ONLY';
export type ReleaseModel = 'EDITION' | 'PUBLICATION' | 'FILE_VERSION' | 'API_SNAPSHOT';

export interface DatasetInput {
  sourceId: string;
  sourceNativeDatasetId: string;
  displayName: string;
  datasetType: DatasetType;
  readerClass: ReaderClass;
  accessClass: AccessClass;
  releaseModel: ReleaseModel;
  referencePeriodModel: 'YEAR' | 'QUARTER' | 'MONTH' | 'WEEK' | 'DAY' | 'DATE_RANGE' | 'OTHER_SOURCE_PERIOD' | 'MIXED';
  boundedQueryCapability: 'YES' | 'PARTIAL' | 'NO';
  architectureReadiness: 'ARCHITECTURE_READY' | 'DESIGN_ONLY' | 'UNVERIFIED';
}

export interface DatasetRow {
  dataset_id: string;
  source_id: string;
  source_native_dataset_id: string;
  display_name: string;
  dataset_type: DatasetType;
  reader_class: ReaderClass;
  access_class: AccessClass;
  release_model: ReleaseModel;
  reference_period_model: string;
  bounded_query_capability: string;
  architecture_readiness: string;
  created_at: string;
}

export interface ReaderAccessMetadata {
  datasetId: string;
  readerClass: ReaderClass;
  accessClass: AccessClass;
  releaseModel: ReleaseModel;
  referencePeriodModel: string;
  boundedQueryCapability: string;
  datasetType: DatasetType;
}

export function datasetRepository(s: StatisticsStorage) {
  const get = (id: string) => s.first<DatasetRow>('SELECT * FROM statistics_datasets WHERE dataset_id = ?1', id);
  return {
    get,

    getBySourceNative: (sourceId: string, nativeId: string) =>
      s.first<DatasetRow>('SELECT * FROM statistics_datasets WHERE source_id = ?1 AND source_native_dataset_id = ?2', sourceId, nativeId),

    /** Idempotent: same (source, native id) is the same dataset whatever its display name. Changing reader/access/type is a conflict. */
    async register(input: DatasetInput): Promise<{ dataset: DatasetRow; created: boolean }> {
      assertNoSecretFields('dataset', input);
      const id = datasetId(input.sourceId, input.sourceNativeDatasetId);
      const inserted = await s.all<{ dataset_id: string }>(
        `INSERT INTO statistics_datasets (dataset_id, source_id, source_native_dataset_id, display_name, dataset_type, reader_class, access_class, release_model, reference_period_model, bounded_query_capability, architecture_readiness, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(dataset_id) DO NOTHING RETURNING dataset_id`,
        id, input.sourceId, input.sourceNativeDatasetId, input.displayName, input.datasetType, input.readerClass, input.accessClass, input.releaseModel, input.referencePeriodModel, input.boundedQueryCapability, input.architectureReadiness, s.now(),
      );
      const row = (await get(id))!;
      if (inserted.length === 0) {
        const diffs: string[] = [];
        if (row.dataset_type !== input.datasetType) diffs.push('datasetType');
        if (row.reader_class !== input.readerClass) diffs.push('readerClass');
        if (row.access_class !== input.accessClass) diffs.push('accessClass');
        if (row.release_model !== input.releaseModel) diffs.push('releaseModel');
        if (diffs.length) throw new StatisticsError('STATISTICS_IDEMPOTENCY_CONFLICT', 'dataset already registered with different reader/access semantics', { detail: { datasetId: id, fields: diffs } });
      }
      return { dataset: row, created: inserted.length === 1 };
    },

    /** Bounded keyset listing by source. */
    async listBySource(sourceId: string, opts: { limit: number; afterDatasetId?: string }): Promise<DatasetRow[]> {
      const limit = s.requireLimit(opts.limit);
      return s.all<DatasetRow>('SELECT * FROM statistics_datasets WHERE source_id = ?1 AND dataset_id > COALESCE(?2, \'\') ORDER BY dataset_id LIMIT ?3', sourceId, opts.afterDatasetId ?? null, limit);
    },

    async getReaderAccessMetadata(id: string): Promise<ReaderAccessMetadata | null> {
      const r = await get(id);
      if (!r) return null;
      return { datasetId: r.dataset_id, readerClass: r.reader_class, accessClass: r.access_class, releaseModel: r.release_model, referencePeriodModel: r.reference_period_model, boundedQueryCapability: r.bounded_query_capability, datasetType: r.dataset_type };
    },
  };
}
