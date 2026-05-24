import test from "node:test";
import assert from "node:assert/strict";

import { analysisXAxisLabel, axisUnitFromLabel } from "../src/editor/waveformAxis.ts";

test("analysis x-axis labels include physical units", () => {
  assert.equal(analysisXAxisLabel({ kind: "tran", tstep: "1u", tstop: "1m" }), "Time (s)");
  assert.equal(analysisXAxisLabel({ kind: "ac", sweep: "dec", npts: 10, fstart: "1", fstop: "1k" }), "Frequency (Hz)");
  assert.equal(analysisXAxisLabel({ kind: "dc", src: "V1", start: "0", stop: "5", step: "1" }), "V1 sweep (V)");
  assert.equal(analysisXAxisLabel({ kind: "dc", src: "I2", start: "0", stop: "1m", step: "10u" }), "I2 sweep (A)");
});

test("axis units are parsed from labels", () => {
  assert.equal(axisUnitFromLabel("V1 sweep (V)"), "V");
  assert.equal(axisUnitFromLabel("Frequency (Hz)"), "Hz");
  assert.equal(axisUnitFromLabel("Sample"), "");
});
