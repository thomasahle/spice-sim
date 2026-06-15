import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoltageHeatmap,
  heatColor,
  voltageColorForNode,
  voltageFraction,
  voltageHeatmapGlobalRange,
  formatHeatmapVoltage,
} from "../src/editor/voltageHeatmap.ts";
import type { SimVector } from "../src/sim/api.ts";

function vec(name: string, data: number[], is_scale = false): SimVector {
  return { name, data, is_scale } as SimVector;
}

const vectors: SimVector[] = [
  vec("time", [0, 1, 2], true),
  vec("V(in)", [0, 5, 5]),
  vec("V(out)", [0, 2.5, 5]),
];

test("buildVoltageHeatmap samples node voltages at the given index and pins ground", () => {
  const hm = buildVoltageHeatmap(vectors, ["in", "out", "0"], "tran", 1);
  assert.equal(hm.nodeVoltage.get("in"), 5);
  assert.equal(hm.nodeVoltage.get("out"), 2.5);
  assert.equal(hm.nodeVoltage.get("0"), 0);
  assert.equal(hm.ready, true);
});

test("buildVoltageHeatmap clamps an out-of-range sample index to the last sample", () => {
  const hm = buildVoltageHeatmap(vectors, ["out"], "tran", Number.MAX_SAFE_INTEGER);
  assert.equal(hm.nodeVoltage.get("out"), 5);
});

test("global range spans the whole run, fixing the scale across playback", () => {
  const range = voltageHeatmapGlobalRange(vectors, ["in", "out"], "tran");
  assert.equal(range.min, 0);
  assert.equal(range.max, 5);
  // A mid-playback sample using the global range keeps min/max stable.
  const hm = buildVoltageHeatmap(vectors, ["in", "out"], "tran", 1, range);
  assert.equal(hm.min, 0);
  assert.equal(hm.max, 5);
});

test("voltageFraction maps a node's voltage into [0,1] of the range", () => {
  const hm = buildVoltageHeatmap(vectors, ["in", "out"], "tran", 1, { min: 0, max: 5 });
  assert.equal(voltageFraction(hm, "0"), 0);
  assert.equal(voltageFraction(hm, "out"), 0.5);
  assert.equal(voltageFraction(hm, "in"), 1);
  assert.equal(voltageFraction(hm, "missing"), null);
});

test("heatColor runs cool→warm: ground blue, peak red (via magenta)", () => {
  assert.match(heatColor(0), /hsl\(240/); // low = blue
  assert.match(heatColor(0.5), /hsl\(300/); // mid = magenta
  assert.match(heatColor(1), /hsl\(360/); // high = red
  const color = voltageColorForNode(
    buildVoltageHeatmap(vectors, ["in"], "tran", 1, { min: 0, max: 5 }),
    "in",
  );
  assert.match(color ?? "", /hsl\(360/);
});

test("an empty result is not ready and produces no colours", () => {
  const hm = buildVoltageHeatmap([vec("time", [0], true)], ["x"], "tran", 0);
  assert.equal(hm.ready, false);
  assert.equal(voltageColorForNode(hm, "x"), null);
});

test("formatHeatmapVoltage uses compact engineering units", () => {
  assert.equal(formatHeatmapVoltage(0), "0 V");
  assert.equal(formatHeatmapVoltage(5), "5.00 V");
  assert.equal(formatHeatmapVoltage(0.0409), "40.9 mV");
});
