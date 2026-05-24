import type { Probe } from "./model.ts";

export interface ProbeScopeDisplayState {
  selected?: boolean;
  hovered?: boolean;
  dragging?: boolean;
  hasTrace?: boolean;
}

export function probeHasDisplayLabel(probe: Pick<Probe, "label">): boolean {
  return Boolean(probe.label?.trim());
}

export function probeHasManualScopePlacement(
  probe: Pick<Probe, "scopeDx" | "scopeDy">,
): boolean {
  return probe.scopeDx != null || probe.scopeDy != null;
}

export function inlineProbeScopeLabel(
  probe: Pick<Probe, "label">,
  netLabel?: string | null,
): string | undefined {
  const explicit = probe.label?.trim();
  if (explicit) return explicit;
  return netLabel?.trim() || undefined;
}

export function shouldRenderInlineProbeScope(
  probe: Pick<Probe, "label" | "scopeDx" | "scopeDy">,
  state: ProbeScopeDisplayState = {},
): boolean {
  return Boolean(
    probeHasDisplayLabel(probe) ||
      probeHasManualScopePlacement(probe) ||
      state.hasTrace,
  );
}
