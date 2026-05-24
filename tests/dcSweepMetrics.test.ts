import test from "node:test";
import assert from "node:assert/strict";

import { computeSweepMetrics } from "../src/editor/dcSweepMetrics.ts";

test("DC sweep metrics report endpoints and extrema with sweep positions", () => {
  const metrics = computeSweepMetrics([0, 1, 2, 3], [5, 3, 6, 2]);

  assert.deepEqual(metrics, {
    start: 5,
    end: 2,
    min: 2,
    minX: 3,
    max: 6,
    maxX: 2,
    delta: -3,
  });
});

test("DC sweep metrics ignore non-finite samples", () => {
  const metrics = computeSweepMetrics([0, 1, 2, 3], [Number.NaN, 4, Infinity, 1]);

  assert.equal(metrics.start, 4);
  assert.equal(metrics.end, 1);
  assert.equal(metrics.min, 1);
  assert.equal(metrics.minX, 3);
  assert.equal(metrics.max, 4);
  assert.equal(metrics.maxX, 1);
  assert.equal(metrics.delta, -3);
});
