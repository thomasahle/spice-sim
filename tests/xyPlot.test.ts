import assert from "node:assert/strict";
import test from "node:test";

import { defaultXyTraceNames, nearestXySample, pairedXySamples, voltageTraceNames } from "../src/editor/xyPlot.ts";

test("defaultXyTraceNames prefers two voltage traces over branch currents", () => {
  assert.deepEqual(defaultXyTraceNames(["v1#branch", "v(n2)", "v(out)"]), {
    xName: "v(n2)",
    yName: "v(out)",
  });
});

test("defaultXyTraceNames prefers input on X and output on Y for transfer plots", () => {
  assert.deepEqual(defaultXyTraceNames(["out", "in"]), {
    xName: "in",
    yName: "out",
  });
  assert.deepEqual(defaultXyTraceNames(["v(out)", "v(in)"]), {
    xName: "v(in)",
    yName: "v(out)",
  });
});

test("defaultXyTraceNames falls back to the first two traces when fewer than two voltages exist", () => {
  assert.deepEqual(defaultXyTraceNames(["v1#branch", "i(load)", "v(out)"]), {
    xName: "v1#branch",
    yName: "i(load)",
  });
  assert.equal(defaultXyTraceNames(["v(out)"]), null);
});

test("voltageTraceNames filters branch currents and explicit current traces", () => {
  assert.deepEqual(
    voltageTraceNames(["v1#branch", "i(load)", "v(out)", "out", "@m1[id]"]),
    ["v(out)", "out"],
  );
});

test("pairedXySamples keeps finite pairs and preserves original sample index", () => {
  assert.deepEqual(
    pairedXySamples([0, 1, NaN, 3, 4], [10, Infinity, 12, 13, 14]),
    [
      { index: 0, x: 0, y: 10 },
      { index: 3, x: 3, y: 13 },
      { index: 4, x: 4, y: 14 },
    ],
  );
});

test("nearestXySample returns the nearest projected sample", () => {
  const samples = pairedXySamples([0, 10, 20], [0, 5, 10]);

  assert.deepEqual(
    nearestXySample(samples, 18, 6, (sample) => ({
      px: sample.x,
      py: sample.y,
    })),
    { index: 2, x: 20, y: 10 },
  );
});

test("nearestXySample returns null for an empty sample set", () => {
  assert.equal(nearestXySample([], 0, 0, () => ({ px: 0, py: 0 })), null);
});
