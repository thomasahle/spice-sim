import test from "node:test";
import assert from "node:assert/strict";
import { analysisToApi, analysisWithSweepSource, parseSpiceUnitStrict, validateAnalysisSpec } from "../src/editor/analysisValidation.ts";

test("SPICE numeric parser accepts suffixes and exponents", () => {
  assert.ok(Math.abs((parseSpiceUnitStrict("10u") ?? 0) - 10e-6) < 1e-15);
  assert.equal(parseSpiceUnitStrict("1e-3"), 1e-3);
  assert.equal(parseSpiceUnitStrict("2.2Meg"), 2.2e6);
  assert.equal(parseSpiceUnitStrict(".5k"), 500);
});

test("SPICE numeric parser rejects malformed values", () => {
  assert.equal(parseSpiceUnitStrict("abc"), null);
  assert.equal(parseSpiceUnitStrict("10foo"), null);
  assert.equal(parseSpiceUnitStrict(""), null);
});

test("analysis validation rejects invalid transient timing", () => {
  const issues = validateAnalysisSpec({ kind: "tran", tstep: "5m", tstop: "1m" });
  assert.ok(issues.some((issue) => issue.message.includes("Time step")));
});

test("analysis conversion preserves exponent inputs instead of falling back", () => {
  const api = analysisToApi({ kind: "dc", src: "V1", start: "0", stop: "1e-3", step: "2e-4" });
  assert.deepEqual(api, {
    kind: "dcsweep",
    src: "V1",
    start: 0,
    stop: 1e-3,
    step: 2e-4,
  });
});

test("analysisWithSweepSource updates only DC and noise source fields", () => {
  assert.deepEqual(
    analysisWithSweepSource({ kind: "dc", src: "V1", start: "0", stop: "5", step: "1" }, "V2"),
    { kind: "dc", src: "V2", start: "0", stop: "5", step: "1" },
  );
  assert.deepEqual(
    analysisWithSweepSource(
      { kind: "noise", out_node: "out", src: "V1", sweep: "dec", npts: 10, fstart: "1", fstop: "1Meg" },
      "I1",
    ),
    { kind: "noise", out_node: "out", src: "I1", sweep: "dec", npts: 10, fstart: "1", fstop: "1Meg" },
  );

  const ac = { kind: "ac", sweep: "dec", npts: 30, fstart: "1", fstop: "1Meg" } as const;
  assert.equal(analysisWithSweepSource(ac, "V2"), ac);
});
