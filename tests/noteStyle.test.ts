import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTE_COLOR_PALETTE,
  NOTE_COLOR_PRESETS,
  noteColor,
  noteColorForIndex,
  noteFillColor,
  noteStrokeColor,
  withDefaultNoteColor,
} from "../src/editor/noteStyle.ts";

test("note colors cycle through the annotation palette", () => {
  assert.deepEqual(
    NOTE_COLOR_PALETTE,
    NOTE_COLOR_PRESETS.map((preset) => preset.color),
  );
  assert.deepEqual(
    NOTE_COLOR_PRESETS.map((preset) => preset.label),
    [
      "Preactivation",
      "Activation",
      "Learning",
      "Signal path",
      "Warning",
      "Measurement",
      "Control",
      "Reference",
    ],
  );
  assert.equal(noteColorForIndex(0), NOTE_COLOR_PALETTE[0]);
  assert.equal(noteColorForIndex(NOTE_COLOR_PALETTE.length), NOTE_COLOR_PALETTE[0]);
  assert.equal(noteColorForIndex(NOTE_COLOR_PALETTE.length + 2), NOTE_COLOR_PALETTE[2]);
});

test("new notes receive default colors without replacing explicit colors", () => {
  const note = {
    id: "note1",
    kind: "NOTE",
    x: 0,
    y: 0,
    rotation: 0,
    value: "Note",
  } as const;
  const colored = withDefaultNoteColor(note, 2);

  assert.equal(colored.params?.color, NOTE_COLOR_PALETTE[2]);
  assert.equal(noteColor(colored), NOTE_COLOR_PALETTE[2]);

  const explicit = withDefaultNoteColor({ ...note, params: { color: "#123456" } }, 4);
  assert.equal(explicit.params?.color, "#123456");
});

test("note color helpers produce translucent SVG colors", () => {
  const note = {
    id: "note1",
    kind: "NOTE",
    x: 0,
    y: 0,
    rotation: 0,
    value: "Note",
    params: { color: "#34c759" },
  } as const;

  assert.equal(noteFillColor(note), "#34c7591a");
  assert.equal(noteStrokeColor(note), "#34c759b8");
  assert.equal(noteFillColor(note, true), "#34c75929");
  assert.equal(noteStrokeColor(note, true), "#34c759f2");
});
