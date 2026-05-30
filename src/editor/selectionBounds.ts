// Bounds + pin-hint helpers for selection / fit-to-content / fit-selection.
// Pulled out of Editor.tsx — these are pure derivations over a SchematicPage
// that depend only on label / geometry / probe-display modules, so they can
// live (and be unit-tested) in isolation.

import type { CircuitComponent, SchematicPage } from "./model.ts";
import { getPinLayout, pinLabelForKind, pinWorldPos } from "./model.ts";
import { componentBoundsFor, componentVisualBoundsFor } from "./geometry.ts";
import { netLabelLayout, valueLabelBounds, valueLabelOffsets } from "./labelPlacement.ts";
import { canvasValueLabel } from "./labelFormatting.ts";
import { probeHasDisplayLabel } from "./probeDisplay.ts";
import { probeScopeLabelBounds } from "./scopeLayout.ts";

export type PinHint = {
  label: string;
  position: { x: number; y: number };
  anchor: "start" | "middle" | "end";
  dx: number;
  dy: number;
};

export function pinHintsFor(c: CircuitComponent): PinHint[] {
  return getPinLayout(c)
    .map<PinHint | null>((_, idx) => {
      const label = pinHintLabel(c, idx);
      if (!label) return null;
      const position = pinWorldPos(c, idx);
      const deltaX = position.x - c.x;
      const deltaY = position.y - c.y;
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        const anchor: "start" | "end" = deltaX >= 0 ? "start" : "end";
        return {
          label,
          position,
          anchor,
          dx: deltaX >= 0 ? 0.34 : -0.34,
          dy: 0.02,
        };
      }
      return {
        label,
        position,
        anchor: "middle",
        dx: 0,
        dy: deltaY >= 0 ? 0.46 : -0.46,
      };
    })
    .filter((hint): hint is PinHint => Boolean(hint));
}

export function pinHintLabel(c: CircuitComponent, idx: number): string | null {
  const label = pinLabelForKind(c.kind, idx);
  return label === "-" ? "−" : label;
}

export function collectPageBounds(p: SchematicPage, selected?: Set<string>): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of p.components) {
    if (selected && !selected.has(c.id)) continue;
    const bounds = componentBoundsFor(c);
    xs.push(bounds.x1, bounds.x2);
    ys.push(bounds.y1, bounds.y2);
    const pins = getPinLayout(c);
    for (let i = 0; i < pins.length; i++) {
      const wp = pinWorldPos(c, i);
      xs.push(wp.x);
      ys.push(wp.y);
    }
  }
  for (const w of p.wires) {
    if (selected && !selected.has(w.id)) continue;
    for (const [x, y] of w.points) {
      xs.push(x);
      ys.push(y);
    }
  }
  includeCanvasLabelBounds(p, selected, xs, ys);
  for (const probe of p.probes) {
    if (selected && !selected.has(probe.id)) continue;
    xs.push(probe.x);
    ys.push(probe.y);
    if (probeHasDisplayLabel(probe)) {
      const label = probe.label!.trim();
      const bounds = probeScopeLabelBounds(probe, label);
      xs.push(bounds.x1, bounds.x2);
      ys.push(bounds.y1, bounds.y2);
    }
  }
  return { xs, ys };
}

function includeCanvasLabelBounds(
  p: SchematicPage,
  selected: Set<string> | undefined,
  xs: number[],
  ys: number[],
) {
  const offsets = valueLabelOffsets(p, (component) =>
    canvasValueLabel(component.kind, component.value),
  );
  for (const c of p.components) {
    if (selected && !selected.has(c.id)) continue;
    if (c.kind === "LABEL") {
      const text = c.value.trim();
      if (!text) continue;
      const bounds = netLabelLayout(c, p, text).bounds;
      xs.push(c.x, bounds.x1, bounds.x2);
      ys.push(c.y, bounds.y1, bounds.y2);
      continue;
    }
    if (c.kind === "NOTE") {
      const bounds = componentVisualBoundsFor(c);
      xs.push(bounds.x1, bounds.x2);
      ys.push(bounds.y1, bounds.y2);
      continue;
    }
    const text = canvasValueLabel(c.kind, c.value);
    const offset = offsets.get(c.id);
    if (!text || !offset) continue;
    const bounds = valueLabelBounds(c, offset, text);
    xs.push(bounds.x1, bounds.x2);
    ys.push(bounds.y1, bounds.y2);
  }
}
