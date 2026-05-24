import assert from "node:assert/strict";
import test from "node:test";

import { draftMeasurement, dragDeltaMeasurement } from "../src/editor/draftMeasurement.ts";

test("draft measurement reports length and angle for a segment", () => {
  assert.deepEqual(draftMeasurement([{ x: 0, y: 0 }, { x: 3, y: 4 }]), {
    label: "5u · 53°",
    x: 1.5,
    y: 1.45,
    width: 2.5,
  });
});

test("draft measurement sums polyline segments and uses the last segment angle", () => {
  const measurement = draftMeasurement([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 2 },
  ]);

  assert.equal(measurement?.label, "5u · 90°");
  assert.equal(measurement?.x, 3);
  assert.equal(measurement?.y.toFixed(2), "0.45");
});

test("draft measurement is hidden for tiny drags", () => {
  assert.equal(draftMeasurement([{ x: 0, y: 0 }, { x: 0.01, y: 0 }]), null);
});

test("drag delta measurement reports signed x and y movement", () => {
  assert.deepEqual(dragDeltaMeasurement({ x: 2, y: -1 }, { x: 4.5, y: -2 }), {
    label: "Δ +2.5u, -1u",
    x: 4.5,
    y: -2.7,
    width: 3.5,
  });
});

test("drag delta measurement is hidden for tiny movement", () => {
  assert.equal(dragDeltaMeasurement({ x: 0, y: 0 }, { x: 0.01, y: 0.01 }), null);
});
