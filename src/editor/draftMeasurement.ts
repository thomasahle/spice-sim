export type Point = { x: number; y: number };

export interface DraftMeasurement {
  label: string;
  x: number;
  y: number;
  width: number;
}

export function dragDeltaMeasurement(
  start: Point,
  current: Point,
): DraftMeasurement | null {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (Math.hypot(dx, dy) < 0.05) return null;
  const label = `Δ ${formatSignedGridUnits(dx)}, ${formatSignedGridUnits(dy)}`;
  return {
    label,
    x: current.x,
    y: current.y - 0.7,
    width: Math.max(1.9, label.length * 0.25 + 0.5),
  };
}

export function draftMeasurement(points: Point[]): DraftMeasurement | null {
  if (points.length < 2) return null;
  const segments = consecutiveSegments(points);
  const length = segments.reduce((sum, [a, b]) => sum + distance(a, b), 0);
  if (length < 0.05) return null;

  const [a, b] = segments[segments.length - 1];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  const label = `${formatGridUnits(length)} · ${angle}°`;
  return {
    label,
    x: mid.x,
    y: mid.y - 0.55,
    width: Math.max(1.7, label.length * 0.25 + 0.5),
  };
}

function consecutiveSegments(points: Point[]): [Point, Point][] {
  const segments: [Point, Point][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (distance(a, b) >= 0.01) segments.push([a, b]);
  }
  return segments;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function formatGridUnits(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return `${Math.round(rounded)}u`;
  return `${rounded.toFixed(1)}u`;
}

function formatSignedGridUnits(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const abs = Math.abs(rounded);
  const text = Math.abs(abs - Math.round(abs)) < 1e-9 ? `${Math.round(abs)}` : abs.toFixed(1);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "±";
  return `${sign}${text}u`;
}
