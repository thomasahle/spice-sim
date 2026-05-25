import assert from "node:assert/strict";
import test from "node:test";

import { buildNetlist } from "../src/editor/netlist.ts";
import { getPinLayout, type CircuitComponent, type CircuitDoc, type SchematicPage } from "../src/editor/model.ts";

test("pure-device ReLU learning cell exports without behavioral sources", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: [
      ".model NMOS_REAL NMOS (LEVEL=1 VTO=0.70 KP=180e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
      ".model PMOS_REAL PMOS (LEVEL=1 VTO=-0.70 KP=70e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
    ].join("\n"),
    analysis: { kind: "tran", tstep: "20n", tstop: "20u" },
    pages: [
      {
        id: "main",
        name: "main",
        description: "Harness for the pure-device ReLU learning-cell subcircuit.",
        components: [],
        wires: [],
        probes: [],
      },
      reluRealCellPage(),
    ],
  };

  const result = buildNetlist(doc);
  const netlist = result.netlist;

  assert.deepEqual(result.errors, []);
  assert.equal(result.modelDiagnostics.length, 0);
  assert.match(netlist, /^\.subckt relu1_real_cell vdd vss vref x dp dm wr eta h wp wm u$/m);
  assert.match(netlist, /^C1 wp vss 20p IC=1.35$/m);
  assert.match(netlist, /^C2 wm vss 20p IC=1.05$/m);
  assert.match(netlist, /^C3 u vss 80f$/m);
  assert.match(netlist, /^R3 u vref 2e6$/m);
  assert.match(netlist, /^M1 n_pos wp vdd vdd PMOS_REAL L=2u W=8u$/m);
  assert.match(netlist, /^M2 u x n_pos vdd PMOS_REAL L=2u W=8u$/m);
  assert.match(netlist, /^M3 u x n_neg vss NMOS_REAL L=2u W=2u$/m);
  assert.match(netlist, /^M5 vdd u h vss NMOS_REAL L=2u W=8u$/m);
  assert.match(netlist, /^M6 eta wr n_wp1 vss NMOS_REAL L=2u W=0.35u$/m);
  assert.doesNotMatch(netlist, /^B\d+\b/m);
  assert.doesNotMatch(netlist, /\b(?:max|tanh|limit)\s*\(/i);
});

test("pure-device ReLU harness instantiates the reusable cell with ordered pins", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: [
      ".model NMOS_REAL NMOS (LEVEL=1 VTO=0.70 KP=180e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
      ".model PMOS_REAL PMOS (LEVEL=1 VTO=-0.70 KP=70e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
    ].join("\n"),
    analysis: { kind: "tran", tstep: "20n", tstop: "20u" },
    pages: [reluHarnessPage(), reluRealCellPage()],
  };

  const result = buildNetlist(doc);
  const netlist = result.netlist;

  assert.deepEqual(result.errors, []);
  assert.equal(result.modelDiagnostics.length, 0);
  assert.match(netlist, /^X1 vdd vss vref x dp dm wr eta h wp wm u relu1_real_cell$/m);
  assert.match(netlist, /^\.subckt relu1_real_cell vdd vss vref x dp dm wr eta h wp wm u$/m);
  assert.doesNotMatch(netlist, /^B\d+\b/m);
  assert.doesNotMatch(netlist, /\b(?:max|tanh|limit)\s*\(/i);
});

function reluHarnessPage(): SchematicPage {
  const instance: CircuitComponent = {
    id: "xrelu1",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu1_real_cell",
    params: { npins: "12", w: "5", h: "6.2" },
  };
  const pinNames = ["vdd", "vss", "vref", "x", "dp", "dm", "wr", "eta", "h", "wp", "wm", "u"];
  const components: CircuitComponent[] = [instance];

  getPinLayout(instance).forEach((pin, idx) => {
    components.push({
      id: `pin-${pinNames[idx]}`,
      kind: "LABEL",
      x: instance.x + pin.x,
      y: instance.y + pin.y,
      rotation: 0,
      value: pinNames[idx],
    });
  });

  return {
    id: "main",
    name: "main",
    description: "Harness that places the pure-device ReLU learning cell as a reusable subcircuit block.",
    components,
    wires: [],
    probes: [],
  };
}

function reluRealCellPage(): SchematicPage {
  const components: CircuitComponent[] = [];

  const add = (component: CircuitComponent) => {
    components.push(component);
  };
  const labelAt = (id: string, value: string, x: number, y: number, params?: CircuitComponent["params"]) => {
    add({ id, kind: "LABEL", x, y, rotation: 0, value, params });
  };
  const cap = (id: string, x: number, y: number, top: string, bottom: string, value: string, params?: CircuitComponent["params"]) => {
    add({ id, kind: "C", x, y, rotation: 0, value, params });
    labelAt(`${id}-top`, top, x, y - 2);
    labelAt(`${id}-bottom`, bottom, x, y + 2);
  };
  const resistor = (id: string, x: number, y: number, left: string, right: string, value: string) => {
    add({ id, kind: "R", x, y, rotation: 0, value });
    labelAt(`${id}-left`, left, x - 2, y);
    labelAt(`${id}-right`, right, x + 2, y);
  };
  const mos4 = (
    id: string,
    kind: "NMOS4" | "PMOS4",
    x: number,
    y: number,
    drain: string,
    gate: string,
    source: string,
    bulk: string,
    model: string,
    W: string,
  ) => {
    add({ id, kind, x, y, rotation: 0, value: model, params: { L: "2u", W } });
    labelAt(`${id}-d`, drain, x, y - 2);
    labelAt(`${id}-g`, gate, x - 2, y);
    labelAt(`${id}-s`, source, x, y + 2);
    labelAt(`${id}-b`, bulk, x + 2, y);
  };

  [
    "vdd",
    "vss",
    "vref",
    "x",
    "dp",
    "dm",
    "wr",
    "eta",
    "h",
    "wp",
    "wm",
    "u",
  ].forEach((name, idx) => {
    const leftSide = idx < 6;
    labelAt(`port-${name}`, name, leftSide ? -18 : 18, -10 + (idx % 6) * 2, {
      port: "1",
      portOrder: String(idx + 1),
    });
  });

  cap("cwp", -12, -10, "wp", "vss", "20p", { IC: "1.35" });
  cap("cwm", -6, -10, "wm", "vss", "20p", { IC: "1.05" });
  cap("cu", 0, -10, "u", "vss", "80f");
  cap("ch", 6, -10, "h", "vss", "80f");
  resistor("rleakwp", -12, -5, "wp", "vss", "5e12");
  resistor("rleakwm", -6, -5, "wm", "vss", "5e12");
  resistor("rbiasu", 0, -5, "u", "vref", "2e6");
  resistor("rh", 6, -5, "h", "vss", "400k");

  mos4("mposw", "PMOS4", -9, 2, "n_pos", "wp", "vdd", "vdd", "PMOS_REAL", "8u");
  mos4("mposx", "PMOS4", -3, 2, "u", "x", "n_pos", "vdd", "PMOS_REAL", "8u");
  mos4("mnegx", "NMOS4", 3, 2, "u", "x", "n_neg", "vss", "NMOS_REAL", "2u");
  mos4("mnegw", "NMOS4", 9, 2, "n_neg", "wm", "vss", "vss", "NMOS_REAL", "2u");
  mos4("mrel", "NMOS4", 15, 2, "vdd", "u", "h", "vss", "NMOS_REAL", "8u");

  mos4("mwpwr", "NMOS4", -9, 9, "eta", "wr", "n_wp1", "vss", "NMOS_REAL", "0.35u");
  mos4("mwpx", "NMOS4", -3, 9, "n_wp1", "x", "n_wp2", "vss", "NMOS_REAL", "0.35u");
  mos4("mwpu", "NMOS4", 3, 9, "n_wp2", "u", "n_wp3", "vss", "NMOS_REAL", "0.35u");
  mos4("mwpd", "NMOS4", 9, 9, "n_wp3", "dp", "wp", "vss", "NMOS_REAL", "0.35u");
  mos4("mwmwr", "NMOS4", -9, 16, "eta", "wr", "n_wm1", "vss", "NMOS_REAL", "0.35u");
  mos4("mwmx", "NMOS4", -3, 16, "n_wm1", "x", "n_wm2", "vss", "NMOS_REAL", "0.35u");
  mos4("mwmu", "NMOS4", 3, 16, "n_wm2", "u", "n_wm3", "vss", "NMOS_REAL", "0.35u");
  mos4("mwmd", "NMOS4", 9, 16, "n_wm3", "dm", "wm", "vss", "NMOS_REAL", "0.35u");

  mos4("mdecwp", "NMOS4", 15, 9, "wp", "wr", "vss", "vss", "NMOS_REAL", "0.02u");
  mos4("mdecwm", "NMOS4", 15, 16, "wm", "wr", "vss", "vss", "NMOS_REAL", "0.02u");

  return {
    id: "relu-real-cell",
    name: "relu1_real_cell",
    description: "Pure MOS/R/C ReLU-like learning cell with split positive and negative weight nodes.",
    components,
    wires: [],
    probes: [],
  };
}
