export type ViewTab = "viewer" | "xy" | "ac" | "dc" | "bode" | "info";

export interface WaveformTabAvailability {
  plot: string;
  xyAvailable: boolean;
}

export function isWaveformTabEnabled(
  kind: ViewTab,
  { plot, xyAvailable }: WaveformTabAvailability,
): boolean {
  const normalizedPlot = plot.toLowerCase();
  const isAc = normalizedPlot.startsWith("ac");
  const isDc = normalizedPlot.startsWith("dc");
  if (kind === "xy") return xyAvailable;
  if (kind === "ac" || kind === "bode") return isAc;
  if (kind === "dc") return isDc;
  return true;
}

export function fallbackWaveformTab(
  active: ViewTab,
  availability: WaveformTabAvailability,
): ViewTab {
  return isWaveformTabEnabled(active, availability) ? active : "viewer";
}

export function waveformTabUnavailableReason(
  kind: ViewTab,
  availability: WaveformTabAvailability,
): string | null {
  if (isWaveformTabEnabled(kind, availability)) return null;
  if (kind === "xy") {
    return "X/Y plot needs at least two simulated traces. Add another probe or show another trace, then run again.";
  }
  if (kind === "ac" || kind === "bode") {
    return "Available after an AC sweep. Switch the analysis to AC and run the simulation.";
  }
  if (kind === "dc") {
    return "Available after a DC sweep. Switch the analysis to DC and run the simulation.";
  }
  return null;
}
