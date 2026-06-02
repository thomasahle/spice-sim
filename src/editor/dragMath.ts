// Drag / rotate / mirror / flip mathematics — measuring pin displacement,
// detecting direct-contact pins, rerouting wires that follow moved pins, and
// building the orthogonal contact-wires that re-anchor rotated/translated
// pins to stationary geometry. Pulled out of Editor.tsx so the editor file
// shrinks and these become unit-testable in isolation.

import type { CircuitComponent, Rotation } from "./model.ts";
import {
  pinNodeIndex,
  wirePolyline,
  type SchematicPage,
  type Wire as GraphWire,
} from "./graphModel.ts";
import { getPinLayout, makeId, pinWorldPos, rotateNext, rotatePrev } from "./model.ts";
import { normalizePoint, samePoint } from "./geometry.ts";
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
import type { PolylineWire } from "./wireTopology.ts";

// Helpers that SYNTHESIZE or rigidly transform coordinate polylines use the
// polyline shape; helpers that READ the page's wire geometry (wireEndpointAnchors
// / pointTouchesStationaryConnection / collectDirectContactPins) take the graph
// page and resolve polylines via wirePolyline. (See wireTopology.ts.)
type Wire = PolylineWire;

export type PinMove = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

// A geometric transform applied to a multi-element selection as a rigid group,
// about a shared pivot (Inkscape/Figma/Illustrator semantics: the whole
// selection turns/reflects together, relative layout preserved).
export type SelectionTransform = "rotate-cw" | "rotate-ccw" | "flip-h" | "flip-v";

/** Transform a world point about `pivot` per the group op. */
export function transformPointAboutPivot(
  p: { x: number; y: number },
  op: SelectionTransform,
  pivot: { x: number; y: number },
): { x: number; y: number } {
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  switch (op) {
    case "rotate-cw": // screen y-down: CW maps (dx,dy)→(−dy,dx)
      return normalizePoint({ x: pivot.x - dy, y: pivot.y + dx });
    case "rotate-ccw":
      return normalizePoint({ x: pivot.x + dy, y: pivot.y - dx });
    case "flip-h": // reflect across the vertical axis through the pivot
      return normalizePoint({ x: pivot.x - dx, y: p.y });
    case "flip-v": // reflect across the horizontal axis through the pivot
      return normalizePoint({ x: p.x, y: pivot.y - dy });
  }
}

/** How a component's own orientation changes under a group op (its body must
 *  re-orient, not just relocate). Mirror stays a clean geometric reflection. */
export function reorientComponent(c: CircuitComponent, op: SelectionTransform): CircuitComponent {
  switch (op) {
    case "rotate-cw":
      return { ...c, rotation: rotateNext(c.rotation) };
    case "rotate-ccw":
      return { ...c, rotation: rotatePrev(c.rotation) };
    case "flip-h":
      // Horizontal reflection: toggle the vertical-axis mirror; rotation negates
      // (M ∘ R_θ = R_−θ ∘ M).
      return { ...c, mirrored: c.mirrored ? undefined : true, rotation: ((360 - c.rotation) % 360) as Rotation };
    case "flip-v":
      // Vertical reflection = R₁₈₀ ∘ (horizontal reflection).
      return { ...c, mirrored: c.mirrored ? undefined : true, rotation: ((540 - c.rotation) % 360) as Rotation };
  }
}

/** Full group transform of one component: re-orient it AND orbit its centre
 *  about the pivot, then re-snap to the grid so it lands on-grid. */
export function transformComponentInGroup(
  c: CircuitComponent,
  op: SelectionTransform,
  pivot: { x: number; y: number },
  snapToGrid: boolean,
): CircuitComponent {
  const reoriented = reorientComponent(c, op);
  const moved = transformPointAboutPivot({ x: c.x, y: c.y }, op, pivot);
  const at = snapToGrid ? { x: Math.round(moved.x), y: Math.round(moved.y) } : moved;
  return { ...reoriented, x: at.x, y: at.y };
}

/** Transform every wire under a group op, preserving connectivity:
 *   • selected wires ride rigidly (all points orbit the pivot);
 *   • an unselected wire whose BOTH endpoints sit on moved pins is "internal"
 *     to the moving set, so it also rides rigidly — NOT deleted as the
 *     single-element path would (that path treats two-moved-pin wires as
 *     degenerate self-loops);
 *   • an unselected wire with ONE endpoint on a moved pin is a "boundary"
 *     wire: that endpoint follows its pin while the far end stays put;
 *   • wires touching no moved pin are untouched.
 *  `pinMoves` are the selected components' pin displacements (old→new). */
export function transformGroupWires(
  wires: Wire[],
  selected: Set<string>,
  pinMoves: PinMove[],
  op: SelectionTransform,
  pivot: { x: number; y: number },
  snapToGrid: boolean,
): Wire[] {
  const rigidPoint = ([x, y]: [number, number]): [number, number] => {
    const t = transformPointAboutPivot({ x, y }, op, pivot);
    const at = snapToGrid ? { x: Math.round(t.x), y: Math.round(t.y) } : t;
    return [at.x, at.y];
  };
  const onMovedPin = (x: number, y: number) =>
    pinMoves.some((m) => samePoint(m.from, { x, y }));
  return wires.map((w) => {
    if (selected.has(w.id)) return { ...w, points: w.points.map(rigidPoint) };
    if (w.points.length < 2) return w;
    const first = w.points[0];
    const last = w.points[w.points.length - 1];
    const firstMoved = onMovedPin(first[0], first[1]);
    const lastMoved = onMovedPin(last[0], last[1]);
    if (!firstMoved && !lastMoved) return w;
    const degenerate = samePoint({ x: first[0], y: first[1] }, { x: last[0], y: last[1] });
    if (firstMoved && lastMoved && !degenerate) {
      // Internal wire — both ends belong to the group; move it rigidly.
      return { ...w, points: w.points.map(rigidPoint) };
    }
    // Boundary wire — reroute only the moved endpoint(s).
    const targets = wireEndpointMoveTargets(w.points, pinMoves);
    if (targets.size === 0) return w;
    return { ...w, points: moveWirePointsToTargets(w.points, targets, snapToGrid) };
  });
}

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
    const pinCount = getPinLayout(c).length;
    // The component's original pin world-positions. A transform that merely
    // *permutes* pins among these same positions (e.g. a 2-pin polarity swap /
    // mirror, which keeps both pins put and only swaps their identity) must not
    // drag attached wires: per-index a pin "moves" from one occupied point to
    // another, but physically nothing relocated. Skip any destination that is
    // still an original pin of this component.
    const originalPins: { x: number; y: number }[] = [];
    for (let i = 0; i < pinCount; i++) originalPins.push(pinWorldPos(c, i));
    for (let i = 0; i < pinCount; i++) {
      const from = originalPins[i];
      const to = pinWorldPos(transformed, i);
      if (samePoint(from, to)) continue;
      if (originalPins.some((p) => samePoint(p, to))) continue; // permutation, not a relocation
      moves.push({ from, to });
    }
  }
  return moves;
}

export function collectDirectContactPins(
  page: SchematicPage,
  selected: Set<string>,
): DirectContactPin[] {
  const components = page.components;
  const stationaryPins = new Set<string>();
  for (const c of components) {
    if (selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      stationaryPins.add(`${coordKey(p.x)},${coordKey(p.y)}`);
    }
  }
  // Stationary wires projected to polylines (interior coincidence test below).
  const idx = pinNodeIndex(page);
  const stationaryWires = page.wires
    .filter((wire) => !selected.has(wire.id))
    .flatMap((wire) => {
      const points = wirePolyline(page, wire, idx);
      return points ? [{ id: wire.id, points }] : [];
    });
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
  wire: GraphWire,
  sourcePage: SchematicPage,
  selected: Set<string>,
): WireEndpointAnchors {
  const idx = pinNodeIndex(sourcePage);
  const points = wirePolyline(sourcePage, wire, idx);
  if (!points || points.length < 2) return {};
  const first = points[0];
  const last = points[points.length - 1];
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

  const idx = pinNodeIndex(sourcePage);
  for (const wire of sourcePage.wires) {
    if (wire.id === currentWireId || selected.has(wire.id)) continue;
    const points = wirePolyline(sourcePage, wire, idx);
    if (points && pointTouchesWirePath(point, { id: wire.id, points })) return true;
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
  const idx = pinNodeIndex(routingPage);
  const routingWires: Wire[] = routingPage.wires.flatMap((wire) => {
    const points = wirePolyline(routingPage, wire, idx);
    return points ? [{ id: wire.id, points }] : [];
  });
  return translatedContactRoutesAvoiding(contacts, dx, dy, orthogonal, {
    components: routingPage.components,
    wires: routingWires,
    ignoreComponentIds: movingComponentIds,
  }).map((points) => ({
    id: makeId("w"),
    points,
  }));
}
