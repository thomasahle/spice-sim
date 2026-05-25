import assert from "node:assert/strict";
import test from "node:test";

import {
  compactInlineMathText,
  compactMathAtoms,
  estimateInlineMathTextWidth,
  parseInlineMathText,
  stripMathDelimiters,
} from "../src/editor/mathText.ts";

test("inline math parser attaches simple subscripts and superscripts", () => {
  assert.deepEqual(parseInlineMathText("W_-"), [
    { text: "W", sub: "-" },
  ]);
  assert.deepEqual(parseInlineMathText("V_{TH}^2"), [
    { text: "V", sub: "TH", sup: "2" },
  ]);
});

test("inline math parser maps common TeX commands to schematic glyphs", () => {
  assert.deepEqual(parseInlineMathText("\\Delta V_\\mu"), [
    { text: "Δ " },
    { text: "V", sub: "μ" },
  ]);
  assert.deepEqual(parseInlineMathText("x \\in \\mathbb{R}"), [
    { text: "x ∈ ℝ" },
  ]);
});

test("inline math parser keeps ordinary labels compact", () => {
  assert.deepEqual(parseInlineMathText("preactivation u"), [
    { text: "preactivation u" },
  ]);
});

test("inline math parser renders common braced text helpers readably", () => {
  assert.deepEqual(parseInlineMathText("I_{\\mathrm{up}} = \\frac{V_{DD}}{R_{bias}}"), [
    { text: "I", sub: "up" },
    { text: " = " },
    { text: "V", sub: "DD" },
    { text: "/" },
    { text: "R", sub: "bias" },
  ]);
  assert.deepEqual(parseInlineMathText("h = \\sqrt{u} + \\text{noise}"), [
    { text: "h = √u + noise" },
  ]);
  assert.deepEqual(parseInlineMathText("g_m = \\dfrac{\\partial I_D}{\\partial V_{GS}}"), [
    { text: "g", sub: "m" },
    { text: " = ∂ " },
    { text: "I", sub: "D" },
    { text: "/∂ " },
    { text: "V", sub: "GS" },
  ]);
  assert.deepEqual(parseInlineMathText("f = \\sqrt[3]{x}\\,\\Omega"), [
    { text: "f = 3√x Ω" },
  ]);
});

test("inline math parser renders engineering equation notation readably", () => {
  assert.deepEqual(parseInlineMathText("C_u\\dot{u} = I_{up} - I_{down}"), [
    { text: "C", sub: "u" },
    { text: "u̇ = " },
    { text: "I", sub: "up" },
    { text: " - " },
    { text: "I", sub: "down" },
  ]);
  assert.deepEqual(parseInlineMathText("h \\ge 0, x \\notin \\mathbb{Z}"), [
    { text: "h ≥ 0, x ∉ ℤ" },
  ]);
  assert.deepEqual(parseInlineMathText("u \\leq V_{DD}, y \\ne 0, a \\equiv b"), [
    { text: "u ≤ " },
    { text: "V", sub: "DD" },
    { text: ", y ≠ 0, a ≡ b" },
  ]);
  assert.deepEqual(parseInlineMathText("\\left( V_{DD} - u \\right)"), [
    { text: "( " },
    { text: "V", sub: "DD" },
    { text: " - u )" },
  ]);
  assert.deepEqual(parseInlineMathText("\\left\\langle x \\right\\rangle \\mapsto y"), [
    { text: "⟨ x ⟩ ↦ y" },
  ]);
});

test("inline math parser renders common pasted equation environments", () => {
  assert.deepEqual(
    parseInlineMathText("h = \\begin{cases}u, & u > 0 \\\\ \\alpha u, & u \\le 0\\end{cases}"),
    [
      { text: "h = { u, u > 0; α u, u ≤ 0 }" },
    ],
  );
  assert.deepEqual(
    parseInlineMathText("\\begin{aligned}I_u &= I_{up} - I_{down} \\\\ h &\\approx \\max(0,u)\\end{aligned}"),
    [
      { text: "I", sub: "u" },
      { text: " = " },
      { text: "I", sub: "up" },
      { text: " - " },
      { text: "I", sub: "down" },
      { text: "; h ≈ max(0,u)" },
    ],
  );
  assert.deepEqual(parseInlineMathText("\\begin{bmatrix}w^+ & w^-\\\\ x & h\\end{bmatrix}"), [
    { text: "[" },
    { text: "w", sup: "+" },
    { text: ", " },
    { text: "w", sup: "-" },
    { text: "; x, h]" },
  ]);
  assert.deepEqual(parseInlineMathText("\\begin{array}{cc}V_{in} & V_{out}\\\\ I_D & g_m\\end{array}"), [
    { text: "V", sub: "in" },
    { text: ", " },
    { text: "V", sub: "out" },
    { text: "; " },
    { text: "I", sub: "D" },
    { text: ", " },
    { text: "g", sub: "m" },
  ]);
  assert.deepEqual(parseInlineMathText("\\begin{equation*}u = I_{up} - I_{down}\\end{equation*}"), [
    { text: "u = " },
    { text: "I", sub: "up" },
    { text: " - " },
    { text: "I", sub: "down" },
  ]);
});

test("inline math parser renders pasted engineering notation wrappers", () => {
  assert.deepEqual(parseInlineMathText("\\boxed{V_{out}=0}"), [
    { text: "□(" },
    { text: "V", sub: "out" },
    { text: "=0)" },
  ]);
  assert.deepEqual(parseInlineMathText("\\bigl(V_{GS}-V_{TH}\\bigr)^2"), [
    { text: "(" },
    { text: "V", sub: "GS" },
    { text: "-" },
    { text: "V", sub: "TH" },
    { text: ")", sup: "2" },
  ]);
  assert.deepEqual(parseInlineMathText("\\overset{\\Delta}{w} = \\underset{t}{\\min}\\,E(t)"), [
    { text: "w", sup: "Δ" },
    { text: " = " },
    { text: "min", sub: "t" },
    { text: " E(t)" },
  ]);
  assert.deepEqual(parseInlineMathText("\\sum_{\\substack{i=1\\\\j\\ne i}}^N w_{ij}x_j"), [
    { text: "∑", sub: "i=1, j≠ i", sup: "N" },
    { text: " " },
    { text: "w", sub: "ij" },
    { text: "x", sub: "j" },
  ]);
  assert.deepEqual(parseInlineMathText("\\varphi, \\kappa, \\Psi, 25\\deg C"), [
    { text: "ϕ, κ, Ψ, 25° C" },
  ]);
});

test("inline math parser renders common annotation and set notation", () => {
  assert.deepEqual(parseInlineMathText("\\vec{x} \\parallel \\hat{n}, y \\perp z"), [
    { text: "x⃗ ∥ n̂, y ⊥ z" },
  ]);
  assert.deepEqual(parseInlineMathText("\\dot u + \\hat n + \\bar V_{ref}"), [
    { text: "u̇ + n̂ + " },
    { text: "V̅", sub: "ref" },
  ]);
  assert.deepEqual(parseInlineMathText("\\underline{active} \\Rightarrow V_{out}\\prime \\gg 0"), [
    { text: "a̲c̲t̲i̲v̲e̲ ⇒ " },
    { text: "V", sub: "out" },
    { text: "′ ≫ 0" },
  ]);
  assert.deepEqual(parseInlineMathText("\\overbrace{I_{up}-I_{down}}^{preact}"), [
    { text: "⏞(" },
    { text: "I", sub: "up" },
    { text: "-" },
    { text: "I", sub: "down" },
    { text: ")", sup: "preact" },
  ]);
  assert.deepEqual(parseInlineMathText("A \\subseteq B, C \\cap D = \\emptyset"), [
    { text: "A ⊆ B, C ∩ D = ∅" },
  ]);
  assert.deepEqual(parseInlineMathText("\\textcolor{red}{V_{GS}} \\gets \\color{blue}{V_{in}}"), [
    { text: "V", sub: "GS" },
    { text: " ← " },
    { text: "V", sub: "in" },
  ]);
  assert.deepEqual(parseInlineMathText("\\mathcal{L}\\{h(t)\\} = \\operatorname*{argmax}_{x} f(x)"), [
    { text: "𝓛{h(t)} = " },
    { text: "argmax", sub: "x" },
    { text: " f(x)" },
  ]);
  assert.deepEqual(parseInlineMathText("\\textbf{Node} \\emph{active} \\mathscr{H}"), [
    { text: "Node active 𝓗" },
  ]);
});

test("inline math parser handles unbraced text-style commands", () => {
  assert.deepEqual(parseInlineMathText("\\frac{\\mathrm d u}{\\mathrm d t} = \\mathcal L h"), [
    { text: "d u/d t = 𝓛 h" },
  ]);
  assert.deepEqual(parseInlineMathText("\\mathbb R \\ni x, \\operatorname Re\\{z\\}"), [
    { text: "ℝ ∋ x, Re{z}" },
  ]);
  assert.deepEqual(parseInlineMathText("\\mathbf V_{GS} - \\mathit i_D"), [
    { text: "V", sub: "GS" },
    { text: " - " },
    { text: "i", sub: "D" },
  ]);
});

test("inline math parser ignores common pasted math delimiters", () => {
  assert.equal(stripMathDelimiters("gain: $V_{out}/V_{in}$"), "gain: V_{out}/V_{in}");
  assert.equal(stripMathDelimiters("$$I_D = g_m V_{GS}$$"), "I_D = g_m V_{GS}");
  assert.equal(stripMathDelimiters("\\(V_{TH}\\) and \\[I_D\\]"), "V_{TH} and I_D");
  assert.equal(stripMathDelimiters("cost $5 and unmatched $"), "cost $5 and unmatched $");
  assert.equal(stripMathDelimiters("\\$5 label"), "\\$5 label");

  assert.deepEqual(parseInlineMathText("gain: $V_{out}/V_{in}$"), [
    { text: "gain: " },
    { text: "V", sub: "out" },
    { text: "/" },
    { text: "V", sub: "in" },
  ]);
  assert.deepEqual(parseInlineMathText("\\(I_D = g_m V_{GS}\\)"), [
    { text: "I", sub: "D" },
    { text: " = " },
    { text: "g", sub: "m" },
    { text: " " },
    { text: "V", sub: "GS" },
  ]);
});

test("inline math width estimator follows rendered atoms instead of raw markup", () => {
  const renderedPlain = estimateInlineMathTextWidth("VTH");
  const renderedSubscript = estimateInlineMathTextWidth("V_{TH}");
  const rawMarkup = estimateInlineMathTextWidth("V_\\{TH\\}");

  assert.ok(renderedSubscript > estimateInlineMathTextWidth("V"));
  assert.ok(renderedSubscript < renderedPlain);
  assert.ok(renderedSubscript < rawMarkup);
  assert.ok(estimateInlineMathTextWidth("\\Delta V_\\mu") > estimateInlineMathTextWidth("V_\\mu"));
});

test("inline math compaction truncates rendered atoms instead of raw markup", () => {
  assert.deepEqual(compactInlineMathText("V_{GS}", 20), [
    { text: "V", sub: "GS" },
  ]);

  const compacted = compactInlineMathText("ExtremelyLongSignal_{out}", 6);
  assert.equal(compacted.at(-1)?.text, "...");
  assert.ok(compacted.every((atom) => !atom.text.includes("_") && !atom.text.includes("{") && !atom.text.includes("}")));
  assert.ok(compacted.some((atom) => atom.text.startsWith("Ext")));
});

test("inline math compaction keeps whole math atoms when they fit", () => {
  assert.deepEqual(compactMathAtoms([
    { text: "V", sub: "GS" },
    { text: " " },
    { text: "gain" },
  ], 3), [
    { text: "V", sub: "GS" },
    { text: "..." },
  ]);
});
