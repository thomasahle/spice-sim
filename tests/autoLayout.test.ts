import assert from "node:assert/strict";
import test from "node:test";

import { autoArrangePage } from "../src/editor/autoLayout.ts";
import { pinWorldPos, type SchematicPage } from "../src/editor/model.ts";

function samplePage(): SchematicPage {
  return {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "vin", kind: "V", x: -6, y: -1, rotation: 0, value: "DC 3.3" },
      { id: "pm", kind: "PMOS", x: 0, y: 0, rotation: 180, value: "PM" },
      { id: "nm", kind: "NMOS", x: 0, y: 4, rotation: 0, value: "NM" },
      { id: "c", kind: "C", x: 4, y: 4, rotation: 0, value: "2p" },
      { id: "g", kind: "GND", x: 4, y: 7.2, rotation: 0, value: "" },
      {
        id: "note",
        kind: "NOTE",
        x: -10,
        y: -6,
        rotation: 0,
        value: "layout note",
        params: { w: "3", h: "2" },
      },
    ],
    wires: [
      { id: "w-vin-pm", points: [[-6, -3], [-2, -3], [-2, 0]] },
      { id: "w-pm-nm", points: [[0, 2], [0, 2]] },
      { id: "w-nm-c", points: [[0, 2], [4, 2], [4, 2]] },
      { id: "w-c-gnd", points: [[4, 6], [4, 7.2]] },
    ],
    probes: [],
  };
}

test("autoArrangePage uses ELK to move schematic components and preserves notes", async () => {
  const page = samplePage();
  const arranged = await autoArrangePage(page);

  assert.equal(arranged.movedComponentIds.includes("note"), false);
  assert.ok(arranged.movedComponentIds.includes("pm"));
  assert.ok(arranged.formattedWireIds.length > 0);

  const beforePm = page.components.find((component) => component.id === "pm");
  const afterPm = arranged.page.components.find((component) => component.id === "pm");
  const beforeNote = page.components.find((component) => component.id === "note");
  const afterNote = arranged.page.components.find((component) => component.id === "note");
  assert.ok(beforePm);
  assert.ok(afterPm);
  assert.ok(beforeNote);
  assert.ok(afterNote);
  assert.notDeepEqual(
    { x: afterPm.x, y: afterPm.y },
    { x: beforePm.x, y: beforePm.y },
  );
  assert.deepEqual(
    { x: afterNote.x, y: afterNote.y },
    { x: beforeNote.x, y: beforeNote.y },
  );
});

test("autoArrangePage can limit component movement to a selection", async () => {
  const page = samplePage();
  const arranged = await autoArrangePage(page, new Set(["pm", "nm"]));

  const beforeVin = page.components.find((component) => component.id === "vin");
  const afterVin = arranged.page.components.find((component) => component.id === "vin");
  const beforePm = page.components.find((component) => component.id === "pm");
  const afterPm = arranged.page.components.find((component) => component.id === "pm");
  assert.ok(beforeVin);
  assert.ok(afterVin);
  assert.ok(beforePm);
  assert.ok(afterPm);
  assert.deepEqual(
    { x: afterVin.x, y: afterVin.y },
    { x: beforeVin.x, y: beforeVin.y },
  );
  assert.notDeepEqual(
    { x: afterPm.x, y: afterPm.y },
    { x: beforePm.x, y: beforePm.y },
  );
  assert.deepEqual(arranged.movedComponentIds.sort(), ["nm", "pm"]);
});

test("autoArrangePage selection keeps stationary endpoints in place", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "vin", kind: "V", x: -8, y: 0, rotation: 0, value: "5" },
      { id: "r", kind: "R", x: -1, y: 0, rotation: 0, value: "1k" },
      { id: "g", kind: "GND", x: 4, y: 0, rotation: 0, value: "" },
    ],
    wires: [
      { id: "w-in", points: [[-8, -2], [-3, 0]] },
      { id: "w-out", points: [[1, 0], [4, 0]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page, new Set(["r"]));
  const vin = arranged.page.components.find((component) => component.id === "vin");
  const gnd = arranged.page.components.find((component) => component.id === "g");
  const resistor = arranged.page.components.find((component) => component.id === "r");
  assert.ok(vin);
  assert.ok(gnd);
  assert.ok(resistor);
  assert.deepEqual({ x: vin.x, y: vin.y }, { x: -8, y: 0 });
  assert.deepEqual({ x: gnd.x, y: gnd.y }, { x: 4, y: 0 });
  assert.equal(arranged.movedComponentIds.length, 1);
  assert.equal(arranged.movedComponentIds[0], "r");
  assert.ok(arranged.formattedWireIds.includes("w-in"));
  assert.ok(arranged.formattedWireIds.includes("w-out"));

  const inputWire = arranged.page.wires.find((wire) => wire.id === "w-in");
  const outputWire = arranged.page.wires.find((wire) => wire.id === "w-out");
  assert.ok(inputWire);
  assert.ok(outputWire);
  assert.deepEqual(inputWire.points[0], [-8, -2]);
  assert.deepEqual(outputWire.points[outputWire.points.length - 1], [4, 0]);
});

test("autoArrangePage reconnects selected pins that touched wire interiors", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "r", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
      { id: "vin", kind: "V", x: -8, y: 0, rotation: 0, value: "5" },
      { id: "g", kind: "GND", x: 8, y: 0, rotation: 0, value: "" },
    ],
    wires: [
      {
        id: "w-left",
        points: [
          [-8, -2],
          [-4, -2],
          [-4, 0],
          [0, 0],
        ],
      },
      { id: "w-right", points: [[2, 0], [8, 0]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page, new Set(["r"]));
  const resistor = arranged.page.components.find((component) => component.id === "r");
  const leftWire = arranged.page.wires.find((wire) => wire.id === "w-left");
  assert.ok(resistor);
  assert.ok(leftWire);
  const movedLeftPin = pinWorldPos(resistor, 0);

  assert.notDeepEqual(movedLeftPin, { x: -2, y: 0 });
  assert.ok(leftWire.points.some(([x, y]) => x === movedLeftPin.x && y === movedLeftPin.y));
});

test("autoArrangePage applies CMOS pair conventions", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "pm", kind: "PMOS", x: 6, y: 0, rotation: 0, value: "PM" },
      { id: "nm", kind: "NMOS", x: 0, y: 5, rotation: 0, value: "NM" },
      { id: "out-cap", kind: "C", x: 10, y: 2, rotation: 0, value: "2p" },
    ],
    wires: [
      { id: "w-gate", points: [[4, 0], [-2, 5]] },
      { id: "w-drain", points: [[6, -2], [0, 3], [10, 0]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page);
  const pmos = arranged.page.components.find((component) => component.id === "pm");
  const nmos = arranged.page.components.find((component) => component.id === "nm");
  assert.ok(pmos);
  assert.ok(nmos);
  assert.equal(pmos.rotation, 180);
  assert.equal(nmos.rotation, 0);
  assert.equal(pmos.x, nmos.x);
  assert.ok(pmos.y < nmos.y);
});

test("autoArrangePage orients shunt passives vertically toward ground", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "r", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
      { id: "shunt", kind: "R", x: 5, y: -2, rotation: 0, value: "10k" },
      { id: "g", kind: "GND", x: 8, y: -4, rotation: 0, value: "" },
    ],
    wires: [
      { id: "w-signal", points: [[2, 0], [3, -2]] },
      { id: "w-ground", points: [[7, -2], [8, -4]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page);
  const shunt = arranged.page.components.find((component) => component.id === "shunt");
  const ground = arranged.page.components.find((component) => component.id === "g");
  assert.ok(shunt);
  assert.ok(ground);
  assert.equal(shunt.rotation, 90);
  assert.ok(pinWorldPos(shunt, 0).y < pinWorldPos(shunt, 1).y);
  assert.equal(ground.x, pinWorldPos(shunt, 1).x);
  assert.ok(ground.y > pinWorldPos(shunt, 1).y);
});

test("autoArrangePage stacks series NMOS devices vertically", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "upper", kind: "NMOS", x: -4, y: 0, rotation: 0, value: "NM" },
      { id: "lower", kind: "NMOS", x: 5, y: 7, rotation: 0, value: "NM" },
      { id: "g", kind: "GND", x: 5, y: 10, rotation: 0, value: "" },
    ],
    wires: [
      { id: "w-mid", points: [[-4, 2], [5, 5]] },
      { id: "w-gnd", points: [[5, 9], [5, 10]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page);
  const upper = arranged.page.components.find((component) => component.id === "upper");
  const lower = arranged.page.components.find((component) => component.id === "lower");
  assert.ok(upper);
  assert.ok(lower);
  assert.equal(upper.x, lower.x);
  assert.ok(upper.y < lower.y);
  assert.equal(upper.rotation, 0);
  assert.equal(lower.rotation, 0);
  assert.deepEqual(pinWorldPos(upper, 2), pinWorldPos(lower, 0));
});

test("autoArrangePage stacks series PMOS devices vertically toward the rail", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "lower", kind: "PMOS", x: -5, y: 8, rotation: 0, value: "PM" },
      { id: "upper", kind: "PMOS", x: 6, y: 0, rotation: 0, value: "PM" },
      { id: "vdd", kind: "LABEL", x: 6, y: -4, rotation: 0, value: "vdd" },
    ],
    wires: [
      { id: "w-mid", points: [[-5, 10], [6, -2]] },
      { id: "w-rail", points: [[6, 2], [8, 2], [8, -4], [6, -4]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page);
  const lower = arranged.page.components.find((component) => component.id === "lower");
  const upper = arranged.page.components.find((component) => component.id === "upper");
  assert.ok(lower);
  assert.ok(upper);
  assert.equal(upper.x, lower.x);
  assert.ok(upper.y < lower.y);
  assert.equal(upper.rotation, 180);
  assert.equal(lower.rotation, 180);
  assert.deepEqual(pinWorldPos(lower, 2), pinWorldPos(upper, 0));
});

test("autoArrangePage keeps op-amp loads to the output side", async () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "op", kind: "OPAMP", x: 0, y: 0, rotation: 0, value: "OPAMP" },
      { id: "rload", kind: "R", x: -6, y: -5, rotation: 0, value: "10k" },
      { id: "g", kind: "GND", x: -8, y: -6, rotation: 0, value: "" },
    ],
    wires: [
      { id: "w-out", points: [[3, 0], [-8, -5]] },
      { id: "w-gnd", points: [[-4, -5], [-8, -6]] },
    ],
    probes: [],
  };

  const arranged = await autoArrangePage(page);
  const opamp = arranged.page.components.find((component) => component.id === "op");
  const load = arranged.page.components.find((component) => component.id === "rload");
  assert.ok(opamp);
  assert.ok(load);
  assert.ok(load.x > opamp.x);
  assert.equal(load.rotation, 90);
  assert.ok(pinWorldPos(load, 0).x > pinWorldPos(opamp, 2).x);
  assert.equal(pinWorldPos(load, 0).y, pinWorldPos(opamp, 2).y);
});
