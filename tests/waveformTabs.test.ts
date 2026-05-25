import assert from "node:assert/strict";
import test from "node:test";

import {
  fallbackWaveformTab,
  isWaveformTabEnabled,
  waveformTabUnavailableReason,
} from "../src/editor/waveformTabs.ts";

test("waveform tabs are enabled only for compatible plot types", () => {
  assert.equal(isWaveformTabEnabled("dc", { plot: "dc1", xyAvailable: true }), true);
  assert.equal(isWaveformTabEnabled("ac", { plot: "dc1", xyAvailable: true }), false);
  assert.equal(isWaveformTabEnabled("bode", { plot: "dc1", xyAvailable: true }), false);

  assert.equal(isWaveformTabEnabled("dc", { plot: "ac1", xyAvailable: true }), false);
  assert.equal(isWaveformTabEnabled("ac", { plot: "ac1", xyAvailable: true }), true);
  assert.equal(isWaveformTabEnabled("bode", { plot: "ac1", xyAvailable: true }), true);

  assert.equal(isWaveformTabEnabled("viewer", { plot: "tran1", xyAvailable: false }), true);
  assert.equal(isWaveformTabEnabled("info", { plot: "tran1", xyAvailable: false }), true);
  assert.equal(isWaveformTabEnabled("xy", { plot: "tran1", xyAvailable: false }), false);
});

test("waveform active tab falls back when a new run makes it invalid", () => {
  assert.equal(fallbackWaveformTab("dc", { plot: "ac1", xyAvailable: true }), "viewer");
  assert.equal(fallbackWaveformTab("bode", { plot: "dc1", xyAvailable: true }), "viewer");
  assert.equal(fallbackWaveformTab("xy", { plot: "tran1", xyAvailable: false }), "viewer");

  assert.equal(fallbackWaveformTab("dc", { plot: "dc1", xyAvailable: true }), "dc");
  assert.equal(fallbackWaveformTab("bode", { plot: "ac1", xyAvailable: true }), "bode");
  assert.equal(fallbackWaveformTab("xy", { plot: "tran1", xyAvailable: true }), "xy");
});

test("waveform disabled tab reasons explain the required run type", () => {
  assert.equal(
    waveformTabUnavailableReason("xy", { plot: "tran1", xyAvailable: false }),
    "X/Y plot needs at least two simulated traces. Add another probe or show another trace, then run again.",
  );
  assert.equal(
    waveformTabUnavailableReason("bode", { plot: "tran1", xyAvailable: true }),
    "Available after an AC sweep. Switch the analysis to AC and run the simulation.",
  );
  assert.equal(
    waveformTabUnavailableReason("dc", { plot: "ac1", xyAvailable: true }),
    "Available after a DC sweep. Switch the analysis to DC and run the simulation.",
  );
  assert.equal(waveformTabUnavailableReason("info", { plot: "tran1", xyAvailable: false }), null);
});
