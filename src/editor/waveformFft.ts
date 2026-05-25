export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function interpolateFiniteSample(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  t: number,
): number {
  const y0Finite = Number.isFinite(y0);
  const y1Finite = Number.isFinite(y1);
  if (!y0Finite && !y1Finite) return 0;
  if (!y0Finite) return y1;
  if (!y1Finite) return y0;
  const span = x1 - x0;
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(span) || span <= 0) return y0;
  const f = (t - x0) / span;
  return y0 * (1 - f) + y1 * f;
}

export function resampleUniform(scale: number[], data: number[], N: number): { samples: Float64Array; dt: number } {
  const samples = new Float64Array(N);
  if (scale.length < 2 || N < 2) return { samples, dt: 1 };
  const xMin = scale[0];
  const xMax = scale[scale.length - 1];
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return { samples, dt: 1 };
  const dt = (xMax - xMin) / (N - 1);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const t = xMin + i * dt;
    while (j < scale.length - 2 && scale[j + 1] < t) j++;
    samples[i] = interpolateFiniteSample(scale[j], scale[j + 1], data[j], data[j + 1], t);
  }
  return { samples, dt };
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const x = i + k;
        const y = i + k + half;
        const er = re[y] * curRe - im[y] * curIm;
        const ei = re[y] * curIm + im[y] * curRe;
        re[y] = re[x] - er;
        im[y] = im[x] - ei;
        re[x] += er;
        im[x] += ei;
        const newRe = curRe * wRe - curIm * wIm;
        const newIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
        curIm = newIm;
      }
    }
  }
}

export function computeFFT(scale: number[], data: number[], N: number): number[] {
  const { samples } = resampleUniform(scale, data, N);
  // Hann window
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    samples[i] *= w;
  }
  const im = new Float64Array(N);
  fftInPlace(samples, im);
  const mag: number[] = [];
  for (let i = 1; i < N / 2; i++) {
    mag.push((2 * Math.sqrt(samples[i] * samples[i] + im[i] * im[i])) / N);
  }
  return mag;
}
