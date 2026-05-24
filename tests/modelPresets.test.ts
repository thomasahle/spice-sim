import assert from "node:assert/strict";
import test from "node:test";

import {
  modelDefinitionLine,
  modelTypesForKind,
  mosfetPresetKindForComponentKind,
  parseModelDefinitions,
  parseModelLine,
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

test("four-terminal MOS variants use the same model families as compact MOSFETs", () => {
  assert.deepEqual(modelTypesForKind("NMOS4"), ["NMOS"]);
  assert.deepEqual(modelTypesForKind("PMOS4"), ["PMOS"]);
  assert.equal(mosfetPresetKindForComponentKind("NMOS4"), "NMOS");
  assert.equal(mosfetPresetKindForComponentKind("PMOS4"), "PMOS");
});
