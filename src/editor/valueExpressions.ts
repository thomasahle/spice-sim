const SCALE: Record<string, number> = {
  "": 1,
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  "µ": 1e-6,
  m: 1e-3,
  k: 1e3,
  meg: 1e6,
  g: 1e9,
  t: 1e12,
};

export function parseSpiceUnitStrict(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zA-Zµ]*)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit in SCALE) return n * SCALE[unit];
  if (unit.startsWith("meg")) return n * 1e6;
  return null;
}

export function normalizeNumericExpression(input: string): string | null {
  const trimmed = stripFriendlyUnitSpacing(input.trim());
  if (!trimmed || /[{}]/.test(trimmed)) return null;
  const parser = new NumericExpressionParser(trimmed);
  const value = parser.parse();
  return value === null ? null : formatNumber(value);
}

export function normalizeDeviceValue(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  return normalizeNumericExpression(trimmed) ?? trimmed;
}

export function normalizeLengthValue(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  if (shouldPreserveSimpleSpiceToken(trimmed)) return trimmed;
  return normalizeLengthQuantity(trimmed) ?? normalizeNumericExpression(stripLengthBaseUnit(trimmed)) ?? trimmed;
}

export function normalizeSourceValue(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  const fn = trimmed.match(/^(\w+)\s*\(([^)]*)\)\s*$/);
  if (fn) {
    const name = fn[1].toUpperCase();
    const args = splitSourceArgs(fn[2]).map((arg, index) =>
      normalizeSourceArg(name, index, arg),
    );
    return `${name}(${args.join(" ")})`;
  }
  const keyword = trimmed.match(/^([A-Za-z]+)\b\s*(.*)$/);
  if (keyword) {
    const head = keyword[1].toUpperCase();
    const rest = keyword[2].trim();
    if (head === "DC") {
      const value = normalizeSourceArg("DC", 0, rest);
      return `DC ${value || "0"}`;
    }
    if (head === "AC") {
      const args = splitSourceArgs(rest).map((arg, index) =>
        normalizeSourceArg("AC", index, arg),
      );
      return `AC ${args.join(" ") || "1"}`;
    }
    if (/^(SIN|COS|PULSE|EXP|PWL|SFFM)$/.test(head)) return trimmed;
  }
  const numeric = normalizeSourceArg("DC", 0, trimmed);
  return numeric ? `DC ${numeric}` : trimmed;
}

export function normalizePassiveValue(
  input: string,
  fallback: string,
  unit: "ohm" | "farad" | "henry",
): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  if (shouldPreserveSpiceNumberToken(trimmed, unit)) return trimmed;
  const withoutBaseUnit = stripBasePassiveUnit(trimmed, unit);
  return normalizeNumericExpression(withoutBaseUnit) ?? trimmed;
}

function stripBasePassiveUnit(input: string, unit: "ohm" | "farad" | "henry"): string {
  if (unit === "ohm") return input.replace(/\s*(ohms?|Ω|Ω)/gi, "");
  if (unit === "farad") return input.replace(/\s*(farads?|F)\b/g, "");
  return input.replace(/\s*(henrys?|H)\b/g, "");
}

function shouldPreserveSpiceNumberToken(input: string, unit: "ohm" | "farad" | "henry"): boolean {
  if (/\s|[()+*/ΩΩ]/.test(input)) return false;
  if (unit === "ohm" && /ohms?$/i.test(input)) return false;
  if (unit === "farad" && /(?:farads?|F)$/g.test(input)) return false;
  if (unit === "henry" && /(?:henrys?|H)$/g.test(input)) return false;
  return parseSpiceUnitStrict(input) !== null;
}

function shouldPreserveSimpleSpiceToken(input: string): boolean {
  return !/\s|[()+*/]/.test(input) && parseSpiceUnitStrict(input) !== null;
}

function normalizeLengthQuantity(input: string): string | null {
  const compact = input.trim().replace(/\s+/g, "");
  const m = compact.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(.*)$/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier = lengthSuffixMultiplier(m[2]);
  return multiplier === null ? null : formatNumber(value * multiplier);
}

function stripLengthBaseUnit(input: string): string {
  return input
    .replace(/\s*(meters?|metres?|microns?)\b/gi, "")
    .replace(/([fpnumkMgtµ]|meg)\s*m\b/gi, "$1")
    .replace(/\s*m\b/gi, "");
}

function lengthSuffixMultiplier(raw: string): number | null {
  const lower = raw.toLowerCase();
  if (!lower) return 1;
  if (lower === "meter" || lower === "meters" || lower === "metre" || lower === "metres") return 1;
  if (lower === "micron" || lower === "microns") return 1e-6;
  const baseUnits = ["meters", "meter", "metres", "metre", "m"];
  for (const base of baseUnits) {
    if (!lower.endsWith(base)) continue;
    const prefix = raw.slice(0, raw.length - base.length);
    return scaleForPrefix(prefix);
  }
  return null;
}

function stripFriendlyUnitSpacing(input: string): string {
  return input
    .replace(/([0-9.])\s+(meg|[fpnumkgtµ])\s*(ohms?|Ω|Ω|f|farads?|h|henrys?|v|volts?|a|amps?|hz|s|sec|secs|seconds?)?\b/gi, "$1$2")
    .replace(/([0-9.])\s+(ohms?|Ω|Ω|f|farads?|h|henrys?|v|volts?|a|amps?|hz|s|sec|secs|seconds?|deg|degrees?)\b/gi, "$1");
}

function splitSourceArgs(input: string): string[] {
  const parts = input.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    const next = parts[i + 1];
    if (next && isPlainNumberToken(current) && isUnitToken(next)) {
      out.push(current + next);
      i++;
    } else {
      out.push(current);
    }
  }
  return out;
}

function normalizeSourceArg(sourceKind: string, index: number, raw: string): string {
  const arg = raw.trim();
  if (!arg) return arg;
  const category = sourceArgCategory(sourceKind, index);
  return normalizeQuantityToken(arg, category) ?? normalizeNumericExpression(arg) ?? arg;
}

type SourceArgCategory = "amplitude" | "time" | "frequency" | "angle" | "plain";

function sourceArgCategory(sourceKind: string, index: number): SourceArgCategory {
  switch (sourceKind.toUpperCase()) {
    case "DC":
      return "amplitude";
    case "AC":
      return index === 0 ? "amplitude" : "angle";
    case "SIN":
    case "SINE":
    case "COS":
      return ["amplitude", "amplitude", "frequency", "time", "frequency", "angle"][index] as SourceArgCategory ?? "plain";
    case "PULSE":
      return index <= 1 ? "amplitude" : "time";
    case "EXP":
      return index <= 1 ? "amplitude" : "time";
    case "SFFM":
      return ["amplitude", "amplitude", "frequency", "plain", "frequency"][index] as SourceArgCategory ?? "plain";
    case "PWL":
      return index % 2 === 0 ? "time" : "amplitude";
  }
  return "plain";
}

function normalizeQuantityToken(input: string, category: SourceArgCategory): string | null {
  const m = input.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zA-Zµ]*)$/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = sourceSuffixMultiplier(m[2], category);
  if (suffix === null) return null;
  return formatNumber(value * suffix);
}

function sourceSuffixMultiplier(raw: string, category: SourceArgCategory): number | null {
  if (!raw) return 1;
  const lower = raw.toLowerCase();
  if (category === "angle") {
    return lower === "deg" || lower === "degree" || lower === "degrees" ? 1 : null;
  }
  const unitless = suffixWithoutBaseUnit(raw, category);
  if (unitless === null) return null;
  if (!unitless) return 1;
  return scaleForPrefix(unitless);
}

function suffixWithoutBaseUnit(raw: string, category: SourceArgCategory): string | null {
  const lower = raw.toLowerCase();
  if (category === "frequency") {
    if (lower.endsWith("hz")) return raw.slice(0, -2);
    return raw;
  }
  if (category === "time") {
    if (lower.endsWith("seconds")) return raw.slice(0, -7);
    if (lower.endsWith("second")) return raw.slice(0, -6);
    if (lower.endsWith("secs")) return raw.slice(0, -4);
    if (lower.endsWith("sec")) return raw.slice(0, -3);
    if (lower.endsWith("s")) return raw.slice(0, -1);
    return raw;
  }
  if (category === "amplitude") {
    if (lower.endsWith("volts")) return raw.slice(0, -5);
    if (lower.endsWith("volt")) return raw.slice(0, -4);
    if (lower.endsWith("amps")) return raw.slice(0, -4);
    if (lower.endsWith("amp")) return raw.slice(0, -3);
    if (lower.endsWith("v") || lower.endsWith("a")) return raw.slice(0, -1);
    return raw;
  }
  return raw;
}

function scaleForPrefix(raw: string): number | null {
  if (!raw) return 1;
  const normalized = raw === "µ" ? "u" : raw;
  const lower = normalized.toLowerCase();
  if (lower.startsWith("meg")) return 1e6;
  if (normalized === "M") return 1e6;
  if (lower in SCALE) return SCALE[lower];
  return null;
}

function isPlainNumberToken(input: string): boolean {
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(input);
}

function isUnitToken(input: string): boolean {
  return /^(?:[fpnumkMgtµ]?)(?:ohms?|Ω|Ω|f|farads?|h|henrys?|v|volts?|a|amps?|hz|s|sec|secs|seconds?|deg|degrees?)$/i.test(input) ||
    /^meg(?:ohms?|Ω|Ω|f|farads?|h|henrys?|v|volts?|a|amps?|hz|s|sec|secs|seconds?)?$/i.test(input);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Object.is(value, -0) || Math.abs(value) < 1e-24) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e6) {
    return Number.isInteger(value)
      ? String(value)
      : value.toPrecision(12).replace(/0+$/, "").replace(/\.$/, "");
  }
  return value.toExponential(12).replace(/\.?0+e/, "e").replace("e+", "e");
}

class NumericExpressionParser {
  i = 0;
  source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse(): number | null {
    const value = this.expression();
    this.skipWs();
    return value !== null && this.i === this.source.length && Number.isFinite(value)
      ? value
      : null;
  }

  expression(): number | null {
    let left = this.term();
    if (left === null) return null;
    while (true) {
      this.skipWs();
      const op = this.peek();
      if (op !== "+" && op !== "-") break;
      this.i++;
      const right = this.term();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  term(): number | null {
    let left = this.factor();
    if (left === null) return null;
    while (true) {
      this.skipWs();
      const op = this.peek();
      if (op !== "*" && op !== "/") break;
      this.i++;
      const right = this.factor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  factor(): number | null {
    this.skipWs();
    const ch = this.peek();
    if (ch === "+" || ch === "-") {
      this.i++;
      const value = this.factor();
      if (value === null) return null;
      return ch === "-" ? -value : value;
    }
    if (ch === "(") {
      this.i++;
      const value = this.expression();
      this.skipWs();
      if (this.peek() !== ")") return null;
      this.i++;
      return value;
    }
    return this.number();
  }

  number(): number | null {
    this.skipWs();
    const rest = this.source.slice(this.i);
    const m = rest.match(/^((?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zA-ZµΩΩ]*)/i);
    if (!m) return null;
    this.i += m[0].length;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = canonicalSuffix(m[2]);
    if (suffix === null) return null;
    return base * (SCALE[suffix] ?? 1);
  }

  skipWs() {
    while (/\s/.test(this.peek())) this.i++;
  }

  peek(): string {
    return this.source[this.i] ?? "";
  }
}

function canonicalSuffix(raw: string): string | null {
  const suffix = raw.trim().toLowerCase().replace(/Ω/g, "ω");
  if (!suffix) return "";
  if (suffix.startsWith("meg")) return "meg";
  if (suffix.startsWith("ohm") || suffix === "ω" || suffix === "Ω".toLowerCase()) return "";
  if (suffix === "v" || suffix === "volt" || suffix === "volts") return "";
  if (suffix === "a" || suffix === "amp" || suffix === "amps") return "";
  if (suffix === "hz") return "";
  if (suffix === "s" || suffix === "sec" || suffix === "secs" || suffix === "second" || suffix === "seconds") return "";
  if (suffix === "deg" || suffix === "degree" || suffix === "degrees") return "";
  const first = suffix[0];
  if (first in SCALE) return first;
  return null;
}
