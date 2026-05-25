import assert from "node:assert/strict";
import test from "node:test";

import type { Probe, SchematicPage } from "../src/editor/model.ts";
import { componentBoundsFor } from "../src/editor/geometry.ts";
import { netLabelLayouts } from "../src/editor/labelPlacement.ts";
import { estimateInlineMathTextWidth } from "../src/editor/mathText.ts";
import { layoutProbeScopes, probeScopeLabelBounds } from "../src/editor/scopeLayout.ts";

const options = { defaultDx: 0.9, defaultDy: -2.75, width: 4.6, height: 1.75 };

test("probe scopes avoid previously placed probe scopes", () => {
  const page = pageWithProbes([
    probe("p1", 0, 0),
    probe("p2", 0, 0.2),
  ]);

  const placements = layoutProbeScopes(page, options);
  const first = placements.get("p1");
  const second = placements.get("p2");

  assert.ok(first);
  assert.ok(second);
  assert.equal(scopesOverlap(page.probes[0], first, page.probes[1], second), false);
});

test("manual probe scope placement is preserved and avoided by automatic scopes", () => {
  const page = pageWithProbes([
    { ...probe("manual", 0, 0), scopeDx: 0.9, scopeDy: -2.75 },
    probe("auto", 0, 0),
  ]);

  const placements = layoutProbeScopes(page, options);
  const manual = placements.get("manual");
  const auto = placements.get("auto");

  assert.deepEqual(manual, { dx: 0.9, dy: -2.75 });
  assert.ok(auto);
  assert.equal(scopesOverlap(page.probes[0], manual!, page.probes[1], auto), false);
});

test("probe scopes prefer open space over covering a nearby component", () => {
  const page: SchematicPage = {
    ...pageWithProbes([probe("out", 0, 0)]),
    components: [
      { id: "r1", kind: "R", x: 3.2, y: -1.9, rotation: 0, value: "1k" },
    ],
  };

  const placement = layoutProbeScopes(page, options).get("out");

  assert.ok(placement);
  assert.notDeepEqual(placement, { dx: options.defaultDx, dy: options.defaultDy });
});

test("probe scopes avoid the full bounds of large subcircuit blocks", () => {
  const page: SchematicPage = {
    ...pageWithProbes([probe("out", 0, 0)]),
    components: [
      {
        id: "xlarge",
        kind: "SUBX",
        x: 3.2,
        y: 0,
        rotation: 0,
        value: "large_block",
        params: { npins: "20" },
      },
    ],
  };
  const subx = page.components[0];
  const defaultPlacement = { dx: options.defaultDx, dy: options.defaultDy };

  assert.equal(scopeOverlapsRect(page.probes[0], defaultPlacement, componentBoundsFor(subx, 0.36)), true);

  const placement = layoutProbeScopes(page, options).get("out");

  assert.ok(placement);
  assert.equal(scopeOverlapsRect(page.probes[0], placement, componentBoundsFor(subx, 0.36)), false);
});

test("probe scopes avoid net labels and probe label chips in dense areas", () => {
  const page: SchematicPage = {
    ...pageWithProbes([{ ...probe("out", 0, 0), label: "Vout" }]),
    components: [
      { id: "label1", kind: "LABEL", x: 1.1, y: -1.4, rotation: 0, value: "Vout" },
      { id: "label2", kind: "LABEL", x: 1.1, y: -2.2, rotation: 0, value: "Rectified" },
    ],
  };

  const placement = layoutProbeScopes(page, options).get("out");

  assert.ok(placement);
  assert.notDeepEqual(placement, { dx: options.defaultDx, dy: options.defaultDy });
});

test("probe scopes avoid routed net label positions", () => {
  const page: SchematicPage = {
    ...pageWithProbes([probe("out", -0.9, 1.33)]),
    components: [
      { id: "label", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "in" },
      { id: "r1", kind: "R", x: 3.1, y: 0, rotation: 0, value: "1k" },
    ],
    wires: [{ id: "w1", points: [[-2, 0], [2, 0]] }],
  };
  const routedLabel = [...netLabelLayouts(page).values()][0];
  assert.ok(routedLabel);
  assert.equal(scopeOverlapsRect(page.probes[0], {
    dx: options.defaultDx,
    dy: options.defaultDy,
  }, routedLabel.bounds), true);

  const placement = layoutProbeScopes(page, options).get("out");

  assert.ok(placement);
  assert.equal(scopeOverlapsRect(page.probes[0], placement, routedLabel.bounds), false);
});

test("probe label bounds use rendered inline math width", () => {
  const p = { ...probe("math", 1, 2), label: "V_{TH}" };
  const bounds = probeScopeLabelBounds(p, p.label);
  const expectedWidth = Math.max(2.6, estimateInlineMathTextWidth(p.label) * 0.42 + 0.7);

  assert.equal(Number((bounds.x2 - bounds.x1).toFixed(6)), Number(expectedWidth.toFixed(6)));
  assert.notEqual(
    Number((bounds.x2 - bounds.x1).toFixed(6)),
    Number(Math.max(2.6, p.label.length * 0.38 + 0.7).toFixed(6)),
  );
});

function pageWithProbes(probes: Probe[]): SchematicPage {
  return {
    id: "main",
    name: "main",
    components: [],
    wires: [],
    probes,
  };
}

function probe(id: string, x: number, y: number): Probe {
  return { id, x, y, color: "#0a84ff" };
}

function scopesOverlap(
  aProbe: Probe,
  a: { dx: number; dy: number },
  bProbe: Probe,
  b: { dx: number; dy: number },
): boolean {
  const ar = {
    x1: aProbe.x + a.dx,
    y1: aProbe.y + a.dy,
    x2: aProbe.x + a.dx + options.width,
    y2: aProbe.y + a.dy + options.height,
  };
  const br = {
    x1: bProbe.x + b.dx,
    y1: bProbe.y + b.dy,
    x2: bProbe.x + b.dx + options.width,
    y2: bProbe.y + b.dy + options.height,
  };
  return ar.x1 <= br.x2 && ar.x2 >= br.x1 && ar.y1 <= br.y2 && ar.y2 >= br.y1;
}

function scopeOverlapsRect(
  probe: Probe,
  placement: { dx: number; dy: number },
  rect: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  const scope = {
    x1: probe.x + placement.dx,
    y1: probe.y + placement.dy,
    x2: probe.x + placement.dx + options.width,
    y2: probe.y + placement.dy + options.height,
  };
  return scope.x1 <= rect.x2 && scope.x2 >= rect.x1 && scope.y1 <= rect.y2 && scope.y2 >= rect.y1;
}
