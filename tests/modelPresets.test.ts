import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_MODEL_DEFINITIONS,
  componentMatchesMosfetPreset,
  defaultModelParams,
  defaultModelName,
  modelAppliesToKind,
  modelDefinitionLine,
  modelTypesForKind,
  mosfetPresetKindForComponentKind,
  normalizeModelDefinition,
  parseModelDefinitions,
  parseModelLine,
  removeModelDefinition,
  removeModelDefinitionInDoc,
  uniqueModelName,
  updateModelDefinition,
  updateModelDefinitionInDoc,
  upsertModelDefinition,
} from "../src/editor/modelPresets.ts";

test(".model lines parse as shared model definitions", () => {
  assert.deepEqual(
    parseModelLine(".model NMOS_LEVEL1_FAST NMOS LEVEL=1 VTO=0.70 KP=180e-6"),
    {
      name: "NMOS_LEVEL1_FAST",
      type: "NMOS",
      params: "LEVEL=1 VTO=0.70 KP=180e-6",
    },
  );
  assert.deepEqual(
    parseModelLine(".model PCH PMOS (LEVEL=1 VTO=-0.5 KP=1e-5)"),
    {
      name: "PCH",
      type: "PMOS",
      params: "LEVEL=1 VTO=-0.5 KP=1e-5",
    },
  );
});

test("model definition serialization uses canonical parenthesized params", () => {
  const [model] = parseModelDefinitions(
    ".param X=1\n.model NMOS_LEVEL1_FAST NMOS LEVEL=1 VTO=0.70 KP=180e-6",
  );

  assert.equal(
    modelDefinitionLine(model),
    ".model NMOS_LEVEL1_FAST NMOS (LEVEL=1 VTO=0.70 KP=180e-6)",
);
});

test("built-in model definitions cover all default model families", () => {
  assert.deepEqual(
    BUILTIN_MODEL_DEFINITIONS.map((model) => `${model.type}:${model.name}`),
    [
      "D:DMOD",
      "NPN:BJTN",
      "PNP:BJTP",
      "NMOS:NCH",
      "PMOS:PCH",
      "NMOS:NMOS_LEVEL1_FAST",
      "PMOS:PMOS_LEVEL1_FAST",
    ],
  );
  assert.equal(defaultModelName("D"), "DMOD");
  assert.equal(defaultModelName("NPN"), "BJTN");
  assert.equal(defaultModelName("PMOS"), "PCH");
});

test("shared model definitions can be inserted updated renamed and removed", () => {
  const base = ".param TEMP=27";
  const added = upsertModelDefinition(base, {
    name: "NM custom",
    type: "NMOS",
    params: "LEVEL=1 VTO=0.7",
  });
  assert.equal(
    added,
    ".param TEMP=27\n.model NM_custom NMOS (LEVEL=1 VTO=0.7)",
  );

  const updated = updateModelDefinition(
    added,
    { name: "NM_custom", type: "NMOS", params: "" },
    { name: "NM_FAST", type: "NMOS", params: "(LEVEL=1 VTO=0.6 KP=1e-4)" },
  );
  assert.equal(
    updated,
    ".param TEMP=27\n.model NM_FAST NMOS (LEVEL=1 VTO=0.6 KP=1e-4)",
  );

  assert.equal(
    removeModelDefinition(updated, { name: "NM_FAST", type: "NMOS", params: "" }),
    ".param TEMP=27",
  );
});

test("shared model rename updates compatible component instances", () => {
  const doc = {
    pages: [
      {
        id: "main",
        name: "main",
        components: [
          {
            id: "m1",
            kind: "NMOS" as const,
            x: 0,
            y: 0,
            rotation: 0,
            value: "OLD_NMOS",
          },
          {
            id: "m2",
            kind: "PMOS" as const,
            x: 1,
            y: 0,
            rotation: 0,
            value: "OLD_NMOS",
          },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "main",
    directives: ".model OLD_NMOS NMOS (LEVEL=1 VTO=0.7)",
    analysis: { kind: "op" as const },
  };

  const updated = updateModelDefinitionInDoc(
    doc,
    { name: "OLD_NMOS", type: "NMOS", params: "" },
    { name: "NEW NMOS", type: "NMOS", params: "LEVEL=1 VTO=0.6" },
  );

  assert.match(updated.directives, /\.model NEW_NMOS NMOS/);
  assert.equal(updated.pages[0].components[0].value, "NEW_NMOS");
  assert.equal(updated.pages[0].components[1].value, "OLD_NMOS");
});

test("shared model removal falls component instances back to the default model", () => {
  const doc = {
    pages: [
      {
        id: "main",
        name: "main",
        components: [
          {
            id: "d1",
            kind: "D" as const,
            x: 0,
            y: 0,
            rotation: 0,
            value: "LED_CUSTOM",
          },
          {
            id: "q1",
            kind: "NPN" as const,
            x: 1,
            y: 0,
            rotation: 0,
            value: "LED_CUSTOM",
          },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "main",
    directives: ".model LED_CUSTOM D (IS=1e-20)",
    analysis: { kind: "op" as const },
  };

  const updated = removeModelDefinitionInDoc(doc, {
    name: "LED_CUSTOM",
    type: "D",
    params: "",
  });

  assert.equal(updated.directives, "");
  assert.equal(updated.pages[0].components[0].value, "DMOD");
  assert.equal(updated.pages[0].components[1].value, "LED_CUSTOM");
});

test("shared model helpers create defaults and unique names", () => {
  assert.match(defaultModelParams("PMOS"), /VTO=-0\.70/);
  assert.deepEqual(
    normalizeModelDefinition({
      name: "PM custom",
      type: "PMOS",
      params: "(LEVEL=1 VTO=-0.7)",
    }),
    {
      name: "PM_custom",
      type: "PMOS",
      params: "LEVEL=1 VTO=-0.7",
    },
  );
  assert.equal(
    uniqueModelName(
      [
        { name: "NMOS_MODEL", type: "NMOS", params: "" },
        { name: "NMOS_MODEL_2", type: "NMOS", params: "" },
      ],
      "NMOS MODEL",
    ),
    "NMOS_MODEL_3",
  );
});

test("four-terminal MOS variants use the same model families as compact MOSFETs", () => {
  assert.deepEqual(modelTypesForKind("NMOS4"), ["NMOS"]);
  assert.deepEqual(modelTypesForKind("PMOS4"), ["PMOS"]);
  assert.equal(mosfetPresetKindForComponentKind("NMOS4"), "NMOS");
  assert.equal(mosfetPresetKindForComponentKind("PMOS4"), "PMOS");
  assert.equal(modelAppliesToKind("NMOS", "NMOS4"), true);
  assert.equal(modelAppliesToKind("PMOS", "NMOS"), false);
});

test("componentMatchesMosfetPreset detects direct model and geometry edits", () => {
  const preset = {
    id: "fast",
    kind: "NMOS" as const,
    name: "Fast NMOS",
    description: "test",
    model: "NMOS_LEVEL1_FAST",
    W: "2u",
    L: "2u",
  };

  assert.equal(
    componentMatchesMosfetPreset(
      {
        id: "m1",
        kind: "NMOS",
        x: 0,
        y: 0,
        rotation: 0,
        value: "NMOS_LEVEL1_FAST",
        params: { W: "2u", L: "2u", preset: "stale" },
      },
      preset,
    ),
    true,
  );
  assert.equal(
    componentMatchesMosfetPreset(
      {
        id: "m1",
        kind: "NMOS",
        x: 0,
        y: 0,
        rotation: 0,
        value: "NMOS_LEVEL1_FAST",
        params: { W: "4u", L: "2u", preset: "fast" },
      },
      preset,
    ),
    false,
  );
});
