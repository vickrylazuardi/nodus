/**
 * Lazy boundary for the relationship map.
 *
 * Cytoscape plus fCoSE is roughly 134 KB gzipped, which is larger than the rest
 * of this application combined. Importing it eagerly would make every visitor
 * download the graph engine, including the ones who never open the map. So the
 * implementation is behind `React.lazy` and only the `/peta` route pays for it.
 *
 * If you are tempted to import `CytoscapeGraph` directly from a page, don't:
 * the build will fold it into the main chunk and this comment exists because
 * that is an easy mistake to make and an invisible one.
 *
 * The fallback names what is loading rather than showing a bare spinner
 * (antislop R-27).
 */

import { Suspense, lazy } from "react";

import type { GraphData, GraphNode } from "@/lib/types";

const CytoscapeGraph = lazy(() => import("./graph/CytoscapeGraph"));

interface Props {
  data: GraphData;
  onSelect?: (node: GraphNode) => void;
  selectedId?: number | null;
  showLabels?: boolean;
}

export function RelationshipGraph(props: Props) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          className="grid h-[min(72vh,760px)] w-full place-items-center rounded-md border border-rule bg-neutral-raised"
        >
          <p className="text-[13px] text-ink-soft">Memuat mesin peta relasi…</p>
        </div>
      }
    >
      <CytoscapeGraph {...props} />
    </Suspense>
  );
}
