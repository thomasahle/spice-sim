import test from "node:test";
import assert from "node:assert/strict";

import type { SimVector } from "../src/sim/api.ts";
import { defaultVisibleTraceNames } from "../src/editor/traceVisibility.ts";

test("default visible traces prefer probed nodes when probes exist", () => {
  const vectors: SimVector[] = [
    { name: "v-sweep", is_scale: true, data: [0, 1] },
    { name: "v1#branch", data: [0, 0] },
    { name: "v(drain)", data: [5, 1] },
    { name: "v(gate)", data: [0, 1] },
  ];

  assert.deepEqual(defaultVisibleTraceNames(vectors, ["drain"], "dc1"), new Set(["v(drain)"]));
});

test("default visible traces use non-internal voltages when no probe nodes resolve", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "v1#branch", data: [0, 0] },
    { name: "i(@r1[i])", data: [0, 0] },
    { name: "v(n1)", data: [0.5, 0.7] },
    { name: "v(out)", data: [0, 1] },
    { name: "x1.u", data: [0, 1] },
  ];

  assert.deepEqual(defaultVisibleTraceNames(vectors, [], "tran1"), new Set(["v(out)"]));
});

test("default visible traces do not expose only auto-generated node names", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "v(n1)", data: [0, 1] },
    { name: "tran2.v(n2)", data: [0, 1] },
    { name: "i(@r1[i])", data: [0, 1e-3] },
  ];

  assert.deepEqual(defaultVisibleTraceNames(vectors, [], "tran1"), new Set());
});

test("default visible traces prefer user-labeled nodes over auto-generated nodes", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "v(n1)", data: [0, 1] },
    { name: "v(n2)", data: [0, 1] },
    { name: "v(vdd)", data: [3.3, 3.3] },
    { name: "v(vout)", data: [0, 2] },
    { name: "i(@m1[id])", data: [0, 1e-3] },
  ];

  assert.deepEqual(
    defaultVisibleTraceNames(vectors, [], "tran1", ["vdd", "vout"]),
    new Set(["v(vdd)", "v(vout)"]),
  );
});
