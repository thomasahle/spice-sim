export interface SweepMetrics {
  start: number;
  end: number;
  min: number;
  minX: number;
  max: number;
  maxX: number;
  delta: number;
}

export function computeSweepMetrics(scale: number[], data: number[]): SweepMetrics {
  let firstIdx = -1;
  let lastIdx = -1;
  let minIdx = -1;
  let maxIdx = -1;
  let min = Infinity;
  let max = -Infinity;
  const n = Math.min(scale.length, data.length);
  for (let i = 0; i < n; i++) {
    const x = scale[i];
    const y = data[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (firstIdx < 0) firstIdx = i;
    lastIdx = i;
    if (y < min) {
      min = y;
      minIdx = i;
    }
    if (y > max) {
      max = y;
      maxIdx = i;
    }
  }
  const start = firstIdx >= 0 ? data[firstIdx] : NaN;
  const end = lastIdx >= 0 ? data[lastIdx] : NaN;
  return {
    start,
    end,
    min: minIdx >= 0 ? data[minIdx] : NaN,
    minX: minIdx >= 0 ? scale[minIdx] : NaN,
    max: maxIdx >= 0 ? data[maxIdx] : NaN,
    maxX: maxIdx >= 0 ? scale[maxIdx] : NaN,
    delta: Number.isFinite(start) && Number.isFinite(end) ? end - start : NaN,
  };
}
