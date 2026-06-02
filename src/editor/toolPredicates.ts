// The Tool type + small predicates over tools, component kinds, and status
// strings. Pulled out of Editor.tsx so the type travels with its predicates
// and the editor doesn't carry these one-liners.

import type { ComponentKind } from "./model.ts";

export type Tool = "select" | "node" | "wire" | "probe" | ComponentKind;

/** Tools that snap to a single connection point (one-pin components like
 *  GND / LABEL — wiring rules treat them as terminal-only anchors). */
export function isSinglePinSnappingTool(tool: Tool): boolean {
  return tool === "GND" || tool === "LABEL";
}

/** Multi-pin device kinds whose pin labels (D/G/S, C/B/E, …) are worth
 *  showing on selection / hover and snap strongly while wiring. */
export function isActiveMultiPinKind(kind: ComponentKind): boolean {
  return (
    kind === "NPN" ||
    kind === "PNP" ||
    kind === "NMOS" ||
    kind === "PMOS" ||
    kind === "NMOS4" ||
    kind === "PMOS4" ||
    kind === "OPAMP" ||
    kind === "SUBX"
  );
}

export function toolDescriptionFor(kind: ComponentKind, fallback?: string): string | undefined {
  switch (kind) {
    case "NPN":
      return "Drag to place and orient. C/B/E pins stay visible on selection and snap strongly while wiring.";
    case "PNP":
      return "Drag to place and orient. C/B/E pins stay visible on selection and snap strongly while wiring.";
    case "NMOS":
      return "Drag to place and orient. D/G/S pins stay visible on selection and snap strongly while wiring.";
    case "PMOS":
      return "Drag to place and orient. D/G/S pins stay visible on selection and snap strongly while wiring.";
    case "NMOS4":
      return "Drag to place and orient. D/G/S/B pins stay visible on selection; use this when bulk must not be tied to source.";
    case "PMOS4":
      return "Drag to place and orient. D/G/S/B pins stay visible on selection; use this when bulk must not be tied to source.";
    case "OPAMP":
      return "Drag to place and orient; wire the +, - and OUT pins. Pins stay visible on selection and snap strongly while wiring.";
    default:
      return fallback;
  }
}

/** A status string we don't want to overwrite with informational chatter
 *  (it isn't "Idle"/"Modified" and isn't a ✓ success or ✗ error result). */
export function isNeutralStatusMessage(status: string): boolean {
  return (
    status !== "" &&
    status !== "Idle" &&
    !status.startsWith("✓") &&
    !status.startsWith("✗") &&
    !status.startsWith("Modified")
  );
}

export function isTransientPlot(plot: string): boolean {
  const normalized = plot.toLowerCase();
  return normalized.startsWith("tran") || normalized.includes("transient");
}
