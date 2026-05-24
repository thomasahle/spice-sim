import assert from "node:assert/strict";
import test from "node:test";

import {
  findNamedTrace,
  findNodeTrace,
  latestNodeVoltages,
  traceNodeName,
  unqualifiedTraceName,
} from "../src/editor/simVectorLookup.ts";
import type { SimVector } from "../src/sim/api.ts";

test("unqualified trace names strip stepped plot prefixes", () => {
  assert.equal(unqualifiedTraceName("tran3.v(out)"), "v(out)");
  assert.equal(unqualifiedTraceName("dc12.v1#branch"), "v1#branch");
  assert.equal(unqualifiedTraceName("v(out)"), "v(out)");
});

test("trace node names handle stepped voltage vectors", () => {
  assert.equal(traceNodeName("tran2.v(out)"), "out");
  assert.equal(traceNodeName("V(N1)"), "n1");
});

test("node trace lookup prefers the current stepped plot", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "tran1.v(out)", is_scale: false, data: [0, 1] },
    { name: "tran2.v(out)", is_scale: false, data: [0, 2] },
    { name: "tran3.v(out)", is_scale: false, data: [0, 3] },
  ];

  assert.deepEqual(findNodeTrace(vectors, "out", "tran3")?.data, [0, 3]);
});

test("named trace lookup matches branch currents inside stepped plots", () => {
  const vectors: SimVector[] = [
    { name: "tran1.v1#branch", is_scale: false, data: [1] },
    { name: "tran2.v1#branch", is_scale: false, data: [2] },
  ];

  assert.deepEqual(findNamedTrace(vectors, ["v1#branch"], "tran2")?.data, [2]);
});

test("latest node voltages prefer the current stepped plot", () => {
  const vectors: SimVector[] = [
    { name: "time", is_scale: true, data: [0, 1] },
    { name: "tran1.v(out)", is_scale: false, data: [0, 1] },
    { name: "tran3.v(out)", is_scale: false, data: [0, 3] },
    { name: "tran2.v(out)", is_scale: false, data: [0, 2] },
  ];

  assert.deepEqual(
    [...latestNodeVoltages(vectors, ["out"], "tran3")],
    [["out", 3], ["0", 0]],
  );
});
