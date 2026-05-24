import assert from "node:assert/strict";
import test from "node:test";

import {
  inlineProbeScopeLabel,
  probeHasDisplayLabel,
  probeHasManualScopePlacement,
  shouldRenderInlineProbeScope,
} from "../src/editor/probeDisplay.ts";

test("probe display labels require explicit non-empty text", () => {
  assert.equal(probeHasDisplayLabel({ label: "Vout" }), true);
  assert.equal(probeHasDisplayLabel({ label: "  " }), false);
  assert.equal(probeHasDisplayLabel({}), false);
});

test("manual scope placement is treated as an explicit canvas scope", () => {
  assert.equal(probeHasManualScopePlacement({}), false);
  assert.equal(probeHasManualScopePlacement({ scopeDx: 1 }), true);
  assert.equal(probeHasManualScopePlacement({ scopeDy: -2 }), true);
});

test("unlabeled probe scopes stay off the canvas until backed by trace data", () => {
  assert.equal(shouldRenderInlineProbeScope({}), false);
  assert.equal(shouldRenderInlineProbeScope({}, { selected: true }), false);
  assert.equal(shouldRenderInlineProbeScope({}, { hovered: true }), false);
  assert.equal(shouldRenderInlineProbeScope({}, { dragging: true }), false);
  assert.equal(shouldRenderInlineProbeScope({}, { hasTrace: true }), true);
});

test("labeled or manually positioned probe scopes remain visible", () => {
  assert.equal(shouldRenderInlineProbeScope({ label: "Vout" }), true);
  assert.equal(shouldRenderInlineProbeScope({ scopeDx: 0.9, scopeDy: -3.05 }), true);
});

test("inline probe scope labels require an explicit probe or net label", () => {
  assert.equal(inlineProbeScopeLabel({ label: "Vout" }, "n2"), "Vout");
  assert.equal(inlineProbeScopeLabel({ label: "  " }, "out"), "out");
  assert.equal(inlineProbeScopeLabel({}, "out"), "out");
  assert.equal(inlineProbeScopeLabel({}, undefined), undefined);
  assert.equal(inlineProbeScopeLabel({}, ""), undefined);
});
