/**
 * Open-world concept resolver (local). Exact unambiguous match -> existing identity; ambiguous alias -> REVIEW_REQUIRED
 * (never auto-merged, the caller keeps the observation unresolved); no match -> a PROPOSED identity. REJECTED and MERGED
 * identities keep matching, so they are never blindly recreated as fresh proposals. There is NO topic list in this code:
 * the only knowledge is the runtime alias index loaded from the database for the labels being resolved.
 */
import { normalizeLabel, resolveConcept } from '../../../../packages/contracts/src/dossier-discovery';
import { DossierError } from './types';
import type { DossierRepo } from './repo';

export type ResolveResult =
  | { outcome: 'MATCHED_EXISTING'; conceptId: string; state: string; created: false }
  | { outcome: 'REVIEW_REQUIRED'; candidates: string[]; created: false }
  | { outcome: 'PROPOSED'; conceptId: string; created: boolean };

export interface LabelInput {
  label: string;
  domainHint?: string;
  conceptClass?: string;
  familyHint?: string;
  language?: string;
}

export async function resolveLabel(repo: DossierRepo, input: LabelInput): Promise<ResolveResult> {
  const norm = normalizeLabel(input.label);
  if (!norm) throw new DossierError('empty_label');
  const index = await repo.loadAliasIndex([norm]);
  const r = resolveConcept({ observation_id: 'resolver', unresolved_label: input.label, domain_hint: input.domainHint }, index, input.familyHint);
  if (r.outcome === 'REVIEW_REQUIRED') return { outcome: 'REVIEW_REQUIRED', candidates: r.candidates, created: false };
  if (r.outcome === 'MATCHED_EXISTING') {
    const survivor = await repo.getConcept(r.conceptId);
    return { outcome: 'MATCHED_EXISTING', conceptId: r.conceptId, state: String(survivor?.state ?? r.state ?? 'UNKNOWN'), created: false };
  }
  // No match: a provisional, human-reviewable identity. PROPOSED is not canonical and never becomes ACTIVE here.
  const conceptId = await repo.createConceptWithCanonicalAlias(
    { label: input.label.trim(), domain: r.proposal.domain, concept_class: input.conceptClass ?? null, proposal_family: r.proposal.family },
    input.language ?? '',
  );
  return { outcome: 'PROPOSED', conceptId, created: true };
}

/** Observation-ready target: a concept id (matched or freshly proposed) or, when ambiguous, the unresolved label. */
export async function resolveObservationTarget(repo: DossierRepo, input: LabelInput): Promise<{ concept_id: string } | { unresolved_label: string; reviewRequired: true; candidates: string[] }> {
  const r = await resolveLabel(repo, input);
  if (r.outcome === 'REVIEW_REQUIRED') return { unresolved_label: input.label.trim(), reviewRequired: true, candidates: r.candidates };
  return { concept_id: r.conceptId };
}
