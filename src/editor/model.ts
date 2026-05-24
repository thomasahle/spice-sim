// Core circuit model. Coordinates are in grid cells; the renderer scales to px.

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
  | "OPAMP"
  | "LABEL"
  | "SUBX";

export type Rotation = 0 | 90 | 180 | 270;

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  x: number; // grid cell of component origin
  y: number;
  rotation: Rotation;
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

export function makePage(name: string): SchematicPage {
  return {
    id: makeId("page"),
    name,
    components: [],
    wires: [],
    probes: [],
  };
}

// Pin coordinates relative to component origin (before rotation).
// NPN/PNP/NMOS/PMOS pins are [collector|drain, base|gate, emitter|source].
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
  // Op-amp: pin[0]=V+ (non-inverting in), pin[1]=V- (inverting in), pin[2]=OUT
  OPAMP: [
    { x: -3, y: -1 },
    { x: -3, y: 1 },
    { x: 3, y: 0 },
  ],
  // Label: a wire-net annotation. One pin (acts like a wire join).
  LABEL: [{ x: 0, y: 0 }],
  // X-instance default = 4 pins. The actual pin count + positions are
  // overridden per-component via `getPinLayout` based on `params.npins`
  // (so a single SUBX kind can host 1..8-pin subcircuits without needing
  // a static map entry per arity).
  SUBX: [
    { x: -3, y: -1 },
    { x: -3, y: 1 },
    { x: 3, y: -1 },
    { x: 3, y: 1 },
  ],
};

/** Per-instance pin layout. Falls back to the static PIN_LAYOUTS for normal
 *  components; SUBX uses its `params.npins` to lay out 1..8 pins around a
 *  rectangle (left side first, then right side). */
export function getPinLayout(
  c: CircuitComponent,
): { x: number; y: number }[] {
  if (c.kind !== "SUBX") return PIN_LAYOUTS[c.kind];
  const raw = parseInt(c.params?.npins ?? "4", 10);
  const n = Math.max(1, Math.min(8, Number.isFinite(raw) ? raw : 4));
  const leftCount = Math.ceil(n / 2);
  const rightCount = n - leftCount;
  const layout: { x: number; y: number }[] = [];
  const startY = (count: number) => -((count - 1) * 1) / 2;
  for (let i = 0; i < leftCount; i++) {
    layout.push({ x: -3, y: startY(leftCount) + i });
  }
  for (let i = 0; i < rightCount; i++) {
    layout.push({ x: 3, y: startY(rightCount) + i });
  }
  return layout;
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
      return "NCH";
    case "PMOS":
      return "PCH";
    case "OPAMP":
      return "OPAMP";
    case "LABEL":
      return "VOUT";
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
      return "M";
    case "OPAMP":
    case "SUBX":
      return "X";
    case "LABEL":
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
  OPAMP: "Op-amp",
  LABEL: "Net label",
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
