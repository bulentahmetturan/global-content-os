/**
 * Protocol Ingestion Engine — public facade (target-agnostic pipeline).
 *
 * runDryRun() is the maximum-safe entrypoint: identity resolve (read-only) →
 * source plan → fetch gate → parse → map → firewall → dry-run persist →
 * bounded run account. It never writes canonical state and never selects a
 * target: the protocolId comes from an owner-approved handoff.
 */

import { resolveProtocol } from '../registry';
import type { Env } from '../../db/queries';
import { planSources } from './source-plan';
import { gateFetchForPLevel } from './fetch-policy';
import { parseDocument, validateParsedDocument, type RawDocument } from './parse-contract';
import { mapParsedToCanonical } from './p-mapping';
import { persistMappedPackage } from './persist';
import { openRun, noteRun, enforceBounds, closeRun, type IngestionRunState } from './run-ledger';

export interface DryRunInput {
  protocolId: string;
  admissionSources: Array<{
    sourceId: string;
    sourceType: string;
    uri: string;
    sourceRole: string;
    disposition: 'ACTIVATE' | 'MANUAL_INTAKE' | 'RESTRICTED';
  }>;
  documents: RawDocument[];
}

export interface DryRunResult {
  run: IngestionRunState;
  resolvedAs: string;
  permittedSources: string[];
  mapped: { components: number; claims: number; safety: number };
  validationProblems: string[];
}

export async function runDryRun(db: Env['DB'], input: DryRunInput): Promise<DryRunResult> {
  const run = openRun(input.protocolId);
  const resolution = await resolveProtocol(db, input.protocolId);
  if (!resolution.protocol || resolution.outcome === 'AMBIGUOUS' || resolution.outcome === 'NOT_FOUND') {
    noteRun(run, 'IDENTITY_UNRESOLVED', `cannot resolve ${input.protocolId}: ${resolution.outcome}`);
    return { run: closeRun(run, 'BLOCKED'), resolvedAs: resolution.outcome, permittedSources: [], mapped: { components: 0, claims: 0, safety: 0 }, validationProblems: ['IDENTITY_UNRESOLVED'] };
  }
  const planned = planSources(input.admissionSources);
  run.sourcesPlanned = planned.length;
  const p5gates = gateFetchForPLevel(planned, 'P5');
  const permittedSources = p5gates.filter((g) => g.verdict === 'PERMITTED').map((g) => g.sourceId);
  run.sourcesPermitted = permittedSources.length;
  enforceBounds({
    sources: planned.length,
    components: input.documents.length * 4,
    claims: input.documents.length * 4,
    evidence: input.documents.length,
    safety: input.documents.length * 2,
  });
  const parsed = input.documents.map(parseDocument);
  const validationProblems = parsed.flatMap(validateParsedDocument);
  const mapped = mapParsedToCanonical({ protocolId: resolution.protocol.protocol_id, protocolSlugSeed: resolution.protocol.canonical_name, parsed });
  run.recordsMapped = mapped.components.length + mapped.claims.length + mapped.safety.length;
  const persistResult = await persistMappedPackage(db, mapped, { dryRun: true });
  for (const d of persistResult.diagnostics) noteRun(run, d.code, d.detail, d.key);
  for (const p of validationProblems) noteRun(run, 'PARTIAL_SUCCESS', p);
  return {
    run: closeRun(run, 'DRY_RUN_COMPLETE'),
    resolvedAs: resolution.outcome,
    permittedSources,
    mapped: { components: mapped.components.length, claims: mapped.claims.length, safety: mapped.safety.length },
    validationProblems,
  };
}
