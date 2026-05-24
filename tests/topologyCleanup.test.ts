import assert from "node:assert/strict";
import test from "node:test";

import type { CircuitComponent, Probe, Wire } from "../src/editor/model.ts";
import {
  pruneUnanchoredWireJunctions,
  pruneWiresAfterComponentDelete,
} from "../src/editor/topologyCleanup.ts";

test("component deletion removes wire stubs attached only to deleted pins", () => {
  const deleted: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const kept: CircuitComponent = { id: "r2", kind: "R", x: 6, y: 0, rotation: 0, value: "1k" };
  const wires: Wire[] = [{ id: "w1", points: [[-2, 0], [2, 0], [4, 0]] }];

  const next = pruneWiresAfterComponentDelete(wires, [deleted], [kept]);

  assert.deepEqual(next, []);
});

test("component deletion removes a whole wire when it only connected deleted pins", () => {
  const deleted: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const wires: Wire[] = [{ id: "w1", points: [[-2, 0], [2, 0]] }];

  const next = pruneWiresAfterComponentDelete(wires, [deleted], []);

  assert.deepEqual(next, []);
});

test("component deletion preserves wire endpoints shared with remaining pins", () => {
  const deleted: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const kept: CircuitComponent = { id: "r2", kind: "R", x: 4, y: 0, rotation: 0, value: "1k" };
  const wires: Wire[] = [{ id: "w1", points: [[2, 0], [6, 0]] }];

  const next = pruneWiresAfterComponentDelete(wires, [deleted], [kept]);

  assert.deepEqual(next, wires);
});

test("component deletion preserves endpoints shared by another wire", () => {
  const deleted: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const wires: Wire[] = [
    { id: "w1", points: [[2, 0], [3, 0]] },
    { id: "w2", points: [[2, 0], [2, 1]] },
  ];

  const next = pruneWiresAfterComponentDelete(wires, [deleted], []);

  assert.deepEqual(next, wires);
});

test("component deletion does not compact unrelated explicit wire junctions", () => {
  const deleted: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const wires: Wire[] = [{ id: "bus", points: [[-6, 0], [-5, 0], [-4, 0]] }];

  const next = pruneWiresAfterComponentDelete(wires, [deleted], []);

  assert.deepEqual(next, wires);
});

test("unanchored junction cleanup removes stale collinear vertices", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-6, 0], [-3, 0], [0, 0], [2, 0], [3, 0]] }];
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 2, rotation: 90, value: "1k" };
  const probe: Probe = { id: "p1", x: 0, y: 0, color: "#0a84ff" };

  assert.deepEqual(pruneUnanchoredWireJunctions(wires, [resistor], [probe]), [
    { id: "bus", points: [[-6, 0], [0, 0], [3, 0]] },
  ]);
});

test("unanchored junction cleanup preserves branch junctions and bends", () => {
  const wires: Wire[] = [
    { id: "bus", points: [[-2, 0], [0, 0], [2, 0], [2, 2]] },
    { id: "branch", points: [[0, 0], [0, 1]] },
  ];

  assert.deepEqual(pruneUnanchoredWireJunctions(wires, [], []), wires);
});
