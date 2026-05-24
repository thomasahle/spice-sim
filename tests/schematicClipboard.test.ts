import assert from "node:assert/strict";
import test from "node:test";

import {
  clipboardHasContent,
  decodeSchematicClipboard,
  encodeSchematicClipboard,
  type SchematicClipboard,
} from "../src/editor/schematicClipboard.ts";

test("schematic clipboard round-trips selected topology as plain text", () => {
  const clipboard: SchematicClipboard = {
    components: [
      { id: "r1", kind: "R", x: 1, y: 2, rotation: 0, value: "1k" },
      { id: "label1", kind: "LABEL", x: -1, y: 2, rotation: 0, value: "+5V" },
    ],
    wires: [{ id: "w1", points: [[-1, 2], [1, 2], [3, 2]] }],
    probes: [{ id: "p1", x: 1, y: 2, color: "#0a84ff", label: "Vout" }],
  };

  assert.deepEqual(decodeSchematicClipboard(encodeSchematicClipboard(clipboard)), clipboard);
});

test("schematic clipboard ignores unrelated or malformed text", () => {
  assert.equal(decodeSchematicClipboard("plain text from another app"), null);
  assert.equal(decodeSchematicClipboard("application/x-spicesim-selection+json;version=1\nnot-json"), null);
});

test("schematic clipboard content check includes components, wires, and probes", () => {
  assert.equal(clipboardHasContent(null), false);
  assert.equal(clipboardHasContent({ components: [], wires: [], probes: [] }), false);
  assert.equal(
    clipboardHasContent({
      components: [],
      wires: [],
      probes: [{ id: "p1", x: 0, y: 0, color: "#0a84ff" }],
    }),
    true,
  );
});
