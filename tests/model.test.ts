import assert from "node:assert/strict";
import test from "node:test";

import {
  orderedSubcircuitPortLabels,
  flipRotation,
  getPinLayout,
  pinWorldPos,
  MAX_SUBCIRCUIT_PINS,
  rotationForKindSwap,
  subcircuitBodyWidth,
  subcircuitInstanceParamsForPage,
  subcircuitPinLabelsForInstance,
  subcircuitPinSidesForInstance,
  subcircuitPortCount,
  subcircuitPortLabels,
  subcircuitPageForInstance,
  swapTwoPinTerminals,
  SWAPPABLE_PASSIVE_KINDS,
  updatePageMeta,
  uniquePageName,
  type CircuitDoc,
  type CircuitComponent,
  type ComponentKind,
  type Rotation,
  type Wire,
  effectiveSubcircuitPinSidesForInstance,
} from "../src/editor/model.ts";
import {
  reorientComponent,
  transformGroupWires,
  transformPointAboutPivot,
  type PinMove,
} from "../src/editor/dragMath.ts";

function docWithPages(activePageId = "main"): CircuitDoc {
  return {
    pages: [
      { id: "main", name: "main", description: "", components: [], wires: [], probes: [] },
      { id: "relu", name: "relu_cell", description: "Reusable ReLU block", components: [], wires: [], probes: [] },
      { id: "filter", name: "filter_stage", description: "", components: [], wires: [], probes: [] },
    ],
    activePageId,
    directives: "",
    analysis: { kind: "op" },
  };
}

test("subcircuitPageForInstance resolves SUBX values to non-root schematic pages", () => {
  const instance: CircuitComponent = {
    id: "x1",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu_cell",
  };

  assert.equal(subcircuitPageForInstance(docWithPages(), instance)?.id, "relu");
});

test("subcircuitPageForInstance ignores non-subcircuit components and self references", () => {
  const resistor: CircuitComponent = {
    id: "r1",
    kind: "R",
    x: 0,
    y: 0,
    rotation: 0,
    value: "1k",
  };
  const selfInstance: CircuitComponent = {
    id: "x1",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu_cell",
  };

  assert.equal(subcircuitPageForInstance(docWithPages(), resistor), null);
  assert.equal(subcircuitPageForInstance(docWithPages("relu"), selfInstance), null);
});

test("mirrored components flip pin positions before rotation", () => {
  const opamp: CircuitComponent = {
    id: "op1",
    kind: "OPAMP",
    x: 10,
    y: 5,
    rotation: 0,
    mirrored: true,
    value: "OPAMP",
  };
  assert.deepEqual(getPinLayout(opamp), [
    { x: 3, y: -1 },
    { x: 3, y: 1 },
    { x: -3, y: 0 },
  ]);
  assert.deepEqual(pinWorldPos(opamp, 0), { x: 13, y: 4 });
  assert.deepEqual(pinWorldPos(opamp, 2), { x: 7, y: 5 });

  const rotated: CircuitComponent = { ...opamp, rotation: 90 };
  assert.deepEqual(pinWorldPos(rotated, 0), { x: 11, y: 8 });
  assert.deepEqual(pinWorldPos(rotated, 2), { x: 10, y: 2 });
});

test("swapTwoPinTerminals reverses a 2-pin part's polarity in place (rotation+180, pin set unchanged)", () => {
  // The in-place polarity swap used by Flip/Mirror on a lone 2-pin part: it is
  // rotation+=180, which for our left-right-symmetric symbols maps each pin onto
  // the other's position. The *set* of pin world-points is unchanged (so an
  // attached wire stays put) while pin index 0↔1 swaps (so +/− / netlist order
  // flip).
  const v: CircuitComponent = { id: "v1", kind: "V", x: 4, y: 3, rotation: 0, value: "5" };
  const swapped = swapTwoPinTerminals(v);
  assert.equal(swapped.rotation, 180);
  assert.deepEqual(pinWorldPos(v, 0), pinWorldPos(swapped, 1));
  assert.deepEqual(pinWorldPos(v, 1), pinWorldPos(swapped, 0));
  const setOf = (c: CircuitComponent) =>
    getPinLayout(c).map((_, i) => pinWorldPos(c, i)).sort((a, b) => a.x - b.x || a.y - b.y);
  assert.deepEqual(setOf(v), setOf(swapped));
  // Non-2-pin parts are returned unchanged.
  const npn: CircuitComponent = { id: "q1", kind: "NPN", x: 0, y: 0, rotation: 0, value: "" };
  assert.deepEqual(swapTwoPinTerminals(npn), npn);
});

test("the `mirrored` flag is a clean geometric reflection (x→−x) for every kind", () => {
  // Kept geometric so group rotate/flip composition stays correct.
  const npn: CircuitComponent = { id: "q1", kind: "NPN", x: 10, y: 0, rotation: 0, value: "" };
  assert.deepEqual(pinWorldPos(npn, 1), { x: 8, y: 0 }); // base at x−2
  assert.deepEqual(pinWorldPos({ ...npn, mirrored: true }, 1), { x: 12, y: 0 }); // reflected to x+2
});

test("transformPointAboutPivot rotates/reflects a group rigidly about the pivot", () => {
  const pivot = { x: 2, y: 2 };
  // Rotate CW about pivot (screen y-down): (dx,dy)→(−dy,dx).
  assert.deepEqual(transformPointAboutPivot({ x: 5, y: 2 }, "rotate-cw", pivot), { x: 2, y: 5 });
  assert.deepEqual(transformPointAboutPivot({ x: 5, y: 2 }, "rotate-ccw", pivot), { x: 2, y: -1 });
  // Flip across vertical / horizontal axis through the pivot.
  assert.deepEqual(transformPointAboutPivot({ x: 5, y: 7 }, "flip-h", pivot), { x: -1, y: 7 });
  assert.deepEqual(transformPointAboutPivot({ x: 5, y: 7 }, "flip-v", pivot), { x: 5, y: -3 });
  // Two opposite rotations return to start (rigidity).
  const p = { x: 4, y: 9 };
  assert.deepEqual(
    transformPointAboutPivot(transformPointAboutPivot(p, "rotate-cw", pivot), "rotate-ccw", pivot),
    p,
  );
});

test("transformGroupWires: selected & internal wires ride rigidly, boundary wires reroute, free wires untouched", () => {
  const pivot = { x: 0, y: 0 };
  // Two component pins move under a CW group rotation about the origin.
  const pinMoves: PinMove[] = [
    { from: { x: 2, y: 0 }, to: { x: 0, y: 2 } },
    { from: { x: -2, y: 0 }, to: { x: 0, y: -2 } },
  ];
  const wires: Wire[] = [
    { id: "wsel", points: [[1, 1], [1, 3]] }, // selected → rigid
    { id: "wint", points: [[2, 0], [-2, 0]] }, // both ends on moved pins → rigid (NOT deleted)
    { id: "wbnd", points: [[2, 0], [5, 0]] }, // one end on a moved pin → reroute that end
    { id: "wfree", points: [[10, 10], [12, 10]] }, // touches nothing moving → untouched
  ];
  const out = transformGroupWires(
    wires,
    new Set(["wsel"]),
    pinMoves,
    "rotate-cw",
    pivot,
    true,
  );
  const byId = Object.fromEntries(out.map((w) => [w.id, w.points]));
  // Every input wire survives — none collapsed to a degenerate self-loop.
  assert.equal(out.length, 4);
  assert.deepEqual(byId.wsel, [[-1, 1], [-3, 1]]);
  assert.deepEqual(byId.wint, [[0, 2], [0, -2]]);
  // Boundary wire: moved end follows its pin to (0,2), far end stays at (5,0).
  assert.deepEqual(byId.wbnd[0], [0, 2]);
  assert.deepEqual(byId.wbnd[byId.wbnd.length - 1], [5, 0]);
  assert.deepEqual(byId.wfree, [[10, 10], [12, 10]]);
});

test("reorientComponent flip-h / flip-v are clean geometric reflections", () => {
  // flip-h = reflect across the vertical axis: toggle mirror, rotation→(360−r).
  // flip-v = R₁₈₀ ∘ flip-h: toggle mirror, rotation→(540−r)%360.
  const c: CircuitComponent = { id: "x1", kind: "NMOS", x: 0, y: 0, rotation: 90, value: "" };
  const h = reorientComponent(c, "flip-h");
  assert.equal(h.mirrored, true);
  assert.equal(h.rotation, 270); // 360−90
  const v = reorientComponent(c, "flip-v");
  assert.equal(v.mirrored, true);
  assert.equal(v.rotation, 90); // (540−90)%360
  // Reflecting twice on the same axis is identity.
  assert.deepEqual(reorientComponent(h, "flip-h"), { ...c, mirrored: undefined });
});

test("uniquePageName sanitizes schematic names and avoids collisions", () => {
  assert.equal(uniquePageName(docWithPages(), "filter stage", "relu"), "filter_stage_2");
  assert.equal(uniquePageName(docWithPages(), "analog/filter", "relu"), "analog_filter");
  assert.equal(uniquePageName(docWithPages(), "", "relu", "sub"), "sub");
});

test("updatePageMeta renames matching subcircuit instances when a page is renamed", () => {
  const doc = docWithPages();
  const withInstance: CircuitDoc = {
    ...doc,
    pages: doc.pages.map((page) =>
      page.id === "main"
        ? {
            ...page,
            components: [
              {
                id: "x1",
                kind: "SUBX",
                x: 0,
                y: 0,
                rotation: 0,
                value: "relu_cell",
              },
              {
                id: "x2",
                kind: "SUBX",
                x: 4,
                y: 0,
                rotation: 0,
                value: "filter_stage",
              },
            ],
          }
        : page,
    ),
  };

  const renamed = updatePageMeta(withInstance, "relu", { name: "relu block" });
  const root = renamed.pages[0];

  assert.equal(renamed.pages.find((page) => page.id === "relu")?.name, "relu_block");
  assert.equal(root.components[0].value, "relu_block");
  assert.equal(root.components[1].value, "filter_stage");
});

test("orderedSubcircuitPortLabels preserves explicit pin order before geometry fallback", () => {
  assert.deepEqual(
    orderedSubcircuitPortLabels({
      id: "sub",
      name: "cell",
      description: "",
      wires: [],
      probes: [],
      components: [
        { id: "y", kind: "LABEL", x: 8, y: 0, rotation: 0, value: "Y", params: { port: "1", portOrder: "3" } },
        { id: "a", kind: "LABEL", x: -8, y: 4, rotation: 0, value: "A", params: { port: "1", portOrder: "1" } },
        { id: "b", kind: "LABEL", x: -8, y: -4, rotation: 0, value: "B", params: { port: "1", portOrder: "2" } },
        { id: "internal", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "n_internal" },
      ],
    }),
    ["A", "B", "Y"],
  );
});

test("subcircuitPortLabels deduplicates ports and clamps public pin count", () => {
  const manyPorts = Array.from({ length: MAX_SUBCIRCUIT_PINS + 3 }, (_, idx) => ({
    id: `p${idx}`,
    kind: "LABEL" as const,
    x: idx < 34 ? -8 : 8,
    y: idx,
    rotation: 0 as const,
    value: idx === 1 ? "P0" : `P${idx}`,
    params: { port: "1", portOrder: String(idx + 1) },
  }));
  const page = {
    id: "sub",
    name: "wide",
    description: "",
    components: manyPorts,
    wires: [],
    probes: [],
  };

  assert.equal(subcircuitPortLabels(page).length, MAX_SUBCIRCUIT_PINS + 2);
  assert.equal(subcircuitPortCount(page), MAX_SUBCIRCUIT_PINS);
  assert.deepEqual(
    subcircuitPortLabels({ ...page, components: [] }),
    [],
  );
  assert.equal(subcircuitPortCount({ ...page, components: [] }), 0);
});

test("subcircuitInstanceParamsForPage captures public pin sides from schematic geometry", () => {
  const page = {
    id: "sub",
    name: "relu_cell",
    description: "",
    wires: [],
    probes: [],
    components: [
      { id: "x", kind: "LABEL" as const, x: -8, y: -2, rotation: 0 as const, value: "x", params: { port: "1", portOrder: "1" } },
      { id: "dp", kind: "LABEL" as const, x: -8, y: 0, rotation: 0 as const, value: "dp", params: { port: "1", portOrder: "2" } },
      { id: "h", kind: "LABEL" as const, x: 8, y: -2, rotation: 0 as const, value: "h", params: { port: "1", portOrder: "3" } },
      { id: "wp", kind: "LABEL" as const, x: 8, y: 0, rotation: 0 as const, value: "wp", params: { port: "1", portOrder: "4" } },
      { id: "internal", kind: "LABEL" as const, x: 0, y: 0, rotation: 0 as const, value: "u_internal" },
    ],
  };

  assert.deepEqual(subcircuitInstanceParamsForPage(page), {
    npins: "4",
    pinSides: "LLRR",
  });
});

test("subcircuitInstanceParamsForPage captures top and bottom ports from schematic geometry", () => {
  const page = {
    id: "sub",
    name: "cell",
    description: "",
    wires: [],
    probes: [],
    components: [
      { id: "vdd", kind: "LABEL" as const, x: 0, y: -8, rotation: 0 as const, value: "vdd", params: { port: "1", portOrder: "1" } },
      { id: "x", kind: "LABEL" as const, x: -8, y: 0, rotation: 0 as const, value: "x", params: { port: "1", portOrder: "2" } },
      { id: "h", kind: "LABEL" as const, x: 8, y: 0, rotation: 0 as const, value: "h", params: { port: "1", portOrder: "3" } },
      { id: "vss", kind: "LABEL" as const, x: 0, y: 8, rotation: 0 as const, value: "vss", params: { port: "1", portOrder: "4" } },
    ],
  };

  assert.deepEqual(subcircuitInstanceParamsForPage(page), {
    npins: "4",
    pinSides: "TLRB",
  });
});

test("subcircuitInstanceParamsForPage lets explicit port sides override geometry", () => {
  const page = {
    id: "sub",
    name: "cell",
    description: "",
    wires: [],
    probes: [],
    components: [
      { id: "vdd", kind: "LABEL" as const, x: -8, y: 0, rotation: 0 as const, value: "vdd", params: { port: "1", portOrder: "1", portSide: "T" } },
      { id: "x", kind: "LABEL" as const, x: -8, y: 2, rotation: 0 as const, value: "x", params: { port: "1", portOrder: "2" } },
      { id: "h", kind: "LABEL" as const, x: 8, y: 2, rotation: 0 as const, value: "h", params: { port: "1", portOrder: "3", portSide: "B" } },
      { id: "vss", kind: "LABEL" as const, x: 8, y: 0, rotation: 0 as const, value: "vss", params: { port: "1", portOrder: "4", portSide: "not-a-side" } },
    ],
  };

  assert.deepEqual(subcircuitInstanceParamsForPage(page), {
    npins: "4",
    pinSides: "TLBR",
  });
});

test("subcircuitInstanceParamsForPage preserves explicit sides even when ports are vertically aligned", () => {
  const page = {
    id: "sub",
    name: "power_pin_cell",
    description: "",
    wires: [],
    probes: [],
    components: [
      { id: "vdd", kind: "LABEL" as const, x: -4, y: -2, rotation: 0 as const, value: "vdd", params: { port: "1", portOrder: "1", portSide: "T" } },
      { id: "x", kind: "LABEL" as const, x: -4, y: 0, rotation: 0 as const, value: "x", params: { port: "1", portOrder: "2" } },
      { id: "vss", kind: "LABEL" as const, x: -4, y: 2, rotation: 0 as const, value: "vss", params: { port: "1", portOrder: "3", portSide: "B" } },
    ],
  };

  assert.deepEqual(subcircuitInstanceParamsForPage(page), {
    npins: "3",
    pinSides: "TLB",
  });
});

test("SUBX pin layout honors explicit pin side hints", () => {
  const subx: CircuitComponent = {
    id: "xrelu",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu_cell",
    params: { npins: "7", pinSides: "LLLLLLR" },
  };

  const pins = getPinLayout(subx);

  assert.equal(pins.length, 7);
  assert.deepEqual(pins.map((pin) => Math.sign(pin.x)), [-1, -1, -1, -1, -1, -1, 1]);
  assert.ok(pins[0].y < pins[5].y);
  assert.equal(pins[6].y, 0);
});

test("SUBX pin layout supports top and bottom side hints", () => {
  const subx: CircuitComponent = {
    id: "xcell",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "cell",
    params: { npins: "4", pinSides: "TLRB" },
  };

  const pins = getPinLayout(subx);

  assert.deepEqual(subcircuitPinSidesForInstance(subx), ["T", "L", "R", "B"]);
  assert.ok(pins[0].y < -1);
  assert.ok(pins[1].x < -2);
  assert.ok(pins[2].x > 2);
  assert.ok(pins[3].y > 1);
});

test("SUBX effective pin sides expose the legacy fallback for editing", () => {
  const subx: CircuitComponent = {
    id: "xlegacy",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "legacy",
    params: { npins: "5" },
  };

  assert.equal(subcircuitPinSidesForInstance(subx), null);
  assert.deepEqual(effectiveSubcircuitPinSidesForInstance(subx), ["L", "L", "L", "R", "R"]);
});

test("SUBX pin layout supports large reusable blocks without truncating at 16 pins", () => {
  const subx: CircuitComponent = {
    id: "xwide",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "wide",
    params: { npins: "20" },
  };

  assert.equal(getPinLayout(subx).length, 20);
  assert.equal(getPinLayout({ ...subx, params: { npins: "100" } }).length, MAX_SUBCIRCUIT_PINS);
});

test("SUBX default width scales with pin count without overriding explicit sizes", () => {
  const compact: CircuitComponent = {
    id: "xsmall",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "cell",
    params: { npins: "4" },
  };
  const dense: CircuitComponent = {
    ...compact,
    id: "xdense",
    params: { npins: "20" },
  };
  const resized: CircuitComponent = {
    ...dense,
    params: { npins: "20", w: "5" },
  };

  assert.equal(subcircuitBodyWidth(compact), 4.8);
  assert.ok(subcircuitBodyWidth(dense) > subcircuitBodyWidth(compact));
  assert.equal(subcircuitBodyWidth(resized), 5);
});

test("subcircuitPinLabelsForInstance resolves displayed instance pin labels", () => {
  const doc = docWithPages();
  const withPorts: CircuitDoc = {
    ...doc,
    pages: doc.pages.map((page) =>
      page.id === "relu"
        ? {
            ...page,
            components: [
              { id: "x", kind: "LABEL", x: -2, y: -1, rotation: 0, value: "x", params: { port: "1", portOrder: "1" } },
              { id: "dpos", kind: "LABEL", x: -2, y: 0, rotation: 0, value: "d+", params: { port: "1", portOrder: "2" } },
              { id: "h", kind: "LABEL", x: 2, y: -1, rotation: 0, value: "h", params: { port: "1", portOrder: "3" } },
              { id: "internal", kind: "LABEL", x: 0, y: 0, rotation: 0, value: "u_internal" },
            ],
          }
        : page,
    ),
  };
  const instance: CircuitComponent = {
    id: "xrelu",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "relu_cell",
    params: { npins: "2" },
  };

  assert.deepEqual(subcircuitPinLabelsForInstance(withPorts, instance), ["x", "d+"]);
});

test("SUBX pin layout follows custom symbol dimensions", () => {
  const subx: CircuitComponent = {
    id: "xcustom",
    kind: "SUBX",
    x: 0,
    y: 0,
    rotation: 0,
    value: "custom_block",
    params: { npins: "6", w: "8", h: "6" },
  };

  const pins = getPinLayout(subx);

  assert.deepEqual(pins.slice(0, 3), [
    { x: -4.6, y: -2.4 },
    { x: -4.6, y: 0 },
    { x: -4.6, y: 2.4 },
  ]);
  assert.deepEqual(pins.slice(3), [
    { x: 4.6, y: -2.4 },
    { x: 4.6, y: 0 },
    { x: 4.6, y: 2.4 },
  ]);
});

function passive(kind: ComponentKind, rotation: Rotation, mirrored = false): CircuitComponent {
  return { id: "x1", kind, x: 4, y: 3, rotation, value: "1k", mirrored: mirrored || undefined };
}

function sortedPinWorld(c: CircuitComponent): { x: number; y: number }[] {
  return getPinLayout(c)
    .map((_, i) => pinWorldPos(c, i))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

test("flipRotation reflects rotation across the horizontal axis", () => {
  assert.equal(flipRotation(0), 180);
  assert.equal(flipRotation(90), 90);
  assert.equal(flipRotation(180), 0);
  assert.equal(flipRotation(270), 270);
});

test("vertical flip (mirror + flipRotation) reflects every pin about the component centre", () => {
  for (const kind of ["R", "C", "NMOS", "OPAMP"] as ComponentKind[]) {
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const c = passive(kind, rotation);
      const flipped: CircuitComponent = {
        ...c,
        mirrored: c.mirrored ? undefined : true,
        rotation: flipRotation(c.rotation),
      };
      const expected = getPinLayout(c)
        .map((_, i) => {
          const p = pinWorldPos(c, i);
          return { x: p.x, y: 2 * c.y - p.y };
        })
        .sort((a, b) => a.x - b.x || a.y - b.y);
      assert.deepEqual(sortedPinWorld(flipped), expected, `${kind} @ ${rotation}`);
    }
  }
});

test("rotationForKindSwap keeps both passive pins at their world positions", () => {
  for (const from of SWAPPABLE_PASSIVE_KINDS) {
    for (const to of SWAPPABLE_PASSIVE_KINDS) {
      for (const rotation of [0, 90, 180, 270] as Rotation[]) {
        const before = passive(from, rotation);
        const after: CircuitComponent = {
          ...before,
          kind: to,
          rotation: rotationForKindSwap(from, to, rotation),
        };
        assert.deepEqual(
          sortedPinWorld(after),
          sortedPinWorld(before),
          `${from}->${to} @ ${rotation}`,
        );
      }
    }
  }
});
