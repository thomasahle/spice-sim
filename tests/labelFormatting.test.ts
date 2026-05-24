import assert from "node:assert/strict";
import test from "node:test";

import { canvasValueLabel, formatSourceLabel, formatValueForKind } from "../src/editor/labelFormatting.ts";

test("passive value labels append units without duplicating existing units", () => {
  assert.equal(formatValueForKind("R", "1k"), "1kΩ");
  assert.equal(formatValueForKind("R", "1kΩ"), "1kΩ");
  assert.equal(formatValueForKind("R", "1k ohm"), "1kΩ");
  assert.equal(formatValueForKind("C", "100n"), "100nF");
  assert.equal(formatValueForKind("C", "100nF"), "100nF");
  assert.equal(formatValueForKind("L", "10mH"), "10mH");
});

test("source value labels prefer readable canvas text over raw SPICE syntax", () => {
  assert.equal(formatSourceLabel("5", "V"), "5 V");
  assert.equal(formatSourceLabel("5V", "V"), "5V");
  assert.equal(formatSourceLabel("DC 10", "V"), "10 V");
  assert.equal(formatSourceLabel("AC 2 0", "V"), "AC 2 V");
  assert.equal(formatSourceLabel("DC 0 AC 1", "V"), "AC 1 V");
  assert.equal(formatSourceLabel("DC 5 AC 100m", "V"), "5 V / AC 100mV");
  assert.equal(formatSourceLabel("SIN(0 1 1k)", "V"), "~1V 1kHz");
  assert.equal(formatSourceLabel("SINE(0 1 1MHz)", "V"), "~1V 1MHz");
  assert.equal(formatSourceLabel("PULSE(0 5 1u 1n)", "V"), "5V step");
  assert.equal(formatSourceLabel("DC PULSE(0 5 0 1u 1u 1m 2m)", "V"), "5V step");
  assert.equal(formatSourceLabel("DC 0 PULSE(0 5 0 1u 1u 1m 2m)", "V"), "5V step");
  assert.equal(formatSourceLabel("DC 2 PULSE(0 5 0 1u 1u 1m 2m)", "V"), "2 V / 5V step");
});

test("current sources use amp units and preserve amp-suffixed values", () => {
  assert.equal(formatSourceLabel("2m", "I"), "2mA");
  assert.equal(formatSourceLabel("2mA", "I"), "2mA");
  assert.equal(formatSourceLabel("SIN(0 500uA 1kHz)", "I"), "~500uA 1kHz");
});

test("behavioral source labels preserve compact expressions", () => {
  assert.equal(formatValueForKind("B", "V=sin(2*pi*1k*time)"), "V=sin(2*pi*1k*time)");
  assert.equal(formatValueForKind("B", "V=limit(v(in), 0, 5) + v(out)"), "V=limit(v(in), 0, 5)…");
});

test("canvas labels hide model-backed values and empty labels", () => {
  assert.equal(canvasValueLabel("OPAMP", "LM741"), null);
  assert.equal(canvasValueLabel("D", "DMOD"), null);
  assert.equal(canvasValueLabel("NMOS", "NMOS"), null);
  assert.equal(canvasValueLabel("LABEL", "out"), null);
  assert.equal(canvasValueLabel("SUBX", "child"), null);
  assert.equal(canvasValueLabel("R", "   "), null);
  assert.equal(canvasValueLabel("R", "1k"), "1kΩ");
});
