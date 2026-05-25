import test from "node:test";
import assert from "node:assert/strict";

import { traceAxisLabel, traceValueUnit } from "../src/editor/traceUnits.ts";

test("trace units classify voltage and current vectors", () => {
  assert.equal(traceValueUnit("v(out)"), "V");
  assert.equal(traceValueUnit("dc2.v(drain)"), "V");
  assert.equal(traceValueUnit("n3"), "V");
  assert.equal(traceValueUnit("v1#branch"), "A");
  assert.equal(traceValueUnit("tran4.v2#branch"), "A");
  assert.equal(traceValueUnit("@m1[i]"), "A");
  assert.equal(traceValueUnit("@m1[id]"), "A");
  assert.equal(traceValueUnit("tran2.@q1[ic]"), "A");
  assert.equal(traceValueUnit("@m.xrelu.mpos[id]"), "A");
  assert.equal(traceValueUnit("xamp.vsense#branch"), "A");
  assert.equal(traceValueUnit("@m1[gm]"), "S");
  assert.equal(traceValueUnit("tran2.@m1[vds]"), "V");
  assert.equal(traceValueUnit("@m.xrelu.mpos[cgs]"), "F");
  assert.equal(traceValueUnit("@m1[qg]"), "C");
  assert.equal(traceValueUnit("noise1.onoise_spectrum"), "V/sqrt(Hz)");
  assert.equal(traceValueUnit("inoise_spectrum"), "V/sqrt(Hz)");
});

test("trace axis labels append units when known", () => {
  assert.equal(traceAxisLabel("V(out)", "v(out)"), "V(out) (V)");
  assert.equal(traceAxisLabel("I(V1)", "v1#branch"), "I(V1) (A)");
  assert.equal(traceAxisLabel("Output noise", "onoise_spectrum"), "Output noise (V/sqrt(Hz))");
  assert.equal(traceAxisLabel("gm(M1)", "@m1[gm]"), "gm(M1) (S)");
});
