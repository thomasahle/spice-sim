import assert from "node:assert/strict";
import test from "node:test";

import {
  boundsFromPoints,
  componentBoundsFor,
  componentVisualBoundsFor,
  pointOnPolylineBody,
  wireIntersectsRect,
} from "../src/editor/geometry.ts";
import { getPinLayout, type CircuitComponent } from "../src/editor/model.ts";

test("wireIntersectsRect catches segments crossing the marquee without vertices inside", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-5, 0],
        [5, 0],
      ],
      { x1: -1, y1: -1, x2: 1, y2: 1 },
    ),
    true,
  );
});

test("wireIntersectsRect catches vertical and elbow segment intersections", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-4, -4],
        [-4, 3],
        [4, 3],
      ],
      { x1: -5, y1: -1, x2: -3, y2: 1 },
    ),
    true,
  );
});

test("wireIntersectsRect returns false when the marquee misses the whole wire", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-5, -5],
        [-3, -5],
      ],
      { x1: -1, y1: -1, x2: 1, y2: 1 },
    ),
    false,
  );
});

test("pointOnPolylineBody includes interior wire vertices but not absolute endpoints", () => {
  const wire: [number, number][] = [
    [0, 0],
    [2, 0],
    [4, 0],
  ];

  assert.equal(pointOnPolylineBody({ x: 2, y: 0 }, wire), true);
  assert.equal(pointOnPolylineBody({ x: 1, y: 0 }, wire), true);
  assert.equal(pointOnPolylineBody({ x: 0, y: 0 }, wire), false);
  assert.equal(pointOnPolylineBody({ x: 4, y: 0 }, wire), false);
  assert.equal(pointOnPolylineBody({ x: 2, y: 0.25 }, wire), false);
});

test("boundsFromPoints returns padded finite bounds", () => {
  assert.deepEqual(boundsFromPoints([2, -1, Number.NaN], [4, -3, Infinity], 0.5), {
    x1: -1.5,
    y1: -3.5,
    x2: 2.5,
    y2: 4.5,
  });
});

test("boundsFromPoints returns null without finite points", () => {
  assert.equal(boundsFromPoints([], [], 1), null);
  assert.equal(boundsFromPoints([Number.NaN], [Infinity], 1), null);
});

test("large subcircuit bounds expand to cover all generated pins", () => {
  const subx: CircuitComponent = {
    id: "xlarge",
    kind: "SUBX",
    x: 10,
    y: 20,
    rotation: 0,
    value: "large_block",
    params: { npins: "20" },
  };
  const pins = getPinLayout(subx);
  const bounds = componentBoundsFor(subx);
  const visual = componentVisualBoundsFor(subx);
  const pinYs = pins.map((pin) => subx.y + pin.y);

  assert.equal(pins.length, 20);
  assert.ok(bounds.y2 - bounds.y1 > 5.6);
  assert.ok(visual.y2 - visual.y1 > 5.6);
  assert.ok(Math.min(...pinYs) >= bounds.y1);
  assert.ok(Math.max(...pinYs) <= bounds.y2);
});

test("custom subcircuit bounds expand to the symbol dimensions", () => {
  const subx: CircuitComponent = {
    id: "xcustom",
    kind: "SUBX",
    x: 10,
    y: 20,
    rotation: 0,
    value: "wide_block",
    params: { npins: "6", w: "8", h: "6" },
  };

  const bounds = componentBoundsFor(subx);
  const visual = componentVisualBoundsFor(subx);

  assert.ok(bounds.x1 < 5.3);
  assert.ok(bounds.x2 > 14.7);
  assert.ok(visual.y1 < 17);
  assert.ok(visual.y2 > 23);
});

test("mirrored visual bounds follow asymmetric symbols", () => {
  const opamp: CircuitComponent = {
    id: "op",
    kind: "OPAMP",
    x: 0,
    y: 0,
    rotation: 0,
    value: "OPAMP",
  };

  assert.deepEqual(componentVisualBoundsFor(opamp), { x1: -3, y1: -2.4, x2: 3.4, y2: 2.4 });
  assert.deepEqual(componentVisualBoundsFor({ ...opamp, mirrored: true }), {
    x1: -3.4,
    y1: -2.4,
    x2: 3,
    y2: 2.4,
  });
});
