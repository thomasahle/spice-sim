// Graph-native editing operations (Model C) — the logic behind the Node tool
// and connectivity edits. See wire-edge-design.md §13 + §16.8. Pure functions
// over a SchematicPage; the editor wires these to gestures.

import {
  nodePos,
  pinNodeIndex,
  type CircuitNode,
  type NodeId,
  type SchematicPage,
  type Wire,
} from "./graphModel.ts";

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
