import assert from "node:assert/strict";
import test from "node:test";

import { connectedNetLabelIds, netLabelNearMisses } from "../src/editor/netLabelConnections.ts";
import type { SchematicPage } from "../src/editor/model.ts";

test("net label connection state includes labels placed on wire interiors", () => {
  const page: SchematicPage = {
    id: "p",
    name: "main",
    components: [
      { id: "label", kind: "LABEL", x: 1, y: 0, rotation: 0, value: "out" },
    ],
    wires: [{ id: "w", points: [[0, 0], [2, 0]] }],
    probes: [],
  };

  assert.equal(connectedNetLabelIds(page).has("label"), true);
});

test("net label connection state leaves floating labels visually distinct", () => {
  const page: SchematicPage = {
    id: "p",
    name: "main",
    components: [
      { id: "label", kind: "LABEL", x: 1, y: 1, rotation: 0, value: "out" },
    ],
    wires: [{ id: "w", points: [[0, 0], [2, 0]] }],
    probes: [],
  };

  assert.equal(connectedNetLabelIds(page).has("label"), false);
});

test("net label near-miss detection catches labels close to pins", () => {
  const page: SchematicPage = {
    id: "p",
    name: "main",
    components: [
      { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
      { id: "label", kind: "LABEL", x: -2.2, y: 0, rotation: 0, value: "in" },
    ],
    wires: [],
    probes: [],
  };

  const [nearMiss] = netLabelNearMisses(page);

  assert.equal(nearMiss.labelId, "label");
  assert.equal(nearMiss.target.kind, "pin");
  if (nearMiss.target.kind === "pin") {
    assert.equal(nearMiss.target.componentId, "r1");
    assert.equal(nearMiss.target.pinIdx, 0);
  }
});

test("connected net labels are not near misses", () => {
  const page: SchematicPage = {
    id: "p",
    name: "main",
    components: [
      { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
      { id: "label", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "in" },
    ],
    wires: [],
    probes: [],
  };

  assert.deepEqual(netLabelNearMisses(page), []);
});
