import assert from "node:assert/strict";
import test from "node:test";

import {
  hitWireVertexAt,
  nearestConnectionTarget,
  selectableHitAt,
  wireVertexDragHitAt,
} from "../src/editor/canvasHitTest.ts";
import type { SchematicPage } from "../src/editor/model.ts";

const page: SchematicPage = {
  id: "p",
  name: "main",
  components: [
    { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
    { id: "r2", kind: "R", x: 0, y: 3, rotation: 0, value: "1k" },
  ],
  wires: [
    {
      id: "w1",
      points: [
        [-2, 0],
        [-2, 3],
      ],
    },
  ],
  probes: [{ id: "p1", x: -2, y: 0, color: "#0a84ff" }],
};

test("hit testing uses raw pointer coordinates rather than rounded grid positions", () => {
  assert.equal(selectableHitAt(page, 0, 0.45)?.item.id, "r1");
  assert.equal(selectableHitAt(page, 0, 0.85), null);
});

test("component hit boxes track the visible glyph instead of a broad generic rectangle", () => {
  assert.equal(selectableHitAt(page, 0, 0.78)?.item.id, "r1");
  assert.equal(selectableHitAt(page, 0, 1.1), null);
});

test("wire bodies win over loose component edge padding", () => {
  const edgeOverlapPage: SchematicPage = {
    ...page,
    wires: [{ id: "edge-wire", points: [[-1.5, 0.78], [1.5, 0.78]] }],
    probes: [],
  };

  assert.deepEqual(selectableHitAt(edgeOverlapPage, 0, 0.78), {
    kind: "wire",
    item: edgeOverlapPage.wires[0],
  });
});

test("direct probe clicks win at pins, component body clicks still select the component", () => {
  assert.deepEqual(selectableHitAt(page, -2, 0), {
    kind: "probe",
    item: page.probes[0],
  });
  assert.deepEqual(selectableHitAt(page, 0, 0), {
    kind: "component",
    item: page.components[0],
  });
});

test("wire vertex grabs are stable and independent from selectable hit priority", () => {
  assert.deepEqual(hitWireVertexAt(page, -2.1, 0.1), { wireId: "w1", idx: 0 });
  assert.equal(hitWireVertexAt(page, -2.6, 0), null);
});

test("wire vertex drags do not steal direct probe clicks", () => {
  assert.deepEqual(hitWireVertexAt(page, -2, 0), { wireId: "w1", idx: 0 });
  assert.equal(wireVertexDragHitAt(page, -2, 0), null);
  assert.equal(wireVertexDragHitAt(page, -2, 3), null);
  assert.deepEqual(wireVertexDragHitAt(page, -2, 3, 0.45, { handleVisible: true }), { wireId: "w1", idx: 1 });
  assert.equal(wireVertexDragHitAt(page, -2, 0, 0.45, { handleVisible: true }), null);
});

test("hidden wire vertices do not steal component pin clicks", () => {
  const pageWithoutProbe: SchematicPage = { ...page, probes: [] };
  assert.deepEqual(selectableHitAt(pageWithoutProbe, -2, 0), {
    kind: "component",
    item: page.components[0],
  });
  assert.deepEqual(hitWireVertexAt(pageWithoutProbe, -2, 0), { wireId: "w1", idx: 0 });
  assert.equal(wireVertexDragHitAt(pageWithoutProbe, -2, 0), null);
  assert.deepEqual(wireVertexDragHitAt(pageWithoutProbe, -2, 0, 0.45, { handleVisible: true }), {
    wireId: "w1",
    idx: 0,
  });
});

test("connection snapping can project onto wire segments and then apply the active snap rule", () => {
  assert.deepEqual(
    nearestConnectionTarget(page, -2.2, 1.24, 1, {
      includeSegments: true,
      snapPoint: (point) => ({ x: Math.round(point.x), y: Math.round(point.y) }),
    }),
    { x: -2, y: 1, wireId: "w1", segmentIdx: 0 },
  );
  assert.deepEqual(
    nearestConnectionTarget(page, -2.2, 1.24, 1, {
      includeSegments: true,
      snapPoint: (point) => point,
    }),
    { x: -2, y: 1.24, wireId: "w1", segmentIdx: 0 },
  );
});

test("connection snapping can ignore wire bodies while still finding terminals", () => {
  assert.equal(
    nearestConnectionTarget(page, -2, 1.2, 0.48, {
      includeSegments: false,
      wirePointRadius: 0.48,
      pinRadius: 0.48,
    }),
    null,
  );
  assert.deepEqual(
    nearestConnectionTarget(page, 2, 0, 0.48, {
      includeSegments: false,
      wirePointRadius: 0.48,
      pinRadius: 0.48,
    }),
    { x: 2, y: 0 },
  );
});

test("connection snapping does not snap a projected point off its wire segment", () => {
  const halfGridWirePage: SchematicPage = {
    ...page,
    wires: [
      {
        id: "half-grid-wire",
        points: [
          [-1.5, 0.5],
          [1, 0.5],
        ],
      },
    ],
  };

  assert.deepEqual(
    nearestConnectionTarget(halfGridWirePage, 0.1, 0.49, 1, {
      includeSegments: true,
      snapPoint: (point) => ({ x: Math.round(point.x), y: Math.round(point.y) }),
    }),
    { x: 0, y: 0.5, wireId: "half-grid-wire", segmentIdx: 0 },
  );
});

test("connection snapping keeps vertical off-grid wire targets on the wire", () => {
  const verticalWirePage: SchematicPage = {
    ...page,
    wires: [
      {
        id: "vertical-wire",
        points: [
          [0.5, -1.5],
          [0.5, 1.5],
        ],
      },
    ],
  };

  assert.deepEqual(
    nearestConnectionTarget(verticalWirePage, 0.49, 0.2, 1, {
      includeSegments: true,
      snapPoint: (point) => ({ x: Math.round(point.x), y: Math.round(point.y) }),
    }),
    { x: 0.5, y: 0, wireId: "vertical-wire", segmentIdx: 0 },
  );
});
