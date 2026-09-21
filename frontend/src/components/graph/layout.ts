/**
 * Graph construction and layout configuration.
 *
 * Kept free of React and of the DOM so the layout maths is unit-testable
 * headless. `RelationshipGraph.tsx` mounts Cytoscape and renders; everything
 * that decides *where things go* lives here.
 *
 * Two constraints learned by measurement, both easy to get wrong:
 *
 * 1. `styleEnabled` MUST be true whenever compound parents are used. Without
 *    it the parents have no computed bounding box, the layout's grid maths
 *    receives NaN, and fCoSE throws `RangeError: Invalid array length`. It
 *    reads as a library bug but is a config mistake.
 * 2. To pin a node, move it FIRST and lock it second. Locking first pins the
 *    old position and the move is silently ignored.
 */

import type { GraphData, GraphEdge, GraphNode } from "@/lib/types";

/** fCoSE wants a numeric ideal edge length; this is the neutral baseline. */
const BASE_EDGE_LENGTH = 86;

/**
 * Allied pairs pull close, rivals push apart. This is the political meaning of
 * the map, not a layout preference: a reader should see coalition structure in
 * the geometry itself. Measured effect on the real dataset: allied pairs
 * average ~181 units apart, rivals ~293.
 */
export function idealEdgeLength(score: number): number {
  return score >= 0
    ? BASE_EDGE_LENGTH - score * 0.22
    : BASE_EDGE_LENGTH + Math.abs(score) * 0.24;
}

export interface CyElement {
  data: Record<string, unknown>;
}

export interface BuildOptions {
  /** Group figures into compound bloc nodes. */
  compound?: boolean;
}

/**
 * Map the API payload onto Cytoscape elements.
 *
 * Colours are deliberately absent: they arrive per-node and per-edge from the
 * API, and are applied in the stylesheet. Inventing a palette here would put
 * the map out of step with the rest of the ledger.
 */
export function buildElements(data: GraphData, options: BuildOptions = {}): CyElement[] {
  const { compound = true } = options;

  const blocs = compound
    ? Array.from(new Set(data.nodes.map((n) => n.bloc).filter(Boolean) as string[])).sort()
    : [];

  const parents: CyElement[] = blocs.map((bloc) => ({
    data: { id: blocId(bloc), label: bloc, isBloc: true },
  }));

  const nodes: CyElement[] = data.nodes.map((node: GraphNode) => ({
    data: {
      id: figureId(node.id),
      label: node.label,
      fullName: node.full_name ?? node.label,
      role: node.role ?? "",
      party: node.party ?? "",
      bloc: node.bloc ?? "",
      influence: node.influence,
      degree: node.degree,
      color: node.tier.color,
      tierKey: node.tier.key,
      tierLabel: node.tier.label,
      // Cytoscape treats `parent` as membership; omit it entirely when there
      // is no bloc rather than passing undefined, which some versions read as
      // a literal parent id.
      ...(compound && node.bloc ? { parent: blocId(node.bloc) } : {}),
    },
  }));

  const edges: CyElement[] = data.edges.map((edge: GraphEdge) => ({
    data: {
      id: `e${edge.id}`,
      source: figureId(edge.from),
      target: figureId(edge.to),
      score: edge.score,
      label: edge.label,
      relType: edge.rel_type,
      color: edge.style.color,
      width: edge.style.width,
      dashed: edge.style.dashes,
      opacity: edge.style.opacity,
      title: edge.title,
      topIssue: edge.top_issue ?? "",
    },
  }));

  return [...parents, ...nodes, ...edges];
}

export function figureId(id: number): string {
  return `f${id}`;
}

export function blocId(bloc: string): string {
  return `bloc:${bloc}`;
}

/**
 * Verified fCoSE configuration. `numIter` is capped because the layout is
 * computed once on mount and again only on explicit request; 2500 settles the
 * real 58-node graph in roughly 85 ms.
 */
export function fcoseOptions() {
  return {
    name: "fcose",
    quality: "default" as const,
    animate: false,
    randomize: false,
    numIter: 2500,
    nodeRepulsion: 4500,
    idealEdgeLength: (edge: { data: (key: string) => unknown }) =>
      idealEdgeLength(Number(edge.data("score") ?? 0)),
    // Bloc grouping needs room between clusters, or compound bounds overlap
    // and the visual grouping is unreadable.
    nestingFactor: 0.1,
    packComponents: true,
  };
}

/**
 * Label visibility is tiered, because it cannot be binary.
 *
 * Measured: the map fits the viewport at roughly k=0.5, where 58 labels cannot
 * be placed in the available pixels without overlapping. Suppressing all of
 * them leaves the map anonymous; showing all of them is unreadable noise.
 *
 * So at low zoom only the most influential figures are named, which is a
 * deliberate prioritisation rather than a failure. Every name is reachable by
 * hovering, and all of them appear once zoomed in.
 */
export const LABEL_ZOOM_THRESHOLD = 0.55;

/** At or above this influence, a figure is labelled even when zoomed out. */
export const LABEL_PRIORITY_INFLUENCE = 90;

/**
 * Which figures get a label at a given zoom.
 *
 * Pure so it can be tested without a canvas. Returns a Set of node ids.
 * - zoomed in past the threshold: every figure
 * - zoomed out: only the most influential, plus any explicitly selected
 * Hovering always reveals a name regardless, so nothing is unreachable.
 */
export function labelledNodeIds(
  nodes: Array<{ id: number; influence: number }>,
  zoom: number,
  selectedId?: number | null,
): Set<number> {
  if (zoom >= LABEL_ZOOM_THRESHOLD) return new Set(nodes.map((n) => n.id));
  const ids = new Set(nodes.filter((n) => n.influence >= LABEL_PRIORITY_INFLUENCE).map((n) => n.id));
  if (selectedId != null) ids.add(selectedId);
  return ids;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  blocs: number;
  allies: number;
  rivals: number;
  neutral: number;
}

/** Counts used for the live region, so the same numbers appear everywhere. */
export function computeStats(data: GraphData): GraphStats {
  let allies = 0;
  let rivals = 0;
  let neutral = 0;
  for (const edge of data.edges) {
    if (edge.score >= 30) allies++;
    else if (edge.score <= -30) rivals++;
    else neutral++;
  }
  return {
    nodes: data.nodes.length,
    edges: data.edges.length,
    blocs: new Set(data.nodes.map((n) => n.bloc).filter(Boolean)).size,
    allies,
    rivals,
    neutral,
  };
}