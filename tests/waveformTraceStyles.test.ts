import assert from "node:assert/strict";
import test from "node:test";

import {
  orderedPlotPathsForHighlight,
  tracePathRenderStyles,
} from "../src/editor/waveformTraceStyles.ts";

test("orderedPlotPathsForHighlight draws the highlighted trace last", () => {
  const paths = [
    { name: "a", d: "M0 0L1 1" },
    { name: "b", d: "M0 1L1 0" },
    { name: "c", d: "M1 1L2 2" },
  ];

  assert.deepEqual(
    orderedPlotPathsForHighlight(paths, "b").map((path) => path.name),
    ["a", "c", "b"],
  );
  assert.equal(orderedPlotPathsForHighlight(paths, null), paths);
});

test("tracePathRenderStyles makes exact duplicate paths visually distinguishable", () => {
  const styles = tracePathRenderStyles(
    [
      { name: "x", d: "M0 0L1 1" },
      { name: "h", d: "M0 0L1 1" },
      { name: "u", d: "M0 1L1 0" },
    ],
    null,
  );

  assert.equal(styles.get("x")?.duplicateCount, 2);
  assert.equal(styles.get("x")?.strokeDasharray, undefined);
  assert.equal(styles.get("h")?.duplicateCount, 2);
  assert.equal(styles.get("h")?.strokeDasharray, "7 4");
  assert.equal(styles.get("u")?.duplicateCount, 1);
});

test("tracePathRenderStyles keeps the highlighted duplicate solid", () => {
  const styles = tracePathRenderStyles(
    [
      { name: "x", d: "M0 0L1 1" },
      { name: "h", d: "M0 0L1 1" },
    ],
    "h",
  );

  assert.equal(styles.get("h")?.strokeDasharray, undefined);
  assert.equal(styles.get("x")?.duplicateCount, 2);
});
