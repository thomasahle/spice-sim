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

test("default visible traces are empty when no probe nodes resolve", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "v(out)", data: [0, 1] },
  ];

  assert.deepEqual(defaultVisibleTraceNames(vectors, [], "tran1"), new Set());
});
