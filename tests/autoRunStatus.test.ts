import assert from "node:assert/strict";
import test from "node:test";

import { describeAutoRunStatus } from "../src/editor/autoRunStatus.ts";

const ready = {
  autoRun: true,
  running: false,
  engineOk: true,
  tool: "select",
  interactionActive: false,
  componentCount: 3,
  hasGround: true,
  hasStimulus: true,
};

test("auto-run status reports off and ready states", () => {
  assert.deepEqual(
    pick(describeAutoRunStatus({ ...ready, autoRun: false })),
    { state: "off", buttonLabel: "Auto: Off", statusLabel: "off", paused: false, runnable: false },
  );
  assert.deepEqual(
    pick(describeAutoRunStatus(ready)),
    { state: "ready", buttonLabel: "Auto: On", statusLabel: "on", paused: false, runnable: true },
  );
});

test("auto-run status explains paused states before runnable states", () => {
  assert.deepEqual(
    pick(describeAutoRunStatus({ ...ready, tool: "wire" })),
    { state: "paused-tool", buttonLabel: "Auto: Paused", statusLabel: "paused", paused: true, runnable: false },
  );
  assert.deepEqual(
    pick(describeAutoRunStatus({ ...ready, interactionActive: true })),
    { state: "paused-interaction", buttonLabel: "Auto: Paused", statusLabel: "paused", paused: true, runnable: false },
  );
});

test("auto-run status explains why incomplete circuits do not run", () => {
  assert.equal(describeAutoRunStatus({ ...ready, componentCount: 0 }).state, "empty");
  assert.equal(describeAutoRunStatus({ ...ready, componentCount: 1 }).state, "needs-circuit");
  assert.equal(describeAutoRunStatus({ ...ready, hasGround: false }).state, "needs-ground");
  assert.equal(describeAutoRunStatus({ ...ready, hasStimulus: false }).state, "needs-source");
});

test("auto-run status reports engine and active run states", () => {
  assert.deepEqual(
    pick(describeAutoRunStatus({ ...ready, running: true })),
    { state: "running", buttonLabel: "Auto: Running", statusLabel: "running", paused: false, runnable: false },
  );
  assert.equal(describeAutoRunStatus({ ...ready, engineOk: false }).state, "engine-offline");
});

function pick(status: ReturnType<typeof describeAutoRunStatus>) {
  return {
    state: status.state,
    buttonLabel: status.buttonLabel,
    statusLabel: status.statusLabel,
    paused: status.paused,
    runnable: status.runnable,
  };
}
