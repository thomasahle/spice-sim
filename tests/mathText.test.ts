import assert from "node:assert/strict";
import test from "node:test";

import { parseInlineMathText } from "../src/editor/mathText.ts";

test("inline math parser attaches simple subscripts and superscripts", () => {
  assert.deepEqual(parseInlineMathText("W_-"), [
    { text: "W", sub: "-" },
  ]);
  assert.deepEqual(parseInlineMathText("V_{TH}^2"), [
    { text: "V", sub: "TH", sup: "2" },
  ]);
});

test("inline math parser maps common TeX commands to schematic glyphs", () => {
  assert.deepEqual(parseInlineMathText("\\Delta V_\\mu"), [
    { text: "Δ " },
    { text: "V", sub: "μ" },
  ]);
  assert.deepEqual(parseInlineMathText("x \\in \\mathbb{R}"), [
    { text: "x ∈ ℝ" },
  ]);
});

test("inline math parser keeps ordinary labels compact", () => {
  assert.deepEqual(parseInlineMathText("preactivation u"), [
    { text: "preactivation u" },
  ]);
});

test("inline math parser renders common braced text helpers readably", () => {
  assert.deepEqual(parseInlineMathText("I_{\\mathrm{up}} = \\frac{V_{DD}}{R_{bias}}"), [
    { text: "I", sub: "up" },
    { text: " = V_DD/R_bias" },
  ]);
  assert.deepEqual(parseInlineMathText("h = \\sqrt{u} + \\text{noise}"), [
    { text: "h = √u + noise" },
  ]);
});

test("inline math parser renders engineering equation notation readably", () => {
  assert.deepEqual(parseInlineMathText("C_u\\dot{u} = I_{up} - I_{down}"), [
    { text: "C", sub: "u" },
    { text: "u̇ = " },
    { text: "I", sub: "up" },
    { text: " - " },
    { text: "I", sub: "down" },
  ]);
  assert.deepEqual(parseInlineMathText("h \\ge 0, x \\notin \\mathbb{Z}"), [
    { text: "h ≥ 0, x ∉ ℤ" },
  ]);
  assert.deepEqual(parseInlineMathText("u \\leq V_{DD}, y \\ne 0, a \\equiv b"), [
    { text: "u ≤ " },
    { text: "V", sub: "DD" },
    { text: ", y ≠ 0, a ≡ b" },
  ]);
  assert.deepEqual(parseInlineMathText("\\left( V_{DD} - u \\right)"), [
    { text: "( " },
    { text: "V", sub: "DD" },
    { text: " - u )" },
  ]);
  assert.deepEqual(parseInlineMathText("\\left\\langle x \\right\\rangle \\mapsto y"), [
    { text: "⟨ x ⟩ ↦ y" },
  ]);
});
