import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSimulationErrorLog,
  summarizeSimulationError,
} from "../src/editor/simulationErrors.ts";

test("simulation errors classify floating/singular circuits", () => {
  const summary = summarizeSimulationError("simulation failed: singular matrix: check node n1");

  assert.equal(summary.status, "Simulation failed: circuit has a floating or singular node");
  assert.ok(summary.checks.some((check) => check.includes("GND")));
});

test("simulation errors classify SPICE syntax and value problems", () => {
  const summary = summarizeSimulationError("command failed (rc=1): source /tmp/x.cir\nError: bad real value");

  assert.equal(summary.status, "Simulation failed: SPICE syntax or value error");
  assert.ok(summary.checks.some((check) => check.includes("component values")));
});

test("simulation error log keeps actionable checks before raw details", () => {
  const log = formatSimulationErrorLog(
    summarizeSimulationError("timestep too small; trouble with node out"),
  );

  assert.match(log, /^Simulation failed: transient did not converge/);
  assert.match(log, /What to check:/);
  assert.match(log, /Engine details:/);
  assert.match(log, /timestep too small/);
});
