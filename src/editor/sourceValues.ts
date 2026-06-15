export function isAcStimulus(value: string): boolean {
  return /\bAC\b/i.test(value);
}

const TIME_DOMAIN_WAVEFORM = /\b(SIN|PULSE|EXP|PWL|SFFM)\b/i;

/** True when a source's only excitation is an AC (small-signal) magnitude —
 *  no time-domain waveform and no non-zero DC level. Such a source is INERT in
 *  a transient/OP run (it sits at 0 V/A); AC magnitude only drives `.ac`
 *  analysis. Used to warn when someone runs Tran with an "AC 1" source. */
export function isTransientSilentSource(value: string): boolean {
  if (!isAcStimulus(value)) return false;
  if (TIME_DOMAIN_WAVEFORM.test(value)) return false;
  // Drop the AC clause ("AC", optional magnitude, optional phase) and the DC
  // keyword; any non-zero number left is a real DC level → active in transient.
  const rest = value
    .replace(/\bAC\b\s*[-+0-9.eE]*\s*[-+0-9.eE]*/i, " ")
    .replace(/\bDC\b/gi, " ");
  const numbers = rest.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  return !numbers.some((n) => Math.abs(parseFloat(n)) > 0);
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
