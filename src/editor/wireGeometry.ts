// Pure wire-topology helpers — collinearity, dedupe, path equality,
// junction-dot computation, and the "add a new wire and re-junction"
// composition used during routing. Previously lived at module scope inside
// Editor.tsx; pulled out so the editor file shrinks and these become unit-
// testable in isolation.

import type { LegacySchematicPage as SchematicPage, LegacyWire as Wire } from "./legacyModel.ts";
import {
  normalizeTuple,
  pointOnPolylineBody,
  pointOnSegment,
  samePoint,
  sameTuple,
} from "./geometry.ts";
import { coordKey } from "./netlist.ts";
import {
  insertWireEndpointJunctions,
  normalizeWireListPreservingJunctions,
  wirePathCoveredByWires,
} from "./wireTopology.ts";

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

export function buildWireJunctionDots(page: SchematicPage): { x: number; y: number }[] {
  const counts = new Map<string, { x: number; y: number; degree: number }>();
  const add = (x: number, y: number, degree = 1) => {
    const key = `${coordKey(x)},${coordKey(y)}`;
    const current = counts.get(key);
    if (current) current.degree += degree;
    else counts.set(key, { x, y, degree });
  };

  for (const wire of page.wires) {
    for (let idx = 0; idx < wire.points.length - 1; idx++) {
      const endpoints = [wire.points[idx], wire.points[idx + 1]];
      for (const [x, y] of endpoints) {
        add(x, y);
      }
    }
  }

  for (const candidate of wireEndpointPositions(page.wires)) {
    for (const wire of page.wires) {
      for (let idx = 0; idx < wire.points.length - 1; idx++) {
        const a = wire.points[idx];
        const b = wire.points[idx + 1];
        if (sameTuple(candidate, a) || sameTuple(candidate, b)) continue;
        if (pointOnSegment(candidate[0], candidate[1], a[0], a[1], b[0], b[1])) {
          add(candidate[0], candidate[1], 2);
        }
      }
    }
  }

  return [...counts.values()]
    .filter((point) => point.degree >= 3)
    .map(({ x, y }) => ({ x, y }));
}

export function wireEndpointPositions(wires: Wire[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const wire of wires) {
    for (const [x, y] of wire.points) {
      const key = `${coordKey(x)},${coordKey(y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([x, y]);
    }
  }
  return out;
}
