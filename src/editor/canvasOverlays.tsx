// Small SVG overlay layers that sit on top of the schematic canvas:
// floating-pin warning markers, net-label near-miss guides, the
// selection-bounds frame around a multi-selection, and the marquee
// rectangle while a drag-select is in progress. Each is a pure-JSX
// presenter pulled out of Editor.tsx so the canvas <svg> body shrinks
// and these become independently testable.

import type { FloatingPinDiagnostic } from "./netlist.ts";
import type { NetLabelNearMiss } from "./netLabelConnections.ts";

export interface FloatingPinMarker extends FloatingPinDiagnostic {
  position: { x: number; y: number };
}

export function FloatingPinMarkers({ markers }: { markers: FloatingPinMarker[] }) {
  return (
    <>
      {markers.map(({ componentId, pinIdx, pinLabel, refdes, node, position }) => (
        <g
          key={`${componentId}-${pinIdx}-${node}`}
          className="floating-pin-marker"
          pointerEvents="none"
        >
          <title>{`${refdes} ${pinLabel ? `${pinLabel} pin` : `pin ${pinIdx + 1}`} is floating (${node})`}</title>
          <circle cx={position.x} cy={position.y} r={0.42} className="floating-pin-ring" />
          <circle cx={position.x} cy={position.y} r={0.16} className="floating-pin-dot" />
          <text x={position.x + 0.34} y={position.y - 0.34} className="floating-pin-text">
            !
          </text>
        </g>
      ))}
    </>
  );
}

export function NetLabelNearMissMarkers({ nearMisses }: { nearMisses: NetLabelNearMiss[] }) {
  return (
    <>
      {nearMisses.map((nearMiss) => (
        <g key={nearMiss.labelId} className="net-label-near-miss-marker" pointerEvents="none">
          <title>{`Net label "${nearMiss.label}" is close to a connection point but not attached`}</title>
          <line
            x1={nearMiss.anchor.x}
            y1={nearMiss.anchor.y}
            x2={nearMiss.target.position.x}
            y2={nearMiss.target.position.y}
            className="near-miss-guide"
          />
          <circle
            cx={nearMiss.target.position.x}
            cy={nearMiss.target.position.y}
            r={0.28}
            className="near-miss-target"
          />
        </g>
      ))}
    </>
  );
}

export function SelectionBoundsOverlay({
  bounds,
}: {
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
}) {
  if (!bounds) return null;
  return (
    <g className="group-selection-frame" pointerEvents="none">
      <rect
        x={bounds.x1}
        y={bounds.y1}
        width={bounds.x2 - bounds.x1}
        height={bounds.y2 - bounds.y1}
        rx={0.24}
      />
    </g>
  );
}

export interface MarqueeRect {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

export function MarqueeOverlay({ marquee }: { marquee: MarqueeRect | null }) {
  if (!marquee) return null;
  // Don't flash a box for a plain click (press+release without a real drag) —
  // only render once the rubber-band has actually been dragged out.
  if (Math.abs(marquee.ex - marquee.sx) < 0.2 && Math.abs(marquee.ey - marquee.sy) < 0.2) {
    return null;
  }
  return (
    <rect
      x={Math.min(marquee.sx, marquee.ex) - 0.2}
      y={Math.min(marquee.sy, marquee.ey) - 0.2}
      width={Math.abs(marquee.ex - marquee.sx) + 0.4}
      height={Math.abs(marquee.ey - marquee.sy) + 0.4}
      fill="var(--accent)"
      fillOpacity={0.08}
      stroke="var(--accent)"
      strokeWidth={0.05}
      strokeDasharray="0.3 0.2"
    />
  );
}

export interface AlignmentGuide {
  axis: "x" | "y";
  /** The aligned coordinate (x for a vertical guide, y for horizontal). */
  at: number;
  /** Span of the guide along the other axis (covers both aligned objects). */
  from: number;
  to: number;
}

/** Figma-style smart guides: while a drag is live, mark stationary components
 *  whose centre lines up with a moving component's centre. Display only. */
export function AlignmentGuidesOverlay({ guides }: { guides: AlignmentGuide[] }) {
  if (guides.length === 0) return null;
  return (
    <g className="alignment-guides" pointerEvents="none">
      {guides.map((guide, i) =>
        guide.axis === "x" ? (
          <line
            key={`gx${i}`}
            x1={guide.at}
            x2={guide.at}
            y1={guide.from}
            y2={guide.to}
            className="alignment-guide"
          />
        ) : (
          <line
            key={`gy${i}`}
            x1={guide.from}
            x2={guide.to}
            y1={guide.at}
            y2={guide.at}
            className="alignment-guide"
          />
        ),
      )}
    </g>
  );
}

/** Pure guide computation: moving components (initial + delta) vs stationary
 *  component centres. Exact-after-snap matches only (tolerance covers float
 *  noise, not "nearly aligned"). */
export function computeAlignmentGuides(
  components: { id: string; x: number; y: number }[],
  movingInitial: Map<string, { x: number; y: number }>,
  delta: { x: number; y: number },
  tolerance = 0.05,
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];
  const stationary = components.filter((c) => !movingInitial.has(c.id));
  if (stationary.length === 0) return guides;
  for (const c of components) {
    const init = movingInitial.get(c.id);
    if (!init) continue;
    const mx = init.x + delta.x;
    const my = init.y + delta.y;
    let bestX: { s: { x: number; y: number }; d: number } | null = null;
    let bestY: { s: { x: number; y: number }; d: number } | null = null;
    for (const s of stationary) {
      if (Math.abs(s.x - mx) < tolerance) {
        const d = Math.abs(s.y - my);
        if (!bestX || d < bestX.d) bestX = { s, d };
      }
      if (Math.abs(s.y - my) < tolerance) {
        const d = Math.abs(s.x - mx);
        if (!bestY || d < bestY.d) bestY = { s, d };
      }
    }
    if (bestX && bestX.d > tolerance) {
      guides.push({
        axis: "x",
        at: mx,
        from: Math.min(my, bestX.s.y),
        to: Math.max(my, bestX.s.y),
      });
    }
    if (bestY && bestY.d > tolerance) {
      guides.push({
        axis: "y",
        at: my,
        from: Math.min(mx, bestY.s.x),
        to: Math.max(mx, bestY.s.x),
      });
    }
  }
  return guides.slice(0, 8);
}
