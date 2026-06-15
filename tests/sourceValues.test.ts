import assert from "node:assert/strict";
import test from "node:test";

import {
  isAcStimulus,
  isTransientSilentSource,
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

test("AC-only sources are flagged as inert in transient; time-domain/DC ones aren't", () => {
  // Inert in transient: AC small-signal with no time-domain waveform / no DC.
  assert.equal(isTransientSilentSource("AC 1"), true);
  assert.equal(isTransientSilentSource("ac 2 45"), true);
  assert.equal(isTransientSilentSource("DC 0 AC 1"), true);
  // Active in transient.
  assert.equal(isTransientSilentSource("DC 5 AC 1"), false); // has a DC level
  assert.equal(isTransientSilentSource("SIN(0 1 1k) AC 1"), false); // time-domain
  assert.equal(isTransientSilentSource("SIN(0 1 1k)"), false);
  assert.equal(isTransientSilentSource("DC 5"), false);
  assert.equal(isTransientSilentSource("5"), false);
  assert.equal(isTransientSilentSource("PULSE(0 5 0 1u 1u 5m 10m)"), false);
});

test("source presets use voltage and current appropriate amplitudes", () => {
  assert.equal(sourcePresetValue("sine60", "V"), "SIN(0 5 60)");
  assert.equal(sourcePresetValue("pulseStep", "V"), "PULSE(0 5 0 1u 1u 5m 10m)");
  assert.equal(sourcePresetValue("sine60", "I"), "SIN(0 1m 60)");
  assert.equal(sourcePresetValue("pulseStep", "I"), "PULSE(0 1m 0 1u 1u 5m 10m)");
});
