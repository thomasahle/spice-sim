import assert from "node:assert/strict";
import test from "node:test";

import { emptyDoc, GRAPH_DOC_VERSION, type CircuitDoc } from "../src/editor/model.ts";
import { legacyDocToGraph } from "../src/editor/graphConvert.ts";
import { normalizeDoc } from "../src/editor/docNormalize.ts";
import type { LegacyCircuitDoc } from "../src/editor/legacyModel.ts";
import { decodeSharedDoc, encodeSharedDoc, sharedDocFromHash, shareUrlForDoc } from "../src/editor/shareUrl.ts";

// Persistence v2: encodeSharedDoc stamps version:2 and decodeSharedDoc migrates
// the payload to the Model-C GRAPH doc. So a round trip yields the canonical
// persisted shape (normalized + version-stamped). JSON drops undefined-valued
// keys, so compare through the same JSON canonicalization on both sides.
const canon = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const persisted = (g: CircuitDoc): CircuitDoc =>
  normalizeDoc({ ...g, version: GRAPH_DOC_VERSION });

test("share URLs round-trip a graph document (stamping + migrating version)", () => {
  const decoded = decodeSharedDoc(encodeSharedDoc(emptyDoc));
  assert.deepEqual(canon(decoded), canon(persisted(emptyDoc)));
  assert.equal(decoded?.version, GRAPH_DOC_VERSION);
});

test("share URLs preserve note annotation metadata", () => {
  const doc: CircuitDoc = {
    ...emptyDoc,
    pages: [
      {
        id: "page-notes",
        name: "main",
        description: "",
        components: [
          {
            id: "note1",
            kind: "NOTE",
            x: -3,
            y: 2,
            rotation: 0,
            value: "Preactivation notes",
            params: { w: "4.8", h: "2.6", color: "#af52de" },
          },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "page-notes",
  };

  assert.deepEqual(canon(decodeSharedDoc(encodeSharedDoc(doc))), canon(persisted(doc)));
});

test("share URLs preserve complete project metadata and layout state", () => {
  // A full graph doc (converted from the legacy fixture) with subcircuits,
  // device params, notes, named nets, bends, probes and sim settings.
  const legacy: LegacyCircuitDoc = {
    pages: [
      {
        id: "page-main",
        name: "main",
        description: "Transient harness for a reusable analog block.",
        components: [
          { id: "xrelu", kind: "SUBX", x: 0, y: 0, rotation: 0, mirrored: true, value: "relu_cell", label: "U1", params: { npins: "4" } },
          { id: "mload", kind: "NMOS4", x: 6, y: 1, rotation: 90, value: "NMOS_LEVEL1_FAST", params: { W: "8u", L: "2u", preset: "fast" } },
          { id: "note1", kind: "NOTE", x: -5, y: -4, rotation: 0, value: "Learning cell notes\n- device-only implementation", params: { w: "6.5", h: "2.8", color: "#34c759" } },
        ],
        wires: [
          { id: "w1", points: [[-3, -1], [-1, -1], [-1, 0]] },
          { id: "w2", points: [[3, 1], [5, 1], [5, 3]] },
        ],
        probes: [{ id: "p-h", x: 3, y: -1, scopeDx: 1.4, scopeDy: -2.2, label: "h output", color: "#ff9f0a" }],
      },
      {
        id: "page-relu",
        name: "relu_cell",
        description: "Pure MOS/R/C ReLU-like block with split positive and negative weight nodes.",
        components: [
          { id: "port-x", kind: "LABEL", x: -7, y: -1.5, rotation: 0, value: "x", params: { port: "1", portOrder: "1" } },
          { id: "port-h", kind: "LABEL", x: 7, y: -1.5, rotation: 0, value: "h", params: { port: "1", portOrder: "2" } },
          { id: "cwp", kind: "C", x: 0, y: 2, rotation: 0, value: "20p", params: { IC: "1.35" } },
        ],
        wires: [{ id: "w-sub", points: [[0, 0], [0, 2]] }],
        probes: [],
      },
    ],
    activePageId: "page-relu",
    directives: ".model NMOS_LEVEL1_FAST NMOS (LEVEL=1 VTO=0.70 KP=180e-6)\n.model PMOS_LEVEL1_FAST PMOS (LEVEL=1 VTO=-0.70 KP=70e-6)",
    analysis: { kind: "tran", tstep: "5n", tstop: "30u", tstart: "1u" },
    simSettings: { method: "gear", temperature: "35", uic: true, options: "reltol=1e-4 abstol=1e-12" },
  };
  const doc = persisted(legacyDocToGraph(legacy));

  assert.deepEqual(canon(decodeSharedDoc(encodeSharedDoc(doc))), canon(doc));
});

test("share URLs preserve existing hash params and replace doc", () => {
  const url = shareUrlForDoc("http://localhost:5174/#view=schematic&doc=old", emptyDoc);

  assert.equal(new URL(url).hash.includes("view=schematic"), true);
  assert.deepEqual(canon(sharedDocFromHash(new URL(url).hash)), canon(persisted(emptyDoc)));
});

test("old (v1) share links are migrated to a graph doc on decode", () => {
  // Encode a legacy payload the way an OLD client would have: raw legacy JSON,
  // no version, polyline wires — exactly what is still live in users' links.
  const legacy: LegacyCircuitDoc = {
    pages: [
      {
        id: "page-v1",
        name: "main",
        description: "",
        components: [
          { id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" },
          { id: "lbl", kind: "LABEL", x: 4, y: 0, rotation: 0, value: "out" },
        ],
        wires: [{ id: "w1", points: [[0, 0], [4, 0]] }],
        probes: [{ id: "p1", x: 4, y: 0, color: "#0a84ff" }],
      },
    ],
    activePageId: "page-v1",
    directives: "",
    analysis: { kind: "op" },
  };
  const legacyJson = JSON.stringify(legacy);
  const bytes = new TextEncoder().encode(legacyJson);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const decoded = decodeSharedDoc(encoded);
  assert.ok(decoded, "legacy payload decodes");
  // Migrated to the graph model (wires are edges, never polylines). Node/wire
  // ids minted during conversion are random, so assert structure, not ids.
  assert.ok(decoded.pages[0].wires.length > 0);
  assert.ok(decoded.pages[0].wires.every((w) => typeof w.a === "string" && typeof w.b === "string"));
  // Components, the net label, and the probe binding survive the migration.
  assert.ok(decoded.pages[0].components.some((c) => c.id === "r1" && (c.pins?.length ?? 0) === 2));
  assert.ok(decoded.pages[0].components.some((c) => c.kind === "LABEL" && c.value === "out"));
  assert.ok(decoded.pages[0].probes.some((p) => p.id === "p1" && typeof p.node === "string"));
});

test("invalid share payloads are ignored", () => {
  assert.equal(sharedDocFromHash("#doc=not-valid-base64"), null);
  assert.equal(sharedDocFromHash("#view=schematic"), null);
});
