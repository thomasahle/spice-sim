import assert from "node:assert/strict";
import test from "node:test";

import { componentVisualBoundsFor, wireIntersectsRect } from "../src/editor/geometry.ts";
import { buildNetlist } from "../src/editor/netlist.ts";
import { importNetlist, parseNetlistImportIr } from "../src/editor/netlistImport.ts";
import { emptyDoc, getPinLayout, pinWorldPos } from "../src/editor/model.ts";

test("parses netlist import IR with explicit parts pins nets directives and analysis", () => {
  const { ir, warnings } = parseNetlistImportIr(`
.model NM NMOS LEVEL=1 VTO=0.7
VDD vdd 0 DC 3.3
VIN in 0 PULSE(0 3.3 0 1n 1n 1u 2u)
R1 in mid 1k
R2 mid out 1k
R3 mid aux1 1k
R4 mid aux2 1k
R5 mid aux3 1k
R6 mid aux4 1k
R7 j a 1k
R8 j b 1k
R9 j c 1k
.tran 1n 1u
`);

  assert.deepEqual(warnings, []);
  assert.equal(ir.analysis.kind, "tran");
  assert.equal(ir.root.analysis?.kind, "tran");
  assert.ok(ir.directives.some((line) => line.includes(".model NM NMOS")));
  assert.ok(ir.root.parts.some((part) => part.name === "VDD" && part.kind === "V"));
  assert.ok(ir.root.parts.some((part) => part.name === "R1" && part.nodes.includes("mid")));
  assert.equal(ir.root.modelTypes.nm, "NMOS");

  const netKinds = new Map(ir.root.nets.map((net) => [net.name, net.kind]));
  assert.equal(netKinds.get("0"), "ground");
  assert.equal(netKinds.get("vdd"), "global");
  assert.equal(netKinds.get("in"), "local");
  assert.equal(netKinds.get("j"), "junction");
  assert.equal(netKinds.get("mid"), "high-fanout");

  const mid = ir.root.nets.find((net) => net.name === "mid");
  assert.ok(mid);
  assert.equal(mid.pins.length, 6);
  assert.ok(mid.pins.some((pin) => pin.partName === "R1" && pin.pinIdx === 1));
});

test("parses subcircuit pages and external ports into import IR", () => {
  const { ir } = parseNetlistImportIr(`
.subckt gain IN OUT VDD VSS
R1 IN OUT 10k
C1 OUT VSS 10n
.ends gain

X1 a b vdd 0 gain
.op
`);

  assert.equal(ir.subcircuits.length, 1);
  const subckt = ir.subcircuits[0];
  assert.equal(subckt.name, "gain");
  assert.deepEqual(subckt.pins, ["IN", "OUT", "VDD", "VSS"]);
  assert.ok(subckt.parts.some((part) => part.name === "R1"));
  const external = new Map(subckt.nets.map((net) => [net.name, net]));
  assert.equal(external.get("IN")?.kind, "external-port");
  assert.equal(external.get("OUT")?.kind, "external-port");
  assert.equal(external.get("VSS")?.kind, "external-port");
  assert.equal(ir.root.parts[0].kind, "SUBX");
  assert.equal(ir.root.parts[0].value, "gain");
});

test("imports a basic divider netlist with local nets as direct wires", async () => {
  const imported = await importNetlist(`
* divider
V1 in 0 DC 5
R1 in out 10k
R2 out 0 5k
.tran 1u 1m
`);

  const page = imported.doc.pages[0];
  assert.equal(imported.doc.analysis.kind, "tran");
  assert.equal(page.components.filter((c) => c.kind === "V").length, 1);
  assert.equal(page.components.filter((c) => c.kind === "R").length, 2);
  assert.ok(!page.components.some((c) => c.kind === "LABEL" && c.value === "in"));
  assert.ok(!page.components.some((c) => c.kind === "LABEL" && c.value === "out"));
  assert.ok(page.components.some((c) => c.kind === "GND"));
  assert.ok(page.wires.length >= 3);

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /V1\s+\S+\s+0\s+DC 5/);
  assert.match(regenerated, /R1\s+\S+\s+\S+\s+10k/);
  assert.match(regenerated, /R2\s+\S+\s+0\s+5k/);
});

test("emits schematic layout annotations in generated netlists", () => {
  const result = buildNetlist({
    ...emptyDoc,
    pages: [
      {
        id: "page-layout-annotations",
        name: "main",
        description: "",
        components: [
          {
            id: "r1",
            kind: "R",
            x: 1.25,
            y: -2.5,
            rotation: 90,
            mirrored: true,
            value: "2.2k",
          },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "page-layout-annotations",
  });

  assert.match(result.netlist, /^\* spice-sim-layout: R1 x=1.25 y=-2.5 rot=90 mirror=1$/m);
  assert.match(result.netlist, /^R1\s+\S+\s+\S+\s+2.2k$/m);
});

test("imports layout annotations before routing reconstructed wires", async () => {
  const imported = await importNetlist(`
V1 in 0 DC 5
* spice-sim-layout: RKEEP x=3.5 y=-2 rot=90 mirror=1
RKEEP in out 2.2k
RLOAD out 0 1k
.op
`);

  const resistor = imported.doc.pages[0].components.find((component) =>
    component.kind === "R" && component.value === "2.2k"
  );
  assert.ok(resistor);
  assert.equal(resistor.x, 3.5);
  assert.equal(resistor.y, -2);
  assert.equal(resistor.rotation, 90);
  assert.equal(resistor.mirrored, true);
  const resistorPins = getPinLayout(resistor).map((_, idx) => pinWorldPos(resistor, idx));
  assert.ok(imported.doc.pages[0].wires.some((wire) =>
    wire.points.some(([x, y]) => resistorPins.some((pin) =>
      Math.abs(x - pin.x) < 0.01 && Math.abs(y - pin.y) < 0.01
    ))
  ));
});

test("imports route reconstructed wires around annotated component obstacles", async () => {
  const imported = await importNetlist(`
* spice-sim-layout: V1 x=0 y=0
V1 in 0 DC 5
* spice-sim-layout: R1 x=8 y=-2
R1 in out 1k
* spice-sim-layout: COBS x=3 y=-2
COBS shield 0 1p
RLOAD out 0 1k
.op
`);

  const page = imported.doc.pages[0];
  const source = page.components.find((component) => component.kind === "V" && component.value === "DC 5");
  const resistor = page.components.find((component) => component.kind === "R" && component.value === "1k");
  const obstacle = page.components.find((component) => component.kind === "C" && component.value === "1p");
  assert.ok(source);
  assert.ok(resistor);
  assert.ok(obstacle);

  const sourcePin = pinWorldPos(source, 0);
  const resistorPin = pinWorldPos(resistor, 0);
  const inputWire = page.wires.find((wire) =>
    pointOnWire(sourcePin, wire.points) && pointOnWire(resistorPin, wire.points)
  );
  assert.ok(inputWire);
  assert.equal(wireIntersectsRect(inputWire.points, componentVisualBoundsFor(obstacle, 0.25)), false);
});

test("round-trips custom subcircuit symbol geometry through layout annotations", async () => {
  const doc = {
    ...emptyDoc,
    pages: [
      {
        id: "main",
        name: "main",
        description: "",
        components: [
          {
            id: "x1",
            kind: "SUBX",
            x: -4,
            y: 2,
            rotation: 180,
            value: "wide_block",
            params: { npins: "6", w: "8", h: "5" },
          },
        ],
        wires: [],
        probes: [],
      },
      {
        id: "wide",
        name: "wide_block",
        description: "",
        components: [
          { id: "p1", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "A", params: { port: "1", portOrder: "1" } },
          { id: "p2", kind: "LABEL", x: 2, y: 0, rotation: 0, value: "Y", params: { port: "1", portOrder: "2" } },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "main",
  };

  const netlist = buildNetlist(doc).netlist;
  assert.match(netlist, /^\* spice-sim-layout: X1 x=-4 y=2 rot=180 w=8 h=5$/m);

  const imported = await importNetlist(netlist);
  const instance = imported.doc.pages[0].components.find((component) => component.kind === "SUBX");
  assert.ok(instance);
  assert.equal(instance.x, -4);
  assert.equal(instance.y, 2);
  assert.equal(instance.rotation, 180);
  assert.equal(instance.params?.npins, "6");
  assert.equal(instance.params?.w, "8");
  assert.equal(instance.params?.h, "5");
});

test("preserves unsupported and model lines in directives", async () => {
  const imported = await importNetlist(`
.model DMOD D
D1 a 0 DMOD
E1 out 0 a 0 10
`);

  assert.ok(imported.doc.directives.includes(".model DMOD D"));
  assert.ok(imported.doc.directives.includes("* unsupported import: E1 out 0 a 0 10"));
  assert.ok(
    imported.warnings.some((warning) =>
      warning.includes("Unsupported element preserved as directive but not drawn: E1 out 0 a 0 10"),
    ),
  );
  assert.equal(imported.doc.pages[0].components.filter((c) => c.kind === "D").length, 1);
});

test("imports MOSFETs with explicit body as four-terminal parts", async () => {
  const imported = await importNetlist(`
.model NMOS_LEVEL1_FAST NMOS LEVEL=1 VTO=0.7 KP=180e-6
M1 vdd gate src vss NMOS_LEVEL1_FAST L=2u W=8u
.op
`);

  const mos = imported.doc.pages[0].components.find((c) => c.kind === "NMOS4");
  assert.ok(mos);
  assert.equal(mos.kind, "NMOS4");
  assert.equal(mos.value, "NMOS_LEVEL1_FAST");
  assert.deepEqual(mos.params, { L: "2u", W: "8u" });

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /^M1\s+\S+\s+\S+\s+\S+\s+\S+\s+NMOS_LEVEL1_FAST L=2u W=8u$/m);
});

test("uses .model device type when choosing imported transistor symbols", async () => {
  const imported = await importNetlist(`
.model PM PMOS LEVEL=1 VTO=-0.7
.model QP PNP
M1 out in vdd vdd PM L=2u W=8u
Q1 out base emit QP
.op
`);

  assert.ok(imported.doc.pages[0].components.some((c) => c.kind === "PMOS"));
  assert.ok(imported.doc.pages[0].components.some((c) => c.kind === "PNP"));
});

test("lays out imported CMOS pull-up/pull-down pairs as a readable stack", async () => {
  const imported = await importNetlist(`
.model NM NMOS LEVEL=1 VTO=0.7
.model PM PMOS LEVEL=1 VTO=-0.7
VDD vdd 0 DC 3.3
VIN in 0 PULSE(0 3.3 0 1n 1n 1u 2u)
MP1 out in vdd vdd PM L=2u W=8u
MN1 out in 0 0 NM L=2u W=4u
CLOAD out 0 2p
.tran 5n 4u
`);

  const page = imported.doc.pages[0];
  const pmos = page.components.find((c) => c.kind === "PMOS");
  const nmos = page.components.find((c) => c.kind === "NMOS");
  const load = page.components.find((c) => c.kind === "C");
  assert.ok(pmos);
  assert.ok(nmos);
  assert.ok(load);
  assert.equal(pmos.rotation, 180);
  assert.ok(pmos.y < nmos.y);
  assert.ok(load.x > nmos.x);
  assert.ok(page.wires.every((wire) => wire.points.every(([x]) => x < 9)));
});

test("lays out imported shunt parts vertically toward rails", async () => {
  const imported = await importNetlist(`
V1 in 0 PULSE(0 1 0 1n 1n 1u 2u)
R1 in out 1k
C1 out 0 100n
RLOAD out 0 10k
.tran 1u 10u
`);

  const page = imported.doc.pages[0];
  const source = page.components.find((component) => component.kind === "V");
  const series = page.components.find((component) => component.kind === "R" && component.value === "1k");
  const cap = page.components.find((component) => component.kind === "C");
  const rload = page.components.find((component) => component.kind === "R" && component.value === "10k");
  assert.ok(source);
  assert.ok(series);
  assert.ok(cap);
  assert.ok(rload);

  assert.ok(source.x < series.x);
  assert.equal(pinWorldPos(source, 0).y, pinWorldPos(series, 0).y);
  assert.equal(cap.rotation, 0);
  assert.equal(rload.rotation, 90);
  assert.ok(pinWorldPos(cap, 0).y < pinWorldPos(cap, 1).y);
  assert.ok(pinWorldPos(rload, 0).y < pinWorldPos(rload, 1).y);
  assert.ok(page.components.some((component) => (
    component.kind === "GND" &&
    Math.abs(component.x - pinWorldPos(cap, 1).x) < 0.01 &&
    component.y > pinWorldPos(cap, 1).y
  )));
});

test("lays out imported half-wave rectifier as source, diode, and shunt load", async () => {
  const imported = await importNetlist(`
.model DMOD D
V1 in 0 SIN(0 5 1k)
D1 in out DMOD
RLOAD out 0 1k
.tran 10u 5m
`);

  const page = imported.doc.pages[0];
  const source = page.components.find((component) => component.kind === "V");
  const diode = page.components.find((component) => component.kind === "D");
  const load = page.components.find((component) => component.kind === "R");
  assert.ok(source);
  assert.ok(diode);
  assert.ok(load);

  assert.ok(source.x < diode.x);
  assert.equal(load.rotation, 90);
  assert.equal(diode.x, load.x);
  assert.deepEqual(pinWorldPos(diode, 1), pinWorldPos(load, 0));
  assert.ok(page.components.some((component) => component.kind === "GND" && component.y > load.y));
});

test("lays out imported series NMOS stacks vertically", async () => {
  const imported = await importNetlist(`
.model NM NMOS LEVEL=1 VTO=0.7
MUP out g1 mid 0 NM L=2u W=2u
MDN mid g2 0 0 NM L=2u W=2u
VG1 g1 0 DC 1
VG2 g2 0 DC 1
.tran 5n 1u
`);

  const stack = imported.doc.pages[0].components.filter((component) =>
    component.kind === "NMOS" || component.kind === "NMOS4"
  );
  assert.equal(stack.length, 2);
  const [first, second] = stack.sort((a, b) => a.y - b.y);
  assert.equal(first.x, second.x);
  assert.ok(first.y < second.y);
  assert.equal(first.rotation, 0);
  assert.equal(second.rotation, 0);
  assert.deepEqual(pinWorldPos(first, 2), pinWorldPos(second, 0));
});

test("imports and lays out OPAMP signal flow with inputs left and load right", async () => {
  const imported = await importNetlist(`
VINP plus 0 DC 1
VINM minus 0 DC 0.5
XU1 plus minus out OPAMP
RLOAD out 0 10k
.tran 1u 1m
`);

  const page = imported.doc.pages[0];
  const opamp = page.components.find((component) => component.kind === "OPAMP");
  const inputs = page.components.filter((component) => component.kind === "V");
  const load = page.components.find((component) => component.kind === "R");
  assert.ok(opamp);
  assert.equal(inputs.length, 2);
  assert.ok(load);

  assert.ok(inputs.every((source) => source.x < opamp.x));
  assert.ok(load.x > opamp.x);
  assert.equal(load.rotation, 90);
  assert.ok(pinWorldPos(load, 0).x > pinWorldPos(opamp, 2).x);
  assert.equal(pinWorldPos(load, 0).y, pinWorldPos(opamp, 2).y);
});

test("lays out imported ReLU-like MOS/R/C cell with stacked devices and shunt state nodes", async () => {
  const imported = await importNetlist(`
.model NM NMOS LEVEL=1 VTO=0.7
.model NREL NMOS LEVEL=1 VTO=0.7
.model PM PMOS LEVEL=1 VTO=-0.7
MUP1 u wp nup vdd PM L=2u W=2u
MUP2 nup x vdd vdd PM L=2u W=2u
MDN1 u x ndn 0 NM L=2u W=2u
MDN2 ndn wm 0 0 NM L=2u W=2u
MREL vdd u h 0 NREL L=2u W=8u
CU u 0 80f
CH h 0 80f
RH h 0 400k
VX x 0 DC 1
VWP wp 0 DC 1.2
VWM wm 0 DC 0.8
VDD vdd 0 DC 3.3
.tran 5n 1u
`);

  const page = imported.doc.pages[0];
  const pmosStack = page.components
    .filter((component) => component.kind === "PMOS" || component.kind === "PMOS4")
    .sort((a, b) => a.y - b.y);
  const nmosStack = page.components
    .filter((component) => (component.kind === "NMOS" || component.kind === "NMOS4") && component.value === "NM")
    .sort((a, b) => a.y - b.y);
  const cu = page.components.find((component) => component.kind === "C" && component.value === "80f");
  const rh = page.components.find((component) => component.kind === "R" && component.value === "400k");
  assert.equal(pmosStack.length, 2);
  assert.ok(nmosStack.length >= 2);
  assert.ok(cu);
  assert.ok(rh);

  assert.equal(pmosStack[0].x, pmosStack[1].x);
  assert.ok(pmosStack[0].y < pmosStack[1].y);
  assert.equal(pmosStack[0].rotation, 180);
  assert.deepEqual(pinWorldPos(pmosStack[1], 2), pinWorldPos(pmosStack[0], 0));

  assert.equal(nmosStack[0].x, nmosStack[1].x);
  assert.ok(nmosStack[0].y < nmosStack[1].y);
  assert.deepEqual(pinWorldPos(nmosStack[0], 2), pinWorldPos(nmosStack[1], 0));

  assert.equal(cu.rotation, 0);
  assert.equal(rh.rotation, 90);
  assert.ok(pinWorldPos(cu, 0).y < pinWorldPos(cu, 1).y);
  assert.ok(pinWorldPos(rh, 0).y < pinWorldPos(rh, 1).y);
});

test("imports subcircuits as schematic pages and X instances", async () => {
  const imported = await importNetlist(`
.subckt and2 A B Y VDD VSS
B1 Y VSS V=V(A)*V(B)
.ends and2

XU1 in1 in2 out vdd 0 and2
V1 vdd 0 DC 5
.tran 1u 10u
`);

  assert.equal(imported.doc.pages.length, 2);
  assert.equal(imported.doc.pages[1].name, "and2");
  assert.equal(imported.doc.analysis.kind, "tran");

  const root = imported.doc.pages[0];
  const instance = root.components.find((c) => c.kind === "SUBX");
  assert.ok(instance);
  assert.equal(instance.value, "and2");
  assert.equal(instance.params?.npins, "5");

  const subckt = imported.doc.pages[1];
  const labels = subckt.components.filter((c) => c.kind === "LABEL").map((c) => c.value);
  assert.deepEqual(labels.slice(0, 5), ["A", "B", "Y", "VDD", "VSS"]);
  assert.deepEqual(
    subckt.components
      .filter((c) => c.kind === "LABEL")
      .slice(0, 5)
      .map((c) => c.params?.portOrder),
    ["1", "2", "3", "4", "5"],
  );
  assert.ok(subckt.components.some((c) => c.kind === "B"));

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /^X1\s+\S+\s+\S+\s+\S+\s+\S+\s+0\s+and2$/m);
  assert.match(regenerated, /^\.subckt and2 A B Y VDD VSS$/m);
  assert.match(regenerated, /^B1\s+Y\s+VSS\s+V=V\(A\)\*V\(B\)$/m);
});

function pointOnWire(point: { x: number; y: number }, points: [number, number][]): boolean {
  return points.some(([x, y]) => Math.abs(x - point.x) < 0.01 && Math.abs(y - point.y) < 0.01);
}

test("imports large subcircuit instances without truncating at 16 pins", async () => {
  const pins = Array.from({ length: 20 }, (_, idx) => `p${idx + 1}`);
  const imported = await importNetlist(`
.subckt wide ${pins.join(" ")}
.ends wide

XU1 ${pins.join(" ")} wide
`);

  const instance = imported.doc.pages[0].components.find((component) => component.kind === "SUBX");
  assert.ok(instance);
  assert.equal(instance.params?.npins, "20");
  assert.equal(getPinLayout(instance).length, 20);
  assert.equal(imported.warnings.some((warning) => warning.includes("only the first 16")), false);
});
