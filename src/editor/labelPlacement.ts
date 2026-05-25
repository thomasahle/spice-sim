import { componentVisualBoundsFor, wireIntersectsRect } from "./geometry.ts";
import type { Bounds } from "./geometry.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import type { CircuitComponent, Probe, SchematicPage, Wire } from "./model.ts";

export type LabelAnchor = "start" | "middle" | "end";

export interface LabelOffset {
  x: number;
  y: number;
  anchor: LabelAnchor;
}

export type ComponentLabelText = (component: CircuitComponent) => string | null;

export interface NetLabelLayout {
  stemX2: number;
  stemY2: number;
  chipX: number;
  chipY: number;
  chipW: number;
  chipH: number;
  textX: number;
  textY: number;
  bounds: Bounds;
}

const NET_LABEL_STEM = 0.42;
const NET_LABEL_LONG_STEM = 1.35;
const NET_LABEL_CHIP_H = 0.88;
const NET_LABEL_TEXT_BASELINE = 0.67;

export function valueLabelOffset(
  component: CircuitComponent,
  page: SchematicPage,
  text: string,
): LabelOffset {
  return bestValueLabelOffset(component, page, text, []);
}

export function valueLabelOffsets(page: SchematicPage, labelText: ComponentLabelText): Map<string, LabelOffset> {
  const offsets = new Map<string, LabelOffset>();
  const occupied: Bounds[] = [];

  for (const component of page.components) {
    const text = labelText(component);
    if (!text) continue;
    const offset = bestValueLabelOffset(component, page, text, occupied);
    offsets.set(component.id, offset);
    occupied.push(labelBounds(component, offset, text));
  }

  return offsets;
}

export function valueLabelBounds(
  component: CircuitComponent,
  offset: LabelOffset,
  text: string,
): Bounds {
  return labelBounds(component, offset, text);
}

export function netLabelLayout(
  component: CircuitComponent,
  page: SchematicPage,
  text: string,
  occupiedLabels: Bounds[] = [],
): NetLabelLayout {
  const candidates = netLabelCandidates(component, text);
  let best = candidates[0];
  let bestScore = Infinity;
  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    const score =
      netLabelOverlapScore(component, page, candidate) +
      labelToLabelScore(candidate.bounds, occupiedLabels) +
      idx * 4;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function netLabelLayouts(
  page: SchematicPage,
  occupiedLabels: Bounds[] = [],
): Map<string, NetLabelLayout> {
  const layouts = new Map<string, NetLabelLayout>();
  const occupied = [...occupiedLabels];
  for (const component of page.components) {
    if (component.kind !== "LABEL") continue;
    const text = component.value.trim();
    if (!text) continue;
    const layout = netLabelLayout(component, page, text, occupied);
    layouts.set(component.id, layout);
    occupied.push(layout.bounds);
  }
  return layouts;
}

export function netLabelBounds(
  component: CircuitComponent,
  page: SchematicPage,
  text: string,
): Bounds {
  return netLabelLayout(component, page, text).bounds;
}

function bestValueLabelOffset(
  component: CircuitComponent,
  page: SchematicPage,
  text: string,
  occupiedLabels: Bounds[],
): LabelOffset {
  const candidates = expandedLabelCandidates(component);
  let best = candidates[0];
  let bestScore = Infinity;
  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    const bounds = labelBounds(component, candidate, text);
    const score =
      labelOverlapScore(component, page, bounds) +
      labelToLabelScore(bounds, occupiedLabels) +
      offsetDistance(candidate, candidates[0]) * 4 +
      idx * 3;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function expandedLabelCandidates(c: CircuitComponent): LabelOffset[] {
  const candidates = labelCandidates(c);
  const extra: LabelOffset[] = [
    { x: 3.95, y: 0.25, anchor: "start" },
    { x: -3.95, y: 0.25, anchor: "end" },
    { x: 0, y: 2.95, anchor: "middle" },
    { x: 0, y: -2.7, anchor: "middle" },
    { x: 3.95, y: 1.15, anchor: "start" },
    { x: -3.95, y: 1.15, anchor: "end" },
    { x: 3.95, y: -1.1, anchor: "start" },
    { x: -3.95, y: -1.1, anchor: "end" },
  ];
  for (const candidate of extra) {
    if (!candidates.some((existing) => sameLabelOffset(existing, candidate))) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function sameLabelOffset(a: LabelOffset, b: LabelOffset): boolean {
  return a.anchor === b.anchor && sameCoord(a.x, b.x) && sameCoord(a.y, b.y);
}

function labelCandidates(c: CircuitComponent): LabelOffset[] {
  if (c.kind === "V" || c.kind === "I") {
    const horizontal = c.rotation === 90 || c.rotation === 270;
    return horizontal
      ? [
          { x: 1.55, y: 0.25, anchor: "start" },
          { x: -1.55, y: 0.25, anchor: "end" },
          { x: 0, y: 1.55, anchor: "middle" },
          { x: 0, y: -1.35, anchor: "middle" },
        ]
      : [
          { x: 2.15, y: 0.25, anchor: "start" },
          { x: -2.15, y: 0.25, anchor: "end" },
          { x: 2.15, y: 1.15, anchor: "start" },
          { x: -2.15, y: 1.15, anchor: "end" },
          { x: 2.15, y: -1.15, anchor: "start" },
          { x: -2.15, y: -1.15, anchor: "end" },
          { x: 2.55, y: 0.95, anchor: "start" },
          { x: -2.55, y: 0.95, anchor: "end" },
          { x: 2.55, y: -0.9, anchor: "start" },
          { x: -2.55, y: -0.9, anchor: "end" },
          { x: 0, y: 1.75, anchor: "middle" },
          { x: 0, y: -1.55, anchor: "middle" },
        ];
  }
  if (c.kind === "GND") return [{ x: 0, y: -0.4, anchor: "middle" }];
  if (
    c.kind === "NPN" ||
    c.kind === "PNP" ||
    c.kind === "NMOS" ||
    c.kind === "PMOS" ||
    c.kind === "NMOS4" ||
    c.kind === "PMOS4"
  ) {
    return [
      { x: 1.55, y: 0.2, anchor: "start" },
      { x: -1.55, y: 0.2, anchor: "end" },
      { x: 0, y: 2.2, anchor: "middle" },
      { x: 0, y: -2.0, anchor: "middle" },
    ];
  }
  return twoTerminalPinsAreVertical(c)
    ? [
        { x: 1.65, y: 0.25, anchor: "start" },
        { x: -1.65, y: 0.25, anchor: "end" },
        { x: 0, y: 1.7, anchor: "middle" },
        { x: 0, y: -1.45, anchor: "middle" },
        { x: 2.65, y: 0.25, anchor: "start" },
        { x: -2.65, y: 0.25, anchor: "end" },
        { x: 0, y: 2.45, anchor: "middle" },
        { x: 0, y: -2.2, anchor: "middle" },
      ]
    : [
        { x: 0, y: 1.45, anchor: "middle" },
        { x: 0, y: -1.15, anchor: "middle" },
        { x: 1.75, y: 0.25, anchor: "start" },
        { x: -1.75, y: 0.25, anchor: "end" },
        { x: 0, y: 2.2, anchor: "middle" },
        { x: 0, y: -1.9, anchor: "middle" },
        { x: 2.85, y: 0.25, anchor: "start" },
        { x: -2.85, y: 0.25, anchor: "end" },
      ];
}

function twoTerminalPinsAreVertical(c: CircuitComponent): boolean {
  const pins = getPinLayout(c);
  if (pins.length !== 2) return false;
  const first = pinWorldPos(c, 0);
  const second = pinWorldPos(c, 1);
  return Math.abs(second.y - first.y) > Math.abs(second.x - first.x);
}

function labelOverlapScore(component: CircuitComponent, page: SchematicPage, bounds: Bounds): number {
  let score = overlapArea(bounds, componentVisualBoundsFor(component)) * selfOverlapWeight(component);
  if (component.kind === "V" || component.kind === "I") {
    score += overlapArea(bounds, componentVisualBoundsFor(component, 0.12)) * 120;
  }
  for (const other of page.components) {
    if (other.id === component.id) continue;
    if (other.kind === "LABEL") {
      for (const labelBounds of netLabelObstacleBounds(other)) {
        score += overlapArea(bounds, labelBounds) * 42;
      }
      continue;
    }
    const area = overlapArea(bounds, componentObstacleBounds(other));
    score += area * 30;
    if (!componentUsesCompactLabelModel(component) && area > 0.08) score += 95;
  }
  for (const wire of page.wires) {
    if (!wireIntersectsRect(wire.points, bounds)) continue;
    score += wireTouchesComponentPin(wire, component) ? 42 : 34;
  }
  for (const probe of page.probes) {
    score += overlapArea(bounds, probeMarkerBounds(probe)) * 90;
    const label = probe.label?.trim();
    if (label) score += overlapArea(bounds, probeLabelBounds(probe, label)) * 160;
  }
  return score;
}

function selfOverlapWeight(component: CircuitComponent): number {
  if (component.kind === "V" || component.kind === "I") return 60;
  if (
    component.kind === "NPN" ||
    component.kind === "PNP" ||
    component.kind === "NMOS" ||
    component.kind === "PMOS" ||
    component.kind === "NMOS4" ||
    component.kind === "PMOS4"
  ) {
    return 48;
  }
  return 18;
}

function netLabelCandidates(c: CircuitComponent, text: string): NetLabelLayout[] {
  const chipW = netLabelWidth(text);
  const chipH = NET_LABEL_CHIP_H;
  const y = c.y - chipH / 2;
  const topY = c.y - NET_LABEL_STEM - chipH;
  const bottomY = c.y + NET_LABEL_STEM;
  const farTopY = c.y - NET_LABEL_LONG_STEM - chipH;
  const farBottomY = c.y + NET_LABEL_LONG_STEM;
  const centeredX = c.x - chipW / 2;
  return [
    makeNetLabelLayout(c.x + NET_LABEL_STEM, c.y, c.x + NET_LABEL_STEM, y, chipW, chipH),
    makeNetLabelLayout(c.x, c.y - NET_LABEL_STEM, centeredX, topY, chipW, chipH),
    makeNetLabelLayout(c.x - NET_LABEL_STEM, c.y, c.x - NET_LABEL_STEM - chipW, y, chipW, chipH),
    makeNetLabelLayout(c.x, c.y + NET_LABEL_STEM, centeredX, bottomY, chipW, chipH),
    makeNetLabelLayout(c.x, c.y - NET_LABEL_LONG_STEM, centeredX, farTopY, chipW, chipH),
    makeNetLabelLayout(c.x, c.y + NET_LABEL_LONG_STEM, centeredX, farBottomY, chipW, chipH),
    makeNetLabelLayout(
      c.x - NET_LABEL_LONG_STEM,
      c.y,
      c.x - NET_LABEL_LONG_STEM - chipW,
      y,
      chipW,
      chipH,
    ),
    makeNetLabelLayout(c.x + NET_LABEL_LONG_STEM, c.y, c.x + NET_LABEL_LONG_STEM, y, chipW, chipH),
  ];
}

function makeNetLabelLayout(
  stemX2: number,
  stemY2: number,
  chipX: number,
  chipY: number,
  chipW: number,
  chipH: number,
): NetLabelLayout {
  return {
    stemX2,
    stemY2,
    chipX,
    chipY,
    chipW,
    chipH,
    textX: chipX + chipW / 2,
    textY: chipY + NET_LABEL_TEXT_BASELINE,
    bounds: { x1: chipX, y1: chipY, x2: chipX + chipW, y2: chipY + chipH },
  };
}

function netLabelWidth(text: string): number {
  return Math.max(1.55, text.length * 0.38 + 0.72);
}

function netLabelOverlapScore(
  component: CircuitComponent,
  page: SchematicPage,
  layout: NetLabelLayout,
): number {
  let score = 0;
  for (const other of page.components) {
    if (other.id === component.id) continue;
    score += overlapArea(layout.bounds, componentObstacleBounds(other)) * 70;
  }
  for (const wire of page.wires) {
    if (wireIntersectsRect(wire.points, layout.bounds)) score += 120;
  }
  for (const probe of page.probes) {
    score += overlapArea(layout.bounds, probeMarkerBounds(probe)) * 130;
    const label = probe.label?.trim();
    if (label) score += overlapArea(layout.bounds, probeLabelBounds(probe, label)) * 180;
  }
  return score;
}

function componentObstacleBounds(component: CircuitComponent): Bounds {
  if (component.kind === "LABEL") {
    const text = component.value.trim();
    if (text) return defaultNetLabelBounds(component, text);
  }
  return componentVisualBoundsFor(component, 0.18);
}

function netLabelObstacleBounds(component: CircuitComponent): Bounds[] {
  const text = component.value.trim();
  return text ? netLabelCandidates(component, text).map((candidate) => candidate.bounds) : [];
}

function defaultNetLabelBounds(component: CircuitComponent, text: string): Bounds {
  const width = netLabelWidth(text);
  return {
    x1: component.x + NET_LABEL_STEM,
    y1: component.y - NET_LABEL_CHIP_H / 2,
    x2: component.x + NET_LABEL_STEM + width,
    y2: component.y + NET_LABEL_CHIP_H / 2,
  };
}

function labelToLabelScore(bounds: Bounds, occupiedLabels: Bounds[]): number {
  let score = 0;
  for (const occupied of occupiedLabels) {
    if (!rectsIntersect(bounds, occupied)) continue;
    score += 80 + overlapArea(bounds, occupied) * 20;
  }
  return score;
}

function wireTouchesComponentPin(wire: Wire, component: CircuitComponent): boolean {
  for (let idx = 0; idx < getPinLayout(component).length; idx++) {
    const pin = pinWorldPos(component, idx);
    if (wire.points.some(([x, y]) => sameCoord(x, pin.x) && sameCoord(y, pin.y))) return true;
  }
  return false;
}

function sameCoord(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function offsetDistance(a: LabelOffset, b: LabelOffset): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function labelBounds(c: CircuitComponent, offset: LabelOffset, text: string): Bounds {
  // Match the rendered canvas label more closely. SVG text is not measurable
  // during pure layout tests, so use a deliberately conservative width; a
  // too-small model is what causes dense labels to visually collide.
  const width =
    componentUsesCompactLabelModel(c)
      ? Math.max(0.95, text.length * 0.26 + 0.42)
      : Math.max(0.95, text.length * 0.28 + 0.44);
  const height = 0.92;
  const baseline = c.y + offset.y;
  const y1 = baseline - height;
  const y2 = baseline + 0.12;
  const x = c.x + offset.x;
  if (offset.anchor === "middle") return { x1: x - width / 2, y1, x2: x + width / 2, y2 };
  if (offset.anchor === "end") return { x1: x - width, y1, x2: x, y2 };
  return { x1: x, y1, x2: x + width, y2 };
}

function componentUsesCompactLabelModel(c: CircuitComponent): boolean {
  return c.kind === "V" || c.kind === "I" || c.kind === "B";
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

function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

function overlapArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return Math.max(0, width) * Math.max(0, height);
}
