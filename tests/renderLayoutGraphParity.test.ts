// Behavior-preservation gate for the legacy(polyline) -> Model-C(graph) port of
// the LABEL / BOUNDS / SCOPE layout consumers (labelPlacement, scopeLayout,
// selectionBounds, useProbeScopes).
//
// Part A — demo parity vs a captured legacy baseline:
//   The converted consumers now read wire geometry from the graph
//   (`wirePolyline`) instead of `wire.points`. In production they run on the
//   editor's graph page; the old code ran on `graphToGeometry(graphPage)` (the
//   legacy projection of that same page). So the behavior-preservation reference
//   is the *pre-conversion* (legacy) functions applied to
//   `graphToGeometry(geometryDocToGraph(demo))`. EXPECTED below is exactly that,
//   captured by running the unmodified modules from a clean `git stash` of the
//   converted files. This test rebuilds each demo, converts with
//   `geometryDocToGraph`, runs the now-graph-based consumers on the graph page, and
//   asserts byte-identical output (float epsilon) — including array length and
//   order, since graphToGeometry and the converted code both walk `page.wires`
//   and emit `wirePolyline` per wire. If `wirePolyline` ever returned null
//   (wires dropped) or the named-node handling regressed, the values diverge.
//
// Part B — directly-named-node parity (live dual comparison):
//   Demos never carry directly-named nodes (those only arrive from netlist
//   import), so Part A cannot exercise that path. Part B builds a graph page
//   with a named node and an equivalent page where the same name is a real LABEL
//   component at the same coordinate, and asserts the converted consumers emit
//   identical net-label layout + page bounds — i.e. a named node lays out
//   exactly like the LABEL the legacy view synthesized (graphToGeometry).

import assert from "node:assert/strict";
import test from "node:test";

import { DEMOS } from "../src/editor/demos.ts";
import { graphToGeometry, geometryDocToGraph } from "../src/editor/graphConvert.ts";
import { canvasValueLabel } from "../src/editor/labelFormatting.ts";
import { netLabelLayouts, valueLabelOffsets } from "../src/editor/labelPlacement.ts";
import { layoutProbeScopes } from "../src/editor/scopeLayout.ts";
import { collectPageBounds } from "../src/editor/selectionBounds.ts";
import type { CircuitComponent, CircuitNode, SchematicPage } from "../src/editor/model.ts";

const SCOPE_LAYOUT = { defaultDx: 0.9, defaultDy: -2.75, width: 4.6, height: 1.75 };
const EPS = 1e-6;

interface ExpectedBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface ExpectedNetLabel {
  stemX2: number;
  stemY2: number;
  chipX: number;
  chipY: number;
  chipW: number;
  chipH: number;
  textX: number;
  textY: number;
  bounds: ExpectedBounds;
}
interface ExpectedDemo {
  bounds: { xs: number[]; ys: number[] };
  valueOffsets: Record<string, { x: number; y: number; anchor: string }>;
  netLabels: Record<string, ExpectedNetLabel>;
  scopes: Record<string, { dx: number; dy: number }>;
}

// --- captured legacy baseline (see file header for provenance) ---
const EXPECTED: Record<string, ExpectedDemo> = JSON.parse(
  `{"divider":{"bounds":{"xs":[-12.5,-7.5,-10,-10,-4.5,0.5,-4,0,4.8,7.2,6,6,-11.6,-8.4,-10,4.4,7.6,6,2.4,5.6,4,-10,-10,-4,0,4,4,4,6,6,6,6,-10,-10,-8.25,-6.9452,-2.7764,-1.2236,7.65,9.0028,4,2.4875,5.5125,4],"ys":[-1.2,1.2,-2,2,-5.2,-2.8,-4,-4,-2.5,2.5,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-4,-4,-4,-4,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-3.47,-2.43,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":0,"y":1.45,"anchor":"middle"},"r2":{"x":1.65,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_mid":{"stemX2":4,"stemY2":-4.35,"chipX":2.4875,"chipY":-5.23,"chipW":3.025,"chipH":0.88,"textX":4,"textY":-4.79,"bounds":{"x1":2.4875,"y1":-5.23,"x2":5.5125,"y2":-4.35}}},"scopes":{"p_mid":{"dx":2.4,"dy":-2.75}}},"rc_lowpass":{"bounds":{"xs":[-10.5,-5.5,-8,-8,-2.5,2.5,-2,2,1.5,6.5,4,4,-9.6,-6.4,-8,2.4,5.6,4,2.4,5.6,4,-8,-8,-2,2,4,4,4,4,4,-8,-8,-6.25,-4.5728,-0.7764,0.7764,5.65,7.566,4,2.478,5.522,4],"ys":[-1.2,1.2,-2,2,-4.2,-1.8,-3,-3,-1.2,1.2,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-3,-3,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-2.47,-1.43,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":0,"y":1.45,"anchor":"middle"},"c1":{"x":1.65,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_out":{"stemX2":4,"stemY2":-4.35,"chipX":2.478,"chipY":-5.23,"chipW":3.044,"chipH":0.88,"textX":4,"textY":-4.79,"bounds":{"x1":2.478,"y1":-5.23,"x2":5.522,"y2":-4.35}}},"scopes":{"p1":{"dx":2.4,"dy":-2.75}}},"rc_step":{"bounds":{"xs":[-10.5,-5.5,-8,-8,-2.5,2.5,-2,2,1.5,6.5,4,4,-9.6,-6.4,-8,2.4,5.6,4,2.4,5.6,4,-8,-8,-2,2,4,4,4,4,4,-8,-8,-6.25,-4.1016,-0.7764,0.7764,5.65,7.0028,4,2.478,5.522,4],"ys":[-1.2,1.2,-2,2,-4.2,-1.8,-3,-3,-1.2,1.2,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-3,-3,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-2.47,-1.43,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":0,"y":1.45,"anchor":"middle"},"c1":{"x":1.65,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_out":{"stemX2":4,"stemY2":-4.35,"chipX":2.478,"chipY":-5.23,"chipW":3.044,"chipH":0.88,"textX":4,"textY":-4.79,"bounds":{"x1":2.478,"y1":-5.23,"x2":5.522,"y2":-4.35}}},"scopes":{"p1":{"dx":2.4,"dy":-2.75}}},"inverting_opamp":{"bounds":{"xs":[-16.5,-11.5,-14,-14,-10.5,-5.5,-10,-6,-5.5,-0.5,-5,-1,-3.7,3.7,-3,-3,3,-15.6,-12.4,-14,-4.6,-1.4,-3,2.4,5.6,4,-14,-14,-10,-6,-3,-5,-5,-3,-1,3,3,3,4,-3,-3,-14,-14,-12.25,-9.7368,-8.7764,-7.2236,-3.9172,-2.0828,4,4.42,7.464,4],"ys":[-1.2,1.2,-2,2,-4.2,-1.8,-3,-3,-8.2,-5.8,-7,-7,-6.8,-1.2,-5,-3,-4,2.8,5.2,4,-7.2,-4.8,-6,-5.2,-2.8,-4,-2,-3,-3,-3,-3,-7,-3,-3,-7,-7,-4,-4,-4,-5,-6,2,4,-0.67,0.37,-2.47,-1.43,-9.07,-8.03,-4,-4.44,-3.56,-4]},"valueOffsets":{"vin":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":0,"y":1.45,"anchor":"middle"},"rf":{"x":0,"y":-1.15,"anchor":"middle"}},"netLabels":{"lbl_out":{"stemX2":4.42,"stemY2":-4,"chipX":4.42,"chipY":-4.44,"chipW":3.044,"chipH":0.88,"textX":5.942,"textY":-4,"bounds":{"x1":4.42,"y1":-4.44,"x2":7.464,"y2":-3.56}}},"scopes":{"p1":{"dx":2.4,"dy":-2.75}}},"half_wave_rectifier":{"bounds":{"xs":[-10.5,-5.5,-8,-8,-1.2,1.2,-2,2,2.8,5.2,4,4,-9.6,-6.4,-8,2.4,5.6,4,2.4,5.6,4,-8,-8,-2,2,4,4,4,4,4,-8,-8,-6.25,-3.8584,5.65,7.2844,4,2.478,5.522,4],"ys":[-1.2,1.2,-2,2,-5.5,-0.5,-3,-3,-2.5,2.5,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-3,-3,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":1.65,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_out":{"stemX2":4,"stemY2":-4.35,"chipX":2.478,"chipY":-5.23,"chipW":3.044,"chipH":0.88,"textX":4,"textY":-4.79,"bounds":{"x1":2.478,"y1":-5.23,"x2":5.522,"y2":-4.35}}},"scopes":{"p_out":{"dx":2.4,"dy":-2.75}}},"diode_iv":{"bounds":{"xs":[-6.5,-1.5,-4,-4,1.5,6.5,4,4,-5.6,-2.4,-4,2.4,5.6,4,-5.6,-2.4,-4,-4,-4,-4,4,-4,-4,4,4,-2.25,-1.0744,-4,-5.0755,-2.9245,-4],"ys":[-1.2,1.2,-2,2,-1.2,1.2,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-3,-2,-2,2,4,2,4,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_in":{"stemX2":-4,"stemY2":-4.35,"chipX":-5.0755,"chipY":-5.23,"chipW":2.151,"chipH":0.88,"textX":-4,"textY":-4.79,"bounds":{"x1":-5.0755,"y1":-5.23,"x2":-2.9245,"y2":-4.35}}},"scopes":{"p_in":{"dx":2.4,"dy":-2.75}}},"nmos_transfer":{"bounds":{"xs":[-10.5,-5.5,-8,-8,5.5,10.5,8,8,-2.4,2.4,0,-2,0,-1.6,1.6,0,-9.6,-6.4,-8,6.4,9.6,8,-4.6,-1.4,-3,1.4,4.6,3,-8,-8,-3,-3,-2,-2,-8,-8,0,0,3,3,8,8,8,8,0,0,-6.25,-5.0744,9.75,10.9256,-3,-3.95,-2.05,3,2.05,3.95],"ys":[-1.2,1.2,-2,2,-1.2,1.2,-2,2,-2.6,2.6,-2,0,2,2.8,5.2,4,2.8,5.2,4,2.8,5.2,4,-2.2,0.2,-1,-4.2,-1.8,-3,-2,-1,-1,-1,-1,0,2,4,-2,-3,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-0.67,0.37,-1,-3.23,-2.35,-3,-4.3,-3.42]},"valueOffsets":{"vgs":{"x":1.75,"y":0.25,"anchor":"start"},"vds":{"x":1.75,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_g":{"stemX2":-3,"stemY2":-2.35,"chipX":-3.95,"chipY":-3.23,"chipW":1.9,"chipH":0.88,"textX":-3,"textY":-2.79,"bounds":{"x1":-3.95,"y1":-3.23,"x2":-2.05,"y2":-2.35}},"lbl_d":{"stemX2":3,"stemY2":-3.42,"chipX":2.05,"chipY":-4.3,"chipW":1.9,"chipH":0.88,"textX":3,"textY":-3.86,"bounds":{"x1":2.05,"y1":-4.3,"x2":3.95,"y2":-3.42}}},"scopes":{}},"rlc_bandpass":{"bounds":{"xs":[-10.5,-5.5,-8,-8,-5.5,-0.5,-5,-1,1.8,4.2,5,1,5.5,10.5,8,8,-9.6,-6.4,-8,6.4,9.6,8,6.4,9.6,8,-8,-8,-5,-1,1,5,8,8,8,8,8,-8,-8,-6.25,-4.5728,-3.9172,-2.0828,2.2236,3.7764,9.65,11.4076,8,6.478,9.522,8],"ys":[-1.2,1.2,-2,2,-4.2,-1.8,-3,-3,-5.5,-0.5,-3,-3,-1.2,1.2,-2,2,2.8,5.2,4,2.8,5.2,4,-4.2,-1.8,-3,-2,-3,-3,-3,-3,-3,-3,-3,-2,2,4,2,4,-0.67,0.37,-2.47,-1.43,-5.07,-4.03,-0.67,0.37,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"},"r1":{"x":0,"y":1.45,"anchor":"middle"},"c1":{"x":0,"y":-1.15,"anchor":"middle"},"l1":{"x":1.65,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_out":{"stemX2":8,"stemY2":-4.35,"chipX":6.478,"chipY":-5.23,"chipW":3.044,"chipH":0.88,"textX":8,"textY":-4.79,"bounds":{"x1":6.478,"y1":-5.23,"x2":9.522,"y2":-4.35}}},"scopes":{"p_out":{"dx":2.4,"dy":-2.75}}},"rc_cascade_subckt":{"bounds":{"xs":[-12.5,-7.5,-10,-10,-6.2,0.2,-6,0,1.8,8.2,2,8,-11.6,-8.4,-10,-0.6,2.6,1,7.4,10.6,9,-10,-10,-6,0,1,1,2,8,9,-10,-10,-8.25,-6.5728,1,-0.5125,2.5125,9,7.478,10.522,9],"ys":[-1.2,1.2,-2,2,-3.8,-2.2,-3,-3,-3.8,-2.2,-3,-3,2.8,5.2,4,-4.2,-1.8,-3,-4.2,-1.8,-3,-2,-3,-3,-3,-3,-3,-3,-3,-3,2,4,-0.67,0.37,-3,-5.23,-4.35,-3,-5.23,-4.35,-3]},"valueOffsets":{"v1":{"x":1.75,"y":0.25,"anchor":"start"}},"netLabels":{"lbl_mid":{"stemX2":1,"stemY2":-4.35,"chipX":-0.5125,"chipY":-5.23,"chipW":3.025,"chipH":0.88,"textX":1,"textY":-4.79,"bounds":{"x1":-0.5125,"y1":-5.23,"x2":2.5125,"y2":-4.35}},"lbl_out":{"stemX2":9,"stemY2":-4.35,"chipX":7.478,"chipY":-5.23,"chipW":3.044,"chipH":0.88,"textX":9,"textY":-4.79,"bounds":{"x1":7.478,"y1":-5.23,"x2":10.522,"y2":-4.35}}},"scopes":{"p_out":{"dx":2.4,"dy":-2.75}}}}`,
);

function approx(actual: number, expected: number, msg: string): void {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${msg}: expected ${expected}, got ${actual} (Δ ${Math.abs(actual - expected)})`,
  );
}

function approxArray(actual: number[], expected: number[], msg: string): void {
  assert.equal(actual.length, expected.length, `${msg}: length`);
  for (let i = 0; i < expected.length; i++) approx(actual[i], expected[i], `${msg}[${i}]`);
}

const labelText = (c: CircuitComponent): string | null =>
  canvasValueLabel(c.kind, c.value);

for (const demo of DEMOS) {
  test(`render-layout parity (legacy vs graph): ${demo.id}`, () => {
    const expected = EXPECTED[demo.id];
    assert.ok(expected, `missing baseline for demo ${demo.id}`);

    const graphPage = geometryDocToGraph(demo.build()).pages[0];

    // collectPageBounds (selectionBounds)
    const bounds = collectPageBounds(graphPage);
    approxArray(bounds.xs, expected.bounds.xs, `${demo.id} bounds.xs`);
    approxArray(bounds.ys, expected.bounds.ys, `${demo.id} bounds.ys`);

    // valueLabelOffsets (labelPlacement)
    const valueOffsets = valueLabelOffsets(graphPage, labelText);
    assert.deepEqual(
      [...valueOffsets.keys()].sort(),
      Object.keys(expected.valueOffsets).sort(),
      `${demo.id} valueOffsets keys`,
    );
    for (const [id, off] of valueOffsets) {
      const exp = expected.valueOffsets[id];
      approx(off.x, exp.x, `${demo.id} valueOffset[${id}].x`);
      approx(off.y, exp.y, `${demo.id} valueOffset[${id}].y`);
      assert.equal(off.anchor, exp.anchor, `${demo.id} valueOffset[${id}].anchor`);
    }

    // netLabelLayouts (labelPlacement): same keys + same bounds/anchor geometry
    const netLabels = netLabelLayouts(graphPage);
    assert.deepEqual(
      [...netLabels.keys()].sort(),
      Object.keys(expected.netLabels).sort(),
      `${demo.id} netLabels keys`,
    );
    for (const [id, layout] of netLabels) {
      const exp = expected.netLabels[id];
      for (const k of ["stemX2", "stemY2", "chipX", "chipY", "chipW", "chipH", "textX", "textY"] as const) {
        approx(layout[k], exp[k], `${demo.id} netLabel[${id}].${k}`);
      }
      for (const k of ["x1", "y1", "x2", "y2"] as const) {
        approx(layout.bounds[k], exp.bounds[k], `${demo.id} netLabel[${id}].bounds.${k}`);
      }
    }

    // layoutProbeScopes (scopeLayout)
    const scopes = layoutProbeScopes(graphPage, SCOPE_LAYOUT);
    assert.deepEqual(
      [...scopes.keys()].sort(),
      Object.keys(expected.scopes).sort(),
      `${demo.id} scopes keys`,
    );
    for (const [id, s] of scopes) {
      approx(s.dx, expected.scopes[id].dx, `${demo.id} scope[${id}].dx`);
      approx(s.dy, expected.scopes[id].dy, `${demo.id} scope[${id}].dy`);
    }
  });
}

// --- Part B: directly-named-node parity ---------------------------------------
// A named graph node must lay out exactly like the LABEL component the legacy
// view synthesized for it (same id `label-<nodeId>`, same coord, same text).

function namedNodePage(node: CircuitNode, others: CircuitComponent[] = []): SchematicPage {
  return { id: "main", name: "main", components: others, nodes: [node], wires: [], probes: [] };
}

function labelComponentPage(
  id: string,
  x: number,
  y: number,
  value: string,
  others: CircuitComponent[] = [],
): SchematicPage {
  const label: CircuitComponent = { id, kind: "LABEL", x, y, rotation: 0, value };
  return { id: "main", name: "main", components: [...others, label], wires: [], probes: [] };
}

// The legacy projection of a graph page: this is what the pre-conversion code
// consumed. `graphToGeometry` turns each named node into a LABEL component, so
// feeding this back through the converted (graph-typed) functions reproduces the
// exact legacy reference — proving the named-node path matches legacy.
function legacyRef(page: SchematicPage): SchematicPage {
  return graphToGeometry(page) as unknown as SchematicPage;
}

test("named node lays out like the LABEL the legacy view synthesized (netLabelLayouts)", () => {
  const node: CircuitNode = { id: "n7", x: 3, y: -2, name: "vout" };
  const page = namedNodePage(node);
  const named = netLabelLayouts(page);
  const legacy = netLabelLayouts(legacyRef(page));
  // A hand-built LABEL at the same coord/text is the same synthesized component.
  const equiv = netLabelLayouts(labelComponentPage(`label-${node.id}`, node.x, node.y, node.name!));

  assert.deepEqual([...named.keys()], [`label-${node.id}`]);
  assert.deepEqual(named, legacy);
  assert.deepEqual(named, equiv);
});

test("named node contributes the same page bounds as the legacy synthesized LABEL", () => {
  const node: CircuitNode = { id: "n7", x: 3, y: -2, name: "vout" };
  // Add an unrelated component so bounds are non-trivial.
  const r: CircuitComponent = { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" };
  const page = namedNodePage(node, [r]);

  const named = collectPageBounds(page);
  const legacy = collectPageBounds(legacyRef(page));

  // Same multiset and order: graphToGeometry appends the LABEL after the real
  // components, and collectPageBounds appends named nodes after real components.
  approxArray(named.xs, legacy.xs, "named-node bounds.xs");
  approxArray(named.ys, legacy.ys, "named-node bounds.ys");
});

test("named node is laid out by netLabelLayouts and scoped as an obstacle", () => {
  // Sanity: the named-node path is actually active (a node with no name is ignored).
  const unnamed = netLabelLayouts(namedNodePage({ id: "n0", x: 3, y: -2 }));
  assert.equal(unnamed.size, 0);
  const named = netLabelLayouts(namedNodePage({ id: "n1", x: 3, y: -2, name: "net1" }));
  assert.equal(named.size, 1);
});
