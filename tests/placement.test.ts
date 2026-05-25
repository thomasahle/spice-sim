import assert from "node:assert/strict";
import test from "node:test";

import { componentVisualBoundsFor, wireIntersectsRect } from "../src/editor/geometry.ts";
import { pinWorldPos } from "../src/editor/model.ts";
import {
  componentFromClick,
  componentFromDrag,
  componentFromTerminals,
  connectedInlinePlacementWires,
  connectedPlacementWires,
  moveAttachedWirePoints,
  moveAttachedWirePointsAvoiding,
  moveProbesFromInsertedWireSpan,
  movePointWithAnchoredWire,
  moveWirePointsWithAnchors,
  moveWirePointsWithAnchorsAvoiding,
  placementConnectionWires,
  placementWireCutSpan,
  removeLastWireDraftPoint,
  reshapeDraggedWirePoint,
  reshapeDraggedWirePointAvoiding,
  rotatedContactRoutes,
  rotatedContactRoutesAvoiding,
  routeWireSegment,
  routeWireSegmentAvoiding,
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

test("single-pin placement can drag out a connected ground stub", () => {
  let n = 0;
  const c = componentFromDrag("GND", { x: -2, y: 0 }, { x: -2, y: 2 }, "g1");

  assert.equal(c.x, -2);
  assert.equal(c.y, 2);
  assert.deepEqual(
    placementConnectionWires(c, { x: -2, y: 0 }, { x: -2, y: 2 }, true, false, () => `w${++n}`),
    [{ id: "w1", points: [[-2, 2], [-2, 0]] }],
  );
});

test("single-pin net labels use the same drag-out connected stub behavior", () => {
  let n = 0;
  const c = componentFromDrag("LABEL", { x: 1, y: 0 }, { x: 4, y: 0 }, "label1");

  assert.equal(c.x, 4);
  assert.equal(c.y, 0);
  assert.deepEqual(
    placementConnectionWires(c, { x: 1, y: 0 }, { x: 4, y: 0 }, true, false, () => `w${++n}`),
    [{ id: "w1", points: [[4, 0], [1, 0]] }],
  );
});

test("multi-pin op-amp placement aligns the dragged input and output endpoints", () => {
  const c = componentFromDrag("OPAMP", { x: -3, y: -1 }, { x: 3, y: 0 }, "xop1");

  assert.equal(c.rotation, 0);
  assert.deepEqual(pinWorldPos(c, 0), { x: -3, y: -1 });
  assert.deepEqual(pinWorldPos(c, 2), { x: 3, y: 0 });
  assert.deepEqual(
    placementConnectionWires(c, { x: -3, y: -1 }, { x: 3, y: 0 }, true, false, () => "w"),
    [],
  );
});

test("multi-pin transistor placement aligns drain and source while orienting by drag", () => {
  const c = componentFromDrag("NMOS", { x: 0, y: -2 }, { x: 0, y: 2 }, "m1");

  assert.equal(c.rotation, 0);
  assert.deepEqual(pinWorldPos(c, 0), { x: 0, y: -2 });
  assert.deepEqual(pinWorldPos(c, 2), { x: 0, y: 2 });
});

test("placement connection stubs detour around existing component bodies", () => {
  const ground = componentFromDrag("GND", { x: -2, y: 0 }, { x: 6, y: 0 }, "g1");
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 2,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const wires = placementConnectionWires(
    ground,
    { x: -2, y: 0 },
    { x: 6, y: 0 },
    true,
    false,
    () => "w",
    {
      components: [blocker, ground],
      ignoreComponentIds: new Set([ground.id]),
    },
  );

  assert.equal(wires.length, 1);
  assert.notDeepEqual(wires[0].points, [
    [6, 0],
    [-2, 0],
  ]);
  assert.equal(wireIntersectsRect(wires[0].points, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("note placement uses the drag rectangle as its editable size", () => {
  const c = componentFromDrag("NOTE", { x: 4, y: 3 }, { x: 10, y: 7 }, "note1");

  assert.equal(c.x, 4);
  assert.equal(c.y, 3);
  assert.equal(c.params?.w, "6");
  assert.equal(c.params?.h, "4");
});

test("subcircuit drag placement uses the actual instance pin count", () => {
  const c = componentFromDrag("SUBX", { x: -3, y: 0 }, { x: 3, y: 0 }, "x1", {
    npins: "2",
  });

  assert.equal(c.params?.npins, "2");
  assert.deepEqual(pinWorldPos(c, 0), { x: -3, y: 0 });
  assert.deepEqual(pinWorldPos(c, 1), { x: 3, y: 0 });
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

test("inline insertion falls back to normal stubs when the drag is not collinear", () => {
  let inlineId = 0;
  let normalId = 0;
  const c = componentFromTerminals("R", { x: -5, y: 0 }, { x: -2, y: 0 }, "r1");
  const start = { x: -5, y: 0 };
  const end = { x: -2, y: 1 };

  assert.deepEqual(placementWireCutSpan(c, start, end), { start, end });
  assert.deepEqual(
    placementConnectionWires(c, start, end, true, true, () => `wi${++inlineId}`).map(
      (w) => w.points,
    ),
    placementConnectionWires(c, start, end, true, false, () => `wn${++normalId}`).map(
      (w) => w.points,
    ),
  );
});

test("wire routes are direct when orthogonal routing is disabled", () => {
  assert.deepEqual(routeWireSegment({ x: 0, y: 0 }, { x: 1.25, y: 0.75 }, false), [
    [0, 0],
    [1.25, 0.75],
  ]);
});

test("freeform obstacle-aware routing stays direct when the path is clear", () => {
  assert.deepEqual(
    routeWireSegmentAvoiding(
      { x: 0, y: 0 },
      { x: 3, y: 1.5 },
      false,
      {
        components: [
          { id: "r1", kind: "R", x: 8, y: 8, rotation: 0, value: "1k" },
        ],
      },
    ),
    [
      [0, 0],
      [3, 1.5],
    ],
  );
});

test("freeform obstacle-aware routing can detour around component bodies without forcing right angles", () => {
  const blocker = { id: "r1", kind: "R" as const, x: 3, y: 0, rotation: 0 as const, value: "1k" };
  const route = routeWireSegmentAvoiding(
    { x: 0, y: 0 },
    { x: 7, y: 0 },
    false,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [7, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
  assert.equal(route.some((point, idx) => idx > 0 && point[0] !== route[idx - 1][0] && point[1] !== route[idx - 1][1]), true);
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

test("obstacle-aware wire routing detours around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 3,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = routeWireSegmentAvoiding(
    { x: -2, y: 0 },
    { x: 6, y: 0 },
    true,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [-2, 0],
    [6, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("obstacle-aware wire routing searches a grid around staggered component bodies", () => {
  const blockers = [
    { id: "r1", kind: "R" as const, x: 0, y: 0, rotation: 0 as const, value: "1k" },
    { id: "r2", kind: "R" as const, x: 3, y: -2, rotation: 0 as const, value: "1k" },
    { id: "r3", kind: "R" as const, x: 6, y: 0, rotation: 0 as const, value: "1k" },
  ];
  const route = routeWireSegmentAvoiding(
    { x: -4, y: 0 },
    { x: 10, y: 0 },
    true,
    {
      components: blockers,
      wires: [
        { id: "top-bus", points: [[-4, 2.92], [10, 2.92]] },
      ],
    },
  );

  assert.notDeepEqual(route, [
    [-4, 0],
    [10, 0],
  ]);
  for (const blocker of blockers) {
    assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
  }
  assert.equal(route.some(([x, y]) => x === 3 && y === 2.92), false);
});

test("obstacle-aware wire routing prefers available lanes over crossing existing wires", () => {
  const route = routeWireSegmentAvoiding(
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    true,
    {
      wires: [
        {
          id: "w1",
          points: [
            [2, -1],
            [2, 1],
          ],
        },
      ],
    },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [4, 0],
  ]);
  assert.equal(route.some(([x, y]) => x === 2 && y === 0), false);
});

test("obstacle-aware wire routing avoids incidental contact with existing wire endpoints", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 2,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = routeWireSegmentAvoiding(
    { x: -2, y: 0 },
    { x: 6, y: 0 },
    true,
    {
      components: [blocker],
      wires: [
        {
          id: "existing",
          points: [
            [-2, -1],
            [-2, -3],
          ],
        },
      ],
    },
  );

  assert.equal(route.some(([x, y]) => x === -2 && y === -1), false);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
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

test("orthogonal endpoint drag can detour around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 3,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = reshapeDraggedWirePointAvoiding(
    [
      [0, 0],
      [2, 0],
    ],
    1,
    [6, 0],
    false,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [6, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("freeform endpoint drag stays direct when clear but detours around blockers", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 3,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };

  assert.deepEqual(
    reshapeDraggedWirePointAvoiding(
      [
        [0, 0],
        [2, 0],
      ],
      1,
      [6, 2],
      true,
      {},
    ),
    [
      [0, 0],
      [6, 2],
    ],
  );

  const route = reshapeDraggedWirePointAvoiding(
    [
      [0, 0],
      [2, 0],
    ],
    1,
    [6, 0],
    true,
    { components: [blocker] },
  );

  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
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

test("attached wire movement can reroute around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 3,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = moveAttachedWirePointsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    new Set([1]),
    2,
    0,
    true,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [6, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("attached wire movement avoids crossing existing wires when a lane is available", () => {
  const blocker: [number, number][] = [
    [4, -1],
    [4, 1],
  ];
  const route = moveAttachedWirePointsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    new Set([1]),
    4,
    0,
    true,
    { wires: [{ id: "blocker", points: blocker }] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [8, 0],
  ]);
  assert.equal(wirePathsCrossAwayFromSharedEndpoints(route, blocker), false);
});

test("freeform attached wire movement can reroute around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 3,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = moveAttachedWirePointsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    new Set([1]),
    2,
    0,
    false,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [6, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
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

test("selected wire body movement routes anchored reconnects around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 4,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = moveWirePointsWithAnchorsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    4,
    0,
    { start: true },
    true,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [8, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("selected wire body movement avoids crossing existing wires when reconnecting anchors", () => {
  const blocker: [number, number][] = [
    [4, -1],
    [4, 1],
  ];
  const route = moveWirePointsWithAnchorsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    4,
    0,
    { start: true },
    true,
    { wires: [{ id: "blocker", points: blocker }] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [8, 0],
  ]);
  assert.equal(wirePathsCrossAwayFromSharedEndpoints(route, blocker), false);
});

test("freeform selected wire body movement routes anchored reconnects around component bodies", () => {
  const blocker = {
    id: "r1",
    kind: "R" as const,
    x: 4,
    y: 0,
    rotation: 0 as const,
    value: "1k",
  };
  const route = moveWirePointsWithAnchorsAvoiding(
    [
      [0, 0],
      [4, 0],
    ],
    4,
    0,
    { start: true },
    false,
    { components: [blocker] },
  );

  assert.notDeepEqual(route, [
    [0, 0],
    [8, 0],
  ]);
  assert.equal(wireIntersectsRect(route, componentVisualBoundsFor(blocker, 0.3)), false);
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

test("rotated contact routes can detour around component bodies", () => {
  const blocker = {
    id: "blocker",
    kind: "R" as const,
    x: -4,
    y: -0.5,
    rotation: 0 as const,
    value: "1k",
  };
  const routes = rotatedContactRoutesAvoiding(
    [{ from: { x: -5, y: 0.5 }, to: { x: -3, y: -1.5 } }],
    true,
    { components: [blocker] },
  );

  assert.equal(routes.length, 1);
  assert.equal(wireIntersectsRect(routes[0], componentVisualBoundsFor(blocker, 0.3)), false);
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

function wirePathsCrossAwayFromSharedEndpoints(
  a: [number, number][],
  b: [number, number][],
): boolean {
  for (let ai = 0; ai < a.length - 1; ai++) {
    for (let bi = 0; bi < b.length - 1; bi++) {
      if (segmentsCrossAwayFromSharedEndpoints(a[ai], a[ai + 1], b[bi], b[bi + 1])) {
        return true;
      }
    }
  }
  return false;
}

function segmentsCrossAwayFromSharedEndpoints(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  if (
    sameTuple(a, c) ||
    sameTuple(a, d) ||
    sameTuple(b, c) ||
    sameTuple(b, d)
  ) {
    return false;
  }
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function orientation(
  a: [number, number],
  b: [number, number],
  c: [number, number],
): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function sameTuple(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}
