import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildNetlist } from "../src/editor/netlist.ts";
import type { CircuitDoc } from "../src/editor/model.ts";
import { parseAsciiRaw } from "../src/sim/wasmBackend.ts";

function nativeNgspice(): string | null {
  const candidates = [
    process.env.NGSPICE,
    "/opt/homebrew/bin/ngspice",
    "/usr/local/bin/ngspice",
    "ngspice",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function vectorData(raw: ReturnType<typeof parseAsciiRaw>, name: string): number[] {
  const vector = raw.vectors.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  assert.ok(vector, `expected RAW vector ${name}`);
  assert.equal(vector.is_scale, false, `${name} should be a signal vector`);
  return vector.data;
}

function runNativeNgspiceRaw(
  ngspice: string,
  deck: string,
  basename: string,
): ReturnType<typeof parseAsciiRaw> {
  const dir = mkdtempSync(join(tmpdir(), `spice-sim-live-flow-${basename}-`));
  try {
    const circuitPath = join(dir, `${basename}.cir`);
    const rawPath = join(dir, `${basename}.raw`);
    writeFileSync(circuitPath, deck);

    const run = spawnSync(ngspice, ["-b", "-r", rawPath, circuitPath], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    return parseAsciiRaw(readFileSync(rawPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("native ngspice emits passive branch-current vectors used by Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const result = runNativeNgspiceRaw(
    ngspice,
    [
      "* live flow native branch-current smoke",
      ".option filetype=ascii",
      "V1 in 0 PULSE(0 5 0 1u 1u 1m 2m)",
      "R1 in out 1k",
      "C1 out 0 1u",
      ".save all @v1[i] @r1[i] @c1[i]",
      ".tran 10u 4m",
      ".end",
      "",
    ].join("\n"),
    "manual-rc-live-flow",
  );
  assert.equal(result.plot, "Transient Analysis");

  const sourceCurrent = vectorData(result, "i(@v1[i])");
  const resistorCurrent = vectorData(result, "i(@r1[i])");
  const capacitorCurrent = vectorData(result, "i(@c1[i])");
  assert.ok(resistorCurrent.length > 20, "expected transient branch-current samples");
  assert.ok(Math.max(...resistorCurrent.map((value) => Math.abs(value))) > 1e-6);

  for (let idx = 1; idx < Math.min(resistorCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(resistorCurrent[idx] - capacitorCurrent[idx]) < 1e-9,
      `R/C current mismatch at sample ${idx}`,
    );
    assert.ok(
      Math.abs(sourceCurrent[idx] + resistorCurrent[idx]) < 1e-9,
      `source/passive current sign mismatch at sample ${idx}`,
    );
  }
});

test("app-generated netlists produce the ngspice current vectors Live Flow consumes", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "1u" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-c", points: [[2, -2], [4, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-c-g", points: [[4, 2], [4, 2.5]] },
        ],
      },
    ],
  };

  const generated = buildNetlist(doc).netlist;
  assert.match(generated, /^\.save all @V1\[i\] @R1\[i\] @C1\[i\]$/m);

  const result = runNativeNgspiceRaw(
    ngspice,
    `${generated}.tran 10u 4m\n.end\n`,
    "generated-rc-live-flow",
  );
  assert.equal(result.plot, "Transient Analysis");

  const sourceCurrent = vectorData(result, "i(@v1[i])");
  const resistorCurrent = vectorData(result, "i(@r1[i])");
  const capacitorCurrent = vectorData(result, "i(@c1[i])");
  assert.ok(resistorCurrent.length > 20, "expected app-generated transient branch-current samples");
  assert.ok(Math.max(...resistorCurrent.map((value) => Math.abs(value))) > 1e-6);

  for (let idx = 1; idx < Math.min(resistorCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(resistorCurrent[idx] - capacitorCurrent[idx]) < 1e-9,
      `app-generated R/C current mismatch at sample ${idx}`,
    );
    assert.ok(
      Math.abs(sourceCurrent[idx] + resistorCurrent[idx]) < 1e-9,
      `app-generated source/passive current sign mismatch at sample ${idx}`,
    );
  }
});

test("app-generated inductor netlists produce ngspice current vectors for Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "10" },
          { id: "l1", kind: "L", x: 4, y: 0, rotation: 0, value: "10m" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-l", points: [[2, -2], [4, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-l-g", points: [[4, 2], [4, 2.5]] },
        ],
      },
    ],
  };

  const generated = buildNetlist(doc).netlist;
  assert.match(generated, /^\.save all @V1\[i\] @R1\[i\] @L1\[i\]$/m);

  const result = runNativeNgspiceRaw(
    ngspice,
    `${generated}.tran 10u 4m\n.end\n`,
    "generated-rl-live-flow",
  );

  const sourceCurrent = vectorData(result, "i(@v1[i])");
  const resistorCurrent = vectorData(result, "i(@r1[i])");
  const inductorCurrent = vectorData(result, "i(@l1[i])");
  assert.ok(inductorCurrent.length > 20, "expected app-generated inductor current samples");
  assert.ok(Math.max(...inductorCurrent.map((value) => Math.abs(value))) > 1e-4);

  for (let idx = 1; idx < Math.min(inductorCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(resistorCurrent[idx] - inductorCurrent[idx]) < 1e-9,
      `R/L current mismatch at sample ${idx}`,
    );
    assert.ok(
      Math.abs(sourceCurrent[idx] + inductorCurrent[idx]) < 1e-9,
      `source/inductor current sign mismatch at sample ${idx}`,
    );
  }
});

test("app-generated source netlists produce ngspice current vectors for Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const currentSourceDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "iin", kind: "I", x: -4, y: 0, rotation: 0, value: "PULSE(0 1m 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 90, value: "1k" },
          { id: "g1", kind: "GND", x: -4, y: 2.5, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 0, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-top", points: [[-4, -2], [0, -2]] },
          { id: "w-i-ground", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-r-ground", points: [[0, 2], [0, 2.5]] },
        ],
      },
    ],
  };

  const currentSourceDeck = `${buildNetlist(currentSourceDoc).netlist}.tran 10u 4m\n.end\n`;
  assert.match(currentSourceDeck, /^\.save all @I1\[current\] @R1\[i\]$/m);
  const currentSourceResult = runNativeNgspiceRaw(
    ngspice,
    currentSourceDeck,
    "generated-current-source-live-flow",
  );
  const sourceCurrent = vectorData(currentSourceResult, "i(@i1[current])");
  const resistorCurrent = vectorData(currentSourceResult, "i(@r1[i])");
  assert.ok(Math.max(...sourceCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(sourceCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(sourceCurrent[idx] + resistorCurrent[idx]) < 1e-9,
      `current-source/passive current mismatch at sample ${idx}`,
    );
  }

  const behavioralSourceDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "PULSE(0 1 0 1u 1u 1m 2m)" },
          { id: "b1", kind: "B", x: 0, y: 0, rotation: 0, value: "V(in) * 2" },
          { id: "r1", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "lbl-in", kind: "LABEL", x: -4, y: -2, rotation: 0, value: "in" },
          { id: "g-vin", kind: "GND", x: -4, y: 2.5, rotation: 0, value: "" },
          { id: "g-b", kind: "GND", x: 0, y: 2.5, rotation: 0, value: "" },
          { id: "g-r", kind: "GND", x: 4, y: 2.5, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-out", points: [[0, -2], [4, -2]] },
          { id: "w-vin-ground", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-b-ground", points: [[0, 2], [0, 2.5]] },
          { id: "w-r-ground", points: [[4, 2], [4, 2.5]] },
        ],
      },
    ],
  };

  const behavioralSourceDeck = `${buildNetlist(behavioralSourceDoc).netlist}.tran 10u 4m\n.end\n`;
  assert.match(behavioralSourceDeck, /^\.save all @V1\[i\] @B1\[i\] @R1\[i\]$/m);
  const behavioralSourceResult = runNativeNgspiceRaw(
    ngspice,
    behavioralSourceDeck,
    "generated-behavioral-source-live-flow",
  );
  const behavioralCurrent = vectorData(behavioralSourceResult, "i(@b1[i])");
  const behavioralLoadCurrent = vectorData(behavioralSourceResult, "i(@r1[i])");
  assert.ok(Math.max(...behavioralCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(behavioralCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(behavioralCurrent[idx] + behavioralLoadCurrent[idx]) < 1e-9,
      `behavioral-source/passive current sign mismatch at sample ${idx}`,
    );
  }
});

test("app-generated subcircuit netlists produce pin sense-source currents for Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -8, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "x1", kind: "SUBX", x: -2, y: -2, rotation: 0, value: "rc_stage", params: { npins: "2" } },
          { id: "rload", kind: "R", x: 4, y: -2, rotation: 0, value: "10k" },
          { id: "g-vin", kind: "GND", x: -8, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 6, y: 0, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-x", points: [[-8, -2], [-5, -2]] },
          { id: "w-x-r", points: [[1, -2], [2, -2]] },
          { id: "w-v-g", points: [[-8, 2], [-8, 2.5]] },
          { id: "w-r-g", points: [[6, -2], [6, 0], [6, 0.5]] },
        ],
      },
      {
        id: "stage",
        name: "rc_stage",
        description: "Two-pin RC stage for Live Flow subcircuit pin-sense coverage.",
        probes: [],
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
          { id: "sw-c-top", points: [[4, 0], [4, 0]] },
          { id: "sw-c-g", points: [[4, 4], [4, 4.5]] },
        ],
      },
    ],
  };

  const generated = buildNetlist(doc).netlist;
  assert.match(generated, /^VLFX1P1\b/m);
  assert.match(generated, /^VLFX1P2\b/m);
  assert.match(generated, /^X1 lf_X1_p1 lf_X1_p2 rc_stage$/m);
  assert.match(generated, /^\.save all @V1\[i\] @VLFX1P1\[i\] @VLFX1P2\[i\] @R1\[i\]$/m);

  const result = runNativeNgspiceRaw(
    ngspice,
    `${generated}.tran 10u 4m\n.end\n`,
    "generated-subx-live-flow",
  );
  const sourceCurrent = vectorData(result, "i(@v1[i])");
  const pinInCurrent = vectorData(result, "i(@vlfx1p1[i])");
  const pinOutCurrent = vectorData(result, "i(@vlfx1p2[i])");
  const loadCurrent = vectorData(result, "i(@r1[i])");
  assert.ok(pinInCurrent.length > 20, "expected subcircuit pin sense-current samples");
  assert.ok(Math.max(...pinInCurrent.map((value) => Math.abs(value))) > 1e-6);
  assert.ok(Math.max(...pinOutCurrent.map((value) => Math.abs(value))) > 1e-6);

  for (let idx = 1; idx < Math.min(pinInCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(sourceCurrent[idx] + pinInCurrent[idx]) < 1e-9,
      `source/subcircuit input pin current mismatch at sample ${idx}`,
    );
    assert.ok(
      Math.abs(pinOutCurrent[idx] + loadCurrent[idx]) < 1e-9,
      `subcircuit output pin/load current mismatch at sample ${idx}`,
    );
  }
});

test("app-generated op-amp netlists produce pin sense-source currents for Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "10u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -8, y: 1, rotation: 0, value: "DC 10u" },
          { id: "op", kind: "OPAMP", x: 0, y: 0, rotation: 0, value: "OPAMP" },
          { id: "rload", kind: "R", x: 5, y: 0, rotation: 0, value: "10k" },
          { id: "g-vin", kind: "GND", x: -8, y: 3, rotation: 0, value: "" },
          { id: "g-minus", kind: "GND", x: -3, y: 1, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 7, y: 0, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-in", points: [[-8, -1], [-3, -1]] },
        ],
      },
    ],
  };

  const generated = buildNetlist(doc).netlist;
  assert.match(generated, /^VLFX1P1 n1 lf_X1_p1 0$/m);
  assert.match(generated, /^VLFX1P2 0 lf_X1_p2 0$/m);
  assert.match(generated, /^VLFX1P3 n2 lf_X1_p3 0$/m);
  assert.match(generated, /^X1 lf_X1_p1 lf_X1_p2 lf_X1_p3 OPAMP$/m);
  assert.match(generated, /^\.save all @V1\[i\] @VLFX1P1\[i\] @VLFX1P2\[i\] @VLFX1P3\[i\] @R1\[i\]$/m);

  const result = runNativeNgspiceRaw(
    ngspice,
    `${generated}.tran 10u 1m\n.end\n`,
    "generated-opamp-live-flow",
  );

  const plusCurrent = vectorData(result, "i(@vlfx1p1[i])");
  const minusCurrent = vectorData(result, "i(@vlfx1p2[i])");
  const outCurrent = vectorData(result, "i(@vlfx1p3[i])");
  const loadCurrent = vectorData(result, "i(@r1[i])");
  assert.ok(outCurrent.length > 20, "expected op-amp pin-current samples");
  assert.equal(plusCurrent.length, outCurrent.length, "expected plus input pin-current samples");
  assert.equal(minusCurrent.length, outCurrent.length, "expected minus input pin-current samples");
  assert.ok(Math.max(...outCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(outCurrent.length, 40); idx += 1) {
    assert.ok(Number.isFinite(plusCurrent[idx]), `op-amp plus current is not finite at sample ${idx}`);
    assert.ok(Number.isFinite(minusCurrent[idx]), `op-amp minus current is not finite at sample ${idx}`);
    assert.ok(
      Math.abs(outCurrent[idx] + loadCurrent[idx]) < 1e-9,
      `op-amp output/load current sign mismatch at sample ${idx}`,
    );
  }
});

test("app-generated active-device netlists produce ngspice currents for Live Flow", (t) => {
  const ngspice = nativeNgspice();
  if (!ngspice) {
    t.skip("native ngspice is not installed");
    return;
  }

  const diodeDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 0.5m 1m)" },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "1k" },
          { id: "d1", kind: "D", x: 4, y: 0, rotation: 0, value: "DMOD" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-d", points: [[2, -2], [4, -2]] },
        ],
      },
    ],
  };

  const diodeDeck = `${buildNetlist(diodeDoc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(diodeDeck, /^\.save all @V1\[i\] @R1\[i\] @D1\[id\]$/m);
  const diodeResult = runNativeNgspiceRaw(ngspice, diodeDeck, "generated-diode-live-flow");
  const diodeCurrent = vectorData(diodeResult, "i(@d1[id])");
  assert.ok(diodeCurrent.length > 20, "expected diode branch-current samples");
  assert.ok(Math.max(...diodeCurrent.map((value) => Math.abs(value))) > 1e-6);

  const mosDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vdd", kind: "V", x: -4, y: -6, rotation: 0, value: "DC 5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 0, y: -4, rotation: 90, value: "1k" },
          { id: "m1", kind: "NMOS4", x: 0, y: 0, rotation: 0, value: "NCH", params: { W: "10u", L: "1u" } },
          { id: "gvdd", kind: "GND", x: -4, y: -4, rotation: 0, value: "" },
          { id: "ggate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "gsource", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
          { id: "gbody", kind: "GND", x: 2, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-vdd-load", points: [[-4, -8], [0, -8], [0, -6]] },
          { id: "w-gate", points: [[-6, -2], [-2, -2], [-2, 0]] },
          { id: "w-body", points: [[2, 0], [2, 2]] },
        ],
      },
    ],
  };

  const mosDeck = `${buildNetlist(mosDoc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(mosDeck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @M1\[id\] @M1\[ig\] @M1\[is\] @M1\[ib\]$/m);
  const mosResult = runNativeNgspiceRaw(ngspice, mosDeck, "generated-nmos-live-flow");
  const drainCurrent = vectorData(mosResult, "i(@m1[id])");
  const gateCurrent = vectorData(mosResult, "i(@m1[ig])");
  const sourceCurrent = vectorData(mosResult, "i(@m1[is])");
  const bodyCurrent = vectorData(mosResult, "i(@m1[ib])");
  assert.ok(drainCurrent.length > 20, "expected MOS drain-current samples");
  assert.equal(gateCurrent.length, drainCurrent.length, "expected MOS gate-current samples for terminal-strict Live Flow");
  assert.equal(bodyCurrent.length, drainCurrent.length, "expected MOS body-current samples for 4-pin Live Flow");
  assert.ok(Math.max(...drainCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(drainCurrent.length, 40); idx += 1) {
    assert.ok(
      Number.isFinite(gateCurrent[idx]),
      `MOS gate current is not finite at sample ${idx}`,
    );
    assert.ok(
      Number.isFinite(bodyCurrent[idx]),
      `MOS body current is not finite at sample ${idx}`,
    );
    assert.ok(
      Math.abs(drainCurrent[idx] + gateCurrent[idx] + sourceCurrent[idx] + bodyCurrent[idx]) < 1e-9,
      `MOS drain/gate/source/body current sign mismatch at sample ${idx}`,
    );
  }

  const pmosDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "DC 5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "PULSE(5 0 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "m1", kind: "PMOS4", x: 0, y: 0, rotation: 0, value: "PCH", params: { W: "20u", L: "1u" } },
          { id: "lbl-vdd-src", kind: "LABEL", x: -6, y: -8, rotation: 0, value: "vdd" },
          { id: "lbl-vdd-source", kind: "LABEL", x: 0, y: 2, rotation: 0, value: "vdd" },
          { id: "lbl-vdd-body", kind: "LABEL", x: 2, y: 0, rotation: 0, value: "vdd" },
          { id: "lbl-gate", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "gate" },
          { id: "lbl-gate-src", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "gate" },
          { id: "lbl-out", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "out" },
          { id: "lbl-out-load", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-gate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-vdd-bot", points: [[-6, -4], [-6, -4]] },
          { id: "w-gate-bot", points: [[-6, 2], [-6, 2]] },
          { id: "w-load-bot", points: [[4, 2], [4, 2]] },
        ],
      },
    ],
  };

  const pmosDeck = `${buildNetlist(pmosDoc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(pmosDeck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @M1\[id\] @M1\[ig\] @M1\[is\] @M1\[ib\]$/m);
  const pmosResult = runNativeNgspiceRaw(ngspice, pmosDeck, "generated-pmos-live-flow");
  const pmosDrainCurrent = vectorData(pmosResult, "i(@m1[id])");
  const pmosGateCurrent = vectorData(pmosResult, "i(@m1[ig])");
  const pmosSourceCurrent = vectorData(pmosResult, "i(@m1[is])");
  const pmosBodyCurrent = vectorData(pmosResult, "i(@m1[ib])");
  assert.ok(pmosDrainCurrent.length > 20, "expected PMOS drain-current samples");
  assert.equal(pmosGateCurrent.length, pmosDrainCurrent.length, "expected PMOS gate-current samples for terminal-strict Live Flow");
  assert.equal(pmosBodyCurrent.length, pmosDrainCurrent.length, "expected PMOS body-current samples for 4-pin Live Flow");
  assert.ok(Math.max(...pmosDrainCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(pmosDrainCurrent.length, 40); idx += 1) {
    assert.ok(
      Number.isFinite(pmosGateCurrent[idx]),
      `PMOS gate current is not finite at sample ${idx}`,
    );
    assert.ok(
      Number.isFinite(pmosBodyCurrent[idx]),
      `PMOS body current is not finite at sample ${idx}`,
    );
    assert.ok(
      Math.abs(pmosDrainCurrent[idx] + pmosGateCurrent[idx] + pmosSourceCurrent[idx] + pmosBodyCurrent[idx]) < 1e-9,
      `PMOS drain/gate/source/body current sign mismatch at sample ${idx}`,
    );
  }

  const nmos3Doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii\n.model NCH NMOS LEVEL=1 VTO=0.7 KP=120e-6",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "DC 5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 0, y: -4, rotation: 0, value: "1k" },
          { id: "m1", kind: "NMOS", x: 2, y: -2, rotation: 0, value: "NCH", params: { W: "10u", L: "1u" } },
          { id: "lbl-vdd-src", kind: "LABEL", x: -6, y: -8, rotation: 0, value: "vdd" },
          { id: "lbl-vdd-load", kind: "LABEL", x: -2, y: -4, rotation: 0, value: "vdd" },
          { id: "lbl-out-load", kind: "LABEL", x: 2, y: -4, rotation: 0, value: "out" },
          { id: "lbl-gate-src", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "gate" },
          { id: "lbl-gate", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "gate" },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-gate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-source", kind: "GND", x: 2, y: 0, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };

  const nmos3Deck = `${buildNetlist(nmos3Doc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(nmos3Deck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @M1\[id\] @M1\[ig\] @M1\[is\]$/m);
  assert.doesNotMatch(nmos3Deck, /@M1\[ib\]/, "3-pin NMOS Live Flow should not request a missing body-current vector");
  const nmos3Result = runNativeNgspiceRaw(ngspice, nmos3Deck, "generated-nmos3-live-flow");
  const nmos3DrainCurrent = vectorData(nmos3Result, "i(@m1[id])");
  const nmos3GateCurrent = vectorData(nmos3Result, "i(@m1[ig])");
  const nmos3SourceCurrent = vectorData(nmos3Result, "i(@m1[is])");
  assert.ok(nmos3DrainCurrent.length > 20, "expected 3-pin NMOS drain-current samples");
  assert.equal(nmos3GateCurrent.length, nmos3DrainCurrent.length, "expected 3-pin NMOS gate-current samples");
  assert.equal(nmos3SourceCurrent.length, nmos3DrainCurrent.length, "expected 3-pin NMOS source-current samples");
  assert.ok(Math.max(...nmos3DrainCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(nmos3DrainCurrent.length, 40); idx += 1) {
    assert.ok(Number.isFinite(nmos3GateCurrent[idx]), `3-pin NMOS gate current is not finite at sample ${idx}`);
    assert.ok(
      Math.abs(nmos3DrainCurrent[idx] + nmos3GateCurrent[idx] + nmos3SourceCurrent[idx]) < 1e-9,
      `3-pin NMOS drain/gate/source current sign mismatch at sample ${idx}`,
    );
  }

  const pmos3Doc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii\n.model PCH PMOS LEVEL=1 VTO=-0.7 KP=60e-6",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vdd", kind: "V", x: -6, y: -6, rotation: 0, value: "DC 5" },
          { id: "vg", kind: "V", x: -6, y: 0, rotation: 0, value: "PULSE(5 0 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 4, y: -4, rotation: 0, value: "1k" },
          { id: "m1", kind: "PMOS", x: 2, y: -2, rotation: 0, value: "PCH", params: { W: "20u", L: "1u" } },
          { id: "lbl-vdd-src", kind: "LABEL", x: -6, y: -8, rotation: 0, value: "vdd" },
          { id: "lbl-vdd-source", kind: "LABEL", x: 2, y: 0, rotation: 0, value: "vdd" },
          { id: "lbl-out-drain", kind: "LABEL", x: 2, y: -4, rotation: 0, value: "out" },
          { id: "lbl-gate-src", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "gate" },
          { id: "lbl-gate", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "gate" },
          { id: "g-vdd", kind: "GND", x: -6, y: -4, rotation: 0, value: "" },
          { id: "g-gate", kind: "GND", x: -6, y: 2, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 6, y: -4, rotation: 0, value: "" },
        ],
        wires: [],
      },
    ],
  };

  const pmos3Deck = `${buildNetlist(pmos3Doc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(pmos3Deck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @M1\[id\] @M1\[ig\] @M1\[is\]$/m);
  assert.doesNotMatch(pmos3Deck, /@M1\[ib\]/, "3-pin PMOS Live Flow should not request a missing body-current vector");
  const pmos3Result = runNativeNgspiceRaw(ngspice, pmos3Deck, "generated-pmos3-live-flow");
  const pmos3DrainCurrent = vectorData(pmos3Result, "i(@m1[id])");
  const pmos3GateCurrent = vectorData(pmos3Result, "i(@m1[ig])");
  const pmos3SourceCurrent = vectorData(pmos3Result, "i(@m1[is])");
  assert.ok(pmos3DrainCurrent.length > 20, "expected 3-pin PMOS drain-current samples");
  assert.equal(pmos3GateCurrent.length, pmos3DrainCurrent.length, "expected 3-pin PMOS gate-current samples");
  assert.equal(pmos3SourceCurrent.length, pmos3DrainCurrent.length, "expected 3-pin PMOS source-current samples");
  assert.ok(Math.max(...pmos3DrainCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(pmos3DrainCurrent.length, 40); idx += 1) {
    assert.ok(Number.isFinite(pmos3GateCurrent[idx]), `3-pin PMOS gate current is not finite at sample ${idx}`);
    assert.ok(
      Math.abs(pmos3DrainCurrent[idx] + pmos3GateCurrent[idx] + pmos3SourceCurrent[idx]) < 1e-9,
      `3-pin PMOS drain/gate/source current sign mismatch at sample ${idx}`,
    );
  }

  const bjtDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vcc", kind: "V", x: -8, y: -4, rotation: 0, value: "DC 5" },
          { id: "vbase", kind: "V", x: -6, y: 2, rotation: 0, value: "PULSE(0 1.1 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 0, y: -4, rotation: 90, value: "2.2k" },
          { id: "rbase", kind: "R", x: -4, y: 0, rotation: 0, value: "22k" },
          { id: "q1", kind: "NPN", x: 0, y: 0, rotation: 0, value: "BJTN" },
          { id: "lbl-vcc-src", kind: "LABEL", x: -8, y: -6, rotation: 0, value: "vcc" },
          { id: "lbl-vcc-load", kind: "LABEL", x: 0, y: -6, rotation: 0, value: "vcc" },
          { id: "g-vcc", kind: "GND", x: -8, y: -2, rotation: 0, value: "" },
          { id: "g-base", kind: "GND", x: -6, y: 4, rotation: 0, value: "" },
          { id: "g-emitter", kind: "GND", x: 0, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-vbase-rbase", points: [[-6, 0], [-6, 0]] },
          { id: "w-rbase-base", points: [[-2, 0], [-2, 0]] },
          { id: "w-rload-collector", points: [[0, -2], [0, -2]] },
        ],
      },
    ],
  };

  const bjtDeck = `${buildNetlist(bjtDoc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(bjtDeck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @R2\[i\] @Q1\[ic\] @Q1\[ie\] @Q1\[ib\]$/m);
  const bjtResult = runNativeNgspiceRaw(ngspice, bjtDeck, "generated-npn-live-flow");
  const collectorCurrent = vectorData(bjtResult, "i(@q1[ic])");
  const emitterCurrent = vectorData(bjtResult, "i(@q1[ie])");
  const baseCurrent = vectorData(bjtResult, "i(@q1[ib])");
  assert.ok(collectorCurrent.length > 20, "expected BJT collector-current samples");
  assert.ok(Math.max(...collectorCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(collectorCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(collectorCurrent[idx] + baseCurrent[idx] + emitterCurrent[idx]) < 1e-9,
      `BJT collector/base/emitter current sign mismatch at sample ${idx}`,
    );
  }

  const pnpDoc: CircuitDoc = {
    activePageId: "main",
    directives: ".option filetype=ascii",
    analysis: { kind: "tran", tstep: "2u", tstop: "1m" },
    pages: [
      {
        id: "main",
        name: "main",
        probes: [],
        components: [
          { id: "vcc", kind: "V", x: -8, y: -4, rotation: 0, value: "DC 5" },
          { id: "vbase", kind: "V", x: -6, y: 2, rotation: 0, value: "PULSE(5 3.8 0 1u 1u 0.5m 1m)" },
          { id: "rload", kind: "R", x: 4, y: 0, rotation: 90, value: "1k" },
          { id: "q1", kind: "PNP", x: 0, y: 0, rotation: 0, value: "BJTP" },
          { id: "lbl-vcc-src", kind: "LABEL", x: -8, y: -6, rotation: 0, value: "vcc" },
          { id: "lbl-vcc-emitter", kind: "LABEL", x: 0, y: 2, rotation: 0, value: "vcc" },
          { id: "lbl-base-src", kind: "LABEL", x: -6, y: 0, rotation: 0, value: "base" },
          { id: "lbl-base", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "base" },
          { id: "lbl-out", kind: "LABEL", x: 0, y: -2, rotation: 0, value: "out" },
          { id: "lbl-out-load", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
          { id: "g-vcc", kind: "GND", x: -8, y: -2, rotation: 0, value: "" },
          { id: "g-base", kind: "GND", x: -6, y: 4, rotation: 0, value: "" },
          { id: "g-load", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-vcc-bot", points: [[-8, -2], [-8, -2]] },
          { id: "w-base-bot", points: [[-6, 4], [-6, 4]] },
          { id: "w-load-bot", points: [[4, 2], [4, 2]] },
        ],
      },
    ],
  };

  const pnpDeck = `${buildNetlist(pnpDoc).netlist}.tran 2u 1m\n.end\n`;
  assert.match(pnpDeck, /^\.save all @V1\[i\] @V2\[i\] @R1\[i\] @Q1\[ic\] @Q1\[ie\] @Q1\[ib\]$/m);
  const pnpResult = runNativeNgspiceRaw(ngspice, pnpDeck, "generated-pnp-live-flow");
  const pnpCollectorCurrent = vectorData(pnpResult, "i(@q1[ic])");
  const pnpEmitterCurrent = vectorData(pnpResult, "i(@q1[ie])");
  const pnpBaseCurrent = vectorData(pnpResult, "i(@q1[ib])");
  assert.ok(pnpCollectorCurrent.length > 20, "expected PNP collector-current samples");
  assert.ok(Math.max(...pnpCollectorCurrent.map((value) => Math.abs(value))) > 1e-6);
  for (let idx = 1; idx < Math.min(pnpCollectorCurrent.length, 40); idx += 1) {
    assert.ok(
      Math.abs(pnpCollectorCurrent[idx] + pnpBaseCurrent[idx] + pnpEmitterCurrent[idx]) < 1e-9,
      `PNP collector/base/emitter current sign mismatch at sample ${idx}`,
    );
  }
});
