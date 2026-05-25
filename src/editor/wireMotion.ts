import {
  normalizePoint,
  pointOnPolylineBody,
  pointOnSegment,
  samePoint,
  sameTuple,
} from "./geometry.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import type { CircuitComponent, Probe, Wire } from "./model.ts";
import { routeWireSegment } from "./placement.ts";
import { dedupeWirePointsPreservingJunctions } from "./wireTopology.ts";

export interface PointMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function wireEndpointMoveTargets(
  points: [number, number][],
  moves: PointMove[],
): Map<number, [number, number]> {
  const targets = new Map<number, [number, number]>();
  points.forEach(([x, y], idx) => {
    if (pointOnPolylineBody({ x, y }, points)) return;
    const move = moves.find(({ from }) => samePoint(from, { x, y }));
    if (move) targets.set(idx, [move.to.x, move.to.y]);
  });
  return targets;
}

export function wireConnectsMovedPins(
  points: [number, number][],
  moves: PointMove[],
): boolean {
  if (points.length < 2 || moves.length < 2) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (samePoint({ x: first[0], y: first[1] }, { x: last[0], y: last[1] })) return false;
  return [first, last].every((point) =>
    moves.some(({ to }) => samePoint(to, { x: point[0], y: point[1] })),
  );
}

export function moveWirePointsToTargets(
  points: [number, number][],
  targets: Map<number, [number, number]>,
  orthogonal: boolean,
): [number, number][] {
  if (points.length === 2 && targets.size === 1) {
    const [idx, moved] = [...targets.entries()][0];
    const fixedIdx = idx === 0 ? 1 : 0;
    const fixed = points[fixedIdx];
    const routed = routeWireSegment(
      { x: fixed[0], y: fixed[1] },
      { x: moved[0], y: moved[1] },
      orthogonal,
    );
    return idx === 0 ? routed.toReversed() : routed;
  }

  const next = points.map(([x, y]) => [x, y] as [number, number]);
  for (const [idx, moved] of targets) {
    const [x, y] = points[idx];
    next[idx] = moved;
    const neighborIdx = idx === 0 ? 1 : idx === points.length - 1 ? points.length - 2 : -1;
    if (neighborIdx >= 0 && !targets.has(neighborIdx)) {
      const [nx, ny] = points[neighborIdx];
      if (orthogonal && Math.abs(x - nx) < 1e-6) next[neighborIdx] = [moved[0], ny];
      else if (orthogonal && Math.abs(y - ny) < 1e-6) next[neighborIdx] = [nx, moved[1]];
    }
  }
  return dedupeWirePointsPreservingJunctions(next);
}

export function probeShouldMoveWithSelectedPin(
  probe: Pick<Probe, "x" | "y">,
  selectedPinPositions: { x: number; y: number }[],
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
): boolean {
  if (!selectedPinPositions.some((pin) => samePoint(pin, probe))) return false;
  if (stationaryPinAtPoint(probe, components, selected)) return false;
  if (stationaryWireBodyAtPoint(probe, wires, selected)) return false;
  return true;
}

export function moveProbesWithPinMoves(
  probes: Probe[],
  moves: PointMove[],
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
): Probe[] {
  if (moves.length === 0) return probes;
  const selectedPinPositions = moves.map(({ from }) => from);
  return probes.map((probe) => {
    if (!probeShouldMoveWithSelectedPin(probe, selectedPinPositions, components, wires, selected)) {
      return probe;
    }
    const move = moves.find(({ from }) => samePoint(from, probe));
    return move ? { ...probe, x: move.to.x, y: move.to.y } : probe;
  });
}

export function moveUnmovedProbesWithChangedWirePaths(
  currentProbes: Probe[],
  originalProbes: Probe[],
  beforeWires: Wire[],
  afterWires: Wire[],
): Probe[] {
  const originalById = new Map(originalProbes.map((probe) => [probe.id, probe]));
  const changedWires = beforeWires
    .map((before) => ({ before, after: afterWires.find((wire) => wire.id === before.id) }))
    .filter(
      (entry): entry is { before: Wire; after: Wire } =>
        Boolean(entry.after) && !sameWirePoints(entry.before.points, entry.after!.points),
    );

  if (changedWires.length === 0) return currentProbes;

  return currentProbes.map((probe) => {
    const original = originalById.get(probe.id);
    if (!original) return probe;
    if (!samePoint(probe, original)) return probe;

    for (const { before, after } of changedWires) {
      const moved = movePointBetweenWirePaths(original, before.points, after.points);
      if (moved) return { ...probe, x: moved.x, y: moved.y };
    }

    return probe;
  });
}

function stationaryPinAtPoint(
  point: { x: number; y: number },
  components: CircuitComponent[],
  selected: Set<string>,
): boolean {
  for (const component of components) {
    if (selected.has(component.id)) continue;
    for (let idx = 0; idx < getPinLayout(component).length; idx++) {
      if (samePoint(pinWorldPos(component, idx), point)) return true;
    }
  }
  return false;
}

function stationaryWireBodyAtPoint(
  point: { x: number; y: number },
  wires: Wire[],
  selected: Set<string>,
): boolean {
  return wires.some((wire) => !selected.has(wire.id) && pointOnPolylineBody(point, wire.points));
}

export function movePointBetweenWirePaths(
  point: { x: number; y: number },
  before: [number, number][],
  after: [number, number][],
): { x: number; y: number } | null {
  const location = wirePathLocation(point, before);
  if (!location) return null;
  const total = wirePathLength(before);
  if (total <= 0) return null;
  return pointAtWirePathDistance(after, location.distance / total);
}

function wirePathLocation(
  point: { x: number; y: number },
  points: [number, number][],
): { distance: number } | null {
  let travelled = 0;
  for (let idx = 0; idx < points.length - 1; idx++) {
    const start = points[idx];
    const end = points[idx + 1];
    const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (pointOnSegment(point.x, point.y, start[0], start[1], end[0], end[1])) {
      return {
        distance: travelled + Math.hypot(point.x - start[0], point.y - start[1]),
      };
    }
    travelled += segmentLength;
  }
  return null;
}

function pointAtWirePathDistance(
  points: [number, number][],
  fraction: number,
): { x: number; y: number } | null {
  const total = wirePathLength(points);
  if (total <= 0) return null;
  let remaining = total * Math.max(0, Math.min(1, fraction));
  for (let idx = 0; idx < points.length - 1; idx++) {
    const start = points[idx];
    const end = points[idx + 1];
    const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (segmentLength <= 0) continue;
    if (remaining <= segmentLength || idx === points.length - 2) {
      const t = remaining / segmentLength;
      return normalizePoint({
        x: start[0] + (end[0] - start[0]) * t,
        y: start[1] + (end[1] - start[1]) * t,
      });
    }
    remaining -= segmentLength;
  }
  const last = points[points.length - 1];
  return last ? { x: last[0], y: last[1] } : null;
}

function wirePathLength(points: [number, number][]): number {
  let total = 0;
  for (let idx = 0; idx < points.length - 1; idx++) {
    total += Math.hypot(
      points[idx + 1][0] - points[idx][0],
      points[idx + 1][1] - points[idx][1],
    );
  }
  return total;
}

function sameWirePoints(a: [number, number][], b: [number, number][]): boolean {
  return a.length === b.length && a.every((point, idx) => sameTuple(point, b[idx]));
}
