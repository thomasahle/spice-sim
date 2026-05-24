import { normalizeTuple, pointOnSegment, sameTuple } from "./geometry.ts";
import type { Wire } from "./model.ts";

export function insertWireEndpointJunctions(
  wires: Wire[],
  endpoints: [number, number][],
): Wire[] {
  const insertions = new Map<string, Map<number, [number, number][]>>();

  for (const endpoint of endpoints.map(normalizeTuple)) {
    for (const wire of wires) {
      for (let idx = 0; idx < wire.points.length - 1; idx++) {
        const start = wire.points[idx];
        const end = wire.points[idx + 1];
        if (sameTuple(start, endpoint) || sameTuple(end, endpoint)) continue;
        if (!pointOnSegment(endpoint[0], endpoint[1], start[0], start[1], end[0], end[1])) continue;

        const wireInsertions = insertions.get(wire.id) ?? new Map<number, [number, number][]>();
        const segmentInsertions = wireInsertions.get(idx) ?? [];
        if (!segmentInsertions.some((point) => sameTuple(point, endpoint))) {
          segmentInsertions.push(endpoint);
        }
        wireInsertions.set(idx, segmentInsertions);
        insertions.set(wire.id, wireInsertions);
      }
    }
  }

  if (insertions.size === 0) return wires;

  return wires.map((wire) => {
    const wireInsertions = insertions.get(wire.id);
    if (!wireInsertions) return wire;

    const next: [number, number][] = [];
    wire.points.forEach((point, idx) => {
      next.push(point);
      const segmentInsertions = wireInsertions.get(idx);
      if (!segmentInsertions) return;
      const following = wire.points[idx + 1];
      next.push(...sortAlongSegment(point, following, segmentInsertions));
    });

    return { ...wire, points: dedupeWirePointsPreservingJunctions(next) };
  });
}

export function normalizeWireListPreservingJunctions(wires: Wire[]): Wire[] {
  const out: Wire[] = [];
  for (const wire of wires) {
    const points = dedupeWirePointsPreservingJunctions(wire.points);
    if (points.length < 2) continue;
    if (out.some((existing) => sameWirePath(existing.points, points))) continue;
    out.push({ ...wire, points });
  }
  return out;
}

export function cutWireSegmentBetweenPoints(
  wires: Wire[],
  startPoint: [number, number],
  endPoint: [number, number],
  makeWireId: () => string,
): Wire[] {
  const start = normalizeTuple(startPoint);
  const end = normalizeTuple(endPoint);
  if (sameTuple(start, end)) return wires;

  for (const wire of wires) {
    const cut = cutSingleWireBetweenPoints(wire, start, end, makeWireId);
    if (!cut) continue;
    return normalizeWireListPreservingJunctions(
      wires.flatMap((candidate) => (candidate.id === wire.id ? cut : [candidate])),
    );
  }

  return wires;
}

export function dedupeWirePointsPreservingJunctions(points: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const point of points.map(normalizeTuple)) {
    const last = deduped[deduped.length - 1];
    if (!last || !sameTuple(last, point)) deduped.push(point);
  }
  return deduped;
}

export function wirePathCoveredByWires(points: [number, number][], wires: Wire[]): boolean {
  const compacted = compactWireGeometry(points);
  if (compacted.length < 2) return true;
  for (let idx = 0; idx < compacted.length - 1; idx++) {
    if (!segmentCoveredByWires(compacted[idx], compacted[idx + 1], wires)) return false;
  }
  return true;
}

interface WirePathLocation {
  segmentIdx: number;
  t: number;
  point: [number, number];
}

function cutSingleWireBetweenPoints(
  wire: Wire,
  start: [number, number],
  end: [number, number],
  makeWireId: () => string,
): Wire[] | null {
  const startLocation = wirePathLocation(wire.points, start);
  const endLocation = wirePathLocation(wire.points, end);
  if (!startLocation || !endLocation) return null;

  const [cutStart, cutEnd] = compareWirePathLocations(startLocation, endLocation) <= 0
    ? [startLocation, endLocation]
    : [endLocation, startLocation];
  if (!cutSubpathIsStraight(wire.points, cutStart, cutEnd)) return null;

  const before = dedupeWirePointsPreservingJunctions([
    ...wire.points.slice(0, cutStart.segmentIdx + 1),
    cutStart.point,
  ]);
  const after = dedupeWirePointsPreservingJunctions([
    cutEnd.point,
    ...wire.points.slice(cutEnd.segmentIdx + 1),
  ]);
  const fragments = [before, after].filter(validWirePoints);
  if (fragments.length === 0) return [];
  return fragments.map((points, idx) => ({
    ...wire,
    id: idx === 0 ? wire.id : makeWireId(),
    points,
  }));
}

function wirePathLocation(points: [number, number][], point: [number, number]): WirePathLocation | null {
  for (let idx = 0; idx < points.length - 1; idx++) {
    const start = points[idx];
    const end = points[idx + 1];
    if (!pointOnSegment(point[0], point[1], start[0], start[1], end[0], end[1])) continue;
    return { segmentIdx: idx, t: segmentParameter(start, end, point), point };
  }
  return null;
}

function compareWirePathLocations(a: WirePathLocation, b: WirePathLocation): number {
  return a.segmentIdx - b.segmentIdx || a.t - b.t;
}

function cutSubpathIsStraight(
  points: [number, number][],
  cutStart: WirePathLocation,
  cutEnd: WirePathLocation,
): boolean {
  const subpath = dedupeWirePointsPreservingJunctions([
    cutStart.point,
    ...points.slice(cutStart.segmentIdx + 1, cutEnd.segmentIdx + 1),
    cutEnd.point,
  ]);
  if (subpath.length <= 2) return true;
  for (let idx = 1; idx < subpath.length - 1; idx++) {
    if (!pointsAreCollinear(cutStart.point, subpath[idx], cutEnd.point)) return false;
  }
  return true;
}

function segmentParameter(start: [number, number], end: [number, number], point: [number, number]): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / len2;
}

function validWirePoints(points: [number, number][]): boolean {
  return points.length >= 2 && points.some((point) => !sameTuple(point, points[0]));
}

function pointsAreCollinear(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(cross) <= 1e-9;
}

function sortAlongSegment(
  start: [number, number],
  end: [number, number],
  points: [number, number][],
): [number, number][] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return points;
  return [...points].sort((a, b) => {
    const ta = ((a[0] - start[0]) * dx + (a[1] - start[1]) * dy) / len2;
    const tb = ((b[0] - start[0]) * dx + (b[1] - start[1]) * dy) / len2;
    return ta - tb;
  });
}

function sameWirePath(a: [number, number][], b: [number, number][]): boolean {
  const aa = compactWireGeometry(a);
  const bb = compactWireGeometry(b);
  if (aa.length !== bb.length) return false;
  const sameForward = aa.every((point, idx) => sameTuple(point, bb[idx]));
  if (sameForward) return true;
  return aa.every((point, idx) => sameTuple(point, bb[bb.length - 1 - idx]));
}

function segmentCoveredByWires(start: [number, number], end: [number, number], wires: Wire[]): boolean {
  if (sameTuple(start, end)) return true;
  for (const wire of wires) {
    for (let idx = 0; idx < wire.points.length - 1; idx++) {
      const a = wire.points[idx];
      const b = wire.points[idx + 1];
      if (
        pointOnSegment(start[0], start[1], a[0], a[1], b[0], b[1]) &&
        pointOnSegment(end[0], end[1], a[0], a[1], b[0], b[1])
      ) {
        return true;
      }
    }
  }
  return false;
}

function compactWireGeometry(points: [number, number][]): [number, number][] {
  const deduped = dedupeWirePointsPreservingJunctions(points);
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

function sameLineAndDirection(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return dot >= -1e-9;
}
