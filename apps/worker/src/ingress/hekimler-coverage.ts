/**
 * Honest coverage labels for the Hekimler source-health view. A source that is merely reachable must never look
 * like full coverage: limited / partial / runner-required sources are labelled explicitly.
 */
export type CoverageLabel =
  | 'PIPELINE_OK'
  | 'PIPELINE_OK_EMPTY'
  | 'PIPELINE_OK_LIMITED'
  | 'PARTIALLY_COVERED'
  | 'RUNNER_REQUIRED'
  | 'FAILED_INTERNAL'
  | 'NOT_RUN';

/** Material, documented limitations (see content/HEKIMLER-COVERAGE-MATRIX.md in the design repo). */
export const COVERAGE_OVERRIDES: Record<string, { label: CoverageLabel; note: string }> = {
  abroad_uk_gmc: { label: 'PARTIALLY_COVERED', note: 'Yalnız gov.uk UKVI/DHSC beslemeleri; GMC kayıt/PLAB/haber kapsam dışı (bot engeli).' },
  abroad_us_ecfmg_intealth: { label: 'PARTIALLY_COVERED', note: 'ECFMG/Intealth erişilemez; yalnız USMLE/NRMP/AAMC komşu kapsam.' },
  abroad_de_make_it_in_germany: { label: 'PARTIALLY_COVERED', note: 'Yalnız tanınma (Anerkennung); vize/taşınma kapsam dışı.' },
  hsgm_public_health: { label: 'RUNNER_REQUIRED', note: 'GitHub çıkışından erişilemez; Türkiye çıkışlı runner gerekir.' },
  abroad_es_universidades_homologacion: { label: 'PIPELINE_OK_LIMITED', note: 'Tarih yalnız ay hassasiyetinde.' },
  pubmed_biomedical_evidence: { label: 'PIPELINE_OK_LIMITED', note: '90 gün, sınırlı yüksek değerli sorgular.' },
};

export function coverageLabel(
  sourceId: string,
  row: { coverage_status?: string | null; source_health?: string | null; last_success_at?: string | null } | null
): { label: CoverageLabel; note: string } {
  const o = COVERAGE_OVERRIDES[sourceId];
  if (o) return o;
  if (!row || !row.last_success_at) {
    return { label: row ? 'FAILED_INTERNAL' : 'NOT_RUN', note: row ? 'Başarılı koşu yok.' : 'Henüz koşu yok.' };
  }
  if (row.source_health === 'DEGRADED' || row.coverage_status === 'RUN_FAILED') {
    return { label: 'FAILED_INTERNAL', note: 'Son koşu başarısız.' };
  }
  if (row.coverage_status === 'NO_ELIGIBLE_ITEMS') {
    return { label: 'PIPELINE_OK_EMPTY', note: 'Çalışıyor; güncel uygun içerik yok.' };
  }
  return { label: 'PIPELINE_OK', note: '' };
}
