// Model C — node-graph helpers. Canonical types live in model.ts; this module
// re-exports them and provides the graph helpers. See wire-edge-design.md §16.
// `pins`/`nodes` are optional on the model types during the migration, so the
// helpers guard with `?? []`.

import {
  makeId,
  pinWorldPos,
  GRAPH_DOC_VERSION,
  type CircuitComponent,
  type CircuitNode,
  type Probe,
  type SchematicPage,
  type Wire,
} from "./model.ts";

export type { CircuitComponent, CircuitNode, Probe, SchematicPage, Wire };
export type NodeId = string;
export type WireId = string;

// Single source of truth lives in model.ts; re-exported here for graph callers.
export { GRAPH_DOC_VERSION };

export function makeNodeId(): NodeId {
  return makeId("n");
}
export function makeWireId(): WireId {
  return makeId("w");
}

export interface PinNodeOwner {
  component: CircuitComponent;
  pinIndex: number;
}

export function pinNodeIndex(page: Pick<SchematicPage, "components">): Map<NodeId, PinNodeOwner> {
  const index = new Map<NodeId, PinNodeOwner>();
  for (const component of page.components) {
    (component.pins ?? []).forEach((nodeId, pinIndex) => index.set(nodeId, { component, pinIndex }));
  }
  return index;
}

export function allNodeIds(page: SchematicPage): NodeId[] {
  const ids: NodeId[] = (page.nodes ?? []).map((node) => node.id);
  for (const component of page.components) ids.push(...(component.pins ?? []));
  return ids;
}

export function nodePos(
  page: SchematicPage,
  id: NodeId,
  pinIdx?: Map<NodeId, PinNodeOwner>,
): { x: number; y: number } | null {
  const node = (page.nodes ?? []).find((n) => n.id === id);
  if (node) return { x: node.x, y: node.y };
  const owner = (pinIdx ?? pinNodeIndex(page)).get(id);
  if (owner) return pinWorldPos(owner.component, owner.pinIndex);
  return null;
}

export function wirePolyline(
  page: SchematicPage,
  wire: Wire,
  pinIdx?: Map<NodeId, PinNodeOwner>,
): [number, number][] | null {
  const idx = pinIdx ?? pinNodeIndex(page);
  const a = nodePos(page, wire.a, idx);
  const b = nodePos(page, wire.b, idx);
  if (!a || !b) return null;
  return [[a.x, a.y], ...wire.bends, [b.x, b.y]];
}
