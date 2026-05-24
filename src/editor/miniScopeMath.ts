export function scopeReadoutValue(
  scale: number[],
  trace: number[],
  playTime: number | null | undefined,
): number | null {
  if (trace.length === 0) return null;
  if (playTime == null || scale.length <= 1) {
    const last = trace.at(-1);
    return Number.isFinite(last) ? last! : null;
  }
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let idx = 0; idx < scale.length && idx < trace.length; idx++) {
    if (!Number.isFinite(scale[idx]) || !Number.isFinite(trace[idx])) continue;
    const dist = Math.abs(scale[idx] - playTime);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  }
  return bestIdx >= 0 ? trace[bestIdx] : null;
}

export function shouldUseLogScopeX(scale: number[]): boolean {
  if (scale.length < 3) return false;
  let first = Number.NaN;
  let last = Number.NaN;
  for (const value of scale) {
    if (!Number.isFinite(value)) continue;
    if (!Number.isFinite(first)) first = value;
    last = value;
  }
  return first > 0 && last > first && last / first >= 100;
}
