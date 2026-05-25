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
    "Only internal generated vectors are available. Turn on Internal to inspect them.",
  );
  assert.equal(
    waveformTraceListEmptyMessage([
      { name: "time", is_scale: true },
      { name: "v(out)", is_scale: false },
    ], false),
    "No visible traces. Use Show all to restore the plot.",
  );
});

test("trace buckets hide internal traces until the Internal toggle is enabled", () => {
  const vectors = [
    { name: "time", is_scale: true },
    { name: "v(out)", is_scale: false },
    { name: "@m1[id]", is_scale: false },
    { name: "x1.u", is_scale: false },
  ];

  assert.deepEqual(
    waveformTraceBuckets(vectors, false).visibleTraces.map((trace) => trace.name),
    ["v(out)"],
  );
  assert.deepEqual(
    waveformTraceBuckets(vectors, true).visibleTraces.map((trace) => trace.name),
    ["v(out)", "@m1[id]", "x1.u"],
  );
  assert.equal(waveformTraceBuckets(vectors, false).hiddenInternalCount, 2);
});
