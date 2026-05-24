import assert from "node:assert/strict";
import test from "node:test";

import { buildNetlist } from "../src/editor/netlist.ts";
import { importNetlist } from "../src/editor/netlistImport.ts";

test("imports a basic divider netlist with local nets as direct wires", () => {
  const imported = importNetlist(`
* divider
V1 in 0 DC 5
R1 in out 10k
R2 out 0 5k
.tran 1u 1m
`);

  const page = imported.doc.pages[0];
  assert.equal(imported.doc.analysis.kind, "tran");
  assert.equal(page.components.filter((c) => c.kind === "V").length, 1);
  assert.equal(page.components.filter((c) => c.kind === "R").length, 2);
  assert.ok(!page.components.some((c) => c.kind === "LABEL" && c.value === "in"));
  assert.ok(!page.components.some((c) => c.kind === "LABEL" && c.value === "out"));
  assert.ok(page.components.some((c) => c.kind === "GND"));
  assert.ok(page.wires.length >= 4);

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /V1\s+\S+\s+0\s+DC 5/);
  assert.match(regenerated, /R1\s+\S+\s+\S+\s+10k/);
  assert.match(regenerated, /R2\s+\S+\s+0\s+5k/);
});

test("preserves unsupported and model lines in directives", () => {
  const imported = importNetlist(`
.model DMOD D
D1 a 0 DMOD
E1 out 0 a 0 10
`);

  assert.ok(imported.doc.directives.includes(".model DMOD D"));
  assert.ok(imported.doc.directives.includes("* unsupported import: E1 out 0 a 0 10"));
  assert.equal(imported.doc.pages[0].components.filter((c) => c.kind === "D").length, 1);
});

test("imports MOSFETs with explicit body as four-terminal parts", () => {
  const imported = importNetlist(`
.model NMOS_LEVEL1_FAST NMOS LEVEL=1 VTO=0.7 KP=180e-6
M1 vdd gate src vss NMOS_LEVEL1_FAST L=2u W=8u
.op
`);

  const mos = imported.doc.pages[0].components.find((c) => c.kind === "NMOS4");
  assert.ok(mos);
  assert.equal(mos.kind, "NMOS4");
  assert.equal(mos.value, "NMOS_LEVEL1_FAST");
  assert.deepEqual(mos.params, { L: "2u", W: "8u" });

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /^M1\s+\S+\s+\S+\s+\S+\s+\S+\s+NMOS_LEVEL1_FAST L=2u W=8u$/m);
});

test("imports subcircuits as schematic pages and X instances", () => {
  const imported = importNetlist(`
.subckt and2 A B Y VDD VSS
B1 Y VSS V=V(A)*V(B)
.ends and2

XU1 in1 in2 out vdd 0 and2
V1 vdd 0 DC 5
.tran 1u 10u
`);

  assert.equal(imported.doc.pages.length, 2);
  assert.equal(imported.doc.pages[1].name, "and2");
  assert.equal(imported.doc.analysis.kind, "tran");

  const root = imported.doc.pages[0];
  const instance = root.components.find((c) => c.kind === "SUBX");
  assert.ok(instance);
  assert.equal(instance.value, "and2");
  assert.equal(instance.params?.npins, "5");

  const subckt = imported.doc.pages[1];
  const labels = subckt.components.filter((c) => c.kind === "LABEL").map((c) => c.value);
  assert.deepEqual(labels.slice(0, 5), ["A", "B", "Y", "VDD", "VSS"]);
  assert.ok(subckt.components.some((c) => c.kind === "B"));

  const regenerated = buildNetlist(imported.doc).netlist;
  assert.match(regenerated, /^X1\s+\S+\s+\S+\s+\S+\s+\S+\s+0\s+and2$/m);
  assert.match(regenerated, /^\.subckt and2 A B Y VDD VSS$/m);
  assert.match(regenerated, /^B1\s+Y\s+VSS\s+V=V\(A\)\*V\(B\)$/m);
});
