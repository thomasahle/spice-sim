import { getPinLayout, pinWorldPos } from "./model.ts";
import { pointOnSegment } from "./geometry.ts";
import type { CircuitComponent, Probe, Wire } from "./model.ts";
import {
  dedupeWirePointsPreservingJunctions,
  normalizeWireListPreservingJunctions,
} from "./wireTopology.ts";

export function pruneWiresAfterComponentDelete(
  wires: Wire[],
  deletedComponents: CircuitComponent[],
  remainingComponents: CircuitComponent[],
): Wire[] {
  if (deletedComponents.length === 0 || wires.length === 0) return wires;

  const deletedPins = deletedComponents.flatMap((component) =>
    getPinLayout(component).map((_, idx) => pinWorldPos(component, idx)),
  );
  if (deletedPins.length === 0) return wires;

  const remainingPins = remainingComponents.flatMap((component) =>
    getPinLayout(component).map((_, idx) => pinWorldPos(component, idx)),
  );

  const remainingPinAnchors = remainingPins.map((pin) => [pin.x, pin.y] as [number, number]);

  return normalizeWireList(
    wires.flatMap((wire) => {
      let points = [...wire.points];
      if (points.length < 2) return [];
      const touchedDeletedPin =
        endpointTouchesDeletedPin(points[0], deletedPins) ||
        endpointTouchesDeletedPin(points[points.length - 1], deletedPins);
      let trimmedStart = false;
      let trimmedEnd = false;

      while (
        points.length >= 2 &&
        shouldTrimEndpoint(points[0], wire.id, wires, deletedPins, remainingPins)
      ) {
        trimmedStart = true;
        points = points.slice(1);
      }

      while (
        points.length >= 2 &&
        shouldTrimEndpoint(points[points.length - 1], wire.id, wires, deletedPins, remainingPins)
      ) {
        trimmedEnd = true;
        points = points.slice(0, -1);
      }

      if (touchedDeletedPin) {
        points = pruneExposedDanglingEndpoints(
          points,
          wire.id,
          wires,
          remainingPinAnchors,
          trimmedStart,
          trimmedEnd,
        );
      }

      const pruned = dedupeWirePointsPreservingJunctions(points);
      return pruned.length >= 2 ? [{ ...wire, points: pruned }] : [];
    }),
  );
}

export function pruneUnanchoredWireJunctions(
  wires: Wire[],
  components: CircuitComponent[],
  probes: Probe[],
): Wire[] {
  if (wires.length === 0) return wires;
  const anchors: [number, number][] = [
    ...components.flatMap((component) =>
      getPinLayout(component).map((_, idx) => {
        const pin = pinWorldPos(component, idx);
        return [pin.x, pin.y] as [number, number];
      }),
    ),
    ...probes.map((probe) => [probe.x, probe.y] as [number, number]),
  ];

  return normalizeWireList(
    wires.flatMap((wire) => {
      const points = dedupeWirePointsPreservingJunctions(wire.points);
      if (points.length < 2) return [];
      if (points.length < 3) return [{ ...wire, points }];
      const pruned = points.filter((point, idx) => {
        if (idx === 0 || idx === points.length - 1) return true;
        if (!isCollinear(points[idx - 1], point, points[idx + 1])) return true;
        if (anchors.some((anchor) => sameTuple(anchor, point))) return true;
        if (isCrossWireJunction(point, wire.id, wires)) return true;
        return false;
      });
      return pruned.length >= 2 ? [{ ...wire, points: pruned }] : [];
    }),
  );
}

function shouldTrimEndpoint(
  point: [number, number],
  wireId: string,
  wires: Wire[],
  deletedPins: { x: number; y: number }[],
  remainingPins: { x: number; y: number }[],
): boolean {
  const p = { x: point[0], y: point[1] };
  if (!deletedPins.some((pin) => samePoint(pin, p))) return false;
  if (remainingPins.some((pin) => samePoint(pin, p))) return false;
  return !wires.some((wire) => wire.id !== wireId && wire.points.some((candidate) => sameTuple(candidate, point)));
}

function endpointTouchesDeletedPin(point: [number, number], deletedPins: { x: number; y: number }[]): boolean {
  const p = { x: point[0], y: point[1] };
  return deletedPins.some((pin) => samePoint(pin, p));
}

function pruneExposedDanglingEndpoints(
  points: [number, number][],
  wireId: string,
  wires: Wire[],
  anchors: [number, number][],
  trimStart: boolean,
  trimEnd: boolean,
): [number, number][] {
  let next = points;
  while (trimStart && next.length >= 2 && !isAnchoredEndpoint(next[0], wireId, wires, anchors)) {
    next = next.slice(1);
  }
  while (trimEnd && next.length >= 2 && !isAnchoredEndpoint(next[next.length - 1], wireId, wires, anchors)) {
    next = next.slice(0, -1);
  }
  return next;
}

function isAnchoredEndpoint(
  point: [number, number],
  wireId: string,
  wires: Wire[],
  anchors: [number, number][],
): boolean {
  if (anchors.some((anchor) => sameTuple(anchor, point))) return true;
  return wires.some((wire) => wire.id !== wireId && wire.points.some((candidate) => sameTuple(candidate, point)));
}

function isCrossWireJunction(point: [number, number], wireId: string, wires: Wire[]): boolean {
  return wires.some((wire) => {
    if (wire.id === wireId) return false;
    if (wire.points.some((candidate) => sameTuple(candidate, point))) return true;
    for (let idx = 0; idx < wire.points.length - 1; idx++) {
      const start = wire.points[idx];
      const end = wire.points[idx + 1];
      if (pointOnSegment(point[0], point[1], start[0], start[1], end[0], end[1])) return true;
    }
    return false;
  });
}

function isCollinear(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  return Math.abs(cross) <= 1e-9;
}

function normalizeWireList(wires: Wire[]): Wire[] {
  return normalizeWireListPreservingJunctions(wires);
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function sameTuple(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}
