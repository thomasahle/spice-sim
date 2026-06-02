import {
  pinNodeIndex,
  wirePolyline,
  type PinNodeOwner,
  type SchematicPage,
  type Wire,
} from "./graphModel.ts";
import {
  normalizePoint,
  normalizeTuple,
  pointOnSegment,
  samePoint,
  sameTuple,
} from "./geometry.ts";
import { getPinLayout, pinWorldPos, type CircuitComponent, type Probe } from "./model.ts";
import { routeWireSegmentAvoiding } from "./placement.ts";
import { dedupeWirePointsPreservingJunctions, type PolylineWire } from "./wireTopology.ts";

// Auto-format reshapes wire ROUTES (geometry only); the graph's topology (which
// node each edge connects) is untouched. The core operates on a POLYLINE view —
// components/probes plus each wire's coordinate polyline — and emits reshaped
// polylines keyed by id. The graph entry points project the graph page (each
// edge → wirePolyline) and delegate; the editor maps the results back onto edge
// `bends`. ELK auto-arrange reuses the polyline core directly. (See
// wireTopology.ts for the polyline-vs-graph wire split.)

interface PathStop {
  point: [number, number];
  distance: number;
}

/** The polyline view the format core needs: components, probes, and each wire as
 *  a coordinate polyline. */
export interface FormatPolylinePage {
  components: CircuitComponent[];
  probes: Probe[];
  wires: PolylineWire[];
}

/** Project a graph page to the polyline view (skipping unresolved edges). */
function toFormatPolylinePage(
  page: SchematicPage,
  idx: Map<string, PinNodeOwner>,
): FormatPolylinePage {
  const wires: PolylineWire[] = [];
  for (const wire of page.wires) {
    const points = wirePolyline(page, wire, idx);
    if (points) wires.push({ id: wire.id, points });
  }
  return { components: page.components, probes: page.probes, wires };
}

// ---------------------------------------------------------------------------
// Graph entry points
// ---------------------------------------------------------------------------

export function autoFormatWireAvoiding(wire: Wire, page: SchematicPage): PolylineWire {
  const idx = pinNodeIndex(page);
  const points = wirePolyline(page, wire, idx);
  if (!points) return { id: wire.id, points: [] };
  const view = toFormatPolylinePage(page, idx);
  return autoFormatPolylineAvoidingWithRoutingWires({ id: wire.id, points }, view, view.wires);
}

export function autoFormatWiresAvoiding(
  page: SchematicPage,
  targetWireIds: Set<string>,
): { wires: PolylineWire[] } {
  const idx = pinNodeIndex(page);
  return autoFormatPolylinePage(toFormatPolylinePage(page, idx), targetWireIds);
}

export function wireIdsForAutoFormat(page: SchematicPage, selection: Set<string>): Set<string> {
  const idx = pinNodeIndex(page);
  return wireIdsForAutoFormatPolyline(toFormatPolylinePage(page, idx), selection);
}

export function autoFormatWireStops(wire: Wire, page: SchematicPage): [number, number][] {
  const idx = pinNodeIndex(page);
  const points = wirePolyline(page, wire, idx);
  if (!points) return [];
  return autoFormatWireStopsForPoints(wire.id, points, toFormatPolylinePage(page, idx));
}

// ---------------------------------------------------------------------------
// Polyline core (also used directly by ELK auto-arrange)
// ---------------------------------------------------------------------------

export function autoFormatPolylinePage(
  page: FormatPolylinePage,
  targetWireIds: Set<string>,
): { wires: PolylineWire[] } {
  if (targetWireIds.size === 0) return { wires: page.wires };

  const originalIndex = new Map(page.wires.map((wire, i) => [wire.id, i]));
  const targets = page.wires
    .filter((wire) => targetWireIds.has(wire.id))
    .sort((a, b) => wireFormatPriority(a, page) - wireFormatPriority(b, page)
      || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));
  if (targets.length === 0) return { wires: page.wires };

  const nextById = new Map(page.wires.map((wire) => [wire.id, wire]));
  const untouchedWires = page.wires.filter((wire) => !targetWireIds.has(wire.id));
  const formattedWires: PolylineWire[] = [];

  for (const original of targets) {
    const current = nextById.get(original.id) ?? original;
    const routingWires = [...untouchedWires, ...formattedWires, current];
    const formatted = autoFormatPolylineAvoidingWithRoutingWires(current, page, routingWires);
    nextById.set(original.id, formatted);
    formattedWires.push(formatted);
  }

  return { wires: page.wires.map((wire) => nextById.get(wire.id) ?? wire) };
}

function autoFormatPolylineAvoidingWithRoutingWires(
  wire: PolylineWire,
  page: FormatPolylinePage,
  routingWires: PolylineWire[],
): PolylineWire {
  if (wire.points.length < 2) return wire;
  const stops = autoFormatWireStopsForPoints(wire.id, wire.points, page);
  if (stops.length < 2) return wire;

  const routed: [number, number][] = [];
  const ignoreWireIds = new Set([wire.id]);
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
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

function wireFormatPriority(wire: PolylineWire, page: FormatPolylinePage): number {
  const stops = autoFormatWireStopsForPoints(wire.id, wire.points, page).length;
  const span = wireEndpointDistance(wire.points);
  return stops * 1000 - span;
}

function wireEndpointDistance(points: [number, number][]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return Number.POSITIVE_INFINITY;
  return Math.abs(first[0] - last[0]) + Math.abs(first[1] - last[1]);
}

export function wireIdsForAutoFormatPolyline(
  page: FormatPolylinePage,
  selection: Set<string>,
): Set<string> {
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

export function autoFormatWireStopsForPoints(
  wireId: string,
  points: [number, number][],
  page: FormatPolylinePage,
): [number, number][] {
  const stops: PathStop[] = [];
  const addStop = (point: { x: number; y: number } | [number, number]) => {
    const normalized = Array.isArray(point)
      ? normalizeTuple(point)
      : normalizeTuple([point.x, point.y]);
    const distance = wirePathDistanceToPoint(points, normalized);
    if (distance === null) return;
    if (stops.some((stop) => sameTuple(stop.point, normalized))) return;
    stops.push({ point: normalized, distance });
  };

  addStop(points[0]);
  addStop(points[points.length - 1]);
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    if (pointIsElectricalStop(point, wireId, page)) addStop(point);
  }
  for (const component of page.components) {
    for (let pinIdx = 0; pinIdx < getPinLayout(component).length; pinIdx++) {
      const pin = pinWorldPos(component, pinIdx);
      if (pointsHaveExplicit(points, pin)) addStop(pin);
    }
  }
  for (const probe of page.probes) {
    addStop(probe);
  }
  for (const otherWire of page.wires) {
    if (otherWire.id === wireId) continue;
    for (const point of otherWire.points) addStop(point);
  }

  return stops
    .sort((a, b) => a.distance - b.distance)
    .map((stop) => stop.point);
}

function pointIsElectricalStop(
  point: [number, number],
  wireId: string,
  page: FormatPolylinePage,
): boolean {
  const probe = normalizePoint({ x: point[0], y: point[1] });
  if (page.probes.some((candidate) => samePoint(candidate, probe))) return true;

  for (const component of page.components) {
    for (let pinIdx = 0; pinIdx < getPinLayout(component).length; pinIdx++) {
      if (samePoint(pinWorldPos(component, pinIdx), probe)) return true;
    }
  }

  for (const otherWire of page.wires) {
    if (otherWire.id === wireId) continue;
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

function pointsHaveExplicit(points: [number, number][], point: { x: number; y: number }): boolean {
  return points.some(([x, y]) => samePoint(point, { x, y }));
}
