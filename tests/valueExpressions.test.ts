import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDeviceValue,
  normalizeLengthValue,
  normalizeNumericExpression,
  normalizePassiveValue,
  normalizeSourceValue,
  parseSpiceUnitStrict,
} from "../src/editor/valueExpressions.ts";

test("SPICE numeric parser accepts suffixes and exponents", () => {
  assert.ok(Math.abs((parseSpiceUnitStrict("10u") ?? 0) - 10e-6) < 1e-15);
  assert.equal(parseSpiceUnitStrict("1e-3"), 1e-3);
  assert.equal(parseSpiceUnitStrict("2.2Meg"), 2.2e6);
  assert.equal(parseSpiceUnitStrict(".5k"), 500);
});

test("SPICE numeric parser rejects malformed values", () => {
  assert.equal(parseSpiceUnitStrict("abc"), null);
  assert.equal(parseSpiceUnitStrict("10foo"), null);
  assert.equal(parseSpiceUnitStrict(""), null);
});

test("numeric expressions evaluate SPICE-scale arithmetic", () => {
  assert.equal(normalizeNumericExpression("2 * 10k"), "20000");
  assert.equal(normalizeNumericExpression("(1k + 500) / 3"), "500");
  assert.equal(normalizeNumericExpression("-2.5m"), "-0.0025");
});

test("passive values accept friendly unit text without leaking spaces into the netlist", () => {
  assert.equal(normalizePassiveValue("1 kΩ", "1k", "ohm"), "1000");
  assert.equal(normalizePassiveValue("1k", "1k", "ohm"), "1k");
  assert.equal(normalizePassiveValue("10 uF", "10n", "farad"), "1e-5");
  assert.equal(normalizePassiveValue("2 * 5 mH", "10m", "henry"), "0.01");
  assert.equal(normalizePassiveValue("10F", "10n", "farad"), "10");
});

test("device values leave parameter expressions untouched", () => {
  assert.equal(normalizeDeviceValue("{RVAL}", "1k"), "{RVAL}");
  assert.equal(normalizeDeviceValue("rnom", "1k"), "rnom");
});

test("length values accept meter-based text for transistor geometry", () => {
  assert.equal(normalizeLengthValue("10u", "1u"), "10u");
  assert.equal(normalizeLengthValue("10 um", "1u"), "1e-5");
  assert.equal(normalizeLengthValue("1 µm", "1u"), "1e-6");
  assert.equal(normalizeLengthValue("180 nm", "1u"), "1.8e-7");
  assert.equal(normalizeLengthValue("2 * 90 nm", "1u"), "1.8e-7");
});

test("source waveforms accept friendly units in positional arguments", () => {
  assert.equal(
    normalizeSourceValue("PULSE(0 V 5 volts 0 seconds 1 us 1 us 5 ms 10 ms)", "DC 0"),
    "PULSE(0 5 0 1e-6 1e-6 0.005 0.01)",
  );
  assert.equal(normalizeSourceValue("SIN(0 500 mV 1 kHz)", "DC 0"), "SIN(0 0.5 1000)");
  assert.equal(normalizeSourceValue("SIN(0 1 V 1 MHz)", "DC 0"), "SIN(0 1 1e6)");
  assert.equal(normalizeSourceValue("SIN(0 1 mV 1 MHz)", "DC 0"), "SIN(0 0.001 1e6)");
  assert.equal(normalizeSourceValue("SFFM(0 1 1 MHz 5 10 kHz)", "DC 0"), "SFFM(0 1 1e6 5 10000)");
  assert.equal(normalizeSourceValue("AC 1 V 30 deg", "DC 0"), "AC 1 30");
  assert.equal(normalizeSourceValue("5 V", "DC 0"), "DC 5");
});
