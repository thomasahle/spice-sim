import assert from "node:assert/strict";
import test from "node:test";

import { isIndependentSourceKind, isSimulationStimulusKind } from "../src/editor/sourceKinds.ts";

test("independent sources remain the only sweepable source kinds", () => {
  assert.equal(isIndependentSourceKind("V"), true);
  assert.equal(isIndependentSourceKind("I"), true);
  assert.equal(isIndependentSourceKind("B"), false);
  assert.equal(isIndependentSourceKind("R"), false);
});

test("behavioral sources count as simulation stimuli for auto-run gating", () => {
  assert.equal(isSimulationStimulusKind("V"), true);
  assert.equal(isSimulationStimulusKind("I"), true);
  assert.equal(isSimulationStimulusKind("B"), true);
  assert.equal(isSimulationStimulusKind("C"), false);
});
