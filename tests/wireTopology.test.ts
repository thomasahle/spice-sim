import assert from "node:assert/strict";
import test from "node:test";

import {
  cutWireSegmentBetweenPoints,
  dedupeWirePointsPreservingJunctions,
  insertWireEndpointJunctions,
  normalizeWireListPreservingJunctions,
  wirePathCoveredByWires,
} from "../src/editor/wireTopology.ts";
import type { Wire } from "../src/editor/model.ts";

test("wire insertion keeps two junctions on the same existing segment", () => {
  const wires: Wire[] = [{ id: "bus", points: [[0, 0], [10, 0]] }];

  assert.deepEqual(insertWireEndpointJunctions(wires, [[8, 0], [2, 0]]), [
    { id: "bus", points: [[0, 0], [2, 0], [8, 0], [10, 0]] },
  ]);
});

test("wire insertion keeps junctions on different segments of one wire", () => {
  const wires: Wire[] = [{ id: "elbow", points: [[0, 0], [10, 0], [10, 10]] }];

  assert.deepEqual(insertWireEndpointJunctions(wires, [[8, 0], [10, 6]]), [
    { id: "elbow", points: [[0, 0], [8, 0], [10, 0], [10, 6], [10, 10]] },
  ]);
});

test("wire insertion ignores existing vertices and duplicate endpoints", () => {
  const wires: Wire[] = [{ id: "bus", points: [[0, 0], [5, 0], [10, 0]] }];

  assert.deepEqual(insertWireEndpointJunctions(wires, [[5, 0], [7, 0], [7, 0]]), [
    { id: "bus", points: [[0, 0], [5, 0], [7, 0], [10, 0]] },
  ]);
});

test("wire normalization preserves explicit collinear junction vertices", () => {
  const wires: Wire[] = [{ id: "bus", points: [[0, 0], [2, 0], [8, 0], [10, 0]] }];

  assert.deepEqual(normalizeWireListPreservingJunctions(wires), wires);
});

test("wire point dedupe preserves explicit collinear junction vertices", () => {
  assert.deepEqual(
    dedupeWirePointsPreservingJunctions([
      [0, 0],
      [2, 0],
      [2, 0],
      [8, 0],
      [10, 0],
    ]),
    [
      [0, 0],
      [2, 0],
      [8, 0],
      [10, 0],
    ],
  );
});

test("wire cutting removes the span where an inline component is inserted", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-4, 0], [4, 0]] }];
  let nextId = 0;

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [-2, 0], [2, 0], () => `cut-${++nextId}`), [
    { id: "bus", points: [[-4, 0], [-2, 0]] },
    { id: "cut-1", points: [[2, 0], [4, 0]] },
  ]);
});

test("wire cutting handles reversed inline component endpoints", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-4, 0], [4, 0]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [2, 0], [-2, 0], () => "cut"), [
    { id: "bus", points: [[-4, 0], [-2, 0]] },
    { id: "cut", points: [[2, 0], [4, 0]] },
  ]);
});

test("wire cutting preserves surrounding polyline vertices", () => {
  const wires: Wire[] = [{ id: "elbow", points: [[-4, 0], [-2, 0], [4, 0], [4, 2]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [-1, 0], [2, 0], () => "cut"), [
    { id: "elbow", points: [[-4, 0], [-2, 0], [-1, 0]] },
    { id: "cut", points: [[2, 0], [4, 0], [4, 2]] },
  ]);
});

test("wire cutting can span explicit collinear junction vertices", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-8, 0], [-6, 0], [-4, 0], [-2, 0]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [-7, 0], [-3, 0], () => "cut"), [
    { id: "bus", points: [[-8, 0], [-7, 0]] },
    { id: "cut", points: [[-3, 0], [-2, 0]] },
  ]);
});

test("wire cutting preserves the original id when cutting from the wire start", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-8, 0], [-6, 0], [-4, 0], [-2, 0]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [-8, 0], [-3, 0], () => "cut"), [
    { id: "bus", points: [[-3, 0], [-2, 0]] },
  ]);
});

test("wire cutting refuses to cut across a bend", () => {
  const wires: Wire[] = [{ id: "elbow", points: [[0, 0], [2, 0], [2, 2]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [1, 0], [2, 1], () => "cut"), wires);
});

test("wire cutting leaves unrelated wires alone", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-4, 0], [4, 0]] }];

  assert.deepEqual(cutWireSegmentBetweenPoints(wires, [-2, 1], [2, 1], () => "cut"), wires);
});

test("wire normalization still removes geometrically duplicate wires", () => {
  const wires: Wire[] = [
    { id: "bus", points: [[0, 0], [2, 0], [8, 0], [10, 0]] },
    { id: "dup", points: [[10, 0], [0, 0]] },
  ];

  assert.deepEqual(normalizeWireListPreservingJunctions(wires), [
    { id: "bus", points: [[0, 0], [2, 0], [8, 0], [10, 0]] },
  ]);
});

test("covered wire paths are recognized across existing junction vertices", () => {
  const wires: Wire[] = [{ id: "bus", points: [[-2, 0], [-1, 0], [0, 0], [1, 0]] }];

  assert.equal(wirePathCoveredByWires([[-1, 0], [0, 0]], wires), true);
  assert.equal(wirePathCoveredByWires([[-1, 0], [0, 1]], wires), false);
});
