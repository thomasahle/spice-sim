import type { ComponentKind } from "./model";

export function formatValueForKind(kind: ComponentKind, value: string): string {
  if (kind === "V" || kind === "I") return formatSourceLabel(value, kind);
  if (kind === "B") return formatBehavioralLabel(value);
  if (kind === "R") return formatPassiveLabel(value, "Ω");
  if (kind === "C") return formatPassiveLabel(value, "F");
  if (kind === "L") return formatPassiveLabel(value, "H");
  return value;
}

export function canvasValueLabel(kind: ComponentKind, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isCanvasModelKind(kind) || kind === "SUBX" || kind === "LABEL") return null;
  return formatValueForKind(kind, trimmed);
}

// Short, friendly label for V/I sources on the schematic. The inspector can
// show full SPICE syntax; the canvas should show only the useful gist.
export function formatSourceLabel(raw: string, kind: "V" | "I"): string {
  const v = (raw ?? "").trim();
  const unit = kind === "V" ? "V" : "A";
  if (!v) return `0 ${unit}`;

  if (/^[-+]?[0-9.][\w.+-]*$/.test(v)) return formatQuantityLabel(v, unit);

  const upper = v.toUpperCase();
  const acMagnitude = acMagnitudeFromSource(v);
  if (upper.startsWith("DC")) {
    const rest = v.replace(/^DC\s*/i, "").trim();
    const transient = transientFunctionFromDcRemainder(rest);
    if (transient) {
      const transientLabel = formatTransientFunctionLabel(transient.fn, unit);
      if (transientLabel) {
        if (transient.dcValue && !isZeroQuantity(transient.dcValue)) {
          return `${formatQuantityLabel(transient.dcValue, unit)} / ${transientLabel}`;
        }
        return transientLabel;
      }
    }
    if (acMagnitude) {
      const dcValue = rest.replace(/\bAC\b.*$/i, "").trim();
      if (dcValue && !isZeroQuantity(dcValue)) {
        return `${formatQuantityLabel(dcValue, unit)} / AC ${formatQuantityLabel(acMagnitude, unit)}`;
      }
      return `AC ${formatQuantityLabel(acMagnitude, unit)}`;
    }
    return rest ? formatQuantityLabel(rest, unit) : `0 ${unit}`;
  }

  if (upper.startsWith("AC")) {
    return `AC ${formatQuantityLabel(acMagnitude || "1", unit)}`;
  }

  const transientLabel = formatTransientFunctionLabel(v, unit);
  if (transientLabel) return transientLabel;

  return v.length > 18 ? v.slice(0, 16) + "…" : v;
}

function transientFunctionFromDcRemainder(
  value: string,
): { dcValue: string | null; fn: string } | null {
  const match = value.match(/\b(?:SIN|SINE|PULSE|EXP|SFFM|PWL)\s*\(/i);
  if (!match || match.index === undefined) return null;
  const before = value.slice(0, match.index).trim();
  const fn = value.slice(match.index).trim();
  return {
    dcValue: before ? before.split(/\s+/)[0] ?? null : null,
    fn,
  };
}

function formatTransientFunctionLabel(raw: string, unit: "V" | "A"): string | null {
  const m = raw.trim().match(/^(\w+)\s*\(([^)]*)\)/);
  if (m) {
    const fn = m[1].toUpperCase();
    const args = m[2].split(/[\s,]+/).filter(Boolean);
    switch (fn) {
      case "SIN":
      case "SINE": {
        const va = args[1] ?? "?";
        const freq = args[2] ?? "?";
        return `~${formatCompactQuantityLabel(va, unit)} ${formatFrequencyLabel(freq)}`;
      }
      case "PULSE": {
        const v1 = args[0] ?? "0";
        const v2 = args[1] ?? "?";
        return formatPulseRangeLabel(v1, v2, unit);
      }
      case "EXP":
        return `Exp ${formatQuantityLabel(args[0] ?? "0", unit)}→${formatQuantityLabel(args[1] ?? "?", unit)}`;
      case "SFFM":
        return `SFFM ${formatQuantityLabel(args[1] ?? "?", unit)}`;
      case "PWL":
        return `PWL (${args.length / 2} pts)`;
    }
  }

  return null;
}

function acMagnitudeFromSource(value: string): string | null {
  const match = value.match(/\bAC\b\s*([^\s,)]+)/i);
  return match?.[1]?.trim() || null;
}

function isZeroQuantity(value: string): boolean {
  return /^[-+]?0+(?:\.0*)?(?:e[-+]?\d+)?$/i.test(value.trim());
}

function formatBehavioralLabel(raw: string): string {
  const v = raw.trim();
  if (!v) return "V=0";
  return v.length > 22 ? v.slice(0, 20) + "…" : v;
}

export function formatPassiveLabel(value: string, unit: "Ω" | "F" | "H"): string {
  const v = value.trim();
  if (!v) return unit === "Ω" ? "0 Ω" : `0 ${unit}`;
  if (unit === "Ω") {
    if (/[ΩΩ]$/i.test(v)) return v.replace(/Ω/g, "Ω");
    if (/ohms?$/i.test(v)) return v.replace(/\s*ohms?$/i, "Ω");
    return `${v}Ω`;
  }
  return new RegExp(`${unit}$`, "i").test(v) ? v : `${v}${unit}`;
}

function formatQuantityLabel(value: string, unit: "V" | "A"): string {
  const v = value.trim();
  if (!v || v === "?") return v || `0 ${unit}`;
  if (hasUnitSuffix(v, unit)) return v;
  return hasScaleSuffix(v) ? `${v}${unit}` : `${v} ${unit}`;
}

function formatCompactQuantityLabel(value: string, unit: "V" | "A"): string {
  return formatQuantityLabel(value, unit).replace(/\s+/g, "");
}

function formatPulseRangeLabel(start: string, stop: string, unit: "V" | "A"): string {
  const startLabel = formatCompactQuantityLabel(start, unit);
  const stopLabel = formatCompactQuantityLabel(stop, unit);
  const startBare = simpleUnitlessLabel(startLabel, unit);
  if (startBare && /^[-+]?0(?:\.0*)?$/.test(startBare)) return `${stopLabel} step`;
  if (startBare) return `${startBare}-${stopLabel}`;
  return `${startLabel}→${stopLabel}`;
}

function simpleUnitlessLabel(label: string, unit: "V" | "A"): string | null {
  const match = label.match(new RegExp(`^([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))${unit}$`, "i"));
  return match?.[1] ?? null;
}

function formatFrequencyLabel(value: string): string {
  const v = value.trim();
  if (!v || v === "?") return v || "?";
  return /hz$/i.test(v) ? v : `${v}Hz`;
}

function hasUnitSuffix(value: string, unit: "V" | "A"): boolean {
  return new RegExp(`[fpnumkKMGT]?${unit}$`, "i").test(value.trim());
}

function hasScaleSuffix(value: string): boolean {
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?[fpnumkKMGT]$/i.test(value.trim());
}

function isCanvasModelKind(kind: ComponentKind): boolean {
  return (
    kind === "D" ||
    kind === "NPN" ||
    kind === "PNP" ||
    kind === "NMOS" ||
    kind === "PMOS" ||
    kind === "OPAMP"
  );
}
