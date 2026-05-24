// Inline oscilloscope window rendered on the schematic at a probe location.
// Drawing lives in cell units (same scaled SVG group as the schematic). All
// *text* renders via foreignObject + HTML so it stays crisp at any zoom.

import { useId } from "react";
import { scopeReadoutValue, shouldUseLogScopeX } from "./miniScopeMath";

interface Props {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  /** Independent-axis samples (time or frequency). Empty if no data. */
  scale: number[];
  /** Dependent samples — same length as scale. */
  trace: number[];
  /** Current playhead position on the scale; null = no cursor. */
  playTime?: number | null;
  /** Empty-state message shown when the scope has no trace data. */
  emptyMessage?: string;
}

const CELL_PX = 20; // matches CELL in Editor (the scale factor at zoom=1)

export function MiniScope({
  x,
  y,
  width,
  height,
  color,
  label,
  scale,
  trace,
  playTime,
  emptyMessage = "press Run",
}: Props) {
  const clipId = useId().replace(/:/g, "");
  const strokeW = 0.06;
  const inset = 0.25;
  const innerW = width - 2 * inset;
  const innerH = height - 2 * inset;

  // ---- Empty state -------------------------------------------------------
  if (trace.length === 0) {
    return (
      <g className="mini-scope" transform={`translate(${x} ${y})`}>
        <ScopeFrame width={width} height={height} stroke={strokeW} />
        <HtmlOverlay
          x={0}
          y={height / 2 - 0.4}
          w={width}
          h={0.8}
          align="center"
          style={{ color: "var(--ink-muted)", fontSize: "11px" }}
        >
          {emptyMessage}
        </HtmlOverlay>
        {label && <ScopeLabel width={width} color={color} text={label} />}
      </g>
    );
  }

  // ---- Single-point (OP) -------------------------------------------------
  if (trace.length === 1 || scale.length <= 1) {
    const v = trace[0];
    const yMid = inset + innerH / 2;
    return (
      <g className="mini-scope" transform={`translate(${x} ${y})`}>
        <ScopeFrame width={width} height={height} stroke={strokeW} />
        <line
          x1={inset}
          y1={yMid}
          x2={width - inset}
          y2={yMid}
          stroke={color}
          strokeWidth={0.09}
          strokeLinecap="round"
        />
        <HtmlOverlay
          x={0}
          y={yMid - 0.7}
          w={width}
          h={0.6}
          align="center"
          style={{
            color,
            fontSize: "12px",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            fontWeight: 600,
          }}
        >
          {formatSI(v, "V")}
        </HtmlOverlay>
        {label && <ScopeLabel width={width} color={color} text={label} />}
      </g>
    );
  }

  // ---- Time / freq trace -------------------------------------------------
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of trace) {
    if (Number.isFinite(v)) {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -1;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const xMin = scale[0];
  const xMax = scale[scale.length - 1];
  const logX = shouldUseLogScopeX(scale);
  const mapX = (sx: number) =>
    logX
      ? inset +
        ((Math.log10(Math.max(sx, Number.MIN_VALUE)) - Math.log10(xMin)) /
          (Math.log10(xMax) - Math.log10(xMin))) *
          innerW
      : inset + ((sx - xMin) / (xMax - xMin)) * innerW;
  const mapY = (sy: number) =>
    inset + (1 - (sy - yMin) / (yMax - yMin)) * innerH;

  let d = "";
  for (let i = 0; i < trace.length; i++) {
    if (!Number.isFinite(trace[i])) continue;
    d += `${i === 0 ? "M" : "L"}${mapX(scale[i]).toFixed(3)} ${mapY(trace[i]).toFixed(3)} `;
  }

  let cursorPx: number | null = null;
  if (playTime != null) {
    const t = Math.min(xMax, Math.max(xMin, playTime));
    cursorPx = mapX(t);
  }

  const showZero = yMin < 0 && yMax > 0;
  const readout = scopeReadoutValue(scale, trace, playTime);
  const readoutText = readout === null ? null : formatSI(readout, "V");

  return (
    <g className="mini-scope" transform={`translate(${x} ${y})`}>
      <ScopeFrame width={width} height={height} stroke={strokeW} />
      <defs>
        <clipPath id={`${clipId}-plot`}>
          <rect
            x={inset}
            y={inset}
            width={innerW}
            height={innerH}
            rx={0.12}
            ry={0.12}
          />
        </clipPath>
      </defs>
      {showZero && (
        <line
          x1={inset}
          y1={mapY(0)}
          x2={width - inset}
          y2={mapY(0)}
          stroke="var(--ink-muted)"
          strokeWidth={0.04}
          opacity={0.5}
          clipPath={`url(#${clipId}-plot)`}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={0.065}
        strokeLinejoin="round"
        strokeLinecap="round"
        clipPath={`url(#${clipId}-plot)`}
      />
      {cursorPx !== null && (
        <line
          x1={cursorPx}
          y1={inset}
          x2={cursorPx}
          y2={height - inset}
          stroke={color}
          strokeWidth={0.06}
          strokeDasharray="0.18 0.12"
          opacity={0.7}
          clipPath={`url(#${clipId}-plot)`}
        />
      )}
      {readoutText && (
        <ScopeReadout width={width} height={height} text={readoutText} />
      )}
      {label && <ScopeLabel width={width} color={color} text={label} />}
    </g>
  );
}

function ScopeFrame({
  width,
  height,
  stroke,
}: {
  width: number;
  height: number;
  stroke: number;
}) {
  // Two-layer fill: pure-white opaque base prevents whatever component sits
  // behind from bleeding through (the opamp body was visible through us at
  // 0.96 over the translucent --bg-window). On top, a faint accent tint and
  // colored border for the "scope screen" look.
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={0.2}
        ry={0.2}
        fill="var(--bg-canvas)"
      />
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        rx={0.2}
        ry={0.2}
        fill="var(--bg-window)"
        fillOpacity={0.74}
        stroke="var(--hairline-strong)"
        strokeOpacity={0.72}
        strokeWidth={stroke}
      />
    </g>
  );
}

function ScopeReadout({
  width,
  height,
  text,
}: {
  width: number;
  height: number;
  text: string;
}) {
  const w = Math.min(width - 0.52, Math.max(1.32, text.length * 0.25 + 0.36));
  const x = width - w - 0.22;
  const y = height - 0.58;
  return (
    <g className="mini-scope-readout" pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={w}
        height={0.38}
        rx={0.12}
        fill="var(--bg-canvas)"
        fillOpacity={0.96}
        stroke="var(--hairline-strong)"
        strokeOpacity={0.75}
        strokeWidth={0.035}
      />
      <HtmlOverlay
        x={x + 0.1}
        y={y + 0.02}
        w={w - 0.2}
        h={0.34}
        align="right"
        style={{
          color: "var(--ink-muted)",
          fontSize: "7px",
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          fontWeight: 650,
        }}
      >
        {text}
      </HtmlOverlay>
    </g>
  );
}

function ScopeLabel({
  width,
  color,
  text,
}: {
  width: number;
  color: string;
  text: string;
}) {
  const w = Math.min(width - 0.5, Math.max(1.6, text.length * 0.42 + 0.5));
  return (
    <g transform={`translate(${width / 2 - w / 2} ${-0.85})`}>
      <rect x={0} y={0} width={w} height={0.7} rx={0.18} fill={color} />
      <HtmlOverlay
        x={0}
        y={0}
        w={w}
        h={0.7}
        align="center"
        style={{
          color: "white",
          fontSize: "10px",
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          fontWeight: 600,
        }}
      >
        {text}
      </HtmlOverlay>
    </g>
  );
}

// foreignObject + HTML span: lets the browser render text using normal HTML
// layout/kerning so it stays crisp at any SVG zoom level.
function HtmlOverlay({
  x,
  y,
  w,
  h,
  align,
  style,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  align: "left" | "center" | "right";
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <foreignObject x={x} y={y} width={w} height={h} style={{ overflow: "hidden" }}>
      <div
        // @ts-expect-error xmlns attribute needed for foreignObject HTML namespace
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
          // The parent group is scaled CELL_PX × user-zoom; HTML inside
          // foreignObject ignores SVG scale so text renders at its declared px.
          transform: `scale(${1 / CELL_PX})`,
          transformOrigin: "0 0",
          width: `${w * CELL_PX}px`,
          height: `${h * CELL_PX}px`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1,
          ...style,
        }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

function formatSI(v: number, unit: string): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a < 1e-12) return `0 ${unit}`;
  const exp = Math.floor(Math.log10(a) / 3) * 3;
  const suff: Record<number, string> = {
    [-15]: "f",
    [-12]: "p",
    [-9]: "n",
    [-6]: "µ",
    [-3]: "m",
    [0]: "",
    [3]: "k",
    [6]: "M",
    [9]: "G",
  };
  const s = suff[exp];
  if (s === undefined) return `${v.toExponential(2)} ${unit}`;
  const scaled = v / Math.pow(10, exp);
  const fixed = Math.abs(scaled) < 10 ? scaled.toFixed(2) : scaled.toFixed(1);
  return `${fixed}${s ? " " + s : " "}${unit}`;
}
