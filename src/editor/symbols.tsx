// SVG symbol primitives. All paths are drawn in "cell" units; the parent
// <g> applies a `scale(cellPx)` so the editor controls grid pitch.

import type { ComponentKind } from "./model";

interface Props {
  kind: ComponentKind;
  selected?: boolean;
  strokeWidth?: number;
  /** SUBX-only: actual pin positions resolved from getPinLayout(component). */
  subxPins?: { x: number; y: number }[];
  /** SUBX-only: subcircuit name to render in the body label. */
  subxLabel?: string;
}

const SW = 0.12; // line width in cell units

export function ComponentGlyph({ kind, selected, strokeWidth = SW, subxPins, subxLabel }: Props) {
  const stroke = selected ? "var(--accent)" : "var(--ink)";
  const common = {
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "R":
      return (
        <g {...common}>
          <line x1={-2} y1={0} x2={-1} y2={0} />
          <polyline
            points={[
              [-1, 0],
              [-0.83, -0.45],
              [-0.5, 0.45],
              [-0.17, -0.45],
              [0.17, 0.45],
              [0.5, -0.45],
              [0.83, 0.45],
              [1, 0],
            ]
              .map((p) => p.join(","))
              .join(" ")}
          />
          <line x1={1} y1={0} x2={2} y2={0} />
        </g>
      );
    case "V":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-0.9} />
          <line x1={0} y1={0.9} x2={0} y2={2} />
          <circle cx={0} cy={0} r={0.9} />
          <line x1={-0.22} y1={-0.45} x2={0.22} y2={-0.45} />
          <line x1={0} y1={-0.67} x2={0} y2={-0.23} />
          <line x1={-0.22} y1={0.45} x2={0.22} y2={0.45} />
        </g>
      );
    case "B":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-0.9} />
          <line x1={0} y1={0.9} x2={0} y2={2} />
          <circle cx={0} cy={0} r={0.9} />
          <text x={0} y={0.24} textAnchor="middle" fontSize={0.72} fill={stroke} stroke="none">
            f
          </text>
        </g>
      );
    case "I":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-0.9} />
          <line x1={0} y1={0.9} x2={0} y2={2} />
          <circle cx={0} cy={0} r={0.9} />
          {/* Arrow inside pointing down (current flows from + at top to - at bottom internally) */}
          <line x1={0} y1={-0.5} x2={0} y2={0.4} />
          <polyline points="-0.22,0.15 0,0.5 0.22,0.15" />
        </g>
      );
    case "C":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-0.35} />
          <line x1={-0.9} y1={-0.35} x2={0.9} y2={-0.35} />
          <line x1={-0.9} y1={0.35} x2={0.9} y2={0.35} />
          <line x1={0} y1={0.35} x2={0} y2={2} />
        </g>
      );
    case "L":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-1.4} />
          {/* Three half-circle humps */}
          <path
            d={`
              M 0 -1.4
              A 0.45 0.45 0 0 1 0 -0.5
              A 0.45 0.45 0 0 1 0 0.4
              A 0.45 0.45 0 0 1 0 1.3
            `}
          />
          <line x1={0} y1={1.3} x2={0} y2={2} />
        </g>
      );
    case "D":
      return (
        <g {...common}>
          <line x1={0} y1={-2} x2={0} y2={-0.7} />
          {/* Anode triangle (pointing toward cathode bar) */}
          <polygon
            points="-0.6,-0.7 0.6,-0.7 0,0.4"
            fill={stroke}
            stroke={stroke}
          />
          <line x1={-0.65} y1={0.4} x2={0.65} y2={0.4} />
          <line x1={0} y1={0.4} x2={0} y2={2} />
        </g>
      );
    case "GND":
      return (
        <g {...common}>
          <line x1={0} y1={0} x2={0} y2={0.5} />
          <line x1={-0.8} y1={0.5} x2={0.8} y2={0.5} />
          <line x1={-0.5} y1={0.8} x2={0.5} y2={0.8} />
          <line x1={-0.2} y1={1.1} x2={0.2} y2={1.1} />
        </g>
      );
    case "NPN":
    case "PNP": {
      const npn = kind === "NPN";
      return (
        <g {...common}>
          <circle cx={0} cy={0} r={1} />
          {/* Base lead */}
          <line x1={-2} y1={0} x2={-0.7} y2={0} />
          {/* Base bar inside */}
          <line x1={-0.7} y1={-0.6} x2={-0.7} y2={0.6} />
          {/* Collector to base */}
          <line x1={0} y1={-2} x2={0} y2={-0.85} />
          <line x1={0} y1={-0.85} x2={-0.7} y2={-0.3} />
          {/* Emitter to base */}
          <line x1={0} y1={2} x2={0} y2={0.85} />
          <line x1={0} y1={0.85} x2={-0.7} y2={0.3} />
          {/* Emitter arrow */}
          {npn ? (
            <polygon
              points="-0.1,0.55 0.1,0.55 0,0.85"
              fill={stroke}
              stroke={stroke}
            />
          ) : (
            <polygon
              points="-0.58,0.25 -0.38,0.55 -0.7,0.4"
              fill={stroke}
              stroke={stroke}
            />
          )}
        </g>
      );
    }
    case "OPAMP":
      return (
        <g {...common}>
          {/* Triangle body pointing right */}
          <polygon points="-3,-2.4 -3,2.4 3,0" fill={"var(--bg-canvas)"} />
          {/* Input leads */}
          <line x1={-3} y1={-1} x2={-2.2} y2={-1} />
          <line x1={-3} y1={1} x2={-2.2} y2={1} />
          {/* + and - labels inside */}
          <text x={-1.9} y={-0.6} fontSize={0.7} fill={stroke} stroke="none">+</text>
          <text x={-1.9} y={1.3} fontSize={0.7} fill={stroke} stroke="none">−</text>
          {/* Output lead */}
          <line x1={3} y1={0} x2={3.4} y2={0} />
        </g>
      );
    case "LABEL":
      return (
        <g {...common}>
          {/* Small pennant / triangle pointing right with a horizontal stem */}
          <polyline points="0,0 0.8,0 1.2,-0.4 2.4,-0.4 2.4,0.4 1.2,0.4 0.8,0" />
        </g>
      );
    case "SUBX":
      return (
        <SubxGlyph
          pins={subxPins ?? [
            { x: -3, y: -1 },
            { x: -3, y: 1 },
            { x: 3, y: -1 },
            { x: 3, y: 1 },
          ]}
          label={subxLabel}
          selected={selected}
        />
      );
    case "NMOS":
    case "PMOS": {
      const n = kind === "NMOS";
      return (
        <g {...common}>
          {/* Gate lead */}
          <line x1={-2} y1={0} x2={-0.8} y2={0} />
          {/* Gate bar (slightly offset from channel) */}
          <line x1={-0.7} y1={-0.6} x2={-0.7} y2={0.6} />
          {/* Channel bar */}
          <line x1={-0.4} y1={-0.7} x2={-0.4} y2={0.7} />
          {/* Drain branch */}
          <line x1={0} y1={-2} x2={0} y2={-0.6} />
          <line x1={0} y1={-0.6} x2={-0.4} y2={-0.6} />
          {/* Source branch */}
          <line x1={0} y1={2} x2={0} y2={0.6} />
          <line x1={0} y1={0.6} x2={-0.4} y2={0.6} />
          {/* Body arrow (on source side; toward channel for N, away for P) */}
          {n ? (
            <polygon
              points="-0.4,0.45 -0.4,0.75 -0.15,0.6"
              fill={stroke}
              stroke={stroke}
            />
          ) : (
            <polygon
              points="-0.15,0.45 -0.15,0.75 -0.4,0.6"
              fill={stroke}
              stroke={stroke}
            />
          )}
        </g>
      );
    }
  }
}

// X-instance (subcircuit) — rounded rect with the subckt name centered.
// Pin count comes from the component's params at render time, so we render
// dots based on a passed pin list. Default = 4 pins.
export function SubxGlyph({
  pins,
  label,
  selected,
  strokeWidth = SW,
}: {
  pins: { x: number; y: number }[];
  label?: string;
  selected?: boolean;
  strokeWidth?: number;
}) {
  const stroke = selected ? "var(--accent)" : "var(--ink)";
  return (
    <g>
      <rect
        x={-2.4}
        y={Math.min(...pins.map((p) => p.y)) - 0.6}
        width={4.8}
        height={Math.max(...pins.map((p) => p.y)) - Math.min(...pins.map((p) => p.y)) + 1.2}
        rx={0.4}
        ry={0.4}
        fill="var(--bg-canvas)"
        fillOpacity={0.9}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {/* Short leads from each pin into the body. */}
      {pins.map((p, i) => (
        <line
          key={i}
          x1={p.x}
          y1={p.y}
          x2={p.x < 0 ? -2.4 : 2.4}
          y2={p.y}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ))}
      {label && (
        <text
          x={0}
          y={0.2}
          fontSize={0.6}
          fill={stroke}
          textAnchor="middle"
          style={{ fontFamily: "ui-monospace, SF Mono, Menlo, monospace", fontWeight: 600 }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// Compact glyph for the palette (no rotation, small viewBox).
export function PaletteGlyph({ kind }: { kind: ComponentKind }) {
  if (kind === "SUBX") {
    return (
      <svg viewBox="-3.5 -2 7 4" width="42" height="28">
        <SubxGlyph
          pins={[
            { x: -3, y: -1 },
            { x: -3, y: 1 },
            { x: 3, y: -1 },
            { x: 3, y: 1 },
          ]}
          label="X"
          strokeWidth={0.24}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="-3 -3 6 6" width="36" height="36">
      <ComponentGlyph kind={kind} strokeWidth={0.22} />
    </svg>
  );
}
