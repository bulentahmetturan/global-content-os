/**
 * Local research-handoff builder (pure DTO + serializer). It is NOT persisted and NOT sent anywhere (no CCOS call, no
 * research execution). It carries discovery facts only and is built from a whitelist: a scientific conclusion, literature
 * synthesis, efficacy/safety/myth verdict, dose or treatment recommendation cannot be emitted because no such field exists, and
 * any such key found inside copied JSON is stripped and then re-checked.
 */
import vocab from '../../../../packages/contracts/dossier-discovery.json';
import { validateHandoff } from '../../../../packages/contracts/src/dossier-discovery';
import { DossierError } from './types';
import { explainWhyNow } from './snapshots';
import type { DossierRepo } from './repo';

type Row = Record<string, unknown>;
const FORBIDDEN = new Set<string>(vocab.handoff.forbidden_fields);
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function stripForbidden<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripForbidden(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!FORBIDDEN.has(k)) out[k] = stripForbidden(v);
    return out as T;
  }
  return value;
}
export function findForbiddenKeys(value: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) value.forEach((v, i) => hits.push(...findForbiddenKeys(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.has(k)) hits.push(`${path}.${k}`);
    hits.push(...findForbiddenKeys(v, `${path}.${k}`));
  }
  return hits;
}

export interface ResearchHandoff {
  canonical_topic: string;
  canonical_terms: string[];
  aliases: string[];
  domain: string | null;
  public_health_lane: string | null;
  relation_depth: number;
  why_now: unknown;
  why_wow: unknown;
  signal_family_summary: Record<string, unknown>;
  turkey_signal_dimensions: unknown[];
  global_frontier_dimensions: unknown[];
  public_questions: string[];
  related_concepts: { concept_id: string; label: string; state: string }[];
  discovery_provenance: Record<string, unknown>;
  quality_reason_codes: string[];
  medical_claim_risk: { state: 'UNKNOWN'; value: null };
  sensationalism_risk: unknown;
}

export async function buildResearchHandoff(repo: DossierRepo, candidateId: string): Promise<ResearchHandoff> {
  const cand = await repo.getCandidate(candidateId);
  if (!cand) throw new DossierError('candidate_not_found');
  const last = await repo.latestReview('DOSSIER_CANDIDATE', candidateId);
  if (!['ACCEPTED', 'RESEARCH_REQUESTED'].includes(s(cand.state)) || last?.decision !== 'ACCEPT') throw new DossierError('candidate_not_accepted', 'a handoff exists only after a human ACCEPT');
  const snap = (await repo.listSnapshots(candidateId, 1))[0];
  if (!snap) throw new DossierError('candidate_has_no_snapshot');
  const ex = await explainWhyNow(repo, s(snap.snapshot_id));
  if (!ex) throw new DossierError('snapshot_not_found');
  const rawWhyNow = JSON.parse(s(snap.why_now_json)) as { why_wow?: unknown; lane?: string };
  const quality = JSON.parse(s(snap.quality_dimensions_json) || '{}') as Record<string, unknown>;
  let topic = '';
  let aliases: string[] = [];
  let related: ResearchHandoff['related_concepts'] = [];
  let depth = 1;
  if (s(cand.target_type) === 'CONCEPT') {
    const c = await repo.getConcept(s(cand.target_id));
    topic = s(c?.label);
    aliases = (await repo.listAliasesForConcept(s(cand.target_id), 50)).map((a) => s(a.alias_text));
    for (const r of await repo.listRelationsForConcept(s(cand.target_id), 20)) {
      for (const m of await repo.listRelationMembers(s(r.relation_id))) {
        if (s(m.concept_id) === s(cand.target_id)) continue;
        const mc = await repo.getConcept(s(m.concept_id));
        if (mc && !related.some((x) => x.concept_id === s(mc.concept_id))) related.push({ concept_id: s(mc.concept_id), label: s(mc.label), state: s(mc.state) });
      }
    }
  } else {
    const rel = await repo.getRelation(s(cand.target_id));
    depth = Number(rel?.depth ?? 2);
    for (const m of await repo.listRelationMembers(s(cand.target_id))) {
      const mc = await repo.getConcept(s(m.concept_id));
      if (mc) related.push({ concept_id: s(mc.concept_id), label: s(mc.label), state: s(mc.state) });
    }
    topic = related.map((r) => r.label).join(' + ');
  }
  const bySide = (prefix: string) => ex.aggregateStates.filter((a) => a.family.startsWith(prefix) || (prefix === 'TURKEY_' && a.family === 'TR_CLINICIAN_CREATOR_PULSE'));
  const summary: Record<string, unknown> = {};
  for (const a of ex.aggregateStates) {
    const cur = (summary[a.family] as { windows: unknown[] } | undefined) ?? { windows: [] };
    cur.windows.push({ window_kind: a.windowKind, window: a.window, provenance: a.provenance, observations: a.observations, independent_sources: a.independentSources, actors: a.actors, platforms: a.platforms, value: a.value, value_status: a.valueStatus });
    summary[a.family] = cur;
  }
  const dto: ResearchHandoff = {
    canonical_topic: topic,
    canonical_terms: [...new Set([topic, ...aliases].map((x) => x.trim()).filter(Boolean))],
    aliases,
    domain: (cand.domain as string | null) ?? null,
    public_health_lane: s(cand.domain) === 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH' ? rawWhyNow.lane ?? 'UNKNOWN' : null,
    relation_depth: depth,
    why_now: stripForbidden({ snapshot_id: ex.snapshotId, generated_at: ex.generatedAt, candidate_class: ex.candidateClass, signal_families: ex.signalFamilies, window_kinds: ex.windowKinds }),
    why_wow: stripForbidden(rawWhyNow.why_wow ?? null),
    signal_family_summary: stripForbidden(summary),
    turkey_signal_dimensions: stripForbidden(bySide('TURKEY_')),
    global_frontier_dimensions: stripForbidden(bySide('GLOBAL_')),
    public_questions: [],
    related_concepts: related,
    discovery_provenance: stripForbidden({ candidate_id: candidateId, snapshot_id: ex.snapshotId, algorithm_version: ex.algorithmVersion, provenance: ex.provenance, provenance_status: ex.provenanceStatus, public_questions_extracted: false, raw_membership_reconstructable: false }),
    quality_reason_codes: ex.reasonCodes,
    medical_claim_risk: { state: 'UNKNOWN', value: null },
    sensationalism_risk: quality.SENSATIONALISM_RISK ?? { state: 'UNKNOWN', value: null },
  };
  const errors = validateHandoff(dto);
  const leaks = findForbiddenKeys(dto);
  if (errors.length || leaks.length) throw new DossierError('handoff_invalid', [...errors, ...leaks].join(','));
  return dto;
}

/** Stable JSON for a local DTO. Never sends or stores it. */
export function serializeHandoff(dto: ResearchHandoff): string {
  const leaks = findForbiddenKeys(dto);
  if (leaks.length) throw new DossierError('handoff_contains_forbidden_fields', leaks.join(','));
  return JSON.stringify(dto, null, 2);
}
