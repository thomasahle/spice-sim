import test from "node:test";
import assert from "node:assert/strict";
import { analysisDirective, composeBatchNetlist, parseAsciiRaw } from "../src/sim/wasmBackend.ts";

test("WASM batch netlist appends analysis and ASCII raw option", () => {
  const netlist = ["* generated", "V1 in 0 DC 1", "R1 in 0 1k", ".end"].join("\n");
  const batch = composeBatchNetlist(netlist, { kind: "tran", tstep: 0.00001, tstop: 0.001 });
  assert.match(batch, /\.option filetype=ascii\n\.tran 0\.00001 0\.001\n\.end\n$/);
  assert.equal((batch.match(/^\.end$/gm) ?? []).length, 1);
});

test("WASM analysis directives mirror the native engine commands", () => {
  assert.equal(analysisDirective({ kind: "op" }), ".op");
  assert.equal(
    analysisDirective({ kind: "dcsweep", src: "V1", start: 0, stop: 5, step: 0.5 }),
    ".dc v1 0 5 0.5",
  );
  assert.equal(
    analysisDirective({ kind: "noise", out_node: "OUT", src: "V1", sweep: "dec", npts: 10, fstart: 1, fstop: 1000 }),
    ".noise v(out) v1 dec 10 1 1000",
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
