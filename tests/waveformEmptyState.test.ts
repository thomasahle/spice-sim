import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPlottableWaveform,
  waveformPaneEmptyState,
  waveformTraceBuckets,
  waveformTraceListEmptyMessage,
} from "../src/editor/waveformEmptyState.ts";

test("plottable waveform requires a scale with at least two points", () => {
  assert.equal(hasPlottableWaveform([]), false);
  assert.equal(hasPlottableWaveform([{ is_scale: true, data: [0] }]), false);
  assert.equal(hasPlottableWaveform([{ is_scale: true, data: [0, 1e-3] }]), true);
});

test("empty waveform state explains operating point runs", () => {
  const state = waveformPaneEmptyState("op1", [
    { is_scale: false, data: [1.2] },
  ]);
  assert.equal(state.title, "Operating point has no waveform");
  assert.match(state.detail, /no time or sweep axis/i);
});

test("empty waveform state explains missing or undersized scales", () => {
  assert.equal(waveformPaneEmptyState("tran1", []).title, "No waveform axis returned");
  assert.equal(
    waveformPaneEmptyState("tran1", [{ is_scale: true, data: [0] }]).title,
    "Not enough waveform samples",
  );
});

test("trace list empty state distinguishes hidden internal traces", () => {
  assert.equal(
    waveformTraceListEmptyMessage([{ name: "time", is_scale: true }], false),
    "No traces returned. Add a probe or run an analysis that produces node vectors.",
  );
  assert.equal(
    waveformTraceListEmptyMessage([
      { name: "time", is_scale: true },
      { name: "@m1[id]", is_scale: false },
    ], false),
    "Only internal generated vectors are available. Open Debug traces to inspect them.",
  );
  assert.equal(
    waveformTraceListEmptyMessage([
      { name: "time", is_scale: true },
      { name: "v(out)", is_scale: false },
    ], false),
    "No visible traces. Use Reset to restore visible traces.",
  );
});

test("trace buckets hide internal traces until the Internal toggle is enabled", () => {
  const vectors = [
    { name: "time", is_scale: true },
    { name: "v(out)", is_scale: false },
    { name: "v(n1)", is_scale: false },
    { name: "tran2.v(n2)", is_scale: false },
    { name: "tran2.v(step_out)", is_scale: false },
    { name: "tran2.i(@r1[i])", is_scale: false },
    { name: "@m1[id]", is_scale: false },
    { name: "tran2.@m1[id]", is_scale: false },
    { name: "x1.u", is_scale: false },
  ];

  assert.deepEqual(
    waveformTraceBuckets(vectors, false).visibleTraces.map((trace) => trace.name),
    ["v(out)", "tran2.v(step_out)", "tran2.i(@r1[i])"],
  );
  assert.deepEqual(
    waveformTraceBuckets(vectors, true).visibleTraces.map((trace) => trace.name),
    ["v(out)", "v(n1)", "tran2.v(n2)", "tran2.v(step_out)", "tran2.i(@r1[i])", "@m1[id]", "tran2.@m1[id]", "x1.u"],
  );
  assert.equal(waveformTraceBuckets(vectors, false).hiddenInternalCount, 5);
});
