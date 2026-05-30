import assert from "node:assert/strict";
import test from "node:test";

import { buildNetlist } from "../src/editor/netlist.ts";
import type { CircuitDoc } from "../src/editor/model.ts";

// A two-resistor divider: V1 -> R1 -> R2 -> GND, with the R1/R2 junction an
// unlabeled net (gets an auto name n#). Wires connect the pins.
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

test("without a hint map, auto naming is the plain sequential n1, n2, … (unchanged)", () => {
  const a = buildNetlist(dividerDoc());
  const b = buildNetlist(dividerDoc());
  // Deterministic: same doc → same netlist string.
  assert.equal(a.netlist, b.netlist);
  // Auto names are n#.
  const autoNames = [...a.nodes.rootToName.values()].filter((n) => /^n\d+$/.test(n));
  assert.ok(autoNames.length >= 1, `expected at least one auto net, got ${JSON.stringify(autoNames)}`);
});

test("with a shared hint map, an existing net keeps its name when another component is added", () => {
  const stable = new Map<string, string>();

  // First build establishes names.
  const first = buildNetlist(dividerDoc(), stable);
  // Capture the auto name assigned to r1 pin 1 (the R1–R2 junction net).
  const r1Pin1 = first.nodes.pinToNode.get("r1#1");
  assert.ok(r1Pin1 && /^n\d+$/.test(r1Pin1), `expected r1 pin1 auto name, got ${r1Pin1}`);

  // Add an unrelated component elsewhere, rebuild with the SAME hint map.
  const second = buildNetlist(
    dividerDoc([{ id: "rx", kind: "R", x: 10, y: 10, rotation: 0, value: "2k" }]),
    stable,
  );
  const r1Pin1After = second.nodes.pinToNode.get("r1#1");

  // The original net keeps its name despite the new component.
  assert.equal(r1Pin1After, r1Pin1);
});

test("hint map does not collide: distinct nets get distinct names", () => {
  const stable = new Map<string, string>();
  const result = buildNetlist(dividerDoc([
    { id: "r3", kind: "R", x: 0, y: 6, rotation: 0, value: "3k" },
    { id: "r4", kind: "R", x: 4, y: 6, rotation: 0, value: "4k" },
  ]), stable);
  const autoNames = [...result.nodes.rootToName.values()].filter((n) => /^n\d+$/.test(n));
  assert.equal(new Set(autoNames).size, autoNames.length, `auto names must be unique: ${JSON.stringify(autoNames)}`);
});
