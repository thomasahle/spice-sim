import type { AnalysisSpec } from "./model";

export function analysisXAxisLabel(analysis: AnalysisSpec): string {
  switch (analysis.kind) {
    case "tran":
      return "Time (s)";
    case "ac":
    case "noise":
      return "Frequency (Hz)";
    case "dc": {
      const src = analysis.src?.trim() || "Source";
      const unit = /^i/i.test(src) ? "A" : "V";
      return `${src} sweep (${unit})`;
    }
    case "op":
      return "Sample";
  }
}

export function axisUnitFromLabel(label: string): string {
  const m = label.match(/\(([^)]+)\)\s*$/);
  return m?.[1] ?? "";
}
