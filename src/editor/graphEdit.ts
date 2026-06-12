// Graph-native editing operations (Model C) — the logic behind the Node tool
// and connectivity edits. See wire-edge-design.md §13 + §16.8. Pure functions
// over a SchematicPage; the editor wires these to gestures.

import {
  makeNodeId,
  makeWireId,
  nodePos,
  pinNodeIndex,
  wirePolyline,
  type CircuitNode,
  type NodeId,
  type SchematicPage,
  type Wire,
} from "./graphModel.ts";

/** Is (px,py) on the segment (x1,y1)-(x2,y2) (collinear + within the span)? */
function pointOnSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return dot >= -1e-6 && dot <= len2 + 1e-6;
}

/** Edges incident to a node (a wire with this node at either end). */
export function incidentWires(page: SchematicPage, nodeId: NodeId): Wire[] {
  return page.wires.filter((w) => w.a === nodeId || w.b === nodeId);
}

/** Number of edges meeting at a node. */
export function nodeDegree(page: SchematicPage, nodeId: NodeId): number {
  return incidentWires(page, nodeId).length;
}

function isPinNode(page: SchematicPage, nodeId: NodeId): boolean {
  return pinNodeIndex(page).has(nodeId);
}

/** Drop standalone nodes that are degree-0 and carry no name and no probe. */
export function gcOrphanNodes(page: SchematicPage): SchematicPage {
  const probed = new Set(page.probes.map((p) => p.node));
  const current = page.nodes ?? [];
  const nodes = current.filter(
    (n) => n.name !== undefined || probed.has(n.id) || incidentWires(page, n.id).length > 0,
  );
  return nodes.length === current.length ? page : { ...page, nodes };
}

/** Delete an edge (the Node tool's "delete segment / split"): removing the edge
 *  severs that connection — the graph splits naturally — then orphan nodes GC. */
export function deleteEdge(page: SchematicPage, wireId: string): SchematicPage {
  const wires = page.wires.filter((w) => w.id !== wireId);
  if (wires.length === page.wires.length) return page;
  return gcOrphanNodes({ ...page, wires });
}

/** Bends of an edge ordered to start from `fromNodeId`'s end. */
function bendsFrom(edge: Wire, fromNodeId: NodeId): [number, number][] {
  return edge.a === fromNodeId ? edge.bends : edge.bends.slice().reverse();
}

/** Delete a node (the Node tool's "delete node, heal"):
 *  - pin-node: not deletable here (delete the component instead) → unchanged;
 *  - degree 0: just remove it;
 *  - degree 1: remove it and trim its edge;
 *  - degree 2: HEAL — merge the two edges into one joining the far endpoints,
 *    keeping the removed node's position as a bend so geometry is preserved;
 *  - degree ≥ 3: remove the node and its incident edges (explicit disconnect). */
export function deleteNode(page: SchematicPage, nodeId: NodeId): SchematicPage {
  if (isPinNode(page, nodeId)) return page;
  const node = (page.nodes ?? []).find((n) => n.id === nodeId);
  if (!node) return page;
  const inc = incidentWires(page, nodeId);

  const dropNode = (p: SchematicPage): SchematicPage => ({
    ...p,
    nodes: (p.nodes ?? []).filter((n) => n.id !== nodeId),
  });

  if (inc.length === 0) return dropNode(page);

  if (inc.length === 1) {
    return gcOrphanNodes(dropNode({ ...page, wires: page.wires.filter((w) => w !== inc[0]) }));
  }

  if (inc.length === 2) {
    const [e1, e2] = inc;
    const far1 = e1.a === nodeId ? e1.b : e1.a;
    const far2 = e2.a === nodeId ? e2.b : e2.a;
    const rest = page.wires.filter((w) => w !== e1 && w !== e2);
    if (far1 === far2) {
      // Both edges go to the same node — healing would self-loop; just remove both.
      return gcOrphanNodes(dropNode({ ...page, wires: rest }));
    }
    const here = nodePos(page, nodeId) ?? { x: node.x, y: node.y };
    // far1 → (e1 bends) → node → (e2 bends) → far2
    const merged: Wire = {
      id: e1.id,
      a: far1,
      b: far2,
      bends: [...bendsFrom(e1, far1), [here.x, here.y], ...bendsFrom(e2, nodeId)],
    };
    return gcOrphanNodes(dropNode({ ...page, wires: [...rest, merged] }));
  }

  // degree ≥ 3: remove the junction and everything meeting it.
  const incSet = new Set(inc);
  return gcOrphanNodes(dropNode({ ...page, wires: page.wires.filter((w) => !incSet.has(w)) }));
}

/** Split a wire by removing one of its polyline segments (Node tool §13.5):
 *  the edge becomes the two fragments on either side, which are now separate
 *  nets. The split vertices become standalone endpoint nodes. A fragment with
 *  < 2 points (deleting an end segment, or the only segment of a 2-point wire)
 *  is dropped. `segIndex` is the 0-based segment of wirePolyline(edge). */
export function splitEdgeAtSegment(
  page: SchematicPage,
  wireId: string,
  segIndex: number,
): SchematicPage {
  const edge = page.wires.find((w) => w.id === wireId);
  if (!edge) return page;
  const poly = wirePolyline(page, edge, pinNodeIndex(page));
  if (!poly) return page;
  const n = poly.length - 1; // segment count
  if (segIndex < 0 || segIndex >= n) return page;

  const newNodes: CircuitNode[] = [];
  const newWires: Wire[] = [];
  const toBends = (slice: [number, number][]) => slice.map(([x, y]) => [x, y] as [number, number]);

  // Left fragment: a → vertex(segIndex), only if it has a real segment.
  if (segIndex >= 1) {
    const end: CircuitNode = { id: makeNodeId(), x: poly[segIndex][0], y: poly[segIndex][1] };
    newNodes.push(end);
    newWires.push({ id: edge.id, a: edge.a, b: end.id, bends: toBends(poly.slice(1, segIndex)) });
  }
  // Right fragment: vertex(segIndex+1) → b.
  if (segIndex + 1 <= n - 1) {
    const start: CircuitNode = { id: makeNodeId(), x: poly[segIndex + 1][0], y: poly[segIndex + 1][1] };
    newNodes.push(start);
    newWires.push({ id: makeWireId(), a: start.id, b: edge.b, bends: toBends(poly.slice(segIndex + 2, n)) });
  }
  return gcOrphanNodes({
    ...page,
    nodes: [...(page.nodes ?? []), ...newNodes],
    wires: page.wires.flatMap((w) => (w.id === wireId ? newWires : [w])),
  });
}

/** Find the wire segment lying BETWEEN two graph nodes that are consecutive
 *  vertices of that wire's polyline (Node tool's "split between two selected
 *  nodes", §13.9.7). Graph nodes only appear at a wire's polyline endpoints
 *  (interior vertices are bends, which are not nodes), so two graph nodes are
 *  consecutive polyline vertices exactly when they are the two endpoints of a
 *  bend-free edge — segment index 0. Returns `{ wireId, segIndex }` for the
 *  first such wire, or null. Feed the result to {@link splitEdgeAtSegment}. */
export function segmentBetweenNodes(
  page: SchematicPage,
  nodeA: NodeId,
  nodeB: NodeId,
): { wireId: string; segIndex: number } | null {
  if (nodeA === nodeB) return null;
  for (const w of page.wires) {
    if (w.bends.length !== 0) continue;
    if ((w.a === nodeA && w.b === nodeB) || (w.a === nodeB && w.b === nodeA)) {
      return { wireId: w.id, segIndex: 0 };
    }
  }
  return null;
}

/** Point a wire's endpoint at a different node (drop-to-connect onto a node). */
export function setWireEndpoint(
  page: SchematicPage,
  wireId: string,
  end: "a" | "b",
  nodeId: NodeId,
): SchematicPage {
  const wires = page.wires.map((w) => (w.id === wireId ? { ...w, [end]: nodeId } : w));
  return gcOrphanNodes({ ...page, wires });
}

/** Add a standalone node (e.g. a junction or free end). */
export function addNode(page: SchematicPage, node: CircuitNode): SchematicPage {
  return { ...page, nodes: [...(page.nodes ?? []), node] };
}

/** Minimal geometry result for {@link applyArrangeGeometry} — the shape an ELK
 *  auto-arrange (or any relayout) emits: new component positions + new wire
 *  polylines, keyed by id. A legacy SchematicPage satisfies this structurally. */
export interface ArrangeGeometry {
  components: { id: string; x: number; y: number }[];
  wires: { id: string; points: [number, number][] }[];
}

/** Apply a relayout's GEOMETRY onto the graph while PRESERVING its topology.
 *  Auto-arrange (ELK) used to rebuild the graph from its geometric output via a
 *  coincidence-merge importer, which fused two distinct nets whenever ELK routed
 *  their wires to touch (the Nodes-4→3 bug). Instead, keep the graph's nodes +
 *  edges (connectivity is already known-correct) and only move things:
 *   - component positions (pin-nodes derive, so incident wires rubber-band);
 *   - wire bends = the interior points of the matching result polyline;
 *   - standalone node positions = the matching result wire's endpoint.
 *  Wires/components are matched by id (the relayout preserves ids). */
export function applyArrangeGeometry(
  page: SchematicPage,
  result: ArrangeGeometry,
): SchematicPage {
  const compById = new Map(result.components.map((c) => [c.id, c]));
  const wireById = new Map(result.wires.map((w) => [w.id, w]));

  const components = page.components.map((c) => {
    const moved = compById.get(c.id);
    return moved ? { ...c, x: moved.x, y: moved.y } : c;
  });

  const wires = page.wires.map((w) => {
    const rw = wireById.get(w.id);
    if (!rw || rw.points.length < 2) return w;
    const bends = rw.points.slice(1, -1).map(([x, y]) => [x, y] as [number, number]);
    return { ...w, bends };
  });

  // Standalone node positions come from the matching result wire's endpoint
  // (poly[0] = the a-end, poly[last] = the b-end, per wirePolyline's order).
  // Pin-node ids never appear in page.nodes, so writing them here is harmless.
  const nodePos = new Map<NodeId, { x: number; y: number }>();
  for (const w of page.wires) {
    const rw = wireById.get(w.id);
    if (!rw || rw.points.length < 2) continue;
    const first = rw.points[0];
    const last = rw.points[rw.points.length - 1];
    if (!nodePos.has(w.a)) nodePos.set(w.a, { x: first[0], y: first[1] });
    if (!nodePos.has(w.b)) nodePos.set(w.b, { x: last[0], y: last[1] });
  }
  const nodes = (page.nodes ?? []).map((n) => {
    const np = nodePos.get(n.id);
    return np ? { ...n, x: np.x, y: np.y } : n;
  });

  return { ...page, components, nodes, wires };
}

/** Split the edge whose polyline passes through (x,y) at an INTERIOR point into
 *  two edges meeting at a new junction node — the T-junction primitive used by
 *  draw-onto-wire (§10), probe-on-wire (§11/§9d), and node-tool segment ops.
 *  Returns the updated page + the new junction node id, or null if (x,y) isn't
 *  on any edge's interior (it's at an existing vertex/node, or off all wires). */
export function splitEdgeAtPoint(
  page: SchematicPage,
  x: number,
  y: number,
): { page: SchematicPage; nodeId: NodeId } | null {
  const idx = pinNodeIndex(page);
  for (const wire of page.wires) {
    const poly = wirePolyline(page, wire, idx);
    if (!poly || poly.length < 2) continue;
    for (let i = 0; i < poly.length - 1; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[i + 1];
      // A hit at an existing vertex (endpoint/bend) is not an interior split.
      if (
        (Math.abs(x - x1) < 1e-6 && Math.abs(y - y1) < 1e-6) ||
        (Math.abs(x - x2) < 1e-6 && Math.abs(y - y2) < 1e-6)
      ) {
        continue;
      }
      if (!pointOnSeg(x, y, x1, y1, x2, y2)) continue;
      // poly = [nodePos(a), ...bends, nodePos(b)]; split at segment i.
      const junction: CircuitNode = { id: makeNodeId(), x, y };
      const beforeBends = poly.slice(1, i + 1).map(([bx, by]) => [bx, by] as [number, number]);
      const afterBends = poly
        .slice(i + 1, poly.length - 1)
        .map(([bx, by]) => [bx, by] as [number, number]);
      const e1: Wire = { id: wire.id, a: wire.a, b: junction.id, bends: beforeBends };
      const e2: Wire = { id: makeWireId(), a: junction.id, b: wire.b, bends: afterBends };
      return {
        page: {
          ...page,
          nodes: [...(page.nodes ?? []), junction],
          wires: page.wires.flatMap((w) => (w.id === wire.id ? [e1, e2] : [w])),
        },
        nodeId: junction.id,
      };
    }
  }
  return null;
}

/** ONE rule for how wires follow a move of (dx,dy), applied identically to
 *  the live drag preview, the drop, and arrow-key nudges (WYSIWYG):
 *   - wire in `rigidWireIds` (explicitly selected): caller translates it;
 *   - BOTH endpoints moved (wire internal to the moving group): bends
 *     translate rigidly so the wire keeps its shape — without this, a
 *     marquee group-drag froze every corner while the pins moved and the
 *     circuit collapsed into diagonals;
 *   - ONE endpoint moved (boundary wire): the wire re-routes as a fresh
 *     stationary-end → moved-end "L", keeping the old departure axis at the
 *     stationary end where one existed. Stale bends are DISCARDED — the old
 *     behaviour of appending a squaring corner per drop accumulated a
 *     staircase of every position the part had ever been dragged through;
 *   - no endpoint moved: untouched.
 *  With `orthogonal` false (diagonal-wires mode) boundary wires become
 *  direct point-to-point segments. */
export function reflowWiresAfterMove(
  page: SchematicPage,
  movedNodeIds: Set<NodeId>,
  delta: { x: number; y: number },
  rigidWireIds: Set<string>,
  orthogonal: boolean,
  // The live drag preview is idempotent (it recomputes from drag-start
  // geometry every frame), so it passes the wires' DRAG-START bends here;
  // page.wires may already hold a previous frame's reflow.
  initialBendsById?: Map<string, [number, number][]>,
): SchematicPage {
  if (movedNodeIds.size === 0) return page;
  const idx = pinNodeIndex(page);
  const baseBends = (wire: Wire) => initialBendsById?.get(wire.id) ?? wire.bends;
  const zero = delta.x === 0 && delta.y === 0;
  let changed = false;
  const wires = page.wires.map((wire) => {
    if (rigidWireIds.has(wire.id)) return wire;
    const aMoved = movedNodeIds.has(wire.a);
    const bMoved = movedNodeIds.has(wire.b);
    if (!aMoved && !bMoved) return wire;
    changed = true;
    const bends = baseBends(wire);
    // Snapped back to the start: restore the original shape exactly.
    if (zero) return { ...wire, bends };
    if (aMoved && bMoved) {
      return {
        ...wire,
        bends: bends.map(([x, y]) => [x + delta.x, y + delta.y] as [number, number]),
      };
    }
    const fixedEnd = aMoved ? wire.b : wire.a;
    const movedEnd = aMoved ? wire.a : wire.b;
    const from = nodePos(page, fixedEnd, idx);
    const to = nodePos(page, movedEnd, idx);
    if (!from || !to) return wire;
    if (!orthogonal || Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6) {
      return { ...wire, bends: [] };
    }
    // Keep the old departure axis at the stationary end: if the wire used to
    // leave that end vertically, the new L leaves vertically too. For a
    // previously-straight wire, derive the axis from the pre-move position
    // of the moved endpoint instead.
    const oldNeighbor = aMoved ? bends[bends.length - 1] : bends[0];
    const verticalFirst = oldNeighbor
      ? Math.abs(oldNeighbor[0] - from.x) < 1e-6
      : Math.abs(to.x - delta.x - from.x) < 1e-6;
    const corner: [number, number] = verticalFirst ? [from.x, to.y] : [to.x, from.y];
    return { ...wire, bends: [corner] };
  });
  return changed ? { ...page, wires } : page;
}

/** Where a point sits on a polyline: the index of the segment containing it
 *  and its arc-length distance from the polyline start. Null if not on it. */
function polylineArcLocation(
  poly: [number, number][],
  pt: { x: number; y: number },
): { seg: number; arc: number } | null {
  let travelled = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[i + 1];
    if (pointOnSeg(pt.x, pt.y, x1, y1, x2, y2)) {
      return { seg: i, arc: travelled + Math.hypot(pt.x - x1, pt.y - y1) };
    }
    travelled += Math.hypot(x2 - x1, y2 - y1);
  }
  return null;
}

/** Inline-splice a 2-pin span into the wire both pins landed on: the wire is
 *  cut between the pins and the two remainders attach to the pin nodes.
 *  Bends OUTSIDE the cut span are preserved (cutting the top run of a
 *  rectangular loop must not collapse its corners into diagonals); bends
 *  between the pins are consumed by the component body. The pins may sit on
 *  different segments of the same wire. Pins coinciding with the wire's own
 *  endpoints are refused (that would need a node merge, not a splice).
 *  Shared by component placement-on-wire and the drag-drop-onto-wire path
 *  (component-placement-design case 2); single-pin grazes and sweeps stay
 *  unconnected (§16 no-auto-connect). Returns null when no wire matches. */
export function splicePinSpanIntoWire(
  page: SchematicPage,
  pinA: { id: NodeId; x: number; y: number },
  pinB: { id: NodeId; x: number; y: number },
): SchematicPage | null {
  const idx = pinNodeIndex(page);
  const samePt = (a: { x: number; y: number }, b: [number, number]) =>
    Math.abs(a.x - b[0]) < 1e-6 && Math.abs(a.y - b[1]) < 1e-6;
  for (const wire of page.wires) {
    if (wire.a === pinA.id || wire.b === pinA.id) continue;
    if (wire.a === pinB.id || wire.b === pinB.id) continue;
    const poly = wirePolyline(page, wire, idx);
    if (!poly || poly.length < 2) continue;
    if (samePt(pinA, poly[0]) || samePt(pinA, poly[poly.length - 1])) continue;
    if (samePt(pinB, poly[0]) || samePt(pinB, poly[poly.length - 1])) continue;
    const locA = polylineArcLocation(poly, pinA);
    const locB = polylineArcLocation(poly, pinB);
    if (!locA || !locB) continue;
    const [near, far] =
      locA.arc <= locB.arc
        ? [{ pin: pinA, loc: locA }, { pin: pinB, loc: locB }]
        : [{ pin: pinB, loc: locB }, { pin: pinA, loc: locA }];
    const isPinPoint = (p: [number, number]) => samePt(near.pin, p) || samePt(far.pin, p);
    const beforeBends = poly
      .slice(1, near.loc.seg + 1)
      .filter((p) => !isPinPoint(p))
      .map(([bx, by]) => [bx, by] as [number, number]);
    const afterBends = poly
      .slice(far.loc.seg + 1, poly.length - 1)
      .filter((p) => !isPinPoint(p))
      .map(([bx, by]) => [bx, by] as [number, number]);
    const e1: Wire = { id: wire.id, a: wire.a, b: near.pin.id, bends: beforeBends };
    const e2: Wire = { id: makeWireId(), a: far.pin.id, b: wire.b, bends: afterBends };
    return {
      ...page,
      wires: page.wires.flatMap((w) => (w.id === wire.id ? [e1, e2] : [w])),
    };
  }
  return null;
}

/** After re-orienting a 2-pin component in place, un-cross its boundary
 *  wires. Successive 90° rotations can land the pins swapped side-to-side;
 *  wires follow their pin NODES, so both then run collinearly THROUGH the
 *  body to reach the far pin — visually they overlap into one line with two
 *  opposite-direction nets. When BOTH attached wires' end segments pass
 *  through the opposite pin, swapping the two endpoints restores each wire
 *  to its own side (the net effect the user wanted: the symbol turned
 *  around in place). */
export function uncrossTwoPinBoundaryWires(
  page: SchematicPage,
  pinA: { id: NodeId; x: number; y: number },
  pinB: { id: NodeId; x: number; y: number },
): SchematicPage {
  const idx = pinNodeIndex(page);
  const wiresAtPin = (pinId: NodeId) =>
    page.wires.filter((w) => w.a === pinId || w.b === pinId);
  const aWires = wiresAtPin(pinA.id);
  const bWires = wiresAtPin(pinB.id);
  if (aWires.length !== 1 || bWires.length !== 1) return page;
  const [wA] = aWires;
  const [wB] = bWires;
  if (wA.id === wB.id) return page;
  const endSegmentCrosses = (
    wire: Wire,
    pin: { id: NodeId; x: number; y: number },
    other: { x: number; y: number },
  ): boolean => {
    const poly = wirePolyline(page, wire, idx);
    if (!poly || poly.length < 2) return false;
    const atA = wire.a === pin.id;
    const end = atA ? poly[0] : poly[poly.length - 1];
    const neighbor = atA ? poly[1] : poly[poly.length - 2];
    if (Math.abs(end[0] - pin.x) > 1e-6 || Math.abs(end[1] - pin.y) > 1e-6) return false;
    return (
      pointOnSeg(other.x, other.y, neighbor[0], neighbor[1], end[0], end[1]) &&
      !(Math.abs(other.x - neighbor[0]) < 1e-6 && Math.abs(other.y - neighbor[1]) < 1e-6)
    );
  };
  if (!endSegmentCrosses(wA, pinA, pinB)) return page;
  if (!endSegmentCrosses(wB, pinB, pinA)) return page;
  const swapEndpoint = (wire: Wire, from: NodeId, to: NodeId): Wire => ({
    ...wire,
    a: wire.a === from ? to : wire.a,
    b: wire.b === from ? to : wire.b,
  });
  return {
    ...page,
    wires: page.wires.map((w) => {
      if (w.id === wA.id) return swapEndpoint(w, pinA.id, pinB.id);
      if (w.id === wB.id) return swapEndpoint(w, pinB.id, pinA.id);
      return w;
    }),
  };
}

/** Attach an unwired pin node to whatever lies exactly under it:
 *  - a standalone (unnamed) node → re-point that node's wires and probes at
 *    the pin (node merge),
 *  - a wire interior or bend vertex → split the edge there with the pin as
 *    the junction.
 *  Used when a single-pin part (ground, net label port) is deliberately
 *  placed or dropped onto a wire — without this it merely overlaps: the
 *  netlist connects it by coordinate coincidence, but dragging it away
 *  reveals there was never a graph edge. Returns null when the pin is
 *  already wired or nothing attachable is under it. */
export function attachPinAtPoint(
  page: SchematicPage,
  pin: { id: NodeId; x: number; y: number },
): SchematicPage | null {
  if (incidentWires(page, pin.id).length > 0) return null;
  const idx = pinNodeIndex(page);
  const samePt = (x: number, y: number, p: [number, number]) =>
    Math.abs(x - p[0]) < 1e-6 && Math.abs(y - p[1]) < 1e-6;

  // A standalone node at the same coordinate: merge it into the pin.
  const node = (page.nodes ?? []).find(
    (n) =>
      n.id !== pin.id &&
      n.name === undefined &&
      Math.abs(n.x - pin.x) < 1e-6 &&
      Math.abs(n.y - pin.y) < 1e-6,
  );
  if (node) {
    let changed = false;
    const wires = page.wires.map((w) => {
      if (w.a !== node.id && w.b !== node.id) return w;
      changed = true;
      return {
        ...w,
        a: w.a === node.id ? pin.id : w.a,
        b: w.b === node.id ? pin.id : w.b,
      };
    });
    const probes = page.probes.map((pr) =>
      pr.node === node.id ? { ...pr, node: pin.id } : pr,
    );
    if (!changed) return null;
    return gcOrphanNodes({ ...page, wires, probes });
  }

  // A wire passing exactly under the pin: split it at the pin.
  for (const wire of page.wires) {
    const poly = wirePolyline(page, wire, idx);
    if (!poly || poly.length < 2) continue;
    if (samePt(pin.x, pin.y, poly[0]) || samePt(pin.x, pin.y, poly[poly.length - 1])) continue;
    for (let i = 0; i < poly.length - 1; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[i + 1];
      if (!pointOnSeg(pin.x, pin.y, x1, y1, x2, y2)) continue;
      const beforeBends = poly
        .slice(1, i + 1)
        .filter((p) => !samePt(pin.x, pin.y, p))
        .map(([bx, by]) => [bx, by] as [number, number]);
      const afterBends = poly
        .slice(i + 1, poly.length - 1)
        .filter((p) => !samePt(pin.x, pin.y, p))
        .map(([bx, by]) => [bx, by] as [number, number]);
      const e1: Wire = { id: wire.id, a: wire.a, b: pin.id, bends: beforeBends };
      const e2: Wire = { id: makeWireId(), a: pin.id, b: wire.b, bends: afterBends };
      return {
        ...page,
        wires: page.wires.flatMap((w) => (w.id === wire.id ? [e1, e2] : [w])),
      };
    }
  }
  return null;
}

/** Detach a to-be-deleted component from its wires WITHOUT destroying them
 *  (Illustrator-feel: the connection art survives the object):
 *  - a 2-pin part with exactly one wire per pin and distinct far ends gets
 *    BRIDGED — the two wires merge into one running across the body's span
 *    (the inverse of an inline splice), pin positions becoming bends;
 *  - every other wired pin becomes a fresh standalone node at the pin's
 *    position, so its wires survive as stubs (probes re-anchor with them).
 *  Operates while the components are still present (pin positions resolve);
 *  the caller removes the components afterwards. `deletedWireIds` are wires
 *  the user is deleting in the same gesture — they neither bridge nor stub. */
export function detachComponentWires(
  page: SchematicPage,
  deletedComponentIds: Set<string>,
  deletedWireIds: Set<string>,
): SchematicPage {
  let wires = page.wires.filter((w) => !deletedWireIds.has(w.id));
  const nodes = [...(page.nodes ?? [])];
  let probes = page.probes;
  const idx = pinNodeIndex(page);
  for (const c of page.components) {
    if (!deletedComponentIds.has(c.id)) continue;
    const pins = c.pins ?? [];
    const incident = pins.map((pinId) => wires.filter((w) => w.a === pinId || w.b === pinId));
    if (pins.length === 2 && incident[0].length === 1 && incident[1].length === 1) {
      const [wA] = incident[0];
      const [wB] = incident[1];
      const farA = wA.a === pins[0] ? wA.b : wA.a;
      const farB = wB.a === pins[1] ? wB.b : wB.a;
      if (wA.id !== wB.id && farA !== farB) {
        const pA = nodePos(page, pins[0], idx);
        const pB = nodePos(page, pins[1], idx);
        if (pA && pB) {
          const merged: Wire = {
            id: wA.id,
            a: farA,
            b: farB,
            bends: [
              ...bendsFrom(wA, farA),
              [pA.x, pA.y],
              [pB.x, pB.y],
              ...bendsFrom(wB, pins[1]),
            ],
          };
          wires = wires.flatMap((w) =>
            w.id === wA.id ? [merged] : w.id === wB.id ? [] : [w],
          );
          continue;
        }
      }
    }
    // Stub conversion: each wired pin becomes a standalone node in place.
    pins.forEach((pinId) => {
      if (!wires.some((w) => w.a === pinId || w.b === pinId)) return;
      const p = nodePos(page, pinId, idx);
      if (!p) return;
      const nodeId = makeNodeId();
      nodes.push({ id: nodeId, x: p.x, y: p.y });
      wires = wires.map((w) =>
        w.a === pinId || w.b === pinId
          ? { ...w, a: w.a === pinId ? nodeId : w.a, b: w.b === pinId ? nodeId : w.b }
          : w,
      );
      probes = probes.map((pr) => (pr.node === pinId ? { ...pr, node: nodeId } : pr));
    });
  }
  return { ...page, wires, nodes, probes };
}
