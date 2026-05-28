import test from "node:test";
import assert from "node:assert/strict";

import { launchApp, runSim } from "./_setup.mjs";

const DEV_URL = process.env.SPICESIM_E2E_URL ?? "http://localhost:5173/";

function docUrl(doc, tag) {
  const payload = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
  return `${DEV_URL}?real-circuit-scope=${tag}-${Date.now()}#doc=${encodeURIComponent(payload)}`;
}

function halfWaveRectifierDoc() {
  return {
    pages: [
      {
        id: "p-real-rectifier",
        name: "main",
        description: "Hand-authored half-wave rectifier scope QA",
        components: [
          { id: "vin", kind: "V", x: -8, y: 1, rotation: 0, value: "SIN(0 2 1k)" },
          { id: "d1", kind: "D", x: -4, y: -1, rotation: 270, value: "DMOD" },
          { id: "rload", kind: "R", x: 2, y: 1, rotation: 90, value: "2.2k" },
          { id: "c1", kind: "C", x: 4, y: 1, rotation: 0, value: "1u" },
          { id: "gin", kind: "GND", x: -8, y: 3.5, rotation: 0, value: "" },
          { id: "gr", kind: "GND", x: 2, y: 3.5, rotation: 0, value: "" },
          { id: "gc", kind: "GND", x: 4, y: 3.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -8, y: -1, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 4, y: -1, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-in-diode", points: [[-8, -1], [-6, -1]] },
          { id: "w-diode-out", points: [[-2, -1], [4, -1]] },
          { id: "w-vin-ground", points: [[-8, 3], [-8, 3.5]] },
          { id: "w-r-ground", points: [[2, 3], [2, 3.5]] },
          { id: "w-c-ground", points: [[4, 3], [4, 3.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-rectifier",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function cmosInverterDoc() {
  return {
    pages: [
      {
        id: "p-real-cmos-inverter",
        name: "main",
        description: "Hand-authored CMOS inverter scope QA",
        components: [
          { id: "vdd", kind: "V", x: -6, y: -4, rotation: 0, value: "3.3" },
          { id: "vin", kind: "V", x: -6, y: 2, rotation: 0, value: "PULSE(0 3.3 0 20n 20n 1u 2u)" },
          { id: "rgate", kind: "R", x: -4, y: 0, rotation: 0, value: "10" },
          { id: "pmos", kind: "PMOS", x: 0, y: -2, rotation: 180, value: "PCH", params: { W: "20u", L: "1u" } },
          { id: "nmos", kind: "NMOS", x: 0, y: 2, rotation: 0, value: "NCH", params: { W: "10u", L: "1u" } },
          { id: "cload", kind: "C", x: 4, y: 2, rotation: 0, value: "10p" },
          { id: "gvdd", kind: "GND", x: -6, y: -1.5, rotation: 0, value: "" },
          { id: "gvin", kind: "GND", x: -6, y: 4.5, rotation: 0, value: "" },
          { id: "gsrc", kind: "GND", x: 0, y: 4.5, rotation: 0, value: "" },
          { id: "gload", kind: "GND", x: 4, y: 4.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "vin" },
          { id: "label-out", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-vdd-pmos", points: [[-6, -6], [0, -6], [0, -4]] },
          { id: "w-vdd-ground", points: [[-6, -2], [-6, -1.5]] },
          { id: "w-vin-ground", points: [[-6, 4], [-6, 4.5]] },
          { id: "w-output", points: [[0, 0], [4, 0]] },
          { id: "w-nmos-ground", points: [[0, 4], [0, 4.5]] },
          { id: "w-load-ground", points: [[4, 4], [4, 4.5]] },
          { id: "w-input-nmos", points: [[-2, 0], [-2, 2]] },
          { id: "w-input-pmos", points: [[-2, 0], [-2, -3], [2, -3], [2, -2]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-cmos-inverter",
    directives: "",
    analysis: { kind: "tran", tstep: "10n", tstop: "4u" },
  };
}

function rlcFilterDoc() {
  return {
    pages: [
      {
        id: "p-real-rlc-filter",
        name: "main",
        description: "Hand-authored RLC filter scope QA",
        components: [
          { id: "vin", kind: "V", x: -8, y: 1, rotation: 0, value: "SIN(0 1 1k)" },
          { id: "r1", kind: "R", x: -4, y: -1, rotation: 0, value: "220" },
          { id: "l1", kind: "L", x: 0, y: -1, rotation: 90, value: "10m" },
          { id: "c1", kind: "C", x: 4, y: 1, rotation: 0, value: "100n" },
          { id: "rload", kind: "R", x: 6, y: 1, rotation: 90, value: "10k" },
          { id: "gin", kind: "GND", x: -8, y: 3.5, rotation: 0, value: "" },
          { id: "gc", kind: "GND", x: 4, y: 3.5, rotation: 0, value: "" },
          { id: "gload", kind: "GND", x: 6, y: 3.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -8, y: -1, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 4, y: -1, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-vin-r", points: [[-8, -1], [-6, -1]] },
          { id: "w-l-out", points: [[2, -1], [4, -1]] },
          { id: "w-out-load", points: [[4, -1], [6, -1]] },
          { id: "w-vin-ground", points: [[-8, 3], [-8, 3.5]] },
          { id: "w-c-ground", points: [[4, 3], [4, 3.5]] },
          { id: "w-load-ground", points: [[6, 3], [6, 3.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-rlc-filter",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "6m" },
  };
}

function reusableRcSubcircuitDoc() {
  return {
    pages: [
      {
        id: "p-real-subx-rc-main",
        name: "main",
        description: "Hand-authored reusable RC subcircuit scope QA",
        components: [
          { id: "vin", kind: "V", x: -6, y: 1, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "xstage", kind: "SUBX", x: 0, y: -1, rotation: 0, value: "rc_stage", params: { npins: "2", w: "4", h: "2.5", pinSides: "LR" } },
          { id: "gin", kind: "GND", x: -6, y: 3.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -4, y: -1, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 4, y: -1, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-vin-xstage", points: [[-6, -1], [-2.6, -1]] },
          { id: "w-xstage-out", points: [[2.6, -1], [4, -1]] },
          { id: "w-vin-ground", points: [[-6, 3], [-6, 3.5]] },
        ],
        probes: [],
      },
      {
        id: "p-real-subx-rc-stage",
        name: "rc_stage",
        description: "Reusable one-pole RC low-pass stage",
        components: [
          { id: "port-in", kind: "LABEL", x: -4, y: 0, rotation: 0, value: "in", params: { port: "1", portOrder: "1" } },
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
          { id: "port-out", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out", params: { port: "1", portOrder: "2" } },
          { id: "c1", kind: "C", x: 4, y: 2, rotation: 0, value: "1u" },
          { id: "gout", kind: "GND", x: 4, y: 4.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-in-r", points: [[-4, 0], [-2, 0]] },
          { id: "w-r-out", points: [[2, 0], [4, 0]] },
          { id: "w-c-ground", points: [[4, 4], [4, 4.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-subx-rc-main",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function invertingOpAmpDoc() {
  return {
    pages: [
      {
        id: "p-real-opamp-inverting",
        name: "main",
        description: "Hand-authored inverting op-amp amplifier scope QA",
        components: [
          { id: "vin", kind: "V", x: -8, y: 3, rotation: 0, value: "SIN(0 100m 1k)" },
          { id: "rin", kind: "R", x: -5, y: 1, rotation: 0, value: "1k" },
          { id: "rf", kind: "R", x: 0, y: -3, rotation: 0, value: "10k" },
          { id: "u1", kind: "OPAMP", x: 0, y: 0, rotation: 0, value: "OPAMP" },
          { id: "gin", kind: "GND", x: -8, y: 5.5, rotation: 0, value: "" },
          { id: "gplus", kind: "GND", x: -3, y: -0.4, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -8, y: 1, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-vin-rin", points: [[-8, 1], [-7, 1]] },
          { id: "w-rin-minus", points: [[-3, 1], [-3, 1]] },
          { id: "w-vin-ground", points: [[-8, 5], [-8, 5.5]] },
          { id: "w-plus-ground", points: [[-3, -1], [-3, -0.4]] },
          { id: "w-out", points: [[3, 0], [4, 0]] },
          { id: "w-fb-left", points: [[-3, 1], [-4, 1], [-4, -3], [-2, -3]] },
          { id: "w-fb-right", points: [[2, -3], [4, -3], [4, 0]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-opamp-inverting",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function bjtBiasStageDoc() {
  return {
    pages: [
      {
        id: "p-real-bjt-bias",
        name: "main",
        description: "Hand-authored common-emitter BJT bias stage scope QA",
        components: [
          { id: "vcc", kind: "V", x: -8, y: -5, rotation: 0, value: "5" },
          { id: "vin", kind: "V", x: -8, y: 2, rotation: 0, value: "SIN(750m 50m 1k)" },
          { id: "rc", kind: "R", x: 0, y: -5, rotation: 90, value: "2.2k" },
          { id: "rb", kind: "R", x: -4, y: 0, rotation: 0, value: "10k" },
          { id: "q1", kind: "NPN", x: 0, y: 0, rotation: 0, value: "BJTN" },
          { id: "re", kind: "R", x: 0, y: 4, rotation: 90, value: "1k" },
          { id: "gvcc", kind: "GND", x: -8, y: -2.5, rotation: 0, value: "" },
          { id: "gvin", kind: "GND", x: -8, y: 4.5, rotation: 0, value: "" },
          { id: "gemit", kind: "GND", x: 0, y: 6.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -8, y: 0, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 2, y: -2, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-vcc-ground", points: [[-8, -3], [-8, -2.5]] },
          { id: "w-vcc-rail", points: [[-8, -7], [0, -7]] },
          { id: "w-rc-collector", points: [[0, -3], [0, -2], [2, -2]] },
          { id: "w-vin-rb", points: [[-8, 0], [-6, 0]] },
          { id: "w-vin-ground", points: [[-8, 4], [-8, 4.5]] },
          { id: "w-emitter-ground", points: [[0, 6], [0, 6.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-bjt-bias",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function mosDifferentialPairDoc() {
  return {
    pages: [
      {
        id: "p-real-mos-diff-pair",
        name: "main",
        description: "Hand-authored NMOS differential pair scope QA",
        components: [
          { id: "vdd", kind: "V", x: -8, y: -6, rotation: 0, value: "5" },
          { id: "vinp", kind: "V", x: -8, y: 1, rotation: 0, value: "SIN(1.2 100m 1k)" },
          { id: "vinn", kind: "V", x: 6, y: 1, rotation: 0, value: "1.2" },
          { id: "rdp", kind: "R", x: -2, y: -5, rotation: 90, value: "2.2k" },
          { id: "rdn", kind: "R", x: 2, y: -5, rotation: 90, value: "2.2k" },
          { id: "mleft", kind: "NMOS", x: -2, y: 0, rotation: 0, value: "NPAIR", params: { W: "40u", L: "1u" } },
          { id: "mright", kind: "NMOS", x: 2, y: 0, rotation: 0, value: "NPAIR", params: { W: "40u", L: "1u" } },
          { id: "itail", kind: "I", x: 0, y: 4, rotation: 0, value: "DC 1m" },
          { id: "gvdd", kind: "GND", x: -8, y: -3.5, rotation: 0, value: "" },
          { id: "ginp", kind: "GND", x: -8, y: 3.5, rotation: 0, value: "" },
          { id: "ginn", kind: "GND", x: 6, y: 3.5, rotation: 0, value: "" },
          { id: "gtail", kind: "GND", x: 0, y: 6.5, rotation: 0, value: "" },
          { id: "label-inp", kind: "LABEL", x: -4, y: 0, rotation: 0, value: "inp" },
          { id: "label-outp", kind: "LABEL", x: -2, y: -2, rotation: 0, value: "outp" },
          { id: "label-outn", kind: "LABEL", x: 2, y: -2, rotation: 0, value: "outn" },
        ],
        wires: [
          { id: "w-vdd-ground", points: [[-8, -4], [-8, -3.5]] },
          { id: "w-vdd-left", points: [[-8, -8], [-8, -7], [-2, -7]] },
          { id: "w-vdd-right", points: [[-2, -7], [2, -7]] },
          { id: "w-left-load", points: [[-2, -3], [-2, -2]] },
          { id: "w-right-load", points: [[2, -3], [2, -2]] },
          { id: "w-inp-gate", points: [[-8, -1], [-4, -1], [-4, 0]] },
          { id: "w-inp-ground", points: [[-8, 3], [-8, 3.5]] },
          { id: "w-inn-gate", points: [[6, -1], [0, -1], [0, 0]] },
          { id: "w-inn-ground", points: [[6, 3], [6, 3.5]] },
          { id: "w-tail-left", points: [[-2, 2], [0, 2]] },
          { id: "w-tail-right", points: [[0, 2], [2, 2]] },
          { id: "w-tail-ground", points: [[0, 6], [0, 6.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-mos-diff-pair",
    directives: ".model NPAIR NMOS (LEVEL=1 VTO=0.7 KP=220e-6 LAMBDA=0.04)",
    analysis: { kind: "tran", tstep: "10u", tstop: "3m" },
  };
}

function mosCommonSourceAmplifierDoc() {
  return {
    pages: [
      {
        id: "p-real-mos-common-source",
        name: "main",
        description: "Hand-authored NMOS common-source amplifier scope QA",
        components: [
          { id: "vdd", kind: "V", x: -8, y: -5, rotation: 0, value: "5" },
          { id: "vin", kind: "V", x: -8, y: 2, rotation: 0, value: "SIN(1.3 50m 1k)" },
          { id: "rd", kind: "R", x: 0, y: -5, rotation: 90, value: "4.7k" },
          { id: "m1", kind: "NMOS", x: 0, y: 0, rotation: 0, value: "NAMP", params: { W: "60u", L: "1u" } },
          { id: "rs", kind: "R", x: 0, y: 4, rotation: 90, value: "820" },
          { id: "cout", kind: "C", x: 4, y: 0, rotation: 0, value: "20p" },
          { id: "gvdd", kind: "GND", x: -8, y: -2.5, rotation: 0, value: "" },
          { id: "gvin", kind: "GND", x: -8, y: 4.5, rotation: 0, value: "" },
          { id: "gsrc", kind: "GND", x: 0, y: 6.5, rotation: 0, value: "" },
          { id: "gload", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
          { id: "label-in", kind: "LABEL", x: -4, y: 0, rotation: 0, value: "in" },
          { id: "label-out", kind: "LABEL", x: 2, y: -2, rotation: 0, value: "out" },
          { id: "label-src", kind: "LABEL", x: 2, y: 2, rotation: 0, value: "src" },
        ],
        wires: [
          { id: "w-vdd-ground", points: [[-8, -3], [-8, -2.5]] },
          { id: "w-vdd-rail", points: [[-8, -7], [0, -7]] },
          { id: "w-drain-out", points: [[0, -3], [0, -2], [2, -2]] },
          { id: "w-gate-in", points: [[-8, 0], [-4, 0], [-2, 0]] },
          { id: "w-vin-ground", points: [[-8, 4], [-8, 4.5]] },
          { id: "w-source-rs", points: [[0, 2], [2, 2], [2, 4], [0, 4]] },
          { id: "w-source-ground", points: [[0, 6], [0, 6.5]] },
          { id: "w-out-load", points: [[2, -2], [4, -2]] },
          { id: "w-load-ground", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-real-mos-common-source",
    directives: ".model NAMP NMOS (LEVEL=1 VTO=0.75 KP=260e-6 LAMBDA=0.04)",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function reluLearningCellDoc() {
  return {
    pages: [
      reluLearningHarnessPage(),
      reluRealCellPage(),
    ],
    activePageId: "p-real-relu-main",
    directives: [
      ".model NMOS_REAL NMOS (LEVEL=1 VTO=0.70 KP=180e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
      ".model PMOS_REAL PMOS (LEVEL=1 VTO=-0.70 KP=70e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7)",
    ].join("\n"),
    analysis: { kind: "tran", tstep: "20n", tstop: "20u" },
  };
}

function reluLearningHarnessPage() {
  return {
    id: "p-real-relu-main",
    name: "main",
    description: "Browser Run-and-scope harness for a pure-device ReLU learning-cell subcircuit.",
    components: [
      { id: "xrelu", kind: "SUBX", x: 0, y: 0, rotation: 0, value: "relu1_real_cell", params: { npins: "12", w: "5", h: "6.2", pinSides: "LLLLLLRRRRRR" } },
      { id: "vdd", kind: "V", x: -8, y: -0.5, rotation: 0, value: "3.3" },
      { id: "vref", kind: "V", x: -9, y: 1.5, rotation: 0, value: "0.55" },
      { id: "vin", kind: "V", x: -10, y: 2.5, rotation: 0, value: "SIN(1 1 1k)" },
      { id: "veta", kind: "V", x: 8, y: 0.5, rotation: 0, value: "3.3" },
      { id: "gvdd", kind: "GND", x: -8, y: 1.5, rotation: 0, value: "" },
      { id: "gvref", kind: "GND", x: -9, y: 3.5, rotation: 0, value: "" },
      { id: "gvin", kind: "GND", x: -10, y: 4.5, rotation: 0, value: "" },
      { id: "gvss", kind: "GND", x: -5, y: -1.5, rotation: 0, value: "" },
      { id: "gdp", kind: "GND", x: -5, y: 1.5, rotation: 0, value: "" },
      { id: "gdm", kind: "GND", x: -5, y: 2.5, rotation: 0, value: "" },
      { id: "gwr", kind: "GND", x: 5, y: -2.5, rotation: 0, value: "" },
      { id: "geta", kind: "GND", x: 8, y: 2.5, rotation: 0, value: "" },
      { id: "label-in", kind: "LABEL", x: -3.1, y: 0.5, rotation: 0, value: "x" },
      { id: "label-out", kind: "LABEL", x: 3.1, y: -0.5, rotation: 0, value: "h" },
      { id: "label-wp", kind: "LABEL", x: 3.1, y: 0.5, rotation: 0, value: "wp" },
      { id: "label-wm", kind: "LABEL", x: 3.1, y: 1.5, rotation: 0, value: "wm" },
      { id: "label-u", kind: "LABEL", x: 3.1, y: 2.5, rotation: 0, value: "u" },
    ],
    wires: [
      { id: "w-vdd", points: [[-8, -2.5], [-3.1, -2.5]] },
      { id: "w-vdd-ground", points: [[-8, 1.5], [-8, 1.5]] },
      { id: "w-vref", points: [[-9, -0.5], [-3.1, -0.5]] },
      { id: "w-vref-ground", points: [[-9, 3.5], [-9, 3.5]] },
      { id: "w-vin", points: [[-10, 0.5], [-3.1, 0.5]] },
      { id: "w-vin-ground", points: [[-10, 4.5], [-10, 4.5]] },
      { id: "w-vss-ground", points: [[-3.1, -1.5], [-5, -1.5]] },
      { id: "w-dp-ground", points: [[-3.1, 1.5], [-5, 1.5]] },
      { id: "w-dm-ground", points: [[-3.1, 2.5], [-5, 2.5]] },
      { id: "w-wr-ground", points: [[3.1, -2.5], [5, -2.5]] },
      { id: "w-eta", points: [[8, -1.5], [3.1, -1.5]] },
      { id: "w-eta-ground", points: [[8, 2.5], [8, 2.5]] },
    ],
    probes: [],
  };
}

function reluRealCellPage() {
  const components = [];
  const add = (component) => components.push(component);
  const labelAt = (id, value, x, y, params) => add({ id, kind: "LABEL", x, y, rotation: 0, value, params });
  const cap = (id, x, y, top, bottom, value, params) => {
    add({ id, kind: "C", x, y, rotation: 0, value, params });
    labelAt(`${id}-top`, top, x, y - 2);
    labelAt(`${id}-bottom`, bottom, x, y + 2);
  };
  const resistor = (id, x, y, left, right, value) => {
    add({ id, kind: "R", x, y, rotation: 0, value });
    labelAt(`${id}-left`, left, x - 2, y);
    labelAt(`${id}-right`, right, x + 2, y);
  };
  const mos4 = (id, kind, x, y, drain, gate, source, bulk, model, W) => {
    add({ id, kind, x, y, rotation: 0, value: model, params: { L: "2u", W } });
    labelAt(`${id}-d`, drain, x, y - 2);
    labelAt(`${id}-g`, gate, x - 2, y);
    labelAt(`${id}-s`, source, x, y + 2);
    labelAt(`${id}-b`, bulk, x + 2, y);
  };

  ["vdd", "vss", "vref", "x", "dp", "dm", "wr", "eta", "h", "wp", "wm", "u"].forEach((name, idx) => {
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
    id: "p-real-relu-cell",
    name: "relu1_real_cell",
    description: "Pure MOS/R/C ReLU-like learning cell with split positive and negative weight nodes.",
    components,
    wires: [],
    probes: [],
  };
}

async function waveformState(page) {
  return page.evaluate(() => ({
    pane: Boolean(document.querySelector(".wf-pane")),
    rows: [...document.querySelectorAll(".wf-trow-name")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    bodyText: document.body.textContent ?? "",
    hiddenTraceButton: [...document.querySelectorAll(".wf-debug-trace-trigger")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  }));
}

async function liveFlowState(page) {
  return page.evaluate(() => {
    const overlays = [
      ...document.querySelectorAll(".wire-live.wire-live-overlay"),
      ...document.querySelectorAll(".component-live.component-live-overlay"),
    ].map((el) => ({
      className: el.getAttribute("class") ?? "",
      source: el.getAttribute("data-live-flow-source") ?? "",
      current: el.getAttribute("data-live-flow-current") ?? "",
    }));
    const bodyText = document.body.textContent ?? "";
    return {
      overlayCount: overlays.length,
      ngspiceOverlayCount: overlays.filter((overlay) => overlay.source === "ngspice").length,
      nonNgspiceOverlays: overlays.filter((overlay) => overlay.source !== "ngspice"),
      hasFallbackCopy: bodyText.toLowerCase().includes("fallback"),
      hasEstimatedCopy: bodyText.toLowerCase().includes("estimated"),
      status: document.querySelector(".live-flow-status-label")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
}

async function runAndAssertIntentionalScope(page, doc, tag, expectedRows = ["V(in)", "V(out)"], readySelector = '[data-component-id="label-out"]') {
  await page.goto(docUrl(doc, tag), { waitUntil: "networkidle2" });
  await page.waitForSelector(readySelector, { timeout: 5000 });

  await runSim(page);
  await page.waitForFunction(
    () => Boolean(document.querySelector(".wf-pane")) ||
      Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
      document.body.textContent?.includes("✗"),
    { timeout: 10000 },
  );

  const state = await waveformState(page);
  assert.equal(state.pane, true, JSON.stringify(state, null, 2));
  assert.deepEqual(state.rows, expectedRows, JSON.stringify(state, null, 2));
  assert.equal(state.rows.some((row) => /^V\(n\d+\)$/.test(row)), false, JSON.stringify(state, null, 2));
  assert.equal(state.rows.some((row) => /^I\(/.test(row)), false, JSON.stringify(state, null, 2));
  assert.ok(state.hiddenTraceButton.some((text) => /^\+ More traces\s*\d+/.test(text)), JSON.stringify(state, null, 2));
  assert.equal(state.bodyText.includes("Simulation failed"), false, state.bodyText);

  const flowState = await liveFlowState(page);
  assert.ok(flowState.overlayCount > 0, `expected visible Live Flow overlays after running ${tag}: ${JSON.stringify(flowState, null, 2)}`);
  assert.equal(
    flowState.ngspiceOverlayCount,
    flowState.overlayCount,
    `all real-circuit Live Flow overlays must come from ngspice current vectors for ${tag}: ${JSON.stringify(flowState, null, 2)}`,
  );
  assert.equal(flowState.hasFallbackCopy, false, `Live Flow UI must not mention fallback currents for ${tag}`);
  assert.equal(flowState.hasEstimatedCopy, false, `Live Flow UI must not mention estimated currents for ${tag}`);
  assert.match(flowState.status, /ngspice/i, `Live Flow status should identify ngspice current-vector coverage for ${tag}: ${JSON.stringify(flowState, null, 2)}`);
}

test("real half-wave rectifier run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, halfWaveRectifierDoc(), "rectifier");
  } finally {
    await browser.close();
  }
});

test("real CMOS inverter run keeps generated nodes hidden by default", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, cmosInverterDoc(), "cmos", ["V(vin)", "V(out)"]);
  } finally {
    await browser.close();
  }
});

test("real RLC filter run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, rlcFilterDoc(), "rlc-filter", ["V(in)", "V(out)"]);
  } finally {
    await browser.close();
  }
});

test("real reusable RC subcircuit run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, reusableRcSubcircuitDoc(), "subx-rc", ["V(in)", "V(out)"]);
  } finally {
    await browser.close();
  }
});

test("real inverting op-amp amplifier run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, invertingOpAmpDoc(), "opamp-inverting", ["V(in)", "V(out)"]);
  } finally {
    await browser.close();
  }
});

test("real BJT bias stage run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(page, bjtBiasStageDoc(), "bjt-bias", ["V(in)", "V(out)"]);
  } finally {
    await browser.close();
  }
});

test("real MOS differential pair run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(
      page,
      mosDifferentialPairDoc(),
      "mos-diff-pair",
      ["V(inp)", "V(outp)", "V(outn)"],
      '[data-component-id="label-outn"]',
    );
  } finally {
    await browser.close();
  }
});

test("real MOS common-source amplifier run keeps the scope focused on user labels", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await runAndAssertIntentionalScope(
      page,
      mosCommonSourceAmplifierDoc(),
      "mos-common-source",
      ["V(in)", "V(out)", "V(src)"],
      '[data-component-id="label-src"]',
    );
  } finally {
    await browser.close();
  }
});

test("real pure-device ReLU learning-cell run keeps the scope focused on intentional signals", async () => {
  const { browser, page } = await launchApp({ width: 1600, height: 1000 });
  try {
    await runAndAssertIntentionalScope(page, reluLearningCellDoc(), "relu-learning", ["V(x)", "V(h)", "V(wp)", "V(wm)", "V(u)"]);
  } finally {
    await browser.close();
  }
});
