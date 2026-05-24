// Convert the editor's CircuitDoc into a SPICE netlist string.
//
// Nodes are derived from grid coordinates: any pin or wire vertex at the same
// (x,y) is the same node; wire polylines union all of their vertices; probes
// component pins, probes, and other wire endpoints that sit along a wire
// segment are also mapped onto that node; any node containing a GND pin
// becomes node "0" (SPICE ground).
//
// Models for D / NPN / PNP / NMOS / PMOS are auto-emitted with sane defaults
// when the user hasn't supplied a custom model name in the component value.

import type { CircuitDoc, ComponentKind, SchematicPage, Wire } from "./model.ts";
import { getPinLayout, pinLabelForKind, pinWorldPos, refdesPrefix } from "./model.ts";
import {
  normalizeDeviceValue,
  normalizeLengthValue,
  normalizePassiveValue,
  normalizeSourceValue,
} from "./valueExpressions.ts";
import { isAcStimulus } from "./sourceValues.ts";

const GND_KEY = "__GND__";

function key(x: number, y: number): string {
  return `${coordKey(x)},${coordKey(y)}`;
}

export function coordKey(v: number): string {
  const rounded = Math.round(v * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : `${rounded}`;
}

class DSU {
  parent = new Map<string, string>();
  ensure(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k: string): string {
    this.ensure(k);
    let p = this.parent.get(k)!;
    while (p !== this.parent.get(p)!) {
      const gp = this.parent.get(this.parent.get(p)!)!;
      this.parent.set(p, gp);
      p = gp;
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface NodeMap {
  pinToNode: Map<string, string>;
  rootToName: Map<string, string>;
  /** Maps "x,y" grid coord → resolved node name. Useful for probes. */
  posToNode: Map<string, string>;
}

export interface NetlistResult {
  netlist: string;
  nodes: NodeMap;
  refdes: Map<string, string>;
  warnings: string[];
  floatingPins: FloatingPinDiagnostic[];
}

export interface FloatingPinDiagnostic {
  componentId: string;
  pinIdx: number;
  pinLabel?: string;
  refdes: string;
  node: string;
}

function pinKey(componentId: string, pinIdx: number): string {
  return `${componentId}#${pinIdx}`;
}

const DEFAULT_MODELS: Record<string, string> = {
  D: ".model DMOD D",
  NPN: ".model BJTN NPN",
  PNP: ".model BJTP PNP",
  NMOS: ".model NCH NMOS (LEVEL=1 VTO=0.5 KP=2e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02)",
  PMOS: ".model PCH PMOS (LEVEL=1 VTO=-0.5 KP=1e-5 GAMMA=0 PHI=0.6 LAMBDA=0.02)",
  OPAMP: `.subckt OPAMP plus minus out
* Single-pole op-amp: gain 1e5, output impedance 100 Ω
Egain int 0 plus minus 1e5
Rout int out 100
.ends OPAMP`,
};

const DEFAULT_MODEL_NAMES: Partial<Record<ComponentKind, string>> = {
  D: "DMOD",
  NPN: "BJTN",
  PNP: "BJTP",
  NMOS: "NCH",
  PMOS: "PCH",
  OPAMP: "OPAMP",
};

interface PageBuild {
  bodyLines: string[];
  modelLines: string[];
  warnings: string[];
  floatingPins: FloatingPinDiagnostic[];
  refdes: Map<string, string>;
  nodes: NodeMap;
  /** External pin names (subckt boundary nodes) — only meaningful when isSubckt=true. */
  externalPins: string[];
}

interface PageOpts {
  isSubckt: boolean;
  /** Global model set (subcircuits add to it; emitted once at the top of root). */
  usedModels: Set<ComponentKind>;
  /** Global refdes counters, namespaced for the root only. Subckts use local counters. */
  globalCounters?: Record<string, number>;
}

export function buildNetlist(doc: CircuitDoc): NetlistResult {
  const usedModels = new Set<ComponentKind>();
  const globalCounters: Record<string, number> = {};
  const warnings: string[] = [];
  const floatingPins: FloatingPinDiagnostic[] = [];

  // Root page (pages[0]) — main netlist
  const root = doc.pages[0];
  const rootBuild = buildPageNetlist(root, {
    isSubckt: false,
    usedModels,
    globalCounters,
  });
  warnings.push(...rootBuild.warnings);
  floatingPins.push(...rootBuild.floatingPins);
  const nonGroundComponents = root.components.filter((c) => c.kind !== "GND" && c.kind !== "LABEL");
  const nonGroundNodeCount = countNonGroundNodes(rootBuild.nodes);
  if (nonGroundComponents.length > 0 && hasGroundComponent(root) && nonGroundNodeCount === 0) {
    warnings.push(
      "All component pins resolve to ground. Check for a shorted source or wires that tie every terminal to GND.",
    );
  }
  if (doc.analysis.kind === "ac" && !hasAcExcitation(root)) {
    warnings.push(
      "AC sweep has no AC source. Set a voltage or current source waveform to AC so the sweep has a stimulus.",
    );
  }
  if (doc.analysis.kind === "dc") {
    const sourceWarning = sweepSourceWarning(root, rootBuild.refdes, doc.analysis.src, "DC sweep");
    if (sourceWarning) warnings.push(sourceWarning);
  }
  if (doc.analysis.kind === "noise") {
    const sourceWarning = sweepSourceWarning(root, rootBuild.refdes, doc.analysis.src, "Noise analysis");
    if (sourceWarning) warnings.push(sourceWarning);
  }

  // Other pages — emitted as `.subckt NAME pins... .ends`
  const subLines: string[] = [];
  for (const page of doc.pages.slice(1)) {
    const sub = buildPageNetlist(page, { isSubckt: true, usedModels });
    warnings.push(...sub.warnings.map((w) => `${page.name}: ${w}`));
    const subName = sanitizeNodeName(page.name);
    if (sub.externalPins.length === 0) {
      warnings.push(
        `subcircuit ${page.name} has no external pins (add Net Label components to define ports).`,
      );
    }
    subLines.push(`.subckt ${subName} ${sub.externalPins.join(" ")}`);
    subLines.push(...sub.bodyLines);
    subLines.push(`.ends ${subName}`);
  }

  // Models — auto-emitted defaults, only once at the top
  const modelLines: string[] = [];
  for (const k of usedModels) modelLines.push(DEFAULT_MODELS[k]);

  const header = "* Spice Sim generated netlist\n";
  const userDirectives = doc.directives.trim();
  // Emit .options derived from simSettings (temperature, method, UIC,
  // user-typed extras). Keeps the user's directives panel separate from the
  // structured Simulation Settings panel.
  const settings = doc.simSettings;
  const optionParts: string[] = [];
  if (settings?.temperature && settings.temperature.trim() !== "") {
    optionParts.push(`temp=${settings.temperature.trim()}`);
  }
  if (settings?.method && settings.method.trim() !== "") {
    optionParts.push(`method=${settings.method.trim()}`);
  }
  if (settings?.options && settings.options.trim() !== "") {
    optionParts.push(settings.options.trim());
  }
  const settingsLines: string[] = [];
  if (optionParts.length > 0) settingsLines.push(`.options ${optionParts.join(" ")}`);
  // UIC is a suffix on the .tran command and applied at analysis-emission
  // time on the Rust side, not as a directive. Skipped here.

  const body =
    rootBuild.bodyLines.join("\n") +
    (modelLines.length ? "\n" + modelLines.join("\n") : "") +
    (subLines.length ? "\n\n" + subLines.join("\n") : "") +
    (settingsLines.length ? "\n" + settingsLines.join("\n") : "") +
    (userDirectives ? "\n" + userDirectives : "") +
    "\n";

  return {
    netlist: header + body,
    nodes: rootBuild.nodes,
    refdes: rootBuild.refdes,
    warnings,
    floatingPins,
  };
}

function buildPageNetlist(page: SchematicPage, opts: PageOpts): PageBuild {
  const dsu = new DSU();
  const warnings: string[] = [];
  const floatingPins: FloatingPinDiagnostic[] = [];
  const isSubckt = opts.isSubckt;

  const compPinKeys: { compId: string; pinIdx: number; posKey: string }[] = [];
  for (const c of page.components) {
    const pins = getPinLayout(c);
    for (let i = 0; i < pins.length; i++) {
      const wp = pinWorldPos(c, i);
      const k = key(wp.x, wp.y);
      dsu.ensure(k);
      compPinKeys.push({ compId: c.id, pinIdx: i, posKey: k });
    }
  }

  for (const w of page.wires) {
    if (w.points.length < 2) continue;
    let prev: string | null = null;
    for (const [x, y] of w.points) {
      const k = key(x, y);
      dsu.ensure(k);
      if (prev !== null) dsu.union(prev, k);
      prev = k;
    }
  }
  unionWirePointsOnWireSegments(page.wires, dsu);

  for (const cp of compPinKeys) {
    const [px, py] = parseCoordKey(cp.posKey);
    for (const w of page.wires) {
      for (let idx = 0; idx < w.points.length - 1; idx++) {
        const [x1, y1] = w.points[idx];
        const [x2, y2] = w.points[idx + 1];
        if (!pointOnSegment(px, py, x1, y1, x2, y2)) continue;
        dsu.union(cp.posKey, key(x1, y1));
        dsu.union(cp.posKey, key(x2, y2));
      }
    }
  }

  for (const probe of page.probes) {
    const probeKey = key(probe.x, probe.y);
    for (const w of page.wires) {
      for (let idx = 0; idx < w.points.length - 1; idx++) {
        const [x1, y1] = w.points[idx];
        const [x2, y2] = w.points[idx + 1];
        if (!pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) continue;
        dsu.ensure(probeKey);
        dsu.union(probeKey, key(x1, y1));
        dsu.union(probeKey, key(x2, y2));
      }
    }
  }

  dsu.ensure(GND_KEY);
  for (const c of page.components) {
    if (c.kind !== "GND") continue;
    const wp = pinWorldPos(c, 0);
    dsu.union(key(wp.x, wp.y), GND_KEY);
  }

  // Net labels: union pin position with a sentinel keyed by the label value so
  // multiple LABEL components with the same value share a node and the chosen
  // node name uses the label text. For subcircuit pages, label names also
  // become the external (.subckt) pin names.
  const labelSentinel = (name: string) => `__LABEL:${name.trim().toLowerCase()}`;
  const labelNames = new Map<string, string>(); // sentinel → display name
  const labelVoltages = new Map<string, string>(); // sentinel → DC voltage for power-label nets
  const externalPinSet = new Set<string>(); // for subcircuit boundary pins
  for (const c of page.components) {
    if (c.kind !== "LABEL") continue;
    const lbl = c.value.trim();
    if (!lbl) continue;
    const sentinel = labelSentinel(lbl);
    dsu.ensure(sentinel);
    labelNames.set(sentinel, sanitizeNodeName(lbl));
    const labelVoltage = parsePowerLabelVoltage(lbl);
    if (!isSubckt && labelVoltage) labelVoltages.set(sentinel, labelVoltage);
    const wp = pinWorldPos(c, 0);
    dsu.union(key(wp.x, wp.y), sentinel);
    if (isSubckt) externalPinSet.add(sanitizeNodeName(lbl));
  }

  const rootToName = new Map<string, string>();
  rootToName.set(dsu.find(GND_KEY), "0");
  // Pre-assign label-named nodes.
  for (const [sentinel, name] of labelNames) {
    const root = dsu.find(sentinel);
    if (!rootToName.has(root)) rootToName.set(root, name);
  }
  let nodeCounter = 1;
  for (const cp of compPinKeys) {
    const r = dsu.find(cp.posKey);
    if (!rootToName.has(r)) rootToName.set(r, `n${nodeCounter++}`);
  }

  const pinToNode = new Map<string, string>();
  for (const cp of compPinKeys) {
    pinToNode.set(
      pinKey(cp.compId, cp.pinIdx),
      rootToName.get(dsu.find(cp.posKey))!,
    );
  }
  const posToNode = new Map<string, string>();
  for (const [k] of dsu.parent) {
    if (k === GND_KEY) continue;
    const root = dsu.find(k);
    const name = rootToName.get(root);
    if (name) posToNode.set(k, name);
  }

  // Refdes assignment + lines emission. Root uses shared global counters so
  // the model can also have R/V from subcircuits later if extended; each
  // subcircuit uses local counters (refdes is scoped inside .subckt blocks).
  const refdes = new Map<string, string>();
  const counters: Record<string, number> = isSubckt ? {} : (opts.globalCounters ?? {});
  const lines: string[] = [];
  let hasGround = false;

  for (const [sentinel, voltage] of labelVoltages) {
    const node = rootToName.get(dsu.find(sentinel));
    if (!node || node === "0") continue;
    counters.V = (counters.V ?? 0) + 1;
    lines.push(`V${counters.V} ${node} 0 DC ${voltage}`);
  }

  for (const c of page.components) {
    if (c.kind === "GND") {
      hasGround = true;
      continue;
    }
    if (c.kind === "LABEL") continue; // labels are pure annotation
    const prefix = refdesPrefix(c.kind);
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const name = `${prefix}${counters[prefix]}`;
    refdes.set(c.id, name);

    const layout = getPinLayout(c);
    const n: string[] = [];
    for (let i = 0; i < layout.length; i++) {
      n.push(pinToNode.get(pinKey(c.id, i)) ?? "0");
    }
    const v = c.value || "";

    switch (c.kind) {
      case "R":
        lines.push(`${name} ${n[0]} ${n[1]} ${normalizePassiveValue(v, "1k", "ohm")}`);
        break;
      case "V":
        lines.push(`${name} ${n[0]} ${n[1]} ${formatVSource(v)}`);
        break;
      case "B":
        lines.push(`${name} ${n[0]} ${n[1]} ${formatBehavioralSource(v)}`);
        break;
      case "I":
        lines.push(`${name} ${n[0]} ${n[1]} ${formatISource(v)}`);
        break;
      case "C":
        lines.push(`${name} ${n[0]} ${n[1]} ${normalizePassiveValue(v, "10n", "farad")}`);
        break;
      case "L":
        lines.push(`${name} ${n[0]} ${n[1]} ${normalizePassiveValue(v, "10m", "henry")}`);
        break;
      case "D": {
        const model = v || DEFAULT_MODEL_NAMES["D"]!;
        if (model === DEFAULT_MODEL_NAMES["D"]) opts.usedModels.add("D");
        lines.push(`${name} ${n[0]} ${n[1]} ${model}`);
        break;
      }
      case "NPN":
      case "PNP": {
        const def = DEFAULT_MODEL_NAMES[c.kind]!;
        const model = v || def;
        if (model === def) opts.usedModels.add(c.kind);
        const area = c.params?.area ? ` ${normalizeDeviceValue(c.params.area, "")}` : "";
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${model}${area}`);
        break;
      }
      case "NMOS":
      case "PMOS": {
        const def = DEFAULT_MODEL_NAMES[c.kind]!;
        const model = v || def;
        if (model === def) opts.usedModels.add(c.kind);
        const L = normalizeLengthValue(c.params?.L ?? "", "1u");
        const W = normalizeLengthValue(c.params?.W ?? "", "10u");
        // Body tied to source by default for the simple symbol.
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${model} L=${L} W=${W}`);
        break;
      }
      case "OPAMP": {
        const model = v || DEFAULT_MODEL_NAMES["OPAMP"]!;
        if (model === DEFAULT_MODEL_NAMES["OPAMP"]) opts.usedModels.add("OPAMP");
        // n[0]=V+, n[1]=V-, n[2]=OUT
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${model}`);
        break;
      }
      case "SUBX": {
        // Subcircuit instance: pin nodes in order, then subckt name as model.
        const model = v.trim() || "UNDEFINED";
        lines.push(`${name} ${n.join(" ")} ${model}`);
        break;
      }
    }
  }

  // Warnings: skip the "no ground" warning inside subcircuits (subcircuits
  // are referenced to the parent's ground; they don't need their own GND).
  if (!isSubckt && !hasGround && page.components.length > 0) {
    warnings.push(
      "No ground (GND) symbol — ngspice may pick an arbitrary reference.",
    );
  }
  // Floating-pin detection
  const pinCountByNode = new Map<string, number>();
  for (const node of pinToNode.values()) {
    pinCountByNode.set(node, (pinCountByNode.get(node) ?? 0) + 1);
  }
  for (const c of page.components) {
    if (c.kind === "GND") continue;
    const layout = getPinLayout(c);
    for (let i = 0; i < layout.length; i++) {
      const node = pinToNode.get(pinKey(c.id, i));
      if (!node || node === "0") continue;
      // Inside a subcircuit, a node that maps to an external pin is *not*
      // floating — it's a port. Skip those.
      if (isSubckt && externalPinSet.has(node)) continue;
      if ((pinCountByNode.get(node) ?? 0) < 2) {
        const ref = refdes.get(c.id) ?? c.id;
        const label = pinLabelForKind(c.kind, i);
        const displayPin = label ? `${label} pin` : `pin ${i + 1}`;
        warnings.push(
          `${ref} ${displayPin} is floating (node ${node}).`,
        );
        floatingPins.push({
          componentId: c.id,
          pinIdx: i,
          pinLabel: label ?? undefined,
          refdes: ref,
          node,
        });
      }
    }
  }

  return {
    bodyLines: lines,
    modelLines: [],
    refdes,
    nodes: { pinToNode, rootToName, posToNode },
    warnings,
    floatingPins,
    externalPins: [...externalPinSet],
  };
}

function unionWirePointsOnWireSegments(wires: Wire[], dsu: DSU) {
  const points: [number, number][] = [];
  for (const wire of wires) {
    for (const point of wire.points) points.push(point);
  }

  for (const [px, py] of points) {
    const pointKey = key(px, py);
    for (const wire of wires) {
      for (let idx = 0; idx < wire.points.length - 1; idx++) {
        const [x1, y1] = wire.points[idx];
        const [x2, y2] = wire.points[idx + 1];
        if (!pointOnSegment(px, py, x1, y1, x2, y2)) continue;
        dsu.union(pointKey, key(x1, y1));
        dsu.union(pointKey, key(x2, y2));
      }
    }
  }
}

function sanitizeNodeName(s: string): string {
  // SPICE node names should avoid spaces and reserved punctuation.
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function parsePowerLabelVoltage(label: string): string | null {
  const normalized = label.trim().replace(/\s+/g, "");
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(p|n|u|µ|m|k|meg|g)?v$/i);
  if (!match) return null;
  const magnitude = Number.parseFloat(match[1]);
  if (!Number.isFinite(magnitude)) return null;
  const suffix = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = {
    "": 1,
    p: 1e-12,
    n: 1e-9,
    u: 1e-6,
    "µ": 1e-6,
    m: 1e-3,
    k: 1e3,
    meg: 1e6,
    g: 1e9,
  };
  const value = magnitude * (multipliers[suffix] ?? 1);
  return Number.isInteger(value) ? String(value) : value.toPrecision(12).replace(/0+$/, "").replace(/\.$/, "");
}

function pointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-6;
}

function parseCoordKey(posKey: string): [number, number] {
  const [x, y] = posKey.split(",").map(Number);
  return [x, y];
}

function hasGroundComponent(page: SchematicPage): boolean {
  return page.components.some((c) => c.kind === "GND");
}

function countNonGroundNodes(nodes: NodeMap): number {
  let count = 0;
  for (const name of nodes.rootToName.values()) {
    if (name !== "0") count += 1;
  }
  return count;
}

function hasAcExcitation(page: SchematicPage): boolean {
  return page.components.some(
    (c) => (c.kind === "V" || c.kind === "I") && isAcStimulus(c.value),
  );
}

function sweepSourceWarning(
  page: SchematicPage,
  refdes: Map<string, string>,
  sourceName: string,
  analysisName: string,
): string | null {
  const sources = page.components
    .filter((c) => c.kind === "V" || c.kind === "I")
    .map((c) => refdes.get(c.id))
    .filter((name): name is string => Boolean(name));
  if (sources.length === 0) {
    return `${analysisName} has no voltage or current source to sweep. Add a source before running.`;
  }
  const requested = sourceName.trim().toLowerCase();
  if (!sources.some((name) => name.toLowerCase() === requested)) {
    return `${analysisName} source ${sourceName || "(blank)"} is not in this schematic. Select one of: ${sources.join(", ")}.`;
  }
  return null;
}

// Parse a V source value: accept "5", "DC 5", "AC 1", "SIN(0 1 1k)", "PULSE(...)" etc.
function formatVSource(v: string): string {
  const trimmed = normalizeSourceValue(v, "DC 0");
  if (!trimmed) return "DC 0";
  // If it already starts with a SPICE keyword, leave it.
  if (/^(DC|AC|SIN|COS|PULSE|EXP|PWL|SFFM)\b/i.test(trimmed)) return trimmed;
  // Bare number → assume DC
  if (/^[-+0-9.]/.test(trimmed)) return `DC ${trimmed}`;
  return trimmed;
}

function formatISource(v: string): string {
  const trimmed = normalizeSourceValue(v, "DC 1m");
  if (!trimmed) return "DC 1m";
  if (/^(DC|AC|SIN|COS|PULSE|EXP|PWL|SFFM)\b/i.test(trimmed)) return trimmed;
  if (/^[-+0-9.]/.test(trimmed)) return `DC ${trimmed}`;
  return trimmed;
}

function formatBehavioralSource(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "V=0";
  if (/^[VI]\s*=/i.test(trimmed)) return trimmed;
  return `V=${trimmed}`;
}
