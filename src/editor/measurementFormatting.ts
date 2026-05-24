export function formatMeasurementValue(v: number): string {
  if (!Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1) return v.toFixed(4);
  if (a >= 1e-3) return `${(v * 1e3).toFixed(3)} m`;
  if (a >= 1e-6) return `${(v * 1e6).toFixed(3)} u`;
  if (a >= 1e-9) return `${(v * 1e9).toFixed(3)} n`;
  if (a >= 1e-12) return `${(v * 1e12).toFixed(3)} p`;
  return v.toExponential(3);
}

export function formatMeasurementAxisValue(v: number, unit: string): string {
  if (!Number.isFinite(v)) return "-";
  return unit ? formatEngineeringWithUnit(v, unit) : formatMeasurementValue(v);
}

function formatEngineeringWithUnit(v: number, unit: string): string {
  const a = Math.abs(v);
  if (a === 0) return `0 ${unit}`;
  const prefixes: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "u"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const [scale, prefix] = prefixes.find(([candidate]) => a >= candidate) ?? [1e-15, "f"];
  const scaled = v / scale;
  return `${scaled.toFixed(3)} ${prefix}${unit}`;
}
