// Pure wire-topology helpers — collinearity, dedupe, path equality,
// junction-dot computation, and the "add a new wire and re-junction"
// composition used during routing. Previously lived at module scope inside
// Editor.tsx; pulled out so the editor file shrinks and these become unit-
// testable in isolation.

import {
  normalizeTuple,
  pointOnPolylineBody,
  pointOnSegment,
  samePoint,
  sameTuple,
} from "./geometry.ts";
import { nodePos, type SchematicPage } from "./graphModel.ts";
import {
  insertWireEndpointJunctions,
  normalizeWireListPreservingJunctions,
  wirePathCoveredByWires,
  type PolylineWire,
} from "./wireTopology.ts";

// Most helpers here are pure polyline geometry (`{id, points}` in/out); only
// `buildWireJunctionDots` reads the graph page (for node degree). See
// wireTopology.ts for the polyline-vs-graph wire split.
type Wire = PolylineWire;

export function addWireWithJunctions<T extends { wires: Wire[] }>(page: T, wire: Wire): T {
  const existingWires = normalizeWireList(page.wires);
  const compactedWire = compactWirePoints(wire.points);
  if (compactedWire.length < 2) return page;
  if (existingWires.some((existing) => sameWirePath(existing.points, compactedWire))) {
    return { ...page, wires: existingWires };
  }

  const endpoints = [compactedWire[0], compactedWire[compactedWire.length - 1]];
  const nextWires = insertWireEndpointJunctions(existingWires, endpoints);
  if (wirePathCoveredByWires(compactedWire, nextWires)) {
    return { ...page, wires: nextWires };
  }

  return { ...page, wires: [...nextWires, { ...wire, points: compactedWire }] };
}

export function normalizeWireList(wires: Wire[]): Wire[] {
  return normalizeWireListPreservingJunctions(wires);
}

export function splitWiresAtPoint(wires: Wire[], point: [number, number]): Wire[] {
  return insertWireEndpointJunctions(wires, [point]);
}

export function compactWirePoints(points: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const point of points.map(normalizeTuple)) {
    const last = deduped[deduped.length - 1];
    if (!last || !sameTuple(last, point)) deduped.push(point);
  }
  if (deduped.length <= 2) return deduped;
  const compacted: [number, number][] = [];
  for (const point of deduped) {
    compacted.push(point);
    while (compacted.length >= 3) {
      const a = compacted[compacted.length - 3];
      const b = compacted[compacted.length - 2];
      const c = compacted[compacted.length - 1];
      if (!sameLineAndDirection(a, b, c)) break;
      compacted.splice(compacted.length - 2, 1);
    }
  }
  return compacted;
}

export function sameLineAndDirection(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return dot >= -1e-6;
}

export function sameWirePath(a: [number, number][], b: [number, number][]): boolean {
  const aa = compactWirePoints(a);
  const bb = compactWirePoints(b);
  if (aa.length !== bb.length) return false;
  const sameForward = aa.every((point, idx) => sameTuple(point, bb[idx]));
  if (sameForward) return true;
  return aa.every((point, idx) => sameTuple(point, bb[bb.length - 1 - idx]));
}

export function pointTouchesWireInterior(point: { x: number; y: number }, wires: Wire[]): boolean {
  return wires.some((wire) => pointOnPolylineBody(point, wire.points));
}

export function pointTouchesWirePath(point: { x: number; y: number }, wire: Wire): boolean {
  if (wire.points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const [x1, y1] = wire.points[i];
    const [x2, y2] = wire.points[i + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}

/** Junction dots: a solder dot at every graph node where three or more wire
 *  edges meet (degree ≥ 3). Model C makes connectivity explicit, so a junction
 *  is just a high-degree node — no geometric coincidence scan. This matches the
 *  legacy coincidence-degree rule on clean docs: a node where two edges meet
 *  (a bend-junction / pass-through) is degree 2 (no dot), an interior bend of a
 *  single edge is not a node at all, and a real branch/T is degree ≥ 3.
 *  Considers both standalone nodes (junctions / free ends) and component
 *  pin-nodes (a pin where 3+ wires land is also a junction). */
export function buildWireJunctionDots(page: SchematicPage): { x: number; y: number }[] {
  const degree = new Map<string, number>();
  for (const wire of page.wires) {
    degree.set(wire.a, (degree.get(wire.a) ?? 0) + 1);
    degree.set(wire.b, (degree.get(wire.b) ?? 0) + 1);
  }
  const dots: { x: number; y: number }[] = [];
  for (const [nodeId, deg] of degree) {
    if (deg < 3) continue;
    const pos = nodePos(page, nodeId);
    if (pos) dots.push({ x: pos.x, y: pos.y });
  }
  return dots;
}
