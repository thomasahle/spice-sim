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
  /** Model C: pins[i] is this component's pin-node id (position = pinWorldPos(c, i)). */
  pins?: string[];
}

/** Model C electrical node: a junction, free wire end, or named-net point.
 *  Pin connection points are owned by components (CircuitComponent.pins). */
export interface CircuitNode {
  id: string;
  x: number;
  y: number;
  name?: string;
}

/** Model C: a wire is an EDGE between two nodes (`a`/`b` are node ids); `bends`
 *  are routing waypoints (geometry only). */
export interface Wire {
  id: string;
  a: string;
  b: string;
  bends: [number, number][];
}

export interface Probe {
  id: string;
  /** Legacy grid coordinate of the probed point (kept during migration). */
  x: number;
  y: number;
  /** Model C: the node this probe samples. */
  node?: string;
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
  /** Model C standalone nodes (junctions / free ends / named). Pin-nodes live on components. */
  nodes?: CircuitNode[];
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
  /** Persistence schema version. Absent / <2 ⇒ legacy v1 (polyline wires);
   *  >=2 ⇒ Model-C graph doc (wires are node edges). Stamped on save by the
   *  persistence layer; consumed by migrateToGraphDoc on load. */
  version?: number;
  /** Ordered pages; pages[0] is the root schematic (main netlist). Others emit as `.subckt`. */
  pages: SchematicPage[];
  /** Currently-edited page id. */
  activePageId: string;
  directives: string;
  analysis: AnalysisSpec;
  simSettings?: SimSettings;
}

/** Current graph-doc persistence schema version. */
export const GRAPH_DOC_VERSION = 2;

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
  return orderedSubcircuitPortComponents(page).map((component) => component.value.trim());
}

function orderedSubcircuitPortComponents(page: SchematicPage): CircuitComponent[] {
  const labels = page.components.filter(
    (component) => component.kind === "LABEL" && component.value.trim() !== "",
  );
  const hasExplicitPorts = labels.some((component) => component.params?.port === "1");
  return orderedLabelPorts(hasExplicitPorts
    ? labels.filter((component) => component.params?.port === "1")
    : labels);
}

export function subcircuitPortLabels(page: SchematicPage): string[] {
  return subcircuitPortComponents(page).map((component) => component.value.trim());
}

export function subcircuitPortComponents(page: SchematicPage): CircuitComponent[] {
  const labels: CircuitComponent[] = [];
  const seen = new Set<string>();
  for (const label of orderedSubcircuitPortComponents(page)) {
    const key = label.value.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

export function subcircuitPortCount(page: SchematicPage): number {
  return Math.min(MAX_SUBCIRCUIT_PINS, subcircuitPortLabels(page).length);
}

export function subcircuitInstanceParamsForPage(page: SchematicPage): Record<string, string> {
  const labels = subcircuitPortComponents(page).slice(0, MAX_SUBCIRCUIT_PINS);
  const sideHints = subcircuitPinSidesFromPorts(labels);
  return sideHints
    ? { npins: String(labels.length), pinSides: sideHints }
    : { npins: String(labels.length) };
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
  const counts = subcircuitPinSideCounts(component);
  const verticalPinsPerSide = Math.max(counts.L, counts.R);
  const horizontalPinsPerSide = Math.max(counts.T, counts.B);
  const verticalSideWidth = Math.min(8, 4.8 + Math.max(0, verticalPinsPerSide - 3) * 0.3);
  const horizontalSideWidth = Math.min(16, Math.max(4.8, horizontalPinsPerSide - 1 + 1.2));
  const pinCountWidth = Math.max(verticalSideWidth, horizontalSideWidth);
  const labelWidth = component.value.trim()
    ? estimateInlineMathTextWidth(component.value.trim()) * 0.6 + 0.84
    : 0;
  const minWidth = Math.min(16, Math.max(3.4, labelWidth));
  return clampFinite(raw, Math.max(pinCountWidth, minWidth), minWidth, 16);
}

export function subcircuitBodyHeight(component: CircuitComponent): number {
  const raw = Number(component.params?.h);
  const counts = subcircuitPinSideCounts(component);
  const sidePinAutoHeight = Math.max(counts.L, counts.R, 1) - 1 + 1.2;
  const topBottomAutoHeight = Math.max(counts.T, counts.B) > 0 ? 2.2 : 1.2;
  const autoHeight = Math.max(sidePinAutoHeight, topBottomAutoHeight);
  return clampFinite(raw, autoHeight, autoHeight, 24);
}

function subcircuitPinCountForInstance(component: CircuitComponent): number {
  const raw = parseInt(component.params?.npins ?? "4", 10);
  return Math.max(1, Math.min(MAX_SUBCIRCUIT_PINS, Number.isFinite(raw) ? raw : 4));
}

export function subcircuitPinSidesForInstance(component: CircuitComponent): string[] | null {
  const n = subcircuitPinCountForInstance(component);
  const raw = (component.params?.pinSides ?? "").trim().toUpperCase();
  if (raw.length < n || /[^LRTB]/.test(raw.slice(0, n))) return null;
  return raw.slice(0, n).split("");
}

export function effectiveSubcircuitPinSidesForInstance(component: CircuitComponent): string[] {
  const explicit = subcircuitPinSidesForInstance(component);
  if (explicit) return explicit;
  const n = subcircuitPinCountForInstance(component);
  const leftCount = Math.ceil(n / 2);
  return Array.from({ length: n }, (_, idx) => (idx < leftCount ? "L" : "R"));
}

function subcircuitPinSideCounts(component: CircuitComponent): Record<"L" | "R" | "T" | "B", number> {
  const n = subcircuitPinCountForInstance(component);
  const sides = effectiveSubcircuitPinSidesForInstance(component).slice(0, n);
  const counts = { L: 0, R: 0, T: 0, B: 0 };
  for (const side of sides) {
    counts[side as "L" | "R" | "T" | "B"]++;
  }
  return counts;
}

function subcircuitPinSidesFromPorts(ports: CircuitComponent[]): string | null {
  if (ports.length === 0) return null;
  const minX = Math.min(...ports.map((port) => port.x));
  const maxX = Math.max(...ports.map((port) => port.x));
  const minY = Math.min(...ports.map((port) => port.y));
  const maxY = Math.max(...ports.map((port) => port.y));
  if (Math.abs(maxX - minX) < 1e-9) {
    return ports.map((port) => portSideParam(port) ?? "L").join("");
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return ports.map((port) => {
    const explicit = portSideParam(port);
    if (explicit) return explicit;
    const dx = port.x - centerX;
    const dy = port.y - centerY;
    if (Math.abs(dy) > Math.abs(dx) * 1.15) return dy < 0 ? "T" : "B";
    return dx <= 0 ? "L" : "R";
  }).join("");
}

function portSideParam(component: CircuitComponent): "L" | "R" | "T" | "B" | null {
  const side = component.params?.portSide?.trim().toUpperCase();
  return side === "L" || side === "R" || side === "T" || side === "B" ? side : null;
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
  const sides = effectiveSubcircuitPinSidesForInstance(c);
  const counts = subcircuitPinSideCounts(c);
  const pinX = subcircuitBodyWidth(c) / 2 + 0.6;
  const bodyHeight = subcircuitBodyHeight(c);
  const bodyWidth = subcircuitBodyWidth(c);
  const pinY = bodyHeight / 2 + 0.6;
  const verticalStartY = (count: number) => count <= 1 ? 0 : -((bodyHeight - 1.2) / 2);
  const verticalStepY = (count: number) => count <= 1 ? 0 : (bodyHeight - 1.2) / (count - 1);
  const horizontalStartX = (count: number) => count <= 1 ? 0 : -((bodyWidth - 1.2) / 2);
  const horizontalStepX = (count: number) => count <= 1 ? 0 : (bodyWidth - 1.2) / (count - 1);
  const leftPins = Array.from({ length: counts.L }, (_, i) => ({
    x: -pinX,
    y: verticalStartY(counts.L) + i * verticalStepY(counts.L),
  }));
  const rightPins = Array.from({ length: counts.R }, (_, i) => ({
    x: pinX,
    y: verticalStartY(counts.R) + i * verticalStepY(counts.R),
  }));
  const topPins = Array.from({ length: counts.T }, (_, i) => ({
    x: horizontalStartX(counts.T) + i * horizontalStepX(counts.T),
    y: -pinY,
  }));
  const bottomPins = Array.from({ length: counts.B }, (_, i) => ({
    x: horizontalStartX(counts.B) + i * horizontalStepX(counts.B),
    y: pinY,
  }));
  const layout: { x: number; y: number }[] = [];
  const indexes = { L: 0, R: 0, T: 0, B: 0 };
  const pinsBySide = { L: leftPins, R: rightPins, T: topPins, B: bottomPins };
  for (let i = 0; i < n; i++) {
    const side = sides[i] as "L" | "R" | "T" | "B";
    layout.push(pinsBySide[side][indexes[side]++] ?? { x: 0, y: 0 });
  }
  return mirrorPinLayoutIfNeeded(layout, c.mirrored);
}

function mirrorPinLayoutIfNeeded(
  layout: { x: number; y: number }[],
  mirrored: boolean | undefined,
): { x: number; y: number }[] {
  // `mirrored` is a true geometric reflection across the local vertical axis
  // (x→−x). Transform composition (group rotate/flip) relies on this clean
  // dihedral meaning, so it is kept exact for every kind. The "swap a 2-pin
  // part's terminals in place" affordance is implemented separately as
  // rotation+=180 (see swapTwoPinTerminals), which for our left-right-symmetric
  // 2-pin symbols visibly trades the +/− ends while keeping both pins put.
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

export function rotatePrev(r: Rotation): Rotation {
  return ((r + 270) % 360) as Rotation;
}

// Swap a 2-pin part's two terminals *in place* (reverse polarity): for our
// left-right-symmetric 2-pin symbols (R/C/L/V/I/D), a 180° turn maps each pin
// onto the other's position, so the pin *set* is unchanged (attached wires stay
// put) while pin index 0↔1 and the +/− glyph marks swap ends. Returns the
// component unchanged for non-2-pin kinds. This keeps the `mirrored` flag a
// clean geometric reflection (needed by group transforms) while still giving
// Mirror/Flip a useful meaning on an isolated 2-pin part.
export function swapTwoPinTerminals(c: CircuitComponent): CircuitComponent {
  if (PIN_LAYOUTS[c.kind]?.length !== 2) return c;
  return { ...c, rotation: ((c.rotation + 180) % 360) as Rotation };
}

// Flipping a component about its horizontal axis (top↔bottom) is equivalent
// to toggling its vertical-axis mirror and replacing the rotation with
// (180 − rotation): a horizontal reflection F satisfies F = R₁₈₀ ∘ M, and
// M ∘ R_θ = R₋θ ∘ M, so F ∘ R_θ ∘ M_m = R₍₁₈₀₋θ₎ ∘ M_{!m}. (90° and 270°
// rotations are fixed points of this map; only the mirror flag flips.)
export function flipRotation(r: Rotation): Rotation {
  return ((180 - r + 360) % 360) as Rotation;
}

// Two-terminal passives that can be swapped in place from the inspector.
export const SWAPPABLE_PASSIVE_KINDS: ComponentKind[] = ["R", "C", "L"];

function pinAxisOf(kind: ComponentKind): "h" | "v" {
  const layout = PIN_LAYOUTS[kind];
  if (layout.length < 2) return "v";
  return Math.abs(layout[0].x - layout[1].x) >= Math.abs(layout[0].y - layout[1].y) ? "h" : "v";
}

// When swapping kinds, keep both pins at their current world positions so
// existing wires stay attached. R's default orientation is horizontal while
// C/L are vertical, so crossing that axis needs a 90° rotation bump.
export function rotationForKindSwap(
  from: ComponentKind,
  to: ComponentKind,
  rotation: Rotation,
): Rotation {
  return pinAxisOf(from) === pinAxisOf(to) ? rotation : rotateNext(rotation);
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
