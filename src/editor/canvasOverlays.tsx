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
