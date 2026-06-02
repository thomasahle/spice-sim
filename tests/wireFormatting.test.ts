import assert from "node:assert/strict";
import test from "node:test";

import { componentVisualBoundsFor, wireIntersectsRect } from "../src/editor/geometry.ts";
import type { CircuitComponent, Probe } from "../src/editor/model.ts";
import {
  autoFormatPolylinePage,
  autoFormatWireStopsForPoints,
  wireIdsForAutoFormatPolyline,
  type FormatPolylinePage,
} from "../src/editor/wireFormatting.ts";

// These exercise the polyline format core directly (the graph entry points just
// project each edge to its polyline and delegate to this core; that graph→legacy
// equivalence is covered by tests/editGeometryGraphParity.test.ts). Fixtures are
// coordinate polylines, matching the projected view the core consumes in
// production.
interface SchematicPage {
  id: string;
  name: string;
  description?: string;
  components: CircuitComponent[];
  wires: { id: string; points: [number, number][] }[];
  probes: Probe[];
}

const formatView = (page: SchematicPage): FormatPolylinePage => ({
  components: page.components,
  probes: page.probes,
  wires: page.wires,
});

// Single-wire adapters mirroring the previous public API on the polyline core.
function autoFormatWireAvoiding(
  wire: { id: string; points: [number, number][] },
  page: SchematicPage,
): { id: string; points: [number, number][] } {
  const formatted = autoFormatPolylinePage(formatView(page), new Set([wire.id]));
  return formatted.wires.find((w) => w.id === wire.id) ?? wire;
}

function autoFormatWiresAvoiding(page: SchematicPage, ids: Set<string>) {
  return autoFormatPolylinePage(formatView(page), ids);
}

function autoFormatWireStops(
  wire: { id: string; points: [number, number][] },
  page: SchematicPage,
): [number, number][] {
  return autoFormatWireStopsForPoints(wire.id, wire.points, formatView(page));
}

function wireIdsForAutoFormat(page: SchematicPage, selection: Set<string>): Set<string> {
  return wireIdsForAutoFormatPolyline(formatView(page), selection);
}

test("autoFormatWireAvoiding removes cosmetic elbow points", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [],
    wires: [
      {
        id: "w1",
        points: [
          [0, 0],
          [0, 3],
          [4, 3],
          [4, 0],
        ],
      },
    ],
    probes: [],
  };

  assert.deepEqual(autoFormatWireAvoiding(page.wires[0], page).points, [
    [0, 0],
    [4, 0],
  ]);
});

test("autoFormatWireAvoiding preserves branch endpoints as route stops", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [],
    wires: [
      {
        id: "main",
        points: [
          [0, 0],
          [0, 2],
          [6, 2],
          [6, 0],
        ],
      },
      { id: "branch", points: [[3, 2], [3, 4]] },
    ],
    probes: [],
  };

  assert.deepEqual(autoFormatWireStops(page.wires[0], page), [
    [0, 0],
    [3, 2],
    [6, 0],
  ]);
  assert.ok(autoFormatWireAvoiding(page.wires[0], page).points.some(([x, y]) => x === 3 && y === 2));
});

test("autoFormatWireAvoiding preserves probes on wire bodies", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [],
    wires: [
      {
        id: "w1",
        points: [
          [0, 0],
          [0, 2],
          [6, 2],
          [6, 0],
        ],
      },
    ],
    probes: [{ id: "p1", x: 4, y: 2, color: "#0a84ff" }],
  };

  assert.deepEqual(autoFormatWireStops(page.wires[0], page), [
    [0, 0],
    [4, 2],
    [6, 0],
  ]);
  assert.ok(autoFormatWireAvoiding(page.wires[0], page).points.some(([x, y]) => x === 4 && y === 2));
});

test("autoFormatWireAvoiding does not promote component pin pass-throughs into junctions", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "r1", kind: "R", x: 0, y: 2, rotation: 0, value: "1k" },
    ],
    wires: [
      {
        id: "w1",
        points: [
          [-4, 2],
          [-4, 4],
          [4, 4],
          [4, 2],
        ],
      },
    ],
    probes: [],
  };

  assert.deepEqual(autoFormatWireStops(page.wires[0], page), [
    [-4, 2],
    [4, 2],
  ]);
  const formatted = autoFormatWireAvoiding(page.wires[0], page);
  assert.equal(formatted.points.some(([x, y]) => x === -2 && y === 2), false);
  assert.equal(formatted.points.some(([x, y]) => x === 2 && y === 2), false);
});

test("autoFormatWireAvoiding reroutes simplified wires around component bodies", () => {
  const blocker = {
    id: "note",
    kind: "NOTE" as const,
    x: 2,
    y: -0.75,
    rotation: 0 as const,
    value: "Obs",
    params: { w: "2", h: "1.5" },
  };
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [blocker],
    wires: [
      {
        id: "w1",
        points: [
          [0, 0],
          [0, 3],
          [8, 3],
          [8, 0],
        ],
      },
    ],
    probes: [],
  };

  const formatted = autoFormatWireAvoiding(page.wires[0], page);
  assert.notDeepEqual(formatted.points, [
    [0, 0],
    [8, 0],
  ]);
  assert.equal(wireIntersectsRect(formatted.points, componentVisualBoundsFor(blocker, 0.3)), false);
});

test("autoFormatWireAvoiding prefers routes that do not cross existing wires", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [],
    wires: [
      {
        id: "target",
        points: [
          [0, 0],
          [0, 2],
          [6, 2],
          [6, 0],
        ],
      },
      {
        id: "existing",
        points: [
          [3, -1],
          [3, 1],
        ],
      },
    ],
    probes: [],
  };

  const formatted = autoFormatWireAvoiding(page.wires[0], page);
  assert.notDeepEqual(formatted.points, [
    [0, 0],
    [6, 0],
  ]);
  assert.equal(wirePathsCrossAwayFromSharedEndpoints(formatted.points, page.wires[1].points), false);
});

test("autoFormatWiresAvoiding rips up selected wires before batch rerouting", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [],
    wires: [
      {
        id: "main",
        points: [
          [0, 0],
          [0, 2],
          [8, 2],
          [8, 0],
        ],
      },
      {
        id: "stale-crossing",
        points: [
          [4, -1],
          [4, 1],
        ],
      },
    ],
    probes: [],
  };

  assert.notDeepEqual(autoFormatWireAvoiding(page.wires[0], page).points, [
    [0, 0],
    [8, 0],
  ]);

  const formatted = autoFormatWiresAvoiding(page, new Set(["main", "stale-crossing"]));
  const main = formatted.wires.find((wire) => wire.id === "main");
  const crossing = formatted.wires.find((wire) => wire.id === "stale-crossing");
  assert.deepEqual(main?.points, [
    [0, 0],
    [8, 0],
  ]);
  assert.ok(crossing);
  assert.equal(wirePathsCrossAwayFromSharedEndpoints(main!.points, crossing!.points), false);
});

test("wireIdsForAutoFormat includes selected wires, attached components, and attached probes", () => {
  const page: SchematicPage = {
    id: "page",
    name: "main",
    description: "",
    components: [
      { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
      { id: "r2", kind: "R", x: 8, y: 0, rotation: 0, value: "1k" },
    ],
    wires: [
      { id: "w-left", points: [[-2, 0], [2, 0]] },
      { id: "w-right", points: [[6, 0], [10, 0]] },
      { id: "w-floating", points: [[0, 3], [2, 3]] },
    ],
    probes: [
      { id: "p-left", x: 1, y: 0, color: "#0a84ff" },
      { id: "p-floating", x: 1, y: 3, color: "#ff9f0a" },
    ],
  };

  assert.deepEqual([...wireIdsForAutoFormat(page, new Set())].sort(), [
    "w-floating",
    "w-left",
    "w-right",
  ]);
  assert.deepEqual([...wireIdsForAutoFormat(page, new Set(["w-right"]))], ["w-right"]);
  assert.deepEqual([...wireIdsForAutoFormat(page, new Set(["r1"]))], ["w-left"]);
  assert.deepEqual([...wireIdsForAutoFormat(page, new Set(["p-floating"]))], ["w-floating"]);
  assert.deepEqual([...wireIdsForAutoFormat(page, new Set(["r2", "p-left"]))].sort(), [
    "w-left",
    "w-right",
  ]);
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
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function sameTuple(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}
