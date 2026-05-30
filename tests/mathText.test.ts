import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateDisplayMathTextWidth,
  displayMathTextLines,
  estimateInlineMathTextWidth,
  stripMathDelimiters,
} from "../src/editor/mathText.ts";
import { normalizeKatexSource, renderKatexHtml } from "../src/editor/katexRender.ts";

test("KaTeX renderer produces HTML for inline and display math", () => {
  assert.match(renderKatexHtml("V_{TH}"), /class="katex"/);
  assert.match(renderKatexHtml("\\begin{cases*}u, & if $u>0$ \\\\ \\alpha u, & otherwise\\end{cases*}"), /class="katex"/);
  assert.doesNotMatch(
    renderKatexHtml("\\\\begin{cases*}u, & if $u>0$ \\\\ \\\\alpha u, & otherwise\\\\end{cases*}"),
    /katex-error/,
  );
});

test("KaTeX renderer handles a multiline note math block without leaking raw TeX", () => {
  const source = "\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}";
  const html = renderKatexHtml(source);

  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /katex-error/);
  assert.doesNotMatch(html, /\\begin/);
  assert.doesNotMatch(html, /\\end/);
});

test("KaTeX source normalizer handles pasted math wrappers", () => {
  assert.equal(stripMathDelimiters("gain: $V_{out}/V_{in}$"), "gain: V_{out}/V_{in}");
  assert.equal(stripMathDelimiters("\\(V_{TH}\\) and \\[I_D\\]"), "V_{TH} and I_D");
  assert.equal(stripMathDelimiters("cost $5 and unmatched $"), "cost $5 and unmatched $");
  assert.equal(stripMathDelimiters("\\$5 label"), "\\$5 label");

  assert.equal(
    normalizeKatexSource("\\begin{cases*}u, & if $u>0$ \\\\ \\alpha u, & otherwise\\end{cases*}"),
    "\\begin{cases}u, & \\text{if } u>0 \\\\[0.28em] \\alpha u, & \\text{otherwise}\\end{cases}",
  );
  assert.equal(
    normalizeKatexSource("\\\\begin{cases*}u, & if $u>0$ \\\\ \\\\alpha u, & otherwise\\\\end{cases*}"),
    "\\begin{cases}u, & \\text{if } u>0 \\\\[0.28em] \\alpha u, & \\text{otherwise}\\end{cases}",
  );
});

test("KaTeX source normalizer preserves prose around inline math", () => {
  assert.equal(
    normalizeKatexSource("h follows $u$ above threshold"),
    "\\text{h follows}~u~\\text{above threshold}",
  );
  assert.equal(
    normalizeKatexSource("gain: $V_{out}/V_{in}$"),
    "\\text{gain:}~V_{out}/V_{in}",
  );
  assert.equal(
    normalizeKatexSource("cost $5 and unmatched $"),
    "\\text{cost \\$5 and unmatched \\$}",
  );
  assert.match(renderKatexHtml("h follows $u$ above threshold"), /class="katex"/);
  assert.match(renderKatexHtml("cost $5 and unmatched $"), /\$5/);
});

test("KaTeX source normalizer treats signed net names as text", () => {
  assert.equal(normalizeKatexSource("bias+"), "\\text{bias+}");
  assert.equal(normalizeKatexSource("bias-"), "\\text{bias-}");
  assert.equal(normalizeKatexSource("W_+"), "W_+");
  assert.equal(normalizeKatexSource("V_{TH}"), "V_{TH}");
  assert.match(renderKatexHtml("bias+"), /class="katex"/);
});

test("display math line helper estimates multiline note height without rendering glyphs", () => {
  assert.deepEqual(
    displayMathTextLines("\\begin{cases*}u, & if $u>0$ \\\\ \\alpha u, & otherwise\\end{cases*}"),
    [
      "u,   if u>0",
      "\\alpha u,   otherwise",
    ],
  );
  assert.deepEqual(displayMathTextLines("V_{TH} + \\Delta V"), [
    "V_{TH} + \\Delta V",
  ]);
});

test("math width helper remains a layout estimate only", () => {
  const renderedPlain = estimateInlineMathTextWidth("VTH");
  const renderedSubscript = estimateInlineMathTextWidth("V_{TH}");
  const rawMarkup = estimateInlineMathTextWidth("V_\\{TH\\}");

  assert.ok(renderedSubscript > estimateInlineMathTextWidth("V"));
  assert.ok(renderedSubscript < rawMarkup);
  assert.ok(renderedPlain > 0);
});

test("display math width uses rendered rows instead of raw environment markup", () => {
  const environment = "\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}";

  assert.ok(estimateDisplayMathTextWidth(environment) < estimateInlineMathTextWidth(environment));
  assert.ok(estimateDisplayMathTextWidth(environment) >= estimateInlineMathTextWidth("\\alpha u,   otherwise"));
});
