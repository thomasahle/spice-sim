import assert from "node:assert/strict";
import test from "node:test";

import { compactInlineMathText, estimateMathAtomsWidth } from "../src/editor/mathText.ts";
import { subxPinLabelMaxWidth } from "../src/editor/subxLayout.ts";

test("subcircuit pin labels reserve a center gutter for the block name", () => {
  const fontSize = 0.32;
  const narrowLane = subxPinLabelMaxWidth(2.5, fontSize);
  const wideLane = subxPinLabelMaxWidth(4, fontSize);

  assert.ok(narrowLane < 4, `expected narrow side lane, got ${narrowLane}`);
  assert.ok(wideLane > narrowLane);
  assert.ok(wideLane < 4 / fontSize);
});

test("subcircuit pin label lane width drives math-aware truncation", () => {
  const maxWidth = subxPinLabelMaxWidth(2.5, 0.32);
  const atoms = compactInlineMathText("very_long_pin_name_{out}", maxWidth);

  assert.equal(atoms.at(-1)?.text, "...");
  assert.ok(estimateMathAtomsWidth(atoms) <= maxWidth);
});
