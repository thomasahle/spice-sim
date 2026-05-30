import assert from "node:assert/strict";
import test from "node:test";

import {
  currentTraceNames,
  defaultXyTraceNames,
  nearestXySample,
  pairedXySamples,
  selectableXyTraceNames,
  voltageTraceNames,
} from "../src/editor/xyPlot.ts";

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
    voltageTraceNames(["v1#branch", "i(load)", "i(@r1[i])", "v(out)", "out", "@m1[id]"]),
    ["v(out)", "out"],
  );
});

test("currentTraceNames includes native branch and wrapped savecurrents vectors", () => {
  assert.deepEqual(
    currentTraceNames(["time", "v(out)", "v1#branch", "i(v1)", "i(@r1[i])", "@m1[id]", "@m1[gm]"]),
    ["v1#branch", "i(v1)", "i(@r1[i])", "@m1[id]"],
  );
});

test("selectableXyTraceNames leads with user-labeled voltages, then offers currents", () => {
  assert.deepEqual(
    selectableXyTraceNames(
      ["v(n1)", "v(out)", "i(@r1[i])", "v(n2)", "v(in)", "v(x1.u)"],
      ["v(in)", "v(out)"],
    ),
    // user voltages first (default stays V-vs-V), current appended so an
    // I–V curve is still selectable
    ["v(out)", "v(in)", "i(@r1[i])"],
  );
});

test("selectableXyTraceNames hides internal *nodes* but still offers currents", () => {
  assert.deepEqual(
    selectableXyTraceNames(["v(n1)", "v(out)", "v(in)", "i(@r1[i])", "v(x1.u)"], []),
    ["v(out)", "v(in)", "i(@r1[i])"],
  );
  assert.deepEqual(
    selectableXyTraceNames(["v(x1.u)", "v(x1.h)", "i(@r1[i])"], []),
    ["v(x1.u)", "v(x1.h)", "i(@r1[i])"],
  );
  assert.deepEqual(
    selectableXyTraceNames(["i(@r1[i])", "i(@c1[i])"], []),
    ["i(@r1[i])", "i(@c1[i])"],
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
