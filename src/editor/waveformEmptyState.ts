import type { SimVector } from "../sim/api";

export interface WaveformEmptyState {
  title: string;
  detail: string;
}

export function hasPlottableWaveform(vectors: Pick<SimVector, "is_scale" | "data">[]): boolean {
  const scale = vectors.find((v) => v.is_scale);
  return !!scale && scale.data.length > 1;
}

export function waveformPaneEmptyState(
  plot: string,
  vectors: Pick<SimVector, "is_scale" | "data">[],
): WaveformEmptyState {
  const scale = vectors.find((v) => v.is_scale);
  if (isOperatingPointPlot(plot)) {
    return {
      title: "Operating point has no waveform",
      detail:
        "OP solves one static circuit state, so there is no time or sweep axis to plot. Switch to Tran, AC, or DC and run to see traces.",
    };
  }
  if (!scale) {
    return {
      title: "No waveform axis returned",
      detail:
        "The run completed, but ngspice did not return a time, frequency, or sweep scale. Check the analysis settings and generated netlist.",
    };
  }
  if (scale.data.length <= 1) {
    return {
      title: "Not enough waveform samples",
      detail:
        "The run returned fewer than two points. Increase the stop/sweep range or reduce the time step, then run again.",
    };
  }
  return {
    title: "No waveform to show",
    detail:
      "The run completed without plottable data. Add probes or expose node voltages/currents, then run again.",
  };
}

export function waveformTraceListEmptyMessage(
  vectors: Pick<SimVector, "name" | "is_scale">[],
  showInternal: boolean,
): string {
  const rawTraceCount = vectors.filter((v) => !v.is_scale).length;
  const userTraceCount = vectors.filter((v) => !v.is_scale && !isInternalTraceName(v.name)).length;
  if (rawTraceCount === 0) {
    return "No traces returned. Add a probe or run an analysis that produces node vectors.";
  }
  if (!showInternal && userTraceCount === 0) {
    return "Only internal generated vectors are available. Turn on Internal to inspect them.";
  }
  return "No visible traces. Use Show all to restore the plot.";
}

export function isInternalTraceName(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith("@") || n.includes(".") || /^x\d+\./.test(n) || /^e\.x\d+\./.test(n);
}

function isOperatingPointPlot(plot: string): boolean {
  const p = plot.trim().toLowerCase();
  return p === "op" || /^op\d*$/.test(p) || p === "operating point" || p.startsWith("op ");
}
