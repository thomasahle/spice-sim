import assert from "node:assert/strict";
import test from "node:test";

import { geometryToGraph } from "../src/editor/graphConvert.ts";
import { buildGraphNets } from "../src/editor/graphNetlist.ts";
import { wirePolyline, type SchematicPage } from "../src/editor/graphModel.ts";
import { pinWorldPos } from "../src/editor/model.ts";
import type {
  GeometryComponent,
  GeometryPage,
} from "../src/editor/geometryModel.ts";

function legacy(over: Partial<GeometryPage>): GeometryPage {
  return { id: "main", name: "main", components: [], wires: [], probes: [], ...over };
}
function nodeAt(g: SchematicPage, x: number, y: number): string | undefined {
  return g.nodes.find((n) => Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6)?.id;
}

test("converter collapses a pure bend into a waypoint", () => {
  const g = geometryToGraph(legacy({ wires: [{ id: "w1", points: [[0, 0], [0, 2], [3, 2]] }] }));
  assert.equal(g.wires.length, 1, "one edge");
  assert.deepEqual(g.wires[0].bends, [[0, 2]], "the corner is a bend, not a node");
  assert.ok(nodeAt(g, 0, 0) && nodeAt(g, 3, 2), "endpoints are nodes");
  assert.deepEqual(wirePolyline(g, g.wires[0]), [[0, 0], [0, 2], [3, 2]], "geometry preserved");
});

test("converter splits a T-junction and connects all three ends", () => {
  const g = geometryToGraph(
    legacy({
      wires: [
        { id: "w1", points: [[0, 0], [4, 0]] },
        { id: "w2", points: [[2, 0], [2, 3]] },
      ],
    }),
  );
  assert.equal(g.wires.length, 3, "w1 split into two + w2");
  const nets = buildGraphNets(g);
  const names = [nodeAt(g, 0, 0), nodeAt(g, 4, 0), nodeAt(g, 2, 0), nodeAt(g, 2, 3)].map((id) =>
    nets.netOf.get(id!),
  );
  assert.equal(new Set(names).size, 1, "all four ends are one net");
});

test("a bare crossing does NOT connect (no vertex at the intersection)", () => {
  const g = geometryToGraph(
    legacy({
      wires: [
        { id: "w1", points: [[0, 0], [4, 0]] },
        { id: "w2", points: [[2, -2], [2, 2]] },
      ],
    }),
  );
  assert.equal(g.wires.length, 2, "neither wire is split");
  const nets = buildGraphNets(g);
  assert.notEqual(nets.netOf.get(nodeAt(g, 0, 0)!), nets.netOf.get(nodeAt(g, 2, -2)!));
});

test("a probe on a wire splits it and joins that net", () => {
  const g = geometryToGraph(
    legacy({
      wires: [{ id: "w1", points: [[0, 0], [4, 0]] }],
      probes: [{ id: "pr1", x: 2, y: 0, color: "#f00" }],
    }),
  );
  assert.equal(g.wires.length, 2, "wire split at the probe point");
  assert.equal(g.probes.length, 1);
  const nets = buildGraphNets(g);
  assert.equal(nets.netOf.get(g.probes[0].node), nets.netOf.get(nodeAt(g, 0, 0)!));
});

test("a component pin connects through a wire to a standalone node", () => {
  const r: GeometryComponent = { id: "R1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const p0 = pinWorldPos(r, 0);
  const g = geometryToGraph(
    legacy({ components: [r], wires: [{ id: "w1", points: [[p0.x, p0.y], [7, 7]] }] }),
  );
  const nets = buildGraphNets(g);
  const rPin0 = g.components[0].pins[0];
  assert.equal(nets.netOf.get(rPin0), nets.netOf.get(nodeAt(g, 7, 7)!), "pin0 ↔ far node share a net");
});
