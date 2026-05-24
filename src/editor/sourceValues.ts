export function isAcStimulus(value: string): boolean {
  return /\bAC\b/i.test(value);
}

export function sourceValueWithAcStimulus(value: string): string {
  return isAcStimulus(value) ? value : "AC 1";
}

export type SourcePreset = "ac1" | "sine60" | "sine1k" | "pulseStep";

export function sourcePresetValue(
  preset: SourcePreset,
  sourceKind: "V" | "I" = "V",
): string {
  const isCurrent = sourceKind === "I";
  switch (preset) {
    case "ac1":
      return isCurrent ? "AC 1m" : "AC 1";
    case "sine60":
      return isCurrent ? "SIN(0 1m 60)" : "SIN(0 5 60)";
    case "sine1k":
      return isCurrent ? "SIN(0 1m 1k)" : "SIN(0 1 1k)";
    case "pulseStep":
      return isCurrent
        ? "PULSE(0 1m 0 1u 1u 5m 10m)"
        : "PULSE(0 5 0 1u 1u 5m 10m)";
  }
}
