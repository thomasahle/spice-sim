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
});

test("trace axis labels append units when known", () => {
  assert.equal(traceAxisLabel("V(out)", "v(out)"), "V(out) (V)");
  assert.equal(traceAxisLabel("I(V1)", "v1#branch"), "I(V1) (A)");
  assert.equal(traceAxisLabel("@m1[gm]", "@m1[gm]"), "@m1[gm]");
});
