import assert from "node:assert/strict";
import test from "node:test";

import {
  fitBoundsToViewport,
  screenToWorldPoint,
  snapWorldPoint,
  zoomAtViewportPoint,
} from "../src/editor/canvasViewport.ts";

test("screen/world conversion has a single source of truth", () => {
  assert.deepEqual(
    screenToWorldPoint(150, 90, { left: 10, top: 20, width: 400, height: 300 }, {
      pan: { x: 100, y: 50 },
      zoom: 2,
      cellPx: 20,
    }),
    { x: 1, y: 0.5 },
  );
});

test("snap is explicit and optional", () => {
  assert.deepEqual(snapWorldPoint({ x: 1.49, y: -2.51 }, true), { x: 1, y: -3 });
  assert.deepEqual(snapWorldPoint({ x: 1.49, y: -2.51 }, false), {
    x: 1.49,
    y: -2.51,
  });
});

test("zooming around a viewport point keeps that point anchored", () => {
  assert.deepEqual(
    zoomAtViewportPoint({ x: 100, y: 80 }, 1, { x: 300, y: 180 }, 2, 0.3, 4),
    {
      zoom: 2,
      pan: { x: -100, y: -20 },
    },
  );
});

test("fit bounds centers content and handles empty canvases", () => {
  assert.deepEqual(
    fitBoundsToViewport({ xs: [], ys: [] }, { width: 800, height: 600 }, 20),
    {
      zoom: 1,
      pan: { x: 400, y: 300 },
    },
  );

  const fitted = fitBoundsToViewport(
    { xs: [-2, 2], ys: [-1, 1] },
    { width: 800, height: 600 },
    20,
  );
  assert.equal(fitted.zoom, 2.2);
  assert.deepEqual(fitted.pan, { x: 400, y: 300 });
});
