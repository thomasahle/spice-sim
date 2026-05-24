import assert from "node:assert/strict";
import test from "node:test";

import { formatMeasurementAxisValue, formatMeasurementValue } from "../src/editor/measurementFormatting.ts";

test("measurement values use compact engineering-style formatting", () => {
  assert.equal(formatMeasurementValue(1.23456), "1.2346");
  assert.equal(formatMeasurementValue(0.0123), "12.300 m");
  assert.equal(formatMeasurementValue(4.5e-6), "4.500 u");
  assert.equal(formatMeasurementValue(9e-10), "900.000 p");
  assert.equal(formatMeasurementValue(Number.NaN), "-");
});

test("measurement axis values append the analysis axis unit", () => {
  assert.equal(formatMeasurementAxisValue(0.0025, "s"), "2.500 ms");
  assert.equal(formatMeasurementAxisValue(1_000, "Hz"), "1.000 kHz");
  assert.equal(formatMeasurementAxisValue(3.3, "V"), "3.300 V");
  assert.equal(formatMeasurementAxisValue(Number.NaN, "V"), "-");
});
