import type { SchematicPage, Wire } from "./model.ts";
import {
  normalizePoint,
  normalizeTuple,
  pointOnSegment,
  samePoint,
  sameTuple,
} from "./geometry.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import { routeWireSegmentAvoiding } from "./placement.ts";
import { dedupeWirePointsPreservingJunctions } from "./wireTopology.ts";

interface PathStop {
  point: [number, number];
  distance: number;
}

export function autoFormatWireAvoiding(wire: Wire, page: SchematicPage): Wire {
  return autoFormatWireAvoidingWithRoutingWires(wire, page, page.wires);
}

export function autoFormatWiresAvoiding(page: SchematicPage, targetWireIds: Set<string>): SchematicPage {
  if (targetWireIds.size === 0) return page;
  const originalIndex = new Map(page.wires.map((wire, idx) => [wire.id, idx]));
  const targets = page.wires
    .filter((wire) => targetWireIds.has(wire.id))
    .sort((a, b) => wireFormatPriority(a, page) - wireFormatPriority(b, page)
      || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));
  if (targets.length === 0) return page;

  const nextById = new Map(page.wires.map((wire) => [wire.id, wire]));
  const untouchedWires = page.wires.filter((wire) => !targetWireIds.has(wire.id));
  const formattedWires: Wire[] = [];

  for (const original of targets) {
    const current = nextById.get(original.id) ?? original;
    const routingWires = [...untouchedWires, ...formattedWires, current];
    const formatted = autoFormatWireAvoidingWithRoutingWires(current, page, routingWires);
    nextById.set(original.id, formatted);
    formattedWires.push(formatted);
  }

  return {
    ...page,
    wires: page.wires.map((wire) => nextById.get(wire.id) ?? wire),
  };
}

function autoFormatWireAvoidingWithRoutingWires(
  wire: Wire,
  page: SchematicPage,
  routingWires: Wire[],
): Wire {
  if (wire.points.length < 2) return wire;
  const stops = autoFormatWireStops(wire, page);
  if (stops.length < 2) return wire;

  const routed: [number, number][] = [];
  const ignoreWireIds = new Set([wire.id]);
  for (let idx = 0; idx < stops.length - 1; idx++) {
    const from = stops[idx];
    const to = stops[idx + 1];
    const segment = routeWireSegmentAvoiding(
      { x: from[0], y: from[1] },
      { x: to[0], y: to[1] },
      true,
      {
        components: page.components,
        wires: routingWires,
        ignoreWireIds,
      },
    );
    if (segment.length === 0) continue;
    if (routed.length === 0) routed.push(...segment);
    else routed.push(...segment.slice(1));
  }

  const points = dedupeWirePointsPreservingJunctions(routed);
  return points.length >= 2 ? { ...wire, points } : wire;
}

function wireFormatPriority(wire: Wire, page: SchematicPage): number {
  const stops = autoFormatWireStops(wire, page).length;
  const span = wireEndpointDistance(wire);
  return stops * 1000 - span;
}

function wireEndpointDistance(wire: Wire): number {
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  if (!first || !last) return Number.POSITIVE_INFINITY;
  return Math.abs(first[0] - last[0]) + Math.abs(first[1] - last[1]);
}

export function wireIdsForAutoFormat(page: SchematicPage, selection: Set<string>): Set<string> {
  if (selection.size === 0) return new Set(page.wires.map((wire) => wire.id));

  const target = new Set<string>();
  for (const wire of page.wires) {
    if (selection.has(wire.id)) target.add(wire.id);
  }

  const selectedComponents = page.components.filter((component) => selection.has(component.id));
  const selectedPins = selectedComponents.flatMap((component) =>
    getPinLayout(component).map((_, pinIdx) => pinWorldPos(component, pinIdx)),
  );
  for (const wire of page.wires) {
    if (target.has(wire.id)) continue;
    if (selectedPins.some((pin) => pointOnWirePath(pin, wire.points))) target.add(wire.id);
  }

  const selectedProbes = page.probes.filter((probe) => selection.has(probe.id));
  for (const wire of page.wires) {
    if (target.has(wire.id)) continue;
    if (selectedProbes.some((probe) => pointOnWirePath(probe, wire.points))) target.add(wire.id);
  }

  return target;
}

export function autoFormatWireStops(wire: Wire, page: SchematicPage): [number, number][] {
  const stops: PathStop[] = [];
  const addStop = (point: { x: number; y: number } | [number, number]) => {
    const normalized = Array.isArray(point)
      ? normalizeTuple(point)
      : normalizeTuple([point.x, point.y]);
    const distance = wirePathDistanceToPoint(wire.points, normalized);
    if (distance === null) return;
    if (stops.some((stop) => sameTuple(stop.point, normalized))) return;
    stops.push({ point: normalized, distance });
  };

  addStop(wire.points[0]);
  addStop(wire.points[wire.points.length - 1]);
  for (let idx = 1; idx < wire.points.length - 1; idx++) {
    const point = wire.points[idx];
    if (pointIsElectricalStop(point, wire, page)) addStop(point);
  }
  for (const component of page.components) {
    for (let pinIdx = 0; pinIdx < getPinLayout(component).length; pinIdx++) {
      addStop(pinWorldPos(component, pinIdx));
    }
  }
  for (const probe of page.probes) {
    addStop(probe);
  }
  for (const otherWire of page.wires) {
    if (otherWire.id === wire.id) continue;
    for (const point of otherWire.points) addStop(point);
  }

  return stops
    .sort((a, b) => a.distance - b.distance)
    .map((stop) => stop.point);
}

function pointIsElectricalStop(
  point: [number, number],
  wire: Wire,
  page: SchematicPage,
): boolean {
  const probe = normalizePoint({ x: point[0], y: point[1] });
  if (page.probes.some((candidate) => samePoint(candidate, probe))) return true;

  for (const component of page.components) {
    for (let pinIdx = 0; pinIdx < getPinLayout(component).length; pinIdx++) {
      if (samePoint(pinWorldPos(component, pinIdx), probe)) return true;
    }
  }

  for (const otherWire of page.wires) {
    if (otherWire.id === wire.id) continue;
    if (pointOnWirePath(probe, otherWire.points)) return true;
  }
  return false;
}

function wirePathDistanceToPoint(
  points: [number, number][],
  point: [number, number],
): number | null {
  let travelled = 0;
  for (let idx = 0; idx < points.length - 1; idx++) {
    const start = points[idx];
    const end = points[idx + 1];
    const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (pointOnSegment(point[0], point[1], start[0], start[1], end[0], end[1])) {
      return travelled + Math.hypot(point[0] - start[0], point[1] - start[1]);
    }
    travelled += segmentLength;
  }
  return null;
}

function pointOnWirePath(point: { x: number; y: number }, points: [number, number][]): boolean {
  if (points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let idx = 0; idx < points.length - 1; idx++) {
    const [x1, y1] = points[idx];
    const [x2, y2] = points[idx + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}
