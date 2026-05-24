import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDoc } from "../src/editor/docNormalize.ts";
import type { CircuitDoc } from "../src/editor/model.ts";

test("normalizeDoc preserves simulation settings from shared documents", () => {
  const doc: CircuitDoc = {
    pages: [{ id: "main", name: "main", components: [], wires: [], probes: [] }],
    activePageId: "main",
    directives: "",
    analysis: { kind: "tran", tstep: "2u", tstop: "3m" },
    simSettings: {
      method: "gear",
      options: "reltol=1e-4 abstol=1e-12",
      temperature: "35",
    },
  };

  assert.deepEqual(normalizeDoc(doc).simSettings, doc.simSettings);
});

test("normalizeDoc preserves simulation settings while migrating legacy documents", () => {
  const doc = normalizeDoc({
    components: [],
    wires: [],
    probes: [],
    analysis: { kind: "op" },
    simSettings: { method: "be", uic: true },
  });

  assert.deepEqual(doc.simSettings, { method: "be", uic: true });
});
