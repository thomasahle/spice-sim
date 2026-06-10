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

/** After a selection drag, re-square the rubber-banded boundary wires
 *  (right-angle mode): a wire with exactly one endpoint on a moved node keeps
 *  its old bends, so the segment next to the moved end can come out diagonal.
 *  Insert one corner bend there, keeping the bend chain's existing axis where
 *  one exists so the wire turns at the bend instead of zig-zagging. */
export function squareDraggedWireEnds(
  page: SchematicPage,
  movedNodeIds: Set<NodeId>,
): SchematicPage {
  const idx = pinNodeIndex(page);
  let changed = false;
  const wires = page.wires.map((wire) => {
    const aMoved = movedNodeIds.has(wire.a);
    const bMoved = movedNodeIds.has(wire.b);
    if (aMoved === bMoved) return wire; // untouched, or rigid internal wire
    const poly = wirePolyline(page, wire, idx);
    if (!poly || poly.length < 2) return wire;
    // Work from the moved end: p = moved endpoint, q = its neighbour vertex.
    const fromA = aMoved;
    const p = fromA ? poly[0] : poly[poly.length - 1];
    const q = fromA ? poly[1] : poly[poly.length - 2];
    const diagonal = Math.abs(p[0] - q[0]) > 1e-6 && Math.abs(p[1] - q[1]) > 1e-6;
    if (!diagonal) return wire;
    // Preserve the axis of the segment arriving at q from the stationary side
    // (if there is one and it is axis-aligned): the new corner extends q's
    // perpendicular. Otherwise default to horizontal-then-vertical from q.
    const qPrev = fromA ? poly[2] : poly[poly.length - 3];
    let corner: [number, number];
    if (qPrev && Math.abs(qPrev[1] - q[1]) < 1e-6) {
      corner = [q[0], p[1]]; // arrive horizontal → leave vertical
    } else if (qPrev && Math.abs(qPrev[0] - q[0]) < 1e-6) {
      corner = [p[0], q[1]]; // arrive vertical → leave horizontal
    } else {
      corner = [p[0], q[1]];
    }
    changed = true;
    return {
      ...wire,
      bends: fromA ? [corner, ...wire.bends] : [...wire.bends, corner],
    };
  });
  return changed ? { ...page, wires } : page;
}

/** Inline-splice a dropped 2-pin span into the wire both pins landed on.
 *  Used by the component-drag drop path: matches the placement gesture's
 *  "both pins on the same collinear wire → splice" rule
 *  (component-placement-design case 2) while single-pin grazes and sweeps
 *  stay unconnected (§16 no-auto-connect). Both pins must lie strictly
 *  inside the SAME segment of one wire — bends on either side are kept.
 *  Returns null when no such wire exists. */
export function splicePinSpanIntoWire(
  page: SchematicPage,
  pinA: { id: NodeId; x: number; y: number },
  pinB: { id: NodeId; x: number; y: number },
): SchematicPage | null {
  const idx = pinNodeIndex(page);
  const strictlyInside = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) =>
    pointOnSeg(px, py, x1, y1, x2, y2) &&
    !(Math.abs(px - x1) < 1e-6 && Math.abs(py - y1) < 1e-6) &&
    !(Math.abs(px - x2) < 1e-6 && Math.abs(py - y2) < 1e-6);
  for (const wire of page.wires) {
    if (wire.a === pinA.id || wire.b === pinA.id) continue;
    if (wire.a === pinB.id || wire.b === pinB.id) continue;
    const poly = wirePolyline(page, wire, idx);
    if (!poly) continue;
    for (let i = 0; i < poly.length - 1; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[i + 1];
      if (!strictlyInside(pinA.x, pinA.y, x1, y1, x2, y2)) continue;
      if (!strictlyInside(pinB.x, pinB.y, x1, y1, x2, y2)) continue;
      const dA = Math.hypot(pinA.x - x1, pinA.y - y1);
      const dB = Math.hypot(pinB.x - x1, pinB.y - y1);
      const [near, far] = dA <= dB ? [pinA, pinB] : [pinB, pinA];
      const beforeBends = poly.slice(1, i + 1).map(([bx, by]) => [bx, by] as [number, number]);
      const afterBends = poly
        .slice(i + 1, poly.length - 1)
        .map(([bx, by]) => [bx, by] as [number, number]);
      const e1: Wire = { id: wire.id, a: wire.a, b: near.id, bends: beforeBends };
      const e2: Wire = { id: makeWireId(), a: far.id, b: wire.b, bends: afterBends };
      return {
        ...page,
        wires: page.wires.flatMap((w) => (w.id === wire.id ? [e1, e2] : [w])),
      };
    }
  }
  return null;
}
