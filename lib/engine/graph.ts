/**
 * lib/engine/graph.ts — StanceCluster[] → Cytoscape elements (SPEC §5, Map).
 *
 * OWNERSHIP: this file belongs to Lane C after the scaffold (ORCHESTRATION
 * §2.3 / §8 T6) — announce changes via a CROSS-LANE note in docs/HANDOFF.md.
 *
 * Deliberately minimal and client-safe: no env, no db, no colors. Node fill
 * comes from --chart-* in FIXED cluster order (CLAUDE.md rule 7) — the UI
 * maps `data.order` → the token; a generated hue here would be a defect.
 */
import type { StanceCluster } from "./schemas";

export interface ClusterNodeData {
  id: string;
  label: string;
  /** Cluster id (== node id for cluster nodes) — kept for styling selectors. */
  cluster: string;
  /** 0-based position in the input array — maps to --chart-<order+1> in the UI. */
  order: number;
  evidenceKind: string;
  sourceCount: number;
}

export interface StanceEdgeData {
  id: string;
  source: string;
  target: string;
  /** Typed disagreement — the only two edge kinds in the ontology. */
  type: "agrees" | "disputes";
}

export type StanceElement =
  | { group: "nodes"; data: ClusterNodeData }
  | { group: "edges"; data: StanceEdgeData };

/**
 * Map stance clusters onto Cytoscape element definitions: one node per
 * cluster, one edge per agrees/disputes relation. Edges pointing at unknown
 * or self ids are dropped; `agrees` is symmetric so mirrored pairs collapse
 * to one edge; duplicate relations are deduped.
 */
export function stanceClustersToElements(
  clusters: StanceCluster[],
): StanceElement[] {
  const ids = new Set(clusters.map((c) => c.id));

  const nodes: StanceElement[] = clusters.map((c, i) => ({
    group: "nodes",
    data: {
      id: c.id,
      label: c.label,
      cluster: c.id,
      order: i,
      evidenceKind: c.evidenceKind,
      sourceCount: c.sources.length,
    },
  }));

  const seen = new Set<string>();
  const edges: StanceElement[] = [];
  for (const c of clusters) {
    const relations: Array<["agrees" | "disputes", string[]]> = [
      ["agrees", c.agreesWith],
      ["disputes", c.disputes],
    ];
    for (const [type, targets] of relations) {
      for (const target of targets) {
        if (!ids.has(target) || target === c.id) continue;
        const key =
          type === "agrees"
            ? `agrees:${[c.id, target].sort().join("~")}`
            : `disputes:${c.id}~${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          group: "edges",
          data: { id: key, source: c.id, target, type },
        });
      }
    }
  }

  return [...nodes, ...edges];
}
