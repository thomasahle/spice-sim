// Legacy (polyline) → Model-C (node-graph) conversion. See wire-edge-design.md
// §16.3. Deterministic and connectivity-lossless: it reuses the legacy pin
// geometry and coordinate key, materializes junctions, and turns each polyline
// into edges between *anchor* nodes (pins / probes / endpoints / shared
// vertices) with the in-between vertices kept as bends.

import { getPinLayout, pinWorldPos } from "./model.ts";
import type { CircuitDoc } from "./model.ts";
import type {
  LegacyCircuitComponent as LegacyComponent,
  LegacyCircuitDoc,
  LegacyProbe,
  LegacySchematicPage as LegacyPage,
  LegacyWire,
} from "./legacyModel.ts";
import { coordKey } from "./netlist.ts";
import { pointOnSegment, samePoint } from "./geometry.ts";
import {
  makeNodeId,
  makeWireId,
  nodePos,
  pinNodeIndex,
  wirePolyline,
  type CircuitComponent,
  type CircuitNode,
  type NodeId,
  type Probe,
  type SchematicPage,
  type Wire,
} from "./graphModel.ts";

type Pt = [number, number];
const key = (x: number, y: number): string => `${coordKey(x)},${coordKey(y)}`;

function push<K, V>(map: Map<K, V[]>, k: K, v: V): void {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
}

/** Insert any `breaks` point that lies on a segment's interior as a vertex,
 *  sorted along the segment — so all connection points become real vertices. */
function insertBreaks(points: Pt[], breaks: { x: number; y: number }[]): Pt[] {
  if (points.length < 2) return points.map((p) => [p[0], p[1]] as Pt);
  const out: Pt[] = [[points[0][0], points[0][1]]];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const mids = breaks
      .filter(
        (p) =>
          pointOnSegment(p.x, p.y, x1, y1, x2, y2) &&
          !samePoint(p, { x: x1, y: y1 }) &&
          !samePoint(p, { x: x2, y: y2 }),
      )
      .map((p) => ({ p, t: (p.x - x1) * (x2 - x1) + (p.y - y1) * (y2 - y1) }))
      .sort((a, b) => a.t - b.t);
    const seen = new Set<string>();
    for (const { p } of mids) {
      const k = key(p.x, p.y);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([p.x, p.y]);
    }
    out.push([x2, y2]);
  }
  // Drop consecutive duplicates.
  const dedup: Pt[] = [];
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (!last || !samePoint({ x: last[0], y: last[1] }, { x: p[0], y: p[1] })) dedup.push(p);
  }
  return dedup;
}

export function legacyPageToGraph(legacy: LegacyPage): SchematicPage {
  // 1. Pin-nodes (one per component pin); remember the pin-node at each coord.
  const pinNodeAt = new Map<string, NodeId>();
  const components: CircuitComponent[] = legacy.components.map((c) => {
    const count = getPinLayout(c).length;
    const pins: NodeId[] = [];
    for (let i = 0; i < count; i++) {
      const id = makeNodeId();
      pins.push(id);
      const wp = pinWorldPos(c, i);
      pinNodeAt.set(key(wp.x, wp.y), id);
    }
    return {
      id: c.id,
      kind: c.kind,
      x: c.x,
      y: c.y,
      rotation: c.rotation,
      mirrored: c.mirrored,
      value: c.value,
      label: c.label,
      params: c.params,
      pins,
    };
  });

  // Break points = all pins + probes + wire endpoints, so wires split there.
  const pinPts = legacy.components.flatMap((c) => {
    const count = getPinLayout(c).length;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) out.push(pinWorldPos(c, i));
    return out;
  });
  const probePts = legacy.probes.map((p) => ({ x: p.x, y: p.y }));
  const wireEndpts = legacy.wires.flatMap((w) =>
    w.points.length >= 2
      ? [
          { x: w.points[0][0], y: w.points[0][1] },
          { x: w.points[w.points.length - 1][0], y: w.points[w.points.length - 1][1] },
        ]
      : [],
  );
  const breaks = [...pinPts, ...probePts, ...wireEndpts];

  // 2. Materialize junctions inside each wire.
  const matWires = legacy.wires.map((w) => insertBreaks(w.points as Pt[], breaks));

  // 3. Which coords are anchors (become nodes) vs bends.
  const wiresAtCoord = new Map<string, Set<number>>();
  matWires.forEach((pts, wi) => {
    for (const [x, y] of pts) {
      const k = key(x, y);
      const set = wiresAtCoord.get(k);
      if (set) set.add(wi);
      else wiresAtCoord.set(k, new Set([wi]));
    }
  });
  const probeKeys = new Set(probePts.map((p) => key(p.x, p.y)));
  const isAnchor = (x: number, y: number, isEndpoint: boolean): boolean => {
    const k = key(x, y);
    return (
      pinNodeAt.has(k) ||
      probeKeys.has(k) ||
      isEndpoint ||
      (wiresAtCoord.get(k)?.size ?? 0) >= 2
    );
  };

  // 4. Standalone nodes (deduped by coord); pins resolve to their pin-node.
  const standaloneAt = new Map<string, CircuitNode>();
  const nodeIdAt = (x: number, y: number): NodeId => {
    const k = key(x, y);
    const pin = pinNodeAt.get(k);
    if (pin) return pin;
    const existing = standaloneAt.get(k);
    if (existing) return existing.id;
    const node: CircuitNode = { id: makeNodeId(), x, y };
    standaloneAt.set(k, node);
    return node.id;
  };

  // 5. Each polyline → edges between consecutive anchors (interior = bends).
  const wires: Wire[] = [];
  matWires.forEach((pts, wi) => {
    if (pts.length < 2) return;
    const anchorFlag = pts.map(([x, y], i) => isAnchor(x, y, i === 0 || i === pts.length - 1));
    let start = 0;
    let usedOriginalId = false;
    for (let i = 1; i < pts.length; i++) {
      if (!anchorFlag[i]) continue;
      const a = nodeIdAt(pts[start][0], pts[start][1]);
      const b = nodeIdAt(pts[i][0], pts[i][1]);
      const bends = pts.slice(start + 1, i);
      if (!(a === b && bends.length === 0)) {
        wires.push({ id: usedOriginalId ? makeWireId() : legacy.wires[wi].id, a, b, bends });
        usedOriginalId = true;
      }
      start = i;
    }
  });

  // 6. Probes → node references (x,y retained during the migration).
  const probes: Probe[] = legacy.probes.map((pr) => ({
    id: pr.id,
    x: pr.x,
    y: pr.y,
    node: nodeIdAt(pr.x, pr.y),
    scopeDx: pr.scopeDx,
    scopeDy: pr.scopeDy,
    label: pr.label,
    color: pr.color,
  }));

  // 7. Coincident pins with no wire between them still share a net — join them.
  const pinsByCoord = new Map<string, NodeId[]>();
  legacy.components.forEach((c, ci) => {
    const count = getPinLayout(c).length;
    for (let i = 0; i < count; i++) {
      const wp = pinWorldPos(c, i);
      push(pinsByCoord, key(wp.x, wp.y), (components[ci].pins ?? [])[i]);
    }
  });
  for (const ids of pinsByCoord.values()) {
    for (let i = 1; i < ids.length; i++) wires.push({ id: makeWireId(), a: ids[0], b: ids[i], bends: [] });
  }

  return {
    id: legacy.id,
    name: legacy.name,
    description: legacy.description,
    components,
    nodes: [...standaloneAt.values()],
    wires,
    probes,
  };
}

/** Inverse of legacyPageToGraph: render a graph page back to the legacy polyline
 *  shape. Edges become polylines (nodePos(a) → bends → nodePos(b)); a named
 *  standalone node becomes a LABEL component so the legacy netlist names the net.
 *  Lets the proven legacy emitters (SPICE netlist, SVG export) run unchanged. */
export function graphToLegacyPage(page: SchematicPage): LegacyPage {
  const idx = pinNodeIndex(page);

  const components: LegacyComponent[] = page.components.map((c) => ({
    id: c.id,
    kind: c.kind,
    x: c.x,
    y: c.y,
    rotation: c.rotation,
    mirrored: c.mirrored,
    value: c.value,
    label: c.label,
    params: c.params,
  }));
  // A directly-named standalone node → a LABEL component at that coordinate.
  for (const node of page.nodes ?? []) {
    if (node.name) {
      components.push({
        id: `label-${node.id}`,
        kind: "LABEL",
        x: node.x,
        y: node.y,
        rotation: 0,
        value: node.name,
      });
    }
  }

  const wires: LegacyWire[] = [];
  for (const wire of page.wires) {
    const pts = wirePolyline(page, wire, idx);
    if (pts && pts.length >= 2) wires.push({ id: wire.id, points: pts });
  }

  const probes: LegacyProbe[] = page.probes.map((pr) => {
    const p = (pr.node ? nodePos(page, pr.node, idx) : null) ?? { x: pr.x, y: pr.y };
    return {
      id: pr.id,
      x: p.x,
      y: p.y,
      scopeDx: pr.scopeDx,
      scopeDy: pr.scopeDy,
      label: pr.label,
      color: pr.color,
    };
  });

  return {
    id: page.id,
    name: page.name,
    description: page.description,
    components,
    wires,
    probes,
  };
}

// Doc-level converters: map every page through the page converters, preserving
// the doc-level fields (activePageId / directives / analysis / simSettings).
// Used by the editor to migrate a loaded legacy (v1) doc to the graph model on
// load, and to emit a legacy doc for v1 persistence / legacy emitters.
export function legacyDocToGraph(doc: LegacyCircuitDoc): CircuitDoc {
  return { ...doc, pages: doc.pages.map((p) => legacyPageToGraph(p)) };
}

export function graphDocToLegacy(doc: CircuitDoc): LegacyCircuitDoc {
  return { ...doc, pages: doc.pages.map((p) => graphToLegacyPage(p)) };
}

// re-export for convenience
export type { LegacyPage };
