/**
 * Layout tests for the Cytoscape map.
 *
 * These run headless: fCoSE computes real positions in Node, so the parts of
 * the map that carry meaning (who clusters with whom, do allies sit closer
 * than rivals, does a pinned node stay pinned) are testable without a browser
 * or a real canvas.
 *
 * The previous implementation's camera maths was tested by re-implementing the
 * transforms inside the test file. That proved the arithmetic and nothing
 * about the component. These tests exercise the actual code path.
 */

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { beforeAll, describe, expect, it } from "vitest";

import type { GraphData } from "@/lib/types";
import {
  blocId,
  buildElements,
  computeStats,
  fcoseOptions,
  figureId,
  idealEdgeLength,
  LABEL_PRIORITY_INFLUENCE,
  LABEL_ZOOM_THRESHOLD,
  labelledNodeIds,
} from "./layout";

cytoscape.use(fcose);

/* ------------------------------------------------------------------ fixtures */

/** A small graph with known structure: two tight allies, one rival pair. */
function fixture(): GraphData {
  const mk = (id: number, label: string, bloc: string, influence: number): GraphData["nodes"][number] => ({
    id,
    label,
    full_name: label,
    role: "Test",
    party: "Test",
    bloc,
    influence,
    degree: 2,
    size: 30,
    tier: { key: "neutral", label: "Netral", description: "", color: "#525A66", threshold: 0 },
  });

  const edge = (
    id: number,
    from: number,
    to: number,
    score: number,
  ): GraphData["edges"][number] => ({
    id,
    from,
    to,
    score,
    label: String(score),
    rel_type: "test",
    tier: { key: "neutral", label: "Netral", description: "", color: "#525A66", threshold: 0 },
    style: { color: "#525A66", width: 2, dashes: score < 0, arrows: "to", opacity: 0.8 },
    title: "t",
    top_issue: null,
  });

  return {
    nodes: [
      mk(1, "Alpha", "Blok A", 90),
      mk(2, "Beta", "Blok A", 80),
      mk(3, "Gamma", "Blok B", 70),
      mk(4, "Delta", "Blok B", 60),
    ],
    edges: [
      edge(1, 1, 2, 80), // strong ally inside Blok A
      edge(2, 3, 4, 70), // strong ally inside Blok B
      edge(3, 1, 3, -80), // bitter rivals across blocs
      edge(4, 2, 4, -70),
    ],
    counts: { nodes: 4, edges: 4 },
  };
}

function layoutOf(data: GraphData, compound = true) {
  const cy = cytoscape({
    headless: true,
    // styleEnabled MUST be true for compound layout, or fCoSE throws
    // RangeError: Invalid array length. See docs/revamp/08-t7-spike-results.md.
    styleEnabled: true,
    elements: buildElements(data, { compound }),
  });
  cy.layout(fcoseOptions() as cytoscape.LayoutOptions).run();
  return cy;
}

const dist = (cy: cytoscape.Core, a: number, b: number) => {
  const pa = cy.getElementById(figureId(a)).position();
  const pb = cy.getElementById(figureId(b)).position();
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
};

/* --------------------------------------------------------------- edge length */

describe("idealEdgeLength encodes the political meaning", () => {
  it("makes allied pairs pull closer than neutral ones", () => {
    expect(idealEdgeLength(80)).toBeLessThan(idealEdgeLength(0));
  });

  it("makes rival pairs push further apart than neutral ones", () => {
    expect(idealEdgeLength(-80)).toBeGreaterThan(idealEdgeLength(0));
  });

  it("is monotonic: the more hostile, the longer the rest length", () => {
    const series = [0, -20, -40, -60, -80, -100].map(idealEdgeLength);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThan(series[i - 1]!);
    }
  });

  it("is monotonic: the more allied, the shorter the rest length", () => {
    const series = [0, 20, 40, 60, 80, 100].map(idealEdgeLength);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeLessThan(series[i - 1]!);
    }
  });

  it("never returns a negative or zero length, which would collapse the layout", () => {
    for (const score of [-100, -50, 0, 50, 100]) {
      expect(idealEdgeLength(score)).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------ element build */

describe("buildElements", () => {
  it("creates one element per node and per edge", () => {
    const els = buildElements(fixture(), { compound: false });
    expect(els).toHaveLength(4 + 4);
  });

  it("creates a compound parent per distinct bloc", () => {
    const els = buildElements(fixture(), { compound: true });
    const parents = els.filter((e) => e.data.isBloc === true);
    expect(parents).toHaveLength(2);
    expect(parents.map((p) => p.data.id).sort()).toEqual([blocId("Blok A"), blocId("Blok B")]);
  });

  it("attaches each figure to its bloc parent", () => {
    const els = buildElements(fixture(), { compound: true });
    const alpha = els.find((e) => e.data.id === figureId(1));
    expect(alpha?.data.parent).toBe(blocId("Blok A"));
  });

  it("omits the parent key entirely when there is no bloc", () => {
    // Passing `parent: undefined` is read by some Cytoscape versions as a
    // literal parent id, which orphans the node.
    const data = fixture();
    data.nodes[0]!.bloc = null;
    const els = buildElements(data, { compound: true });
    const alpha = els.find((e) => e.data.id === figureId(1));
    expect(alpha).toBeDefined();
    expect("parent" in (alpha!.data as object)).toBe(false);
  });

  it("takes colours from the data, never from a hard-coded palette", () => {
    const els = buildElements(fixture(), { compound: true });
    const edge = els.find((e) => e.data.id === "e1");
    expect(edge?.data.color).toBe("#525A66");
  });

  it("carries the score onto the edge so the layout can read it", () => {
    const els = buildElements(fixture(), { compound: true });
    expect(els.find((e) => e.data.id === "e3")?.data.score).toBe(-80);
  });
});

/* ------------------------------------------------------------------ layout */

describe("layout produces a usable map", () => {
  let cy: cytoscape.Core;

  beforeAll(() => {
    cy = layoutOf(fixture());
  });

  it("positions every node with finite coordinates", () => {
    for (const node of cy.nodes().filter((n) => !(n as cytoscape.NodeSingular).isParent())) {
      const p = (node as cytoscape.NodeSingular).position();
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("does not stack nodes on top of each other", () => {
    const positions = cy
      .nodes()
      .filter((n) => !(n as cytoscape.NodeSingular).isParent())
      .map((n) => (n as cytoscape.NodeSingular).position());
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.hypot(positions[i]!.x - positions[j]!.x, positions[i]!.y - positions[j]!.y);
        expect(d).toBeGreaterThan(1);
      }
    }
  });

  it("puts allies closer together than rivals", () => {
    const allyMean = (dist(cy, 1, 2) + dist(cy, 3, 4)) / 2;
    const rivalMean = (dist(cy, 1, 3) + dist(cy, 2, 4)) / 2;
    expect(allyMean).toBeLessThan(rivalMean);
  });

  it("clusters members of the same bloc nearer to each other than to outsiders", () => {
    const sameBloc = (dist(cy, 1, 2) + dist(cy, 3, 4)) / 2;
    const crossBloc = (dist(cy, 1, 3) + dist(cy, 1, 4) + dist(cy, 2, 3) + dist(cy, 2, 4)) / 4;
    expect(sameBloc).toBeLessThan(crossBloc);
  });

  it("creates a compound parent for each bloc with its children attached", () => {
    const parents = cy.nodes().filter((n) => (n as cytoscape.NodeSingular).isParent());
    expect(parents).toHaveLength(2);
    for (const parent of parents) {
      expect((parent as cytoscape.NodeSingular).children().length).toBe(2);
    }
  });
});

/* ------------------------------------------------------- pinning and camera */

describe("pinning and camera independence", () => {
  it("keeps a moved-then-locked node exactly where it was put", () => {
    // Order matters: move first, then lock. Locking first pins the old
    // position and the move is silently ignored.
    const cy = layoutOf(fixture());
    const target = cy.getElementById(figureId(1)) as cytoscape.NodeSingular;
    const start = { ...target.position() };
    target.position({ x: start.x + 150, y: start.y + 90 });
    target.lock();

    cy.layout(fcoseOptions() as cytoscape.LayoutOptions).run();

    const after = target.position();
    expect(after.x).toBeCloseTo(start.x + 150, 0);
    expect(after.y).toBeCloseTo(start.y + 90, 0);
  });

  it("leaves unlocked nodes free to move", () => {
    const cy = layoutOf(fixture());
    const locked = cy.getElementById(figureId(1)) as cytoscape.NodeSingular;
    locked.lock();
    const others = cy
      .nodes()
      .filter((n) => !(n as cytoscape.NodeSingular).isParent() && n.id() !== figureId(1));
    for (const n of others) expect((n as cytoscape.NodeSingular).locked()).toBe(false);
  });

  it("does not move model positions when the camera zooms or pans", () => {
    const cy = layoutOf(fixture());
    const before = { ...(cy.getElementById(figureId(1)) as cytoscape.NodeSingular).position() };
    cy.zoom(1.8);
    cy.pan({ x: 220, y: -140 });
    const after = (cy.getElementById(figureId(1)) as cytoscape.NodeSingular).position();
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

/* -------------------------------------------------------------------- stats */

describe("computeStats", () => {
  it("counts allies, rivals and neutral edges", () => {
    const s = computeStats(fixture());
    expect(s.nodes).toBe(4);
    expect(s.edges).toBe(4);
    expect(s.allies).toBe(2); // +80, +70
    expect(s.rivals).toBe(2); // -80, -70
    expect(s.neutral).toBe(0);
  });

  it("counts distinct blocs and ignores figures with none", () => {
    const data = fixture();
    // Null BOTH members of Blok A. Nulling only one would leave the bloc
    // populated by the other member and the count would rightly stay at 2.
    data.nodes[0]!.bloc = null;
    data.nodes[1]!.bloc = null;
    expect(computeStats(data).blocs).toBe(1);
  });

  it("does not count null blocs as a bloc of their own", () => {
    const data = fixture();
    for (const node of data.nodes) node.bloc = null;
    expect(computeStats(data).blocs).toBe(0);
  });

  it("handles an empty graph without dividing by zero", () => {
    const s = computeStats({ nodes: [], edges: [], counts: { nodes: 0, edges: 0 } });
    expect(s).toEqual({ nodes: 0, edges: 0, blocs: 0, allies: 0, rivals: 0, neutral: 0 });
  });
});
/* ---------------------------------------------------------- label tiers */

describe("labelledNodeIds", () => {
  const nodes = [
    { id: 1, influence: 98 },
    { id: 2, influence: 90 },
    { id: 3, influence: 55 },
    { id: 4, influence: 12 },
  ];

  it("labels everything once zoomed in past the threshold", () => {
    const ids = labelledNodeIds(nodes, LABEL_ZOOM_THRESHOLD);
    expect(ids.size).toBe(4);
  });

  it("labels only the most influential when zoomed out", () => {
    const ids = labelledNodeIds(nodes, 0.4);
    expect([...ids].sort()).toEqual([1, 2]);
  });

  it("uses >= for the influence cut-off, not >", () => {
    // A figure exactly on the boundary must be labelled; an off-by-one here
    // silently drops the most prominent names.
    expect(labelledNodeIds([{ id: 9, influence: LABEL_PRIORITY_INFLUENCE }], 0.4).has(9)).toBe(true);
  });

  it("always labels the selected figure, even when zoomed out and low-influence", () => {
    expect(labelledNodeIds(nodes, 0.4, 4).has(4)).toBe(true);
  });

  it("ignores a null selection", () => {
    expect(labelledNodeIds(nodes, 0.4, null).size).toBe(2);
  });

  it("returns an empty set for an empty graph", () => {
    expect(labelledNodeIds([], 0.4).size).toBe(0);
    expect(labelledNodeIds([], 2).size).toBe(0);
  });

  it("labels everything at exactly the threshold", () => {
    // The boundary belongs to the "zoomed in" branch, so a reader at the
    // threshold is not punished with a mostly-anonymous map.
    expect(labelledNodeIds(nodes, LABEL_ZOOM_THRESHOLD).size).toBe(4);
    expect(labelledNodeIds(nodes, LABEL_ZOOM_THRESHOLD - 0.001).size).toBe(2);
  });
});

/* ------------------------------------------------------------ determinism */

describe("layout is deterministic", () => {
  it("produces identical positions on repeated runs", () => {
    // randomize:true was measured to give 5 distinct layouts in 5 runs, which
    // means two readers comparing screenshots see different maps and the
    // label threshold becomes a coin flip.
    const a = layoutOf(fixture());
    const b = layoutOf(fixture());
    for (const node of a.nodes().filter((n) => !(n as cytoscape.NodeSingular).isParent())) {
      const id = node.id();
      const pa = (node as cytoscape.NodeSingular).position();
      const pb = (b.getElementById(id) as cytoscape.NodeSingular).position();
      expect(pa.x).toBeCloseTo(pb.x, 6);
      expect(pa.y).toBeCloseTo(pb.y, 6);
    }
  });

  it("keeps nodes from stacking on top of each other", () => {
    // Reducing nodeRepulsion to make the graph fit a smaller area was measured
    // to collapse the minimum pair distance to 0.2 world units. This guards
    // against re-introducing that.
    const cy = layoutOf(fixture());
    const pos = cy
      .nodes()
      .filter((n) => !(n as cytoscape.NodeSingular).isParent())
      .map((n) => (n as cytoscape.NodeSingular).position());
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        min = Math.min(min, Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y));
      }
    }
    expect(min).toBeGreaterThan(10);
  });
});
