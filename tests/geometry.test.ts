import assert from "node:assert/strict";
import test from "node:test";

import { boundsFromPoints, pointOnPolylineBody, wireIntersectsRect } from "../src/editor/geometry.ts";

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
