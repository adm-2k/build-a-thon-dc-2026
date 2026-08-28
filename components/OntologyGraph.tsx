"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { LacunaState } from "@/components/ui/LacunaState";

/**
 * OntologyGraph — DESIGN-BRIEF §9 (ontology graphs count as dataviz).
 * A dumb client wrapper around Cytoscape. Elements arrive as props; no fetching.
 *
 * - Node shape: square compartment (rectangle, radius 0, 1px hairline stroke).
 * - Node fill: --chart-1…--chart-5 in FIXED order by cluster (first-appearance
 *   order of each node's `cluster` / `clusterId` / `stanceClusterId` datum);
 *   clusters beyond the fifth fold into --chart-5 — never a generated hue.
 * - Edges: --ink-2; `data.type === "disputes"` renders dashed.
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

function buildStyles(t: Tokens): cytoscape.StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        shape: "rectangle",
        width: 36,
        height: 36,
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
        label: "data(type)",
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

    // Fixed cluster order: first appearance across the node list.
    const clusterOrder: string[] = [];
    for (const el of elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (data && "source" in data && "target" in data) continue; // edge
      const key = clusterKeyOf(data);
      if (key !== null && !clusterOrder.includes(key)) clusterOrder.push(key);
    }

    const plateFor = (data: Record<string, unknown> | undefined, t: Tokens) => {
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
          ? el
          : { ...el, data: { ...data, __plate: plateFor(data, tokens) } };
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
