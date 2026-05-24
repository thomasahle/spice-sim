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
