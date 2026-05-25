import type { CircuitComponent, ComponentKind, Probe, Rotation, Wire } from "./model.ts";
import { defaultValue, getPinLayout, pinWorldPos, rotatePoint } from "./model.ts";
import {
  componentVisualBoundsFor,
  normalizeCoord,
  normalizePoint,
  normalizeTuple,
  pointOnSegment,
  wireIntersectsRect,
  type Rect,
} from "./geometry.ts";

export interface TerminalContact {
  componentId: string;
  pinIdx: number;
  from: { x: number; y: number };
}

export interface PointContactMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function placementLength(draft: {
  start: { x: number; y: number };
  end: { x: number; y: number };
}): number {
  return Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
}

export function componentFromTerminals(
  kind: ComponentKind,
  start: { x: number; y: number },
  end: { x: number; y: number },
  id: string,
): CircuitComponent {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const moved = Math.hypot(dx, dy) >= 0.35;
  const horizontal = moved ? Math.abs(dx) >= Math.abs(dy) : kind === "R";
  const forward = horizontal ? dx >= 0 : dy >= 0;
  const center = moved
    ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    : { x: start.x, y: start.y };

  let rotation: CircuitComponent["rotation"];
  if (kind === "R") {
    rotation = horizontal
      ? forward
        ? 0
        : 180
      : forward
        ? 90
        : 270;
  } else {
    rotation = horizontal
      ? forward
        ? 270
        : 90
      : forward
        ? 0
        : 180;
  }

  return {
    id,
    kind,
    x: center.x,
    y: center.y,
    rotation,
    value: defaultValue(kind),
  };
}

export function componentFromDrag(
  kind: ComponentKind,
  start: { x: number; y: number },
  end: { x: number; y: number },
  id: string,
  params?: CircuitComponent["params"],
): CircuitComponent {
  const pins = getPinLayout({
    id,
    kind,
    x: 0,
    y: 0,
    rotation: 0,
    value: defaultValue(kind),
    params,
  });
  if (pins.length === 2 && kind !== "SUBX") return componentFromTerminals(kind, start, end, id);
  if (kind === "NOTE") return noteFromDrag(start, end, id);
  if (pins.length === 1) {
    return {
      id,
      kind,
      x: end.x,
      y: end.y,
      rotation: 0,
      value: defaultValue(kind),
      params,
    };
  }
  if (pins.length >= 2) {
    return multiPinComponentFromDrag(kind, pins, start, end, id, params);
  }
  return {
    id,
    kind,
    x: end.x,
    y: end.y,
    rotation: 0,
    value: defaultValue(kind),
    params,
  };
}

export function componentFromClick(
  kind: ComponentKind,
  point: { x: number; y: number },
  id: string,
): CircuitComponent {
  return componentFromDrag(kind, point, point, id);
}

export function connectedPlacementWires(
  c: CircuitComponent,
  start: { x: number; y: number },
  end: { x: number; y: number },
  orthogonal: boolean,
  makeWireId: () => string,
  context: WireRoutingContext = {},
): Wire[] {
  const pins = getPinLayout(c);
  const wires: Wire[] = [];

  if (pins.length === 1) {
    const pin = pinWorldPos(c, 0);
    if (!samePoint(pin, start)) {
      wires.push({
        id: makeWireId(),
        points: routeWireSegmentForContext(pin, start, orthogonal, context),
      });
    }
    return wires.filter((w) => w.points.length >= 2);
  }

  if (pins.length >= 2) {
    const firstPin = pinWorldPos(c, 0);
    const secondPin = pinWorldPos(c, pins.length - 1);
    if (!samePoint(firstPin, start)) {
      wires.push({
        id: makeWireId(),
        points: routeWireSegmentForContext(firstPin, start, orthogonal, context),
      });
    }
    if (!samePoint(secondPin, end)) {
      wires.push({
        id: makeWireId(),
        points: routeWireSegmentForContext(secondPin, end, orthogonal, context),
      });
    }
  }
  return wires.filter((w) => w.points.length >= 2);
}

export function placementWireCutSpan(
  c: CircuitComponent,
  start: { x: number; y: number },
  end: { x: number; y: number },
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const firstPin = pinWorldPos(c, 0);
  const secondPin = pinWorldPos(c, 1);
  const points = [firstPin, secondPin, start, end];
  if (!pointsShareLine(firstPin, secondPin, points)) return { start, end };

  const sorted = [...points].sort(
    (a, b) => projectionAlong(firstPin, secondPin, a) - projectionAlong(firstPin, secondPin, b),
  );
  return {
    start: normalizePoint(sorted[0]),
    end: normalizePoint(sorted[sorted.length - 1]),
  };
}

export function connectedInlinePlacementWires(
  c: CircuitComponent,
  start: { x: number; y: number },
  end: { x: number; y: number },
  orthogonal: boolean,
  makeWireId: () => string,
  context: WireRoutingContext = {},
): Wire[] {
  if (getPinLayout(c).length !== 2) {
    return connectedPlacementWires(c, start, end, orthogonal, makeWireId, context);
  }
  const firstPin = pinWorldPos(c, 0);
  const secondPin = pinWorldPos(c, 1);
  if (!pointsShareLine(firstPin, secondPin, [firstPin, secondPin, start, end])) {
    return connectedPlacementWires(c, start, end, orthogonal, makeWireId, context);
  }

  const wires: Wire[] = [];
  if (!samePoint(firstPin, start) && pointIsOutwardFromTerminal(firstPin, secondPin, start)) {
    wires.push({
      id: makeWireId(),
      points: routeWireSegmentForContext(firstPin, start, orthogonal, context),
    });
  }
  if (!samePoint(secondPin, end) && pointIsOutwardFromTerminal(secondPin, firstPin, end)) {
    wires.push({
      id: makeWireId(),
      points: routeWireSegmentForContext(secondPin, end, orthogonal, context),
    });
  }
  return wires.filter((w) => w.points.length >= 2);
}

function noteFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  id: string,
): CircuitComponent {
  const moved = placementLength({ start, end }) >= 0.35;
  if (!moved) {
    return {
      id,
      kind: "NOTE",
      x: start.x,
      y: start.y,
      rotation: 0,
      value: defaultValue("NOTE"),
    };
  }
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.max(2.8, Math.abs(end.x - start.x));
  const h = Math.max(1.4, Math.abs(end.y - start.y));
  return {
    id,
    kind: "NOTE",
    x,
    y,
    rotation: 0,
    value: defaultValue("NOTE"),
    params: {
      w: String(normalizePoint({ x: w, y: 0 }).x),
      h: String(normalizePoint({ x: 0, y: h }).y),
    },
  };
}

function multiPinComponentFromDrag(
  kind: ComponentKind,
  pins: { x: number; y: number }[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  id: string,
  params?: CircuitComponent["params"],
): CircuitComponent {
  if (placementLength({ start, end }) < 0.35) {
    return {
      id,
      kind,
      x: start.x,
      y: start.y,
      rotation: 0,
      value: defaultValue(kind),
      params,
    };
  }
  const first = pins[0];
  const last = pins[pins.length - 1];
  let best: { rotation: Rotation; center: { x: number; y: number }; error: number } | null = null;
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const firstRotated = rotatePoint(first, rotation);
    const lastRotated = rotatePoint(last, rotation);
    const centerFromFirst = { x: start.x - firstRotated.x, y: start.y - firstRotated.y };
    const centerFromLast = { x: end.x - lastRotated.x, y: end.y - lastRotated.y };
    const center = normalizePoint({
      x: (centerFromFirst.x + centerFromLast.x) / 2,
      y: (centerFromFirst.y + centerFromLast.y) / 2,
    });
    const firstError = Math.hypot(center.x + firstRotated.x - start.x, center.y + firstRotated.y - start.y);
    const lastError = Math.hypot(center.x + lastRotated.x - end.x, center.y + lastRotated.y - end.y);
    const error = firstError + lastError;
    if (!best || error < best.error) best = { rotation, center, error };
  }

  return {
    id,
    kind,
    x: best?.center.x ?? end.x,
    y: best?.center.y ?? end.y,
    rotation: best?.rotation ?? 0,
    value: defaultValue(kind),
    params,
  };
}

export function placementConnectionWires(
  c: CircuitComponent,
  start: { x: number; y: number },
  end: { x: number; y: number },
  orthogonal: boolean,
  inlineInsertion: boolean,
  makeWireId: () => string,
  context: WireRoutingContext = {},
): Wire[] {
  return inlineInsertion
    ? connectedInlinePlacementWires(c, start, end, orthogonal, makeWireId, context)
    : connectedPlacementWires(c, start, end, orthogonal, makeWireId, context);
}

export function moveProbesFromInsertedWireSpan(
  probes: Probe[],
  c: CircuitComponent,
  cutSpan: { start: { x: number; y: number }; end: { x: number; y: number } },
  placementWires: Wire[],
): Probe[] {
  const spanStart = normalizePoint(cutSpan.start);
  const spanEnd = normalizePoint(cutSpan.end);
  if (samePoint(spanStart, spanEnd)) return probes;

  const firstPin = normalizePoint(pinWorldPos(c, 0));
  const secondPin = normalizePoint(pinWorldPos(c, 1));
  const fixedPoints = [spanStart, spanEnd, firstPin, secondPin];

  return probes.map((probe) => {
    const point = normalizePoint(probe);
    if (!pointOnSegment(point.x, point.y, spanStart.x, spanStart.y, spanEnd.x, spanEnd.y)) {
      return probe;
    }
    if (fixedPoints.some((fixed) => samePoint(point, fixed))) return probe;
    if (pointOnAnyWire(point, placementWires)) return probe;

    const target = distanceSq(point, firstPin) <= distanceSq(point, secondPin)
      ? firstPin
      : secondPin;
    return { ...probe, x: target.x, y: target.y };
  });
}

export function routeWireSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  orthogonal: boolean,
): [number, number][] {
  const points: [number, number][] = [[from.x, from.y]];
  if (orthogonal && from.x !== to.x && from.y !== to.y) points.push([to.x, from.y]);
  points.push([to.x, to.y]);
  return compactWirePoints(points);
}

export interface WireRoutingContext {
  components?: CircuitComponent[];
  wires?: Wire[];
  ignoreComponentIds?: Set<string>;
  ignoreWireIds?: Set<string>;
}

function routeWireSegmentForContext(
  from: { x: number; y: number },
  to: { x: number; y: number },
  orthogonal: boolean,
  context: WireRoutingContext,
): [number, number][] {
  return context.components || context.wires
    ? routeWireSegmentAvoiding(from, to, orthogonal, context)
    : routeWireSegment(from, to, orthogonal);
}

export function routeWireSegmentAvoiding(
  from: { x: number; y: number },
  to: { x: number; y: number },
  orthogonal: boolean,
  context: WireRoutingContext = {},
): [number, number][] {
  if (!orthogonal) return bestFreeformRoute(from, to, context);

  const candidates = orthogonalRouteCandidates(from, to, context);
  const gridRoute = gridRouteCandidate(from, to, context);
  if (gridRoute) candidates.push(gridRoute);
  let best = routeWireSegment(from, to, true);
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreWireRoute(candidate, from, to, context);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function bestFreeformRoute(
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): [number, number][] {
  const candidates = freeformRouteCandidates(from, to, context);
  let best = routeWireSegment(from, to, false);
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreFreeformWireRoute(candidate, from, to, context);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function freeformRouteCandidates(
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): [number, number][][] {
  const candidates: [number, number][][] = [];
  const add = (points: [number, number][]) => {
    const compacted = compactWirePoints(points.map(normalizeTuple));
    if (compacted.length < 2) return;
    const key = compacted.map((p) => `${p[0]},${p[1]}`).join("|");
    if (candidates.some((candidate) => candidate.map((p) => `${p[0]},${p[1]}`).join("|") === key)) return;
    candidates.push(compacted);
  };

  add(routeWireSegment(from, to, false));

  for (const rect of freeformRouteRects(context, from, to)) {
    const lanes = [
      [
        [rect.x1 - ROUTE_LANE_SPACING, rect.y1 - ROUTE_LANE_SPACING],
        [rect.x2 + ROUTE_LANE_SPACING, rect.y1 - ROUTE_LANE_SPACING],
      ],
      [
        [rect.x1 - ROUTE_LANE_SPACING, rect.y2 + ROUTE_LANE_SPACING],
        [rect.x2 + ROUTE_LANE_SPACING, rect.y2 + ROUTE_LANE_SPACING],
      ],
      [
        [rect.x1 - ROUTE_LANE_SPACING, rect.y1 - ROUTE_LANE_SPACING],
        [rect.x1 - ROUTE_LANE_SPACING, rect.y2 + ROUTE_LANE_SPACING],
      ],
      [
        [rect.x2 + ROUTE_LANE_SPACING, rect.y1 - ROUTE_LANE_SPACING],
        [rect.x2 + ROUTE_LANE_SPACING, rect.y2 + ROUTE_LANE_SPACING],
      ],
    ] as Array<[[number, number], [number, number]]>;
    for (const [a, b] of lanes) {
      add([
        [from.x, from.y],
        a,
        b,
        [to.x, to.y],
      ]);
    }
  }

  return candidates;
}

function scoreFreeformWireRoute(
  route: [number, number][],
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): number {
  let score = euclideanRouteLength(route) + Math.max(0, route.length - 2) * 1.2;
  for (const rect of obstacleRects(context, from, to)) {
    if (wireIntersectsRect(route, rect)) score += 10000;
  }
  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    score += wireConflictPenalty(route, wire.points);
  }
  return score;
}

export function reshapeDraggedWirePoint(
  initialPoints: [number, number][],
  pointIdx: number,
  nextPoint: [number, number],
  freeform: boolean,
): [number, number][] {
  if (!freeform && initialPoints.length >= 2 && (pointIdx === 0 || pointIdx === initialPoints.length - 1)) {
    const isStart = pointIdx === 0;
    const neighbor = initialPoints[isStart ? 1 : initialPoints.length - 2];
    const routed = isStart
      ? routeWireSegment(
          { x: nextPoint[0], y: nextPoint[1] },
          { x: neighbor[0], y: neighbor[1] },
          true,
        )
      : routeWireSegment(
          { x: neighbor[0], y: neighbor[1] },
          { x: nextPoint[0], y: nextPoint[1] },
          true,
        );
    return compactWirePoints(
      isStart
        ? [...routed, ...initialPoints.slice(2)]
        : [...initialPoints.slice(0, -2), ...routed],
    );
  }
  if (
    freeform &&
    initialPoints.length === 3 &&
    (pointIdx === 0 || pointIdx === initialPoints.length - 1) &&
    isElbowRoute(initialPoints)
  ) {
    return pointIdx === 0
      ? compactWirePoints([nextPoint, initialPoints[initialPoints.length - 1]])
      : compactWirePoints([initialPoints[0], nextPoint]);
  }
  const next = initialPoints.map(([x, y]) => [x, y] as [number, number]);
  next[pointIdx] = nextPoint;
  return compactWirePoints(next);
}

export function reshapeDraggedWirePointAvoiding(
  initialPoints: [number, number][],
  pointIdx: number,
  nextPoint: [number, number],
  freeform: boolean,
  context: WireRoutingContext = {},
): [number, number][] {
  if (initialPoints.length < 2) return reshapeDraggedWirePoint(initialPoints, pointIdx, nextPoint, freeform);
  const isEndpoint = pointIdx === 0 || pointIdx === initialPoints.length - 1;
  if (!isEndpoint) return reshapeDraggedWirePoint(initialPoints, pointIdx, nextPoint, freeform);

  const isStart = pointIdx === 0;
  const neighborIdx = isStart ? 1 : initialPoints.length - 2;
  const neighbor = initialPoints[neighborIdx];
  const routed = isStart
    ? routeWireSegmentAvoiding(
        { x: nextPoint[0], y: nextPoint[1] },
        { x: neighbor[0], y: neighbor[1] },
        !freeform,
        context,
      )
    : routeWireSegmentAvoiding(
        { x: neighbor[0], y: neighbor[1] },
        { x: nextPoint[0], y: nextPoint[1] },
        !freeform,
        context,
      );

  return compactWirePoints(
    isStart
      ? [...routed, ...initialPoints.slice(2)]
      : [...initialPoints.slice(0, -2), ...routed],
  );
}

export function moveAttachedWirePoints(
  points: [number, number][],
  attached: Set<number>,
  dx: number,
  dy: number,
  orthogonal: boolean,
): [number, number][] {
  if (wireMovesAsRigidShape(points, attached)) {
    return points.map(([x, y]) => normalizeTuple([x + dx, y + dy]));
  }
  if (points.length > 2 && attached.size === 1) {
    const idx = [...attached][0];
    if (idx === 0 || idx === points.length - 1) {
      const moved: [number, number] = [points[idx][0] + dx, points[idx][1] + dy];
      const fixedIdx = idx === 0 ? 1 : points.length - 2;
      const fixed = points[fixedIdx];
      const rerouted = idx === 0
        ? [
            ...routeWireSegment(
              { x: moved[0], y: moved[1] },
              { x: fixed[0], y: fixed[1] },
              orthogonal,
            ),
            ...points.slice(2),
          ]
        : [
            ...points.slice(0, -2),
            ...routeWireSegment(
              { x: fixed[0], y: fixed[1] },
              { x: moved[0], y: moved[1] },
              orthogonal,
            ),
          ];
      return dedupeWirePoints(rerouted);
    }
  }
  if (points.length === 2 && attached.size === 1) {
    const idx = [...attached][0];
    const fixedIdx = idx === 0 ? 1 : 0;
    const moved: [number, number] = [points[idx][0] + dx, points[idx][1] + dy];
    const fixed = points[fixedIdx];
    const routed = routeWireSegment(
      { x: fixed[0], y: fixed[1] },
      { x: moved[0], y: moved[1] },
      orthogonal,
    );
    return idx === 0 ? routed.toReversed() : routed;
  }

  const next = points.map(([x, y]) => [x, y] as [number, number]);
  for (const idx of attached) {
    const [x, y] = points[idx];
    const moved: [number, number] = [x + dx, y + dy];
    next[idx] = moved;
    const neighborIdx = idx === 0 ? 1 : idx === points.length - 1 ? points.length - 2 : -1;
    if (neighborIdx >= 0) {
      const [nx, ny] = points[neighborIdx];
      if (Math.abs(x - nx) < 1e-6) next[neighborIdx] = [moved[0], ny];
      else if (Math.abs(y - ny) < 1e-6) next[neighborIdx] = [nx, moved[1]];
    }
  }
  return dedupeWirePoints(next);
}

export function moveAttachedWirePointsAvoiding(
  points: [number, number][],
  attached: Set<number>,
  dx: number,
  dy: number,
  orthogonal: boolean,
  context: WireRoutingContext = {},
): [number, number][] {
  if (wireMovesAsRigidShape(points, attached)) {
    return points.map(([x, y]) => normalizeTuple([x + dx, y + dy]));
  }
  if (points.length > 2 && attached.size === 1) {
    const idx = [...attached][0];
    if (idx === 0 || idx === points.length - 1) {
      const moved: [number, number] = [points[idx][0] + dx, points[idx][1] + dy];
      const fixedIdx = idx === 0 ? 1 : points.length - 2;
      const fixed = points[fixedIdx];
      const routed = idx === 0
        ? [
            ...routeWireSegmentAvoiding(
              { x: moved[0], y: moved[1] },
              { x: fixed[0], y: fixed[1] },
              orthogonal,
              context,
            ),
            ...points.slice(2),
          ]
        : [
            ...points.slice(0, -2),
            ...routeWireSegmentAvoiding(
              { x: fixed[0], y: fixed[1] },
              { x: moved[0], y: moved[1] },
              orthogonal,
              context,
            ),
          ];
      return dedupeWirePoints(routed);
    }
  }
  if (points.length === 2 && attached.size === 1) {
    const idx = [...attached][0];
    const fixedIdx = idx === 0 ? 1 : 0;
    const moved: [number, number] = [points[idx][0] + dx, points[idx][1] + dy];
    const fixed = points[fixedIdx];
    const routed = routeWireSegmentAvoiding(
      { x: fixed[0], y: fixed[1] },
      { x: moved[0], y: moved[1] },
      orthogonal,
      context,
    );
    return idx === 0 ? routed.toReversed() : routed;
  }
  return moveAttachedWirePoints(points, attached, dx, dy, orthogonal);
}

export interface WireEndpointAnchors {
  start?: boolean;
  end?: boolean;
}

export function moveWirePointsWithAnchors(
  points: [number, number][],
  dx: number,
  dy: number,
  anchors: WireEndpointAnchors,
  orthogonal: boolean,
): [number, number][] {
  if (points.length < 2) return points;
  const start = points[0];
  const end = points[points.length - 1];
  const move = ([x, y]: [number, number]): [number, number] =>
    normalizeTuple([x + dx, y + dy]);

  if (!anchors.start && !anchors.end) {
    return points.map(move);
  }

  if (anchors.start && anchors.end) {
    const body = points.length > 2
      ? points.slice(1, -1).map(move)
      : [move(start), move(end)];
    if (body.length === 0) return dedupeWirePoints([start, end]);
    return compactWirePoints([
      ...routeWireSegment({ x: start[0], y: start[1] }, { x: body[0][0], y: body[0][1] }, orthogonal),
      ...body.slice(1),
      ...routeWireSegment(
        { x: body[body.length - 1][0], y: body[body.length - 1][1] },
        { x: end[0], y: end[1] },
        orthogonal,
      ).slice(1),
    ]);
  }

  if (anchors.start) {
    const movedTail = points.slice(1).map(move);
    return compactWirePoints([
      ...routeWireSegment({ x: start[0], y: start[1] }, { x: movedTail[0][0], y: movedTail[0][1] }, orthogonal),
      ...movedTail.slice(1),
    ]);
  }

  const movedHead = points.slice(0, -1).map(move);
  return compactWirePoints([
    ...movedHead,
    ...routeWireSegment(
      { x: movedHead[movedHead.length - 1][0], y: movedHead[movedHead.length - 1][1] },
      { x: end[0], y: end[1] },
      orthogonal,
    ).slice(1),
  ]);
}

export function moveWirePointsWithAnchorsAvoiding(
  points: [number, number][],
  dx: number,
  dy: number,
  anchors: WireEndpointAnchors,
  orthogonal: boolean,
  context: WireRoutingContext = {},
): [number, number][] {
  if (points.length < 2) return points;
  const start = points[0];
  const end = points[points.length - 1];
  const move = ([x, y]: [number, number]): [number, number] =>
    normalizeTuple([x + dx, y + dy]);
  const route = (from: [number, number], to: [number, number]) =>
    routeWireSegmentAvoiding(
      { x: from[0], y: from[1] },
      { x: to[0], y: to[1] },
      orthogonal,
      context,
    );

  if (!anchors.start && !anchors.end) {
    return points.map(move);
  }

  if (anchors.start && anchors.end) {
    const body = points.length > 2
      ? points.slice(1, -1).map(move)
      : [move(start), move(end)];
    if (body.length === 0) return dedupeWirePoints([start, end]);
    return compactWirePoints([
      ...route(start, body[0]),
      ...body.slice(1),
      ...route(body[body.length - 1], end).slice(1),
    ]);
  }

  if (anchors.start) {
    const movedTail = points.slice(1).map(move);
    return compactWirePoints([
      ...route(start, movedTail[0]),
      ...movedTail.slice(1),
    ]);
  }

  const movedHead = points.slice(0, -1).map(move);
  return compactWirePoints([
    ...movedHead,
    ...route(movedHead[movedHead.length - 1], end).slice(1),
  ]);
}

export function movePointWithAnchoredWire(
  point: { x: number; y: number },
  points: [number, number][],
  dx: number,
  dy: number,
  anchors: WireEndpointAnchors,
): { x: number; y: number } {
  const first = points[0];
  const last = points[points.length - 1];
  if (anchors.start && first && samePoint(point, { x: first[0], y: first[1] })) {
    return normalizePoint(point);
  }
  if (anchors.end && last && samePoint(point, { x: last[0], y: last[1] })) {
    return normalizePoint(point);
  }
  return normalizePoint({ x: point.x + dx, y: point.y + dy });
}

export function wireMovesAsRigidShape(points: [number, number][], attached: Set<number>): boolean {
  return points.length > 1 && attached.has(0) && attached.has(points.length - 1);
}

export function translatedContactRoutes(
  contacts: TerminalContact[],
  dx: number,
  dy: number,
  orthogonal: boolean,
): [number, number][][] {
  if (contacts.length === 0 || (dx === 0 && dy === 0)) return [];
  const seen = new Set<string>();
  const routes: [number, number][][] = [];
  for (const contact of contacts) {
    const to = normalizePoint({ x: contact.from.x + dx, y: contact.from.y + dy });
    const key = `${contact.componentId}#${contact.pinIdx}:${pointKey(contact.from)}->${pointKey(to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const points = routeWireSegment(contact.from, to, orthogonal);
    if (points.length >= 2) routes.push(points);
  }
  return routes;
}

export function translatedContactRoutesAvoiding(
  contacts: TerminalContact[],
  dx: number,
  dy: number,
  orthogonal: boolean,
  context: WireRoutingContext = {},
): [number, number][][] {
  if (contacts.length === 0 || (dx === 0 && dy === 0)) return [];
  const seen = new Set<string>();
  const routes: [number, number][][] = [];
  for (const contact of contacts) {
    const to = normalizePoint({ x: contact.from.x + dx, y: contact.from.y + dy });
    const key = `${contact.componentId}#${contact.pinIdx}:${pointKey(contact.from)}->${pointKey(to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ignoredComponents = new Set(context.ignoreComponentIds ?? []);
    ignoredComponents.add(contact.componentId);
    const points = routeWireSegmentAvoiding(contact.from, to, orthogonal, {
      ...context,
      ignoreComponentIds: ignoredComponents,
    });
    if (points.length >= 2) routes.push(points);
  }
  return routes;
}

export function rotatedContactRoutes(
  moves: PointContactMove[],
  orthogonal: boolean,
): [number, number][][] {
  if (moves.length === 0) return [];
  if (!orthogonal) {
    return moves
      .map(({ from, to }) => routeWireSegment(from, to, false))
      .filter((points) => points.length >= 2);
  }

  const elbowUse = new Map<string, number>();
  for (const move of moves) {
    for (const elbow of rotatedContactElbows(move)) {
      const key = pointKey({ x: elbow[0], y: elbow[1] });
      elbowUse.set(key, (elbowUse.get(key) ?? 0) + 1);
    }
  }

  return moves
    .map((move) => rotatedContactRoute(move, elbowUse))
    .filter((points) => points.length >= 2);
}

export function rotatedContactRoutesAvoiding(
  moves: PointContactMove[],
  orthogonal: boolean,
  context: WireRoutingContext = {},
): [number, number][][] {
  if (moves.length === 0) return [];
  if (!orthogonal) {
    return moves
      .map(({ from, to }) => routeWireSegmentAvoiding(from, to, false, context))
      .filter((points) => points.length >= 2);
  }

  const routed = rotatedContactRoutes(moves, true);
  return moves
    .map((move, idx) => {
      const direct = routed[idx] ?? routeWireSegment(move.from, move.to, true);
      const avoiding = routeWireSegmentAvoiding(move.from, move.to, true, context);
      return scoreWireRoute(avoiding, move.from, move.to, context) < scoreWireRoute(direct, move.from, move.to, context)
        ? avoiding
        : direct;
    })
    .filter((points) => points.length >= 2);
}

export function removeLastWireDraftPoint(
  points: [number, number][] | null,
): [number, number][] | null {
  if (!points || points.length <= 1) return null;
  return points.slice(0, -1);
}

function compactWirePoints(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    if (out.length === 0 || !sameTuple(out[out.length - 1], p)) out.push(p);
  }
  if (out.length <= 2) return out;
  const compacted: [number, number][] = [];
  for (const point of out) {
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

const ROUTE_LANE_SPACING = 1;
const ROUTE_COMPONENT_PAD = 0.3;

function orthogonalRouteCandidates(
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): [number, number][][] {
  const candidates: [number, number][][] = [];
  const add = (points: [number, number][]) => {
    const compacted = compactWirePoints(points.map(normalizeTuple));
    if (compacted.length < 2) return;
    const key = compacted.map((p) => `${p[0]},${p[1]}`).join("|");
    if (candidates.some((candidate) => candidate.map((p) => `${p[0]},${p[1]}`).join("|") === key)) {
      return;
    }
    candidates.push(compacted);
  };

  add(routeWireSegment(from, to, true));
  add([
    [from.x, from.y],
    [from.x, to.y],
    [to.x, to.y],
  ]);

  const midX = normalizeCoord((from.x + to.x) / 2);
  const midY = normalizeCoord((from.y + to.y) / 2);
  add([
    [from.x, from.y],
    [midX, from.y],
    [midX, to.y],
    [to.x, to.y],
  ]);
  add([
    [from.x, from.y],
    [from.x, midY],
    [to.x, midY],
    [to.x, to.y],
  ]);

  for (const rect of obstacleRects(context, from, to)) {
    for (const y of [rect.y1 - ROUTE_LANE_SPACING, rect.y2 + ROUTE_LANE_SPACING]) {
      add([
        [from.x, from.y],
        [from.x, y],
        [to.x, y],
        [to.x, to.y],
      ]);
    }
    for (const x of [rect.x1 - ROUTE_LANE_SPACING, rect.x2 + ROUTE_LANE_SPACING]) {
      add([
        [from.x, from.y],
        [x, from.y],
        [x, to.y],
        [to.x, to.y],
      ]);
    }
  }

  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    for (const [a, b] of segmentTuples(wire.points)) {
      if (a[1] === b[1]) {
        for (const y of [a[1] - ROUTE_LANE_SPACING, a[1] + ROUTE_LANE_SPACING]) {
          add([
            [from.x, from.y],
            [from.x, y],
            [to.x, y],
            [to.x, to.y],
          ]);
        }
        for (const x of [
          Math.min(a[0], b[0]) - ROUTE_LANE_SPACING,
          Math.max(a[0], b[0]) + ROUTE_LANE_SPACING,
        ]) {
          add([
            [from.x, from.y],
            [x, from.y],
            [x, to.y],
            [to.x, to.y],
          ]);
        }
      } else if (a[0] === b[0]) {
        for (const x of [a[0] - ROUTE_LANE_SPACING, a[0] + ROUTE_LANE_SPACING]) {
          add([
            [from.x, from.y],
            [x, from.y],
            [x, to.y],
            [to.x, to.y],
          ]);
        }
        for (const y of [
          Math.min(a[1], b[1]) - ROUTE_LANE_SPACING,
          Math.max(a[1], b[1]) + ROUTE_LANE_SPACING,
        ]) {
          add([
            [from.x, from.y],
            [from.x, y],
            [to.x, y],
            [to.x, to.y],
          ]);
        }
      }
    }
  }

  return candidates;
}

function scoreWireRoute(
  route: [number, number][],
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): number {
  let score = routeLength(route) + Math.max(0, route.length - 2) * 3;
  for (const rect of obstacleRects(context, from, to)) {
    if (wireIntersectsRect(route, rect)) score += 10000;
  }
  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    score += wireConflictPenalty(route, wire.points);
  }
  return score;
}

type GridDirection = "h" | "v" | "none";

function gridRouteCandidate(
  from: { x: number; y: number },
  to: { x: number; y: number },
  context: WireRoutingContext,
): [number, number][] | null {
  const rects = obstacleRects(context, from, to);
  if (rects.length === 0 && (context.wires?.length ?? 0) === 0) return null;

  const xs = new Set<number>([from.x, to.x, normalizeCoord((from.x + to.x) / 2)]);
  const ys = new Set<number>([from.y, to.y, normalizeCoord((from.y + to.y) / 2)]);
  const addX = (x: number) => Number.isFinite(x) && xs.add(normalizeCoord(x));
  const addY = (y: number) => Number.isFinite(y) && ys.add(normalizeCoord(y));
  for (const rect of rects) {
    for (const x of [rect.x1 - ROUTE_LANE_SPACING, rect.x1, rect.x2, rect.x2 + ROUTE_LANE_SPACING]) {
      addX(x);
    }
    for (const y of [rect.y1 - ROUTE_LANE_SPACING, rect.y1, rect.y2, rect.y2 + ROUTE_LANE_SPACING]) {
      addY(y);
    }
  }
  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    for (const [x, y] of wire.points) {
      for (const dx of [-ROUTE_LANE_SPACING, 0, ROUTE_LANE_SPACING]) addX(x + dx);
      for (const dy of [-ROUTE_LANE_SPACING, 0, ROUTE_LANE_SPACING]) addY(y + dy);
    }
  }

  const allXs = [...xs].sort((a, b) => a - b);
  const allYs = [...ys].sort((a, b) => a - b);
  if (allXs.length * allYs.length > 1200) return null;
  const startX = allXs.indexOf(normalizeCoord(from.x));
  const startY = allYs.indexOf(normalizeCoord(from.y));
  const endX = allXs.indexOf(normalizeCoord(to.x));
  const endY = allYs.indexOf(normalizeCoord(to.y));
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return null;

  interface State {
    xIdx: number;
    yIdx: number;
    dir: GridDirection;
  }

  const keyOf = (state: State) => `${state.xIdx},${state.yIdx},${state.dir}`;
  const queue: Array<{ state: State; cost: number }> = [
    { state: { xIdx: startX, yIdx: startY, dir: "none" }, cost: 0 },
  ];
  const dist = new Map<string, number>([[keyOf(queue[0].state), 0]]);
  const prev = new Map<string, string>();
  const stateByKey = new Map<string, State>([[keyOf(queue[0].state), queue[0].state]]);
  let bestEndKey: string | null = null;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    const currentKey = keyOf(current.state);
    if (current.cost !== dist.get(currentKey)) continue;
    if (current.state.xIdx === endX && current.state.yIdx === endY) {
      bestEndKey = currentKey;
      break;
    }

    for (const next of gridNeighbors(current.state, allXs, allYs)) {
      const fromPoint: [number, number] = [allXs[current.state.xIdx], allYs[current.state.yIdx]];
      const toPoint: [number, number] = [allXs[next.xIdx], allYs[next.yIdx]];
      if (!gridSegmentAllowed(fromPoint, toPoint, rects)) continue;
      const segmentCost = Math.abs(fromPoint[0] - toPoint[0]) + Math.abs(fromPoint[1] - toPoint[1]);
      const bendCost = current.state.dir !== "none" && current.state.dir !== next.dir ? 2.5 : 0;
      const wireCost = gridSegmentWirePenalty(fromPoint, toPoint, context);
      const nextCost = current.cost + segmentCost + bendCost + wireCost;
      const nextKey = keyOf(next);
      if (nextCost >= (dist.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      dist.set(nextKey, nextCost);
      prev.set(nextKey, currentKey);
      stateByKey.set(nextKey, next);
      queue.push({ state: next, cost: nextCost });
    }
  }

  if (!bestEndKey) return null;
  const path: [number, number][] = [];
  for (let key: string | undefined = bestEndKey; key; key = prev.get(key)) {
    const state = stateByKey.get(key);
    if (!state) break;
    path.push(normalizeTuple([allXs[state.xIdx], allYs[state.yIdx]]));
  }
  path.reverse();
  return compactWirePoints(path);
}

function freeformRouteRects(
  context: WireRoutingContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Rect[] {
  const rects = [...obstacleRects(context, from, to)];
  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    for (const [a, b] of segmentTuples(wire.points)) {
      const rect: Rect = {
        x1: Math.min(a[0], b[0]) - ROUTE_COMPONENT_PAD,
        y1: Math.min(a[1], b[1]) - ROUTE_COMPONENT_PAD,
        x2: Math.max(a[0], b[0]) + ROUTE_COMPONENT_PAD,
        y2: Math.max(a[1], b[1]) + ROUTE_COMPONENT_PAD,
      };
      if (pointInRouteRect(from, rect) || pointInRouteRect(to, rect)) continue;
      rects.push(rect);
    }
  }
  return rects;
}

function gridNeighbors(
  state: { xIdx: number; yIdx: number },
  xs: number[],
  ys: number[],
): Array<{ xIdx: number; yIdx: number; dir: GridDirection }> {
  const out: Array<{ xIdx: number; yIdx: number; dir: GridDirection }> = [];
  if (state.xIdx > 0) out.push({ xIdx: state.xIdx - 1, yIdx: state.yIdx, dir: "h" });
  if (state.xIdx < xs.length - 1) out.push({ xIdx: state.xIdx + 1, yIdx: state.yIdx, dir: "h" });
  if (state.yIdx > 0) out.push({ xIdx: state.xIdx, yIdx: state.yIdx - 1, dir: "v" });
  if (state.yIdx < ys.length - 1) out.push({ xIdx: state.xIdx, yIdx: state.yIdx + 1, dir: "v" });
  return out;
}

function gridSegmentAllowed(
  from: [number, number],
  to: [number, number],
  rects: Rect[],
): boolean {
  for (const rect of rects) {
    if (wireIntersectsRect([from, to], rect)) return false;
  }
  return true;
}

function gridSegmentWirePenalty(
  from: [number, number],
  to: [number, number],
  context: WireRoutingContext,
): number {
  let penalty = 0;
  for (const wire of context.wires ?? []) {
    if (context.ignoreWireIds?.has(wire.id)) continue;
    penalty += wireConflictPenalty([from, to], wire.points);
  }
  return penalty;
}

function obstacleRects(
  context: WireRoutingContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Rect[] {
  const rects: Rect[] = [];
  for (const component of context.components ?? []) {
    if (context.ignoreComponentIds?.has(component.id)) continue;
    const rect = componentVisualBoundsFor(component, ROUTE_COMPONENT_PAD);
    if (pointInRouteRect(from, rect) || pointInRouteRect(to, rect)) continue;
    rects.push(rect);
  }
  return rects;
}

function routeLength(points: [number, number][]): number {
  let length = 0;
  for (const [a, b] of segmentTuples(points)) {
    length += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }
  return length;
}

function euclideanRouteLength(points: [number, number][]): number {
  let length = 0;
  for (const [a, b] of segmentTuples(points)) {
    length += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return length;
}

function wireConflictPenalty(route: [number, number][], wire: [number, number][]): number {
  let penalty = 0;
  const routeStart = route[0];
  const routeEnd = route[route.length - 1];
  if (!routeStart || !routeEnd) return penalty;
  for (const [a, b] of segmentTuples(route)) {
    for (const [c, d] of segmentTuples(wire)) {
      const conflict = segmentConflict(a, b, c, d, routeStart, routeEnd);
      if (conflict === "cross") penalty += 800;
      if (conflict === "overlap") penalty += 80;
    }
  }
  return penalty;
}

function segmentTuples(points: [number, number][]): [[number, number], [number, number]][] {
  const segments: [[number, number], [number, number]][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i + 1]]);
  }
  return segments;
}

function segmentConflict(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
  routeStart: [number, number],
  routeEnd: [number, number],
): "none" | "cross" | "overlap" {
  if (sameTuple(a, b) || sameTuple(c, d)) return "none";

  const o1 = segmentOrientation(a, b, c);
  const o2 = segmentOrientation(a, b, d);
  const o3 = segmentOrientation(c, d, a);
  const o4 = segmentOrientation(c, d, b);
  const collinear = o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0;
  if (collinear) {
    const overlaps =
      Math.abs(a[0] - b[0]) >= Math.abs(a[1] - b[1])
        ? rangesOverlap(a[0], b[0], c[0], d[0])
        : rangesOverlap(a[1], b[1], c[1], d[1]);
    return overlaps ? "overlap" : "none";
  }

  const intersects =
    (o1 !== o2 && o3 !== o4) ||
    (o1 === 0 && pointOnSegment(c[0], c[1], a[0], a[1], b[0], b[1])) ||
    (o2 === 0 && pointOnSegment(d[0], d[1], a[0], a[1], b[0], b[1])) ||
    (o3 === 0 && pointOnSegment(a[0], a[1], c[0], c[1], d[0], d[1])) ||
    (o4 === 0 && pointOnSegment(b[0], b[1], c[0], c[1], d[0], d[1]));
  if (!intersects) return "none";
  return intersectionAtAllowedRouteTerminal(a, b, c, d, routeStart, routeEnd) ? "none" : "cross";
}

function intersectionAtAllowedRouteTerminal(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
  routeStart: [number, number],
  routeEnd: [number, number],
): boolean {
  return [routeStart, routeEnd].some((terminal) =>
    pointOnSegment(terminal[0], terminal[1], a[0], a[1], b[0], b[1]) &&
    pointOnSegment(terminal[0], terminal[1], c[0], c[1], d[0], d[1]),
  );
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return Math.max(minA, minB) < Math.min(maxA, maxB);
}

function segmentOrientation(
  a: [number, number],
  b: [number, number],
  c: [number, number],
): -1 | 0 | 1 {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function pointInRouteRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x1 && point.x <= rect.x2 && point.y >= rect.y1 && point.y <= rect.y2;
}

function rotatedContactRoute(
  move: PointContactMove,
  elbowUse: Map<string, number>,
): [number, number][] {
  const { from, to } = move;
  if (from.x === to.x || from.y === to.y) return routeWireSegment(from, to, true);

  const elbows = rotatedContactElbows(move);
  const defaultElbow = elbows[0];
  const alternateElbow = elbows[1];
  const defaultUse = elbowUse.get(pointKey({ x: defaultElbow[0], y: defaultElbow[1] })) ?? 0;
  const alternateUse = elbowUse.get(pointKey({ x: alternateElbow[0], y: alternateElbow[1] })) ?? 0;
  const elbow = alternateUse < defaultUse ? alternateElbow : defaultElbow;
  return compactWirePoints([
    [from.x, from.y],
    elbow,
    [to.x, to.y],
  ]);
}

function rotatedContactElbows(move: PointContactMove): [[number, number], [number, number]] {
  return [
    normalizeTuple([move.to.x, move.from.y]),
    normalizeTuple([move.from.x, move.to.y]),
  ];
}

function dedupeWirePoints(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points.map(normalizeTuple)) {
    if (out.length === 0 || !sameTuple(out[out.length - 1], p)) out.push(p);
  }
  return out;
}

function sameLineAndDirection(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return dot >= -1e-9;
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function pointsShareLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
  points: { x: number; y: number }[],
): boolean {
  if (samePoint(a, b)) return false;
  return points.every((point) => Math.abs(cross(a, b, point)) <= 1e-9);
}

function projectionAlong(
  a: { x: number; y: number },
  b: { x: number; y: number },
  point: { x: number; y: number },
): number {
  return (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
}

function pointIsOutwardFromTerminal(
  pin: { x: number; y: number },
  otherPin: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  return projectionAlong(pin, otherPin, point) < -1e-9;
}

function pointOnAnyWire(point: { x: number; y: number }, wires: Wire[]): boolean {
  return wires.some((wire) =>
    wire.points.some(([x, y]) => samePoint(point, { x, y })) ||
    wire.points.some((candidate, idx) => {
      const next = wire.points[idx + 1];
      return next
        ? pointOnSegment(point.x, point.y, candidate[0], candidate[1], next[0], next[1])
        : false;
    }),
  );
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  point: { x: number; y: number },
): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

function sameTuple(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function pointKey(point: { x: number; y: number }): string {
  const p = normalizePoint(point);
  return `${p.x},${p.y}`;
}

function isElbowRoute(points: [number, number][]): boolean {
  if (points.length !== 3) return false;
  const [a, b, c] = points;
  return (
    ((a[0] === b[0] && b[1] === c[1]) ||
      (a[1] === b[1] && b[0] === c[0])) &&
    a[0] !== c[0] &&
    a[1] !== c[1]
  );
}
