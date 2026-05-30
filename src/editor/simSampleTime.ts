// Binary-search the nearest sample index for a given playback time over a
// monotone time axis. Used by Live Flow and other "what does the signal
// look like at this moment" derivations.

export function findTimeIndex(xs: number[], t: number): number {
  if (xs.length === 0) return 0;
  if (t <= xs[0]) return 0;
  if (t >= xs[xs.length - 1]) return xs.length - 1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - t) < Math.abs(xs[hi] - t) ? lo : hi;
}
