import assert from "node:assert/strict";
import test from "node:test";

import {
  nodePos,
  pinNodeIndex,
  wirePolyline,
  type CircuitComponent,
  type CircuitNode,
  type SchematicPage,
  type Wire,
} from "../src/editor/graphModel.ts";
import { buildGraphNets } from "../src/editor/graphNetlist.ts";

function page(over: Partial<SchematicPage>): SchematicPage {
  return { id: "main", name: "main", components: [], nodes: [], wires: [], probes: [], ...over };
}

test("nodePos resolves standalone nodes and pin-nodes; wirePolyline builds the path", () => {
  const r: CircuitComponent = { id: "R1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["rp0", "rp1"] };
  const free: CircuitNode = { id: "nf", x: 5, y: 0 };
  const w: Wire = { id: "w1", a: "rp0", b: "nf", bends: [] };
  const p = page({ components: [r], nodes: [free], wires: [w] });
  const idx = pinNodeIndex(p);

  const pp0 = nodePos(p, "rp0", idx);
  const pp1 = nodePos(p, "rp1", idx);
  assert.ok(pp0 && pp1, "pin-node positions resolve");
  assert.notDeepEqual(pp0, pp1, "the two resistor pins are at different positions");
  assert.deepEqual(nodePos(p, "nf", idx), { x: 5, y: 0 }, "standalone node resolves to its own coord");
  assert.equal(nodePos(p, "nope", idx), null, "unknown id → null");

  const poly = wirePolyline(p, w, idx)!;
  assert.deepEqual(poly[0], [pp0!.x, pp0!.y], "polyline starts at the pin-node");
  assert.deepEqual(poly[poly.length - 1], [5, 0], "polyline ends at the standalone node");
});

test("buildGraphNets: edges define nets; GND→0; a resistor's two pins are separate nets", () => {
  const r: CircuitComponent = { id: "R1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["rp0", "rp1"] };
  const gnd: CircuitComponent = { id: "G1", kind: "GND", x: 0, y: 4, rotation: 0, value: "", pins: ["gp0"] };
  const free: CircuitNode = { id: "nf", x: 5, y: 0 };
  const wires: Wire[] = [
    { id: "w1", a: "rp1", b: "gp0", bends: [] }, // R pin1 → GND
    { id: "w2", a: "rp0", b: "nf", bends: [] }, // R pin0 → free node
  ];
  const p = page({ components: [r, gnd], nodes: [free], wires });
  const nets = buildGraphNets(p);

  assert.equal(nets.netOf.get("rp1"), "0");
  assert.equal(nets.netOf.get("gp0"), "0");
  assert.notEqual(nets.netOf.get("rp0"), "0");
  assert.equal(nets.netOf.get("rp0"), nets.netOf.get("nf"));
  assert.notEqual(nets.netOf.get("rp0"), nets.netOf.get("rp1"), "a resistor's two pins are different nets");
});

test("coincidence does NOT connect without an edge (the model-C shift)", () => {
  const a: CircuitNode = { id: "na", x: 5, y: 5 };
  const b: CircuitNode = { id: "nb", x: 5, y: 5 }; // same coordinate, no wire between them
  const p = page({ nodes: [a, b] });
  const nets = buildGraphNets(p);
  assert.notEqual(nets.netOf.get("na"), nets.netOf.get("nb"), "overlapping nodes are NOT the same net");
});

test("an explicit node name labels its whole net", () => {
  const a: CircuitNode = { id: "na", x: 0, y: 0, name: "VIN" };
  const b: CircuitNode = { id: "nb", x: 2, y: 0 };
  const p = page({ nodes: [a, b], wires: [{ id: "w", a: "na", b: "nb", bends: [] }] });
  const nets = buildGraphNets(p);
  assert.equal(nets.netOf.get("na"), "VIN");
  assert.equal(nets.netOf.get("nb"), "VIN");
});
