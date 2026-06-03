import assert from "node:assert/strict";
import test from "node:test";

import {
  boundsFromPoints,
  componentBoundsFor,
  componentVisualBoundsFor,
  noteRenderItems,
  noteRenderLines,
  noteTextLines,
  noteWidth,
  polylineInsideRect,
  pointOnPolylineBody,
  rectContainsBounds,
  rectContainsPoint,
  sameLineAndDirection,
  wireIntersectsRect,
} from "../src/editor/geometry.ts";
import { getPinLayout, type CircuitComponent } from "../src/editor/model.ts";

test("wireIntersectsRect catches segments crossing the marquee without vertices inside", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-5, 0],
        [5, 0],
      ],
      { x1: -1, y1: -1, x2: 1, y2: 1 },
    ),
    true,
  );
});

test("wireIntersectsRect catches vertical and elbow segment intersections", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-4, -4],
        [-4, 3],
        [4, 3],
      ],
      { x1: -5, y1: -1, x2: -3, y2: 1 },
    ),
    true,
  );
});

test("wireIntersectsRect returns false when the marquee misses the whole wire", () => {
  assert.equal(
    wireIntersectsRect(
      [
        [-5, -5],
        [-3, -5],
      ],
      { x1: -1, y1: -1, x2: 1, y2: 1 },
    ),
    false,
  );
});

// Window-mode marquee primitives (§12.4): selection requires FULL enclosure,
// unlike the crossing-mode wireIntersectsRect above.
test("polylineInsideRect requires every point inside (window mode, not crossing)", () => {
  const box = { x1: -1, y1: -1, x2: 1, y2: 1 };
  // A wire crossing the box but with endpoints outside is NOT window-selected,
  // even though crossing-mode would catch it.
  const crossing: [number, number][] = [
    [-5, 0],
    [5, 0],
  ];
  assert.equal(wireIntersectsRect(crossing, box), true);
  assert.equal(polylineInsideRect(crossing, box), false);
  // A wire fully inside the box IS window-selected.
  assert.equal(
    polylineInsideRect(
      [
        [-0.5, -0.5],
        [0.5, 0.5],
      ],
      box,
    ),
    true,
  );
  // A wire with one elbow poking out of the box is NOT selected.
  assert.equal(
    polylineInsideRect(
      [
        [-0.5, -0.5],
        [-0.5, 5],
        [0.5, 0.5],
      ],
      box,
    ),
    false,
  );
  assert.equal(polylineInsideRect([], box), false);
});

test("rectContainsBounds is true only when inner is fully enclosed", () => {
  const outer = { x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.equal(rectContainsBounds(outer, { x1: 2, y1: 2, x2: 8, y2: 8 }), true);
  assert.equal(rectContainsBounds(outer, { x1: 2, y1: 2, x2: 12, y2: 8 }), false);
  assert.equal(rectContainsBounds(outer, { x1: -1, y1: 2, x2: 8, y2: 8 }), false);
  // Coincident edges count as enclosed.
  assert.equal(rectContainsBounds(outer, { x1: 0, y1: 0, x2: 10, y2: 10 }), true);
});

test("rectContainsPoint includes the boundary", () => {
  const box = { x1: 0, y1: 0, x2: 4, y2: 4 };
  assert.equal(rectContainsPoint(box, 2, 2), true);
  assert.equal(rectContainsPoint(box, 0, 4), true);
  assert.equal(rectContainsPoint(box, 5, 2), false);
});

test("sameLineAndDirection drops a redundant collinear pass-through point", () => {
  assert.equal(sameLineAndDirection([0, 0], [1, 0], [2, 0]), true);
  // Same line but reversed direction (a backtrack) is NOT droppable.
  assert.equal(sameLineAndDirection([0, 0], [2, 0], [1, 0]), false);
  // Off the line.
  assert.equal(sameLineAndDirection([0, 0], [1, 0], [1, 1]), false);
});

test("pointOnPolylineBody includes interior wire vertices but not absolute endpoints", () => {
  const wire: [number, number][] = [
    [0, 0],
    [2, 0],
    [4, 0],
  ];

  assert.equal(pointOnPolylineBody({ x: 2, y: 0 }, wire), true);
  assert.equal(pointOnPolylineBody({ x: 1, y: 0 }, wire), true);
  assert.equal(pointOnPolylineBody({ x: 0, y: 0 }, wire), false);
  assert.equal(pointOnPolylineBody({ x: 4, y: 0 }, wire), false);
  assert.equal(pointOnPolylineBody({ x: 2, y: 0.25 }, wire), false);
});

test("boundsFromPoints returns padded finite bounds", () => {
  assert.deepEqual(boundsFromPoints([2, -1, Number.NaN], [4, -3, Infinity], 0.5), {
    x1: -1.5,
    y1: -3.5,
    x2: 2.5,
    y2: 4.5,
  });
});

test("boundsFromPoints returns null without finite points", () => {
  assert.equal(boundsFromPoints([], [], 1), null);
  assert.equal(boundsFromPoints([Number.NaN], [Infinity], 1), null);
});

test("large subcircuit bounds expand to cover all generated pins", () => {
  const subx: CircuitComponent = {
    id: "xlarge",
    kind: "SUBX",
    x: 10,
    y: 20,
    rotation: 0,
    value: "large_block",
    params: { npins: "20" },
  };
  const pins = getPinLayout(subx);
  const bounds = componentBoundsFor(subx);
  const visual = componentVisualBoundsFor(subx);
  const pinYs = pins.map((pin) => subx.y + pin.y);

  assert.equal(pins.length, 20);
  assert.ok(bounds.y2 - bounds.y1 > 5.6);
  assert.ok(visual.y2 - visual.y1 > 5.6);
  assert.ok(Math.min(...pinYs) >= bounds.y1);
  assert.ok(Math.max(...pinYs) <= bounds.y2);
});

test("custom subcircuit bounds expand to the symbol dimensions", () => {
  const subx: CircuitComponent = {
    id: "xcustom",
    kind: "SUBX",
    x: 10,
    y: 20,
    rotation: 0,
    value: "wide_block",
    params: { npins: "6", w: "8", h: "6" },
  };

  const bounds = componentBoundsFor(subx);
  const visual = componentVisualBoundsFor(subx);

  assert.ok(bounds.x1 < 5.3);
  assert.ok(bounds.x2 > 14.7);
  assert.ok(visual.y1 < 17);
  assert.ok(visual.y2 > 23);
});

test("subcircuit bounds expand for rendered math labels", () => {
  const plain: CircuitComponent = {
    id: "xplain",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu_cell",
    params: { npins: "2" },
  };
  const mathLabel: CircuitComponent = {
    ...plain,
    id: "xmath",
    value: "very_long_block_{relu}^{train}",
  };

  const plainBounds = componentVisualBoundsFor(plain);
  const mathBounds = componentVisualBoundsFor(mathLabel);

  assert.ok(mathBounds.x2 - mathBounds.x1 > plainBounds.x2 - plainBounds.x1);
});

test("mirrored visual bounds follow asymmetric symbols", () => {
  const opamp: CircuitComponent = {
    id: "op",
    kind: "OPAMP",
    x: 0,
    y: 0,
    rotation: 0,
    value: "OPAMP",
  };

  assert.deepEqual(componentVisualBoundsFor(opamp), { x1: -3, y1: -2.4, x2: 3.4, y2: 2.4 });
  assert.deepEqual(componentVisualBoundsFor({ ...opamp, mirrored: true }), {
    x1: -3.4,
    y1: -2.4,
    x2: 3,
    y2: 2.4,
  });
});

test("note text wrapping preserves pasted math environments", () => {
  const lines = noteTextLines(
    "h = \\begin{cases}u, & u > 0 \\\\ \\alpha u, & u \\le 0\\end{cases}\n" +
      "\\begin{aligned}I_u &= I_{up} - I_{down} \\\\ h &\\approx \\max(0,u)\\end{aligned}",
  );

  assert.deepEqual(lines, [
    "u,   u > 0",
    "\\alpha u,   u \\le 0",
    "I_u  = I_{up} - I_{down}",
    "h  \\approx \\max(0,u)",
  ]);
});

test("note text wrapping expands full-line pasted cases environments", () => {
  assert.deepEqual(noteTextLines("\\begin{cases*}u, & if $u>0$ \\\\ \\alpha u, & otherwise\\end{cases*}"), [
    "u,   if u>0",
    "\\alpha u,   otherwise",
  ]);
});

test("note text wrapping keeps multi-line math environments together", () => {
  assert.deepEqual(
    noteTextLines("Equation notes:\n\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}\n\\left\\lVert W \\right\\rVert_2 + \\operatorname{sgn}(x)"),
    [
      "Equation notes:",
      "u,   if u>0",
      "\\alpha u,   otherwise",
      "\\left\\lVert W \\right\\rVert_2 + \\operatorname{sgn}(x)",
    ],
  );
});

test("note render lines keep one KaTeX environment per pasted block", () => {
  const environment = "\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}";
  assert.deepEqual(noteRenderLines(`Equation notes:\n${environment}\nV_{TH}`), [
    "Equation notes:",
    environment,
    "V_{TH}",
  ]);
  assert.deepEqual(noteRenderItems(`Equation notes:\n${environment}\nV_{TH}`), [
    { text: "Equation notes:", row: 0 },
    { text: environment, row: 1 },
    { text: "V_{TH}", row: 3 },
  ]);
});

test("note text wrapping uses rendered math width and keeps TeX tokens intact", () => {
  assert.deepEqual(noteTextLines("\\mathcal{L}\\{h(t)\\} response"), [
    "\\mathcal{L}\\{h(t)\\} response",
  ]);

  const plain = noteTextLines("Supercalifragilisticexpialidocious");
  assert.ok(plain.length > 1);
  assert.equal(plain.join(""), "Supercalifragilisticexpialidocious");

  const mathToken = "V_{this_is_a_long_subscript_token}";
  assert.deepEqual(noteTextLines(mathToken), [mathToken]);
});

test("note width uses rendered math notation rather than raw TeX length", () => {
  const renderedMathWidth = noteWidth(["V_{TH} and \\Delta V_{GS} and I_{down}"]);
  const rawTextWidth = noteWidth(["V_\\{TH\\} and \\\\Delta V_\\{GS\\} and I_\\{down\\}"]);

  assert.ok(renderedMathWidth >= 4.8);
  assert.ok(renderedMathWidth < rawTextWidth);
});
