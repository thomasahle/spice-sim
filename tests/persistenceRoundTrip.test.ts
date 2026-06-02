// Persistence v2: the Model-C GRAPH doc is stored directly (localStorage,
// share URL, .spicesim file) and migrated-on-load. These tests assert that
//   1. a v2 graph doc round-trips byte-identically through every save path, and
//   2. an old v1 (legacy polyline) doc is migrated losslessly on load,
// so existing users' circuits survive the cut-over.

import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { DEMOS } from "../src/editor/demos.ts";
import { geometryDocToGraph } from "../src/editor/graphConvert.ts";
import { migrateToGraphDoc, normalizeDoc } from "../src/editor/docNormalize.ts";
import {
  encodeSharedDoc,
  decodeSharedDoc,
  sharedDocFromHash,
  shareUrlForDoc,
} from "../src/editor/shareUrl.ts";
import { loadProject, saveProject } from "../src/editor/projects.ts";
import { GRAPH_DOC_VERSION, type CircuitDoc, type SimSettings } from "../src/editor/model.ts";
import type { GeometryDoc } from "../src/editor/geometryModel.ts";

// --- localStorage stub (projects.ts persists there) ----------------------
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
};
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = localStorageStub;
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

// `.spicesim` file save (sim/files.ts) stamps version on write and migrates on
// open. We exercise the JSON serialize→parse→migrate path directly (no Tauri).
function fileRoundTrip(doc: CircuitDoc): CircuitDoc {
  const serialized = JSON.stringify({ ...doc, version: GRAPH_DOC_VERSION });
  return migrateToGraphDoc(JSON.parse(serialized));
}

// The canonical persisted shape of a graph doc: normalized + version-stamped.
// Every save path produces exactly this on load.
function persisted(graph: CircuitDoc): CircuitDoc {
  return normalizeDoc({ ...graph, version: GRAPH_DOC_VERSION });
}

// JSON canonicalization: drops `undefined`-valued keys (e.g. `label`/`params`/
// `simSettings` left undefined by the converter/normalizer) exactly as every
// save path's JSON.stringify does, so deepEqual compares the meaningful data
// and not which optional keys happen to be present in memory.
function canon(x: unknown): unknown {
  return JSON.parse(JSON.stringify(x));
}

// Representative graph docs: every demo (converted from its legacy form) plus a
// hand-built doc exercising standalone nodes, a named node, bends and a probe.
function graphFixtures(): { name: string; doc: CircuitDoc }[] {
  const fromDemos = DEMOS.map((d) => ({
    name: `demo:${d.id}`,
    // persisted() = the normalized, version-stamped shape we expect on load.
    doc: persisted(geometryDocToGraph(d.build())),
  }));
  const hand: CircuitDoc = persisted({
    pages: [
      {
        id: "page-hand",
        name: "main",
        description: "hand-built",
        components: [
          { id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["pin-a", "pin-b"] },
        ],
        nodes: [
          { id: "node-free", x: 4, y: 0 },
          { id: "node-named", x: 8, y: 0, name: "VOUT" },
        ],
        wires: [
          { id: "w1", a: "pin-b", b: "node-free", bends: [[2, 0]] },
          { id: "w2", a: "node-free", b: "node-named", bends: [] },
        ],
        probes: [{ id: "p1", x: 8, y: 0, node: "node-named", color: "#0a84ff", label: "out" }],
      },
    ],
    activePageId: "page-hand",
    directives: ".tran 1u 1m",
    analysis: { kind: "tran", tstep: "1u", tstop: "1m" },
    simSettings: { method: "gear", uic: true } as SimSettings,
  });
  return [...fromDemos, { name: "hand-built", doc: hand }];
}

// ---------------------------------------------------------------------------
// v2 graph docs round-trip identically through every save path.
// ---------------------------------------------------------------------------
for (const { name, doc } of graphFixtures()) {
  test(`localStorage round-trips the graph doc: ${name}`, () => {
    saveProject("rt", doc);
    const loaded = loadProject("rt");
    assert.deepEqual(canon(loaded), canon(doc));
    // Version is preserved (the persisted shape carries version >= 2).
    assert.equal(loaded?.version, GRAPH_DOC_VERSION);
  });

  test(`share URL round-trips the graph doc: ${name}`, () => {
    const decoded = decodeSharedDoc(encodeSharedDoc(doc));
    assert.deepEqual(canon(decoded), canon(doc));
    assert.equal(decoded?.version, GRAPH_DOC_VERSION);
    // …and survives the full hash encode/decode wrapper too.
    const url = shareUrlForDoc("http://localhost/#view=schematic", doc);
    assert.deepEqual(canon(sharedDocFromHash(new URL(url).hash)), canon(doc));
  });

  test(`.spicesim file round-trips the graph doc: ${name}`, () => {
    const reopened = fileRoundTrip(doc);
    assert.deepEqual(canon(reopened), canon(doc));
    assert.equal(reopened.version, GRAPH_DOC_VERSION);
  });
}

// ---------------------------------------------------------------------------
// v1 → graph migration is lossless and version detection is correct.
// ---------------------------------------------------------------------------

// A legacy v1 doc (wires are polylines, no version, no pin ids / nodes).
function legacyV1Fixture(): GeometryDoc {
  return {
    pages: [
      {
        id: "page-v1",
        name: "main",
        description: "",
        components: [
          { id: "v1", kind: "V", x: -10, y: 0, rotation: 0, value: "10" },
          { id: "r1", kind: "R", x: -2, y: -4, rotation: 0, value: "1k" },
          { id: "g1", kind: "GND", x: -10, y: 4, rotation: 0, value: "" },
          { id: "lbl", kind: "LABEL", x: 4, y: -4, rotation: 0, value: "mid" },
        ],
        wires: [
          { id: "w1", points: [[-10, -2], [-10, -4], [-4, -4]] },
          { id: "w2", points: [[0, -4], [4, -4]] },
          { id: "w3", points: [[-10, 2], [-10, 4]] },
        ],
        probes: [{ id: "p1", x: 4, y: -4, color: "#0a84ff" }],
      },
    ],
    activePageId: "page-v1",
    directives: "",
    analysis: { kind: "op" },
  };
}

// Run `fn` with a deterministic Math.random so the (otherwise random) node/wire
// ids minted during legacy→graph conversion are reproducible. This lets us
// deepEqual two independent conversions of the same legacy doc.
function withSeededRandom<T>(fn: () => T): T {
  const real = Math.random;
  let s = 0x12345678;
  Math.random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

test("migrateToGraphDoc(v1) equals geometryDocToGraph(normalizeDoc(v1)) — no data loss", () => {
  const v1 = legacyV1Fixture();
  // Same converter, same RNG sequence ⇒ byte-identical output. Proves the v1
  // discriminator routes through the trusted legacy converter unchanged.
  const viaMigrate = withSeededRandom(() => migrateToGraphDoc(structuredClone(v1)));
  const viaDirect = withSeededRandom(() =>
    geometryDocToGraph(normalizeDoc(structuredClone(v1)) as unknown as GeometryDoc),
  );
  assert.deepEqual(canon(viaMigrate), canon(viaDirect));
});

test("migrateToGraphDoc preserves a v1 doc's contents (components, label, probe, directives)", () => {
  const v1 = legacyV1Fixture();
  const g = migrateToGraphDoc(v1);
  // Pages / doc-level fields preserved.
  assert.equal(g.pages.length, 1);
  assert.equal(g.directives, "");
  assert.deepEqual(g.analysis, { kind: "op" });
  // Components survive; pin-node ids are materialized by the converter.
  const r1 = g.pages[0].components.find((c) => c.id === "r1");
  assert.ok(r1 && (r1.pins?.length ?? 0) === 2, "resistor pins materialized");
  // The net LABEL is kept as a component.
  assert.ok(g.pages[0].components.some((c) => c.kind === "LABEL" && c.value === "mid"));
  // Wires become graph edges (a/b), never polylines.
  assert.ok(g.pages[0].wires.length > 0);
  for (const w of g.pages[0].wires) {
    assert.ok(typeof w.a === "string" && typeof w.b === "string");
    assert.equal((w as unknown as { points?: unknown }).points, undefined);
  }
  // Probe survives and is bound to a node.
  const p = g.pages[0].probes.find((pr) => pr.id === "p1");
  assert.ok(p && typeof p.node === "string");
});

test("version detection: a v1 doc (no version) is migrated, a v2 doc passes through", () => {
  // v1: no version field, polyline wires → routed to the legacy converter
  // (which materializes pin-node ids on components that had none).
  const v1 = legacyV1Fixture();
  assert.equal((v1 as { version?: number }).version, undefined);
  const m1 = migrateToGraphDoc(v1);
  assert.ok((m1.pages[0].components[0].pins?.length ?? 0) > 0);

  // v2: version:2 tag → passed straight through normalizeDoc (no re-conversion,
  // pins and standalone nodes preserved verbatim).
  const v2: CircuitDoc = {
    version: GRAPH_DOC_VERSION,
    pages: [
      {
        id: "p",
        name: "main",
        description: "",
        components: [{ id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["a", "b"] }],
        nodes: [{ id: "nf", x: 4, y: 0 }],
        wires: [{ id: "w1", a: "b", b: "nf", bends: [] }],
        probes: [],
      },
    ],
    activePageId: "p",
    directives: "",
    analysis: { kind: "op" },
  };
  const m2 = migrateToGraphDoc(v2);
  assert.deepEqual(m2.pages[0].components[0].pins, ["a", "b"], "pins preserved verbatim");
  assert.deepEqual(m2.pages[0].nodes, [{ id: "nf", x: 4, y: 0 }], "standalone node preserved");
  assert.deepEqual(m2.pages[0].wires, [{ id: "w1", a: "b", b: "nf", bends: [] }], "edge preserved");
});

test("version detection: a v2 doc without a version tag is recognised by its edge wires", () => {
  // Mirrors an in-memory graph doc that was serialized without the version
  // stamp: `a`/`b` wires (and pin ids / nodes) mark it as graph, so it must NOT
  // be fed to the legacy converter (which would regenerate pins / drop nodes).
  const v2NoVersion = {
    pages: [
      {
        id: "p",
        name: "main",
        description: "",
        components: [{ id: "r1", kind: "R", x: 0, y: 0, rotation: 0, value: "1k", pins: ["a", "b"] }],
        nodes: [{ id: "nf", x: 4, y: 0 }],
        wires: [{ id: "w1", a: "b", b: "nf", bends: [] }],
        probes: [],
      },
    ],
    activePageId: "p",
    directives: "",
    analysis: { kind: "op" as const },
  };
  const g = migrateToGraphDoc(v2NoVersion);
  assert.deepEqual(g.pages[0].components[0].pins, ["a", "b"]);
  assert.deepEqual(g.pages[0].nodes, [{ id: "nf", x: 4, y: 0 }]);
});

test("an empty doc converts to the same empty graph doc by either route", () => {
  const empty = { pages: [{ id: "p", name: "main", components: [], wires: [], probes: [] }], activePageId: "p", directives: "", analysis: { kind: "op" as const } };
  // No version, no wires, no nodes, no pins ⇒ ambiguous; migrate defaults to the
  // legacy route, but for an empty doc both routes yield the same graph doc.
  const viaMigrate = migrateToGraphDoc(structuredClone(empty));
  const viaLegacy = geometryDocToGraph(normalizeDoc(structuredClone(empty)) as unknown as GeometryDoc);
  assert.deepEqual(canon(viaMigrate), canon(viaLegacy));
});
