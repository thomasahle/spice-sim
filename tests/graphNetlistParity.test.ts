// Keystone validation for Model C: the converted graph must produce the SAME
// connectivity (pin → net partition) as the legacy geometry-derived netlist,
// on every real demo circuit. Net *names* may differ; the *grouping* must not.

import assert from "node:assert/strict";
import test from "node:test";

import { DEMOS } from "../src/editor/demos.ts";
import { buildNetlist, coordKey } from "../src/editor/netlist.ts";
import { getPinLayout, pinWorldPos } from "../src/editor/model.ts";
import { geometryToGraph } from "../src/editor/graphConvert.ts";
import { buildGraphNets } from "../src/editor/graphNetlist.ts";

/** Canonical partition: the set of nets, each rendered as its sorted pin list,
 *  so two partitions compare equal iff they group pins identically. */
function partition(pinNet: Map<string, string>): Set<string> {
  const byNet = new Map<string, string[]>();
  for (const [pin, net] of pinNet) {
    const list = byNet.get(net);
    if (list) list.push(pin);
    else byNet.set(net, [pin]);
  }
  return new Set([...byNet.values()].map((list) => list.slice().sort().join("|")));
}

for (const demo of DEMOS) {
  test(`net parity (legacy vs graph): ${demo.id}`, () => {
    const doc = demo.build();
    const page = doc.pages[0];

    // Legacy: each pin's net via posToNode at the pin's world coordinate.
    const res = buildNetlist(doc);
    const legacyPinNet = new Map<string, string>();
    for (const c of page.components) {
      const n = getPinLayout(c).length;
      for (let i = 0; i < n; i++) {
        const wp = pinWorldPos(c, i);
        const k = `${coordKey(wp.x)},${coordKey(wp.y)}`;
        legacyPinNet.set(`${c.id}#${i}`, res.nodes.posToNode.get(k) ?? `__float_${c.id}#${i}`);
      }
    }

    // Graph: each pin's net via the stored graph.
    const g = geometryToGraph(page);
    const nets = buildGraphNets(g);
    const graphPinNet = new Map<string, string>();
    for (const c of g.components) {
      c.pins.forEach((nodeId, i) => {
        graphPinNet.set(`${c.id}#${i}`, nets.netOf.get(nodeId) ?? `__float_${c.id}#${i}`);
      });
    }

    assert.deepEqual(partition(graphPinNet), partition(legacyPinNet));
  });
}
