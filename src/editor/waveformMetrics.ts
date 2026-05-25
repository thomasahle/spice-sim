export interface TraceMetrics {
  vpp: number;
  vmin: number;
  vmax: number;
  vmean: number;
  vrms: number;
  /** Estimated fundamental frequency via zero crossings; NaN if not detectable. */
  freqHz: number;
}

export function computeMetrics(scale: number[], data: number[]): TraceMetrics {
  let vmin = Infinity;
  let vmax = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (const v of data) {
    if (!Number.isFinite(v)) continue;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    sum += v;
    sumSq += v * v;
    n++;
  }
  if (n === 0) {
    return { vpp: NaN, vmin: NaN, vmax: NaN, vmean: NaN, vrms: NaN, freqHz: NaN };
  }
  const vmean = sum / n;
  const vrms = Math.sqrt(sumSq / n);
  const vpp = vmax - vmin;
  // Frequency via zero crossings of (data - mean); pairs make one period.
  let crossings = 0;
  let lastSign = 0;
  for (let i = 0; i < data.length; i++) {
    const sample = data[i];
    if (!Number.isFinite(sample)) continue;
    const v = sample - vmean;
    const s = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) crossings++;
    if (s !== 0) lastSign = s;
  }
  let freqHz = NaN;
  if (
    crossings >= 2 &&
    scale.length === data.length &&
    scale.length > 1 &&
    Number.isFinite(scale[scale.length - 1] - scale[0])
  ) {
    const dt = scale[scale.length - 1] - scale[0];
    if (dt > 0) freqHz = crossings / (2 * dt);
  }
  return { vpp, vmin, vmax, vmean, vrms, freqHz };
}
