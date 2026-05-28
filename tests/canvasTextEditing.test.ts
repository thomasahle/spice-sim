import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_TEXT_EDIT_OPEN_SELECTION_WINDOW_MS,
  canvasTextEditSelection,
  canvasTextEditRequiresNonEmptyCommit,
  defaultCanvasTextEditFocusMode,
  isEditingCanvasText,
  normalizeCanvasTextEditCommitValue,
  shouldRestoreCanvasTextSelectionBeforeInput,
  shouldRenderCanvasText,
} from "../src/editor/canvasTextEditing.ts";

test("note edit mode starts at the source text instead of selecting rendered math", () => {
  assert.equal(defaultCanvasTextEditFocusMode("NOTE"), "start");
  assert.equal(defaultCanvasTextEditFocusMode("LABEL"), "select-all");
  assert.equal(defaultCanvasTextEditFocusMode("VALUE"), "select-all");
  assert.equal(defaultCanvasTextEditFocusMode("PROBE"), "select-all");
  assert.equal(defaultCanvasTextEditFocusMode("SUBX_PIN"), "select-all");
  assert.equal(defaultCanvasTextEditFocusMode("COMPONENT_LABEL"), "select-all");
});

test("canvas text focus selection matches replacement-oriented editing", () => {
  assert.deepEqual(canvasTextEditSelection("Equation notes", "NOTE"), {
    start: 0,
    end: 0,
    scroll: "start",
    scrollX: "start",
  });
  assert.deepEqual(canvasTextEditSelection("V_{TH}", "LABEL"), {
    start: 0,
    end: 6,
    scroll: "start",
    scrollX: "start",
  });
  assert.deepEqual(canvasTextEditSelection("1k", "VALUE"), {
    start: 0,
    end: 2,
    scroll: "start",
    scrollX: "start",
  });
  assert.deepEqual(canvasTextEditSelection("Vout", "PROBE"), {
    start: 0,
    end: 4,
    scroll: "start",
    scrollX: "start",
  });
  assert.deepEqual(canvasTextEditSelection("Vout", "PROBE", "end"), {
    start: 4,
    end: 4,
    scroll: "end",
    scrollX: "end",
  });
  assert.deepEqual(canvasTextEditSelection("x", "SUBX_PIN"), {
    start: 0,
    end: 1,
    scroll: "start",
    scrollX: "start",
  });
  assert.deepEqual(canvasTextEditSelection("input filter", "COMPONENT_LABEL"), {
    start: 0,
    end: 12,
    scroll: "start",
    scrollX: "start",
  });
});

test("fresh single-line edits restore replacement selection before first typed character", () => {
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "LABEL",
    key: "x",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: CANVAS_TEXT_EDIT_OPEN_SELECTION_WINDOW_MS,
  }), true);
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "VALUE",
    key: "2",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: 75,
  }), true);
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "PROBE",
    key: "_",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: 75,
  }), true);
});

test("first-key selection restore does not hijack notes, shortcuts, or settled edits", () => {
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "NOTE",
    key: "x",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: 75,
  }), false);
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "LABEL",
    key: "Enter",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: 75,
  }), false);
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "LABEL",
    key: "a",
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    elapsedMs: 75,
  }), false);
  assert.equal(shouldRestoreCanvasTextSelectionBeforeInput({
    kind: "LABEL",
    key: "x",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    elapsedMs: CANVAS_TEXT_EDIT_OPEN_SELECTION_WINDOW_MS + 1,
  }), false);
});

test("editing a note hides only that note render, leaving same-id text kinds alone", () => {
  const edit = { componentId: "text1", kind: "NOTE" as const };

  assert.equal(shouldRenderCanvasText(edit, "text1", "NOTE"), false);
  assert.equal(isEditingCanvasText(edit, "text1", "NOTE"), true);
  assert.equal(shouldRenderCanvasText(edit, "text1", "LABEL"), true);
  assert.equal(isEditingCanvasText(edit, "text1", "LABEL"), false);
  assert.equal(shouldRenderCanvasText(edit, "text1", "VALUE"), true);
  assert.equal(shouldRenderCanvasText(edit, "text1", "PROBE"), true);
  assert.equal(shouldRenderCanvasText(edit, "other", "NOTE"), true);
  assert.equal(isEditingCanvasText(edit, "other", "NOTE"), false);
});

test("editing a subcircuit body label hides value text without hiding annotations", () => {
  const edit = { componentId: "x1", kind: "VALUE" as const };

  assert.equal(shouldRenderCanvasText(edit, "x1", "VALUE"), false);
  assert.equal(isEditingCanvasText(edit, "x1", "VALUE"), true);
  assert.equal(shouldRenderCanvasText(edit, "x1", "NOTE"), true);
  assert.equal(isEditingCanvasText(edit, "x1", "NOTE"), false);
  assert.equal(shouldRenderCanvasText(null, "x1", "VALUE"), true);
  assert.equal(isEditingCanvasText(null, "x1", "VALUE"), false);
});

test("editing a probe label hides only that probe badge text", () => {
  const edit = { componentId: "probe1", kind: "PROBE" as const };

  assert.equal(shouldRenderCanvasText(edit, "probe1", "PROBE"), false);
  assert.equal(isEditingCanvasText(edit, "probe1", "PROBE"), true);
  assert.equal(shouldRenderCanvasText(edit, "probe1", "LABEL"), true);
  assert.equal(shouldRenderCanvasText(edit, "probe1", "VALUE"), true);
  assert.equal(shouldRenderCanvasText(edit, "other-probe", "PROBE"), true);
  assert.equal(isEditingCanvasText(edit, "other-probe", "PROBE"), false);
});

test("editing a subcircuit pin label hides only that pin label", () => {
  const edit = { componentId: "x1", kind: "SUBX_PIN" as const, pinIndex: 1 };

  assert.equal(shouldRenderCanvasText(edit, "x1", "SUBX_PIN", 1), false);
  assert.equal(isEditingCanvasText(edit, "x1", "SUBX_PIN", 1), true);
  assert.equal(shouldRenderCanvasText(edit, "x1", "SUBX_PIN", 0), true);
  assert.equal(isEditingCanvasText(edit, "x1", "SUBX_PIN", 0), false);
  assert.equal(shouldRenderCanvasText(edit, "x1", "VALUE"), true);
  assert.equal(shouldRenderCanvasText(edit, "x1", "COMPONENT_LABEL"), true);
  assert.equal(shouldRenderCanvasText(edit, "other", "SUBX_PIN"), true);
  assert.equal(isEditingCanvasText(edit, "other", "SUBX_PIN"), false);
});

test("editing a component user label hides only that label", () => {
  const edit = { componentId: "r1", kind: "COMPONENT_LABEL" as const };

  assert.equal(shouldRenderCanvasText(edit, "r1", "COMPONENT_LABEL"), false);
  assert.equal(isEditingCanvasText(edit, "r1", "COMPONENT_LABEL"), true);
  assert.equal(shouldRenderCanvasText(edit, "r1", "VALUE"), true);
  assert.equal(shouldRenderCanvasText(edit, "r1", "LABEL"), true);
  assert.equal(shouldRenderCanvasText(edit, "other", "COMPONENT_LABEL"), true);
  assert.equal(isEditingCanvasText(edit, "other", "COMPONENT_LABEL"), false);
});

test("commit normalization trims single-line canvas text but preserves notes", () => {
  assert.equal(normalizeCanvasTextEditCommitValue("  V_{TH}  ", "LABEL"), "V_{TH}");
  assert.equal(normalizeCanvasTextEditCommitValue("  2k  ", "VALUE"), "2k");
  assert.equal(normalizeCanvasTextEditCommitValue("  Vout  ", "PROBE"), "Vout");
  assert.equal(normalizeCanvasTextEditCommitValue("  input  ", "SUBX_PIN"), "input");
  assert.equal(normalizeCanvasTextEditCommitValue("  input filter  ", "COMPONENT_LABEL"), "input filter");
  assert.equal(normalizeCanvasTextEditCommitValue("  first line\n  second line  ", "NOTE"), "  first line\n  second line  ");
});

test("empty commits are rejected only for required schematic text", () => {
  assert.equal(canvasTextEditRequiresNonEmptyCommit("LABEL"), true);
  assert.equal(canvasTextEditRequiresNonEmptyCommit("VALUE"), true);
  assert.equal(canvasTextEditRequiresNonEmptyCommit("SUBX_PIN"), true);
  assert.equal(canvasTextEditRequiresNonEmptyCommit("NOTE"), false);
  assert.equal(canvasTextEditRequiresNonEmptyCommit("PROBE"), false);
  assert.equal(canvasTextEditRequiresNonEmptyCommit("COMPONENT_LABEL"), false);
});
