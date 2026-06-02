// Behavior-preservation gate for the legacy(polyline) → Model-C(graph) port of
// the editing-helper + coupled-reader cluster: wireFormatting, dragMath
// (wireEndpointAnchors), canvasHitTest, and wireGeometry.buildWireJunctionDots.
//
// Each converted helper now reads wire geometry from the graph (wirePolyline)
// instead of `wire.points`. In production it runs on the editor's graph page;
// the pre-conversion code ran on `graphToLegacyPage(graphPage)` (the legacy
// projection of the same page). So the behavior-preservation reference is the
// *pre-conversion* (polyline) algorithm applied to that legacy projection. This
// test rebuilds each demo, converts with legacyDocToGraph, runs the now-graph
// helpers on the graph page, and asserts identical output against a frozen copy
// of the pre-conversion polyline algorithm fed graphToLegacyPage(graphPage).
//
// The frozen references use the SAME geometry primitives as production (imported
// from geometry.ts), so they differ from the converted code only in reading
// `wire.points` directly vs resolving polylines from the graph — which is exactly
// the property under test.

import assert from "node:assert/strict";
import test from "node:test";

import { DEMOS } from "../src/editor/demos.ts";
import { graphToLegacyPage, legacyDocToGraph } from "../src/editor/graphConvert.ts";
import {
  autoFormatPolylinePage,
  autoFormatWiresAvoiding,
  wireIdsForAutoFormat,
  wireIdsForAutoFormatPolyline,
} from "../src/editor/wireFormatting.ts";
import { wireEndpointAnchors } from "../src/editor/dragMath.ts";
import {
  nearestConnectionTarget,
  selectableHitAt,
} from "../src/editor/canvasHitTest.ts";
import { buildWireJunctionDots } from "../src/editor/wireGeometry.ts";
import { getPinLayout, pinWorldPos } from "../src/editor/model.ts";
import {
  componentVisualBoundsFor,
  normalizePoint,
  pointOnSegment,
  pointToSegmentDist,
  projectPointToSegment,
  samePoint,
} from "../src/editor/geometry.ts";
import type { CircuitComponent } from "../src/editor/model.ts";
import type { LegacySchematicPage, LegacyWire } from "../src/editor/legacyModel.ts";

function sameTup(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

// Frozen pre-conversion wireGeometry.buildWireJunctionDots: the OLD
// coincidence-degree rule (every segment endpoint +1, every interior crossing
// +2, dot where degree ≥ 3). The graph rule (degree-≥3 node) must be a SUBSET of
// this — it never invents a dot — and any legacy dot the graph omits must be a
// pure routing crossover (a wire bend lying on another wire's body, where no
// wire actually ENDS), which Model C correctly does not solder. See
// `isPureCrossover` and the divergence note in the report.
function legacyJunctionDots(page: LegacySchematicPage): { x: number; y: number }[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const counts = new Map<string, { x: number; y: number; degree: number }>();
  const add = (x: number, y: number, degree = 1) => {
    const k = key(x, y);
    const cur = counts.get(k);
    if (cur) cur.degree += degree;
    else counts.set(k, { x, y, degree });
  };
  for (const wire of page.wires) {
    for (let idx = 0; idx < wire.points.length - 1; idx++) {
      for (const [x, y] of [wire.points[idx], wire.points[idx + 1]]) add(x, y);
    }
  }
  const seen = new Set<string>();
  const vertices: [number, number][] = [];
  for (const wire of page.wires) {
    for (const [x, y] of wire.points) {
      const k = key(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      vertices.push([x, y]);
    }
  }
  for (const candidate of vertices) {
    for (const wire of page.wires) {
      for (let idx = 0; idx < wire.points.length - 1; idx++) {
        const a = wire.points[idx];
        const b = wire.points[idx + 1];
        if (sameTup(candidate, a) || sameTup(candidate, b)) continue;
        if (pointOnSegment(candidate[0], candidate[1], a[0], a[1], b[0], b[1])) {
          add(candidate[0], candidate[1], 2);
        }
      }
    }
  }
  return [...counts.values()].filter((p) => p.degree >= 3).map(({ x, y }) => ({ x, y }));
}

/** Is (x,y) a pure routing crossover — no wire ENDS there (it's only an interior
 *  bend / pass-through of one or more wires)? Model C does not solder these. */
function isPureCrossover(page: LegacySchematicPage, x: number, y: number): boolean {
  for (const wire of page.wires) {
    if (wire.points.length < 2) continue;
    const first = wire.points[0];
    const last = wire.points[wire.points.length - 1];
    if (sameTup([x, y], first) || sameTup([x, y], last)) return false; // a wire ends here
  }
  // Also not a component pin (pins are nodes too).
  for (const c of page.components) {
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      if (Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6) return false;
    }
  }
  return true;
}

// ── Frozen pre-conversion dragMath.wireEndpointAnchors ────────────────────────
function legacyPointTouchesWirePath(point: { x: number; y: number }, wire: LegacyWire): boolean {
  if (wire.points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const [x1, y1] = wire.points[i];
    const [x2, y2] = wire.points[i + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}
function legacyStationaryConnection(
  point: { x: number; y: number },
  currentWireId: string,
  page: LegacySchematicPage,
  selected: Set<string>,
): boolean {
  for (const component of page.components) {
    if (selected.has(component.id)) continue;
    for (let idx = 0; idx < getPinLayout(component).length; idx++) {
      if (samePoint(pinWorldPos(component, idx), point)) return true;
    }
  }
  for (const wire of page.wires) {
    if (wire.id === currentWireId || selected.has(wire.id)) continue;
    if (legacyPointTouchesWirePath(point, wire)) return true;
  }
  return false;
}
function legacyWireEndpointAnchors(
  wire: LegacyWire,
  page: LegacySchematicPage,
  selected: Set<string>,
): { start?: boolean; end?: boolean } {
  if (wire.points.length < 2) return {};
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  return {
    start: legacyStationaryConnection({ x: first[0], y: first[1] }, wire.id, page, selected),
    end: legacyStationaryConnection({ x: last[0], y: last[1] }, wire.id, page, selected),
  };
}

// ── Frozen pre-conversion canvasHitTest (selectable-at + connection snap) ──────
function hitProbe(page: LegacySchematicPage, gx: number, gy: number, r: number) {
  for (let i = page.probes.length - 1; i >= 0; i--) {
    const p = page.probes[i];
    if ((gx - p.x) ** 2 + (gy - p.y) ** 2 <= r * r) return p;
  }
  return null;
}
function hitComponent(page: LegacySchematicPage, gx: number, gy: number) {
  for (let i = page.components.length - 1; i >= 0; i--) {
    const c = page.components[i];
    const b = componentVisualBoundsFor(c, 0.2);
    if (gx >= b.x1 && gx <= b.x2 && gy >= b.y1 && gy <= b.y2) return c;
  }
  return null;
}
function hitComponentCore(c: CircuitComponent, gx: number, gy: number): boolean {
  const b = componentVisualBoundsFor(c, 0);
  const inset = Math.min(0.55, Math.max(0.18, Math.min(b.x2 - b.x1, b.y2 - b.y1) * 0.18));
  return gx >= b.x1 + inset && gx <= b.x2 - inset && gy >= b.y1 + inset && gy <= b.y2 - inset;
}
function hitWire(page: LegacySchematicPage, gx: number, gy: number, r: number) {
  for (let i = page.wires.length - 1; i >= 0; i--) {
    const w = page.wires[i];
    for (let j = 0; j < w.points.length - 1; j++) {
      const [x1, y1] = w.points[j];
      const [x2, y2] = w.points[j + 1];
      if (pointToSegmentDist(gx, gy, x1, y1, x2, y2) < r) return w;
    }
  }
  return null;
}
function hitWireBody(page: LegacySchematicPage, gx: number, gy: number, r: number) {
  for (let i = page.wires.length - 1; i >= 0; i--) {
    const w = page.wires[i];
    for (let j = 0; j < w.points.length - 1; j++) {
      const [x1, y1] = w.points[j];
      const [x2, y2] = w.points[j + 1];
      const proj = projectPointToSegment(gx, gy, x1, y1, x2, y2);
      if (!proj) continue;
      const d = Math.hypot(proj.x - gx, proj.y - gy);
      if (d >= r) continue;
      const first = w.points[0];
      const last = w.points[w.points.length - 1];
      if (
        Math.hypot(proj.x - first[0], proj.y - first[1]) < 1e-6 ||
        Math.hypot(proj.x - last[0], proj.y - last[1]) < 1e-6
      ) continue;
      return w;
    }
  }
  return null;
}
function legacySelectableItemId(page: LegacySchematicPage, gx: number, gy: number): string | null {
  const directProbe = hitProbe(page, gx, gy, 0.36);
  const probe = directProbe ?? hitProbe(page, gx, gy, 0.5);
  const comp = hitComponent(page, gx, gy);
  const wireBody = hitWireBody(page, gx, gy, 0.3);
  const wire = hitWire(page, gx, gy, 0.3);
  type Cand = { id: string; priority: number; z: number };
  const cands: Cand[] = [];
  if (directProbe) cands.push({ id: directProbe.id, priority: 100, z: page.probes.indexOf(directProbe) });
  if (comp && hitComponentCore(comp, gx, gy)) cands.push({ id: comp.id, priority: 90, z: page.components.indexOf(comp) });
  if (probe && probe !== directProbe) cands.push({ id: probe.id, priority: 80, z: page.probes.indexOf(probe) });
  if (wireBody) cands.push({ id: wireBody.id, priority: 75, z: page.wires.indexOf(wireBody) });
  if (comp) cands.push({ id: comp.id, priority: 70, z: page.components.indexOf(comp) });
  if (wire) cands.push({ id: wire.id, priority: 50, z: page.wires.indexOf(wire) });
  cands.sort((a, b) => b.priority - a.priority || b.z - a.z);
  return cands[0]?.id ?? null;
}
function legacyNearestConnectionTarget(
  page: LegacySchematicPage,
  gx: number,
  gy: number,
  radius: number,
): { x: number; y: number; wireId?: string; segmentIdx?: number } | null {
  let best: { x: number; y: number; wireId?: string; segmentIdx?: number } | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of page.components) {
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      const d = Math.hypot(p.x - gx, p.y - gy);
      if (d <= radius && d < bestD) { bestD = d; best = { x: p.x, y: p.y }; }
    }
  }
  for (const w of page.wires) {
    for (const p of w.points) {
      const d = Math.hypot(p[0] - gx, p[1] - gy);
      if (d <= radius && d < bestD) { bestD = d; best = { x: p[0], y: p[1] }; }
    }
    for (let idx = 0; idx < w.points.length - 1; idx++) {
      const [x1, y1] = w.points[idx];
      const [x2, y2] = w.points[idx + 1];
      const proj = projectPointToSegment(gx, gy, x1, y1, x2, y2);
      if (!proj) continue;
      const d = Math.hypot(proj.x - gx, proj.y - gy);
      if (d <= radius && d < bestD) {
        bestD = d;
        const n = normalizePoint(proj);
        best = { x: n.x, y: n.y, wireId: w.id, segmentIdx: idx };
      }
    }
  }
  return best;
}

for (const demo of DEMOS) {
  test(`edit-geometry parity (legacy vs graph): ${demo.id}`, () => {
    const graphPage = legacyDocToGraph(demo.build()).pages[0];
    const legacyPage = graphToLegacyPage(graphPage);

    // buildWireJunctionDots (graph degree ≥ 3) vs legacy coincidence-degree:
    // the graph set must be a subset (never invents a dot), and every legacy dot
    // the graph omits must be a pure routing crossover (no wire ends there), which
    // Model C correctly does not solder.
    const graphDots = buildWireJunctionDots(graphPage);
    const legacyDots = legacyJunctionDots(legacyPage);
    const graphKeys = new Set(graphDots.map((d) => `${d.x},${d.y}`));
    const legacyKeys = new Set(legacyDots.map((d) => `${d.x},${d.y}`));
    for (const d of graphDots) {
      assert.ok(legacyKeys.has(`${d.x},${d.y}`), `${demo.id} graph dot (${d.x},${d.y}) not in legacy`);
    }
    for (const d of legacyDots) {
      if (graphKeys.has(`${d.x},${d.y}`)) continue;
      assert.ok(
        isPureCrossover(legacyPage, d.x, d.y),
        `${demo.id} legacy dot (${d.x},${d.y}) missing from graph but is NOT a pure crossover (lost junction?)`,
      );
    }

    // wireIdsForAutoFormat: identical id set for "all" + every single selection.
    const allIds = [
      ...graphPage.components.map((c) => c.id),
      ...graphPage.wires.map((w) => w.id),
      ...graphPage.probes.map((p) => p.id),
    ];
    for (const sel of [new Set<string>(), ...allIds.map((id) => new Set([id]))]) {
      assert.deepEqual(
        [...wireIdsForAutoFormat(graphPage, sel)].sort(),
        [...wireIdsForAutoFormatPolyline(
          { components: legacyPage.components, probes: legacyPage.probes, wires: legacyPage.wires },
          sel,
        )].sort(),
        `${demo.id} wireIdsForAutoFormat {${[...sel].join(",") || "∅"}}`,
      );
    }

    // autoFormatWiresAvoiding: formatted points by id (exercises
    // routeWireSegmentAvoiding through the route stops).
    const allWireIds = new Set(graphPage.wires.map((w) => w.id));
    const graphFormatted = autoFormatWiresAvoiding(graphPage, allWireIds);
    const legacyFormatted = autoFormatPolylinePage(
      { components: legacyPage.components, probes: legacyPage.probes, wires: legacyPage.wires },
      new Set(legacyPage.wires.map((w) => w.id)),
    );
    const gById = new Map(graphFormatted.wires.map((w) => [w.id, w.points]));
    const lById = new Map(legacyFormatted.wires.map((w) => [w.id, w.points]));
    assert.deepEqual([...gById.keys()].sort(), [...lById.keys()].sort(), `${demo.id} formatted ids`);
    for (const [id, pts] of gById) {
      assert.deepEqual(pts, lById.get(id), `${demo.id} formatted points ${id}`);
    }

    // wireEndpointAnchors: identical per wire, for two selection sets.
    for (const sel of [new Set<string>(), new Set(graphPage.components.map((c) => c.id))]) {
      for (const wire of graphPage.wires) {
        const legacyWire = legacyPage.wires.find((w) => w.id === wire.id)!;
        assert.deepEqual(
          wireEndpointAnchors(wire, graphPage, sel),
          legacyWireEndpointAnchors(legacyWire, legacyPage, sel),
          `${demo.id} wireEndpointAnchors ${wire.id}`,
        );
      }
    }

    // canvasHitTest selectable-at + connection snapping: probe every wire vertex
    // + segment midpoint + pin; the graph hit-test must match the polyline scan.
    const probePoints: [number, number][] = [];
    for (const wire of legacyPage.wires) {
      for (const p of wire.points) probePoints.push([p[0], p[1]]);
      for (let i = 0; i < wire.points.length - 1; i++) {
        probePoints.push([
          (wire.points[i][0] + wire.points[i + 1][0]) / 2,
          (wire.points[i][1] + wire.points[i + 1][1]) / 2,
        ]);
      }
    }
    for (const c of legacyPage.components) {
      for (let i = 0; i < getPinLayout(c).length; i++) {
        const p = pinWorldPos(c, i);
        probePoints.push([p.x, p.y]);
      }
    }
    for (const [gx, gy] of probePoints) {
      assert.equal(
        selectableHitAt(graphPage, gx, gy)?.item.id ?? null,
        legacySelectableItemId(legacyPage, gx, gy),
        `${demo.id} selectableHitAt (${gx},${gy})`,
      );
      assert.deepEqual(
        nearestConnectionTarget(graphPage, gx, gy, 0.7, { includeSegments: true }),
        legacyNearestConnectionTarget(legacyPage, gx, gy, 0.7),
        `${demo.id} nearestConnectionTarget (${gx},${gy})`,
      );
    }
  });
}
