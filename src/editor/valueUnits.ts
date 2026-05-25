// Unit families and SPICE value parsing for the inline unit-selector input.
//
// SPICE numeric values combine a magnitude with an optional SI prefix and
// optional trailing unit letter, e.g. "10k", "1.5u", "100Meg", "47uF". The
// app stores values exactly as written in the doc; this module just splits
// them for editing in `<ValueWithUnit>` and recombines them on commit.
//
// SPICE prefix conventions used here:
//   f=1e-15 p=1e-12 n=1e-9 u=1e-6 m=1e-3 (none)=1 k=1e3 Meg=1e6 G=1e9 T=1e12
// Note "M" alone is milli, NOT mega — the dropdown shows the user the right
// label ("mΩ" vs "MΩ") so they can pick correctly without remembering the
// case rules.

export interface UnitOption {
  /** SPICE prefix as written to the doc — "k", "Meg", "u", or "" for base. */
  prefix: string;
  /** Display label shown in the dropdown — "kΩ", "MΩ", "µF". */
  label: string;
}

export interface UnitFamily {
  /** Identifier — used in tests + as the React key. */
  name: string;
  /** Base unit symbol ("Ω", "F", "V"). Allowed as trailing letter when parsing. */
  base: string;
  /** All selectable prefixes, ordered as they should appear in the dropdown. */
  options: UnitOption[];
  /** Prefix to seed the dropdown with when the field starts empty. */
  defaultPrefix: string;
}

export const UNIT_FAMILIES = {
  resistance: {
    name: "resistance",
    base: "Ω",
    options: [
      { prefix: "m", label: "mΩ" },
      { prefix: "", label: "Ω" },
      { prefix: "k", label: "kΩ" },
      { prefix: "Meg", label: "MΩ" },
      { prefix: "G", label: "GΩ" },
    ],
    defaultPrefix: "k",
  },
  capacitance: {
    name: "capacitance",
    base: "F",
    options: [
      { prefix: "f", label: "fF" },
      { prefix: "p", label: "pF" },
      { prefix: "n", label: "nF" },
      { prefix: "u", label: "µF" },
      { prefix: "m", label: "mF" },
      { prefix: "", label: "F" },
    ],
    defaultPrefix: "u",
  },
  inductance: {
    name: "inductance",
    base: "H",
    options: [
      { prefix: "p", label: "pH" },
      { prefix: "n", label: "nH" },
      { prefix: "u", label: "µH" },
      { prefix: "m", label: "mH" },
      { prefix: "", label: "H" },
    ],
    defaultPrefix: "m",
  },
  voltage: {
    name: "voltage",
    base: "V",
    options: [
      { prefix: "u", label: "µV" },
      { prefix: "m", label: "mV" },
      { prefix: "", label: "V" },
      { prefix: "k", label: "kV" },
    ],
    defaultPrefix: "",
  },
  current: {
    name: "current",
    base: "A",
    options: [
      { prefix: "p", label: "pA" },
      { prefix: "n", label: "nA" },
      { prefix: "u", label: "µA" },
      { prefix: "m", label: "mA" },
      { prefix: "", label: "A" },
    ],
    defaultPrefix: "m",
  },
  time: {
    name: "time",
    base: "s",
    options: [
      { prefix: "f", label: "fs" },
      { prefix: "p", label: "ps" },
      { prefix: "n", label: "ns" },
      { prefix: "u", label: "µs" },
      { prefix: "m", label: "ms" },
      { prefix: "", label: "s" },
    ],
    defaultPrefix: "m",
  },
  frequency: {
    name: "frequency",
    base: "Hz",
    options: [
      { prefix: "m", label: "mHz" },
      { prefix: "", label: "Hz" },
      { prefix: "k", label: "kHz" },
      { prefix: "Meg", label: "MHz" },
      { prefix: "G", label: "GHz" },
    ],
    defaultPrefix: "k",
  },
  temperature: {
    name: "temperature",
    base: "°C",
    options: [{ prefix: "", label: "°C" }],
    defaultPrefix: "",
  },
  angle: {
    name: "angle",
    base: "°",
    options: [{ prefix: "", label: "°" }],
    defaultPrefix: "",
  },
  dimensionless: {
    name: "dimensionless",
    base: "",
    options: [{ prefix: "", label: "" }],
    defaultPrefix: "",
  },
} as const satisfies Record<string, UnitFamily>;

export type UnitFamilyName = keyof typeof UNIT_FAMILIES;

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function isPlainNumber(text: string): boolean {
  return NUMBER_RE.test(text.trim());
}

/**
 * A value is "complex" — i.e. not a simple magnitude — if it looks like a
 * source spec (`PULSE(...)`, `SIN(...)`), an expression (`V=...`), contains
 * arithmetic, or has whitespace in the middle. Callers use this to fall back
 * to a plain text input rather than the unit selector.
 */
export function isComplexValue(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[()=*/+]/.test(t)) return true;
  if (/\s/.test(t)) return true;
  return false;
}

/**
 * Split a doc-stored value into magnitude + SI prefix using the given unit
 * family. If the value doesn't match any known prefix the whole thing is
 * returned as magnitude with prefix="" so the dropdown shows the base unit.
 */
export function parseValueUnit(
  text: string,
  family: UnitFamily,
): { magnitude: string; prefix: string } {
  const raw = text.trim();
  if (!raw) return { magnitude: "", prefix: family.defaultPrefix };

  // Strip optional trailing base unit ("Ω", "F", "V", "°C", …) so "10kΩ"
  // parses the same as "10k". The match is case-insensitive on the unit
  // letter but the prefix table preserves case ("Meg" vs "m").
  const baseStripped = family.base
    ? raw.replace(new RegExp(`${escapeRegex(family.base)}$`, "i"), "")
    : raw;

  // Try multi-char prefixes first ("Meg" before "M") to avoid mis-parsing.
  const byLength = [...family.options].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  for (const opt of byLength) {
    if (!opt.prefix) continue;
    if (baseStripped.endsWith(opt.prefix)) {
      const head = baseStripped.slice(0, -opt.prefix.length);
      if (isPlainNumber(head)) return { magnitude: head.trim(), prefix: opt.prefix };
    }
  }
  // No prefix matched — try the bare number form.
  if (isPlainNumber(baseStripped)) {
    return { magnitude: baseStripped.trim(), prefix: "" };
  }
  // Couldn't parse cleanly — keep the user's text in the magnitude box so
  // they can fix it and seed the dropdown with the default.
  return { magnitude: raw, prefix: family.defaultPrefix };
}

/** Combine a magnitude + SPICE prefix back into a single doc-storable string. */
export function formatValueUnit(magnitude: string, prefix: string): string {
  const m = magnitude.trim();
  if (!m) return "";
  return prefix ? `${m}${prefix}` : m;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
