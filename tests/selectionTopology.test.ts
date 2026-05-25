import assert from "node:assert/strict";
import test from "node:test";

import { collectSelectedTopology } from "../src/editor/selectionTopology.ts";
import type { SchematicPage } from "../src/editor/model.ts";

const page: SchematicPage = {
  id: "p1",
  name: "main",
  components: [
    { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
    { id: "r2", kind: "R", x: 8, y: 0, rotation: 0, value: "1k" },
  ],
  wires: [
    {
      id: "w1",
      points: [
        [2, 0],
        [6, 0],
      ],
    },
  ],
  probes: [
    { id: "pin-probe", x: -2, y: 0, color: "#0a84ff", label: "Pin" },
    { id: "wire-probe", x: 4, y: 0, color: "#ff9f0a", label: "Wire" },
    { id: "floating-probe", x: 4, y: 3, color: "#30d158", label: "Floating" },
  ],
};

test("selected topology includes probes attached to selected component pins", () => {
  const topology = collectSelectedTopology(page, new Set(["r1"]));

  assert.deepEqual(topology.components.map((component) => component.id), ["r1"]);
  assert.deepEqual(topology.wires.map((wire) => wire.id), []);
  assert.deepEqual(topology.probes.map((probe) => probe.id), ["pin-probe"]);
});

test("selected topology includes probes attached to selected wire bodies", () => {
  const topology = collectSelectedTopology(page, new Set(["w1"]));

  assert.deepEqual(topology.components.map((component) => component.id), []);
  assert.deepEqual(topology.wires.map((wire) => wire.id), ["w1"]);
  assert.deepEqual(topology.probes.map((probe) => probe.id), ["wire-probe"]);
});

test("selected topology preserves explicitly selected probes", () => {
  const topology = collectSelectedTopology(page, new Set(["floating-probe"]));

  assert.deepEqual(topology.components.map((component) => component.id), []);
  assert.deepEqual(topology.wires.map((wire) => wire.id), []);
  assert.deepEqual(topology.probes.map((probe) => probe.id), ["floating-probe"]);
});
