import type { ComponentKind } from "./model";

export function isIndependentSourceKind(kind: ComponentKind): boolean {
  return kind === "V" || kind === "I";
}

export function isSimulationStimulusKind(kind: ComponentKind): boolean {
  return isIndependentSourceKind(kind) || kind === "B";
}
