import test from "node:test";
import assert from "node:assert/strict";
import {
  WASM_SPINIT_COMMANDS,
  analysisDirective,
  composeBatchNetlist,
  parseAsciiRaw,
} from "../src/sim/wasmBackend.ts";
import { traceDisplayName } from "../src/editor/traceNames.ts";
import { traceValueUnit } from "../src/editor/traceUnits.ts";

test("WASM batch netlist appends analysis and ASCII raw option", () => {
  const netlist = ["* generated", "V1 in 0 DC 1", "R1 in 0 1k", ".end"].join("\n");
  const batch = composeBatchNetlist(netlist, { kind: "tran", tstep: 0.00001, tstop: 0.001 });
  assert.match(batch, /\.option filetype=ascii\n\.tran 0\.00001 0\.001\n\.end\n$/);
  assert.equal((batch.match(/^\.end$/gm) ?? []).length, 1);
});

test("WASM startup commands request branch-current vectors for Live Flow", () => {
  assert.match(WASM_SPINIT_COMMANDS, /^set filetype=ascii$/m);
  assert.match(WASM_SPINIT_COMMANDS, /^set savecurrents$/m);
});

test("WASM batch netlist preserves subcircuit .ends lines", () => {
  const netlist = [
    "* generated",
    "X1 in out relu_cell",
    ".subckt relu_cell x h",
    "B1 h 0 V=max(0,V(x))",
    ".ends relu_cell",
    ".end",
  ].join("\n");
  const batch = composeBatchNetlist(netlist, { kind: "tran", tstep: 0.00001, tstop: 0.001 });
  assert.match(batch, /^\.ends relu_cell$/m);
  assert.equal((batch.match(/^\.end$/gm) ?? []).length, 1);
});

test("WASM analysis directives mirror the native engine commands", () => {
  assert.equal(analysisDirective({ kind: "op" }), ".op");
  assert.equal(
    analysisDirective({ kind: "tran", tstep: 0.000001, tstop: 0.001, tstart: 0.0001 }),
    ".tran 0.000001 0.001 0.0001",
  );
  assert.equal(
    analysisDirective({ kind: "ac", sweep: "dec", npts: 20, fstart: 10, fstop: 100000 }),
    ".ac dec 20 10 100000",
  );
  assert.equal(
    analysisDirective({ kind: "dcsweep", src: "V1", start: 0, stop: 5, step: 0.5 }),
    ".dc v1 0 5 0.5",
  );
  assert.equal(
    analysisDirective({ kind: "noise", out_node: "OUT", src: "V1", sweep: "dec", npts: 10, fstart: 1, fstop: 1000 }),
    ".noise v(out) v1 dec 10 1 1000",
  );
});

test("ASCII RAW parser keeps operating point vectors as plottable results", () => {
  const raw = [
    "Title: op",
    "Plotname: Operating Point",
    "Flags: real",
    "No. Variables: 3",
    "No. Points: 1",
    "Variables:",
    "\t0\tv(in)\tvoltage",
    "\t1\tv(out)\tvoltage",
    "\t2\ti(v1)\tcurrent",
    "Values:",
    "0\t\t5.000000000000000e+00",
    "\t2.500000000000000e+00",
    "\t-2.500000000000000e-03",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.plot, "Operating Point");
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale, vector.data]),
    [
      ["v(in)", false, [5]],
      ["v(out)", false, [2.5]],
      ["i(v1)", false, [-0.0025]],
    ],
  );
});

test("ASCII RAW parser returns scale and signal vectors", () => {
  const raw = [
    "Title: smoke",
    "Date: Sun May 24 10:21:38  2026",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 3",
    "No. Points: 2",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(in)\tvoltage",
    "\t2\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t0.000000000000000e+00",
    "\t0.000000000000000e+00",
    "1\t\t1.000000000000000e-06",
    "\t5.000000000000000e+00",
    "\t4.995000000000000e-03",
    "",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.plot, "Transient Analysis");
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale, vector.data]),
    [
      ["time", true, [0, 0.000001]],
      ["v(in)", false, [0, 5]],
      ["v(out)", false, [0, 0.004995]],
    ],
  );
});

test("ASCII RAW parser recognizes DC sweep scale vectors without hiding node voltages", () => {
  const raw = [
    "Title: dc",
    "Plotname: DC transfer characteristic",
    "Flags: real",
    "No. Variables: 3",
    "No. Points: 3",
    "Variables:",
    "\t0\tv-sweep\tvoltage",
    "\t1\tv(out)\tvoltage",
    "\t2\ti(v1)\tcurrent",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t0.000000000000000e+00",
    "\t0.000000000000000e+00",
    "1\t\t1.000000000000000e+00",
    "\t5.000000000000000e-01",
    "\t-5.000000000000000e-04",
    "2\t\t2.000000000000000e+00",
    "\t1.000000000000000e+00",
    "\t-1.000000000000000e-03",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale, vector.data]),
    [
      ["v-sweep", true, [0, 1, 2]],
      ["v(out)", false, [0, 0.5, 1]],
      ["i(v1)", false, [0, -0.0005, -0.001]],
    ],
  );
});

test("ASCII RAW parser converts complex values to magnitude and phase", () => {
  const raw = [
    "Title: ac",
    "Plotname: AC Analysis",
    "Flags: complex",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\tfrequency\tfrequency",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t1.000000000000000e+03",
    "\t3.000000000000000e+00,4.000000000000000e+00",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.vectors[1].data[0], 5);
  assert.ok(Math.abs((result.vectors[1].phase?.[0] ?? 0) - 53.13010235415598) < 1e-12);
});

test("ASCII RAW parser accepts native complex scale values in AC plots", () => {
  const raw = [
    "Title: ac native",
    "Plotname: AC Analysis",
    "Flags: complex",
    "No. Variables: 2",
    "No. Points: 2",
    "Variables:",
    "\t0\tfrequency\tfrequency",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t1.000000000000000e+03,0.000000000000000e+00",
    "\t3.000000000000000e+00,4.000000000000000e+00",
    "1\t\t2.000000000000000e+03,0.000000000000000e+00",
    "\t0.000000000000000e+00,-2.000000000000000e+00",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.deepEqual(result.vectors[0].data, [1000, 2000]);
  assert.equal(result.vectors[0].phase, undefined);
  assert.deepEqual(result.vectors[1].data, [5, 2]);
  assert.ok(Math.abs((result.vectors[1].phase?.[0] ?? 0) - 53.13010235415598) < 1e-12);
  assert.equal(result.vectors[1].phase?.[1], -90);
});

test("ASCII RAW parser accepts native ngspice AC RAW frequency scales with metadata", () => {
  const raw = [
    "Title: * native ac raw fixture",
    "Date: Mon May 25 08:15:29  2026",
    "Command: ngspice-46, Build",
    "Plotname: AC Analysis",
    "Flags: complex",
    "No. Variables: 4",
    "No. Points: 7",
    "Variables:",
    "\t0\tfrequency\tfrequency\tgrid=3",
    "\t1\tv(in)\tvoltage",
    "\t2\tv(out)\tvoltage",
    "\t3\ti(v1)\tcurrent",
    "Values:",
    "0\t\t1.000000000000000e+02,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.999605231408795e-01,-6.282937266758387e-03",
    "\t-3.947685912062196e-08,-6.282937266758387e-06",
    "1\t\t2.154434690031884e+02,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.998167909893710e-01,-1.353423234200225e-02",
    "\t-1.832090106288538e-07,-1.353423234200226e-05",
    "2\t\t4.641588833612779e+02,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.991501860740087e-01,-2.913917881963298e-02",
    "\t-8.498139259913075e-07,-2.913917881963298e-05",
    "3\t\t1.000000000000000e+03,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.960676824071726e-01,-6.258477827057170e-02",
    "\t-3.932317592827365e-06,-6.258477827057170e-05",
    "4\t\t2.154434690031884e+03,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.820054780351387e-01,-1.329312572125812e-01",
    "\t-1.799452196486122e-05,-1.329312572125812e-04",
    "5\t\t4.641588833612780e+03,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t9.216133961311750e-01,-2.687789876510753e-01",
    "\t-7.838660386882501e-05,-2.687789876510754e-04",
    "6\t\t1.000000000000000e+04,3.832385131218215e-314",
    "\t1.000000000000000e+00,0.000000000000000e+00",
    "\t7.169568003248977e-01,-4.504772433683887e-01",
    "\t-2.830431996751023e-04,-4.504772433683887e-04",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.plot, "AC Analysis");
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale]),
    [
      ["frequency", true],
      ["v(in)", false],
      ["v(out)", false],
      ["i(v1)", false],
    ],
  );
  assert.deepEqual(result.vectors[0].data, [
    100,
    215.4434690031884,
    464.1588833612779,
    1000,
    2154.434690031884,
    4641.58883361278,
    10000,
  ]);
  assert.equal(result.vectors[0].phase, undefined);
  assert.equal(result.vectors[1].data[3], 1);
  assertAlmostEqual(result.vectors[2].data[0], Math.hypot(0.9999605231408795, -0.006282937266758387));
  assertAlmostEqual(
    result.vectors[2].phase?.[0] ?? Number.NaN,
    (Math.atan2(-0.006282937266758387, 0.9999605231408795) * 180) / Math.PI,
  );
  assertAlmostEqual(result.vectors[3].data[6], Math.hypot(-0.0002830431996751023, -0.0004504772433683887));
});

test("ASCII RAW parser accepts native ngspice noise RAW with trailing integrated plot", () => {
  const raw = [
    "Title: * native noise raw fixture",
    "Date: Mon May 25 08:18:30  2026",
    "Command: ngspice-46, Build",
    "Plotname: Noise Spectral Density Curves",
    "Flags: real",
    "No. Variables: 3",
    "No. Points: 7",
    "Variables:",
    "\t0\tfrequency\tfrequency\tgrid=3",
    "\t1\tonoise_spectrum\tvoltage-density",
    "\t2\tinoise_spectrum\tvoltage-density",
    "Values:",
    "0\t\t1.000000000000000e+02",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "1\t\t2.154434690031884e+02",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "2\t\t4.641588833612779e+02",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "3\t\t1.000000000000000e+03",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "4\t\t2.154434690031884e+03",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "5\t\t4.641588833612780e+03",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "6\t\t1.000000000000000e+04",
    "\t2.878894417230337e-09",
    "\t5.757788834460673e-09",
    "Title: * native noise raw fixture",
    "Date: Mon May 25 08:18:30  2026",
    "Command: ngspice-46, Build",
    "Plotname: Integrated Noise",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\tv(onoise_total)\tvoltage",
    "\t1\tv(inoise_total)\tvoltage",
    "Values:",
    "0\t\t2.864463777900569e-07",
    "\t5.728927555801138e-07",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.plot, "Noise Spectral Density Curves");
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale]),
    [
      ["frequency", true],
      ["onoise_spectrum", false],
      ["inoise_spectrum", false],
    ],
  );
  assert.deepEqual(result.vectors[0].data, [
    100,
    215.4434690031884,
    464.1588833612779,
    1000,
    2154.434690031884,
    4641.58883361278,
    10000,
  ]);
  assert.deepEqual(result.vectors[1].data, Array(7).fill(2.878894417230337e-9));
  assert.deepEqual(result.vectors[2].data, Array(7).fill(5.757788834460673e-9));
  assert.deepEqual(result.measurements, [
    {
      name: "v(onoise_total)",
      value: 2.864463777900569e-7,
      at: null,
      raw: "v(onoise_total) = 2.864463777900569e-7",
    },
    {
      name: "v(inoise_total)",
      value: 5.728927555801138e-7,
      at: null,
      raw: "v(inoise_total) = 5.728927555801138e-7",
    },
  ]);
});

test("ASCII RAW parser rejects unsupported extra RAW plots instead of silently dropping them", () => {
  const raw = [
    "Title: stepped tran fixture",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t1.000000000000000e+00",
    "Title: stepped tran fixture",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t2.000000000000000e+00",
  ].join("\n");

  assert.throws(
    () => parseAsciiRaw(raw),
    /Unsupported ngspice RAW output: additional plot "Transient Analysis"/,
  );
});

test("ASCII RAW parser preserves native savecurrents device vectors for Live Flow", () => {
  const raw = [
    "Title: * native savecurrents raw fixture",
    "Date: Mon May 25 13:12:44  2026",
    "Command: ngspice-46, Build",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 7",
    "No. Points: 2",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "\t2\tv1#branch\tcurrent",
    "\t3\t@m1[id]\tcurrent",
    "\t4\t@m1[gm]\tconductance",
    "\t5\t@m.xrelu.mpos[id]\tcurrent",
    "\t6\t@q1[ic]\tcurrent",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t0.000000000000000e+00",
    "\t-1.000000000000000e-03",
    "\t9.500000000000000e-04",
    "\t2.100000000000000e-03",
    "\t1.200000000000000e-06",
    "\t3.300000000000000e-04",
    "1\t\t1.000000000000000e-06",
    "\t9.500000000000000e-01",
    "\t-8.000000000000000e-04",
    "\t7.750000000000000e-04",
    "\t1.900000000000000e-03",
    "\t9.000000000000000e-07",
    "\t2.900000000000000e-04",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(result.plot, "Transient Analysis");
  assert.deepEqual(
    result.vectors.map((vector) => [vector.name, vector.is_scale, vector.phase]),
    [
      ["time", true, undefined],
      ["v(out)", false, undefined],
      ["v1#branch", false, undefined],
      ["@m1[id]", false, undefined],
      ["@m1[gm]", false, undefined],
      ["@m.xrelu.mpos[id]", false, undefined],
      ["@q1[ic]", false, undefined],
    ],
  );
  assert.deepEqual(result.vectors[2].data, [-1e-3, -8e-4]);
  assert.deepEqual(result.vectors[3].data, [9.5e-4, 7.75e-4]);
  assert.deepEqual(result.vectors[5].data, [1.2e-6, 9e-7]);
  assert.equal(traceDisplayName(result.vectors[2].name), "I(V1)");
  assert.equal(traceDisplayName(result.vectors[3].name), "I(M1 drain)");
  assert.equal(traceDisplayName(result.vectors[4].name), "gm(M1)");
  assert.equal(traceDisplayName(result.vectors[5].name), "I(M.XRELU.MPOS drain)");
  assert.equal(traceDisplayName(result.vectors[6].name), "I(Q1 collector)");
  assert.equal(traceValueUnit(result.vectors[2].name), "A");
  assert.equal(traceValueUnit(result.vectors[3].name), "A");
  assert.equal(traceValueUnit(result.vectors[4].name), "S");
  assert.equal(traceValueUnit(result.vectors[5].name), "A");
  assert.equal(traceValueUnit(result.vectors[6].name), "A");
});

test("ASCII RAW parser rejects extra trailing values instead of hiding malformed output", () => {
  const raw = [
    "Title: malformed",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t1.000000000000000e+00",
    "\t2.000000000000000e+00",
  ].join("\n");

  assert.throws(() => parseAsciiRaw(raw), /too many values/);
});

test("ASCII RAW parser rejects malformed numeric tokens instead of accepting parseFloat prefixes", () => {
  const raw = [
    "Title: malformed number",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t1.000000000000000e+00oops",
  ].join("\n");

  assert.throws(() => parseAsciiRaw(raw), /Invalid ngspice RAW numeric value/);
});

test("ASCII RAW parser rejects real values with accidental extra columns", () => {
  const raw = [
    "Title: malformed columns",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 2",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\t1.000000000000000e+00 2.000000000000000e+00",
  ].join("\n");

  assert.throws(() => parseAsciiRaw(raw), /Invalid ngspice RAW numeric value/);
});

test("ASCII RAW parser preserves explicit non-finite engine values", () => {
  const raw = [
    "Title: nonfinite",
    "Plotname: Transient Analysis",
    "Flags: real",
    "No. Variables: 3",
    "No. Points: 1",
    "Variables:",
    "\t0\ttime\ttime",
    "\t1\tv(out)\tvoltage",
    "\t2\tv(limit)\tvoltage",
    "Values:",
    "0\t\t0.000000000000000e+00",
    "\tnan",
    "\tinf",
  ].join("\n");

  const result = parseAsciiRaw(raw);
  assert.equal(Number.isNaN(result.vectors[1].data[0]), true);
  assert.equal(result.vectors[2].data[0], Number.POSITIVE_INFINITY);
});

function assertAlmostEqual(actual: number, expected: number, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}
