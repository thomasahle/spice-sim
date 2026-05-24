import assert from "node:assert/strict";
import test from "node:test";

import { sweepRunLabelsFromDirectives } from "../src/editor/sweepRunLabels.ts";

test("sweep run labels describe stepped parameter list values", () => {
  assert.deepEqual(
    [...sweepRunLabelsFromDirectives(".param rval=1k\n.step param rval list 500 1k 2k")],
    [
      [1, "rval=500"],
      [2, "rval=1k"],
      [3, "rval=2k"],
    ],
  );
});

test("sweep run labels follow engine cartesian product order", () => {
  assert.deepEqual(
    [...sweepRunLabelsFromDirectives(".step param r 1k 2k 1k\n.temp 0 27\n.mc 2")],
    [
      [1, "r=1k · 0 °C · MC 1"],
      [2, "r=1k · 0 °C · MC 2"],
      [3, "r=1k · 27 °C · MC 1"],
      [4, "r=1k · 27 °C · MC 2"],
      [5, "r=2k · 0 °C · MC 1"],
      [6, "r=2k · 0 °C · MC 2"],
      [7, "r=2k · 27 °C · MC 1"],
      [8, "r=2k · 27 °C · MC 2"],
    ],
  );
});

test("sweep run labels are empty when no sweep directives are present", () => {
  assert.equal(sweepRunLabelsFromDirectives(".param r=1k").size, 0);
});
