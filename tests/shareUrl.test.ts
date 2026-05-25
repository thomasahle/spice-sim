import assert from "node:assert/strict";
import test from "node:test";

import { emptyDoc, type CircuitDoc } from "../src/editor/model.ts";
import { decodeSharedDoc, encodeSharedDoc, sharedDocFromHash, shareUrlForDoc } from "../src/editor/shareUrl.ts";

test("share URLs round-trip the circuit document", () => {
  const encoded = encodeSharedDoc(emptyDoc);
  assert.deepEqual(decodeSharedDoc(encoded), emptyDoc);
});

test("share URLs preserve note annotation metadata", () => {
  const doc = {
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

  assert.deepEqual(decodeSharedDoc(encodeSharedDoc(doc)), doc);
});

test("share URLs preserve complete project metadata and layout state", () => {
  const doc: CircuitDoc = {
    pages: [
      {
        id: "page-main",
        name: "main",
        description: "Transient harness for a reusable analog block.",
        components: [
          {
            id: "xrelu",
            kind: "SUBX",
            x: 0,
            y: 0,
            rotation: 0,
            mirrored: true,
            value: "relu_cell",
            label: "U1",
            params: { npins: "4" },
          },
          {
            id: "mload",
            kind: "NMOS4",
            x: 6,
            y: 1,
            rotation: 90,
            value: "NMOS_LEVEL1_FAST",
            params: { W: "8u", L: "2u", preset: "fast" },
          },
          {
            id: "note1",
            kind: "NOTE",
            x: -5,
            y: -4,
            rotation: 0,
            value: "Learning cell notes\n- device-only implementation",
            params: { w: "6.5", h: "2.8", color: "#34c759" },
          },
        ],
        wires: [
          { id: "w1", points: [[-3, -1], [-1, -1], [-1, 0]] },
          { id: "w2", points: [[3, 1], [5, 1], [5, 3]] },
        ],
        probes: [
          {
            id: "p-h",
            x: 3,
            y: -1,
            scopeDx: 1.4,
            scopeDy: -2.2,
            label: "h output",
            color: "#ff9f0a",
          },
        ],
      },
      {
        id: "page-relu",
        name: "relu_cell",
        description: "Pure MOS/R/C ReLU-like block with split positive and negative weight nodes.",
        components: [
          {
            id: "port-x",
            kind: "LABEL",
            x: -7,
            y: -1.5,
            rotation: 0,
            value: "x",
            params: { port: "1", portOrder: "1" },
          },
          {
            id: "port-h",
            kind: "LABEL",
            x: 7,
            y: -1.5,
            rotation: 0,
            value: "h",
            params: { port: "1", portOrder: "2" },
          },
          {
            id: "cwp",
            kind: "C",
            x: 0,
            y: 2,
            rotation: 0,
            value: "20p",
            params: { IC: "1.35" },
          },
        ],
        wires: [{ id: "w-sub", points: [[0, 0], [0, 2]] }],
        probes: [],
      },
    ],
    activePageId: "page-relu",
    directives: ".model NMOS_LEVEL1_FAST NMOS (LEVEL=1 VTO=0.70 KP=180e-6)\n.model PMOS_LEVEL1_FAST PMOS (LEVEL=1 VTO=-0.70 KP=70e-6)",
    analysis: { kind: "tran", tstep: "5n", tstop: "30u", tstart: "1u" },
    simSettings: {
      method: "gear",
      temperature: "35",
      uic: true,
      options: "reltol=1e-4 abstol=1e-12",
    },
  };

  assert.deepEqual(decodeSharedDoc(encodeSharedDoc(doc)), doc);
});

test("share URLs preserve existing hash params and replace doc", () => {
  const url = shareUrlForDoc("http://localhost:5174/#view=schematic&doc=old", emptyDoc);

  assert.equal(new URL(url).hash.includes("view=schematic"), true);
  assert.deepEqual(sharedDocFromHash(new URL(url).hash), emptyDoc);
});

test("invalid share payloads are ignored", () => {
  assert.equal(sharedDocFromHash("#doc=not-valid-base64"), null);
  assert.equal(sharedDocFromHash("#view=schematic"), null);
});
