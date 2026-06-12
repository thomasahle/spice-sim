import test from "node:test";
import assert from "node:assert/strict";

import { launchApp, runSim, waitFor } from "./_setup.mjs";

const DEV_URL = process.env.SPICESIM_E2E_URL ?? "http://localhost:5173/";

function docUrl(doc) {
  const payload = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
  return `${DEV_URL}?live-flow-ngspice-smoke=${Date.now()}#doc=${encodeURIComponent(payload)}`;
}

function rcStepDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-ngspice",
        name: "main",
        description: "Live Flow ngspice smoke",
        components: [
          {
            id: "vin",
            kind: "V",
            x: -4,
            y: 0,
            rotation: 0,
            value: "PULSE(0 5 0 1u 1u 1m 2m)",
          },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "1u" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-c", points: [[2, -2], [4, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-c-g", points: [[4, 2], [4, 2.5]] },
          { id: "w-loose-unsampled", points: [[7, -5], [9, -5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-ngspice",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function operatingPointDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-op",
        name: "main",
        description: "Live Flow non-transient HUD smoke",
        components: [
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-op",
    directives: "",
    analysis: { kind: "op" },
  };
}

function rlStepDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-inductor",
        name: "main",
        description: "Live Flow inductor ngspice smoke",
        components: [
          {
            id: "vin",
            kind: "V",
            x: -4,
            y: 0,
            rotation: 0,
            value: "PULSE(0 5 0 1u 1u 1m 2m)",
          },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "100" },
          { id: "l1", kind: "L", x: 4, y: 0, rotation: 0, value: "10m" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-l", points: [[2, -2], [4, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-l-g", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-inductor",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function floatingPinDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-floating",
        name: "main",
        description: "Live Flow floating pin smoke",
        components: [
          {
            id: "vin",
            kind: "V",
            x: -4,
            y: 0,
            rotation: 0,
            value: "PULSE(0 5 0 1u 1u 1m 2m)",
          },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "1k" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-floating",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function diodeForwardDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-diode",
        name: "main",
        description: "Live Flow diode ngspice smoke",
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "5" },
          { id: "d1", kind: "D", x: 0, y: -2, rotation: 270, value: "DMOD" },
          { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "10k" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-d", points: [[-4, -2], [-2, -2]] },
          { id: "w-d-r", points: [[2, -2], [4, -2]] },
          { id: "w-r-g", points: [[4, 2], [4, 4]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-diode",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function currentSourceDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-current-source",
        name: "main",
        description: "Live Flow current-source ngspice smoke",
        components: [
          { id: "iin", kind: "I", x: -4, y: 0, rotation: 0, value: "DC 1m" },
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 90, value: "1k" },
          { id: "g1", kind: "GND", x: -4, y: 2.5, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 0, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-top", points: [[-4, -2], [0, -2]] },
          { id: "w-i-ground", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-r-ground", points: [[0, 2], [0, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-current-source",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function behavioralSourceDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-behavioral-source",
        name: "main",
        description: "Live Flow behavioral-source ngspice smoke",
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "DC 1" },
          { id: "b1", kind: "B", x: 0, y: 0, rotation: 0, value: "V(in) * 2" },
          { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "lbl-in", kind: "LABEL", x: -4, y: -2, rotation: 0, value: "in" },
          { id: "g-vin", kind: "GND", x: -4, y: 2.5, rotation: 0, value: "" },
          { id: "g-b", kind: "GND", x: 0, y: 2.5, rotation: 0, value: "" },
          { id: "g-r", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-b-r", points: [[0, -2], [4, -2]] },
          { id: "w-vin-ground", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-b-ground", points: [[0, 2], [0, 2.5]] },
          { id: "w-r-ground", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-behavioral-source",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function nmosSwitchDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-nmos",
        name: "main",
        description: "Live Flow NMOS terminal-current smoke",
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "3.3" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "3.3" },
          { id: "rload", kind: "R", x: 0, y: -6, rotation: 90, value: "1k" },
          { id: "m1", kind: "NMOS", x: 0, y: 0, rotation: 0, value: "NCH", params: { W: "20u", L: "1u" } },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-vg", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-src", kind: "GND", x: 0, y: 4, rotation: 0, value: "" },
          { id: "drain", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "drain" },
          { id: "gate", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "gate" },
        ],
        wires: [
          { id: "w-vdd-r", points: [[-6, -8], [0, -8]] },
          { id: "w-r-d", points: [[0, -4], [0, -2]] },
          { id: "w-gate", points: [[-6, -2], [-2, -2], [-2, 0]] },
          { id: "w-source", points: [[0, 2], [0, 4]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-nmos",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function pmosPullupDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-pmos",
        name: "main",
        description: "Live Flow PMOS4 terminal-current smoke",
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "0" },
          { id: "m1", kind: "PMOS4", x: 0, y: 0, rotation: 0, value: "PCH", params: { W: "20u", L: "1u" } },
          { id: "rload", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "vdd-src", kind: "LABEL", x: -6, y: -8, rotation: 0, value: "vdd" },
          { id: "vdd-source", kind: "LABEL", x: 0, y: 3.2, rotation: 0, value: "vdd" },
          { id: "vdd-body", kind: "LABEL", x: 3.2, y: 0, rotation: 0, value: "vdd" },
          { id: "gate-src", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "gate" },
          { id: "gate", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "gate" },
          { id: "out", kind: "LABEL", x: 2.6, y: -2, rotation: 0, value: "out" },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-gate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-source-vdd", points: [[0, 2], [0, 3.2]] },
          { id: "w-drain-load", points: [[0, -2], [4, -2]] },
          { id: "w-body-vdd", points: [[2, 0], [3.2, 0]] },
          { id: "w-gate", points: [[-6, -2], [-2, -2], [-2, 0]] },
          { id: "w-vdd-ground", points: [[-6, -4], [-6, -4]] },
          { id: "w-gate-ground", points: [[-6, 2], [-6, 2]] },
          { id: "w-load-ground", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-pmos",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function pmosSimplePullupDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-pmos3",
        name: "main",
        description: "Live Flow PMOS terminal-current smoke",
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "0" },
          { id: "m1", kind: "PMOS", x: 0, y: 0, rotation: 0, value: "PCH", params: { W: "20u", L: "1u" } },
          { id: "rload", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "vdd-src", kind: "LABEL", x: -6, y: -8, rotation: 0, value: "vdd" },
          { id: "vdd-source", kind: "LABEL", x: 0, y: 3.2, rotation: 0, value: "vdd" },
          { id: "gate-src", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "gate" },
          { id: "gate", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "gate" },
          { id: "out", kind: "LABEL", x: 2.6, y: -2, rotation: 0, value: "out" },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-gate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-source-vdd", points: [[0, 2], [0, 3.2]] },
          { id: "w-drain-load", points: [[0, -2], [4, -2]] },
          { id: "w-gate", points: [[-6, -2], [-2, -2], [-2, 0]] },
          { id: "w-vdd-ground", points: [[-6, -4], [-6, -4]] },
          { id: "w-gate-ground", points: [[-6, 2], [-6, 2]] },
          { id: "w-load-ground", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-pmos3",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function npnSwitchDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-npn",
        name: "main",
        description: "Live Flow NPN terminal-current smoke",
        components: [
          { id: "vcc", kind: "V", x: -8, y: -4, rotation: 0, value: "5" },
          { id: "vbase", kind: "V", x: -6, y: 2, rotation: 0, value: "1.1" },
          { id: "rload", kind: "R", x: 0, y: -5.5, rotation: 90, value: "2.2k" },
          { id: "rbase", kind: "R", x: -4.5, y: 0, rotation: 0, value: "22k" },
          { id: "q1", kind: "NPN", x: 0, y: 0, rotation: 0, value: "BJTN" },
          { id: "vcc-src", kind: "LABEL", x: -8, y: -6, rotation: 0, value: "vcc" },
          { id: "vcc-load", kind: "LABEL", x: 0, y: -7.5, rotation: 0, value: "vcc" },
          { id: "base-src", kind: "LABEL", x: -6, y: 0, rotation: 0, value: "base" },
          { id: "collector", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "collector" },
          { id: "g-vcc", kind: "GND", x: -8, y: -2, rotation: 0, value: "" },
          { id: "g-base", kind: "GND", x: -6, y: 4, rotation: 0, value: "" },
          { id: "g-emitter", kind: "GND", x: 0, y: 3.2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-vbase-rbase", points: [[-6, 0], [-6.5, 0]] },
          { id: "w-rbase-base", points: [[-2.5, 0], [-2, 0]] },
          { id: "w-rload-collector", points: [[0, -3.5], [0, -2]] },
          { id: "w-emitter-ground", points: [[0, 2], [0, 3.2]] },
          { id: "w-vcc-ground", points: [[-8, -2], [-8, -2]] },
          { id: "w-base-ground", points: [[-6, 4], [-6, 4]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-npn",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function pnpSwitchDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-pnp",
        name: "main",
        description: "Live Flow PNP terminal-current smoke",
        components: [
          { id: "vcc", kind: "V", x: -8, y: -4, rotation: 0, value: "DC 5" },
          { id: "vbase", kind: "V", x: -6, y: 2, rotation: 0, value: "DC 3.8" },
          { id: "q1", kind: "PNP", x: 0, y: 0, rotation: 0, value: "BJTP" },
          { id: "rload", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "vcc-src", kind: "LABEL", x: -8, y: -6, rotation: 0, value: "vcc" },
          { id: "vcc-emitter", kind: "LABEL", x: 0, y: 3.2, rotation: 0, value: "vcc" },
          { id: "base-src", kind: "LABEL", x: -6, y: 0, rotation: 0, value: "base" },
          { id: "out", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "out" },
          { id: "g-vcc", kind: "GND", x: -8, y: -2, rotation: 0, value: "" },
          { id: "g-base", kind: "GND", x: -6, y: 4, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-base", points: [[-6, 0], [-2, 0]] },
          { id: "w-collector-load", points: [[0, -2], [4, -2]] },
          { id: "w-emitter-vcc", points: [[0, 2], [0, 3.2]] },
          { id: "w-vcc-ground", points: [[-8, -2], [-8, -2]] },
          { id: "w-base-ground", points: [[-6, 4], [-6, 4]] },
          { id: "w-load-ground", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-pnp",
    directives: "",
    analysis: { kind: "tran", tstep: "5u", tstop: "1m" },
  };
}

function subcircuitStageDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-subx-main",
        name: "main",
        description: "Live Flow subcircuit pin-current smoke",
        components: [
          { id: "vin", kind: "V", x: -8, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "x1", kind: "SUBX", x: -2, y: -2, rotation: 0, value: "rc_stage", params: { npins: "2", w: "4", h: "2", pinSides: "LR" } },
          { id: "rload", kind: "R", x: 4, y: -2, rotation: 0, value: "10k" },
          { id: "g-vin", kind: "GND", x: -8, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 6, y: 0, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-x", points: [[-8, -2], [-4.6, -2]] },
          { id: "w-x-r", points: [[0.6, -2], [2, -2]] },
          { id: "w-v-g", points: [[-8, 2], [-8, 2.5]] },
          { id: "w-r-g", points: [[6, -2], [6, 0], [6, 0.5]] },
        ],
        probes: [],
      },
      {
        id: "p-live-flow-subx-stage",
        name: "rc_stage",
        description: "Two-pin RC stage for browser Live Flow pin-sense coverage.",
        components: [
          { id: "pin-in", kind: "LABEL", x: -6, y: 0, rotation: 0, value: "in", params: { port: "1", portOrder: "1" } },
          { id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 2, rotation: 0, value: "100n" },
          { id: "g1", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
          { id: "pin-out", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out", params: { port: "1", portOrder: "2" } },
        ],
        wires: [
          { id: "sw-in", points: [[-6, 0], [-4, 0]] },
          { id: "sw-r-c", points: [[0, 0], [4, 0]] },
          { id: "sw-c-g", points: [[4, 4], [4, 4.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-subx-main",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function opampStageDoc() {
  return {
    pages: [
      {
        id: "p-live-flow-opamp",
        name: "main",
        description: "Live Flow op-amp pin-sense smoke",
        components: [
          { id: "vin", kind: "V", x: -8, y: 1, rotation: 0, value: "DC 10u" },
          { id: "op", kind: "OPAMP", x: 0, y: 0, rotation: 0, value: "OPAMP" },
          { id: "rload", kind: "R", x: 6, y: 0, rotation: 0, value: "10k" },
          { id: "g-vin", kind: "GND", x: -8, y: 3, rotation: 0, value: "" },
          { id: "g-minus", kind: "GND", x: -3, y: 1, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 8, y: 0, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 3.5, y: 0, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-op", points: [[-8, -1], [-3, -1]] },
          { id: "w-op-r", points: [[3, 0], [4, 0]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-live-flow-opamp",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "1m" },
  };
}

async function scrubTransientToMiddle(page, fraction = 0.42) {
  await page.waitForSelector('input[aria-label="Transient playback time"]', {
    visible: true,
    timeout: 5000,
  });
  await page.evaluate((targetFraction) => {
    const slider = document.querySelector('input[aria-label="Transient playback time"]');
    if (!(slider instanceof HTMLInputElement)) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    slider.value = String(min + (max - min) * targetFraction);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  }, fraction);
  await waitFor(450);
}

async function enableLiveFlow(page) {
  await page.waitForSelector('[aria-label="Show Live Flow current animation"]', {
    visible: true,
    timeout: 5000,
  });
  await page.evaluate(() => {
    const toggle = document.querySelector('[aria-label="Show Live Flow current animation"]');
    if (toggle instanceof HTMLInputElement) {
      if (!toggle.checked) toggle.click();
      return;
    }
    if (toggle instanceof HTMLElement && toggle.getAttribute("data-state") !== "checked") {
      toggle.click();
    }
  });
  await waitFor(150);
}

async function disableLiveFlow(page) {
  await page.waitForSelector('[aria-label="Show Live Flow current animation"]', {
    visible: true,
    timeout: 5000,
  });
  await page.evaluate(() => {
    const toggle = document.querySelector('[aria-label="Show Live Flow current animation"]');
    if (toggle instanceof HTMLInputElement) {
      if (toggle.checked) toggle.click();
      return;
    }
    if (toggle instanceof HTMLElement && toggle.getAttribute("data-state") === "checked") {
      toggle.click();
    }
  });
  await waitFor(150);
}

async function appRunState(page) {
  return page.evaluate(() => ({
    bodyText: (document.body.textContent ?? "").slice(0, 2500),
    engineUnavailable: Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')),
    running: Boolean(document.querySelector('button[aria-label="Running simulation"]')),
    runButton: Boolean(document.querySelector('button[aria-label="Run simulation"]')),
    waveformPane: Boolean(document.querySelector(".wf-pane")),
    slider: Boolean(document.querySelector('input[aria-label="Transient playback time"]')),
    statusCodes: [...document.querySelectorAll(".statusbar code")].map((el) => el.textContent?.trim() ?? ""),
    liveStatus: [...document.querySelectorAll(".live-flow-status")].map((el) => ({
      text: el.textContent?.trim() ?? "",
      className: el.getAttribute("class") ?? "",
      ariaLabel: el.getAttribute("aria-label") ?? "",
      title: el.getAttribute("title") ?? "",
    })),
  }));
}

async function liveFlowState(page) {
  return page.evaluate(() => {
    const overlays = [...document.querySelectorAll(".wire-live.wire-live-overlay")];
    const componentOverlays = [...document.querySelectorAll(".component-live.component-live-overlay")];
    const ngspiceOverlays = overlays.filter((el) => el.getAttribute("data-live-flow-source") === "ngspice");
    const ngspiceComponentOverlays = componentOverlays.filter((el) => el.getAttribute("data-live-flow-source") === "ngspice");
    const first = ngspiceOverlays[0];
    const cs = first ? getComputedStyle(first) : null;
    const animation = first?.getAnimations?.()[0] ?? null;
    const slider = document.querySelector('input[aria-label="Transient playback time"]');
    const status = [...document.querySelectorAll(".live-flow-status")]
      .map((el) => ({
        text: el.textContent?.trim() ?? "",
        className: el.getAttribute("class") ?? "",
        ariaLabel: el.getAttribute("aria-label") ?? "",
        title: el.getAttribute("title") ?? "",
        source: el.getAttribute("data-live-flow-source") ?? "",
        tone: el.getAttribute("data-live-flow-tone") ?? "",
      }))
      .find((entry) => entry.source === "ngspice" || entry.text.includes("ngspice") || entry.ariaLabel.includes("ngspice"));
    const bodyText = document.body.textContent ?? "";
    const bodyLower = bodyText.toLowerCase();
    return {
      overlayCount: overlays.length,
      ngspiceOverlayCount: ngspiceOverlays.length,
      nonNgspiceOverlayCount: overlays.filter((el) => el.getAttribute("data-live-flow-source") !== "ngspice").length,
      componentOverlayCount: componentOverlays.length,
      ngspiceComponentOverlayCount: ngspiceComponentOverlays.length,
      nonNgspiceComponentOverlayCount: componentOverlays.filter((el) => el.getAttribute("data-live-flow-source") !== "ngspice").length,
      overlaySources: overlays.map((el) => el.getAttribute("data-live-flow-source") ?? ""),
      componentOverlaySources: componentOverlays.map((el) => el.getAttribute("data-live-flow-source") ?? ""),
      componentIds: ngspiceComponentOverlays.map((el) => el.getAttribute("data-component-flow-id") ?? ""),
      componentOverlayDetails: ngspiceComponentOverlays.map((el) => ({
        componentId: el.getAttribute("data-component-flow-id") ?? "",
        kind: el.getAttribute("data-component-flow-kind") ?? "",
        segment: el.getAttribute("data-component-flow-segment") ?? "",
        pathD: el.getAttribute("d") ?? "",
        clipPath: el.getAttribute("clip-path") ?? "",
        current: el.getAttribute("data-live-flow-current") ?? "",
        direction: el.getAttribute("data-live-flow-direction") ?? "",
        animationName: getComputedStyle(el).animationName,
      })),
      nonNgspiceOverlayDetails: overlays
        .filter((el) => el.getAttribute("data-live-flow-source") !== "ngspice")
        .map((el) => ({
          wireId: el.getAttribute("data-wire-id") ?? "",
          source: el.getAttribute("data-live-flow-source") ?? "",
          className: el.getAttribute("class") ?? "",
          current: el.getAttribute("data-live-flow-current") ?? "",
        })),
      nonNgspiceComponentOverlayDetails: componentOverlays
        .filter((el) => el.getAttribute("data-live-flow-source") !== "ngspice")
        .map((el) => ({
          componentId: el.getAttribute("data-component-flow-id") ?? "",
          source: el.getAttribute("data-live-flow-source") ?? "",
          className: el.getAttribute("class") ?? "",
          current: el.getAttribute("data-live-flow-current") ?? "",
        })),
      animationName: cs?.animationName ?? "",
      animationDuration: cs?.animationDuration ?? "",
      animationCurrentTime: animation?.currentTime ?? null,
      dashOffset: cs?.strokeDashoffset ?? "",
      wireId: first?.getAttribute("data-wire-id") ?? "",
      wireIds: ngspiceOverlays.map((el) => el.getAttribute("data-wire-id") ?? ""),
      overlayDetails: ngspiceOverlays.map((el) => ({
        wireId: el.getAttribute("data-wire-id") ?? "",
        current: el.getAttribute("data-live-flow-current") ?? "",
        direction: el.getAttribute("data-live-flow-direction") ?? "",
      })),
      dash: first?.getAttribute("stroke-dasharray") ?? "",
      inlineDuration: first instanceof SVGElement ? first.style.getPropertyValue("--flow-duration") : "",
      inlineDash: first instanceof SVGElement ? first.style.getPropertyValue("--flow-dash") : "",
      current: first?.getAttribute("data-live-flow-current") ?? "",
      direction: first?.getAttribute("data-live-flow-direction") ?? "",
      status,
      slider: slider instanceof HTMLInputElement
        ? { value: slider.value, min: slider.min, max: slider.max, aria: slider.getAttribute("aria-valuetext") }
        : null,
      bodyExcerpt: bodyText.slice(0, 2500),
      hasFallbackCopy: bodyLower.includes("fallback"),
      hasEstimatedCopy: bodyLower.includes("estimated"),
    };
  });
}

function assertOnlyNgspiceLiveFlow(state, context = "Live Flow") {
  assert.equal(
    state.nonNgspiceOverlayCount,
    0,
    `${context}: every visible Live Flow overlay must be backed by an ngspice current vector: ${JSON.stringify(state, null, 2)}`,
  );
  assert.equal(
    state.nonNgspiceComponentOverlayCount,
    0,
    `${context}: every visible component Live Flow overlay must be backed by an ngspice current vector: ${JSON.stringify(state, null, 2)}`,
  );
  assert.equal(
    state.hasFallbackCopy,
    false,
    `${context}: Live Flow UI must not describe fallback currents: ${JSON.stringify(state, null, 2)}`,
  );
  assert.equal(
    state.hasEstimatedCopy,
    false,
    `${context}: Live Flow UI must not describe estimated currents: ${JSON.stringify(state, null, 2)}`,
  );
}

async function waitForNgspiceLiveFlow(page, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let state = await liveFlowState(page);
  while (Date.now() < deadline) {
    if (state.ngspiceOverlayCount > 0) {
      assertOnlyNgspiceLiveFlow(state, "Live Flow ngspice coverage");
      return state;
    }
    await waitFor(150);
    state = await liveFlowState(page);
  }
  assert.fail(`expected visible Live Flow overlays from ngspice vectors, got ${JSON.stringify(state, null, 2)}`);
}

async function liveFlowMotionSample(page, wireId) {
  return page.evaluate((id) => {
    const escapedId = globalThis.CSS?.escape?.(id) ?? id.replaceAll('"', '\\"');
    const overlay = document.querySelector(`.wire-live.wire-live-overlay[data-wire-id="${escapedId}"]`);
    const cs = overlay ? getComputedStyle(overlay) : null;
    const animation = overlay?.getAnimations?.()[0] ?? null;
    return {
      dashOffset: cs?.strokeDashoffset ?? "",
      animationCurrentTime: animation?.currentTime ?? null,
    };
  }, wireId);
}

async function componentLiveFlowMotionSample(page, componentId) {
  return page.evaluate((id) => {
    const escapedId = globalThis.CSS?.escape?.(id) ?? id.replaceAll('"', '\\"');
    const overlay = document.querySelector(`.component-live.component-live-overlay[data-component-flow-id="${escapedId}"]`);
    const cs = overlay ? getComputedStyle(overlay) : null;
    const animation = overlay?.getAnimations?.()[0] ?? null;
    return {
      dashOffset: cs?.strokeDashoffset ?? "",
      animationCurrentTime: animation?.currentTime ?? null,
      animationName: cs?.animationName ?? "",
      source: overlay?.getAttribute("data-live-flow-source") ?? "",
      kind: overlay?.getAttribute("data-component-flow-kind") ?? "",
    };
  }, componentId);
}

// Sources no longer animate internal side streams — flow runs on the two lead
// stubs (pin -> circle edge) with the real current direction, leaving the
// +/- glyphs untouched. Nothing renders inside the body, so no clipping.
function assertSourceLeadStubFlow(state, componentId, label) {
  const segments = state.componentOverlayDetails.filter((detail) => detail.componentId === componentId);
  assert.equal(
    segments.length,
    2,
    `${label} flow should animate its two lead stubs: ${JSON.stringify(state, null, 2)}`,
  );
  assert.ok(
    segments.every((detail) => !/[ACQ]/.test(detail.pathD) && /L/.test(detail.pathD)),
    `${label} flow should be straight lead stubs, not curved paths: ${JSON.stringify(state, null, 2)}`,
  );
  const ds = segments.map((detail) => detail.pathD).sort();
  assert.ok(
    /M 0 -2 L 0 -1\.2/.test(ds[0]) && /M 0 1\.2 L 0 2/.test(ds[1]),
    `${label} flow should run on the pin->body lead stubs: ${JSON.stringify(ds)}`,
  );
  assert.ok(
    segments.every((detail) => !detail.clipPath || detail.clipPath === "none"),
    `${label} lead stubs render outside the body and must not be clipped to it: ${JSON.stringify(segments, null, 2)}`,
  );
  assert.ok(
    segments.every((detail) => /^-?1$/.test(detail.direction)) &&
      new Set(segments.map((detail) => detail.direction)).size === 1,
    `${label} lead stubs should share one real current direction: ${JSON.stringify(segments, null, 2)}`,
  );
}

async function assertLiveFlowDashMoves(page, state) {
  assert.ok(state.wireId, `expected a stable wire id for a Live Flow overlay, got ${JSON.stringify(state)}`);
  const before = await liveFlowMotionSample(page, state.wireId);
  await waitFor(350);
  const after = await liveFlowMotionSample(page, state.wireId);
  assert.notEqual(
    after.animationCurrentTime,
    before.animationCurrentTime,
    `Live Flow CSS animation timeline should advance: ${JSON.stringify({ before, after, state })}`,
  );
  assert.notEqual(
    after.dashOffset,
    before.dashOffset,
    `Live Flow dash offset should visibly move, not only exist: ${JSON.stringify({ before, after, state })}`,
  );
}

async function assertComponentLiveFlowDashMoves(page, state, preferredComponentId) {
  const componentId =
    preferredComponentId && state.componentIds.includes(preferredComponentId)
      ? preferredComponentId
      : state.componentIds[0];
  assert.ok(
    componentId,
    `expected a stable component id for a component Live Flow overlay, got ${JSON.stringify(state)}`,
  );
  const before = await componentLiveFlowMotionSample(page, componentId);
  await waitFor(350);
  const after = await componentLiveFlowMotionSample(page, componentId);
  assert.equal(
    before.source,
    "ngspice",
    `component Live Flow must be ngspice-sourced before animation check: ${JSON.stringify({ before, state })}`,
  );
  assert.equal(
    after.source,
    "ngspice",
    `component Live Flow must remain ngspice-sourced after animation check: ${JSON.stringify({ after, state })}`,
  );
  assert.match(after.animationName, /wire-flow/);
  assert.notEqual(
    after.animationCurrentTime,
    before.animationCurrentTime,
    `component Live Flow CSS animation timeline should advance: ${JSON.stringify({ componentId, before, after, state })}`,
  );
  assert.notEqual(
    after.dashOffset,
    before.dashOffset,
    `component Live Flow dash offset should visibly move: ${JSON.stringify({ componentId, before, after, state })}`,
  );
}

async function hoverWireAndReadouts(page, wireId) {
  const point = await page.evaluate((id) => {
    const escapedId = globalThis.CSS?.escape?.(id) ?? id.replaceAll('"', '\\"');
    const wire = document.querySelector(`.wire-hit-target[data-wire-id="${escapedId}"]`);
    if (!(wire instanceof SVGGraphicsElement)) return null;
    const bbox = wire.getBBox();
    const matrix = wire.getScreenCTM();
    if (!matrix) return null;
    const center = new DOMPoint(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2).matrixTransform(matrix);
    return { x: center.x, y: center.y };
  }, wireId);
  assert.ok(point, `expected wire hit target to exist for ${wireId}`);
  await page.mouse.move(point.x, point.y);
  await waitFor(250);
  return page.evaluate(() => ({
    readoutCount: document.querySelectorAll(".live-flow-readout").length,
    unsampledReadoutCount: document.querySelectorAll(".live-flow-readout.unsampled").length,
    ngspiceReadoutCount: document.querySelectorAll(".live-flow-readout.ngspice").length,
    readoutText: [...document.querySelectorAll(".live-flow-readout")].map((el) => el.textContent?.trim() ?? ""),
  }));
}

test("non-transient schematics do not show a Live Flow warning chip on the canvas", async () => {
  const { browser, page } = await launchApp({ width: 1300, height: 850 });
  try {
    await page.goto(docUrl(operatingPointDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector(".canvas-hud", { timeout: 5000 });

    const state = await page.evaluate(() => ({
      bodyHasRemovedWarning: (document.body.textContent ?? "").includes("Live Flow: Needs transient"),
      canvasHudText: document.querySelector(".canvas-hud")?.textContent ?? "",
      canvasHudStatusCount: document.querySelectorAll(".canvas-hud .live-flow-status").length,
      appStatusCount: document.querySelectorAll(".live-flow-status").length,
    }));

    assert.equal(
      state.bodyHasRemovedWarning,
      false,
      `removed warning label should not appear anywhere in the app chrome: ${JSON.stringify(state, null, 2)}`,
    );
    assert.equal(
      state.canvasHudStatusCount,
      0,
      `canvas HUD should not reserve a Live Flow status chip for non-transient schematics: ${JSON.stringify(state, null, 2)}`,
    );
    assert.equal(
      state.appStatusCount,
      0,
      `non-ngspice Live Flow warnings should not reserve a visible status chip: ${JSON.stringify(state, null, 2)}`,
    );
    assert.match(state.canvasHudText, /Grid:/);
    assert.match(state.canvasHudText, /Snap:/);
    // Zoom readout is a button showing e.g. "170%" (click = reset to 100%).
    assert.match(state.canvasHudText, /\d+%/);
  } finally {
    await browser.close();
  }
});

test("Live Flow animates only ngspice current-vector samples after a real transient run", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(rcStepDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));
    await enableLiveFlow(page);
    await scrubTransientToMiddle(page);
    const state = await waitForNgspiceLiveFlow(page);

    assert.ok(state.ngspiceOverlayCount > 0, "expected visible Live Flow overlays from ngspice vectors");
    assert.ok(
      state.ngspiceComponentOverlayCount > 0,
      `expected component bodies to animate from ngspice vectors: ${JSON.stringify(state, null, 2)}`,
    );
    assert.ok(
      state.componentIds.includes("r1") || state.componentIds.includes("r2") || state.componentIds.includes("c1") || state.componentIds.includes("vin"),
      `expected at least one circuit component to have ngspice-backed body flow: ${JSON.stringify(state, null, 2)}`,
    );
    assert.ok(
      state.componentOverlayDetails.every((detail) => ["V", "R", "C", "GND"].includes(detail.kind)),
      `expected custom passive/source component flow overlays in the RC circuit: ${JSON.stringify(state, null, 2)}`,
    );
    const groundSegments = state.componentOverlayDetails.filter((detail) => detail.kind === "GND");
    assert.ok(
      groundSegments.length > 0,
      `expected grounded ngspice wire currents to animate through the ground symbols: ${JSON.stringify(state, null, 2)}`,
    );
    assert.ok(
      groundSegments.every((detail) => detail.direction === "1" && detail.animationName === "wire-flow"),
      `ground body flow should always move down into the ground symbol: ${JSON.stringify(state, null, 2)}`,
    );
    assert.ok(
      groundSegments.every((detail) => !/[ACQ]/.test(detail.pathD) && /L/.test(detail.pathD)),
      `ground body flow should use straight internal ground-symbol strokes: ${JSON.stringify(state, null, 2)}`,
    );
    assertSourceLeadStubFlow(state, "vin", "voltage source");
    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.match(state.animationName, /wire-flow/);
    assert.notEqual(state.animationDuration, "0s");
    assert.match(state.dashOffset, /[0-9eE.+-]/);
    assert.match(state.dash, /\d/);
    assert.match(state.inlineDuration, /s$/);
    assert.match(state.inlineDash, /\d/);
    assert.match(state.current, /[0-9eE.+-]/);
    assert.match(state.direction, /^-?1$/);
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "r1");

    const looseWireReadouts = await hoverWireAndReadouts(page, "w-loose-unsampled");
    assert.equal(
      looseWireReadouts.readoutCount,
      0,
      `unsampled wires must not show canvas Live Flow readouts: ${JSON.stringify(looseWireReadouts)}`,
    );

    await disableLiveFlow(page);
    const disabledState = await liveFlowState(page);
    assert.equal(
      disabledState.overlayCount,
      0,
      `disabling Live Flow should remove wire overlays after a valid ngspice run: ${JSON.stringify(disabledState, null, 2)}`,
    );
    assert.equal(
      disabledState.componentOverlayCount,
      0,
      `disabling Live Flow should remove component overlays after a valid ngspice run: ${JSON.stringify(disabledState, null, 2)}`,
    );
    assert.equal(
      disabledState.nonNgspiceOverlayCount + disabledState.nonNgspiceComponentOverlayCount,
      0,
      `disabled Live Flow must not leave fallback or stale overlays behind: ${JSON.stringify(disabledState, null, 2)}`,
    );
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice inductor current vectors in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(rlStepDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="l1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.45);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all inductor Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-r-l") || state.wireIds.includes("w-l-g"),
      `expected an inductor lead to animate from @L1[i]: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("l1"),
      `expected the inductor body to animate from @L1[i]: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-5),
      `expected visible inductor current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "l1");
  } finally {
    await browser.close();
  }
});

test("Live Flow does not animate when ngspice run reports floating pins", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(floatingPinDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => document.querySelectorAll(".floating-pin-marker").length > 0 ||
        /floating|connectivity|cannot run|simulation failed/i.test(document.body.textContent ?? "") ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')),
      { timeout: 10000 },
    );
    await enableLiveFlow(page);
    const state = await liveFlowState(page);

    assert.equal(state.overlayCount, 0, `invalid circuits must not animate Live Flow: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.ngspiceOverlayCount, 0, `invalid circuits must not show ngspice Live Flow overlays: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.nonNgspiceOverlayCount, 0, `invalid circuits must never use fallback Live Flow overlays: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.componentOverlayCount, 0, `invalid circuits must not animate component Live Flow: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.ngspiceComponentOverlayCount, 0, `invalid circuits must not show component ngspice Live Flow overlays: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.nonNgspiceComponentOverlayCount, 0, `invalid circuits must never use fallback component Live Flow overlays: ${JSON.stringify(state, null, 2)}`);
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.equal(state.hasEstimatedCopy, false, "Live Flow UI should not describe fallback/estimated currents");

    const floatingState = await page.evaluate(() => ({
      markers: document.querySelectorAll(".floating-pin-marker").length,
      statuses: [...document.querySelectorAll(".live-flow-status")].map((el) => ({
        text: el.textContent?.trim() ?? "",
        source: el.getAttribute("data-live-flow-source") ?? "",
        tone: el.getAttribute("data-live-flow-tone") ?? "",
        title: el.getAttribute("title") ?? "",
        ariaLabel: el.getAttribute("aria-label") ?? "",
      })),
      bodyExcerpt: (document.body.textContent ?? "").slice(0, 2500),
    }));
    assert.ok(
      floatingState.markers > 0 ||
        /floating|connectivity|cannot run|simulation failed/i.test(floatingState.bodyExcerpt),
      `expected floating/connectivity diagnostics before Live Flow can animate: ${JSON.stringify(floatingState, null, 2)}`,
    );
    assert.equal(
      floatingState.statuses.some((entry) => entry.source === "ngspice"),
      false,
      `ngspice Live Flow status should be absent when no valid ngspice vectors exist: ${JSON.stringify(floatingState, null, 2)}`,
    );
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice diode current vectors for nonlinear devices", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(diodeForwardDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="d1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page);
    const state = await waitForNgspiceLiveFlow(page);

    assert.ok(state.ngspiceOverlayCount > 0, "expected diode circuit Live Flow overlays from ngspice vectors");
    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all diode Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-v-d") || state.wireIds.includes("w-d-r"),
      `expected a diode lead to animate from ngspice diode/source/resistor vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("d1"),
      `expected the diode body to animate from ngspice diode current: ${JSON.stringify(state)}`,
    );
    assert.match(state.current, /[0-9eE.+-]/);
    assert.match(state.direction, /^-?1$/);
    assert.ok(Math.abs(Number(state.current)) > 1e-8, `expected forward diode current above display threshold: ${JSON.stringify(state)}`);
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "d1");
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice current-source vectors in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(currentSourceDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="iin"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all current-source Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-top"),
      `expected the current-source output wire to animate from @I1[current]: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible current-source current above display threshold: ${JSON.stringify(state)}`,
    );
    assertSourceLeadStubFlow(state, "iin", "current source");
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "iin");
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice behavioral-source current vectors in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(behavioralSourceDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="b1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all behavioral-source Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-b-r"),
      `expected the behavioral-source output wire to animate from @B1[i]: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible behavioral-source current above display threshold: ${JSON.stringify(state)}`,
    );
    assertSourceLeadStubFlow(state, "b1", "behavioral source");
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "b1");
  } finally {
    await browser.close();
  }
});

test("Live Flow is terminal-strict for MOSFET wires in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(nmosSwitchDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="m1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all MOSFET Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-r-d") || state.wireIds.includes("w-source"),
      `expected an NMOS drain/source lead to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("m1"),
      `expected the NMOS body to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.equal(
      state.wireIds.includes("w-gate"),
      false,
      `MOS gate wires must not borrow drain/source branch current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible NMOS conduction current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "m1");
  } finally {
    await browser.close();
  }
});

test("Live Flow is terminal-strict for PMOS4 wires in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(pmosPullupDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="m1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all PMOS4 Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-drain-load") || state.wireIds.includes("w-source-vdd"),
      `expected a PMOS drain/source lead to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("m1"),
      `expected the PMOS4 body to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.equal(
      state.wireIds.includes("w-gate"),
      false,
      `PMOS gate wires must not borrow drain/source branch current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible PMOS conduction current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "m1");
  } finally {
    await browser.close();
  }
});

test("Live Flow is terminal-strict for 3-pin PMOS wires in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(pmosSimplePullupDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="m1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all 3-pin PMOS Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-drain-load") || state.wireIds.includes("w-source-vdd"),
      `expected a 3-pin PMOS drain/source lead to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.equal(
      state.wireIds.includes("w-gate"),
      false,
      `3-pin PMOS gate wires must not borrow drain/source branch current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible 3-pin PMOS conduction current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("m1"),
      `expected the 3-pin PMOS body to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "m1");
  } finally {
    await browser.close();
  }
});

test("Live Flow is terminal-strict for BJT wires in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(npnSwitchDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="q1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all BJT Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-rload-collector") ||
        state.wireIds.includes("w-rbase-base") ||
        state.wireIds.includes("w-emitter-ground"),
      `expected a BJT collector/base/emitter lead to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible BJT terminal current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("q1"),
      `expected the BJT body to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "q1");
  } finally {
    await browser.close();
  }
});

test("Live Flow is terminal-strict for PNP BJT wires in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(pnpSwitchDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="q1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page, 0.15);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all PNP Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-collector-load") ||
        state.wireIds.includes("w-emitter-vcc") ||
        state.wireIds.includes("w-base"),
      `expected a PNP collector/base/emitter lead to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible PNP terminal current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("q1"),
      `expected the PNP BJT body to animate from ngspice terminal vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "q1");
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice subcircuit pin sense currents in the browser UI", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(subcircuitStageDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="x1"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all subcircuit Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-v-x") || state.wireIds.includes("w-x-r"),
      `expected a subcircuit pin wire to animate from ngspice sense-source vectors: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("x1"),
      `expected the subcircuit block body to animate from ngspice pin-sense current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible subcircuit pin current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "x1");
  } finally {
    await browser.close();
  }
});

test("Live Flow uses ngspice pin-sense currents for built-in op-amps", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(opampStageDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="op"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );
    const afterRun = await appRunState(page);
    assert.equal(afterRun.engineUnavailable, false, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.waveformPane, true, JSON.stringify(afterRun, null, 2));
    assert.equal(afterRun.slider, true, JSON.stringify(afterRun, null, 2));

    await enableLiveFlow(page);
    await scrubTransientToMiddle(page);
    const state = await waitForNgspiceLiveFlow(page);

    assert.equal(
      state.nonNgspiceOverlayCount,
      0,
      `all op-amp Live Flow overlays must be ngspice-sourced, got ${JSON.stringify(state)}`,
    );
    assert.equal(state.hasFallbackCopy, false, "Live Flow UI should not describe fallback/estimated currents");
    assert.ok(
      state.wireIds.includes("w-op-r"),
      `expected the op-amp output wire to animate from ngspice pin-sense current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.componentIds.includes("op"),
      `expected the op-amp body to animate from ngspice pin-sense current: ${JSON.stringify(state)}`,
    );
    assert.ok(
      state.overlayDetails.some((detail) => Math.abs(Number(detail.current)) > 1e-8),
      `expected visible op-amp output/load current above display threshold: ${JSON.stringify(state)}`,
    );
    assert.ok(state.status, "Live Flow status should identify ngspice current-vector coverage");
    assert.equal(state.status?.source, "ngspice");
    assert.match(`${state.status?.text} ${state.status?.ariaLabel} ${state.status?.title}`, /ngspice/i);
    await assertLiveFlowDashMoves(page, state);
    await assertComponentLiveFlowDashMoves(page, state, "op");
  } finally {
    await browser.close();
  }
});
