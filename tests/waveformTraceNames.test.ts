import assert from "node:assert/strict";
import test from "node:test";

import { traceAliasKey, traceDisplayName } from "../src/editor/traceNames.ts";

test("trace display names prefer probe aliases for voltage traces", () => {
  const aliases = new Map([[traceAliasKey("v(n2)"), "Vout"]]);

  assert.equal(traceDisplayName("v(n2)", aliases), "Vout");
  assert.equal(traceDisplayName("V(N2)", aliases), "Vout");
});

test("trace aliases can preserve schematic label casing", () => {
  const aliases = new Map([
    [traceAliasKey("v(VOUT)"), "V(VOUT)"],
    [traceAliasKey("VOUT"), "V(VOUT)"],
  ]);

  assert.equal(traceDisplayName("vout", aliases), "V(VOUT)");
  assert.equal(traceDisplayName("v(vout)", aliases), "V(VOUT)");
});

test("trace display names keep readable fallbacks without aliases", () => {
  assert.equal(traceDisplayName("v(n2)"), "V(n2)");
  assert.equal(traceDisplayName("v1#branch"), "I(V1)");
  assert.equal(traceDisplayName("xamp.vsense#branch"), "I(XAMP.VSENSE)");
  assert.equal(traceDisplayName("@m1[id]"), "I(M1 drain)");
  assert.equal(traceDisplayName("@q1[ic]"), "I(Q1 collector)");
  assert.equal(traceDisplayName("@m.xrelu.mpos[id]"), "I(M.XRELU.MPOS drain)");
  assert.equal(traceDisplayName("@m1[gm]"), "gm(M1)");
  assert.equal(traceDisplayName("@m1[vds]"), "Vds(M1)");
  assert.equal(traceDisplayName("@m.xrelu.mpos[cgs]"), "Cgs(M.XRELU.MPOS)");
  assert.equal(traceDisplayName("out"), "V(out)");
  assert.equal(traceDisplayName("filter_out"), "V(filter_out)");
});

test("trace display names make stepped run prefixes readable", () => {
  assert.equal(traceDisplayName("tran2.v(out)"), "Run 2 · V(out)");
  assert.equal(traceDisplayName("dc12.v1#branch"), "Run 12 · I(V1)");
});

test("trace display names apply probe aliases inside stepped run prefixes", () => {
  const aliases = new Map([[traceAliasKey("v(out)"), "Vout"]]);

  assert.equal(traceDisplayName("tran3.v(out)", aliases), "Run 3 · Vout");
});

test("trace display names prefer explicit sweep run labels", () => {
  const runLabels = new Map([[2, "rval=1k"]]);

  assert.equal(traceDisplayName("tran2.v(out)", undefined, runLabels), "rval=1k · V(out)");
});
