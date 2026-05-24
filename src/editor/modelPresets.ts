import type { ComponentKind, CircuitComponent } from "./model";

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

export const BUILTIN_MOSFET_MODELS: ModelDefinition[] = [
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

function stripOuterParens(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
