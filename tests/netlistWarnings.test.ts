import assert from "node:assert/strict";
import test from "node:test";

import { buildNetlist } from "../src/editor/netlist.ts";
import type { CircuitDoc } from "../src/editor/model.ts";

test("subcircuit external pins follow visual left-then-right order", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      { id: "main", name: "main", wires: [], probes: [], components: [] },
      {
        id: "sub",
        name: "relu_cell",
        wires: [],
        probes: [],
        components: [
          { id: "h", kind: "LABEL", x: 7, y: -1, rotation: 0, value: "h" },
          { id: "vss", kind: "LABEL", x: 7, y: 0, rotation: 0, value: "VSS" },
          { id: "x", kind: "LABEL", x: -7, y: -1, rotation: 0, value: "x" },
          { id: "dpos", kind: "LABEL", x: -7, y: 0, rotation: 0, value: "dpos" },
        ],
      },
    ],
  };

  assert.match(buildNetlist(doc).netlist, /^\.subckt relu_cell x dpos h VSS$/m);
});

test("subcircuit instances can export more than eight pins", () => {
  const pins = Array.from({ length: 12 }, (_, i) => `n${i + 1}`);
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "x1", kind: "SUBX", x: 0, y: 0, rotation: 0, value: "wide", params: { npins: "12" } },
          ...pins.map((pin, i) => ({
            id: `label-${pin}`,
            kind: "LABEL" as const,
            x: i < 6 ? -4.2 : 4.2,
            y: i < 6 ? -2.5 + i : -2.5 + (i - 6),
            rotation: 0 as const,
            value: pin,
          })),
        ],
        wires: pins.map((pin, i) => ({
          id: `w-${pin}`,
          points: [[i < 6 ? -3 : 3, i < 6 ? -2.5 + i : -2.5 + (i - 6)], [i < 6 ? -4.2 : 4.2, i < 6 ? -2.5 + i : -2.5 + (i - 6)]] as [number, number][],
        })),
      },
    ],
  };

  assert.match(buildNetlist(doc).netlist, /^X1 n1 n2 n3 n4 n5 n6 n7 n8 n9 n10 n11 n12 wide$/m);
});

test("capacitors can emit initial conditions", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "c1", kind: "C", x: 0, y: 0, rotation: 0, value: "20p", params: { IC: "1.35" } },
          { id: "g1", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
          { id: "l1", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "wp" },
        ],
      },
    ],
  };

  assert.match(buildNetlist(doc).netlist, /^C1 wp 0 20p IC=1.35$/m);
});

test("explicit subcircuit ports keep internal labels private", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      { id: "main", name: "main", wires: [], probes: [], components: [] },
      {
        id: "sub",
        name: "block",
        wires: [],
        probes: [],
        components: [
          { id: "in", kind: "LABEL", x: -3, y: 0, rotation: 0, value: "in", params: { port: "1" } },
          { id: "out", kind: "LABEL", x: 5, y: 0, rotation: 0, value: "out", params: { port: "1" } },
          { id: "nint", kind: "LABEL", x: 1, y: 0, rotation: 0, value: "n_int" },
          { id: "r1", kind: "R", x: -1, y: 0, rotation: 0, value: "1k" },
          { id: "r2", kind: "R", x: 3, y: 0, rotation: 0, value: "1k" },
        ],
      },
    ],
  };

  const netlist = buildNetlist(doc).netlist;
  assert.match(netlist, /^\.subckt block in out$/m);
  assert.doesNotMatch(netlist, /^\.subckt block .*n_int/m);
  assert.match(netlist, /^R1 in n_int 1k$/m);
  assert.match(netlist, /^R2 n_int out 1k$/m);
});

test("canvas notes export as comments without electrical components", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "note1", kind: "NOTE", x: 0, y: 0, rotation: 0, value: "Forward path only\nNo behavioral sources" },
          { id: "g1", kind: "GND", x: 4, y: 0, rotation: 0, value: "" },
        ],
      },
    ],
  };

  const netlist = buildNetlist(doc).netlist;
  assert.match(netlist, /^\* Note: Forward path only$/m);
  assert.match(netlist, /^\* Note: No behavioral sources$/m);
  assert.doesNotMatch(netlist, /^1\b/m);
});

test("floating active-device warnings use terminal names", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "m1", kind: "NMOS", x: 0, y: 0, rotation: 0, value: "NMOS" },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.ok(result.warnings.some((warning) => warning.includes("M1 D pin is floating")));
  assert.ok(result.warnings.some((warning) => warning.includes("M1 G pin is floating")));
  assert.ok(result.warnings.some((warning) => warning.includes("M1 S pin is floating")));
  assert.deepEqual(result.floatingPins.map((pin) => pin.pinLabel), ["D", "G", "S"]);
});

test("netlist warns when a net label is close to a pin but not connected", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
          { id: "in", kind: "LABEL", x: -2.2, y: 0, rotation: 0, value: "in" },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.ok(
    result.warnings.some((warning) =>
      warning.includes('Net label "in" is 0.20 grid units from R1 1 pin but is not connected'),
    ),
  );
  assert.equal(
    result.warnings.some((warning) => warning.includes("label pin")),
    false,
  );
});

test("four-terminal MOSFETs netlist explicit body pin", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        wires: [],
        probes: [],
        components: [
          { id: "m1", kind: "NMOS4", x: 0, y: 0, rotation: 0, value: "NMOS_LEVEL1_FAST", params: { W: "8u", L: "2u" } },
          { id: "vdd", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "vdd" },
          { id: "gate", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "gate" },
          { id: "src", kind: "LABEL", x: 0, y: 2, rotation: 0, value: "src" },
          { id: "bulk", kind: "LABEL", x: 2, y: 0, rotation: 0, value: "vss" },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.match(result.netlist, /^M1 vdd gate src vss NMOS_LEVEL1_FAST L=2u W=8u$/m);
  assert.doesNotMatch(result.netlist, /^M1 vdd gate src src /m);
});

test("shorted-to-ground circuits get an explicit collapsed-node warning", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "v1", kind: "V", x: 0, y: 0, rotation: 0, value: "5" },
          { id: "g1", kind: "GND", x: 0, y: -2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.ok(result.warnings.some((warning) => warning.includes("All component pins resolve to ground")));
});

test("behavioral sources emit ngspice B-source expressions", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "b1", kind: "B", x: 0, y: 0, rotation: 0, value: "sin(2*pi*1k*time)" },
          { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "g1", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w1", points: [[0, -2], [4, -2]] },
          { id: "w2", points: [[4, 2], [0, 2]] },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.match(result.netlist, /^B1 n\d+ 0 V=sin\(2\*pi\*1k\*time\)$/m);
});

test("power-like net labels emit an implicit DC rail source on the root schematic", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "label1", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "+5V" },
          { id: "r1", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
          { id: "g1", kind: "GND", x: 4, y: 0, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };

  const result = buildNetlist(doc);

  // After the LaTeX/punctuation-aware sanitizer: leading `+` → `_p`,
  // trim leading underscores → `p5V`.
  assert.match(result.netlist, /^V1 p5V 0 DC 5$/m);
  assert.match(result.netlist, /^R1 p5V 0 1k$/m);
});

test("net labels W+ and W- get distinct SPICE names (regression)", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "lp", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "W+" },
          { id: "ln", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "W-" },
          // Two resistors driven from the two labels — if they collide
          // the second R will route through the first label's net.
          { id: "rp", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
          { id: "rn", kind: "R", x: 6, y: 0, rotation: 0, value: "2k" },
          { id: "g1", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };
  const result = buildNetlist(doc);
  // W+ and W- must map to distinct nodes; the resistor lines should
  // reference different net names.
  assert.match(result.netlist, /\bW_p\b/);
  assert.match(result.netlist, /\bW_n\b/);
  assert.notStrictEqual(
    result.netlist.match(/^R1 (\S+) /m)?.[1],
    result.netlist.match(/^R2 (\S+) /m)?.[1],
    "W+ and W- collapsed to the same net — sanitizer regression",
  );
});

test("LaTeX-style labels sanitize to readable SPICE names", () => {
  // Standalone helper-style check via buildNetlist so this stays a
  // black-box assertion through the public API.
  const docFor = (label: string): CircuitDoc => ({
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "l1", kind: "LABEL", x: 0, y: 0, rotation: 0, value: label },
          { id: "r1", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
          { id: "g1", kind: "GND", x: 4, y: 0, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  });
  const wPlus = buildNetlist(docFor("W_{+}")).netlist;
  assert.match(wPlus, /\bW_p\b/);
  const delta = buildNetlist(docFor("\\Delta V")).netlist;
  assert.match(delta, /\bDelta_V\b/);
});

test("passive value expressions are normalized before netlist emission", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "v1", kind: "V", x: -4, y: 0, rotation: 0, value: "5" },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "2 * 500 Ω" },
          { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "10 uF" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w1", points: [[-4, -2], [0, -2]] },
          { id: "w2", points: [[0, -2], [4, -2]] },
          { id: "w3", points: [[4, -2], [4, -2]] },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.match(result.netlist, /^R1 n\d+ n\d+ 1000$/m);
  assert.match(result.netlist, /^C1 n\d+ 0 1e-5$/m);
});

test("source waveform values are normalized before netlist emission", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          {
            id: "v1",
            kind: "V",
            x: 0,
            y: 0,
            rotation: 0,
            value: "PULSE(0 V 5 volts 0 seconds 1 us 1 us 5 ms 10 ms)",
          },
          { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "g1", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w1", points: [[0, -2], [4, -2]] },
          { id: "w2", points: [[4, 2], [0, 2]] },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.match(result.netlist, /^V1 n\d+ 0 PULSE\(0 5 0 1e-6 1e-6 0.005 0.01\)$/m);
});

test("transistor geometry parameters accept friendly length text", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          {
            id: "m1",
            kind: "NMOS",
            x: 0,
            y: 0,
            rotation: 0,
            value: "NMOS",
            params: { W: "10 um", L: "180 nm" },
          },
          { id: "g1", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: -2, y: 0, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };

  const result = buildNetlist(doc);

  assert.match(result.netlist, /^M1 n\d+ 0 0 0 NMOS L=1.8e-7 W=1e-5$/m);
});

test("probes on wire segments resolve to the segment node", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        components: [
          { id: "r1", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
        ],
        wires: [{ id: "w1", points: [[0, 0], [4, 0]] }],
        probes: [{ id: "p1", x: 2, y: 0, color: "#0a84ff" }],
      },
    ],
  };

  const result = buildNetlist(doc);
  const probeNode = result.nodes.posToNode.get("2,0");

  assert.ok(probeNode);
  assert.equal(probeNode, result.nodes.pinToNode.get("r1#0"));
});

test("component pins on wire segments resolve to the segment node", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        components: [
          { id: "r1", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
          { id: "r2", kind: "R", x: 6, y: 0, rotation: 0, value: "1k" },
        ],
        wires: [{ id: "w1", points: [[0, 0], [8, 0]] }],
        probes: [],
      },
    ],
  };

  const result = buildNetlist(doc);
  const wireNode = result.nodes.posToNode.get("0,0");

  assert.ok(wireNode);
  assert.equal(result.nodes.pinToNode.get("r1#0"), wireNode);
  assert.equal(result.nodes.pinToNode.get("r1#1"), wireNode);
  assert.equal(result.nodes.pinToNode.get("r2#0"), wireNode);
  assert.equal(result.nodes.pinToNode.get("r2#1"), wireNode);
});

test("wire endpoints landing on wire segments resolve to the segment node", () => {
  const doc: CircuitDoc = {
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
    pages: [
      {
        id: "main",
        name: "main",
        components: [
          { id: "r1", kind: "R", x: 4, y: 2, rotation: 0, value: "1k" },
        ],
        probes: [],
        wires: [
          { id: "trunk", points: [[0, 0], [4, 0]] },
          { id: "stub", points: [[2, 0], [2, 2]] },
        ],
      },
    ],
  };

  const result = buildNetlist(doc);
  const trunkNode = result.nodes.posToNode.get("0,0");

  assert.ok(trunkNode);
  assert.equal(result.nodes.posToNode.get("2,0"), trunkNode);
  assert.equal(result.nodes.posToNode.get("2,2"), trunkNode);
});
