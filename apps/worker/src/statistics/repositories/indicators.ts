import { StatisticsError } from '../errors';
import { indicatorId } from '../identity';
import type { StatisticsStorage } from '../storage';

export type MeasureType = 'COUNT' | 'RATE' | 'PERCENT' | 'PROPORTION' | 'RATIO' | 'YEARS' | 'CURRENCY' | 'INDEX' | 'OTHER' | 'UNKNOWN';
export type MappingState = 'EXACT' | 'COMPATIBLE' | 'NON_EQUIVALENT' | 'REVIEW_REQUIRED';
export type ConceptStatus = 'PROPOSED' | 'APPROVED' | 'DEPRECATED';

export interface IndicatorInput {
  datasetId: string;
  sourceNativeIndicatorId: string;
  /** Verbatim source label. A label change never creates a second indicator (identity is dataset + native id). */
  label: string;
  definition?: string | null;
  definitionDigest?: string | null;
  methodologyLocator?: string | null;
  measureType?: MeasureType;
  rateBasis?: string | null;
  nativeUnit?: string | null;
}

export interface IndicatorRow {
  indicator_id: string;
  dataset_id: string;
  source_native_indicator_id: string;
  label: string;
  definition: string | null;
  measure_type: MeasureType;
  rate_basis: string | null;
  native_unit: string | null;
  status: string;
}

export interface ConceptRow {
  concept_code: string;
  label: string;
  domain: string;
  status: ConceptStatus;
  approved_by: string | null;
  approved_at: string | null;
}

export interface MappingRow {
  indicator_id: string;
  concept_code: string;
  mapping_version: number;
  state: MappingState;
  origin: 'MANUAL_REVIEW' | 'PROPOSAL';
  reviewed_by: string | null;
  reviewed_at: string | null;
  evidence_ref: string | null;
}

/** Reviewer names that denote automation can never satisfy a human-review requirement. */
const AUTOMATED_REVIEWER = /^(system|auto|automated|bot|script|worker|pipeline|cron|model|llm|ai)([_\-:\s.]|$)/i;

export function indicatorRepository(s: StatisticsStorage) {
  const getIndicator = (id: string) => s.first<IndicatorRow>('SELECT * FROM statistics_indicators WHERE indicator_id = ?1', id);
  const getConcept = (code: string) => s.first<ConceptRow>('SELECT * FROM statistics_concepts WHERE concept_code = ?1', code);

  return {
    getIndicator,
    getConcept,

    async registerIndicator(input: IndicatorInput): Promise<{ indicator: IndicatorRow; created: boolean }> {
      const id = indicatorId(input.datasetId, input.sourceNativeIndicatorId);
      const inserted = await s.all<{ indicator_id: string }>(
        `INSERT INTO statistics_indicators (indicator_id, dataset_id, source_native_indicator_id, label, definition, definition_digest, methodology_locator, measure_type, rate_basis, native_unit)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(indicator_id) DO NOTHING RETURNING indicator_id`,
        id, input.datasetId, input.sourceNativeIndicatorId, input.label, input.definition ?? null, input.definitionDigest ?? null, input.methodologyLocator ?? null, input.measureType ?? 'UNKNOWN', input.rateBasis ?? null, input.nativeUnit ?? null,
      );
      return { indicator: (await getIndicator(id))!, created: inserted.length === 1 };
    },

    /** A concept starts PROPOSED. Only EXACT/COMPATIBLE mappings need APPROVED (enforced by trigger). */
    async proposeConcept(input: { conceptCode: string; label: string; domain: string; definitionRef?: string | null }): Promise<{ concept: ConceptRow; created: boolean }> {
      const inserted = await s.all<{ concept_code: string }>(
        `INSERT INTO statistics_concepts (concept_code, label, domain, definition_ref, status) VALUES (?1,?2,?3,?4,'PROPOSED') ON CONFLICT(concept_code) DO NOTHING RETURNING concept_code`,
        input.conceptCode, input.label, input.domain, input.definitionRef ?? null,
      );
      return { concept: (await getConcept(input.conceptCode))!, created: inserted.length === 1 };
    },

    /** Human approval of a concept. */
    async approveConcept(conceptCode: string, approvedBy: string): Promise<ConceptRow> {
      assertHuman(approvedBy);
      await s.run(`UPDATE statistics_concepts SET status = 'APPROVED', approved_by = ?2, approved_at = ?3 WHERE concept_code = ?1 AND status = 'PROPOSED'`, conceptCode, approvedBy, s.now());
      const c = await getConcept(conceptCode);
      if (!c) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'concept not found', { detail: { conceptCode } });
      return c;
    },

    /**
     * Automated proposal: always REVIEW_REQUIRED and noncanonical. There is no label-matching helper in this module by design.
     * Append-only: each call adds a version; the previous rows stay.
     */
    async propose(indicatorIdValue: string, conceptCode: string, evidenceRef?: string): Promise<MappingRow> {
      return insertMapping(indicatorIdValue, conceptCode, 'REVIEW_REQUIRED', 'PROPOSAL', null, evidenceRef ?? null);
    },

    /** A named human decision. EXACT/COMPATIBLE additionally require an APPROVED concept (DB trigger). */
    async recordReview(indicatorIdValue: string, conceptCode: string, state: Exclude<MappingState, 'REVIEW_REQUIRED'>, reviewedBy: string, evidenceRef: string): Promise<MappingRow> {
      assertHuman(reviewedBy);
      return insertMapping(indicatorIdValue, conceptCode, state, 'MANUAL_REVIEW', reviewedBy, evidenceRef);
    },

    /** Mapping state from the frozen view (UNMAPPED = no row). */
    async getMappingState(indicatorIdValue: string): Promise<{ mappingState: MappingState | 'UNMAPPED'; conceptCode: string | null }> {
      const r = await s.first<{ mapping_state: MappingState | 'UNMAPPED'; concept_code: string | null }>('SELECT mapping_state, concept_code FROM statistics_indicator_mapping_state_v WHERE indicator_id = ?1', indicatorIdValue);
      return { mappingState: r?.mapping_state ?? 'UNMAPPED', conceptCode: r?.concept_code ?? null };
    },

    listMappings: (indicatorIdValue: string, limit: number) => s.all<MappingRow>('SELECT * FROM statistics_indicator_mappings WHERE indicator_id = ?1 ORDER BY mapping_version DESC, concept_code LIMIT ?2', indicatorIdValue, s.requireLimit(limit)),

    listIndicatorsByDataset: (datasetId: string, opts: { limit: number; afterIndicatorId?: string }) =>
      s.all<IndicatorRow>('SELECT * FROM statistics_indicators WHERE dataset_id = ?1 AND indicator_id > COALESCE(?2, \'\') ORDER BY indicator_id LIMIT ?3', datasetId, opts.afterIndicatorId ?? null, s.requireLimit(opts.limit)),
  };

  async function insertMapping(ind: string, concept: string, state: MappingState, origin: 'MANUAL_REVIEW' | 'PROPOSAL', reviewedBy: string | null, evidence: string | null): Promise<MappingRow> {
    const rows = await s.all<MappingRow>(
      `INSERT INTO statistics_indicator_mappings (indicator_id, concept_code, mapping_version, state, origin, reviewed_by, reviewed_at, evidence_ref)
       VALUES (?1, ?2, (SELECT COALESCE(MAX(mapping_version), 0) + 1 FROM statistics_indicator_mappings WHERE indicator_id = ?1), ?3, ?4, ?5, ?6, ?7) RETURNING *`,
      ind, concept, state, origin, reviewedBy, reviewedBy ? s.now() : null, evidence,
    );
    return rows[0];
  }

  function assertHuman(name: string): void {
    if (!name || name.length > 120 || AUTOMATED_REVIEWER.test(name.trim())) {
      throw new StatisticsError('STATISTICS_ACTIVATION_GATED', 'a named human is required; automated actors cannot review or approve', { detail: { actor: name } });
    }
  }
}
