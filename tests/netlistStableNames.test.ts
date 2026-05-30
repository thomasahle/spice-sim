import assert from "node:assert/strict";
import test from "node:test";

import { buildNetlist } from "../src/editor/netlist.ts";
import type { CircuitDoc } from "../src/editor/model.ts";

// V1 -> R1 -> R2 -> GND. The R1/R2 junction is an unlabeled net (auto n#).
function dividerDoc(extra: CircuitDoc["pages"][0]["components"] = []): CircuitDoc {
  return {
    pages: [
      {
        id: "main",
        name: "main",
        description: "",
        components: [
          { id: "v1", kind: "V", x: -8, y: 0, rotation: 0, value: "DC 5" },
          { id: "r1", kind: "R", x: -4, y: 0, rotation: 0, value: "1k" },
          { id: "r2", kind: "R", x: 0, y: 0, rotation: 0, value: "1k" },
          { id: "g1", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
          ...extra,
        ],
        wires: [
          { id: "wa", points: [[-8, -2], [-6, -2]] },
          { id: "wb", points: [[-2, 0], [2, 0]] },
        ],
        probes: [],
      },
    ],
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
  };
}

test("without a hint map, auto naming stays the plain sequential n1, n2, …", () => {
  const a = buildNetlist(dividerDoc());
  const b = buildNetlist(dividerDoc());
  assert.equal(a.netlist, b.netlist); // deterministic
  const autoNames = [...a.nodes.rootToName.values()].filter((n) => /^n\d+$/.test(n));
  assert.ok(autoNames.length >= 1, `expected an auto net, got ${JSON.stringify(autoNames)}`);
});

test("passing an (empty) hint map produces the same netlist as the default path", () => {
  // The first build with a fresh map must equal the no-map build — stability
  // only kicks in on the *second* build, never changing first-build output.
  const plain = buildNetlist(dividerDoc()).netlist;
  const withMap = buildNetlist(dividerDoc(), new Map()).netlist;
  assert.equal(withMap, plain);
});

test("with a shared hint map, an existing net keeps its name when a component is added", () => {
  const stable = new Map<string, string>();
  const first = buildNetlist(dividerDoc(), stable);
  const r1Pin1 = first.nodes.pinToNode.get("r1#1");
  assert.ok(r1Pin1 && /^n\d+$/.test(r1Pin1), `expected r1 pin1 auto name, got ${r1Pin1}`);

  const second = buildNetlist(
    dividerDoc([{ id: "rx", kind: "R", x: 10, y: 10, rotation: 0, value: "2k" }]),
    stable,
  );
  assert.equal(second.nodes.pinToNode.get("r1#1"), r1Pin1);
});

test("with a shared hint map, auto names survive component reordering", () => {
  const stable = new Map<string, string>();
  const first = buildNetlist(dividerDoc(), stable);
  const junction = first.nodes.pinToNode.get("r1#1");
  const sourceSide = first.nodes.pinToNode.get("r1#0");
  const loadSide = first.nodes.pinToNode.get("r2#1");
  assert.ok(junction && sourceSide && loadSide);

  const reordered = dividerDoc();
  reordered.pages[0].components = [
    reordered.pages[0].components[2],
    reordered.pages[0].components[0],
    reordered.pages[0].components[3],
    reordered.pages[0].components[1],
  ];
  const second = buildNetlist(reordered, stable);
  assert.equal(second.nodes.pinToNode.get("r1#1"), junction);
  assert.equal(second.nodes.pinToNode.get("r2#0"), junction);
  assert.equal(second.nodes.pinToNode.get("r1#0"), sourceSide);
  assert.equal(second.nodes.pinToNode.get("r2#1"), loadSide);
});

test("auto names stay unique under the hint map (no collisions)", () => {
  const stable = new Map<string, string>();
  const result = buildNetlist(
    dividerDoc([
      { id: "r3", kind: "R", x: 0, y: 6, rotation: 0, value: "3k" },
      { id: "r4", kind: "R", x: 4, y: 6, rotation: 0, value: "4k" },
    ]),
    stable,
  );
  const autoNames = [...result.nodes.rootToName.values()].filter((n) => /^n\d+$/.test(n));
  assert.equal(new Set(autoNames).size, autoNames.length, `auto names must be unique: ${JSON.stringify(autoNames)}`);
});

// Regression guard for the first (reverted) attempt: a wide subcircuit emits
// per-pin live-flow sense sources (VLFX1Pk nodeK lf_X1_pk 0). Passing a hint
// map must NOT disturb that numbering.
function wideSubcircuitDoc(): CircuitDoc {
  const pins = 12;
  const portComponents = Array.from({ length: pins }, (_, i) => ({
    id: `port${i + 1}`,
    kind: "LABEL" as const,
    x: -6,
    y: i * 2,
    rotation: 0 as const,
    value: `p${i + 1}`,
    params: { port: "1", portOrder: String(i + 1) },
  }));
  return {
    pages: [
      {
        id: "main",
        name: "main",
        description: "",
        components: [
          { id: "x1", kind: "SUBX", x: 0, y: 0, rotation: 0, value: "wide", params: { npins: String(pins) } },
        ],
        wires: [],
        probes: [],
      },
      {
        id: "wide",
        name: "wide",
        description: "",
        components: portComponents,
        wires: [],
        probes: [],
      },
    ],
    activePageId: "main",
    directives: "",
    analysis: { kind: "op" },
  };
}

test("wide-subcircuit sense-node numbering is identical with and without a hint map", () => {
  const plain = buildNetlist(wideSubcircuitDoc()).netlist;
  const withMap = buildNetlist(wideSubcircuitDoc(), new Map()).netlist;
  assert.equal(withMap, plain);
  // And the first sense source still references n1 (the regression was n13).
  assert.match(plain, /^VLFX1P1 n1 lf_X1_p1 0$/m);
});
