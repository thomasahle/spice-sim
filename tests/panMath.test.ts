import assert from "node:assert/strict";
import test from "node:test";

import { applyWheelPan, wheelPanDelta } from "../src/editor/panMath.ts";

test("natural wheel pan makes the canvas follow a trackpad gesture", () => {
  assert.deepEqual(wheelPanDelta(-12, 8, true), { x: -12, y: 8 });
  assert.deepEqual(applyWheelPan({ x: 100, y: 200 }, -12, 8, true), {
    x: 88,
    y: 208,
  });
});

test("reverse wheel pan keeps the legacy page-scroll direction", () => {
  assert.deepEqual(wheelPanDelta(-12, 8, false), { x: 12, y: -8 });
  assert.deepEqual(applyWheelPan({ x: 100, y: 200 }, -12, 8, false), {
    x: 112,
    y: 192,
  });
});
