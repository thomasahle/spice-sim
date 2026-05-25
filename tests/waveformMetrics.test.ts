import assert from "node:assert/strict";
import test from "node:test";
import { computeMetrics } from "../src/editor/waveformMetrics.ts";

test("waveform metrics ignore non-finite samples when estimating frequency", () => {
  const metrics = computeMetrics([0, 1, 2, 3, 4], [-1, Infinity, -1, 1, -1]);

  assert.equal(metrics.vmin, -1);
  assert.equal(metrics.vmax, 1);
  assert.equal(metrics.vpp, 2);
  assert.equal(metrics.freqHz, 0.25);
});

test("waveform metrics return NaN summaries for entirely non-finite traces", () => {
  const metrics = computeMetrics([0, 1, 2], [NaN, Infinity, -Infinity]);

  assert.equal(Number.isNaN(metrics.vmin), true);
  assert.equal(Number.isNaN(metrics.vmax), true);
  assert.equal(Number.isNaN(metrics.vmean), true);
  assert.equal(Number.isNaN(metrics.vrms), true);
  assert.equal(Number.isNaN(metrics.freqHz), true);
});
