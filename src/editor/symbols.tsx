// SVG symbol primitives. All paths are drawn in "cell" units; the parent
// <g> applies a `scale(cellPx)` so the editor controls grid pitch.

import type { ComponentKind } from "./model";

interface Props {
  kind: ComponentKind;
  selected?: boolean;
  strokeWidth?: number;
  palette?: boolean;
  mirrored?: boolean;
  /** SUBX-only: actual pin positions resolved from getPinLayout(component). */
  subxPins?: { x: number; y: number }[];
  /** SUBX-only: subcircuit name to render in the body label. */
  subxLabel?: string;
}

const SW = 0.12; // line width in cell units

export function ComponentGlyph({ kind, selected, strokeWidth = SW, palette = false, mirrored = false, subxPins, subxLabel }: Props) {
  const stroke = selected ? "var(--accent)" : "var(--ink)";
  const lead = palette ? 1.45 : 2;
  const sourceRadius = palette ? 1.08 : 0.9;
  const passiveLead = palette ? 1.55 : 2;
  const transistorLead = palette ? 1.55 : 2;
  const common = {
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const commonWithTransform = {
    ...common,
    transform: mirrored ? "scale(-1 1)" : undefined,
  };
  switch (kind) {
    case "R":
      return (
        <g {...commonWithTransform}>
          <line x1={-passiveLead} y1={0} x2={-1} y2={0} />
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
          <line x1={1} y1={0} x2={passiveLead} y2={0} />
        </g>
      );
    case "V":
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={-lead} x2={0} y2={-sourceRadius} />
          <line x1={0} y1={sourceRadius} x2={0} y2={lead} />
          <circle cx={0} cy={0} r={sourceRadius} />
          <line x1={-0.22} y1={-0.45} x2={0.22} y2={-0.45} />
          <line x1={0} y1={-0.67} x2={0} y2={-0.23} />
          <line x1={-0.22} y1={0.45} x2={0.22} y2={0.45} />
        </g>
      );
    case "B":
      return (
        <g>
          <g {...commonWithTransform}>
            <line x1={0} y1={-lead} x2={0} y2={-sourceRadius} />
            <line x1={0} y1={sourceRadius} x2={0} y2={lead} />
            <circle cx={0} cy={0} r={sourceRadius} />
          </g>
          <text x={0} y={0.24} textAnchor="middle" fontSize={0.72} fill={stroke} stroke="none">
            f
          </text>
        </g>
      );
    case "I":
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={-lead} x2={0} y2={-sourceRadius} />
          <line x1={0} y1={sourceRadius} x2={0} y2={lead} />
          <circle cx={0} cy={0} r={sourceRadius} />
          {/* Arrow inside pointing down (current flows from + at top to - at bottom internally) */}
          <line x1={0} y1={-0.5} x2={0} y2={0.4} />
          <polyline points="-0.22,0.15 0,0.5 0.22,0.15" />
        </g>
      );
    case "C":
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={-passiveLead} x2={0} y2={-0.35} />
          <line x1={-0.9} y1={-0.35} x2={0.9} y2={-0.35} />
          <line x1={-0.9} y1={0.35} x2={0.9} y2={0.35} />
          <line x1={0} y1={0.35} x2={0} y2={passiveLead} />
        </g>
      );
    case "L":
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={-passiveLead} x2={0} y2={-1.4} />
          {/* Three half-circle humps */}
          <path
            d={`
              M 0 -1.4
              A 0.45 0.45 0 0 1 0 -0.5
              A 0.45 0.45 0 0 1 0 0.4
              A 0.45 0.45 0 0 1 0 1.3
            `}
          />
          <line x1={0} y1={1.3} x2={0} y2={passiveLead} />
        </g>
      );
    case "D":
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={-passiveLead} x2={0} y2={-0.7} />
          {/* Anode triangle (pointing toward cathode bar) */}
          <polygon
            points="-0.6,-0.7 0.6,-0.7 0,0.4"
            fill={stroke}
            stroke={stroke}
          />
          <line x1={-0.65} y1={0.4} x2={0.65} y2={0.4} />
          <line x1={0} y1={0.4} x2={0} y2={passiveLead} />
        </g>
      );
    case "GND": {
      const dy = palette ? -0.55 : 0;
      return (
        <g {...commonWithTransform}>
          <line x1={0} y1={dy + 0} x2={0} y2={dy + 0.5} />
          <line x1={-0.8} y1={dy + 0.5} x2={0.8} y2={dy + 0.5} />
          <line x1={-0.5} y1={dy + 0.8} x2={0.5} y2={dy + 0.8} />
          <line x1={-0.2} y1={dy + 1.1} x2={0.2} y2={dy + 1.1} />
        </g>
      );
    }
    case "NPN":
    case "PNP": {
      const npn = kind === "NPN";
      return (
        <g {...commonWithTransform}>
          <circle cx={0} cy={0} r={1} />
          {/* Base lead */}
          <line x1={-transistorLead} y1={0} x2={-0.7} y2={0} />
          {/* Base bar inside */}
          <line x1={-0.7} y1={-0.6} x2={-0.7} y2={0.6} />
          {/* Collector to base */}
          <line x1={0} y1={-transistorLead} x2={0} y2={-0.85} />
          <line x1={0} y1={-0.85} x2={-0.7} y2={-0.3} />
          {/* Emitter to base */}
          <line x1={0} y1={transistorLead} x2={0} y2={0.85} />
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
        <g>
          <g {...commonWithTransform}>
            {/* Triangle body pointing right */}
            <polygon points="-3,-2.4 -3,2.4 3,0" fill={"var(--bg-canvas)"} />
            {/* Input leads */}
            <line x1={-3} y1={-1} x2={-2.2} y2={-1} />
            <line x1={-3} y1={1} x2={-2.2} y2={1} />
            {/* Output lead */}
            <line x1={3} y1={0} x2={3.4} y2={0} />
          </g>
          {/* + and - labels inside. Keep text readable when the symbol is mirrored. */}
          <text x={mirrored ? 1.9 : -1.9} y={-0.6} fontSize={0.7} fill={stroke} stroke="none">+</text>
          <text x={mirrored ? 1.9 : -1.9} y={1.3} fontSize={0.7} fill={stroke} stroke="none">−</text>
        </g>
      );
    case "LABEL": {
      const dx = palette ? -1.2 : 0;
      return (
        <g {...commonWithTransform}>
          <polyline
            points={`${dx},0 ${dx + 0.8},0 ${dx + 1.2},-0.4 ${dx + 2.4},-0.4 ${dx + 2.4},0.4 ${dx + 1.2},0.4 ${dx + 0.8},0`}
          />
        </g>
      );
    }
    case "NOTE":
      return (
        <g {...commonWithTransform}>
          <rect x={-1.15} y={-0.9} width={2.3} height={1.8} rx={0.18} />
          <polyline points="0.58,-0.9 1.15,-0.35 0.58,-0.35 0.58,-0.9" />
          <line x1={-0.68} y1={-0.28} x2={0.32} y2={-0.28} />
          <line x1={-0.68} y1={0.12} x2={0.68} y2={0.12} />
          <line x1={-0.68} y1={0.52} x2={0.42} y2={0.52} />
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
    case "PMOS":
    case "NMOS4":
    case "PMOS4": {
      const n = kind === "NMOS" || kind === "NMOS4";
      const fourTerminal = kind === "NMOS4" || kind === "PMOS4";
      return (
        <g {...commonWithTransform}>
          {/* Gate lead */}
          <line x1={-transistorLead} y1={0} x2={-0.8} y2={0} />
          {/* Gate bar (slightly offset from channel) */}
          <line x1={-0.7} y1={-0.6} x2={-0.7} y2={0.6} />
          {/* Channel bar */}
          <line x1={-0.4} y1={-0.7} x2={-0.4} y2={0.7} />
          {/* Drain branch */}
          <line x1={0} y1={-transistorLead} x2={0} y2={-0.6} />
          <line x1={0} y1={-0.6} x2={-0.4} y2={-0.6} />
          {/* Source branch */}
          <line x1={0} y1={transistorLead} x2={0} y2={0.6} />
          <line x1={0} y1={0.6} x2={-0.4} y2={0.6} />
          {fourTerminal && (
            <>
              <line x1={2} y1={0} x2={0.2} y2={0} />
              <line x1={0.2} y1={-0.45} x2={0.2} y2={0.45} />
            </>
          )}
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
  const pinExtent = Math.max(3, ...pins.map((p) => Math.abs(p.x)));
  const bodyHalfW = Math.max(1.7, pinExtent - 0.6);
  const minY = Math.min(...pins.map((p) => p.y));
  const maxY = Math.max(...pins.map((p) => p.y));
  const bodyY = minY - 0.6;
  const bodyH = maxY - minY + 1.2;
  return (
    <g>
      <rect
        x={-bodyHalfW}
        y={bodyY}
        width={bodyHalfW * 2}
        height={bodyH}
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
          x2={p.x < 0 ? -bodyHalfW : bodyHalfW}
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
// Bounding extent of each component's palette glyph in cell units, used to
// pick a uniform viewBox and stroke width per icon so they all render at
// roughly the same visual size and line weight in the floating tool strip.
function paletteExtent(kind: ComponentKind): { w: number; h: number } {
  switch (kind) {
    case "R":
      return { w: 3.6, h: 1.5 };
    case "V":
    case "I":
    case "B":
      return { w: 2.16, h: 3.7 };
    case "C":
      return { w: 2.04, h: 3.8 };
    case "L":
      return { w: 1.16, h: 3.8 };
    case "D":
      return { w: 1.5, h: 3.8 };
    case "GND":
      return { w: 1.8, h: 1.4 };
    case "NPN":
    case "PNP":
      return { w: 3.05, h: 3.6 };
    case "NMOS":
    case "PMOS":
      return { w: 2.25, h: 3.6 };
    case "NMOS4":
    case "PMOS4":
      return { w: 2.85, h: 3.6 };
    case "OPAMP":
      return { w: 6.4, h: 4.8 };
    case "LABEL":
      return { w: 2.4, h: 0.9 };
    case "NOTE":
      return { w: 2.3, h: 1.8 };
    default:
      return { w: 3.0, h: 3.0 };
  }
}

// Target visual look of the icon inside its 36-px slot:
//  - the bigger of (w, h) fills `PALETTE_FILL` × 36 CSS pixels
//  - all icons render with the same stroke weight in CSS pixels
const PALETTE_RENDER = 36;
const PALETTE_FILL = 0.72; // ~26 px of effective symbol area inside a 36 px box
const PALETTE_STROKE_PX = 1.6;

function paletteScale(kind: ComponentKind): { viewBox: string; strokeWidth: number } {
  const { w, h } = paletteExtent(kind);
  const naturalMax = Math.max(w, h);
  const boxSize = naturalMax / PALETTE_FILL;
  const half = boxSize / 2;
  const strokeWidth = (PALETTE_STROKE_PX * boxSize) / PALETTE_RENDER;
  return { viewBox: `${-half} ${-half} ${boxSize} ${boxSize}`, strokeWidth };
}

export function PaletteGlyph({ kind }: { kind: ComponentKind }) {
  if (kind === "SUBX") {
    const boxSize = 6.4 / PALETTE_FILL;
    const stroke = (PALETTE_STROKE_PX * boxSize) / PALETTE_RENDER;
    return (
      <svg
        viewBox={`${-boxSize / 2} ${-boxSize / 4} ${boxSize} ${boxSize / 2}`}
        width={PALETTE_RENDER + 8}
        height={PALETTE_RENDER}
      >
        <SubxGlyph
          pins={[
            { x: -3, y: -1 },
            { x: -3, y: 1 },
            { x: 3, y: -1 },
            { x: 3, y: 1 },
          ]}
          label="X"
          strokeWidth={stroke}
        />
      </svg>
    );
  }
  const { viewBox, strokeWidth } = paletteScale(kind);
  return (
    <svg viewBox={viewBox} width={PALETTE_RENDER} height={PALETTE_RENDER}>
      <ComponentGlyph kind={kind} strokeWidth={strokeWidth} palette />
    </svg>
  );
}
