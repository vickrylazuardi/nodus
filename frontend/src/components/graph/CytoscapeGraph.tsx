/**
 * Cytoscape-backed relationship map.
 *
 * This module imports cytoscape, so it is loaded lazily (see
 * `../RelationshipGraph.tsx`). Cytoscape is ~134 KB gzipped, larger than the
 * rest of the app put together; only visitors to the map route should pay for
 * it.
 *
 * Behaviour that must hold (all measured on the previous implementation, see
 * docs/revamp/07-graph-parity.md):
 *   - a dragged node stays where it was dropped, permanently
 *   - zoom anchors on the cursor, not the viewport centre
 *   - panning moves the camera and never the data
 *   - allies pull close, rivals push apart, blocs cluster
 *   - keyboard: arrows pan, +/- zoom, 0 fits
 *   - labels hide below a zoom threshold instead of overlapping into noise
 */

import { useCallback, useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

import type { GraphData, GraphNode } from "@/lib/types";
import {
  blocId,
  buildElements,
  fcoseOptions,
  figureId,
  LABEL_ZOOM_THRESHOLD,
  labelledNodeIds,
} from "./layout";

cytoscape.use(fcose);

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.25;

/** Design tokens. Mirrors DESIGN.md; see the note in theme.css. */
const PAPER = "#F7F1E4";
const INK = "#1C1814";
const RULE = "#C9B99A";

interface Props {
  data: GraphData;
  onSelect?: (node: GraphNode) => void;
  selectedId?: number | null;
  showLabels?: boolean;
}

/**
 * Stylesheet.
 *
 * Colours come from the data (`data(color)`) for anything that encodes a
 * value, and from DESIGN.md tokens for chrome. No palette is invented here.
 */
function stylesheet() {
  return [
    {
      selector: "node[isBloc]",
      style: {
        "background-color": "rgba(201, 185, 154, 0.18)",
        "background-opacity": 1,
        "border-width": 1,
        "border-style": "dashed",
        "border-color": RULE,
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": -6,
        "font-family": "Spectral, Georgia, serif",
        "font-size": 11,
        "font-weight": 600,
        color: "#7A5320",
        "text-transform": "uppercase",
        "text-wrap": "wrap",
        "text-max-width": "140px",
        "padding": 14,
        shape: "round-rectangle",
      },
    },
    {
      selector: "node[!isBloc]",
      style: {
        "background-color": "data(color)",
        "border-width": 2,
        "border-color": PAPER,
        width: "mapData(influence, 0, 100, 18, 42)",
        height: "mapData(influence, 0, 100, 18, 42)",
        label: "data(labelText)",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 5,
        "font-family": "Inter Tight, system-ui, sans-serif",
        "font-size": 10.5,
        "text-wrap": "wrap",
        "text-max-width": "96px",
        color: INK,
        "text-outline-width": 2.5,
        "text-outline-color": PAPER,
        "text-outline-opacity": 1,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3.5,
        "border-color": "#7A5320",
      },
    },
    {
      selector: "edge",
      style: {
        width: "data(width)",
        "line-color": "data(color)",
        opacity: "data(opacity)",
        "curve-style": "bezier",
        "line-style": "solid",
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "edge[dashed]",
      style: { "line-style": "dashed", "line-dash-pattern": [6, 4] },
    },
    {
      selector: ".faded",
      style: { opacity: 0.08 },
    },
    {
      selector: "node.dimmed",
      style: { opacity: 0.22, "text-opacity": 0.1 },
    },
    {
      selector: "edge.highlighted",
      style: { "z-index": 20 },
    },
  ];
}

export default function CytoscapeGraph({ data, onSelect, selectedId, showLabels = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /**
   * Which figures carry a visible name at the current zoom.
   *
   * A Cytoscape selector cannot express "influence >= 90 while zoomed out", so
   * the decision is made in code. Without it, either all 58 names render on top
   * of each other at fit zoom, or none do and the map is anonymous.
   */
  const refreshLabels = useCallback(
    (cy: cytoscape.Core, currentZoom: number, selected?: number | null) => {
      if (!showLabels) {
        cy.nodes().data("labelText", "");
        return;
      }
      const named = labelledNodeIds(data.nodes, currentZoom, selected);
      cy.nodes()
        .filter((n) => !(n as cytoscape.NodeSingular).isParent())
        .forEach((n) => {
          const id = Number(String(n.id()).slice(1));
          n.data("labelText", named.has(id) ? n.data("label") : "");
        });
    },
    [data, showLabels],
  );

  /* ------------------------------------------------------------- lifecycle */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // styleEnabled MUST be true: compound parents need computed bounds or the
    // layout's grid maths receives NaN and fCoSE throws RangeError.
    const cy = cytoscape({
      container,
      elements: buildElements(data, { compound: true }),
      style: stylesheet() as cytoscape.StylesheetStyle[],
      styleEnabled: true,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      // The layout runs once below; it must not re-run on every interaction.
      autoungrabify: false,
    });

    cyRef.current = cy;

    const layout = cy.layout(fcoseOptions() as cytoscape.LayoutOptions);
    layout.run();

    /* ---------------------------------------------------------- interaction */

    // Drag: unlock on grab so the node can be moved, lock on release so it
    // stays. Locking without unlocking first would make it immovable after the
    // first drag; unlocking without locking would let it drift back.
    cy.on("grab", "node[!isBloc]", (event) => {
      event.target.unlock();
      container.style.cursor = "grabbing";
    });

    cy.on("dragfree", "node[!isBloc]", (event) => {
      event.target.lock();
      container.style.cursor = "grab";
    });

    cy.on("tap", "node[!isBloc]", (event) => {
      const id = Number(String(event.target.id()).slice(1));
      const node = data.nodes.find((n) => n.id === id);
      if (node) onSelectRef.current?.(node);
    });

    // Hover: dim everything not adjacent, so the reader can trace one figure's
    // relationships without losing the surrounding structure.
    cy.on("mouseover", "node[!isBloc]", (event) => {
      const node = event.target;
      const neighbourhood = node.closedNeighborhood();
      cy.elements().not(neighbourhood).addClass("faded");
      cy.elements().not(neighbourhood).addClass("dimmed");
      node.connectedEdges().addClass("highlighted");
      const id = Number(String(node.id()).slice(1));
      setHovered(data.nodes.find((n) => n.id === id) ?? null);
      container.style.cursor = "grab";
    });

    cy.on("mouseout", "node[!isBloc]", () => {
      cy.elements().removeClass("faded").removeClass("dimmed").removeClass("highlighted");
      setHovered(null);
      container.style.cursor = "default";
    });

    // Pan on empty background. Cytoscape handles this natively; the handler
    // exists only to keep the cursor honest.
    cy.on("tap", (event) => {
      if (event.target === cy) setHovered(null);
    });

    const syncZoom = () => {
      const z = cy.zoom();
      setZoom(z);
      refreshLabels(cy, z);
    };
    cy.on("zoom", syncZoom);
    syncZoom();

    /* ------------------------------------------------------------ keyboard */

    const onKeyDown = (event: KeyboardEvent) => {
      const pan = 60;
      switch (event.key) {
        case "ArrowLeft":
          cy.panBy({ x: pan, y: 0 });
          break;
        case "ArrowRight":
          cy.panBy({ x: -pan, y: 0 });
          break;
        case "ArrowUp":
          cy.panBy({ x: 0, y: pan });
          break;
        case "ArrowDown":
          cy.panBy({ x: 0, y: -pan });
          break;
        case "+":
        case "=":
          zoomBy(cy, ZOOM_STEP);
          break;
        case "-":
        case "_":
          zoomBy(cy, 1 / ZOOM_STEP);
          break;
        case "0":
          fitAll(cy);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    container.addEventListener("keydown", onKeyDown);

    const onResize = () => {
      cy.resize();
      cy.fit(undefined, 40);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    /* -------------------------------------------------------- testing seam */

    // Node positions live inside Cytoscape and are painted to a canvas, so an
    // automated test has no other way to assert that a dragged node held its
    // position. Read-only; the app never reads this.
    (window as unknown as Record<string, unknown>).__prismGraph = {
      nodes: () =>
        cy
          .nodes()
          .filter((n) => !(n as cytoscape.NodeSingular).isParent())
          .map((n) => {
            const node = n as cytoscape.NodeSingular;
            const pos = node.position();
            return {
              id: Number(String(node.id()).slice(1)),
              label: String(node.data("label")),
              // "" when the label is suppressed at this zoom
              shownLabel: String(node.data("labelText") ?? ""),
              influence: Number(node.data("influence") ?? 0),
              x: Math.round(pos.x * 100) / 100,
              y: Math.round(pos.y * 100) / 100,
              locked: node.locked(),
            };
          }),
      camera: () => ({ x: cy.pan().x, y: cy.pan().y, k: cy.zoom() }),
      alpha: () => 0,
      freeze: () => {},
      blocs: () =>
        cy
          .nodes()
          .filter((n) => (n as cytoscape.NodeSingular).isParent())
          .map((n) => {
            const node = n as cytoscape.NodeSingular;
            return {
              id: node.id(),
              label: String(node.data("label")),
              children: node.children().length,
            };
          }),
    };

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
      delete (window as unknown as Record<string, unknown>).__prismGraph;
    };
    // `data` is the only true dependency; showLabels is applied via style below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /* ------------------------------------------------- labels react to state */

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedId != null) cy.getElementById(figureId(selectedId)).select();
    refreshLabels(cy, cy.zoom(), selectedId);
  }, [selectedId, refreshLabels]);

  /** Toggling the label checkbox must take effect immediately. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    refreshLabels(cy, cy.zoom(), selectedId);
  }, [showLabels, refreshLabels, selectedId]);

  /* -------------------------------------------------------------- controls */

  const zoomByExternal = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (cy) zoomBy(cy, factor);
  }, []);

  const fitExternal = useCallback(() => {
    const cy = cyRef.current;
    if (cy) fitAll(cy);
  }, []);

  const relayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unlock();
    cy.layout(fcoseOptions() as cytoscape.LayoutOptions).run();
  }, []);

  /*
   * h-11 w-11 = 44px. These are the map's only pointer targets besides the
   * nodes, and the previous implementation shipped them at 32px, which the
   * T3 touch-target sweep never caught because that test covers layout-
   * dependent checks on the other routes only. Icon-only controls still need
   * a 44px hit area to be usable with a thumb.
   */
  const controlClass =
    "grid h-11 w-11 place-items-center rounded-sm border border-rule bg-neutral-raised " +
    "text-[15px] leading-none text-ink transition-colors hover:border-primary-ink " +
    "hover:text-primary-ink focus-visible:border-primary-ink";

  const labelsHidden = zoom < LABEL_ZOOM_THRESHOLD;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label="Peta relasi antar figur politik. Gunakan tombol panah untuk menggeser, tombol plus dan minus untuk memperbesar, dan tombol nol untuk menyesuaikan tampilan. Seret titik untuk memindahkannya, seret latar untuk menggeser peta."
        className="block h-[min(72vh,760px)] w-full cursor-default rounded-md border border-rule bg-neutral-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
      />

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomByExternal(ZOOM_STEP)}
          aria-label="Perbesar"
          title="Perbesar"
        >
          +
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={() => zoomByExternal(1 / ZOOM_STEP)}
          aria-label="Perkecil"
          title="Perkecil"
        >
          −
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={fitExternal}
          aria-label="Sesuaikan tampilan"
          title="Sesuaikan tampilan (0)"
        >
          ⤢
        </button>
        <button
          type="button"
          className={controlClass}
          onClick={relayout}
          aria-label="Susun ulang tata letak"
          title="Susun ulang tata letak"
        >
          ↻
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1">
        <span className="rounded-sm border border-rule bg-neutral-raised/95 px-2 py-1 text-[11px] text-ink-soft">
          {Math.round(zoom * 100)}% · seret latar untuk menggeser, gulir untuk memperbesar
          {labelsHidden && showLabels ? " · perbesar untuk melihat nama" : ""}
        </span>
      </div>

      {hovered ? (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[280px] rounded-sm border border-rule bg-neutral-raised/95 px-3 py-2 text-[12px]">
          <strong className="font-semibold">{hovered.full_name ?? hovered.label}</strong>
          <div className="text-ink-soft">
            {hovered.role ?? "–"}
            {hovered.party ? ` · ${hovered.party}` : ""} · {hovered.degree} relasi
          </div>
          {hovered.bloc ? (
            <div className="mt-0.5 text-[11px] text-ink-soft">{hovered.bloc}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

/** Zoom about the viewport centre, keeping the camera maths in one place. */
function zoomBy(cy: cytoscape.Core, factor: number) {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cy.zoom() * factor));
  cy.zoom({ level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
}

function fitAll(cy: cytoscape.Core) {
  cy.fit(undefined, 40);
}

export { blocId };