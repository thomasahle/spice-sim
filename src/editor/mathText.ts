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
  eta: "η",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  omega: "ω",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  pm: "±",
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
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  int: "∫",
  propto: "∝",
  in: "∈",
  notin: "∉",
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
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  mapsto: "↦",
};

const BLACKBOARD_GLYPHS: Record<string, string> = {
  C: "ℂ",
  N: "ℕ",
  Q: "ℚ",
  R: "ℝ",
  Z: "ℤ",
};

export function parseInlineMathText(input: string): MathTextAtom[] {
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
      atoms.push({ text: value });
      i = next;
      continue;
    }

    atoms.push({ text: char });
    i += 1;
  }

  return mergePlainAtoms(atoms);
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
  if (i === start) return { value: input[start] ?? "\\", next: Math.min(input.length, start + 1) };
  const command = input.slice(start, i);
  if (command === "left" || command === "right") return readDelimiter(input, i);
  if (command === "frac") {
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
    const radicand = readRequiredGroup(input, i);
    if (radicand.value !== null) {
      return { value: `√${renderCommandText(radicand.value)}`, next: radicand.next };
    }
  }
  if (command === "dot" || command === "ddot" || command === "hat" || command === "bar" || command === "overline" || command === "tilde") {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) return { value: renderAccentText(renderCommandText(group.value), command), next: group.next };
  }
  if (
    command === "mathrm" ||
    command === "text" ||
    command === "operatorname" ||
    command === "mathbf" ||
    command === "mathit" ||
    command === "mathsf"
  ) {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) return { value: renderCommandText(group.value), next: group.next };
  }
  if (command === "mathbb") {
    const group = readRequiredGroup(input, i);
    if (group.value !== null) return { value: renderBlackboardText(renderCommandText(group.value)), next: group.next };
  }
  return { value: COMMAND_GLYPHS[command] ?? command, next: i };
}

function readDelimiter(input: string, start: number): { value: string; next: number } {
  const i = skipSpaces(input, start);
  if (i >= input.length) return { value: "", next: i };
  if (input[i] === ".") return { value: "", next: i + 1 };
  if (input[i] === "\\") return readCommand(input, i + 1);
  return { value: input[i], next: i + 1 };
}

function readRequiredGroup(input: string, start: number): { value: string | null; next: number } {
  const i = skipSpaces(input, start);
  if (input[i] !== "{") return { value: null, next: start };
  const group = readGroup(input, i);
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

function skipSpaces(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  return i;
}

function renderCommandText(input: string): string {
  return parseInlineMathText(input).map((atom) => {
    const sub = atom.sub ? `_${atom.sub}` : "";
    const sup = atom.sup ? `^${atom.sup}` : "";
    return `${atom.text}${sub}${sup}`;
  }).join("");
}

function renderBlackboardText(input: string): string {
  return Array.from(input).map((char) => BLACKBOARD_GLYPHS[char] ?? char).join("");
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
          : "\u0305";
  return Array.from(input).map((char) => (char.trim() ? `${char}${mark}` : char)).join("");
}
