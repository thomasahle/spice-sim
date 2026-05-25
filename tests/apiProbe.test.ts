import assert from "node:assert/strict";
import test from "node:test";

import { engineErrorMessage, nextHttpProbeCache } from "../src/sim/api.ts";

test("HTTP probe cache only latches successful bridge probes", () => {
  assert.equal(nextHttpProbeCache(false, false), false);
  assert.equal(nextHttpProbeCache(false, true), true);
  assert.equal(nextHttpProbeCache(true, false), true);
  assert.equal(nextHttpProbeCache(true, true), true);
});

test("HTTP engine errors extract readable messages from structured payloads", () => {
  assert.equal(
    engineErrorMessage({ error: { message: "could not find model NCH" } }, "HTTP 500"),
    "could not find model NCH",
  );
  assert.equal(
    engineErrorMessage({ error: { stderr: "singular matrix", stdout: "ignored" } }, "HTTP 500"),
    "singular matrix",
  );
  assert.equal(
    engineErrorMessage({ code: "NgspiceFailed", line: 12 }, "HTTP 500"),
    '{\n  "code": "NgspiceFailed",\n  "line": 12\n}',
  );
});
