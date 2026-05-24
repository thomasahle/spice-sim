import assert from "node:assert/strict";
import test from "node:test";

import { vectorsToCsv } from "../src/sim/files.ts";

test("waveform CSV export includes AC phase columns", () => {
  const csv = vectorsToCsv([
    { name: "frequency", data: [1, 10] },
    { name: "v(out)", data: [1, 0.5], phase: [0, -45] },
  ]);
  assert.equal(
    csv,
    "frequency,v(out),v(out) phase(deg)\n1,1,0\n10,0.5,-45",
  );
});

test("waveform CSV export escapes vector names and pads short columns", () => {
  const csv = vectorsToCsv([
    { name: "time", data: [0, 1, 2] },
    { name: "v(out,filtered)", data: [3] },
  ]);
  assert.equal(csv, 'time,"v(out,filtered)"\n0,3\n1,\n2,');
});

test("waveform CSV export can use display names for user-facing headers", () => {
  const csv = vectorsToCsv([
    { name: "time", data: [0, 1] },
    { name: "tran2.v(out)", displayName: "rval=1k · V(out)", data: [1, 2], phase: [10, 20] },
  ]);
  assert.equal(
    csv,
    "time,rval=1k · V(out),rval=1k · V(out) phase(deg)\n0,1,10\n1,2,20",
  );
});
