import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

function exactCssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing exact CSS rule for ${selector}`);
  return match[1];
}

test("note edit mode is a wrapped raw source editor, not a rendered-note view", () => {
  const noteEditor = cssRule(".canvas-text-editor-overlay .canvas-text-editor.note-editor");
  const noteEditorOverlay = cssRule(".canvas-text-editor-overlay.note-editor-overlay");

  assert.match(noteEditor, /white-space:\s*pre-wrap;/);
  assert.match(noteEditor, /overflow:\s*auto;/);
  assert.match(noteEditor, /overflow-x:\s*hidden;/);
  assert.match(noteEditor, /overflow-wrap:\s*anywhere;/);
  assert.match(noteEditor, /font-family:\s*var\(--mono\);/);
  assert.match(noteEditor, /font-variant-ligatures:\s*none;/);
  assert.doesNotMatch(noteEditor, /word-break:\s*break-all;/);
  assert.match(noteEditor, /color-scheme:\s*light;/);
  assert.match(noteEditor, /background:\s*transparent;/);
  assert.match(noteEditor, /box-shadow:\s*none;/);
  assert.match(noteEditorOverlay, /color-scheme:\s*light;/);
  assert.match(noteEditorOverlay, /background:\s*var\(--text-editor-fill/);
  assert.match(noteEditorOverlay, /box-shadow:\s*none;/);
  assert.match(noteEditorOverlay, /backdrop-filter:\s*blur\(10px\)/);
});

test("rendered note text is suppressed while the same note is being edited", () => {
  const textEditingNote = cssRule(".component-group.text-editing .note-text");
  const editingNoteCard = cssRule(".note-card.editing");

  assert.match(textEditingNote, /display:\s*none;/);
  assert.match(editingNoteCard, /display:\s*none;/);
});

test("KaTeX canvas text is clipped inside its SVG text box", () => {
  const katex = cssRule(".svg-katex-text .katex");
  const katexHtml = cssRule(".svg-katex-text .katex-html");
  const netLabel = cssRule(".net-label-text .svg-katex-text");
  const netLabelKatex = cssRule(".net-label-text .svg-katex-text .katex");

  assert.match(katex, /max-width:\s*100%;/);
  assert.match(katex, /overflow:\s*hidden;/);
  assert.match(katex, /text-overflow:\s*clip;/);
  assert.match(katexHtml, /max-width:\s*100%;/);
  assert.match(katexHtml, /overflow:\s*hidden;/);
  assert.match(netLabel, /align-items:\s*center;/);
  assert.match(netLabel, /justify-content:\s*center;/);
  assert.match(netLabel, /overflow:\s*hidden;/);
  assert.match(netLabel, /text-align:\s*center;/);
  assert.match(netLabelKatex, /display:\s*inline-block;/);
  assert.match(netLabelKatex, /margin:\s*0 auto;/);
});

test("editable canvas text targets advertise text editing affordance", () => {
  assert.match(exactCssRule(".net-label-chip"), /cursor:\s*text;/);
  assert.match(exactCssRule(".note-card"), /cursor:\s*text;/);
  assert.match(exactCssRule(".component-value-label"), /cursor:\s*text;/);
  assert.match(exactCssRule(".component-user-label"), /cursor:\s*text;/);
  assert.match(exactCssRule(".probe-scope-label"), /cursor:\s*text;/);
});

test("live flow animation moves the stroke dash offset directly", () => {
  assert.doesNotMatch(styles, /@property\s+--flow-progress/);
  assert.match(styles, /@keyframes\s+wire-flow\s*\{[\s\S]*stroke-dashoffset:[\s\S]*-\s*var\(--flow-cycle/);
  assert.match(styles, /@keyframes\s+wire-flow-reverse\s*\{[\s\S]*stroke-dashoffset:[\s\S]*\+\s*var\(--flow-cycle/);

  const wireLive = cssRule(".wire-live");
  assert.match(wireLive, /stroke-dashoffset:\s*calc\(var\(--flow-offset/);
  assert.match(wireLive, /animation:\s*wire-flow\s+var\(--flow-duration/);
});
