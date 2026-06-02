import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteEdge,
  deleteNode,
  gcOrphanNodes,
  nodeDegree,
  splitEdgeAtPoint,
  splitEdgeAtSegment,
} from "../src/editor/graphEdit.ts";
import { buildGraphNets } from "../src/editor/graphNetlist.ts";
import type { CircuitComponent, CircuitNode, SchematicPage, Wire } from "../src/editor/graphModel.ts";

function page(over: Partial<SchematicPage>): SchematicPage {
  return { id: "main", name: "main", components: [], nodes: [], wires: [], probes: [], ...over };
}

test("splitEdgeAtPoint splits a wire at an interior point into a T-junction", () => {
  const nodes: CircuitNode[] = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 4, y: 0 },
  ];
  const wires: Wire[] = [{ id: "e1", a: "a", b: "b", bends: [] }];
  const p = page({ nodes, wires });
  const r = splitEdgeAtPoint(p, 2, 0);
  assert.ok(r, "interior split succeeds");
  assert.equal(r.page.wires.length, 2, "edge split into two");
  const j = r.page.nodes.find((n) => n.id === r.nodeId);
  assert.ok(j && j.x === 2 && j.y === 0, "junction node created at the split point");
  const nets = buildGraphNets(r.page);
  assert.equal(nets.netOf.get("a"), nets.netOf.get("b"), "endpoints still one net via junction");
  assert.equal(nets.netOf.get("a"), nets.netOf.get(r.nodeId), "junction joins the net");
  assert.equal(splitEdgeAtPoint(p, 2, 5), null, "off-wire point → no split");
  assert.equal(splitEdgeAtPoint(p, 0, 0), null, "existing endpoint → not an interior split");
});

test("splitEdgeAtSegment splits a multi-bend wire into two nets at a middle segment", () => {
  const nodes: CircuitNode[] = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 4, y: 2 },
  ];
  // polyline (0,0)->(2,0)->(2,2)->(4,2); segment 1 is (2,0)-(2,2)
  const wires: Wire[] = [{ id: "e1", a: "a", b: "b", bends: [[2, 0], [2, 2]] }];
  const p = page({ nodes, wires });
  const after = splitEdgeAtSegment(p, "e1", 1);
  assert.equal(after.wires.length, 2, "two fragments");
  const nets = buildGraphNets(after);
  assert.notEqual(nets.netOf.get("a"), nets.netOf.get("b"), "fragments are now separate nets");
  assert.deepEqual(after.wires.map((w) => w.bends.length).sort(), [0, 0], "each fragment is straight");
  // deleting the only segment of a 2-point wire drops it entirely
  const p2 = page({ nodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 2, y: 0 }], wires: [{ id: "e", a: "a", b: "b", bends: [] }] });
  assert.equal(splitEdgeAtSegment(p2, "e", 0).wires.length, 0, "2-point wire's only segment → wire dropped");
});

test("deleteEdge splits the graph (the connection is severed)", () => {
  const nodes: CircuitNode[] = [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 2, y: 0 },
    { id: "n3", x: 4, y: 0 },
  ];
  const wires: Wire[] = [
    { id: "e1", a: "n1", b: "n2", bends: [] },
    { id: "e2", a: "n2", b: "n3", bends: [] },
  ];
  const p = page({ nodes, wires });
  assert.equal(buildGraphNets(p).netOf.get("n1"), buildGraphNets(p).netOf.get("n3"), "connected first");
  const after = deleteEdge(p, "e1");
  assert.equal(after.wires.length, 1);
  assert.equal(after.nodes.find((n) => n.id === "n1"), undefined, "n1 orphaned → GC'd");
  const nets = buildGraphNets(after);
  assert.equal(nets.netOf.get("n2"), nets.netOf.get("n3"), "n2,n3 still one net");
});

test("deleteNode heals a degree-2 node, preserving geometry and connectivity", () => {
  const nodes: CircuitNode[] = [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 2, y: 0 }, // a corner
    { id: "n3", x: 2, y: 3 },
  ];
  const wires: Wire[] = [
    { id: "e1", a: "n1", b: "n2", bends: [] },
    { id: "e2", a: "n2", b: "n3", bends: [] },
  ];
  const after = deleteNode(page({ nodes, wires }), "n2");
  assert.equal(after.wires.length, 1, "two edges merged into one");
  assert.equal(after.nodes.find((n) => n.id === "n2"), undefined, "node removed");
  const merged = after.wires[0];
  assert.deepEqual(new Set([merged.a, merged.b]), new Set(["n1", "n3"]), "joins the far ends");
  assert.deepEqual(merged.bends, [[2, 0]], "removed node becomes a bend (geometry preserved)");
  const nets = buildGraphNets(after);
  assert.equal(nets.netOf.get("n1"), nets.netOf.get("n3"), "still connected after heal");
});

test("deleteNode trims a degree-1 free end but keeps a component pin", () => {
  const r: CircuitComponent = { id: "R1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["rp0", "rp1"] };
  const free: CircuitNode = { id: "nf", x: 5, y: 0 };
  const wires: Wire[] = [{ id: "e1", a: "rp0", b: "nf", bends: [] }];
  const after = deleteNode(page({ components: [r], nodes: [free], wires }), "nf");
  assert.equal(after.wires.length, 0, "the edge is removed");
  assert.equal(after.nodes.length, 0, "free node removed");
  assert.equal(after.components.length, 1, "component (pin-node) survives");
});

test("deleteNode on a degree-≥3 junction disconnects it", () => {
  const nodes: CircuitNode[] = [
    { id: "h", x: 0, y: 0 },
    { id: "a", x: -2, y: 0 },
    { id: "b", x: 2, y: 0 },
    { id: "c", x: 0, y: 2 },
  ];
  const wires: Wire[] = [
    { id: "e1", a: "h", b: "a", bends: [] },
    { id: "e2", a: "h", b: "b", bends: [] },
    { id: "e3", a: "h", b: "c", bends: [] },
  ];
  const p = page({ nodes, wires });
  assert.equal(nodeDegree(p, "h"), 3);
  const after = deleteNode(p, "h");
  assert.equal(after.wires.length, 0, "all incident edges removed");
  assert.equal(after.nodes.find((n) => n.id === "h"), undefined);
});

test("deleteNode refuses a component pin-node", () => {
  const r: CircuitComponent = { id: "R1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["rp0", "rp1"] };
  const p = page({ components: [r], wires: [{ id: "e1", a: "rp0", b: "rp1", bends: [] }] });
  assert.deepEqual(deleteNode(p, "rp0"), p, "pin-nodes are not deletable via the node tool");
});

test("gcOrphanNodes keeps named/probed nodes, drops bare orphans", () => {
  const p = page({
    nodes: [
      { id: "orphan", x: 0, y: 0 },
      { id: "named", x: 1, y: 0, name: "VIN" },
      { id: "probed", x: 2, y: 0 },
    ],
    probes: [{ id: "pr", node: "probed", color: "#f00" }],
  });
  const after = gcOrphanNodes(p);
  assert.equal(after.nodes.find((n) => n.id === "orphan"), undefined);
  assert.ok(after.nodes.find((n) => n.id === "named"));
  assert.ok(after.nodes.find((n) => n.id === "probed"));
});
