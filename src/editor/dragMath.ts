// Drag / rotate / mirror / flip mathematics — measuring pin displacement,
// detecting direct-contact pins, rerouting wires that follow moved pins, and
// building the orthogonal contact-wires that re-anchor rotated/translated
// pins to stationary geometry. Pulled out of Editor.tsx so the editor file
// shrinks and these become unit-testable in isolation.

import type { CircuitComponent, SchematicPage, Wire } from "./model.ts";
import { getPinLayout, makeId, pinWorldPos } from "./model.ts";
import { samePoint } from "./geometry.ts";
import { coordKey } from "./netlist.ts";
import { pointTouchesWireInterior, pointTouchesWirePath } from "./wireGeometry.ts";
import {
  rotatedContactRoutesAvoiding,
  translatedContactRoutesAvoiding,
  type WireEndpointAnchors,
} from "./placement.ts";
import {
  moveWirePointsToTargets,
  wireConnectsMovedPins,
  wireEndpointMoveTargets,
} from "./wireMotion.ts";

export type PinMove = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type DirectContactPin = {
  componentId: string;
  pinIdx: number;
  from: { x: number; y: number };
};

// Measure how each selected component's pins move when `mutate` is applied,
// so wires/probes anchored to those pins can follow. Shared by rotate,
// mirror, and vertical-flip via `transformSelected`.
export function collectTransformedPinMoves(
  components: CircuitComponent[],
  selected: Set<string>,
  mutate: (c: CircuitComponent) => CircuitComponent,
): PinMove[] {
  const moves: PinMove[] = [];
  for (const c of components) {
    if (!selected.has(c.id)) continue;
    const transformed = mutate(c);
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const from = pinWorldPos(c, i);
      const to = pinWorldPos(transformed, i);
      if (!samePoint(from, to)) moves.push({ from, to });
    }
  }
  return moves;
}

export function collectDirectContactPins(
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
): DirectContactPin[] {
  const stationaryPins = new Set<string>();
  for (const c of components) {
    if (selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      stationaryPins.add(`${coordKey(p.x)},${coordKey(p.y)}`);
    }
  }
  const stationaryWires = wires.filter((wire) => !selected.has(wire.id));
  if (stationaryPins.size === 0 && stationaryWires.length === 0) return [];

  const seen = new Set<string>();
  const contacts: DirectContactPin[] = [];
  for (const c of components) {
    if (!selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const from = pinWorldPos(c, i);
      const key = `${c.id}#${i}:${coordKey(from.x)},${coordKey(from.y)}`;
      if (seen.has(key)) continue;
      const fromKey = `${coordKey(from.x)},${coordKey(from.y)}`;
      if (!stationaryPins.has(fromKey) && !pointTouchesWireInterior(from, stationaryWires)) continue;
      seen.add(key);
      contacts.push({ componentId: c.id, pinIdx: i, from });
    }
  }
  return contacts;
}

export function moveWiresToRotatedPins(
  wires: Wire[],
  pinMoves: PinMove[],
  orthogonal: boolean,
): Wire[] {
  if (pinMoves.length === 0) return wires;
  return wires.flatMap((wire) => {
    const pointMoves = wireEndpointMoveTargets(wire.points, pinMoves);
    if (pointMoves.size === 0) return [wire];
    const points = moveWirePointsToTargets(wire.points, pointMoves, orthogonal);
    if (wireConnectsMovedPins(points, pinMoves)) return [];
    return [{ ...wire, points }];
  });
}

export function buildRotatedPinContactWires(
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
  pinMoves: PinMove[],
  orthogonal: boolean,
): Wire[] {
  if (pinMoves.length === 0) return [];
  const stationaryPins = new Set<string>();
  for (const c of components) {
    if (selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      stationaryPins.add(`${coordKey(p.x)},${coordKey(p.y)}`);
    }
  }
  const stationaryWires = wires.filter((wire) => !selected.has(wire.id));
  const seen = new Set<string>();
  const contactMoves: PinMove[] = [];
  for (const move of pinMoves) {
    const fromKey = `${coordKey(move.from.x)},${coordKey(move.from.y)}`;
    if (!stationaryPins.has(fromKey) && !pointTouchesWireInterior(move.from, stationaryWires)) continue;
    const key = `${fromKey}->${coordKey(move.to.x)},${coordKey(move.to.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contactMoves.push(move);
  }
  return rotatedContactRoutesAvoiding(contactMoves, orthogonal, {
    components,
    wires,
    ignoreComponentIds: selected,
  }).map((points) => ({
    id: makeId("w"),
    points,
  }));
}

export function wireEndpointAnchors(
  wire: Wire,
  sourcePage: SchematicPage,
  selected: Set<string>,
): WireEndpointAnchors {
  if (wire.points.length < 2) return {};
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  return {
    start: pointTouchesStationaryConnection(
      { x: first[0], y: first[1] },
      wire.id,
      sourcePage,
      selected,
    ),
    end: pointTouchesStationaryConnection(
      { x: last[0], y: last[1] },
      wire.id,
      sourcePage,
      selected,
    ),
  };
}

export function pointTouchesStationaryConnection(
  point: { x: number; y: number },
  currentWireId: string,
  sourcePage: SchematicPage,
  selected: Set<string>,
): boolean {
  for (const component of sourcePage.components) {
    if (selected.has(component.id)) continue;
    for (let idx = 0; idx < getPinLayout(component).length; idx++) {
      if (samePoint(pinWorldPos(component, idx), point)) return true;
    }
  }

  for (const wire of sourcePage.wires) {
    if (wire.id === currentWireId || selected.has(wire.id)) continue;
    if (pointTouchesWirePath(point, wire)) return true;
  }

  return false;
}

export function buildTranslatedPinContactWires(
  contacts: DirectContactPin[],
  dx: number,
  dy: number,
  orthogonal: boolean,
  routingPage: SchematicPage,
  movingComponentIds: Set<string>,
): Wire[] {
  return translatedContactRoutesAvoiding(contacts, dx, dy, orthogonal, {
    components: routingPage.components,
    wires: routingPage.wires,
    ignoreComponentIds: movingComponentIds,
  }).map((points) => ({
    id: makeId("w"),
    points,
  }));
}
