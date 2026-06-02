// Bridge validation: legacy → graph → legacy must preserve connectivity, so the
// proven legacy emitters (SPICE netlist, SVG) can run off the graph via the
// graphToGeometry adapter. Checked on every demo circuit.

import assert from "node:assert/strict";
import test from "node:test";

import { DEMOS } from "../src/editor/demos.ts";
import { buildNetlist, coordKey } from "../src/editor/netlist.ts";
import { getPinLayout, pinWorldPos, type CircuitDoc } from "../src/editor/model.ts";
import { graphToGeometry, geometryToGraph } from "../src/editor/graphConvert.ts";
import { pinNodeIndex, wirePolyline } from "../src/editor/graphModel.ts";

function pinPartition(doc: CircuitDoc): Set<string> {
  const res = buildNetlist(doc);
  const page = doc.pages[0];
  const pinNet = new Map<string, string>();
  for (const c of page.components) {
    const n = getPinLayout(c).length;
    for (let i = 0; i < n; i++) {
      const wp = pinWorldPos(c, i);
      const k = `${coordKey(wp.x)},${coordKey(wp.y)}`;
      pinNet.set(`${c.id}#${i}`, res.nodes.posToNode.get(k) ?? `__f_${c.id}#${i}`);
    }
  }
  const byNet = new Map<string, string[]>();
  for (const [pin, net] of pinNet) {
    const list = byNet.get(net);
    if (list) list.push(pin);
    else byNet.set(net, [pin]);
  }
  return new Set([...byNet.values()].map((l) => l.slice().sort().join("|")));
}

for (const demo of DEMOS) {
  test(`graph round-trip preserves nets: ${demo.id}`, () => {
    const doc = demo.build();
    const g = geometryToGraph(doc.pages[0]);
    const page2 = graphToGeometry(g);
    const doc2: CircuitDoc = { ...doc, pages: [page2, ...doc.pages.slice(1)] };
    assert.deepEqual(pinPartition(doc2), pinPartition(doc));
  });

  // Render parity for the Editor doc-flip: the canvas now renders each wire from
  // `wirePolyline(page, wire)`, while the QA hook / SVG path renders the
  // `graphToGeometry(page)` projection. They must be byte-identical per wire (the
  // canvas pixels are unchanged by removing the legacy read-path projection).
  test(`wirePolyline matches the geometry projection: ${demo.id}`, () => {
    const page = geometryToGraph(demo.build().pages[0]);
    const projected = new Map(graphToGeometry(page).wires.map((w) => [w.id, w.points]));
    const idx = pinNodeIndex(page);
    for (const wire of page.wires) {
      const poly = wirePolyline(page, wire, idx);
      assert.ok(poly, `wirePolyline resolved for ${wire.id}`);
      assert.deepEqual(poly, projected.get(wire.id), `geometry for wire ${wire.id}`);
    }
    assert.equal(page.wires.length, projected.size, "no wires dropped by the projection");
  });
}
