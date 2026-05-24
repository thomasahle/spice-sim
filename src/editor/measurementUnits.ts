import type { Measurement } from "../sim/api";
import { formatMeasurementAxisValue, formatMeasurementValue } from "./measurementFormatting.ts";

export interface MeasurementDirectiveInfo {
  analysis: string;
  name: string;
  func: string;
  expr: string;
}

export function measurementDirectivesFromText(directives: string): Map<string, MeasurementDirectiveInfo> {
  const out = new Map<string, MeasurementDirectiveInfo>();
  for (const raw of directives.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("*") || !line.toLowerCase().startsWith(".meas")) continue;
    const parts = line.split(/\s+/);
    const analysis = parts[1]?.toLowerCase() ?? "";
    const name = parts[2] ?? "";
    const func = parts[3]?.toUpperCase() ?? "";
    if (!name) continue;
    out.set(name.toLowerCase(), {
      analysis,
      name,
      func,
      expr: parts.slice(4).join(" ").trim(),
    });
  }
  return out;
}

export function measurementValueUnit(
  _measurement: Measurement,
  directive: MeasurementDirectiveInfo | undefined,
  xAxisUnit: string,
): string {
  if (!directive) return "";
  if (directive.func === "WHEN") return xAxisUnit;
  return expressionUnit(directive.expr);
}

export function formatMeasurementResultValue(
  measurement: Measurement,
  directive: MeasurementDirectiveInfo | undefined,
  xAxisUnit: string,
): string {
  const unit = measurementValueUnit(measurement, directive, xAxisUnit);
  return unit
    ? formatMeasurementAxisValue(measurement.value, unit)
    : formatMeasurementValue(measurement.value);
}

function expressionUnit(expr: string): string {
  const trimmed = expr.trim();
  if (/^v\s*\([^)]*\)(?:\s+(?:at|from|to|td|rise|fall|cross)\b.*)?$/i.test(trimmed)) return "V";
  if (/^i\s*\([^)]*\)(?:\s+(?:at|from|to|td|rise|fall|cross)\b.*)?$/i.test(trimmed)) return "A";
  return "";
}
