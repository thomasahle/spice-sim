import assert from "node:assert/strict";
import test from "node:test";
import { computeFFT, resampleUniform } from "../src/editor/waveformFft.ts";

test("FFT resampling replaces non-finite samples before spectral analysis", () => {
  const scale = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const data = [0, 1, NaN, 3, Infinity, 5, 6, -Infinity, 8];

  const { samples, dt } = resampleUniform(scale, data, 8);
  assert.equal(Number.isFinite(dt), true);
  assert.equal([...samples].every(Number.isFinite), true);

  const spectrum = computeFFT(scale, data, 8);
  assert.equal(spectrum.length, 3);
  assert.equal(spectrum.every(Number.isFinite), true);
});

test("FFT resampling returns quiet samples for invalid scale bounds", () => {
  const { samples, dt } = resampleUniform([NaN, 1], [1, 2], 4);

  assert.equal(dt, 1);
  assert.deepEqual([...samples], [0, 0, 0, 0]);
});
