import type { ComponentKind, CircuitComponent, CircuitDoc } from "./model";

export type ModelDeviceType = "D" | "NPN" | "PNP" | "NMOS" | "PMOS";

export interface ModelDefinition {
  name: string;
  type: ModelDeviceType;
  params: string;
}

export interface MosfetPreset {
  id: string;
  kind: "NMOS" | "PMOS";
  name: string;
  description: string;
  model: string;
  W: string;
  L: string;
  custom?: boolean;
}

const MODEL_LINE_RE = /^\.model\s+(\S+)\s+(D|NPN|PNP|NMOS|PMOS)\b\s*(.*)$/i;

export function parseModelLine(line: string): ModelDefinition | null {
  const match = line.trim().match(MODEL_LINE_RE);
  if (!match) return null;
  const rawParams = (match[3] ?? "").trim();
  return {
    name: match[1],
    type: match[2].toUpperCase() as ModelDeviceType,
    params: stripOuterParens(rawParams),
  };
}

export function parseModelDefinitions(directives: string): ModelDefinition[] {
  const models: ModelDefinition[] = [];
  for (const line of (directives ?? "").split(/\r?\n/)) {
    const model = parseModelLine(line);
    if (model) models.push(model);
  }
  return models;
}

export function modelTypesForKind(kind: ComponentKind): ModelDeviceType[] {
  switch (kind) {
    case "D":
      return ["D"];
    case "NPN":
      return ["NPN"];
    case "PNP":
      return ["PNP"];
    case "NMOS":
    case "NMOS4":
      return ["NMOS"];
    case "PMOS":
    case "PMOS4":
      return ["PMOS"];
    default:
      return [];
  }
}

export function modelAppliesToKind(type: ModelDeviceType, kind: ComponentKind): boolean {
  return modelTypesForKind(kind).includes(type);
}

export const BUILTIN_MODEL_DEFINITIONS: ModelDefinition[] = [
  {
    name: "DMOD",
    type: "D",
    params: "",
  },
  {
    name: "BJTN",
    type: "NPN",
    params: "",
  },
  {
    name: "BJTP",
    type: "PNP",
    params: "",
  },
  {
    name: "NCH",
    type: "NMOS",
    params: "LEVEL=1 VTO=0.5 KP=2e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02",
  },
  {
    name: "PCH",
    type: "PMOS",
    params: "LEVEL=1 VTO=-0.5 KP=1e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02",
  },
  {
    name: "NMOS_LEVEL1_FAST",
    type: "NMOS",
    params: "LEVEL=1 VTO=0.70 KP=180e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7",
  },
  {
    name: "PMOS_LEVEL1_FAST",
    type: "PMOS",
    params: "LEVEL=1 VTO=-0.70 KP=70e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7",
  },
];

export const BUILTIN_MOSFET_MODELS: ModelDefinition[] = BUILTIN_MODEL_DEFINITIONS.filter(
  (model) => model.type === "NMOS" || model.type === "PMOS",
);

export const BUILTIN_MOSFET_PRESETS: MosfetPreset[] = [
  {
    id: "nmos-default",
    kind: "NMOS",
    name: "NMOS",
    description: "General small-signal NMOS. Uses the built-in NCH model.",
    model: "NCH",
    W: "10u",
    L: "1u",
  },
  {
    id: "nmos-level1-fast",
    kind: "NMOS",
    name: "NMOS Level 1 fast",
    description: "Toy high-gm LEVEL=1 MOS model for exploratory analog blocks.",
    model: "NMOS_LEVEL1_FAST",
    W: "2u",
    L: "2u",
  },
  {
    id: "pmos-default",
    kind: "PMOS",
    name: "PMOS",
    description: "General small-signal PMOS. Uses the built-in PCH model.",
    model: "PCH",
    W: "10u",
    L: "1u",
  },
  {
    id: "pmos-level1-fast",
    kind: "PMOS",
    name: "PMOS Level 1 fast",
    description: "Toy complementary LEVEL=1 MOS model for exploratory analog blocks.",
    model: "PMOS_LEVEL1_FAST",
    W: "2u",
    L: "2u",
  },
];

export function modelDefinitionLine(model: ModelDefinition): string {
  const params = stripOuterParens(model.params).trim();
  return `.model ${model.name} ${model.type}${params ? ` (${params})` : ""}`;
}

export function defaultModelParams(type: ModelDeviceType): string {
  switch (type) {
    case "PMOS":
      return "LEVEL=1 VTO=-0.70 KP=70e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7";
    case "NMOS":
      return "LEVEL=1 VTO=0.70 KP=180e-6 LAMBDA=0.03 GAMMA=0.4 PHI=0.7";
    case "D":
      return "IS=1e-14 N=1";
    case "NPN":
      return "IS=1e-15 BF=100";
    case "PNP":
      return "IS=1e-15 BF=80";
  }
}

export function defaultModelName(type: ModelDeviceType): string {
  switch (type) {
    case "D":
      return "DMOD";
    case "NPN":
      return "BJTN";
    case "PNP":
      return "BJTP";
    case "NMOS":
      return "NCH";
    case "PMOS":
      return "PCH";
  }
}

export function uniqueModelName(models: ModelDefinition[], base: string): string {
  const cleanBase = sanitizeModelName(base) || "MODEL";
  const used = new Set(models.map((model) => model.name.toLowerCase()));
  if (!used.has(cleanBase.toLowerCase())) return cleanBase;
  for (let idx = 2; idx < 1000; idx++) {
    const candidate = `${cleanBase}_${idx}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${cleanBase}_${Date.now().toString(36)}`;
}

export function upsertModelDefinition(
  directives: string,
  model: ModelDefinition,
): string {
  const normalized = normalizeModelDefinition(model);
  if (!normalized) return directives;
  const lines = splitDirectiveLines(directives);
  let replaced = false;
  const nextLines = lines.map((line) => {
    const current = parseModelLine(line);
    if (!current || !sameModelKey(current, normalized)) return line;
    replaced = true;
    return modelDefinitionLine(normalized);
  });
  if (!replaced) nextLines.push(modelDefinitionLine(normalized));
  return joinDirectiveLines(nextLines);
}

export function updateModelDefinition(
  directives: string,
  previous: ModelDefinition,
  next: ModelDefinition,
): string {
  const normalizedNext = normalizeModelDefinition(next);
  if (!normalizedNext) return directives;
  const lines = splitDirectiveLines(directives);
  let replaced = false;
  const nextLines = lines.flatMap((line) => {
    const current = parseModelLine(line);
    if (!current || !sameModelKey(current, previous)) return [line];
    if (replaced) return [];
    replaced = true;
    return [modelDefinitionLine(normalizedNext)];
  });
  if (!replaced) nextLines.push(modelDefinitionLine(normalizedNext));
  return joinDirectiveLines(nextLines);
}

export function removeModelDefinition(
  directives: string,
  model: ModelDefinition,
): string {
  return joinDirectiveLines(
    splitDirectiveLines(directives).filter((line) => {
      const current = parseModelLine(line);
      return !current || !sameModelKey(current, model);
    }),
  );
}

export function removeModelDefinitionInDoc(
  doc: CircuitDoc,
  model: ModelDefinition,
  replacementName = defaultModelName(model.type),
): CircuitDoc {
  return {
    ...doc,
    directives: removeModelDefinition(doc.directives, model),
    pages: doc.pages.map((schematic) => ({
      ...schematic,
      components: schematic.components.map((component) => {
        if (!modelAppliesToKind(model.type, component.kind)) return component;
        if (component.value.trim().toLowerCase() !== model.name.toLowerCase()) {
          return component;
        }
        return {
          ...component,
          value: replacementName,
          params: {
            ...(component.params ?? {}),
            preset: "",
          },
        };
      }),
    })),
  };
}

export function updateModelDefinitionInDoc(
  doc: CircuitDoc,
  previous: ModelDefinition,
  next: ModelDefinition,
): CircuitDoc {
  const normalized = normalizeModelDefinition(next);
  if (!normalized) return doc;
  return {
    ...doc,
    directives: updateModelDefinition(doc.directives, previous, normalized),
    pages: doc.pages.map((schematic) => ({
      ...schematic,
      components: schematic.components.map((component) => {
        if (!modelAppliesToKind(previous.type, component.kind)) return component;
        if (!modelAppliesToKind(normalized.type, component.kind)) return component;
        if (component.value.trim().toLowerCase() !== previous.name.toLowerCase()) {
          return component;
        }
        return { ...component, value: normalized.name };
      }),
    })),
  };
}

export function mosfetPresetFromComponent(
  component: CircuitComponent,
  name: string,
): MosfetPreset | null {
  const kind = mosfetPresetKindForComponentKind(component.kind);
  if (!kind) return null;
  const safeName = name.trim();
  if (!safeName) return null;
  return {
    id: `custom-${kind.toLowerCase()}-${Date.now().toString(36)}`,
    kind,
    name: safeName,
    description: `${kind} preset using ${component.value || (kind === "NMOS" ? "NCH" : "PCH")}`,
    model: component.value || (kind === "NMOS" ? "NCH" : "PCH"),
    W: component.params?.W ?? "10u",
    L: component.params?.L ?? "1u",
    custom: true,
  };
}

export function componentMatchesMosfetPreset(
  component: CircuitComponent,
  preset: MosfetPreset,
): boolean {
  const kind = mosfetPresetKindForComponentKind(component.kind);
  if (!kind || kind !== preset.kind) return false;
  return (
    mosfetModelName(component) === preset.model &&
    (component.params?.W ?? "10u") === preset.W &&
    (component.params?.L ?? "1u") === preset.L
  );
}

export function applyMosfetPreset(
  component: CircuitComponent,
  preset: MosfetPreset,
): CircuitComponent {
  return {
    ...component,
    value: preset.model,
    params: {
      ...(component.params ?? {}),
      W: preset.W,
      L: preset.L,
      preset: preset.id,
    },
  };
}

export function mosfetPresetKindForComponentKind(
  kind: ComponentKind,
): "NMOS" | "PMOS" | null {
  if (kind === "NMOS" || kind === "NMOS4") return "NMOS";
  if (kind === "PMOS" || kind === "PMOS4") return "PMOS";
  return null;
}

function mosfetModelName(component: CircuitComponent): string {
  const kind = mosfetPresetKindForComponentKind(component.kind);
  if (component.value.trim()) return component.value.trim();
  return kind === "PMOS" ? "PCH" : "NCH";
}

function stripOuterParens(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeModelDefinition(model: ModelDefinition): ModelDefinition | null {
  const name = sanitizeModelName(model.name);
  if (!name) return null;
  return {
    name,
    type: model.type.toUpperCase() as ModelDeviceType,
    params: stripOuterParens(model.params).trim(),
  };
}

function sanitizeModelName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_.$-]/g, "_");
}

function sameModelKey(a: ModelDefinition, b: ModelDefinition): boolean {
  return a.type === b.type && a.name.toLowerCase() === b.name.toLowerCase();
}

function splitDirectiveLines(directives: string): string[] {
  const trimmed = directives.replace(/\s+$/g, "");
  return trimmed ? trimmed.split(/\r?\n/) : [];
}

function joinDirectiveLines(lines: string[]): string {
  return lines.join("\n");
}
