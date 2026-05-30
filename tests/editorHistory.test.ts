import assert from "node:assert/strict";
import test from "node:test";

import {
  popLatestHistorySnapshot,
  pushBoundedHistory,
  type HistorySnapshot,
} from "../src/editor/editorHistory.ts";
import { emptyDoc } from "../src/editor/model.ts";

// Snapshots are plain documents now (selection no longer rides with history).
// The bounded-history helpers only shuffle array elements by identity, so we
// tag distinct doc objects to assert ordering.
function docNamed(name: string): HistorySnapshot {
  return { ...emptyDoc, directives: name };
}

test("bounded history drops the oldest snapshot", () => {
  const first = docNamed("a");
  const second = docNamed("b");
  const third = docNamed("c");

  const next = pushBoundedHistory([first, second], third, 2);

  assert.deepEqual(next.map((snapshot) => snapshot.directives), ["b", "c"]);
});

test("latest history snapshot can be popped for canceled previews", () => {
  const first = docNamed("a");
  const second = docNamed("b");

  const popped = popLatestHistorySnapshot([first, second]);

  assert.equal(popped.snapshot, second);
  assert.deepEqual(popped.history, [first]);
  assert.deepEqual(popLatestHistorySnapshot([]), { snapshot: null, history: [] });
});
