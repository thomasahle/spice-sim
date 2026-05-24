import type { CircuitDoc, AnalysisSpec, CircuitComponent, Probe, Wire } from "./model";
import { makeId } from "./model";

export interface Demo {
  id: string;
  name: string;
  description: string;
  build: () => CircuitDoc;
}

/** Wrap a flat (legacy-style) page into a single-page CircuitDoc. */
function singlePageDoc(page: {
  components: CircuitComponent[];
  wires: Wire[];
  probes: Probe[];
  directives: string;
  analysis: AnalysisSpec;
}): CircuitDoc {
  const root = {
    id: makeId("page"),
    name: "main",
    components: page.components,
    wires: page.wires,
    probes: page.probes,
  };
  return {
    pages: [root],
    activePageId: root.id,
    directives: page.directives,
    analysis: page.analysis,
  };
}

export const DEMOS: Demo[] = [
  {
    id: "divider",
    name: "Voltage divider",
    description: "10V source with two 1 kΩ resistors — mid-point should read 5 V (OP).",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -10, y: 0, rotation: 0, value: "10" },
        { id: "r1", kind: "R", x: -2, y: -4, rotation: 0, value: "1k" },
        { id: "r2", kind: "R", x: 6, y: 0, rotation: 90, value: "1k" },
        { id: "g1", kind: "GND", x: -10, y: 4, rotation: 0, value: "" },
        { id: "g2", kind: "GND", x: 6, y: 4, rotation: 0, value: "" },
        { id: "lbl_mid", kind: "LABEL", x: 4, y: -3, rotation: 0, value: "mid" },
      ],
      wires: [
        { id: "w1", points: [[-10, -2], [-10, -4], [-4, -4]] },
        { id: "w2", points: [[0, -4], [4, -4], [4, -3], [6, -3], [6, -2]] },
        { id: "w3", points: [[6, 2], [6, 4]] },
        { id: "w4", points: [[-10, 2], [-10, 4]] },
      ],
      probes: [{ id: "p_mid", x: 4, y: -3, color: "#0a84ff" }],
      directives: "",
      analysis: { kind: "op" },
    }),
  },
  {
    id: "rc_lowpass",
    name: "RC low-pass",
    description: "1 kΩ + 159 nF → fc ≈ 1 kHz. Run AC sweep for the Bode plot.",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -8, y: 0, rotation: 0, value: "AC 1" },
        { id: "r1", kind: "R", x: 0, y: -3, rotation: 0, value: "1k" },
        { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "159n" },
        { id: "g_in", kind: "GND", x: -8, y: 4, rotation: 0, value: "" },
        { id: "g_out", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
        { id: "lbl_out", kind: "LABEL", x: 4, y: -3, rotation: 0, value: "out" },
      ],
      wires: [
        { id: "w1", points: [[-8, -2], [-8, -3], [-2, -3]] },
        { id: "w2", points: [[2, -3], [4, -3], [4, -2]] },
        { id: "w3", points: [[4, 2], [4, 4]] },
        { id: "w4", points: [[-8, 2], [-8, 4]] },
      ],
      probes: [{ id: "p1", x: 4, y: -3, color: "#0a84ff" }],
      directives: "",
      analysis: { kind: "ac", sweep: "dec", npts: 30, fstart: "10", fstop: "100k" },
    }),
  },
  {
    id: "rc_step",
    name: "RC step response",
    description: "Step into 1 kΩ + 1 µF. Watch the exponential charge. Run Transient.",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -8, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 5m 10m)" },
        { id: "r1", kind: "R", x: 0, y: -3, rotation: 0, value: "1k" },
        { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "1u" },
        { id: "g_in", kind: "GND", x: -8, y: 4, rotation: 0, value: "" },
        { id: "g_out", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
        { id: "lbl_out", kind: "LABEL", x: 4, y: -3, rotation: 0, value: "out" },
      ],
      wires: [
        { id: "w1", points: [[-8, -2], [-8, -3], [-2, -3]] },
        { id: "w2", points: [[2, -3], [4, -3], [4, -2]] },
        { id: "w3", points: [[4, 2], [4, 4]] },
        { id: "w4", points: [[-8, 2], [-8, 4]] },
      ],
      probes: [{ id: "p1", x: 4, y: -3, color: "#0a84ff" }],
      directives: "",
      analysis: { kind: "tran", tstep: "10u", tstop: "10m" },
    }),
  },
  {
    id: "inverting_opamp",
    name: "Inverting amplifier",
    description: "Op-amp with R1=1k, Rf=10k → gain −10. Run Transient with a sine.",
    build: () => singlePageDoc({
      // Op-amp at (0,-4): pins V+ (-3,-5), V- (-3,-3), OUT (3,-4)
      // R1 horiz at (-8,-3): pins (-10,-3), (-6,-3)
      // Rf horiz at (-3,-7): pins (-5,-7), (-1,-7)
      // Vin at (-14,0): pins (-14,-2), (-14,2)
        components: [
          { id: "vin", kind: "V", x: -14, y: 0, rotation: 0, value: "SIN(0 0.1 1k)" },
          { id: "r1", kind: "R", x: -8, y: -3, rotation: 0, value: "1k" },
          { id: "rf", kind: "R", x: -3, y: -7, rotation: 0, value: "10k" },
          { id: "op", kind: "OPAMP", x: 0, y: -4, rotation: 0, value: "OPAMP" },
          { id: "g_in", kind: "GND", x: -14, y: 4, rotation: 0, value: "" },
          { id: "g_p", kind: "GND", x: -3, y: -6, rotation: 0, value: "" },
          { id: "lbl_out", kind: "LABEL", x: 4, y: -4, rotation: 0, value: "out" },
        ],
        wires: [
          // Vin+ → R1 left
          { id: "w1", points: [[-14, -2], [-14, -3], [-10, -3]] },
          // R1 right → op V- (and Rf left)
          { id: "w2", points: [[-6, -3], [-3, -3]] },
          // Rf left → op V- node (already connected via wire above)
          { id: "w3", points: [[-5, -7], [-3, -7], [-3, -3]] },
          // Rf right → op OUT
          { id: "w4", points: [[-1, -7], [3, -7], [3, -4]] },
          // op OUT → label
          { id: "w5", points: [[3, -4], [4, -4]] },
          // op V+ → GND
          { id: "w6", points: [[-3, -5], [-3, -6]] },
          // Vin- → GND
          { id: "w7", points: [[-14, 2], [-14, 4]] },
        ],
        probes: [{ id: "p1", x: 4, y: -4, color: "#0a84ff" }],
        directives: "",
        analysis: { kind: "tran", tstep: "10u", tstop: "3m" },
    }),
  },
  {
    id: "half_wave_rectifier",
    name: "Half-wave rectifier",
    description: "Sine 5V @ 60Hz → diode → 10kΩ load. Positive half-cycles pass minus the 0.7V drop.",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -8, y: 0, rotation: 0, value: "SIN(0 5 60)" },
        { id: "d1", kind: "D", x: 0, y: -3, rotation: 0, value: "D" },
        { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "10k" },
        { id: "g_in", kind: "GND", x: -8, y: 4, rotation: 0, value: "" },
        { id: "g_out", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
        { id: "lbl_out", kind: "LABEL", x: 4, y: -3, rotation: 0, value: "out" },
      ],
      wires: [
        { id: "w1", points: [[-8, -2], [-8, -3], [-2, -3]] },
        { id: "w2", points: [[2, -3], [4, -3], [4, -2]] },
        { id: "w3", points: [[4, 2], [4, 4]] },
        { id: "w4", points: [[-8, 2], [-8, 4]] },
      ],
      probes: [{ id: "p_out", x: 4, y: -3, color: "#30d158" }],
      directives: "",
      analysis: { kind: "tran", tstep: "100u", tstop: "50m" },
    }),
  },
  {
    id: "diode_iv",
    name: "Diode IV curve",
    description: "Sweep across a diode from -1V to +1V to see the exponential forward-bias I(V).",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -4, y: 0, rotation: 0, value: "0" },
        { id: "d1", kind: "D", x: 4, y: 0, rotation: 90, value: "D" },
        { id: "g1", kind: "GND", x: -4, y: 4, rotation: 0, value: "" },
        { id: "g2", kind: "GND", x: 4, y: 4, rotation: 0, value: "" },
        { id: "lbl_in", kind: "LABEL", x: -4, y: -3, rotation: 0, value: "in" },
      ],
      wires: [
        { id: "w1", points: [[-4, -2], [-4, -3]] },
        { id: "w2", points: [[-4, -2], [4, -2]] },
        { id: "w3", points: [[-4, 2], [-4, 4]] },
        { id: "w4", points: [[4, 2], [4, 4]] },
      ],
      probes: [{ id: "p_in", x: -4, y: -3, color: "#0a84ff" }],
      directives: "",
      analysis: { kind: "dc", src: "v1", start: "-1", stop: "1", step: "0.05" },
    }),
  },
  {
    id: "nmos_transfer",
    name: "NMOS transfer curve",
    description: "Sweep V_GS from 0 to 3V with V_DS=2V — Id rises sharply past the ~1V threshold.",
    build: () => singlePageDoc({
      components: [
        { id: "vgs", kind: "V", x: -8, y: 0, rotation: 0, value: "0" },
        { id: "vds", kind: "V", x: 8, y: 0, rotation: 0, value: "2" },
        { id: "m1", kind: "NMOS", x: 0, y: 0, rotation: 0, value: "NMOS_DEF", params: { W: "10u", L: "1u" } },
        { id: "g_s", kind: "GND", x: 0, y: 4, rotation: 0, value: "" },
        { id: "g_in", kind: "GND", x: -8, y: 4, rotation: 0, value: "" },
        { id: "g_d", kind: "GND", x: 8, y: 4, rotation: 0, value: "" },
        { id: "lbl_g", kind: "LABEL", x: -3, y: -1, rotation: 0, value: "g" },
        { id: "lbl_d", kind: "LABEL", x: 3, y: -3, rotation: 0, value: "d" },
      ],
      wires: [
        { id: "w1", points: [[-8, -2], [-8, -1], [-3, -1], [-3, 0]] },
        { id: "w2", points: [[-8, 2], [-8, 4]] },
        { id: "w3", points: [[3, -2], [3, -3], [8, -3], [8, -2]] },
        { id: "w4", points: [[8, 2], [8, 4]] },
        { id: "w5", points: [[3, 2], [3, 3], [0, 3], [0, 4]] },
      ],
      probes: [],
      directives: ".model NMOS_DEF NMOS (LEVEL=1 VTO=1 KP=20u)\n",
      analysis: { kind: "dc", src: "vgs", start: "0", stop: "3", step: "0.05" },
    }),
  },
  {
    id: "rlc_bandpass",
    name: "RLC band-pass",
    description: "Series-resonant R+L+C — peak transmission at fr ≈ 1/(2π√LC). Run AC sweep.",
    build: () => singlePageDoc({
      components: [
        { id: "v1", kind: "V", x: -8, y: 0, rotation: 0, value: "AC 1" },
        { id: "r1", kind: "R", x: -3, y: -3, rotation: 0, value: "100" },
        { id: "c1", kind: "C", x: 3, y: -3, rotation: 0, value: "1u" },
        { id: "l1", kind: "L", x: 8, y: 0, rotation: 90, value: "10m" },
        { id: "g_in", kind: "GND", x: -8, y: 4, rotation: 0, value: "" },
        { id: "g_out", kind: "GND", x: 8, y: 4, rotation: 0, value: "" },
        { id: "lbl_out", kind: "LABEL", x: 8, y: -3, rotation: 0, value: "out" },
      ],
      wires: [
        { id: "w1", points: [[-8, -2], [-8, -3], [-5, -3]] },
        { id: "w2", points: [[-1, -3], [1, -3]] },
        { id: "w3", points: [[5, -3], [8, -3], [8, -2]] },
        { id: "w4", points: [[8, 2], [8, 4]] },
        { id: "w5", points: [[-8, 2], [-8, 4]] },
      ],
      probes: [{ id: "p_out", x: 8, y: -3, color: "#bf5af2" }],
      directives: "",
      analysis: { kind: "ac", sweep: "dec", npts: 30, fstart: "10", fstop: "100k" },
    }),
  },
  {
    id: "rc_cascade_subckt",
    name: "Cascaded RC filter (subcircuit)",
    description:
      "Two RC low-pass stages built from the same reusable .subckt block. Open the `rc_stage` page in the side panel to edit the subcircuit definition.",
    build: () => {
      const mainId = makeId("page");
      const subId = makeId("page");
      return {
        pages: [
          {
            id: mainId,
            name: "main",
            components: [
              { id: "v1", kind: "V", x: -10, y: 0, rotation: 0, value: "AC 1" },
              // SUBX defaults to 4 pins; force 2 (in/out) via params.npins.
              { id: "x1", kind: "SUBX", x: -3, y: -3, rotation: 0, value: "rc_stage", params: { npins: "2" } },
              { id: "x2", kind: "SUBX", x: 5, y: -3, rotation: 0, value: "rc_stage", params: { npins: "2" } },
              { id: "g_in", kind: "GND", x: -10, y: 4, rotation: 0, value: "" },
              { id: "lbl_mid", kind: "LABEL", x: 1, y: -3, rotation: 0, value: "mid" },
              { id: "lbl_out", kind: "LABEL", x: 9, y: -3, rotation: 0, value: "out" },
            ],
            wires: [
              { id: "w1", points: [[-10, -2], [-10, -3], [-6, -3]] },
              { id: "w2", points: [[0, -3], [2, -3]] },
              { id: "w3", points: [[8, -3], [9, -3]] },
              { id: "w4", points: [[-10, 2], [-10, 4]] },
            ],
            probes: [{ id: "p_out", x: 9, y: -3, color: "#bf5af2" }],
          },
          {
            id: subId,
            name: "rc_stage",
            description: "Single-pole RC low-pass building block (R then C to ground).",
            components: [
              // The first port-label encountered becomes pin 0 of the SUBX
              // instance, so keep `in` ahead of `out` in this array.
              { id: "lbl_in", kind: "LABEL", x: -6, y: 0, rotation: 0, value: "in", params: { port: "1" } },
              { id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" },
              { id: "c1", kind: "C", x: 4, y: 3, rotation: 0, value: "159n" },
              { id: "g1", kind: "GND", x: 4, y: 7, rotation: 0, value: "" },
              { id: "lbl_out", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out", params: { port: "1" } },
            ],
            wires: [
              { id: "sw1", points: [[-6, 0], [-4, 0]] },
              { id: "sw2", points: [[0, 0], [4, 0]] },
              { id: "sw3", points: [[4, 0], [4, 1]] },
              { id: "sw4", points: [[4, 5], [4, 7]] },
            ],
            probes: [],
          },
        ],
        activePageId: mainId,
        directives: "",
        analysis: { kind: "ac", sweep: "dec", npts: 30, fstart: "10", fstop: "100k" },
      };
    },
  },
];
