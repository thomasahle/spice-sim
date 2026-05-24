import assert from "node:assert/strict";
import test from "node:test";

import { nextHttpProbeCache } from "../src/sim/api.ts";

test("HTTP probe cache only latches successful bridge probes", () => {
  assert.equal(nextHttpProbeCache(false, false), false);
  assert.equal(nextHttpProbeCache(false, true), true);
  assert.equal(nextHttpProbeCache(true, false), true);
  assert.equal(nextHttpProbeCache(true, true), true);
});
