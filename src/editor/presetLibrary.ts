// MOSFET preset + model-directive helpers. Pulled out of Editor.tsx so the
// localStorage-backed preset library lives in its own file and the editor
// doesn't carry the storage-key constants directly.

import type { CircuitDoc, ComponentKind } from "./model.ts";
import {
  BUILTIN_MOSFET_MODELS,
  BUILTIN_MOSFET_PRESETS,
  modelDefinitionLine,
  modelTypesForKind,
  parseModelDefinitions,
  type ModelDefinition,
  type MosfetPreset,
} from "./modelPresets.ts";

const CUSTOM_MOSFET_PRESETS_KEY = "spicesim.mosfetPresets";
const DEFAULT_MOSFET_PRESET_PREFIX = "spicesim.defaultMosfetPreset.";

export function loadCustomMosfetPresets(): MosfetPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_MOSFET_PRESETS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMosfetPreset);
  } catch {
    return [];
  }
}

export function saveCustomMosfetPresets(presets: MosfetPreset[]) {
  try {
    localStorage.setItem(CUSTOM_MOSFET_PRESETS_KEY, JSON.stringify(presets.filter((p) => p.custom)));
  } catch {
    // Local persistence is a convenience only.
  }
}

export function defaultMosfetPresetId(kind: "NMOS" | "PMOS"): string {
  try {
    const stored = localStorage.getItem(`${DEFAULT_MOSFET_PRESET_PREFIX}${kind}`);
    if (stored) return stored;
  } catch {
    // Ignore storage failures and fall back to built-ins.
  }
  return kind === "NMOS" ? "nmos-default" : "pmos-default";
}

/** Persist the user's chosen default preset for the given MOSFET kind.
 *  Encapsulates the storage-key prefix so callers don't need to know it. */
export function writeDefaultMosfetPresetId(kind: "NMOS" | "PMOS", presetId: string): void {
  try {
    localStorage.setItem(`${DEFAULT_MOSFET_PRESET_PREFIX}${kind}`, presetId);
  } catch {
    /* ignore */
  }
}

export function mergeMosfetPresets(...groups: MosfetPreset[][]): MosfetPreset[] {
  const out = new Map<string, MosfetPreset>();
  for (const group of groups) {
    for (const preset of group) {
      if (isMosfetPreset(preset)) out.set(preset.id, preset);
    }
  }
  return Array.from(out.values());
}

export function mosfetPresetById(
  presets: MosfetPreset[],
  presetId: string,
  kind: "NMOS" | "PMOS",
): MosfetPreset | null {
  return (
    presets.find((preset) => preset.kind === kind && preset.id === presetId) ??
    presets.find((preset) => preset.kind === kind && preset.id === defaultMosfetPresetId(kind)) ??
    BUILTIN_MOSFET_PRESETS.find((preset) => preset.kind === kind) ??
    null
  );
}

export function modelOptionsForKind(
  models: ModelDefinition[],
  kind: ComponentKind,
  current: string,
): ModelDefinition[] {
  const allowed = new Set(modelTypesForKind(kind));
  const filtered = models.filter((model) => allowed.has(model.type));
  if (current.trim() && !filtered.some((model) => model.name === current.trim())) {
    const fallbackType = allowed.values().next().value as ModelDefinition["type"] | undefined;
    if (fallbackType) {
      return [{ name: current.trim(), type: fallbackType, params: "" }, ...filtered];
    }
  }
  return filtered;
}

export function ensureBuiltinModelDirective(doc: CircuitDoc, modelName: string): CircuitDoc {
  if (modelName === "NCH" || modelName === "PCH") return doc;
  const model = BUILTIN_MOSFET_MODELS.find((candidate) => candidate.name === modelName);
  if (!model) return doc;
  const existing = parseModelDefinitions(doc.directives).some(
    (candidate) => candidate.name === model.name && candidate.type === model.type,
  );
  if (existing) return doc;
  const line = modelDefinitionLine(model);
  return {
    ...doc,
    directives: doc.directives.trim()
      ? `${doc.directives.replace(/\s+$/u, "")}\n${line}`
      : line,
  };
}

export function isMosfetPreset(value: unknown): value is MosfetPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<MosfetPreset>;
  return (
    (preset.kind === "NMOS" || preset.kind === "PMOS") &&
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.model === "string" &&
    typeof preset.W === "string" &&
    typeof preset.L === "string"
  );
}
