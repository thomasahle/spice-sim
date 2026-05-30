import katex from "katex";

const TEXT_COMMAND_ESCAPE_RE = /[\\{}$]/g;

export function renderKatexHtml(text: string, options: { displayMode?: boolean } = {}): string {
  const source = normalizeKatexSource(text);
  const displayMode = options.displayMode ?? /\\begin\{/.test(source);
  try {
    return katex.renderToString(source, {
      displayMode,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  } catch {
    return katex.renderToString(textAsKatexText(text), {
      displayMode: false,
      output: "html",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  }
}

export function normalizeKatexSource(text: string): string {
  const trimmed = normalizeEscapedTexCommands(text.trim());
  if (!looksLikeKatex(trimmed)) return textAsKatexText(trimmed || " ");
  const source = /\\begin\{/.test(trimmed)
    ? stripInlineMathDelimiters(stripOuterMathDelimiters(trimmed))
    : sourceWithInlineMathText(trimmed);
  return normalizeCasesStar(source)
    .replace(/\\begin\{([A-Za-z]+)\*\}/g, "\\begin{$1}")
    .replace(/\\end\{([A-Za-z]+)\*\}/g, "\\end{$1}");
}

function normalizeEscapedTexCommands(text: string): string {
  // Notes often arrive through JSON/Markdown/code-block hops with TeX commands
  // double-escaped as "\\begin" or "\\alpha". Keep real LaTeX row breaks ("\\")
  // intact by only collapsing doubled slashes immediately before command names.
  return text.replace(/\\\\(?=[A-Za-z])/g, "\\");
}

export function looksLikeKatex(text: string): boolean {
  const trimmed = text.trim();
  return (
    /\\|[_^{}]|[=<>≈≤≥≠]/.test(trimmed) ||
    /(?:^|\s)[+\-*/](?:\s|$)/.test(trimmed) ||
    /[A-Za-z0-9)]\s*[*/]\s*[A-Za-z0-9(]/.test(trimmed) ||
    inlineMathSegments(trimmed).some((segment) => segment.kind === "math")
  );
}

function stripOuterMathDelimiters(text: string): string {
  if (text.startsWith("$$") && text.endsWith("$$") && text.length >= 4) return text.slice(2, -2).trim();
  if (text.startsWith("$") && text.endsWith("$") && text.length >= 2) return text.slice(1, -1).trim();
  if (text.startsWith("\\(") && text.endsWith("\\)") && text.length >= 4) return text.slice(2, -2).trim();
  if (text.startsWith("\\[") && text.endsWith("\\]") && text.length >= 4) return text.slice(2, -2).trim();
  return text;
}

function sourceWithInlineMathText(text: string): string {
  const stripped = stripOuterMathDelimiters(text);
  if (stripped !== text) return stripped;
  const segments = inlineMathSegments(text);
  if (!segments.some((segment) => segment.kind === "math")) {
    return text.replace(/(?<!\\)\$/g, "");
  }
  return segments.map((segment) =>
    segment.kind === "math" ? segment.text : textAsKatexTextSegment(segment.text),
  ).join("");
}

function textAsKatexTextSegment(text: string): string {
  const leading = /^\s+/.test(text) ? "~" : "";
  const trailing = /\s+$/.test(text) ? "~" : "";
  const content = text.trim().replace(/\s+/g, " ");
  return `${leading}${content ? textAsKatexText(content) : ""}${trailing}`;
}

function inlineMathSegments(text: string): Array<{ kind: "text" | "math"; text: string }> {
  const segments: Array<{ kind: "text" | "math"; text: string }> = [];
  let cursor = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    if (text[idx] !== "$" || isEscaped(text, idx)) continue;
    const delimiter = text[idx + 1] === "$" ? "$$" : "$";
    const end = findDollarDelimiter(text, idx + delimiter.length, delimiter);
    if (end < 0) continue;
    const content = text.slice(idx + delimiter.length, end);
    if (delimiter !== "$$" && !looksLikeDelimitedMath(content)) continue;
    if (idx > cursor) segments.push({ kind: "text", text: text.slice(cursor, idx) });
    segments.push({ kind: "math", text: content });
    cursor = end + delimiter.length;
    idx = cursor - 1;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}

function looksLikeDelimitedMath(content: string): boolean {
  const trimmed = content.trim();
  return (
    /^[A-Za-z](?:[A-Za-z0-9]|\\[A-Za-z]+|[_^{}])*$/.test(trimmed) ||
    /\\|[_^{}]|[A-Za-z]\s*[=<>+\-*/≈≤≥≠]|[=<>+\-*/≈≤≥≠]\s*[A-Za-z]/.test(trimmed)
  );
}

function stripInlineMathDelimiters(text: string): string {
  return text.replace(/(?<!\\)\${1,2}/g, "");
}

function findDollarDelimiter(text: string, start: number, delimiter: "$" | "$$"): number {
  for (let idx = start; idx < text.length; idx += 1) {
    if (text[idx] !== "$" || isEscaped(text, idx)) continue;
    if (delimiter === "$$") {
      if (text[idx + 1] === "$") return idx;
      continue;
    }
    if (text[idx + 1] !== "$") return idx;
  }
  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let idx = index - 1; idx >= 0 && text[idx] === "\\"; idx -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function normalizeCasesStar(source: string): string {
  return source.replace(
    /\\begin\{cases\*\}([\s\S]*?)\\end\{cases\*\}/g,
    (_match, body: string) => `\\begin{cases}${normalizeCasesStarBody(body)}\\end{cases}`,
  );
}

function normalizeCasesStarBody(body: string): string {
  return body
    .split(/(\\\\)/)
    .map((part) => {
      if (part === "\\\\") return "\\\\[0.28em]";
      const amp = part.indexOf("&");
      if (amp < 0) return part;
      return `${part.slice(0, amp + 1)}${normalizeCasesTextCell(part.slice(amp + 1))}`;
    })
    .join("");
}

function normalizeCasesTextCell(cell: string): string {
  const leading = cell.match(/^\s*/)?.[0] ?? "";
  const trailing = cell.match(/\s*$/)?.[0] ?? "";
  const content = cell.trim();
  const ifMatch = content.match(/^if\s+(.+)$/i);
  if (ifMatch) return `${leading}\\text{if } ${ifMatch[1]}${trailing}`;
  if (/^[A-Za-z][A-Za-z\s.,;:()/-]*$/.test(content)) {
    return `${leading}${textAsKatexText(content)}${trailing}`;
  }
  return cell;
}

function textAsKatexText(text: string): string {
  return `\\text{${text.replace(TEXT_COMMAND_ESCAPE_RE, "\\$&")}}`;
}
