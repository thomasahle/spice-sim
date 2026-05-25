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

test("passive labels can step farther away in dense layouts", () => {
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "10k" };
  const blockers: CircuitComponent[] = [
    { id: "below", kind: "R", x: 0, y: 1.45, rotation: 0, value: "1k" },
    { id: "above", kind: "R", x: 0, y: -1.15, rotation: 0, value: "1k" },
    { id: "right", kind: "R", x: 1.75, y: 0.25, rotation: 90, value: "1k" },
    { id: "left", kind: "R", x: -1.75, y: 0.25, rotation: 90, value: "1k" },
  ];

  const offset = valueLabelOffset(resistor, page([resistor, ...blockers]), "very long resistor value");
  const bounds = valueLabelBounds(resistor, offset, "very long resistor value");

  assert.deepEqual(offset, { x: 2.85, y: 0.25, anchor: "start" });
  assert.equal(
    blockers.some((blocker) => rectsIntersect(bounds, componentVisualBoundsFor(blocker, 0.18))),
    false,
  );
});

test("passive labels can use secondary lanes when all primary lanes are blocked", () => {
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "10k" };
  const blockers: CircuitComponent[] = [
    { id: "below", kind: "R", x: 0, y: 1.45, rotation: 0, value: "1k" },
    { id: "above", kind: "R", x: 0, y: -1.15, rotation: 0, value: "1k" },
    { id: "right", kind: "R", x: 1.75, y: 0.25, rotation: 90, value: "1k" },
    { id: "left", kind: "R", x: -1.75, y: 0.25, rotation: 90, value: "1k" },
    { id: "far-right", kind: "R", x: 2.85, y: 0.25, rotation: 90, value: "1k" },
    { id: "far-left", kind: "R", x: -2.85, y: 0.25, rotation: 90, value: "1k" },
  ];

  const offset = valueLabelOffset(resistor, page([resistor, ...blockers]), "long label");
  const bounds = valueLabelBounds(resistor, offset, "long label");

  assert.deepEqual(offset, { x: 3.95, y: 0.25, anchor: "start" });
  assert.equal(
    blockers.some((blocker) => rectsIntersect(bounds, componentVisualBoundsFor(blocker, 0.18))),
    false,
  );
});

test("vertical passive labels can use farther side lanes in dense layouts", () => {
  const capacitor: CircuitComponent = { id: "c1", kind: "C", x: 0, y: 0, rotation: 0, value: "10n" };
  const blockers: CircuitComponent[] = [
    { id: "right", kind: "R", x: 1.65, y: 0.25, rotation: 90, value: "1k" },
    { id: "left", kind: "R", x: -1.65, y: 0.25, rotation: 90, value: "1k" },
    { id: "below", kind: "R", x: 0, y: 1.7, rotation: 0, value: "1k" },
    { id: "above", kind: "R", x: 0, y: -1.45, rotation: 0, value: "1k" },
  ];

  const offset = valueLabelOffset(capacitor, page([capacitor, ...blockers]), "very long capacitor value");
  const bounds = valueLabelBounds(capacitor, offset, "very long capacitor value");

  assert.deepEqual(offset, { x: 2.65, y: 0.25, anchor: "start" });
  assert.equal(
    blockers.some((blocker) => rectsIntersect(bounds, componentVisualBoundsFor(blocker, 0.18))),
    false,
  );
});

test("transistor labels prefer a cleaner top or bottom position over the gate side", () => {
  const nmos: CircuitComponent = { id: "m1", kind: "NMOS", x: 0, y: 0, rotation: 0, value: "NM" };
  const blocker: CircuitComponent = { id: "r1", kind: "R", x: 2.4, y: 0, rotation: 0, value: "1k" };

  const offset = valueLabelOffset(nmos, page([nmos, blocker]), "NM");

  assert.notDeepEqual(offset, { x: -1.55, y: 0.2, anchor: "end" });
  assert.equal(offset.anchor, "middle");
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

test("component value labels avoid routed net-label chip positions", () => {
  const resistor: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const label: CircuitComponent = { id: "lbl", kind: "LABEL", x: 1.5, y: 1.45, rotation: 0, value: "out" };
  const blocker: CircuitComponent = { id: "r2", kind: "R", x: 4, y: 1.45, rotation: 0, value: "1k" };
  const schematic = page([resistor, label, blocker]);
  const routedLabel = netLabelLayout(label, schematic, "out");

  assert.deepEqual(routedLabel.bounds, { x1: -0.7919999999999998, y1: 1.01, x2: 1.08, y2: 1.8900000000000001 });

  const offset = valueLabelOffset(resistor, schematic, "1kΩ");
  const bounds = valueLabelBounds(resistor, offset, "1kΩ");

  assert.equal(rectsIntersect(bounds, routedLabel.bounds), false);
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
