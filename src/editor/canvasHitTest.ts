import {
  componentVisualBoundsFor,
  normalizePoint,
  pointOnSegment,
  pointToSegmentDist,
  projectPointToSegment,
} from "./geometry.ts";
import type { CircuitComponent, Probe, SchematicPage, Wire } from "./model.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";

export interface ConnectionTarget {
  x: number;
  y: number;
  wireId?: string;
  segmentIdx?: number;
}

export interface ConnectionSnapOptions {
  includeSegments?: boolean;
  excludeWireId?: string;
  pinRadius?: number;
  wirePointRadius?: number;
  segmentRadius?: number;
}

export type CanvasSelectable =
  | { kind: "component"; item: CircuitComponent }
  | { kind: "probe"; item: Probe }
  | { kind: "wire"; item: Wire };

type HitCandidate = CanvasSelectable & {
  priority: number;
  distance: number;
  z: number;
};

export function nearestConnectionTarget(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.7,
  opts: ConnectionSnapOptions & {
    snapPoint?: (point: { x: number; y: number }) => { x: number; y: number };
  } = {},
): ConnectionTarget | null {
  let best: ConnectionTarget | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  const pinRadius = opts.pinRadius ?? radius;
  const wirePointRadius = opts.wirePointRadius ?? radius;
  const segmentRadius = opts.segmentRadius ?? radius;
  for (const c of page.components) {
    const layout = getPinLayout(c);
    for (let i = 0; i < layout.length; i++) {
      const p = pinWorldPos(c, i);
      const d = Math.hypot(p.x - gx, p.y - gy);
      if (d <= pinRadius && d < bestD) {
        bestD = d;
        best = { x: p.x, y: p.y };
      }
    }
  }
  for (const w of page.wires) {
    if (w.id === opts.excludeWireId) continue;
    for (let idx = 0; idx < w.points.length; idx++) {
      const p = w.points[idx];
      const d = Math.hypot(p[0] - gx, p[1] - gy);
      if (d <= wirePointRadius && d < bestD) {
        bestD = d;
        best = { x: p[0], y: p[1] };
      }
    }
    if (!opts.includeSegments) continue;
    for (let idx = 0; idx < w.points.length - 1; idx++) {
      const [x1, y1] = w.points[idx];
      const [x2, y2] = w.points[idx + 1];
      const projected = projectPointToSegment(gx, gy, x1, y1, x2, y2);
      if (!projected) continue;
      const d = Math.hypot(projected.x - gx, projected.y - gy);
      if (d <= segmentRadius && d < bestD) {
        bestD = d;
        const point = segmentSnapPoint(projected, [x1, y1], [x2, y2], opts.snapPoint);
        best = {
          x: point.x,
          y: point.y,
          wireId: w.id,
          segmentIdx: idx,
        };
      }
    }
  }
  return best;
}

function segmentSnapPoint(
  projected: { x: number; y: number },
  start: [number, number],
  end: [number, number],
  snapPoint?: (point: { x: number; y: number }) => { x: number; y: number },
): { x: number; y: number } {
  const normalized = normalizePoint(projected);
  if (!snapPoint) return normalized;

  const snapped = snapPoint(projected);
  if (pointOnSegment(snapped.x, snapped.y, start[0], start[1], end[0], end[1])) return snapped;

  const [x1, y1] = start;
  const [x2, y2] = end;
  if (Math.abs(y1 - y2) < 1e-6) {
    const alongX = normalizePoint({ x: snapped.x, y: normalized.y });
    if (pointOnSegment(alongX.x, alongX.y, x1, y1, x2, y2)) return alongX;
  }
  if (Math.abs(x1 - x2) < 1e-6) {
    const alongY = normalizePoint({ x: normalized.x, y: snapped.y });
    if (pointOnSegment(alongY.x, alongY.y, x1, y1, x2, y2)) return alongY;
  }

  return normalized;
}

export function hitWireVertexAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.45,
): { wireId: string; idx: number } | null {
  for (let i = page.wires.length - 1; i >= 0; i--) {
    const w = page.wires[i];
    for (let j = 0; j < w.points.length; j++) {
      const [px, py] = w.points[j];
      if (Math.hypot(px - gx, py - gy) < radius) {
        return { wireId: w.id, idx: j };
      }
    }
  }
  return null;
}

export function wireVertexDragHitAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.45,
  opts: { handleVisible?: boolean } = {},
): { wireId: string; idx: number } | null {
  if (!opts.handleVisible) return null;
  if (hitProbeAt(page, gx, gy, 0.36)) return null;
  return hitWireVertexAt(page, gx, gy, radius);
}

export function hitComponentAt(
  page: SchematicPage,
  gx: number,
  gy: number,
): CircuitComponent | null {
  for (let i = page.components.length - 1; i >= 0; i--) {
    const c = page.components[i];
    const bounds = componentVisualBoundsFor(c, 0.2);
    if (gx >= bounds.x1 && gx <= bounds.x2 && gy >= bounds.y1 && gy <= bounds.y2) return c;
  }
  return null;
}

export function hitComponentCore(c: CircuitComponent, gx: number, gy: number): boolean {
  const bounds = componentVisualBoundsFor(c, 0);
  const inset = Math.min(0.55, Math.max(0.18, Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1) * 0.18));
  return (
    gx >= bounds.x1 + inset &&
    gx <= bounds.x2 - inset &&
    gy >= bounds.y1 + inset &&
    gy <= bounds.y2 - inset
  );
}

export function hitProbeAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.5,
): Probe | null {
  for (let i = page.probes.length - 1; i >= 0; i--) {
    const p = page.probes[i];
    const dx = gx - p.x;
    const dy = gy - p.y;
    if (dx * dx + dy * dy <= radius * radius) return p;
  }
  return null;
}

export function hitWireAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.3,
): Wire | null {
  for (let i = page.wires.length - 1; i >= 0; i--) {
    const w = page.wires[i];
    for (let j = 0; j < w.points.length - 1; j++) {
      const [x1, y1] = w.points[j];
      const [x2, y2] = w.points[j + 1];
      if (pointToSegmentDist(gx, gy, x1, y1, x2, y2) < radius) return w;
    }
  }
  return null;
}

export function hitWireBodyAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  radius = 0.3,
): Wire | null {
  for (let i = page.wires.length - 1; i >= 0; i--) {
    const w = page.wires[i];
    for (let j = 0; j < w.points.length - 1; j++) {
      const [x1, y1] = w.points[j];
      const [x2, y2] = w.points[j + 1];
      const projected = projectPointToSegment(gx, gy, x1, y1, x2, y2);
      if (!projected) continue;
      const d = Math.hypot(projected.x - gx, projected.y - gy);
      if (d >= radius) continue;
      const first = w.points[0];
      const last = w.points[w.points.length - 1];
      if (
        Math.hypot(projected.x - first[0], projected.y - first[1]) < 1e-6 ||
        Math.hypot(projected.x - last[0], projected.y - last[1]) < 1e-6
      ) {
        continue;
      }
      return w;
    }
  }
  return null;
}

export function selectableHitAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  targetWireId: string | null = null,
): CanvasSelectable | null {
  const candidates: HitCandidate[] = [];
  const componentHit = hitComponentAt(page, gx, gy);
  const directProbeHit = hitProbeAt(page, gx, gy, 0.36);
  const probeHit = directProbeHit ?? hitProbeAt(page, gx, gy);

  if (directProbeHit) {
    candidates.push({ kind: "probe", item: directProbeHit, priority: 100, distance: 0, z: page.probes.indexOf(directProbeHit) });
  }
  if (componentHit && hitComponentCore(componentHit, gx, gy)) {
    candidates.push({
      kind: "component",
      item: componentHit,
      priority: 90,
      distance: 0,
      z: page.components.indexOf(componentHit),
    });
  }
  if (probeHit && probeHit !== directProbeHit) {
    candidates.push({ kind: "probe", item: probeHit, priority: 80, distance: 0, z: page.probes.indexOf(probeHit) });
  }
  const wireBodyHit = hitWireBodyAt(page, gx, gy);
  if (wireBodyHit) {
    candidates.push({
      kind: "wire",
      item: wireBodyHit,
      priority: 75,
      distance: 0,
      z: page.wires.indexOf(wireBodyHit),
    });
  }
  if (componentHit) {
    candidates.push({
      kind: "component",
      item: componentHit,
      priority: 70,
      distance: 0,
      z: page.components.indexOf(componentHit),
    });
  }
  const targetWire = targetWireId ? page.wires.find((w) => w.id === targetWireId) ?? null : null;
  if (targetWire) {
    candidates.push({ kind: "wire", item: targetWire, priority: 60, distance: 0, z: page.wires.indexOf(targetWire) });
  }
  const wireHit = hitWireAt(page, gx, gy);
  if (wireHit) {
    candidates.push({ kind: "wire", item: wireHit, priority: 50, distance: 0, z: page.wires.indexOf(wireHit) });
  }

  candidates.sort((a, b) => b.priority - a.priority || a.distance - b.distance || b.z - a.z);
  const winner = candidates[0];
  return winner ? { kind: winner.kind, item: winner.item } as CanvasSelectable : null;
}

export function selectableItemAt(
  page: SchematicPage,
  gx: number,
  gy: number,
  targetWireId: string | null = null,
): CircuitComponent | Wire | Probe | null {
  return selectableHitAt(page, gx, gy, targetWireId)?.item ?? null;
}
