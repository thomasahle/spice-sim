import assert from "node:assert/strict";
import test from "node:test";

import { scopeReadoutValue, shouldUseLogScopeX } from "../src/editor/miniScopeMath.ts";

test("mini-scope readout follows the playhead sample", () => {
  assert.equal(scopeReadoutValue([0, 1, 2, 3], [10, 20, 30, 40], 2.2), 30);
  assert.equal(scopeReadoutValue([0, 1, 2, 3], [10, 20, 30, 40], 2.8), 40);
});

test("mini-scope readout falls back to the latest finite value", () => {
  assert.equal(scopeReadoutValue([], [1, 2, 3], null), 3);
  assert.equal(scopeReadoutValue([0, 1], [Number.NaN, Infinity], 0), null);
});

test("mini-scope uses log x only for positive decade-style scales", () => {
  assert.equal(shouldUseLogScopeX([10, 100, 1000, 10000]), true);
  assert.equal(shouldUseLogScopeX([0, 1, 2, 3]), false);
  assert.equal(shouldUseLogScopeX([1, 2, 3, 4]), false);
  assert.equal(shouldUseLogScopeX([1000, 100, 10]), false);
});
