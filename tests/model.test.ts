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
  SWAPPABLE_PASSIVE_KINDS,
  updatePageMeta,
  uniquePageName,
  type CircuitDoc,
  type CircuitComponent,
  type ComponentKind,
  type Rotation,
  effectiveSubcircuitPinSidesForInstance,
} from "../src/editor/model.ts";

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
