// Core circuit model. Coordinates are in grid cells; the renderer scales to px.

import { estimateInlineMathTextWidth } from "./mathText.ts";

export type ComponentKind =
  | "R"
  | "V"
  | "B"
  | "GND"
  | "C"
  | "L"
  | "I"
  | "D"
  | "NPN"
  | "PNP"
  | "NMOS"
  | "PMOS"
  | "NMOS4"
  | "PMOS4"
  | "OPAMP"
  | "LABEL"
  | "NOTE"
  | "SUBX";

export type Rotation = 0 | 90 | 180 | 270;

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  x: number; // grid cell of component origin
  y: number;
  rotation: Rotation;
  /** Mirror the symbol around its local vertical axis before rotation. */
  mirrored?: boolean;
  value: string; // SPICE value, e.g. "1k", "10", "DMOD"
  label?: string;
  /** Device-specific parameters: MOS L/W, BJT area, etc. */
  params?: Record<string, string>;
}

export interface Wire {
  id: string;
  points: [number, number][];
}

export interface Probe {
  id: string;
  /** Grid coordinate of the probed pin / wire vertex. */
  x: number;
  y: number;
  /** Inline mini-scope offset from the probe point. */
  scopeDx?: number;
  scopeDy?: number;
  /** Display label (defaults to node name resolved at netlist time). */
  label?: string;
  color: string;
}

export type AnalysisSpec =
  | { kind: "op" }
  | { kind: "tran"; tstep: string; tstop: string; tstart?: string }
  | { kind: "dc"; src: string; start: string; stop: string; step: string }
  | { kind: "ac"; sweep: "dec" | "lin" | "oct"; npts: number; fstart: string; fstop: string }
  | {
      kind: "noise";
      out_node: string;
      src: string;
      sweep: "dec" | "lin" | "oct";
      npts: number;
      fstart: string;
      fstop: string;
    };

export interface SchematicPage {
  id: string;
  /** SPICE-safe identifier; root page is "main", others become .subckt names */
  name: string;
  /** User-facing summary shown in places that list this schematic as a reusable block. */
  description?: string;
  components: CircuitComponent[];
  wires: Wire[];
  probes: Probe[];
}

export interface SimSettings {
  /** Operating temperature in Celsius. Default: 27. */
  temperature?: string;
  /** Numerical integration method. */
  method?: "trap" | "gear" | "be";
  /** Use Initial Conditions for transient (skips DC OP at t=0). */
  uic?: boolean;
  /** Free-form additional .options lines (e.g. "reltol=1e-4 abstol=1e-12"). */
  options?: string;
}

export interface CircuitDoc {
  /** Ordered pages; pages[0] is the root schematic (main netlist). Others emit as `.subckt`. */
  pages: SchematicPage[];
  /** Currently-edited page id. */
  activePageId: string;
  directives: string;
  analysis: AnalysisSpec;
  simSettings?: SimSettings;
}

export const MAX_SUBCIRCUIT_PINS = 64;

export function currentPage(d: CircuitDoc): SchematicPage {
  return d.pages.find((p) => p.id === d.activePageId) ?? d.pages[0];
}

export function updateCurrentPage(
  d: CircuitDoc,
  updater: (p: SchematicPage) => SchematicPage,
): CircuitDoc {
  return {
    ...d,
    pages: d.pages.map((p) => (p.id === d.activePageId ? updater(p) : p)),
  };
}

export function subcircuitPageForInstance(
  d: CircuitDoc,
  component: CircuitComponent,
): SchematicPage | null {
  if (component.kind !== "SUBX") return null;
  const name = component.value.trim();
  if (!name) return null;
  return d.pages.slice(1).find((p) => p.id !== d.activePageId && p.name === name) ?? null;
}

export function parsePortOrder(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function orderedSubcircuitPortLabels(page: SchematicPage): string[] {
  const labels = page.components.filter(
    (component) => component.kind === "LABEL" && component.value.trim() !== "",
  );
  const hasExplicitPorts = labels.some((component) => component.params?.port === "1");
  return orderedLabelPorts(hasExplicitPorts
    ? labels.filter((component) => component.params?.port === "1")
    : labels).map((component) => component.value.trim());
}

export function subcircuitPortLabels(page: SchematicPage): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const label of orderedSubcircuitPortLabels(page)) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

export function subcircuitPortCount(page: SchematicPage): number {
  return Math.min(MAX_SUBCIRCUIT_PINS, subcircuitPortLabels(page).length);
}

export function subcircuitPinLabelsForInstance(
  doc: CircuitDoc,
  component: CircuitComponent,
): string[] {
  const page = subcircuitPageForInstance(doc, component);
  if (!page) return [];
  return subcircuitPortLabels(page).slice(0, subcircuitPinCountForInstance(component));
}

export function subcircuitBodyWidth(component: CircuitComponent): number {
  const raw = Number(component.params?.w);
  const n = subcircuitPinCountForInstance(component);
  const pinsPerSide = Math.ceil(n / 2);
  const pinCountWidth = Math.min(8, 4.8 + Math.max(0, pinsPerSide - 3) * 0.3);
  const labelWidth = component.value.trim()
    ? estimateInlineMathTextWidth(component.value.trim()) * 0.6 + 0.84
    : 0;
  const minWidth = Math.min(16, Math.max(3.4, labelWidth));
  return clampFinite(raw, Math.max(pinCountWidth, minWidth), minWidth, 16);
}

export function subcircuitBodyHeight(component: CircuitComponent): number {
  const raw = Number(component.params?.h);
  const n = subcircuitPinCountForInstance(component);
  const leftCount = Math.ceil(n / 2);
  const rightCount = n - leftCount;
  const autoHeight = Math.max(leftCount, rightCount, 1) - 1 + 1.2;
  return clampFinite(raw, autoHeight, autoHeight, 24);
}

function subcircuitPinCountForInstance(component: CircuitComponent): number {
  const raw = parseInt(component.params?.npins ?? "4", 10);
  return Math.max(1, Math.min(MAX_SUBCIRCUIT_PINS, Number.isFinite(raw) ? raw : 4));
}

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function orderedLabelPorts(ports: CircuitComponent[]): CircuitComponent[] {
  const centerX = ports.length > 0
    ? ports.reduce((sum, component) => sum + component.x, 0) / ports.length
    : 0;
  return [...ports].sort((a, b) => {
    const orderA = parsePortOrder(a.params?.portOrder);
    const orderB = parsePortOrder(b.params?.portOrder);
    if (orderA !== null || orderB !== null) {
      if (orderA === null) return 1;
      if (orderB === null) return -1;
      if (orderA !== orderB) return orderA - orderB;
    }
    const sideA = a.x <= centerX ? 0 : 1;
    const sideB = b.x <= centerX ? 0 : 1;
    if (sideA !== sideB) return sideA - sideB;
    if (Math.abs(a.y - b.y) > 1e-9) return a.y - b.y;
    if (Math.abs(a.x - b.x) > 1e-9) return a.x - b.x;
    return a.value.localeCompare(b.value);
  });
}

export function sanitizePageName(raw: string, fallback = "main"): string {
  const name = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return name || fallback;
}

export function uniquePageName(
  d: CircuitDoc,
  raw: string,
  pageId: string,
  fallback = "main",
): string {
  const base = sanitizePageName(raw, fallback);
  let name = base;
  let suffix = 2;
  const existing = new Set(
    d.pages
      .filter((p) => p.id !== pageId)
      .map((p) => p.name.toLowerCase()),
  );
  while (existing.has(name.toLowerCase())) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  return name;
}

export function updatePageMeta(
  d: CircuitDoc,
  pageId: string,
  patch: Partial<Pick<SchematicPage, "name" | "description">>,
): CircuitDoc {
  const page = d.pages.find((p) => p.id === pageId);
  if (!page) return d;
  const rootId = d.pages[0]?.id;
  const fallbackName = page.id === rootId ? "main" : page.name || "sub";
  const nextName =
    patch.name !== undefined
      ? uniquePageName(d, patch.name, pageId, fallbackName)
      : page.name;
  const nameChanged = nextName !== page.name;
  const previousName = page.name;

  return {
    ...d,
    pages: d.pages.map((p) => {
      const nextComponents = nameChanged
        ? p.components.map((component) =>
            component.kind === "SUBX" && component.value.trim() === previousName
              ? { ...component, value: nextName }
              : component,
          )
        : p.components;
      if (p.id !== pageId) {
        return nextComponents === p.components ? p : { ...p, components: nextComponents };
      }
      return {
        ...p,
        ...patch,
        name: nextName,
        components: nextComponents,
      };
    }),
  };
}

export function makePage(name: string): SchematicPage {
  return {
    id: makeId("page"),
    name,
    description: "",
    components: [],
    wires: [],
    probes: [],
  };
}

// Pin coordinates relative to component origin (before rotation).
// NPN/PNP/NMOS/PMOS pins are [collector|drain, base|gate, emitter|source].
// NMOS4/PMOS4 add an explicit fourth body/bulk pin: [drain, gate, source, bulk].
export const PIN_LAYOUTS: Record<ComponentKind, { x: number; y: number }[]> = {
  R: [
    { x: -2, y: 0 },
    { x: 2, y: 0 },
  ],
  V: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  B: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  I: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  C: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  L: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  D: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  GND: [{ x: 0, y: 0 }],
  NPN: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
  ],
  PNP: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
  ],
  NMOS: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
  ],
  PMOS: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
  ],
  NMOS4: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 2, y: 0 },
  ],
  PMOS4: [
    { x: 0, y: -2 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 2, y: 0 },
  ],
  // Op-amp: pin[0]=V+ (non-inverting in), pin[1]=V- (inverting in), pin[2]=OUT
  OPAMP: [
    { x: -3, y: -1 },
    { x: -3, y: 1 },
    { x: 3, y: 0 },
  ],
  // Label: a wire-net annotation. One pin (acts like a wire join).
  LABEL: [{ x: 0, y: 0 }],
  // Note: visual-only canvas annotation. No electrical pins.
  NOTE: [],
  // X-instance default = 4 pins. The actual pin count + positions are
  // overridden per-component via `getPinLayout` based on `params.npins`
  // (so a single SUBX kind can host many-pin subcircuits without needing
  // a static map entry per arity).
  SUBX: [
    { x: -3, y: -1 },
    { x: -3, y: 1 },
    { x: 3, y: -1 },
    { x: 3, y: 1 },
  ],
};

/** Per-instance pin layout. Falls back to the static PIN_LAYOUTS for normal
 *  components; SUBX uses its `params.npins` to lay out pins around a
 *  rectangle (left side first, then right side). */
export function getPinLayout(
  c: CircuitComponent,
): { x: number; y: number }[] {
  if (c.kind !== "SUBX") return mirrorPinLayoutIfNeeded(PIN_LAYOUTS[c.kind], c.mirrored);
  const n = subcircuitPinCountForInstance(c);
  const leftCount = Math.ceil(n / 2);
  const rightCount = n - leftCount;
  const pinX = subcircuitBodyWidth(c) / 2 + 0.6;
  const bodyHeight = subcircuitBodyHeight(c);
  const startY = (count: number) => count <= 1 ? 0 : -((bodyHeight - 1.2) / 2);
  const stepY = (count: number) => count <= 1 ? 0 : (bodyHeight - 1.2) / (count - 1);
  const layout: { x: number; y: number }[] = [];
  for (let i = 0; i < leftCount; i++) {
    layout.push({ x: -pinX, y: startY(leftCount) + i * stepY(leftCount) });
  }
  for (let i = 0; i < rightCount; i++) {
    layout.push({ x: pinX, y: startY(rightCount) + i * stepY(rightCount) });
  }
  return mirrorPinLayoutIfNeeded(layout, c.mirrored);
}

function mirrorPinLayoutIfNeeded(
  layout: { x: number; y: number }[],
  mirrored: boolean | undefined,
): { x: number; y: number }[] {
  return mirrored ? layout.map((pin) => ({ x: -pin.x, y: pin.y })) : layout;
}

export function rotatePoint(
  p: { x: number; y: number },
  r: Rotation,
): { x: number; y: number } {
  switch (r) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

export function pinWorldPos(
  c: CircuitComponent,
  pinIdx: number,
): { x: number; y: number } {
  const pins = getPinLayout(c);
  const layout = pins[pinIdx] ?? { x: 0, y: 0 };
  const rotated = rotatePoint(layout, c.rotation);
  return { x: c.x + rotated.x, y: c.y + rotated.y };
}

export function pinLabelForKind(kind: ComponentKind, idx: number): string | null {
  switch (kind) {
    case "D":
      return ["A", "K"][idx] ?? null;
    case "V":
    case "B":
    case "I":
      return ["+", "-"][idx] ?? null;
    case "R":
    case "C":
    case "L":
      return ["1", "2"][idx] ?? null;
    case "OPAMP":
      return ["+", "-", "OUT"][idx] ?? null;
    case "NPN":
    case "PNP":
      return ["C", "B", "E"][idx] ?? null;
    case "NMOS":
    case "PMOS":
      return ["D", "G", "S"][idx] ?? null;
    case "NMOS4":
    case "PMOS4":
      return ["D", "G", "S", "B"][idx] ?? null;
    case "SUBX":
      return `P${idx + 1}`;
    default:
      return null;
  }
}

export function rotateNext(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultValue(kind: ComponentKind): string {
  switch (kind) {
    case "R":
      return "1k";
    case "V":
      return "5";
    case "B":
      return "V=sin(2*pi*1k*time)";
    case "I":
      return "1m";
    case "C":
      return "10n";
    case "L":
      return "10m";
    case "D":
      return "DMOD";
    case "NPN":
      return "BJTN";
    case "PNP":
      return "BJTP";
    case "NMOS":
    case "NMOS4":
      return "NCH";
    case "PMOS":
    case "PMOS4":
      return "PCH";
    case "OPAMP":
      return "OPAMP";
    case "LABEL":
      return "VOUT";
    case "NOTE":
      return "Note";
    case "SUBX":
      return "";
    case "GND":
      return "";
  }
}

export function refdesPrefix(kind: ComponentKind): string {
  switch (kind) {
    case "R":
    case "V":
    case "B":
    case "C":
    case "L":
    case "I":
    case "D":
      return kind;
    case "NPN":
    case "PNP":
      return "Q";
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return "M";
    case "OPAMP":
    case "SUBX":
      return "X";
    case "LABEL":
    case "NOTE":
    case "GND":
      return "";
  }
}

export const COMPONENT_LABELS: Record<ComponentKind, string> = {
  R: "Resistor",
  V: "Voltage source",
  B: "Behavioral source",
  I: "Current source",
  C: "Capacitor",
  L: "Inductor",
  D: "Diode",
  GND: "Ground",
  NPN: "NPN BJT",
  PNP: "PNP BJT",
  NMOS: "NMOS",
  PMOS: "PMOS",
  NMOS4: "NMOS 4-pin",
  PMOS4: "PMOS 4-pin",
  OPAMP: "Op-amp",
  LABEL: "Net label",
  NOTE: "Note",
  SUBX: "Subcircuit",
};

export const emptyDoc: CircuitDoc = (() => {
  const root = makePage("main");
  return {
    pages: [root],
    activePageId: root.id,
    directives: "",
    analysis: { kind: "op" },
  };
})();
