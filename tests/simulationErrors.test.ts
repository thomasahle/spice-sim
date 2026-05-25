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

test("simulation errors strip object-string prefixes while preserving engine details", () => {
  const summary = summarizeSimulationError(
    "[object Object] warning, can't find model 'missing_n' from line\ncould not find a valid modelname",
  );
  const log = formatSimulationErrorLog(summary);

  assert.equal(summary.status, "Simulation failed: missing model or subcircuit");
  assert.doesNotMatch(log, /\[object Object\]/);
  assert.match(log, /can't find model 'missing_n'/);
  assert.match(log, /could not find a valid modelname/);
});
