import assert from "node:assert/strict";
import test from "node:test";

import { componentVisualBoundsFor, rectsIntersect, wireIntersectsRect } from "../src/editor/geometry.ts";
import {
  netLabelLayout,
  valueLabelBounds,
  valueLabelOffset,
  valueLabelOffsets,
} from "../src/editor/labelPlacement.ts";
import type { CircuitComponent, SchematicPage } from "../src/editor/model.ts";

function page(components: CircuitComponent[]): SchematicPage {
  return { id: "main", name: "Main", components, wires: [], probes: [] };
}

function pageWithWires(components: CircuitComponent[], wires: SchematicPage["wires"]): SchematicPage {
  return { id: "main", name: "Main", components, wires, probes: [] };
}

function pageWithProbes(components: CircuitComponent[], probes: SchematicPage["probes"]): SchematicPage {
  return { id: "main", name: "Main", components, wires: [], probes };
}

test("source labels avoid nearby horizontal components", () => {
  const source: CircuitComponent = { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "SIN(0 1 1k)" };
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 2.2, y: 0, rotation: 0, value: "1k" };

  const offset = valueLabelOffset(source, page([source, resistor]), "~1V 1kHz");
  const bounds = valueLabelBounds(source, offset, "~1V 1kHz");

  assert.equal(rectsIntersect(bounds, componentVisualBoundsFor(resistor, 0.18)), false);
});

test("source labels prefer side placement instead of sitting under the source", () => {
  const source: CircuitComponent = { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "SIN(0 1 1k)" };

  const offset = valueLabelOffset(source, page([source]), "~1V 1kHz");

  assert.deepEqual(offset, { x: 2.15, y: 0.25, anchor: "start" });
});

test("source labels avoid attached output wires", () => {
  const source: CircuitComponent = { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "SIN(0 1 1k)" };
  const schematic = pageWithWires([source], [{ id: "w1", points: [[0, -1], [4, -1]] }]);

  const offset = valueLabelOffset(source, schematic, "~1V 1kHz");
  const bounds = valueLabelBounds(source, offset, "~1V 1kHz");

  assert.equal(bounds.y1 <= -1 && bounds.y2 >= -1, false);
});

test("value label bounds include side-placed source labels", () => {
  const source: CircuitComponent = { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "SIN(0 1 1k)" };
  const offset = valueLabelOffset(source, page([source]), "~1V 1kHz");

  const bounds = valueLabelBounds(source, offset, "~1V 1kHz");

  assert.ok(bounds.x2 > 3.9);
  assert.ok(bounds.y1 < 0.25);
  assert.ok(bounds.y2 > 0.25);
});

test("passive labels keep the familiar below-part placement when clear", () => {
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };

  const offset = valueLabelOffset(resistor, page([resistor]), "1kΩ");

  assert.deepEqual(offset, { x: 0, y: 1.45, anchor: "middle" });
});

test("vertical passive labels prefer a side placement when clear", () => {
  const capacitor: CircuitComponent = { id: "c1", kind: "C", x: 0, y: 0, rotation: 0, value: "10n" };

  const offset = valueLabelOffset(capacitor, page([capacitor]), "10nF");

  assert.deepEqual(offset, { x: 1.65, y: 0.25, anchor: "start" });
});

test("component value labels avoid labels already placed on nearby components", () => {
  const first: CircuitComponent = { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "SIN(0 1 1k)" };
  const second: CircuitComponent = { id: "v2", kind: "V", x: 8.5, y: -0.5, rotation: 0, value: "SIN(0 1 1k)" };

  const offsets = valueLabelOffsets(page([first, second]), () => "very very long sine source label");

  assert.notDeepEqual(offsets.get(first.id), offsets.get(second.id));
});

test("component value labels avoid probe label chips", () => {
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const schematic = pageWithProbes([resistor], [
    { id: "p1", x: -0.5, y: 1.45, color: "#0a84ff", label: "Vout" },
  ]);

  const offset = valueLabelOffset(resistor, schematic, "1kΩ");

  assert.notDeepEqual(offset, { x: 0, y: 1.45, anchor: "middle" });
});

test("source labels stay close when nearby component overlap is only incidental", () => {
  const source: CircuitComponent = { id: "v1", kind: "V", x: -7, y: 2.5, rotation: 0, value: "PULSE(0 5)" };
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: -2.5, y: 1, rotation: 0, value: "1k" };
  const capacitor: CircuitComponent = { id: "c1", kind: "C", x: -1, y: 2.5, rotation: 0, value: "1u" };
  const schematic = pageWithWires(
    [source, resistor, capacitor],
    [
      { id: "w1", points: [[-7, 0.5], [-7, 1], [-5, 1]] },
      { id: "w2", points: [[-2, 1], [-1, 1], [-1, 0.5]] },
    ],
  );

  const offset = valueLabelOffset(source, schematic, "Pulse 0-5V");

  assert.deepEqual(offset, { x: 2.15, y: 0.25, anchor: "start" });
});

test("net labels choose an open side instead of covering the connected wire", () => {
  const label: CircuitComponent = { id: "lbl", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "in" };
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 3.1, y: 0, rotation: 0, value: "1k" };
  const schematic = pageWithWires(
    [label, resistor],
    [{ id: "w1", points: [[-2, 0], [2, 0]] }],
  );

  const layout = netLabelLayout(label, schematic, "in");

  assert.equal(wireIntersectsRect(schematic.wires[0].points, layout.bounds), false);
  assert.equal(rectsIntersect(layout.bounds, componentVisualBoundsFor(resistor, 0.18)), false);
});
