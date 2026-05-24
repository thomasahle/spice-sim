import assert from "node:assert/strict";
import test from "node:test";

import {
  makeHistorySnapshot,
  popLatestHistorySnapshot,
  pushBoundedHistory,
  selectedIdsFromSnapshot,
} from "../src/editor/editorHistory.ts";
import { emptyDoc } from "../src/editor/model.ts";

test("history snapshots preserve selection ids with the document", () => {
  const snapshot = makeHistorySnapshot(emptyDoc, new Set(["r1", "w1"]));

  assert.equal(snapshot.doc, emptyDoc);
  assert.deepEqual(snapshot.selectedIds, ["r1", "w1"]);
  assert.deepEqual([...selectedIdsFromSnapshot(snapshot)], ["r1", "w1"]);
});

test("bounded history drops the oldest snapshot", () => {
  const first = makeHistorySnapshot(emptyDoc, ["a"]);
  const second = makeHistorySnapshot(emptyDoc, ["b"]);
  const third = makeHistorySnapshot(emptyDoc, ["c"]);

  const next = pushBoundedHistory([first, second], third, 2);

  assert.deepEqual(next.map((snapshot) => snapshot.selectedIds[0]), ["b", "c"]);
});

test("latest history snapshot can be popped for canceled previews", () => {
  const first = makeHistorySnapshot(emptyDoc, ["a"]);
  const second = makeHistorySnapshot(emptyDoc, ["b"]);

  const popped = popLatestHistorySnapshot([first, second]);

  assert.equal(popped.snapshot, second);
  assert.deepEqual(popped.history, [first]);
  assert.deepEqual(popLatestHistorySnapshot([]), { snapshot: null, history: [] });
});
