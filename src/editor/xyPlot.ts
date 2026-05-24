export interface XySample {
  index: number;
  x: number;
  y: number;
}

export function defaultXyTraceNames(traceNames: string[]): { xName: string; yName: string } | null {
  if (traceNames.length < 2) return null;
  const voltageNames = voltageTraceNames(traceNames);
  const candidates = voltageNames.length >= 2 ? voltageNames : traceNames;
  const transferPair = inputOutputTracePair(candidates);
  if (transferPair) return transferPair;
  return { xName: candidates[0], yName: candidates[1] };
}

export function voltageTraceNames(traceNames: string[]): string[] {
  return traceNames.filter(isVoltageTraceName);
}

export function pairedXySamples(xData: number[], yData: number[]): XySample[] {
  const n = Math.min(xData.length, yData.length);
  const samples: XySample[] = [];
  for (let i = 0; i < n; i++) {
    const x = xData[i];
    const y = yData[i];
    if (Number.isFinite(x) && Number.isFinite(y)) samples.push({ index: i, x, y });
  }
  return samples;
}

export function nearestXySample(
  samples: XySample[],
  px: number,
  py: number,
  project: (sample: XySample) => { px: number; py: number },
): XySample | null {
  let best: XySample | null = null;
  let bestDist2 = Infinity;
  for (const sample of samples) {
    const projected = project(sample);
    const dx = projected.px - px;
    const dy = projected.py - py;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < bestDist2) {
      best = sample;
      bestDist2 = dist2;
    }
  }
  return best;
}

function isVoltageTraceName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.startsWith("v(") ||
    (!normalized.startsWith("@") &&
      !normalized.startsWith("i(") &&
      !normalized.endsWith("#branch") &&
      !normalized.includes("#branch"))
  );
}

function inputOutputTracePair(traceNames: string[]): { xName: string; yName: string } | null {
  const input = traceNames.find((name) => isInputTraceName(name));
  const output = traceNames.find((name) => isOutputTraceName(name));
  if (!input || !output || input === output) return null;
  return { xName: input, yName: output };
}

function isInputTraceName(name: string): boolean {
  const n = signalNameCore(name);
  return n === "in" || n === "vin" || n === "input" || n === "vinput";
}

function isOutputTraceName(name: string): boolean {
  const n = signalNameCore(name);
  return n === "out" || n === "vout" || n === "output" || n === "voutput";
}

function signalNameCore(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const voltageMatch = /^v\((.*)\)$/.exec(trimmed);
  return (voltageMatch?.[1] ?? trimmed).replace(/[^a-z0-9]/g, "");
}
