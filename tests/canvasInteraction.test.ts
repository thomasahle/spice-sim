import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_DRAG_START_THRESHOLD,
  canvasDragDelta,
  canvasDragDeltaAfterThreshold,
  hasActiveCanvasInteraction,
  movedBeyondThreshold,
  pinTargetTone,
  pointerSelectionHit,
  selectPointerIntent,
  selectionClickStartsDrag,
  shouldSuppressOriginalConnectionSnap,
  shouldShowPinTargets,
} from "../src/editor/canvasInteraction.ts";

test("grid snapping applies to drag distance, not the pointer's rounded position", () => {
  const start = { x: 2.31, y: -0.12 };

  assert.deepEqual(canvasDragDelta(start, { x: 2.6, y: 0.2 }, true), { x: 0, y: 0 });
  assert.deepEqual(canvasDragDelta(start, { x: 3.32, y: -1.02 }, true), { x: 1, y: -1 });
});

test("freeform drag preserves sub-grid movement", () => {
  assert.deepEqual(
    canvasDragDelta({ x: -1.125, y: 0.25 }, { x: -0.625, y: 0.875 }, false),
    { x: 0.5, y: 0.625 },
  );
});

test("drag threshold uses raw world movement", () => {
  assert.equal(movedBeyondThreshold({ x: 0, y: 0 }, { x: 0.17, y: 0 }, 0.18), false);
  assert.equal(movedBeyondThreshold({ x: 0, y: 0 }, { x: 0.18, y: 0 }, 0.18), true);
});

test("freeform drag ignores tiny pointer jitter before committing", () => {
  const start = { x: 1.25, y: -2.5 };

  assert.equal(
    canvasDragDeltaAfterThreshold(
      start,
      { x: start.x + CANVAS_DRAG_START_THRESHOLD / 2, y: start.y },
      false,
    ),
    null,
  );
  assert.deepEqual(
    canvasDragDeltaAfterThreshold(
      start,
      { x: start.x + CANVAS_DRAG_START_THRESHOLD, y: start.y + 0.03 },
      false,
    ),
    { x: CANVAS_DRAG_START_THRESHOLD, y: 0.03 },
  );
});

test("wire endpoint drag can detach from its original snapped connection", () => {
  const start = { x: -5, y: 0.5 };
  assert.equal(
    shouldSuppressOriginalConnectionSnap(start, { x: -5, y: 1.45 }, { x: -5, y: 0.5 }),
    true,
  );
  assert.equal(
    shouldSuppressOriginalConnectionSnap(start, { x: -5, y: 0.9 }, { x: -5, y: 0.5 }),
    false,
  );
  assert.equal(
    shouldSuppressOriginalConnectionSnap(start, { x: -5, y: 1.45 }, { x: -5, y: 2.5 }),
    false,
  );
});

test("modifier selection gestures do not arm object drags", () => {
  assert.equal(selectionClickStartsDrag(true), false);
  assert.equal(selectionClickStartsDrag(false), true);
});

test("selection hit priority comes from canvas geometry before DOM fallback", () => {
  const wireHit = { id: "wire-edge", kind: "wire" };
  const componentFallback = { id: "component-wrapper", kind: "component" };

  assert.equal(pointerSelectionHit(wireHit, componentFallback), wireHit);
  assert.equal(pointerSelectionHit(null, componentFallback), componentFallback);
  assert.equal(pointerSelectionHit(null, null), null);
});

test("select intent keeps component body drags separate from terminal drags", () => {
  assert.equal(
    selectPointerIntent({
      additive: false,
      hitKind: "component",
      onConnectionHandle: false,
      onWireVertexHandle: false,
    }),
    "object-selection",
  );
  assert.equal(
    selectPointerIntent({
      additive: false,
      hitKind: "component",
      onConnectionHandle: true,
      onWireVertexHandle: false,
    }),
    "quick-wire",
  );
  assert.equal(
    selectPointerIntent({
      additive: false,
      hitKind: "probe",
      onConnectionHandle: true,
      onWireVertexHandle: false,
    }),
    "object-selection",
  );
});

test("select intent reserves wire reshaping for explicit visible handles", () => {
  assert.equal(
    selectPointerIntent({
      additive: false,
      hitKind: "wire",
      onConnectionHandle: false,
      onWireVertexHandle: true,
    }),
    "wire-vertex-drag",
  );
  assert.equal(
    selectPointerIntent({
      additive: true,
      hitKind: "wire",
      onConnectionHandle: false,
      onWireVertexHandle: true,
    }),
    "object-selection",
  );
});

test("canvas activity detection pauses background work during live gestures", () => {
  assert.equal(hasActiveCanvasInteraction({}), false);
  assert.equal(hasActiveCanvasInteraction({ drag: { committed: false } }), true);
  assert.equal(hasActiveCanvasInteraction({ wireDraft: [[0, 0]] }), true);
  assert.equal(hasActiveCanvasInteraction({ panning: { x: 10, y: 20 } }), true);
});

test("pin targets are visible but neutral while wiring", () => {
  assert.equal(
    pinTargetTone({
      connectionGestureActive: false,
      connectionToolActive: true,
      hovered: false,
      selected: false,
      selectToolActive: false,
    }),
    "subtle",
  );
  assert.equal(
    pinTargetTone({
      connectionGestureActive: false,
      connectionToolActive: true,
      hovered: true,
      selected: false,
      selectToolActive: false,
    }),
    "active",
  );
});

test("pin targets stay quiet until selected or hovered in select mode", () => {
  const idle = {
    connectionGestureActive: false,
    connectionToolActive: false,
    hovered: false,
    selected: false,
    selectToolActive: true,
  };

  assert.equal(shouldShowPinTargets(idle), false);
  assert.equal(
    pinTargetTone({
      ...idle,
      selected: true,
    }),
    "subtle",
  );
});
