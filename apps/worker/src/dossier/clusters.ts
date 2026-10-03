/**
 * Origin clusters + independence (local). Purpose only: 1 original + 20 reposts is NOT 21 independent sources. Items that
 * share a reader-supplied near-duplicate fingerprint join one cluster; independence counts distinct ORIGIN UNITS (a cluster,
 * or the item itself when it has none). Not a copyright archive, not an attribution graph.
 */
import type { DossierRepo } from './repo';

export interface ClusterCandidate {
  memberKind: 'EXTERNAL_ITEM' | 'SOURCE_ITEM';
  memberRef: string;
  acquisitionSourceId: string | null;
  publishedAt: string | null;
  fingerprint: string | null;
}

/**
 * Assigns clusters for a batch. External items are looked up across runs by fingerprint (partial index); Hub items only
 * cluster with what is in the same batch. Returns "kind:ref" -> cluster id for every member that belongs to a cluster.
 */
export async function assignClusters(repo: DossierRepo, batch: readonly ClusterCandidate[], opts: { lookupLimit: number }): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byFp = new Map<string, ClusterCandidate[]>();
  for (const c of batch) if (c.fingerprint) byFp.set(c.fingerprint, [...(byFp.get(c.fingerprint) ?? []), c]);
  for (const [fp, group] of byFp) {
    const earlier = await repo.findExternalItemsByFingerprint(fp, opts.lookupLimit);
    const members = new Map<string, { kind: string; ref: string; src: string | null; at: string | null }>();
    for (const e of earlier) members.set(`EXTERNAL_ITEM:${e.origin_item_id}`, { kind: 'EXTERNAL_ITEM', ref: String(e.origin_item_id), src: (e.acquisition_source_id as string | null) ?? null, at: (e.published_at as string | null) ?? null });
    for (const g of group) members.set(`${g.memberKind}:${g.memberRef}`, { kind: g.memberKind, ref: g.memberRef, src: g.acquisitionSourceId, at: g.publishedAt });
    if (members.size < 2) continue; // a lone item has no derivative yet: no cluster is created for it
    const existing = await repo.clusterIdsFor([...members.values()].map((m) => ({ member_kind: m.kind, member_ref: m.ref })));
    const clusterId = [...existing.values()].sort()[0] ?? (await repo.createCluster('FINGERPRINT'));
    const representative = [...members.values()].sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999') || a.ref.localeCompare(b.ref))[0];
    const hadMembers = existing.size > 0;
    for (const [key, m] of members) {
      await repo.addClusterMember({ cluster_id: clusterId, member_kind: m.kind, member_ref: m.ref, acquisition_source_id: m.src, is_representative: !hadMembers && m === representative });
      out.set(key, existing.get(key) ?? clusterId);
    }
  }
  return out;
}

export interface IndependenceObservation {
  observation_id: string;
  origin_item_id?: string | null;
  source_item_id?: string | null;
  acquisition_source_id?: string | null;
  actor_id?: string | null;
  signal_family: string;
}
export interface IndependenceMetrics {
  mention_count: number;
  independent_origin_count: number;
  unique_source_count: number;
  unique_actor_count: number;
  unique_platform_count: number;
  independent_signal_family_count: number;
}

/** Origin unit of an observation: its cluster, else the item itself, else the observation. */
export async function originUnits(repo: DossierRepo, obs: readonly IndependenceObservation[]): Promise<Map<string, string>> {
  const members = obs.flatMap((o) => (o.origin_item_id ? [{ member_kind: 'EXTERNAL_ITEM', member_ref: o.origin_item_id }] : o.source_item_id ? [{ member_kind: 'SOURCE_ITEM', member_ref: o.source_item_id }] : []));
  const clusters = members.length ? await repo.clusterIdsFor(members) : new Map<string, string>();
  const out = new Map<string, string>();
  for (const o of obs) {
    const key = o.origin_item_id ? `EXTERNAL_ITEM:${o.origin_item_id}` : o.source_item_id ? `SOURCE_ITEM:${o.source_item_id}` : null;
    out.set(o.observation_id, key ? (clusters.get(key) ? `cluster:${clusters.get(key)}` : `item:${key}`) : `obs:${o.observation_id}`);
  }
  return out;
}

export function independence(obs: readonly IndependenceObservation[], unitOf: ReadonlyMap<string, string>, platformOf: (acquisitionSourceId: string) => string | null): IndependenceMetrics {
  const units = new Set<string>();
  const sources = new Set<string>();
  const actors = new Set<string>();
  const platforms = new Set<string>();
  const families = new Set<string>();
  for (const o of obs) {
    units.add(unitOf.get(o.observation_id) ?? `obs:${o.observation_id}`);
    if (o.acquisition_source_id) {
      sources.add(o.acquisition_source_id);
      const p = platformOf(o.acquisition_source_id);
      if (p) platforms.add(p);
    }
    if (o.actor_id) actors.add(o.actor_id);
    families.add(o.signal_family);
  }
  return { mention_count: obs.length, independent_origin_count: units.size, unique_source_count: sources.size, unique_actor_count: actors.size, unique_platform_count: platforms.size, independent_signal_family_count: families.size };
}
