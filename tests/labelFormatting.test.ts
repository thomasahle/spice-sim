import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartCanvasValueEditFromTyping,
  canvasValueLabel,
  formatSourceLabel,
  formatValueForKind,
  isCanvasModelKind,
  isEditableCanvasComponentValue,
} from "../src/editor/labelFormatting.ts";

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

test("on-canvas value editability includes hidden model-backed values", () => {
  assert.equal(isCanvasModelKind("NMOS"), true);
  assert.equal(isCanvasModelKind("D"), true);
  assert.equal(isCanvasModelKind("R"), false);

  assert.equal(isEditableCanvasComponentValue("NMOS", "NCH"), true);
  assert.equal(isEditableCanvasComponentValue("D", "D1N4148"), true);
  assert.equal(isEditableCanvasComponentValue("OPAMP", "LM741"), true);
  assert.equal(isEditableCanvasComponentValue("SUBX", "relu_cell"), true);
  assert.equal(isEditableCanvasComponentValue("B", "V=max(0,V(in))"), true);
  assert.equal(isEditableCanvasComponentValue("R", "1k"), true);
  assert.equal(isEditableCanvasComponentValue("R", "   "), false);
  assert.equal(isEditableCanvasComponentValue("LABEL", "out"), false);
  assert.equal(isEditableCanvasComponentValue("NOTE", "text"), false);
});

test("direct typing can start realistic on-canvas value edits", () => {
  assert.equal(canStartCanvasValueEditFromTyping("R", "1k", "2"), true);
  assert.equal(canStartCanvasValueEditFromTyping("R", "1k", "k"), true);
  assert.equal(canStartCanvasValueEditFromTyping("R", "1k", "M"), true);
  assert.equal(canStartCanvasValueEditFromTyping("C", "100n", "u"), true);
  assert.equal(canStartCanvasValueEditFromTyping("L", "10m", "H"), true);
  assert.equal(canStartCanvasValueEditFromTyping("R", "1k", "w"), false);

  assert.equal(canStartCanvasValueEditFromTyping("V", "DC 5", "P"), true);
  assert.equal(canStartCanvasValueEditFromTyping("I", "SIN(0 1m 1k)", "S"), true);
  assert.equal(canStartCanvasValueEditFromTyping("B", "V=V(in)", "v"), true);
  assert.equal(canStartCanvasValueEditFromTyping("NMOS", "NCH", "N"), true);
  assert.equal(canStartCanvasValueEditFromTyping("SUBX", "relu_cell", "r"), true);

  assert.equal(canStartCanvasValueEditFromTyping("R", "   ", "1"), false);
  assert.equal(canStartCanvasValueEditFromTyping("LABEL", "out", "x"), false);
  assert.equal(canStartCanvasValueEditFromTyping("R", "1k", "ab"), false);
});
