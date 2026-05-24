import assert from "node:assert/strict";
import test from "node:test";

import {
  isAcStimulus,
  sourcePresetValue,
  sourceValueWithAcStimulus,
} from "../src/editor/sourceValues.ts";

test("source AC stimulus detection is keyword-based", () => {
  assert.equal(isAcStimulus("AC 1"), true);
  assert.equal(isAcStimulus("  ac 1 45"), true);
  assert.equal(isAcStimulus("DC 0 AC 1"), true);
  assert.equal(isAcStimulus("DC 5"), false);
  assert.equal(isAcStimulus("SIN(0 1 1k)"), false);
});

test("sourceValueWithAcStimulus preserves AC values and defaults others", () => {
  assert.equal(sourceValueWithAcStimulus("AC 2 30"), "AC 2 30");
  assert.equal(sourceValueWithAcStimulus("DC 0 AC 1"), "DC 0 AC 1");
  assert.equal(sourceValueWithAcStimulus("DC 5"), "AC 1");
  assert.equal(sourceValueWithAcStimulus("SIN(0 1 1k)"), "AC 1");
});

test("source presets use voltage and current appropriate amplitudes", () => {
  assert.equal(sourcePresetValue("sine60", "V"), "SIN(0 5 60)");
  assert.equal(sourcePresetValue("pulseStep", "V"), "PULSE(0 5 0 1u 1u 5m 10m)");
  assert.equal(sourcePresetValue("sine60", "I"), "SIN(0 1m 60)");
  assert.equal(sourcePresetValue("pulseStep", "I"), "PULSE(0 1m 0 1u 1u 5m 10m)");
});
