import assert from "node:assert/strict";
import test from "node:test";

import { applyWheelPan, wheelPanDelta } from "../src/editor/panMath.ts";

test("natural wheel pan makes the canvas follow a trackpad gesture", () => {
  assert.deepEqual(wheelPanDelta(-12, 8), { x: 12, y: -8 });
  assert.deepEqual(applyWheelPan({ x: 100, y: 200 }, -12, 8), {
    x: 112,
    y: 192,
  });
});
