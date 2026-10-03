// Test-only helpers for the local dossier runtime: a disposable node:sqlite database with the whole migration chain,
// behind the D1 surface, plus a deterministic clock / id source. Never imported by runtime code.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { d1FromSqlite } from '../sqlite-d1.test-helper.mjs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export function openDossierDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
  return { sqlite, db: d1FromSqlite(sqlite) };
}

/** Deterministic ids and a controllable clock (ISO strings, advances one second per call). */
export function makeCtx(start = '2026-10-03T00:00:00.000Z') {
  let n = 0;
  let t = Date.parse(start);
  return {
    now: () => new Date((t += 1000)).toISOString(),
    id: (prefix) => `${prefix}_${String(++n).padStart(4, '0')}`,
    setNow: (iso) => { t = Date.parse(iso); },
  };
}

export const FAST_NOW = '2026-10-03T12:00:00.000Z';

import vocab from '../../../../packages/contracts/dossier-discovery.json' with { type: 'json' };

/**
 * TEST_ONLY / POC_ONLY promotion policy: approves EVERY signal family to promote alone, so older tests can exercise classification and
 * snapshots on promoted candidates. It is a fixture, never a default (DEFAULT_POLICY.candidatePromotion is unset; a test enforces that).
 */
export const TEST_ONLY_PROMOTE_EVERYTHING = { status: 'SET', value: { paths: ['MULTI_SIGNAL_FAMILY_CONVERGENCE', 'SOURCE_SPECIFIC_FRONTIER'], sourceSpecificFrontier: { families: [...vocab.signal.families] } } };

/** Policy for TESTS ONLY. These numbers are arbitrary fixtures to exercise code paths; they are never product defaults. */
export function testPolicy(over = {}) {
  const set = (value) => ({ status: 'SET', value });
  return {
    retention: { status: 'POLICY_NOT_SET' },
    backfill: { status: 'POLICY_NOT_SET' },
    perRunFetchCap: set(50),
    perRunItemCap: set(50),
    provenanceRepresentativeCap: set(3),
    candidatePromotion: TEST_ONLY_PROMOTE_EVERYTHING,
    candidateClassCriteria: set({
      STRONG: { minIndependentOrigins: 3, minIndependentSignalFamilies: 2, minUniqueActors: 2 },
      EMERGING: { minIndependentOrigins: 2, minIndependentSignalFamilies: 1 },
      FRONTIER: { frontierFamilies: ['GLOBAL_MEDICAL_FRONTIER', 'GLOBAL_RESEARCH_ACTIVITY', 'GLOBAL_INSTITUTIONAL_FRONTIER'], minIndependentOrigins: 1 },
      CORRECTIVE: { minCommercialShare: 0.5, minIndependentOrigins: 1 },
    }),
    wowThresholds: set({ qualifyingPatterns: ['HIDDEN_EXPOSURE', 'SPATIAL_INEQUALITY', 'CROSS_COUNTRY_GAP', 'GEOGRAPHIC_PARADOX', 'SURPRISING_BASELINE', 'GLOBAL_SHIFT'], minMeasuredDimensions: 2, requireCredibleAnchor: true }),
    commercialConcentration: set({ minShare: 0.5 }),
    tripleNetworkQualification: { status: 'OWNER_DECISION_REQUIRED' },
    candidateReconsideration: { status: 'OWNER_DECISION_REQUIRED' },
    snoozeBehavior: { status: 'OWNER_DECISION_REQUIRED' },
    publicHealthCredibleAnchor: set({ qualifyingFamilies: ['TURKEY_PUBLIC_HEALTH_DATA', 'GLOBAL_PUBLIC_HEALTH_DATA', 'ENVIRONMENTAL_MEASUREMENT', 'GLOBAL_ENVIRONMENTAL_OBSERVATION', 'TURKEY_HEALTH_BURDEN'], qualifyingProvenance: ['MEASURED', 'ADMINISTRATIVE', 'SURVEY'] }),
    repetitionCriteria: set({ minOccurrences: 3 }),
    actorMentionProposal: set({ minDistinctMentioners: 2 }),
    extractionMethod: { status: 'OWNER_DECISION_REQUIRED' },
    ...over,
  };
}
