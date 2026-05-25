import test from "node:test";
import assert from "node:assert/strict";

import type { Measurement } from "../src/sim/api.ts";
import {
  formatMeasurementResultValue,
  measurementDirectivesFromText,
  measurementValueUnit,
} from "../src/editor/measurementUnits.ts";

function meas(name: string, value = 1): Measurement {
  return { name, value, at: null, raw: `${name} = ${value}` };
}

test("measurement directive parsing records names and expressions", () => {
  const directives = measurementDirectivesFromText(`
.meas tran vmax_out MAX V(out)
.meas ac gain FIND V(out) AT=1k
`);

  assert.equal(directives.get("vmax_out")?.func, "MAX");
  assert.equal(directives.get("gain")?.expr, "V(out) AT=1k");
});

test("measurement value units are inferred conservatively from directives", () => {
  const directives = measurementDirectivesFromText(`
.meas tran vmax_out MAX V(out)
.meas tran imax MAX I(V1)
.meas tran t_at_2v WHEN V(out)=2 RISE=1
.meas tran energy INTEG V(out)*I(V1)
`);

  assert.equal(measurementValueUnit(meas("vmax_out"), directives.get("vmax_out"), "s"), "V");
  assert.equal(measurementValueUnit(meas("imax"), directives.get("imax"), "s"), "A");
  assert.equal(measurementValueUnit(meas("t_at_2v"), directives.get("t_at_2v"), "s"), "s");
  assert.equal(measurementValueUnit(meas("energy"), directives.get("energy"), "s"), "");
  assert.equal(measurementValueUnit(meas("v(onoise_total)"), undefined, "Hz"), "V");
  assert.equal(measurementValueUnit(meas("i(v1)"), undefined, "Hz"), "A");
});

test("measurement result values include inferred units", () => {
  const directives = measurementDirectivesFromText(".meas tran t_at_2v WHEN V(out)=2 RISE=1");
  assert.equal(
    formatMeasurementResultValue(meas("t_at_2v", 5.15832e-4), directives.get("t_at_2v"), "s"),
    "515.832 us",
  );
  assert.equal(formatMeasurementResultValue(meas("v(onoise_total)", 2.864463777900569e-7), undefined, "Hz"), "286.446 nV");
});
