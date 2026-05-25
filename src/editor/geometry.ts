import { getPinLayout, type CircuitComponent, type ComponentKind, type Rotation } from "./model.ts";
import { estimateInlineMathTextWidth } from "./mathText.ts";

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type Bounds = Rect;

export function wireIntersectsRect(points: [number, number][], rect: Rect): boolean {
  if (points.some(([x, y]) => pointInRect(x, y, rect))) return true;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (segmentIntersectsRect(x1, y1, x2, y2, rect)) return true;
  }
  return false;
}

export function projectPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

export function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const projected = projectPointToSegment(px, py, x1, y1, x2, y2);
  if (!projected) return Math.hypot(px - x1, py - y1);
  return Math.hypot(px - projected.x, py - projected.y);
}

export function pointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-6;
}

export function pointOnPolylineBody(
  point: { x: number; y: number },
  points: [number, number][],
): boolean {
  if (points.length < 2) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (
    samePoint(point, { x: first[0], y: first[1] }) ||
    samePoint(point, { x: last[0], y: last[1] })
  ) {
    return false;
  }
  return points.some((candidate, idx) => {
    if (idx === points.length - 1) return false;
    const next = points[idx + 1];
    return pointOnSegment(point.x, point.y, candidate[0], candidate[1], next[0], next[1]);
  });
}

export function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

export function sameTuple(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

export function normalizeCoord(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizePoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: normalizeCoord(point.x), y: normalizeCoord(point.y) };
}

export function normalizeTuple(point: [number, number]): [number, number] {
  return [normalizeCoord(point[0]), normalizeCoord(point[1])];
}

export function componentBounds(kind: ComponentKind): { w: number; h: number } {
  switch (kind) {
    case "NOTE":
      return { w: 6.8, h: 3.2 };
    case "OPAMP":
    case "SUBX":
      return { w: 7.4, h: 5.6 };
    case "NPN":
    case "PNP":
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return { w: 4.8, h: 5.2 };
    case "GND":
    case "LABEL":
      return { w: 3.2, h: 2.4 };
    default:
      return { w: 5.0, h: 2.4 };
  }
}

export function componentBoundsFor(c: CircuitComponent, pad = 0): Bounds {
  if (c.kind === "SUBX") {
    const local = subcircuitLocalBounds(c);
    const corners = [
      transformLocalPoint(c, { x: local.x1, y: local.y1 }),
      transformLocalPoint(c, { x: local.x2, y: local.y1 }),
      transformLocalPoint(c, { x: local.x2, y: local.y2 }),
      transformLocalPoint(c, { x: local.x1, y: local.y2 }),
    ];
    const xs = corners.map((point) => c.x + point.x);
    const ys = corners.map((point) => c.y + point.y);
    return {
      x1: Math.min(...xs) - pad,
      y1: Math.min(...ys) - pad,
      x2: Math.max(...xs) + pad,
      y2: Math.max(...ys) + pad,
    };
  }
  const base = componentBounds(c.kind);
  const rotated = c.rotation === 90 || c.rotation === 270;
  const w = rotated ? base.h : base.w;
  const h = rotated ? base.w : base.h;
  return {
    x1: c.x - w / 2 - pad,
    y1: c.y - h / 2 - pad,
    x2: c.x + w / 2 + pad,
    y2: c.y + h / 2 + pad,
  };
}

export function componentVisualBoundsFor(c: CircuitComponent, pad = 0): Bounds {
  if (c.kind === "NOTE") {
    const lines = noteTextLines(c.value);
    const width = noteComponentWidth(c, lines);
    const height = noteComponentHeight(c, lines);
    return {
      x1: c.x - pad,
      y1: c.y - pad,
      x2: c.x + width + pad,
      y2: c.y + height + pad,
    };
  }
  if (c.kind === "SUBX") {
    const local = subcircuitLocalBounds(c);
    const corners = [
      transformLocalPoint(c, { x: local.x1, y: local.y1 }),
      transformLocalPoint(c, { x: local.x2, y: local.y1 }),
      transformLocalPoint(c, { x: local.x2, y: local.y2 }),
      transformLocalPoint(c, { x: local.x1, y: local.y2 }),
    ];
    const xs = corners.map((point) => c.x + point.x);
    const ys = corners.map((point) => c.y + point.y);
    return {
      x1: Math.min(...xs) - pad,
      y1: Math.min(...ys) - pad,
      x2: Math.max(...xs) + pad,
      y2: Math.max(...ys) + pad,
    };
  }
  const local = componentVisualBounds(c.kind);
  const corners = [
    transformLocalPoint(c, { x: local.x1, y: local.y1 }),
    transformLocalPoint(c, { x: local.x2, y: local.y1 }),
    transformLocalPoint(c, { x: local.x2, y: local.y2 }),
    transformLocalPoint(c, { x: local.x1, y: local.y2 }),
  ];
  const xs = corners.map((p) => c.x + p.x);
  const ys = corners.map((p) => c.y + p.y);
  return {
    x1: Math.min(...xs) - pad,
    y1: Math.min(...ys) - pad,
    x2: Math.max(...xs) + pad,
    y2: Math.max(...ys) + pad,
  };
}

function subcircuitLocalBounds(c: CircuitComponent): Bounds {
  const pins = getPinLayout(c);
  const xs = pins.map((pin) => pin.x);
  const ys = pins.map((pin) => pin.y);
  const minX = xs.length > 0 ? Math.min(...xs) : -3;
  const maxX = xs.length > 0 ? Math.max(...xs) : 3;
  const minY = ys.length > 0 ? Math.min(...ys) : -1;
  const maxY = ys.length > 0 ? Math.max(...ys) : 1;
  return {
    x1: minX - 0.2,
    y1: minY - 0.8,
    x2: maxX + 0.2,
    y2: maxY + 0.8,
  };
}

export function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

export function boundsFromPoints(xs: number[], ys: number[], pad = 0): Rect | null {
  if (xs.length === 0 || ys.length === 0) return null;
  const finiteXs = xs.filter(Number.isFinite);
  const finiteYs = ys.filter(Number.isFinite);
  if (finiteXs.length === 0 || finiteYs.length === 0) return null;
  return {
    x1: Math.min(...finiteXs) - pad,
    y1: Math.min(...finiteYs) - pad,
    x2: Math.max(...finiteXs) + pad,
    y2: Math.max(...finiteYs) + pad,
  };
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
}

function componentVisualBounds(kind: ComponentKind): Bounds {
  switch (kind) {
    case "R":
      return { x1: -2, y1: -0.62, x2: 2, y2: 0.62 };
    case "V":
    case "B":
    case "I":
      return { x1: -0.98, y1: -2, x2: 0.98, y2: 2 };
    case "C":
      return { x1: -1.02, y1: -2, x2: 1.02, y2: 2 };
    case "L":
      return { x1: -0.58, y1: -2, x2: 0.58, y2: 2 };
    case "D":
      return { x1: -0.75, y1: -2, x2: 0.75, y2: 2 };
    case "GND":
      return { x1: -0.9, y1: 0, x2: 0.9, y2: 1.15 };
    case "LABEL":
      return { x1: -0.08, y1: -0.48, x2: 2.48, y2: 0.48 };
    case "NOTE":
      return { x1: 0, y1: 0, x2: 6.8, y2: 3.2 };
    case "NPN":
    case "PNP":
      return { x1: -2, y1: -2, x2: 1.05, y2: 2 };
    case "NMOS":
    case "PMOS":
      return { x1: -2, y1: -2, x2: 0.25, y2: 2 };
    case "NMOS4":
    case "PMOS4":
      return { x1: -2, y1: -2, x2: 2, y2: 2 };
    case "OPAMP":
      return { x1: -3, y1: -2.4, x2: 3.4, y2: 2.4 };
    case "SUBX":
      return { x1: -3.2, y1: -2.4, x2: 3.2, y2: 2.4 };
  }
}

export function noteTextLines(value: string): string[] {
  const text = value.trimEnd() || "Note";
  const wrapped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) {
      wrapped.push("");
      continue;
    }
    if (lineHasMathEnvironment(line)) {
      wrapped.push(line);
      continue;
    }
    wrapped.push(...wrapNoteLine(line, NOTE_WRAP_RENDERED_WIDTH));
  }
  return wrapped.slice(0, 24);
}

export function noteWidth(lines: string[]): number {
  const widest = Math.max(7.2, ...lines.map((line) => estimateInlineMathTextWidth(line)));
  return Math.min(10, Math.max(4.8, widest * 0.44 + 1.1));
}

export function noteHeight(lines: string[]): number {
  return Math.max(1.55, lines.length * 0.45 + 0.85);
}

export function noteComponentWidth(c: CircuitComponent, lines = noteTextLines(c.value)): number {
  const raw = Number(c.params?.w);
  return Math.max(noteWidth(lines), Number.isFinite(raw) ? raw : 0);
}

export function noteComponentHeight(c: CircuitComponent, lines = noteTextLines(c.value)): number {
  const raw = Number(c.params?.h);
  return Math.max(noteHeight(lines), Number.isFinite(raw) ? raw : 0);
}

const NOTE_WRAP_RENDERED_WIDTH = 12.8;

function wrapNoteLine(line: string, maxRenderedWidth: number): string[] {
  if (estimateInlineMathTextWidth(line) <= maxRenderedWidth) return [line];
  const words = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (estimateInlineMathTextWidth(`${current} ${word}`) <= maxRenderedWidth) {
      current = `${current} ${word}`;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out.flatMap((part) => hardWrapNotePart(part, maxRenderedWidth));
}

function lineHasMathEnvironment(line: string): boolean {
  return /\\begin\{[A-Za-z*]+\}/.test(line) && /\\end\{[A-Za-z*]+\}/.test(line);
}

function hardWrapNotePart(part: string, maxRenderedWidth: number): string[] {
  if (estimateInlineMathTextWidth(part) <= maxRenderedWidth || looksLikeInlineMathToken(part)) {
    return [part];
  }
  const out: string[] = [];
  let current = "";
  for (const char of Array.from(part)) {
    const candidate = `${current}${char}`;
    if (current && estimateInlineMathTextWidth(candidate) > maxRenderedWidth) {
      out.push(current);
      current = char;
      continue;
    }
    current = candidate;
  }
  if (current) out.push(current);
  return out;
}

function looksLikeInlineMathToken(part: string): boolean {
  return /\\|[_^{}]/.test(part);
}

function rotateLocalPoint(point: { x: number; y: number }, rotation: Rotation): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: -point.y, y: point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: point.y, y: -point.x };
  }
}

function transformLocalPoint(c: CircuitComponent, point: { x: number; y: number }): { x: number; y: number } {
  const mirrored = c.mirrored ? { x: -point.x, y: point.y } : point;
  return rotateLocalPoint(mirrored, c.rotation);
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
): boolean {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;

  const left = rect.x1;
  const right = rect.x2;
  const top = rect.y1;
  const bottom = rect.y2;
  return (
    segmentsIntersect(x1, y1, x2, y2, left, top, right, top) ||
    segmentsIntersect(x1, y1, x2, y2, right, top, right, bottom) ||
    segmentsIntersect(x1, y1, x2, y2, right, bottom, left, bottom) ||
    segmentsIntersect(x1, y1, x2, y2, left, bottom, left, top)
  );
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(ax, ay, cx, cy, bx, by)) return true;
  if (o2 === 0 && onSegment(ax, ay, dx, dy, bx, by)) return true;
  if (o3 === 0 && onSegment(cx, cy, ax, ay, dx, dy)) return true;
  if (o4 === 0 && onSegment(cx, cy, bx, by, dx, dy)) return true;
  return false;
}

function orientation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): -1 | 0 | 1 {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  return (
    bx >= Math.min(ax, cx) - 1e-9 &&
    bx <= Math.max(ax, cx) + 1e-9 &&
    by >= Math.min(ay, cy) - 1e-9 &&
    by <= Math.max(ay, cy) + 1e-9
  );
}
