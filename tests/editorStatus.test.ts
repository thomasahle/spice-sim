import assert from "node:assert/strict";
import test from "node:test";

import { deletionStatus } from "../src/editor/editorStatus.ts";

test("deletion status reports selected objects", () => {
  assert.equal(deletionStatus(1, 0, 0, 0, 0), "Deleted 1 component");
  assert.equal(deletionStatus(2, 1, 1, 0, 0), "Deleted 2 components, 1 wire, 1 probe");
});

test("deletion status reports automatic cleanup", () => {
  assert.equal(
    deletionStatus(1, 0, 0, 2, 1),
    "Deleted 1 component; cleaned 2 wire stubs, 1 disconnected probe",
  );
});
