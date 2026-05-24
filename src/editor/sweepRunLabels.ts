export function sweepRunLabelsFromDirectives(directives: string): Map<number, string> {
  const step = firstStepDirective(directives);
  const temps = firstTempDirective(directives);
  const mcCount = firstMonteCarloDirective(directives);

  if (!step && temps.length === 0 && mcCount === 0) return new Map();

  let runs: string[][] = [[]];
  if (step) {
    runs = runs.flatMap((labels) =>
      step.values.map((value) => [...labels, `${step.param}=${value}`]),
    );
  }
  if (temps.length > 0) {
    runs = runs.flatMap((labels) =>
      temps.map((temp) => [...labels, `${temp} °C`]),
    );
  }
  if (mcCount > 0) {
    runs = runs.flatMap((labels) =>
      Array.from({ length: mcCount }, (_, idx) => [...labels, `MC ${idx + 1}`]),
    );
  }

  return new Map(runs.map((labels, idx) => [idx + 1, labels.join(" · ")]));
}

function firstStepDirective(directives: string): { param: string; values: string[] } | null {
  for (const line of logicalDirectiveLines(directives)) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]?.toLowerCase().startsWith(".step")) continue;
    if (!parts[1] || parts[1].toLowerCase() !== "param" || !parts[2]) continue;
    const rest = parts.slice(3);
    if (rest[0]?.toLowerCase() === "list") {
      const values = rest.slice(1).filter(Boolean);
      return values.length > 0 ? { param: parts[2], values } : null;
    }
    if (rest.length >= 3) {
      const values = rangeValues(rest[0], rest[1], rest[2]);
      return values.length > 0 ? { param: parts[2], values } : null;
    }
  }
  return null;
}

function firstTempDirective(directives: string): string[] {
  for (const line of logicalDirectiveLines(directives)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0]?.toLowerCase() === ".temp") return parts.slice(1).filter(Boolean);
  }
  return [];
}

function firstMonteCarloDirective(directives: string): number {
  for (const line of logicalDirectiveLines(directives)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0]?.toLowerCase() !== ".mc") continue;
    const n = Number.parseInt(parts[1] ?? "", 10);
    return Number.isFinite(n) && n > 0 && n <= 1024 ? n : 0;
  }
  return 0;
}

function logicalDirectiveLines(directives: string): string[] {
  const lines: string[] = [];
  for (const raw of directives.split("\n")) {
    if (lines.length > 0 && raw.trim().startsWith("+")) {
      lines[lines.length - 1] += " " + raw.trim().slice(1).trim();
    } else {
      const line = raw.trim();
      if (line && !line.startsWith("*")) lines.push(line);
    }
  }
  return lines;
}

function rangeValues(startRaw: string, stopRaw: string, stepRaw: string): string[] {
  const start = parseSpiceNumber(startRaw);
  const stop = parseSpiceNumber(stopRaw);
  const step = parseSpiceNumber(stepRaw);
  if (start == null || stop == null || step == null || step === 0) return [];
  const values: string[] = [];
  const dir = Math.sign(step);
  let value = start;
  while ((stop - value) * dir >= -Math.abs(step) * 1e-9 && values.length <= 1024) {
    values.push(formatSweepNumber(value));
    value += step;
  }
  return values;
}

function parseSpiceNumber(raw: string): number | null {
  const suffixes: [string, number][] = [
    ["meg", 1e6],
    ["g", 1e9],
    ["k", 1e3],
    ["m", 1e-3],
    ["u", 1e-6],
    ["µ", 1e-6],
    ["n", 1e-9],
    ["p", 1e-12],
    ["f", 1e-15],
  ];
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  for (const [suffix, multiplier] of suffixes) {
    if (!lower.endsWith(suffix)) continue;
    const number = Number.parseFloat(trimmed.slice(0, -suffix.length));
    return Number.isFinite(number) ? number * multiplier : null;
  }
  const number = Number.parseFloat(trimmed);
  return Number.isFinite(number) ? number : null;
}

function formatSweepNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const suffixes: [number, string][] = [
    [1e9, "G"],
    [1e6, "Meg"],
    [1e3, "k"],
    [1e-3, "m"],
    [1e-6, "u"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  for (const [scale, suffix] of suffixes) {
    const scaled = value / scale;
    if (Math.abs(scaled) >= 1 && Math.abs(scaled) < 1000) {
      return `${formatCompactNumber(scaled)}${suffix}`;
    }
  }
  return formatCompactNumber(value);
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toPrecision(6).replace(/0+$/, "").replace(/\.$/, "");
}
