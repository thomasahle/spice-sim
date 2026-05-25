export interface MathTextAtom {
  text: string;
  sub?: string;
  sup?: string;
}

const COMMAND_GLYPHS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  Gamma: "Γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  varepsilon: "ε",
  eta: "η",
  theta: "θ",
  Theta: "Θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  Lambda: "Λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  Xi: "Ξ",
  omicron: "ο",
  pi: "π",
  Pi: "Π",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  Sigma: "Σ",
  tau: "τ",
  upsilon: "υ",
  Upsilon: "Υ",
  phi: "φ",
  varphi: "ϕ",
  Phi: "Φ",
  chi: "χ",
  psi: "ψ",
  Psi: "Ψ",
  omega: "ω",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  equiv: "≡",
  approx: "≈",
  sim: "∼",
  simeq: "≃",
  cong: "≅",
  ll: "≪",
  gg: "≫",
  parallel: "∥",
  perp: "⊥",
  infty: "∞",
  emptyset: "∅",
  varnothing: "∅",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  int: "∫",
  propto: "∝",
  cdash: "⋯",
  in: "∈",
  ni: "∋",
  notin: "∉",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  cap: "∩",
  cup: "∪",
  setminus: "\\",
  therefore: "∴",
  because: "∵",
  forall: "∀",
  exists: "∃",
  land: "∧",
  wedge: "∧",
  lor: "∨",
  vee: "∨",
  neg: "¬",
  cdots: "⋯",
  ldots: "…",
  dots: "…",
  circ: "°",
  degree: "°",
  langle: "⟨",
  rangle: "⟩",
  lfloor: "⌊",
  rfloor: "⌋",
  lceil: "⌈",
  rceil: "⌉",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  gets: "←",
  mapsto: "↦",
  up: "↑",
  down: "↓",
  uparrow: "↑",
  downarrow: "↓",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  lbrace: "{",
  rbrace: "}",
  prime: "′",
  backprime: "‵",
  ast: "*",
  star: "★",
  vert: "|",
  mid: "|",
  min: "min",
  max: "max",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  exp: "exp",
  log: "log",
  ln: "ln",
  lim: "lim",
  ohm: "Ω",
  deg: "°",
};

const SYMBOL_COMMAND_GLYPHS: Record<string, string> = {
  ",": " ",
  ":": " ",
  ";": " ",
  "!": "",
  " ": " ",
  "&": "&",
  "%": "%",
  "#": "#",
  "_": "_",
  "{": "{",
  "}": "}",
  "\\": " ",
};

const BLACKBOARD_GLYPHS: Record<string, string> = {
  C: "ℂ",
  N: "ℕ",
  Q: "ℚ",
  R: "ℝ",
  Z: "ℤ",
};

const SCRIPT_GLYPHS: Record<string, string> = {
  A: "𝓐",
  B: "𝓑",
  C: "𝓒",
  D: "𝓓",
  E: "𝓔",
  F: "𝓕",
  G: "𝓖",
  H: "𝓗",
  I: "𝓘",
  J: "𝓙",
  K: "𝓚",
  L: "𝓛",
  M: "𝓜",
  N: "𝓝",
  O: "𝓞",
  P: "𝓟",
  Q: "𝓠",
  R: "𝓡",
  S: "𝓢",
  T: "𝓣",
  U: "𝓤",
  V: "𝓥",
  W: "𝓦",
  X: "𝓧",
  Y: "𝓨",
  Z: "𝓩",
};

export function parseInlineMathText(input: string): MathTextAtom[] {
  input = stripMathDelimiters(input);
  const atoms: MathTextAtom[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if ((char === "_" || char === "^") && atoms.length > 0) {
      const { value, next } = readScript(input, i + 1);
      if (value) {
        const atom = atoms[atoms.length - 1];
        if (char === "_") atom.sub = value;
        else atom.sup = value;
      }
      i = next;
      continue;
    }

    if (char === "\\") {
      const { value, next } = readCommand(input, i + 1);
      atoms.push(...parseInlineMathText(value));
      i = next;
      continue;
    }

    const next = readPlainTextRun(input, i);
    atoms.push({ text: input.slice(i, next) });
    i = next;
  }

  return mergePlainAtoms(atoms);
}

export function estimateInlineMathTextWidth(input: string): number {
  return estimateMathAtomsWidth(parseInlineMathText(input));
}

export function estimateMathAtomsWidth(atoms: MathTextAtom[]): number {
  let width = 0;
  for (const atom of atoms) {
    width += estimatePlainTextWidth(atom.text);
    if (atom.sub) width += estimatePlainTextWidth(atom.sub) * 0.62;
    if (atom.sup) width += estimatePlainTextWidth(atom.sup) * 0.62;
  }
  return width;
}

export function compactInlineMathText(input: string, maxWidth: number): MathTextAtom[] {
  return compactMathAtoms(parseInlineMathText(input), maxWidth);
}

export function compactMathAtoms(atoms: MathTextAtom[], maxWidth: number): MathTextAtom[] {
  const safeMaxWidth = Math.max(0, maxWidth);
  if (estimateMathAtomsWidth(atoms) <= safeMaxWidth) return atoms.map((atom) => ({ ...atom }));

  const ellipsis: MathTextAtom = { text: "..." };
  const ellipsisWidth = estimateMathAtomsWidth([ellipsis]);
  const targetWidth = Math.max(0, safeMaxWidth - ellipsisWidth);
  const out: MathTextAtom[] = [];
  let usedWidth = 0;

  for (const atom of atoms) {
    const remainingWidth = targetWidth - usedWidth;
    if (remainingWidth <= 0) break;

    const atomWidth = estimateMathAtomsWidth([atom]);
    if (atomWidth <= remainingWidth) {
      out.push({ ...atom });
      usedWidth += atomWidth;
      continue;
    }

    const baseAtom: MathTextAtom = { text: atom.text };
    const baseWidth = estimateMathAtomsWidth([baseAtom]);
    if (baseWidth <= remainingWidth) {
      out.push(baseAtom);
      break;
    }

    const text = truncatePlainTextToWidth(atom.text, remainingWidth);
    if (text) out.push({ text });
    break;
  }

  trimTrailingMathWhitespace(out);
  out.push(ellipsis);
  return out;
}

function estimatePlainTextWidth(text: string): number {
  let width = 0;
  for (const char of Array.from(text)) {
    if (/\s/.test(char)) width += 0.34;
    else if (/[.,:;|!]/.test(char)) width += 0.28;
    else if ("(){}[]/\\".includes(char)) width += 0.34;
    else if (/[+\-=<>≤≥≠≈∑∫√×·]/.test(char)) width += 0.62;
    else if (/[ilI1]/.test(char)) width += 0.34;
    else if (/[mwMW]/.test(char)) width += 0.92;
    else width += 0.64;
  }
  return width;
}

function truncatePlainTextToWidth(text: string, maxWidth: number): string {
  let out = "";
  for (const char of Array.from(text)) {
    const candidate = `${out}${char}`;
    if (estimatePlainTextWidth(candidate) > maxWidth) break;
    out = candidate;
  }
  return out;
}

function trimTrailingMathWhitespace(atoms: MathTextAtom[]): void {
  while (atoms.length > 0) {
    const atom = atoms[atoms.length - 1];
    if (atom.sub || atom.sup) return;
    const trimmed = atom.text.replace(/\s+$/, "");
    if (trimmed) {
      atom.text = trimmed;
      return;
    }
    atoms.pop();
  }
}

function readPlainTextRun(input: string, start: number): number {
  let i = start + 1;
  while (i < input.length && input[i] !== "\\" && input[i] !== "_" && input[i] !== "^") i += 1;
  if ((input[i] === "_" || input[i] === "^") && i > start + 1) {
    let wordStart = i;
    while (wordStart > start && /[A-Za-z]/.test(input[wordStart - 1])) wordStart -= 1;
    if (wordStart > start) return wordStart;
  }
  return i;
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
      if (
        !dollarDelimiter &&
        end >= 0 &&
        (delimiter === "$$" || looksLikeMathDelimitedContent(content))
      ) {
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

function mergePlainAtoms(atoms: MathTextAtom[]): MathTextAtom[] {
  const out: MathTextAtom[] = [];
  for (const atom of atoms) {
    const prev = out[out.length - 1];
    if (prev && !prev.sub && !prev.sup && !atom.sub && !atom.sup) {
      prev.text += atom.text;
    } else {
      out.push({ ...atom });
    }
  }
  return out;
}

function readScript(input: string, start: number): { value: string; next: number } {
  if (start >= input.length) return { value: "", next: start };
  if (input[start] === "{") {
    const group = readGroup(input, start);
    return { value: renderCommandText(group.value), next: group.next };
  }
  if (input[start] === "\\") return readCommand(input, start + 1);
  return { value: input[start], next: start + 1 };
}

function readCommand(input: string, start: number): { value: string; next: number } {
  let i = start;
  while (i < input.length && /[A-Za-z]/.test(input[i])) i += 1;
  if (i === start) {
    const symbol = input[start] ?? "\\";
    return { value: SYMBOL_COMMAND_GLYPHS[symbol] ?? symbol, next: Math.min(input.length, start + 1) };
  }
  const command = input.slice(start, i);
  if (command === "begin") {
    const env = readRequiredGroup(input, i);
    if (env.value !== null) {
      const rendered = readEnvironment(input, env.next, env.value);
      if (rendered) return rendered;
    }
  }
  if (isSizingCommand(command)) return readDelimiter(input, i);
  if (command === "left" || command === "right") return readDelimiter(input, i);
  if (command === "boxed") {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) return { value: `□(${renderCommandText(group.value)})`, next: group.next };
  }
  if (command === "substack") {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) {
      return {
        value: renderEnvironmentText("substack", group.value),
        next: group.next,
      };
    }
  }
  if (command === "binom" || command === "choose") {
    const top = readRequiredGroup(input, i);
    const bottom = readRequiredGroup(input, top.next);
    if (top.value !== null && bottom.value !== null) {
      return {
        value: `(${renderCommandText(top.value)} choose ${renderCommandText(bottom.value)})`,
        next: bottom.next,
      };
    }
  }
  if (command === "overset" || command === "stackrel") {
    const top = readRequiredGroup(input, i);
    const body = readRequiredGroup(input, top.next);
    if (top.value !== null && body.value !== null) {
      return {
        value: `${renderCommandText(body.value)}^${renderScriptText(renderCommandText(top.value))}`,
        next: body.next,
      };
    }
  }
  if (command === "underset") {
    const bottom = readRequiredGroup(input, i);
    const body = readRequiredGroup(input, bottom.next);
    if (bottom.value !== null && body.value !== null) {
      return {
        value: `${renderCommandText(body.value)}_${renderScriptText(renderCommandText(bottom.value))}`,
        next: body.next,
      };
    }
  }
  if (command === "frac" || command === "dfrac" || command === "tfrac") {
    const numerator = readRequiredGroup(input, i);
    const denominator = readRequiredGroup(input, numerator.next);
    if (numerator.value !== null && denominator.value !== null) {
      return {
        value: `${renderCommandText(numerator.value)}/${renderCommandText(denominator.value)}`,
        next: denominator.next,
      };
    }
  }
  if (command === "sqrt") {
    const index = readOptionalBracketGroup(input, i);
    const radicand = readRequiredGroup(input, index.next);
    if (radicand.value !== null) {
      const root = index.value ? `${renderCommandText(index.value)}√` : "√";
      return { value: `${root}${renderCommandText(radicand.value)}`, next: radicand.next };
    }
  }
  if (command === "quad") return { value: "  ", next: i };
  if (command === "qquad") return { value: "    ", next: i };
  if (command === "limits" || command === "nolimits" || command === "displaystyle" || command === "textstyle") return { value: "", next: i };
  if (
    command === "dot" ||
    command === "ddot" ||
    command === "hat" ||
    command === "bar" ||
    command === "overline" ||
    command === "tilde" ||
    command === "vec" ||
    command === "overrightarrow" ||
    command === "underline"
  ) {
    const body = readAccentOperand(input, i);
    if (body.value !== null) return { value: renderAccentText(renderCommandText(body.value), command), next: body.next };
  }
  if (command === "overbrace" || command === "underbrace") {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) {
      const brace = command === "overbrace" ? "⏞" : "⏟";
      return { value: `${brace}(${renderCommandText(group.value)})`, next: group.next };
    }
  }
  if (command === "color" || command === "textcolor") {
    const color = readRequiredGroup(input, i);
    const body = readRequiredGroup(input, color.next);
    if (body.value !== null) return { value: renderCommandText(body.value), next: body.next };
  }
  if (
    command === "mathrm" ||
    command === "text" ||
    command === "operatorname" ||
    command === "textbf" ||
    command === "emph" ||
    command === "mathbf" ||
    command === "mathit" ||
    command === "mathsf"
  ) {
    const argStart = skipOptionalCommandStar(input, i);
    const body = readTextLikeOperand(input, argStart);
    if (body.value !== null) return { value: renderCommandText(body.value), next: body.next };
  }
  if (command === "mathbb") {
    const body = readTextLikeOperand(input, i);
    if (body.value !== null) return { value: renderBlackboardText(renderCommandText(body.value)), next: body.next };
  }
  if (command === "mathcal" || command === "mathscr") {
    const body = readTextLikeOperand(input, i);
    if (body.value !== null) return { value: renderScriptTextGlyphs(renderCommandText(body.value)), next: body.next };
  }
  return { value: COMMAND_GLYPHS[command] ?? command, next: i };
}

function readEnvironment(
  input: string,
  start: number,
  envName: string,
): { value: string; next: number } | null {
  const endToken = `\\end{${envName}}`;
  const end = input.indexOf(endToken, start);
  if (end < 0) return null;
  const bodyStart = environmentBodyStart(input, start, envName);
  const body = input.slice(bodyStart, end);
  return {
    value: renderEnvironmentText(envName, body),
    next: end + endToken.length,
  };
}

function environmentBodyStart(input: string, start: number, envName: string): number {
  let next = start;
  if (envName === "array") {
    const preamble = readRequiredGroup(input, start);
    if (preamble.value !== null) next = preamble.next;
  }
  return next;
}

function isSizingCommand(command: string): boolean {
  return (
    command === "big" ||
    command === "Big" ||
    command === "bigg" ||
    command === "Bigg" ||
    command === "bigl" ||
    command === "Bigl" ||
    command === "biggl" ||
    command === "Biggl" ||
    command === "bigr" ||
    command === "Bigr" ||
    command === "biggr" ||
    command === "Biggr" ||
    command === "bigm" ||
    command === "Bigm" ||
    command === "biggm" ||
    command === "Biggm"
  );
}

function readDelimiter(input: string, start: number): { value: string; next: number } {
  const i = skipSpaces(input, start);
  if (i >= input.length) return { value: "", next: i };
  if (input[i] === ".") return { value: "", next: i + 1 };
  if (input[i] === "\\") return readCommand(input, i + 1);
  return { value: input[i], next: i + 1 };
}

function skipOptionalCommandStar(input: string, start: number): number {
  const i = skipSpaces(input, start);
  return input[i] === "*" ? i + 1 : start;
}

function readAccentOperand(input: string, start: number): { value: string | null; next: number } {
  const group = readRequiredGroup(input, start);
  if (group.value !== null) return group;
  const i = skipSpaces(input, start);
  if (i >= input.length) return { value: null, next: start };
  if (input[i] === "\\") {
    const command = readCommand(input, i + 1);
    return { value: command.value, next: command.next };
  }
  return { value: input[i], next: i + 1 };
}

function readTextLikeOperand(input: string, start: number): { value: string | null; next: number } {
  const group = readRequiredGroup(input, start);
  if (group.value !== null) return group;
  const i = skipSpaces(input, start);
  if (i >= input.length) return { value: null, next: start };
  if (input[i] === "\\") {
    const command = readCommand(input, i + 1);
    return { value: command.value, next: command.next };
  }
  return { value: input[i], next: i + 1 };
}

function readRequiredGroup(input: string, start: number): { value: string | null; next: number } {
  const i = skipSpaces(input, start);
  if (input[i] !== "{") return { value: null, next: start };
  const group = readGroup(input, i);
  return { value: group.value, next: group.next };
}

function readOptionalBracketGroup(input: string, start: number): { value: string | null; next: number } {
  const i = skipSpaces(input, start);
  if (input[i] !== "[") return { value: null, next: start };
  const group = readBracketGroup(input, i);
  return { value: group.value, next: group.next };
}

function readGroup(input: string, start: number): { value: string; next: number } {
  let depth = 1;
  let i = start + 1;
  while (i < input.length && depth > 0) {
    if (input[i] === "{") depth += 1;
    else if (input[i] === "}") depth -= 1;
    if (depth > 0) i += 1;
  }
  return { value: input.slice(start + 1, i), next: Math.min(input.length, i + 1) };
}

function readBracketGroup(input: string, start: number): { value: string; next: number } {
  let depth = 1;
  let i = start + 1;
  while (i < input.length && depth > 0) {
    if (input[i] === "[") depth += 1;
    else if (input[i] === "]") depth -= 1;
    if (depth > 0) i += 1;
  }
  return { value: input.slice(start + 1, i), next: Math.min(input.length, i + 1) };
}

function skipSpaces(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  return i;
}

function renderCommandText(input: string): string {
  return parseInlineMathText(input).map((atom) => {
    const sub = atom.sub ? `_${renderScriptText(atom.sub)}` : "";
    const sup = atom.sup ? `^${renderScriptText(atom.sup)}` : "";
    return `${atom.text}${sub}${sup}`;
  }).join("");
}

function renderScriptText(text: string): string {
  return text.length === 1 ? text : `{${text}}`;
}

function renderEnvironmentText(envName: string, body: string): string {
  const rows = body
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) =>
      joinEnvironmentCells(row
        .split("&")
        .map((cell) => cleanEnvironmentCell(renderCommandText(cell.trim())))
        .filter(Boolean)),
    )
    .filter(Boolean);

  if (envName === "cases") return rows.length > 0 ? `{ ${rows.join("; ")} }` : "{ }";
  if (envName === "matrix" || envName === "pmatrix" || envName === "bmatrix" || envName === "array") {
    const left = envName === "pmatrix" ? "(" : envName === "bmatrix" ? "[" : "";
    const right = envName === "pmatrix" ? ")" : envName === "bmatrix" ? "]" : "";
    return `${left}${rows.join("; ")}${right}`;
  }
  if (
    envName === "aligned" ||
    envName === "align" ||
    envName === "split" ||
    envName === "gather" ||
    envName === "gathered" ||
    envName === "equation" ||
    envName === "equation*" ||
    envName === "displaymath"
  ) return rows.join("; ");
  if (envName === "substack") return rows.join(", ");
  return rows.join("; ");
}

function cleanEnvironmentCell(cell: string): string {
  return cell.trim().replace(/[,;]\s*$/, "");
}

function joinEnvironmentCells(cells: string[]): string {
  return cells.reduce((text, cell, index) => {
    if (index === 0) return cell;
    if (/^(=|≈|≤|≥|<|>|≠|≡|\+|-|±|∝|→|←|↔|⇒|⇐|⇔)/.test(cell)) return `${text} ${cell}`;
    return `${text}, ${cell}`;
  }, "");
}

function renderBlackboardText(input: string): string {
  return Array.from(input).map((char) => BLACKBOARD_GLYPHS[char] ?? char).join("");
}

function renderScriptTextGlyphs(input: string): string {
  return Array.from(input).map((char) => SCRIPT_GLYPHS[char] ?? char).join("");
}

function renderAccentText(input: string, command: string): string {
  const mark = command === "dot"
    ? "\u0307"
    : command === "ddot"
      ? "\u0308"
      : command === "hat"
        ? "\u0302"
        : command === "tilde"
          ? "\u0303"
          : command === "vec" || command === "overrightarrow"
            ? "\u20D7"
            : command === "underline"
              ? "\u0332"
              : "\u0305";
  return Array.from(input).map((char) => (char.trim() ? `${char}${mark}` : char)).join("");
}
