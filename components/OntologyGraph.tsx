"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { LacunaState } from "@/components/ui/LacunaState";
import { ENTITY_KIND_ORDER } from "@/lib/engine/graph";

/**
 * OntologyGraph — DESIGN-BRIEF §9 (ontology graphs count as dataviz).
 * A dumb client wrapper around Cytoscape. Elements arrive as props; no fetching.
 * Shared by Map (N°02, stance clusters) and Prosopon (N°04, entity network) —
 * SPEC §1: "one shared <OntologyGraph>."
 *
 * - Node shape: square compartment (rectangle, radius 0, 1px hairline stroke).
 * - Node fill, two FIXED orders depending on what the elements carry (never a
 *   generated hue either way):
 *     - entity mode (`data.kind` present): --chart-1…5 by the CLOSED,
 *       globally-fixed taxonomy order in ENTITY_KIND_ORDER (person/place/
 *       org/work/concept) — the same kind is always the same plate, across
 *       every render.
 *     - cluster mode (Map, no `data.kind`): --chart-1…5 by first-appearance
 *       order of each node's `cluster` / `clusterId` / `stanceClusterId`
 *       datum — fixed for the lifetime of one render, not a global taxonomy.
 *   Either way, a 6th distinct value folds into --chart-5.
 * - Node size: fixed 36px, EXCEPT entity nodes with a numeric `mentions`
 *   datum, which scale (sqrt, clamped 28–72px) — SPEC §5: "size = total
 *   mentions."
 * - Edges: --ink-2, 2px; `data.type === "disputes"` renders dashed; edge
 *   label is `data.type` when present, else `${weight}×` for co-occurrence
 *   edges (SPEC §5: "edge weight = documents shared").
 * - Selected node: ringed in --rubric.
 * - All colors are resolved from tokens.css at run time and re-resolved when
 *   the theme changes (system preference or data-theme attribute).
 */

type Tokens = {
  charts: [string, string, string, string, string];
  ink: string;
  ink2: string;
  rubric: string;
  hairline: string;
  stock: string;
  stock2: string;
  fontMono: string;
};

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    charts: [
      v("--chart-1"),
      v("--chart-2"),
      v("--chart-3"),
      v("--chart-4"),
      v("--chart-5"),
    ],
    ink: v("--ink"),
    ink2: v("--ink-2"),
    rubric: v("--rubric"),
    hairline: v("--hairline"),
    stock: v("--stock"),
    stock2: v("--stock-2"),
    fontMono: v("--font-mono"),
  };
}

function clusterKeyOf(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const key = data.cluster ?? data.clusterId ?? data.stanceClusterId;
  return key == null ? null : String(key);
}

type EntityKind = (typeof ENTITY_KIND_ORDER)[number];

function kindOf(data: Record<string, unknown> | undefined): EntityKind | null {
  const kind = data?.kind;
  return typeof kind === "string" &&
    (ENTITY_KIND_ORDER as readonly string[]).includes(kind)
    ? (kind as EntityKind)
    : null;
}

/** SPEC §5: entity node size = total mentions (sqrt scale, clamped). Stance nodes stay 36px. */
function sizeFor(data: Record<string, unknown> | undefined): number {
  const mentions = data?.mentions;
  if (typeof mentions !== "number" || !Number.isFinite(mentions) || mentions <= 0) {
    return 36;
  }
  const raw = 22 + Math.sqrt(mentions) * 9;
  return Math.max(28, Math.min(72, Math.round(raw)));
}

/** Co-occurrence edges have no `type`; label them by shared-document weight instead. */
function edgeLabelFor(data: Record<string, unknown> | undefined): string {
  if (typeof data?.type === "string") return data.type;
  if (typeof data?.weight === "number") return `${data.weight}×`;
  return "";
}

function buildStyles(t: Tokens): cytoscape.StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        shape: "rectangle",
        width: "data(__size)",
        height: "data(__size)",
        "background-color": "data(__plate)",
        "border-width": 1,
        "border-color": t.hairline,
        label: "data(label)",
        color: t.ink,
        "font-family": t.fontMono,
        "font-size": 11,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "text-wrap": "wrap",
        "text-max-width": "140px",
        "overlay-opacity": 0,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 2,
        "border-color": t.rubric,
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": t.ink2,
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "target-arrow-color": t.ink2,
        "arrow-scale": 0.8,
        label: "data(__label)",
        color: t.ink2,
        "font-family": t.fontMono,
        "font-size": 10,
        "text-rotation": "autorotate",
        "text-margin-y": -8,
        "overlay-opacity": 0,
      },
    },
    {
      selector: "edge[type = 'disputes']",
      style: {
        "line-style": "dashed",
      },
    },
  ];
}

export function OntologyGraph({
  elements,
  height = "480px",
  label = "Stance ontology graph",
}: {
  elements: cytoscape.ElementDefinition[];
  height?: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (elements.length === 0 || !containerRef.current) return;

    // Entity mode (Prosopon): any node carries a recognized `kind` datum ->
    // EVERY node in this render colors by the fixed taxonomy order, never
    // cluster first-appearance order. A render never mixes the two modes.
    const isEntityMode = elements.some((el) => {
      const data = el.data as Record<string, unknown> | undefined;
      if (data && "source" in data && "target" in data) return false; // edge
      return kindOf(data) !== null;
    });

    // Cluster mode (Map): fixed order = first appearance across the node list.
    const clusterOrder: string[] = [];
    for (const el of elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (data && "source" in data && "target" in data) continue; // edge
      const key = clusterKeyOf(data);
      if (key !== null && !clusterOrder.includes(key)) clusterOrder.push(key);
    }

    const plateFor = (data: Record<string, unknown> | undefined, t: Tokens) => {
      if (isEntityMode) {
        const kind = kindOf(data);
        if (kind === null) return t.stock2;
        return t.charts[Math.min(ENTITY_KIND_ORDER.indexOf(kind), 4)];
      }
      const key = clusterKeyOf(data);
      if (key === null) return t.stock2;
      const idx = clusterOrder.indexOf(key);
      return t.charts[Math.min(idx, 4)];
    };

    let tokens = readTokens();
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements.map((el) => {
        const data = el.data as Record<string, unknown>;
        const isEdge = data && "source" in data && "target" in data;
        return isEdge
          ? { ...el, data: { ...data, __label: edgeLabelFor(data) } }
          : {
              ...el,
              data: { ...data, __plate: plateFor(data, tokens), __size: sizeFor(data) },
            };
      }),
      style: buildStyles(tokens),
      layout: { name: "cose", animate: false, padding: 24 },
      wheelSensitivity: 0.2,
    });

    const applyTheme = () => {
      tokens = readTokens();
      cy.nodes().forEach((n) => {
        n.data("__plate", plateFor(n.data() as Record<string, unknown>, tokens));
      });
      cy.style(buildStyles(tokens));
    };

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", applyTheme);
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      mq.removeEventListener("change", applyTheme);
      observer.disconnect();
      cy.destroy();
    };
  }, [elements]);

  if (elements.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius)",
          background: "var(--stock)",
          padding: "calc(var(--space-unit) * 3)",
          minHeight: height,
        }}
      >
        <LacunaState />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius)",
        background: "var(--stock)",
        width: "100%",
        height,
      }}
    />
  );
}
