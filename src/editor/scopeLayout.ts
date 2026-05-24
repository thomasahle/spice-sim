import type { CircuitComponent, Probe, SchematicPage, Wire } from "./model";
import { canvasValueLabel } from "./labelFormatting.ts";
import { netLabelLayouts, valueLabelBounds, valueLabelOffsets } from "./labelPlacement.ts";

export interface ScopeLayoutOptions {
  defaultDx: number;
  defaultDy: number;
  width: number;
  height: number;
}

export interface ScopePlacement {
  dx: number;
  dy: number;
}

type Bounds = { x1: number; y1: number; x2: number; y2: number };

export function layoutProbeScopes(
  page: SchematicPage,
  options: ScopeLayoutOptions,
): Map<string, ScopePlacement> {
  const placements = new Map<string, ScopePlacement>();
  const placedBounds: Bounds[] = [];
  const probes = [...page.probes].sort((a, b) => {
    const aPinned = a.scopeDx != null || a.scopeDy != null;
    const bPinned = b.scopeDx != null || b.scopeDy != null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return 0;
  });

  for (const probe of probes) {
    const placement = scopeOffsetForProbe(probe, page, options, placedBounds);
    placements.set(probe.id, placement);
    placedBounds.push(scopeBounds(probe, placement, options));
  }

  return placements;
}

function scopeOffsetForProbe(
  probe: Probe,
  page: SchematicPage,
  options: ScopeLayoutOptions,
  placedBounds: Bounds[],
): ScopePlacement {
  if (probe.scopeDx != null || probe.scopeDy != null) {
    return {
      dx: probe.scopeDx ?? options.defaultDx,
      dy: probe.scopeDy ?? options.defaultDy,
    };
  }

  const candidates = scopeCandidates(options);

  let best = candidates[0];
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const bounds = scopeBounds(probe, candidate, options);
    const score =
      scopeComponentOverlapScore(bounds, page.components) * 180 +
      scopeWireOverlapScore(bounds, page.wires) * 45 +
      scopeLabelOverlapScore(bounds, page) * 80 +
      scopeProbeOverlapScore(bounds, page.probes, probe.id) * 160 +
      placedBounds.filter((placed) => rectsIntersect(bounds, placed)).length * 160 +
      Math.abs(candidate.dx - options.defaultDx) * 0.6 +
      Math.abs(candidate.dy - options.defaultDy) * 0.6;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function scopeCandidates(options: ScopeLayoutOptions): ScopePlacement[] {
  const left = -options.width - 1.0;
  const right = 1.0;
  const above = -options.height - 1.2;
  const below = 1.0;
  const farLeft = -options.width - 2.4;
  const farRight = 2.4;
  const farAbove = -options.height - 2.7;
  const farBelow = 2.5;
  const extraAbove = -options.height - 4.3;
  const extraBelow = 4.0;
  return [
    { dx: options.defaultDx, dy: options.defaultDy },
    { dx: right, dy: below },
    { dx: left, dy: options.defaultDy },
    { dx: left, dy: below },
    { dx: right, dy: above },
    { dx: left, dy: above },
    { dx: right, dy: farBelow },
    { dx: left, dy: farBelow },
    { dx: farRight, dy: options.defaultDy },
    { dx: farLeft, dy: options.defaultDy },
    { dx: farRight, dy: above },
    { dx: farLeft, dy: above },
    { dx: right, dy: farAbove },
    { dx: left, dy: farAbove },
    { dx: farRight, dy: farBelow },
    { dx: farLeft, dy: farBelow },
    { dx: farRight, dy: extraAbove },
    { dx: farLeft, dy: extraAbove },
    { dx: farRight, dy: extraBelow },
    { dx: farLeft, dy: extraBelow },
  ];
}

function scopeBounds(
  probe: Probe,
  placement: ScopePlacement,
  options: ScopeLayoutOptions,
): Bounds {
  return {
    x1: probe.x + placement.dx,
    y1: probe.y + placement.dy,
    x2: probe.x + placement.dx + options.width,
    y2: probe.y + placement.dy + options.height,
  };
}

function scopeComponentOverlapScore(bounds: Bounds, components: CircuitComponent[]): number {
  let score = 0;
  for (const component of components) {
    score += overlapArea(bounds, componentBoundsFor(component, 0.36));
  }
  return score;
}

function scopeWireOverlapScore(bounds: Bounds, wires: Wire[]): number {
  let score = 0;
  for (const wire of wires) {
    for (let i = 0; i < wire.points.length - 1; i++) {
      const [x1, y1] = wire.points[i];
      const [x2, y2] = wire.points[i + 1];
      const segmentBounds = {
        x1: Math.min(x1, x2) - 0.18,
        y1: Math.min(y1, y2) - 0.18,
        x2: Math.max(x1, x2) + 0.18,
        y2: Math.max(y1, y2) + 0.18,
      };
      score += overlapArea(bounds, segmentBounds);
    }
  }
  return score;
}

function scopeLabelOverlapScore(bounds: Bounds, page: SchematicPage): number {
  let score = 0;
  const offsets = valueLabelOffsets(page, (component) =>
    canvasValueLabel(component.kind, component.value),
  );
  const occupiedValueLabels: Bounds[] = [];
  for (const component of page.components) {
    const text = canvasValueLabel(component.kind, component.value);
    const offset = offsets.get(component.id);
    if (!text || !offset) continue;
    const labelBounds = valueLabelBounds(component, offset, text);
    occupiedValueLabels.push(labelBounds);
    score += overlapArea(bounds, labelBounds);
  }
  for (const layout of netLabelLayouts(page, occupiedValueLabels).values()) {
    score += overlapArea(bounds, layout.bounds);
  }
  return score;
}

function scopeProbeOverlapScore(bounds: Bounds, probes: Probe[], activeProbeId: string): number {
  let score = 0;
  for (const probe of probes) {
    const weight = probe.id === activeProbeId ? 1.4 : 1;
    score += overlapArea(bounds, probeMarkerBounds(probe)) * weight;
    const label = probe.label?.trim();
    if (label) score += overlapArea(bounds, probeLabelBounds(probe, label)) * weight;
  }
  return score;
}

function probeMarkerBounds(probe: Probe): Bounds {
  return {
    x1: probe.x - 0.58,
    y1: probe.y - 0.58,
    x2: probe.x + 0.58,
    y2: probe.y + 0.58,
  };
}

function probeLabelBounds(probe: Probe, label: string): Bounds {
  const width = Math.max(2.6, label.length * 0.38 + 0.7);
  return {
    x1: probe.x + 0.45,
    y1: probe.y - 0.92,
    x2: probe.x + 0.45 + width,
    y2: probe.y - 0.22,
  };
}

function componentBounds(kind: CircuitComponent["kind"]): { w: number; h: number } {
  switch (kind) {
    case "OPAMP":
    case "SUBX":
      return { w: 7.4, h: 5.6 };
    case "NPN":
    case "PNP":
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return { w: 4.8, h: 5.2 };
    case "GND":
    case "LABEL":
      return { w: 3.2, h: 2.4 };
    default:
      return { w: 5.0, h: 2.4 };
  }
}

function componentBoundsFor(c: CircuitComponent, pad = 0): Bounds {
  const base = componentBounds(c.kind);
  const rotated = c.rotation === 90 || c.rotation === 270;
  const w = rotated ? base.h : base.w;
  const h = rotated ? base.w : base.h;
  return {
    x1: c.x - w / 2 - pad,
    y1: c.y - h / 2 - pad,
    x2: c.x + w / 2 + pad,
    y2: c.y + h / 2 + pad,
  };
}

function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

function overlapArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return Math.max(0, width) * Math.max(0, height);
}
