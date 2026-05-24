import assert from "node:assert/strict";
import test from "node:test";

import { pinWorldPos } from "../src/editor/model.ts";
import {
  componentFromClick,
  componentFromTerminals,
  connectedInlinePlacementWires,
  connectedPlacementWires,
  moveAttachedWirePoints,
  moveProbesFromInsertedWireSpan,
  movePointWithAnchoredWire,
  moveWirePointsWithAnchors,
  placementConnectionWires,
  placementWireCutSpan,
  removeLastWireDraftPoint,
  reshapeDraggedWirePoint,
  rotatedContactRoutes,
  routeWireSegment,
  translatedContactRoutes,
} from "../src/editor/placement.ts";

test("two-terminal placement puts canonical resistor pins on dragged endpoints", () => {
  const c = componentFromTerminals("R", { x: -4, y: 0 }, { x: 0, y: 0 }, "r1");

  assert.equal(c.x, -2);
  assert.equal(c.y, 0);
  assert.equal(c.rotation, 0);
  assert.deepEqual(pinWorldPos(c, 0), { x: -4, y: 0 });
  assert.deepEqual(pinWorldPos(c, 1), { x: 0, y: 0 });
  assert.deepEqual(
    connectedPlacementWires(c, { x: -4, y: 0 }, { x: 0, y: 0 }, true, () => "w"),
    [],
  );
});

test("two-terminal click placement creates a default symbol centered on the click", () => {
  const r = componentFromClick("R", { x: -3, y: 1 }, "r1");
  const c = componentFromClick("C", { x: 2, y: -1 }, "c1");

  assert.equal(r.x, -3);
  assert.equal(r.y, 1);
  assert.equal(r.rotation, 0);
  assert.deepEqual(pinWorldPos(r, 0), { x: -5, y: 1 });
  assert.deepEqual(pinWorldPos(r, 1), { x: -1, y: 1 });

  assert.equal(c.x, 2);
  assert.equal(c.y, -1);
  assert.equal(c.rotation, 0);
  assert.deepEqual(pinWorldPos(c, 0), { x: 2, y: -3 });
  assert.deepEqual(pinWorldPos(c, 1), { x: 2, y: 1 });
});

test("two-terminal placement puts canonical vertical capacitor pins on dragged endpoints", () => {
  const c = componentFromTerminals("C", { x: 2, y: -3 }, { x: 2, y: 1 }, "c1");

  assert.equal(c.x, 2);
  assert.equal(c.y, -1);
  assert.equal(c.rotation, 0);
  assert.deepEqual(pinWorldPos(c, 0), { x: 2, y: -3 });
  assert.deepEqual(pinWorldPos(c, 1), { x: 2, y: 1 });
});

test("short two-terminal drags get symmetric endpoint stubs instead of one-sided overhangs", () => {
  let n = 0;
  const c = componentFromTerminals("D", { x: -3, y: 0 }, { x: -1, y: 0 }, "d1");
  const wires = connectedPlacementWires(
    c,
    { x: -3, y: 0 },
    { x: -1, y: 0 },
    true,
    () => `w${++n}`,
  );

  assert.equal(c.x, -2);
  assert.equal(c.y, 0);
  assert.equal(c.rotation, 270);
  assert.deepEqual(pinWorldPos(c, 0), { x: -4, y: 0 });
  assert.deepEqual(pinWorldPos(c, 1), { x: 0, y: 0 });
  assert.deepEqual(wires.map((w) => w.points), [
    [
      [-4, 0],
      [-3, 0],
    ],
    [
      [0, 0],
      [-1, 0],
    ],
  ]);
});

test("inline insertion cuts across actual pins for short drags", () => {
  const c = componentFromTerminals("R", { x: -5, y: 0 }, { x: -2, y: 0 }, "r1");

  assert.deepEqual(pinWorldPos(c, 0), { x: -5.5, y: 0 });
  assert.deepEqual(pinWorldPos(c, 1), { x: -1.5, y: 0 });
  assert.deepEqual(placementWireCutSpan(c, { x: -5, y: 0 }, { x: -2, y: 0 }), {
    start: { x: -5.5, y: 0 },
    end: { x: -1.5, y: 0 },
  });
});

test("inline insertion suppresses inward stubs for short drags", () => {
  const c = componentFromTerminals("R", { x: -5, y: 0 }, { x: -2, y: 0 }, "r1");

  assert.deepEqual(
    connectedInlinePlacementWires(c, { x: -5, y: 0 }, { x: -2, y: 0 }, true, () => "w"),
    [],
  );
});

test("placement preview uses inline insertion stubs when cutting an existing wire", () => {
  const c = componentFromTerminals("R", { x: -5, y: 0 }, { x: -2, y: 0 }, "r1");

  assert.deepEqual(
    placementConnectionWires(c, { x: -5, y: 0 }, { x: -2, y: 0 }, true, true, () => "w"),
    [],
  );
  assert.deepEqual(
    placementConnectionWires(c, { x: -5, y: 0 }, { x: -2, y: 0 }, true, false, () => "w"),
    [
      { id: "w", points: [[-5.5, 0], [-5, 0]] },
      { id: "w", points: [[-1.5, 0], [-2, 0]] },
    ],
  );
});

test("inline insertion moves probes from the consumed span to the nearest terminal", () => {
  const c = componentFromTerminals("R", { x: -6, y: 0 }, { x: -2, y: 0 }, "r1");

  assert.deepEqual(
    moveProbesFromInsertedWireSpan(
      [
        { id: "mid", x: -4, y: 0, color: "#0a84ff", label: "Mid" },
        { id: "end", x: -2, y: 0, color: "#30d158", label: "End" },
        { id: "outside", x: -1, y: 0, color: "#ff453a", label: "Outside" },
      ],
      c,
      placementWireCutSpan(c, { x: -6, y: 0 }, { x: -2, y: 0 }),
      [],
    ),
    [
      { id: "mid", x: -6, y: 0, color: "#0a84ff", label: "Mid" },
      { id: "end", x: -2, y: 0, color: "#30d158", label: "End" },
      { id: "outside", x: -1, y: 0, color: "#ff453a", label: "Outside" },
    ],
  );
});

test("inline insertion keeps probes that still land on generated connection stubs", () => {
  let n = 0;
  const c = componentFromTerminals("R", { x: -6, y: 0 }, { x: 0, y: 0 }, "r1");
  const stubs = connectedInlinePlacementWires(
    c,
    { x: -6, y: 0 },
    { x: 0, y: 0 },
    true,
    () => `w${++n}`,
  );

  assert.deepEqual(
    moveProbesFromInsertedWireSpan(
      [
        { id: "stub", x: -5.5, y: 0, color: "#0a84ff", label: "Stub" },
        { id: "body", x: -3, y: 0, color: "#30d158", label: "Body" },
      ],
      c,
      placementWireCutSpan(c, { x: -6, y: 0 }, { x: 0, y: 0 }),
      stubs,
    ),
    [
      { id: "stub", x: -5.5, y: 0, color: "#0a84ff", label: "Stub" },
      { id: "body", x: -5, y: 0, color: "#30d158", label: "Body" },
    ],
  );
});

test("inline insertion keeps outward stubs for long drags", () => {
  let n = 0;
  const c = componentFromTerminals("R", { x: -6, y: 0 }, { x: 0, y: 0 }, "r1");

  assert.deepEqual(placementWireCutSpan(c, { x: -6, y: 0 }, { x: 0, y: 0 }), {
    start: { x: -6, y: 0 },
    end: { x: 0, y: 0 },
  });
  assert.deepEqual(
    connectedInlinePlacementWires(c, { x: -6, y: 0 }, { x: 0, y: 0 }, true, () => `w${++n}`),
    [
      { id: "w1", points: [[-5, 0], [-6, 0]] },
      { id: "w2", points: [[-1, 0], [0, 0]] },
    ],
  );
});

test("wire routes are direct when orthogonal routing is disabled", () => {
  assert.deepEqual(routeWireSegment({ x: 0, y: 0 }, { x: 1.25, y: 0.75 }, false), [
    [0, 0],
    [1.25, 0.75],
  ]);
});

test("wire routing removes redundant points on the same straight run", () => {
  assert.deepEqual(routeWireSegment({ x: 0, y: 0 }, { x: 2, y: 0 }, true), [
    [0, 0],
    [2, 0],
  ]);
  assert.deepEqual(
    reshapeDraggedWirePoint(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      1,
      [1.5, 0],
      false,
    ),
    [
      [0, 0],
      [2, 0],
    ],
  );
});

test("freeform endpoint drag collapses simple elbow wires to a direct segment", () => {
  assert.deepEqual(
    reshapeDraggedWirePoint(
      [
        [0, 0],
        [2, 0],
        [2, 2],
      ],
      2,
      [3.2, 1.4],
      true,
    ),
    [
      [0, 0],
      [3.2, 1.4],
    ],
  );
});

test("orthogonal endpoint drag reroutes through an elbow", () => {
  assert.deepEqual(
    reshapeDraggedWirePoint(
      [
        [0, 0],
        [2, 0],
        [2, 2],
      ],
      2,
      [3, 1],
      false,
    ),
    [
      [0, 0],
      [3, 0],
      [3, 1],
    ],
  );
});

test("orthogonal endpoint drag on a two-point wire creates an elbow", () => {
  assert.deepEqual(
    reshapeDraggedWirePoint(
      [
        [0, 0],
        [2, 0],
      ],
      1,
      [3, 1],
      false,
    ),
    [
      [0, 0],
      [3, 0],
      [3, 1],
    ],
  );
});

test("attached wire movement follows freeform routing when grid snapping is off", () => {
  assert.deepEqual(
    moveAttachedWirePoints(
      [
        [0, 0],
        [2, 0],
      ],
      new Set([1]),
      0.5,
      0.75,
      false,
    ),
    [
      [0, 0],
      [2.5, 0.75],
    ],
  );
});

test("attached wire movement keeps orthogonal elbows when grid snapping is on", () => {
  assert.deepEqual(
    moveAttachedWirePoints(
      [
        [0, 0],
        [2, 0],
      ],
      new Set([1]),
      1,
      1,
      true,
    ),
    [
      [0, 0],
      [3, 0],
      [3, 1],
    ],
  );
});

test("attached endpoint movement preserves orthogonal multi-point wire structure", () => {
  assert.deepEqual(
    moveAttachedWirePoints(
      [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
      new Set([0]),
      0,
      1,
      true,
    ),
    [
      [0, 1],
      [2, 1],
      [2, 0],
      [4, 0],
    ],
  );
});

test("attached endpoint movement preserves the fixed bus when grid snapping is off", () => {
  assert.deepEqual(
    moveAttachedWirePoints(
      [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
      new Set([0]),
      0.5,
      0.75,
      false,
    ),
    [
      [0.5, 0.75],
      [2, 0],
      [4, 0],
    ],
  );
});

test("attached wire movement preserves explicit collinear junction vertices", () => {
  assert.deepEqual(
    moveAttachedWirePoints(
      [
        [-2, 0],
        [-1, 0],
        [0, 0],
        [1, 0],
      ],
      new Set([0]),
      1,
      0,
      true,
    ),
    [
      [-1, 0],
      [0, 0],
      [1, 0],
    ],
  );
});

test("selected wire body movement keeps anchored endpoints connected", () => {
  assert.deepEqual(
    moveWirePointsWithAnchors(
      [
        [0, 0],
        [4, 0],
      ],
      0,
      1,
      { start: true, end: true },
      true,
    ),
    [
      [0, 0],
      [0, 1],
      [4, 1],
      [4, 0],
    ],
  );

  assert.deepEqual(
    moveWirePointsWithAnchors(
      [
        [0, 0],
        [4, 0],
      ],
      0.5,
      0.75,
      { start: true, end: true },
      false,
    ),
    [
      [0, 0],
      [0.5, 0.75],
      [4.5, 0.75],
      [4, 0],
    ],
  );
});

test("selected wire body movement can keep one stationary endpoint anchored", () => {
  assert.deepEqual(
    moveWirePointsWithAnchors(
      [
        [0, 0],
        [3, 0],
      ],
      0,
      1,
      { start: true },
      true,
    ),
    [
      [0, 0],
      [3, 0],
      [3, 1],
    ],
  );
});

test("probe points on anchored wire endpoints stay put while body probes move", () => {
  const wire: [number, number][] = [
    [0, 0],
    [4, 0],
  ];

  assert.deepEqual(
    movePointWithAnchoredWire({ x: 0, y: 0 }, wire, 0, 1, { start: true, end: true }),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    movePointWithAnchoredWire({ x: 2, y: 0 }, wire, 0, 1, { start: true, end: true }),
    { x: 2, y: 1 },
  );
});

test("translated contact routes preview preserved segment contacts", () => {
  assert.deepEqual(
    translatedContactRoutes(
      [{ componentId: "r1", pinIdx: 0, from: { x: 1, y: 1 } }],
      2,
      1,
      true,
    ),
    [
      [
        [1, 1],
        [3, 1],
        [3, 2],
      ],
    ],
  );

  assert.deepEqual(
    translatedContactRoutes(
      [{ componentId: "r1", pinIdx: 0, from: { x: 1, y: 1 } }],
      0.4,
      0.25,
      false,
    ),
    [
      [
        [1, 1],
        [1.4, 1.25],
      ],
    ],
  );
});

test("rotated contact routes avoid shared center elbows", () => {
  assert.deepEqual(
    rotatedContactRoutes(
      [
        { from: { x: -5, y: 0.5 }, to: { x: -3, y: -1.5 } },
        { from: { x: -1, y: 0.5 }, to: { x: -3, y: 2.5 } },
      ],
      true,
    ),
    [
      [
        [-5, 0.5],
        [-5, -1.5],
        [-3, -1.5],
      ],
      [
        [-1, 0.5],
        [-1, 2.5],
        [-3, 2.5],
      ],
    ],
  );
});

test("rotated contact routes avoid shared center elbows in the reverse direction", () => {
  assert.deepEqual(
    rotatedContactRoutes(
      [
        { from: { x: -3, y: -1.5 }, to: { x: -5, y: 0.5 } },
        { from: { x: -3, y: 2.5 }, to: { x: -1, y: 0.5 } },
      ],
      true,
    ),
    [
      [
        [-3, -1.5],
        [-5, -1.5],
        [-5, 0.5],
      ],
      [
        [-3, 2.5],
        [-1, 2.5],
        [-1, 0.5],
      ],
    ],
  );
});

test("wire draft backspace removes the last point and cancels a single-point draft", () => {
  assert.deepEqual(
    removeLastWireDraftPoint([
      [0, 0],
      [2, 0],
      [2, 2],
    ]),
    [
      [0, 0],
      [2, 0],
    ],
  );

  assert.equal(removeLastWireDraftPoint([[0, 0]]), null);
  assert.equal(removeLastWireDraftPoint(null), null);
});
