/**
 * lib/engine/graph.ts — StanceCluster[] → Cytoscape elements (SPEC §5, Map)
 * AND Entity[] → co-occurrence elements (SPEC §5, Prosopon N°04).
 *
 * OWNERSHIP: this file belongs to Lane C after the scaffold (ORCHESTRATION
 * §2.3 / §8 T6) — announce changes via a CROSS-LANE note in docs/HANDOFF.md
 * (done for this v2 addition, 2026-08-30).
 *
 * Deliberately minimal and client-safe: no env, no db, no colors. Node fill
 * comes from --chart-* in FIXED order (CLAUDE.md rule 7) — the UI maps a
 * node's order/kind index → the token; a generated hue here would be a
 * defect. Map uses first-appearance cluster order; Prosopon uses the closed,
 * globally-fixed entity kind taxonomy (ENTITY_KIND_ORDER below).
 */
import type { StanceCluster, Entity } from "./schemas";

/**
 * Re-exported so call sites that already `import { ..., type Entity } from
 * "@/lib/engine/graph"` (app/network/NetworkClient.tsx) keep working — the
 * canonical definition is schemas.ts's EntitySchema (CLAUDE.md eng rule 1).
 * Schemas v2 landed 2026-08-30 (#4); this replaces the temporary file-local
 * placeholder that shipped in #5 — field-for-field identical, so nothing
 * downstream of the type needed to change. (No remaining debt from that
 * placeholder as of #23, which did this swap.)
 */
export type { Entity };

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

/* ════════════════════════════════════════════════════════════════════════
 * Prosopon (N°04) — Entity[] → typed co-occurrence network (SPEC §5)
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * The entity kind taxonomy is CLOSED (SPEC §3, DATA-CAVEATS addendum §11)
 * and its --chart-* mapping is a GLOBALLY fixed order — unlike Map's
 * per-question, first-appearance cluster order, every Prosopon render colors
 * "person" the same plate. Never reorder; a 6th kind is a defect, not an
 * extension point (fold it into "concept" upstream, in the NER prompt).
 */
export const ENTITY_KIND_ORDER = [
  "person",
  "place",
  "org",
  "work",
  "concept",
] as const;

export interface EntityNodeData {
  /** `${kind}:${name}` — the exact-match merge key (SPEC §5: Round 2 does disambiguation). */
  id: string;
  label: string;
  kind: Entity["kind"];
  /** Sum of per-document `mentions` across the whole corpus — drives node size. */
  mentions: number;
  /** Distinct documents this entity appears in — drives the margin register. */
  documentCount: number;
}

export interface CooccurEdgeData {
  id: string;
  source: string;
  target: string;
  /** Number of documents both endpoints co-occur in (SPEC §5). */
  weight: number;
}

export type EntityElement =
  | { group: "nodes"; data: EntityNodeData }
  | { group: "edges"; data: CooccurEdgeData };

/**
 * Merge Entity[] (one row per entity per document, SPEC §3) into a
 * co-occurrence network: nodes merge on exact name+kind (case-sensitive —
 * over-merging fabricates a network, DATA-CAVEATS addendum §11), sized by
 * total mentions; edges connect entities that share at least one document,
 * weighted by the number of documents shared. Two entities that never share
 * a document never get an edge — there is no transitive/global edge.
 */
export function entitiesToElements(entities: Entity[]): EntityElement[] {
  type NodeAcc = {
    kind: Entity["kind"];
    name: string;
    mentions: number;
    documentIds: Set<string>;
  };
  const nodeKey = (e: Pick<Entity, "kind" | "name">) => `${e.kind}:${e.name}`;

  const nodeMap = new Map<string, NodeAcc>();
  for (const e of entities) {
    const key = nodeKey(e);
    const existing = nodeMap.get(key);
    if (existing) {
      existing.mentions += e.mentions;
      existing.documentIds.add(e.documentId);
    } else {
      nodeMap.set(key, {
        kind: e.kind,
        name: e.name,
        mentions: e.mentions,
        documentIds: new Set([e.documentId]),
      });
    }
  }

  const nodes: EntityElement[] = Array.from(nodeMap.entries()).map(([id, n]) => ({
    group: "nodes",
    data: {
      id,
      label: n.name,
      kind: n.kind,
      mentions: n.mentions,
      documentCount: n.documentIds.size,
    },
  }));

  // documentId -> set of node keys mentioned in that document (co-occurrence pool)
  const byDocument = new Map<string, Set<string>>();
  for (const e of entities) {
    const set = byDocument.get(e.documentId) ?? new Set<string>();
    set.add(nodeKey(e));
    byDocument.set(e.documentId, set);
  }

  const weight = new Map<string, number>(); // "a~b" (sorted) -> shared-document count
  for (const set of byDocument.values()) {
    const keys = Array.from(set);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pairKey = [keys[i], keys[j]].sort().join("~");
        weight.set(pairKey, (weight.get(pairKey) ?? 0) + 1);
      }
    }
  }

  const edges: EntityElement[] = Array.from(weight.entries()).map(([pairKey, w]) => {
    const [source, target] = pairKey.split("~");
    return {
      group: "edges",
      data: { id: `edge:${pairKey}`, source, target, weight: w },
    };
  });

  return [...nodes, ...edges];
}
