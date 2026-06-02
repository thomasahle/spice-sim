// Netlist from the model-C graph: a net is a connected component of
// (standalone nodes ∪ pin-nodes) with wires as edges. See wire-edge-design.md
// §16.8. No coordinate matching — connectivity is the stored graph.

import {
  allNodeIds,
  pinNodeIndex,
  type NodeId,
  type SchematicPage,
} from "./graphModel.ts";

class DSU {
  private parent = new Map<NodeId, NodeId>();
  ensure(id: NodeId): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: NodeId): NodeId {
    this.ensure(id);
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: NodeId, b: NodeId): void {
    this.parent.set(this.find(a), this.find(b));
  }
}

export interface GraphNets {
  /** node id → net name */
  netOf: Map<NodeId, string>;
  /** net name → member node ids */
  members: Map<string, NodeId[]>;
}

/** Group node ids into nets (connected components) and name each net.
 *  Naming priority: ground ("0") > an explicit node `name` (label) > auto `n1,n2,…`.
 *  Auto names are assigned in a deterministic order (sorted root id). */
export function buildGraphNets(page: SchematicPage): GraphNets {
  const dsu = new DSU();
  const ids = allNodeIds(page);
  for (const id of ids) dsu.ensure(id);
  for (const wire of page.wires) dsu.union(wire.a, wire.b);

  // Collect explicit / ground names per node.
  const namedNode = new Map<NodeId, string>();
  for (const node of page.nodes ?? []) if (node.name) namedNode.set(node.id, node.name);
  for (const component of page.components) {
    if (component.kind === "GND") for (const pin of component.pins ?? []) namedNode.set(pin, "0");
  }

  // Resolve a name per root: "0" wins outright; otherwise the first explicit name.
  const rootName = new Map<NodeId, string>();
  for (const [id, name] of namedNode) {
    const root = dsu.find(id);
    const existing = rootName.get(root);
    if (existing === undefined || name === "0") rootName.set(root, name);
  }
  // Auto-name remaining roots deterministically.
  const roots = [...new Set(ids.map((id) => dsu.find(id)))].sort();
  let auto = 0;
  for (const root of roots) {
    if (!rootName.has(root)) rootName.set(root, `n${++auto}`);
  }

  const netOf = new Map<NodeId, string>();
  const members = new Map<string, NodeId[]>();
  for (const id of ids) {
    const name = rootName.get(dsu.find(id))!;
    netOf.set(id, name);
    const list = members.get(name);
    if (list) list.push(id);
    else members.set(name, [id]);
  }
  return { netOf, members };
}

/** Convenience: the net name a component pin belongs to. */
export function netOfPin(
  nets: GraphNets,
  page: SchematicPage,
  componentId: string,
  pinIndex: number,
): string | null {
  const component = page.components.find((c) => c.id === componentId);
  if (!component) return null;
  const nodeId = (component.pins ?? [])[pinIndex];
  return nodeId ? (nets.netOf.get(nodeId) ?? null) : null;
}

export { pinNodeIndex };
