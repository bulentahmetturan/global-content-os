import { StatisticsError } from '../errors';
import { lineageEdgeId } from '../identity';
import type { StatisticsStorage } from '../storage';

export type EdgeType = 'UPSTREAM_SOURCE' | 'MIRROR_OF' | 'DERIVED_FROM' | 'NORMALIZED_FROM' | 'REPLACES' | 'SUPERSEDES';
export type EvidenceStatus = 'VERIFIED' | 'PARTIAL' | 'UNKNOWN';

export type LineageRef = { sourceId: string } | { datasetId: string };

export interface LineageEdgeInput {
  edgeType: EdgeType;
  from: LineageRef;
  to: LineageRef;
  evidenceStatus: EvidenceStatus;
  evidenceRef?: string | null;
}

export interface LineageEdgeRow {
  edge_id: string;
  edge_type: EdgeType;
  from_source_id: string | null;
  from_dataset_id: string | null;
  to_source_id: string | null;
  to_dataset_id: string | null;
  from_ref: string;
  to_ref: string;
  evidence_status: EvidenceStatus;
  evidence_ref: string | null;
}

const refOf = (r: LineageRef) => ('sourceId' in r ? r.sourceId : r.datasetId);
/** Edge types whose target is the data's origin (used for independence analysis). */
const ORIGIN_EDGES: EdgeType[] = ['UPSTREAM_SOURCE', 'MIRROR_OF', 'DERIVED_FROM', 'NORMALIZED_FROM'];

export function lineageRepository(s: StatisticsStorage) {
  const outgoing = (ref: string, limit: number) => s.all<LineageEdgeRow>('SELECT * FROM statistics_lineage_edges WHERE from_ref = ?1 ORDER BY edge_type, to_ref LIMIT ?2', ref, limit);

  return {
    /** Idempotent by (edge_type, from, to). A re-registration returns the existing edge (evidenceDiffers flags a changed claim). */
    async add(input: LineageEdgeInput): Promise<{ edge: LineageEdgeRow; created: boolean; evidenceDiffers: boolean }> {
      const fromRef = refOf(input.from);
      const toRef = refOf(input.to);
      if (fromRef === toRef) throw new StatisticsError('STATISTICS_INTEGRITY_ERROR', 'a lineage edge cannot point at itself', { detail: { ref: fromRef } });
      const id = await lineageEdgeId(input.edgeType, fromRef, toRef);
      const inserted = await s.all<{ edge_id: string }>(
        `INSERT INTO statistics_lineage_edges (edge_id, edge_type, from_source_id, from_dataset_id, to_source_id, to_dataset_id, from_ref, to_ref, evidence_status, evidence_ref, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(edge_id) DO NOTHING RETURNING edge_id`,
        id, input.edgeType, 'sourceId' in input.from ? input.from.sourceId : null, 'datasetId' in input.from ? input.from.datasetId : null, 'sourceId' in input.to ? input.to.sourceId : null, 'datasetId' in input.to ? input.to.datasetId : null, fromRef, toRef, input.evidenceStatus, input.evidenceRef ?? null, s.now(),
      );
      const edge = (await s.first<LineageEdgeRow>('SELECT * FROM statistics_lineage_edges WHERE edge_id = ?1', id))!;
      return { edge, created: inserted.length === 1, evidenceDiffers: inserted.length === 0 && edge.evidence_status !== input.evidenceStatus };
    },

    upstreamOf: (ref: string, limit: number) => outgoing(ref, s.requireLimit(limit)),

    downstreamOf: (ref: string, limit: number) => s.all<LineageEdgeRow>('SELECT * FROM statistics_lineage_edges WHERE to_ref = ?1 ORDER BY edge_type, from_ref LIMIT ?2', ref, s.requireLimit(limit)),

    /**
     * secondary → upstream canonical trace: follows origin edges breadth-first from a source/dataset ref, bounded by depth and fan-out.
     * Returns the chain of edges and the terminal "roots" (refs with no further origin edge).
     */
    async traceUpstream(ref: string, opts: { maxDepth: number; fanOut: number }): Promise<{ edges: LineageEdgeRow[]; roots: string[] }> {
      const maxDepth = Math.min(Math.max(1, opts.maxDepth), 8);
      const fanOut = s.requireLimit(opts.fanOut, 'fanOut');
      const edges: LineageEdgeRow[] = [];
      const seen = new Set<string>([ref]);
      let frontier = [ref];
      const roots = new Set<string>();
      for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
        const next: string[] = [];
        for (const r of frontier) {
          const out = (await outgoing(r, fanOut)).filter((e) => ORIGIN_EDGES.includes(e.edge_type));
          if (out.length === 0) roots.add(r);
          for (const e of out) {
            edges.push(e);
            if (!seen.has(e.to_ref)) {
              seen.add(e.to_ref);
              next.push(e.to_ref);
            }
          }
        }
        frontier = next;
      }
      for (const r of frontier) roots.add(r);
      return { edges, roots: [...roots].sort() };
    },

    /**
     * Independence analysis: sources that trace to a common upstream root are ONE evidence group, never independent confirmation.
     * Lineage never implies independence; absence of an edge only means "no recorded relationship".
     */
    async independentEvidenceGroups(sourceIds: string[], opts: { maxDepth: number; fanOut: number }): Promise<string[][]> {
      if (sourceIds.length > s.limits.maxListLimit) throw new StatisticsError('STATISTICS_BOUNDS_ERROR', 'too many sources');
      const rootsBySource = new Map<string, Set<string>>();
      for (const sid of sourceIds) rootsBySource.set(sid, new Set((await this.traceUpstream(sid, opts)).roots));
      const parent = new Map<string, string>(sourceIds.map((x) => [x, x]));
      const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
      for (let i = 0; i < sourceIds.length; i++) {
        for (let j = i + 1; j < sourceIds.length; j++) {
          const a = rootsBySource.get(sourceIds[i])!;
          const b = rootsBySource.get(sourceIds[j])!;
          // A source in the other's trace (e.g. OWID → WHO) also links the two.
          const linked = [...a].some((r) => b.has(r)) || a.has(sourceIds[j]) || b.has(sourceIds[i]);
          if (linked) parent.set(find(sourceIds[i]), find(sourceIds[j]));
        }
      }
      const groups = new Map<string, string[]>();
      for (const x of sourceIds) (groups.get(find(x)) ?? groups.set(find(x), []).get(find(x))!).push(x);
      return [...groups.values()].map((g) => g.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    },
  };
}
