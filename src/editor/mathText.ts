// Layout-only helpers for text that is rendered with KaTeX elsewhere.
// Keep this file deliberately small: it estimates geometry, but it does not
// transform TeX into visible glyphs.

const COMMAND_WIDTHS: Record<string, number> = {
  alpha: 0.65,
  beta: 0.62,
  gamma: 0.64,
  Delta: 0.78,
  delta: 0.62,
  eta: 0.58,
  kappa: 0.66,
  lambda: 0.66,
  mu: 0.62,
  omega: 0.78,
  Omega: 0.84,
  partial: 0.7,
  sum: 0.9,
  int: 0.64,
  sqrt: 0.95,
  frac: 1.8,
  dfrac: 1.8,
  tfrac: 1.8,
  lVert: 0.3,
  rVert: 0.3,
  left: 0,
  right: 0,
  begin: 0,
  end: 0,
  operatorname: 0,
  text: 0,
  mathrm: 0,
};

export function estimateInlineMathTextWidth(input: string): number {
  return estimateKatexSourceWidth(stripMathDelimiters(input));
}

export function estimateDisplayMathTextWidth(input: string): number {
  const rows = displayMathTextLines(input);
  if (rows.length <= 1 && rows[0] === input) return estimateInlineMathTextWidth(input);
  return Math.max(...rows.map((row) => estimateInlineMathTextWidth(row)));
}

export function stripMathDelimiters(input: string): string {
  let out = "";
  let i = 0;
  let dollarDelimiter: "$" | "$$" | null = null;

  while (i < input.length) {
    if (input[i] === "\\" && isMathDelimiterCommand(input[i + 1])) {
      i += 2;
      continue;
    }

    if (input[i] === "$" && !isEscaped(input, i)) {
      const delimiter: "$" | "$$" = input[i + 1] === "$" ? "$$" : "$";
      if (dollarDelimiter === delimiter) {
        dollarDelimiter = null;
        i += delimiter.length;
        continue;
      }
      const end = findMatchingDollarDelimiter(input, i + delimiter.length, delimiter);
      const content = end >= 0 ? input.slice(i + delimiter.length, end) : "";
      if (!dollarDelimiter && end >= 0 && (delimiter === "$$" || looksLikeMathDelimitedContent(content))) {
        dollarDelimiter = delimiter;
        i += delimiter.length;
        continue;
      }
    }

    out += input[i];
    i += 1;
  }

  return out;
}

export function displayMathTextLines(input: string): string[] {
  const text = stripMathDelimiters(input).trim();
  const match = text.match(/\\begin\{([^}]+)\}/);
  if (!match) return [input];

  const envName = match[1];
  const endToken = `\\end{${envName}}`;
  const end = text.lastIndexOf(endToken);
  if (end < (match.index ?? 0) + match[0].length) return [input];

  const body = text.slice((match.index ?? 0) + match[0].length, end);
  const rows = body
    .split(/\\\\(?:\[[^\]]+\])?|\\\s+(?=\\?[A-Za-z])/)
    .map((row) => row.replace(/&/g, " ").trim())
    .filter(Boolean);
  return rows.length > 0 ? rows : [input];
}

function estimateKatexSourceWidth(source: string): number {
  let width = 0;
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === "\\" && /[A-Za-z]/.test(source[i + 1] ?? "")) {
      const commandStart = i + 1;
      let commandEnd = commandStart;
      while (/[A-Za-z]/.test(source[commandEnd] ?? "")) commandEnd += 1;
      const command = source.slice(commandStart, commandEnd);
      width += COMMAND_WIDTHS[command] ?? command.length * 0.5;
      i = commandEnd;
      continue;
    }
    if (char === "_" || char === "^") {
      const script = readScriptSource(source, i + 1);
      width += estimateKatexSourceWidth(script.value) * 0.58;
      i = script.next;
      continue;
    }
    if (char === "{" || char === "}" || char === "&") {
      i += 1;
      continue;
    }
    width += estimatePlainCharWidth(char);
    i += 1;
  }
  return Math.max(0.1, width);
}

function readScriptSource(source: string, start: number): { value: string; next: number } {
  if (source[start] === "{") {
    let depth = 1;
    let i = start + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      if (depth > 0) i += 1;
    }
    return { value: source.slice(start + 1, i), next: Math.min(source.length, i + 1) };
  }
  if (source[start] === "\\") {
    let i = start + 1;
    while (/[A-Za-z]/.test(source[i] ?? "")) i += 1;
    return { value: source.slice(start, i), next: i };
  }
  return { value: source[start] ?? "", next: Math.min(source.length, start + 1) };
}

function estimatePlainCharWidth(char: string): number {
  if (/\s/.test(char)) return 0.34;
  if (/[.,:;|!]/.test(char)) return 0.28;
  if ("()[]/\\".includes(char)) return 0.34;
  if (/[+\-=<>≤≥≠≈×·]/.test(char)) return 0.62;
  if (/[ilI1]/.test(char)) return 0.34;
  if (/[mwMW]/.test(char)) return 0.92;
  return 0.64;
}

function isMathDelimiterCommand(char: string | undefined): boolean {
  return char === "(" || char === ")" || char === "[" || char === "]";
}

function findMatchingDollarDelimiter(input: string, start: number, delimiter: "$" | "$$"): number {
  for (let i = start; i < input.length; i++) {
    if (input[i] !== "$" || isEscaped(input, i)) continue;
    if (delimiter === "$$") {
      if (input[i + 1] === "$") return i;
      continue;
    }
    if (input[i + 1] !== "$") return i;
  }
  return -1;
}

function looksLikeMathDelimitedContent(content: string): boolean {
  return /\\|[_^{}]|[A-Za-z]\s*[=<>+\-*/≈≤≥≠]|[=<>+\-*/≈≤≥≠]\s*[A-Za-z]/.test(content);
}

function isEscaped(input: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i--) slashCount += 1;
  return slashCount % 2 === 1;
}
