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

import type { CircuitComponent, CircuitDoc, ComponentKind, SchematicPage, Wire } from "./model.ts";
import { getPinLayout, parsePortOrder, pinLabelForKind, pinWorldPos, refdesPrefix } from "./model.ts";
import {
  normalizeDeviceValue,
  normalizeLengthValue,
  normalizePassiveValue,
  normalizeSourceValue,
} from "./valueExpressions.ts";
import { isAcStimulus } from "./sourceValues.ts";
import { netLabelNearMisses, type NetLabelNearMiss } from "./netLabelConnections.ts";
import {
  modelTypesForKind,
  parseModelDefinitions,
  type ModelDeviceType,
} from "./modelPresets.ts";

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
  errors: string[];
  warnings: string[];
  floatingPins: FloatingPinDiagnostic[];
  modelDiagnostics: ModelDiagnostic[];
}

export interface FloatingPinDiagnostic {
  componentId: string;
  pinIdx: number;
  pinLabel?: string;
  refdes: string;
  node: string;
}

export interface ModelDiagnostic {
  pageId: string;
  componentId: string;
  refdes: string;
  modelName: string;
  requiredType: ModelDeviceType;
  definedTypes: ModelDeviceType[];
  warning: string;
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

function buildModelTypeIndex(directives: string): Map<string, Set<ModelDeviceType>> {
  const index = new Map<string, Set<ModelDeviceType>>();
  for (const kind of ["D", "NPN", "PNP", "NMOS", "PMOS"] as const) {
    addModelType(index, DEFAULT_MODEL_NAMES[kind]!, kind);
  }
  for (const model of parseModelDefinitions(directives)) {
    addModelType(index, model.name, model.type);
  }
  return index;
}

function addModelType(index: Map<string, Set<ModelDeviceType>>, name: string, type: ModelDeviceType): void {
  const key = name.trim().toLowerCase();
  if (!key) return;
  const types = index.get(key) ?? new Set<ModelDeviceType>();
  types.add(type);
  index.set(key, types);
}

function missingModelDiagnostic(
  modelTypesByName: Map<string, Set<ModelDeviceType>>,
  kind: ComponentKind,
  modelName: string,
  refdes: string,
  pageId: string,
  componentId: string,
): ModelDiagnostic | null {
  const requiredType = modelTypesForKind(kind)[0];
  const cleanName = modelName.trim();
  if (!requiredType || !cleanName) return null;
  const types = modelTypesByName.get(cleanName.toLowerCase());
  if (types?.has(requiredType)) return null;
  if (types && types.size > 0) {
    const definedTypes = [...types].sort();
    return {
      pageId,
      componentId,
      refdes,
      modelName: cleanName,
      requiredType,
      definedTypes,
      warning: `Model ${cleanName} is defined as ${definedTypes.join("/")} but ${refdes} needs ${requiredType}. Choose a compatible shared model or add a .model ${cleanName} ${requiredType} line.`,
    };
  }
  return {
    pageId,
    componentId,
    refdes,
    modelName: cleanName,
    requiredType,
    definedTypes: [],
    warning: `Model ${cleanName} is not defined for ${refdes}. Add a .model ${cleanName} ${requiredType} line or choose a shared ${requiredType} model.`,
  };
}

interface PageBuild {
  bodyLines: string[];
  modelLines: string[];
  warnings: string[];
  floatingPins: FloatingPinDiagnostic[];
  modelDiagnostics: ModelDiagnostic[];
  refdes: Map<string, string>;
  nodes: NodeMap;
  /** External pin names (subckt boundary nodes) — only meaningful when isSubckt=true. */
  externalPins: string[];
}

interface ExternalPinCandidate {
  name: string;
  x: number;
  y: number;
  order: number | null;
}

interface PageOpts {
  isSubckt: boolean;
  /** Global model set (subcircuits add to it; emitted once at the top of root). */
  usedModels: Set<ComponentKind>;
  /** Case-insensitive model names that will be present in the generated deck. */
  modelTypesByName: Map<string, Set<ModelDeviceType>>;
  /** Global refdes counters, namespaced for the root only. Subckts use local counters. */
  globalCounters?: Record<string, number>;
}

export function buildNetlist(doc: CircuitDoc): NetlistResult {
  const usedModels = new Set<ComponentKind>();
  const modelTypesByName = buildModelTypeIndex(doc.directives);
  const globalCounters: Record<string, number> = {};
  const errors: string[] = subcircuitCycleErrors(doc);
  const warnings: string[] = [];
  const floatingPins: FloatingPinDiagnostic[] = [];
  const modelDiagnostics: ModelDiagnostic[] = [];

  // Root page (pages[0]) — main netlist
  const root = doc.pages[0];
  const rootBuild = buildPageNetlist(root, {
    isSubckt: false,
    usedModels,
    modelTypesByName,
    globalCounters,
  });
  warnings.push(...rootBuild.warnings);
  floatingPins.push(...rootBuild.floatingPins);
  modelDiagnostics.push(...rootBuild.modelDiagnostics);
  const nonGroundComponents = root.components.filter((c) => c.kind !== "GND" && c.kind !== "LABEL" && c.kind !== "NOTE");
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
    const sub = buildPageNetlist(page, { isSubckt: true, usedModels, modelTypesByName });
    warnings.push(...sub.warnings.map((w) => `${page.name}: ${w}`));
    modelDiagnostics.push(...sub.modelDiagnostics.map((diagnostic) => ({
      ...diagnostic,
      warning: `${page.name}: ${diagnostic.warning}`,
    })));
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
    errors,
    warnings,
    floatingPins,
    modelDiagnostics,
  };
}

function subcircuitCycleErrors(doc: CircuitDoc): string[] {
  const subPages = doc.pages.slice(1);
  if (subPages.length === 0) return [];

  const byName = new Map<string, SchematicPage>();
  const bySpiceName = new Map<string, SchematicPage>();
  for (const page of subPages) {
    byName.set(page.name, page);
    bySpiceName.set(sanitizeNodeName(page.name), page);
  }

  const edges = new Map<string, string[]>();
  for (const page of subPages) {
    const targets: string[] = [];
    for (const component of page.components) {
      if (component.kind !== "SUBX") continue;
      const raw = component.value.trim();
      if (!raw) continue;
      const target = byName.get(raw) ?? bySpiceName.get(sanitizeNodeName(raw));
      if (!target) continue;
      targets.push(target.id);
    }
    edges.set(page.id, targets);
  }

  const pageName = (id: string) => subPages.find((page) => page.id === id)?.name ?? id;
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycleKeys = new Set<string>();
  const cycles: string[][] = [];

  function recordCycle(targetId: string) {
    const startIdx = stack.indexOf(targetId);
    if (startIdx < 0) return;
    const cycle = [...stack.slice(startIdx), targetId];
    const normalized = normalizeCycleKey(cycle);
    if (cycleKeys.has(normalized)) return;
    cycleKeys.add(normalized);
    cycles.push(cycle);
  }

  function visit(id: string) {
    const current = state.get(id);
    if (current === "done") return;
    if (current === "visiting") {
      recordCycle(id);
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const target of edges.get(id) ?? []) visit(target);
    stack.pop();
    state.set(id, "done");
  }

  for (const page of subPages) visit(page.id);

  return cycles.map((cycle) => {
    const path = cycle.map(pageName).join(" -> ");
    return `Subcircuit cycle detected: ${path}. SPICE subcircuits must be acyclic; remove or break this recursive instance chain before running.`;
  });
}

function normalizeCycleKey(cycle: string[]): string {
  const closed = cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]
    ? cycle.slice(0, -1)
    : [...cycle];
  if (closed.length === 0) return "";
  const rotations = closed.map((_, idx) => [
    ...closed.slice(idx),
    ...closed.slice(0, idx),
  ].join("\u0000"));
  rotations.sort();
  return rotations[0];
}

function buildPageNetlist(page: SchematicPage, opts: PageOpts): PageBuild {
  const dsu = new DSU();
  const warnings: string[] = [];
  const floatingPins: FloatingPinDiagnostic[] = [];
  const modelDiagnostics: ModelDiagnostic[] = [];
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
  // node name uses the label text. For subcircuit pages, labels marked as ports
  // become external (.subckt) pins; old schematics without explicit ports keep
  // treating every label as external for compatibility.
  const labelSentinel = (name: string) => `__LABEL:${name.trim().toLowerCase()}`;
  const labelNames = new Map<string, string>(); // sentinel → display name
  const labelVoltages = new Map<string, string>(); // sentinel → DC voltage for power-label nets
  const externalPins = new Map<string, ExternalPinCandidate>(); // for subcircuit boundary pins
  const hasExplicitPorts = isSubckt && page.components.some((c) => c.kind === "LABEL" && c.params?.port === "1");
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
    const isExternalPort = isSubckt && (!hasExplicitPorts || c.params?.port === "1");
    if (isExternalPort && !externalPins.has(sentinel)) {
      externalPins.set(sentinel, {
        name: sanitizeNodeName(lbl),
        x: wp.x,
        y: wp.y,
        order: parsePortOrder(c.params?.portOrder),
      });
    }
  }

  const rootToName = new Map<string, string>();
  rootToName.set(dsu.find(GND_KEY), "0");
  // Pre-assign label-named nodes. If two distinct labels sanitize to the
  // same base SPICE name (after the LaTeX/punctuation-aware sanitizer)
  // we suffix the later ones with `_2`, `_3`, … so they end up as
  // distinct nets, and we warn the user — the auto-suffix is a safety
  // net, not a substitute for clear labelling.
  const usedBaseNames = new Map<string, string>(); // base name → first label text
  for (const [sentinel, baseName] of labelNames) {
    const original = sentinel.replace(/^__LABEL:/, "");
    const root = dsu.find(sentinel);
    if (rootToName.has(root)) continue;
    let finalName = baseName;
    if (usedBaseNames.has(baseName) && usedBaseNames.get(baseName) !== original) {
      // Collision: invent a unique suffix that doesn't clash with anything
      // already in rootToName.
      let n = 2;
      while ([...rootToName.values()].includes(`${baseName}_${n}`)) n += 1;
      finalName = `${baseName}_${n}`;
      warnings.push(
        `Net labels "${usedBaseNames.get(baseName)}" and "${original}" both sanitize to "${baseName}" — using "${finalName}" for the second. Rename one to make the netlist unambiguous.`,
      );
    } else {
      usedBaseNames.set(baseName, original);
    }
    rootToName.set(root, finalName);
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
    if (c.kind !== "NOTE") continue;
    for (const line of noteCommentLines(c.value)) {
      lines.push(line);
    }
  }

  for (const c of page.components) {
    if (c.kind === "GND") {
      hasGround = true;
      continue;
    }
    if (c.kind === "LABEL" || c.kind === "NOTE") continue; // labels/notes are pure annotation
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
    lines.push(formatLayoutAnnotation(name, c));

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
        lines.push(
          `${name} ${n[0]} ${n[1]} ${normalizePassiveValue(v, "10n", "farad")}${formatInitialCondition(c.params?.IC)}`,
        );
        break;
      case "L":
        lines.push(`${name} ${n[0]} ${n[1]} ${normalizePassiveValue(v, "10m", "henry")}`);
        break;
      case "D": {
        const model = v || DEFAULT_MODEL_NAMES["D"]!;
        if (model === DEFAULT_MODEL_NAMES["D"]) opts.usedModels.add("D");
        const diagnostic = missingModelDiagnostic(opts.modelTypesByName, c.kind, model, name, page.id, c.id);
        if (diagnostic) {
          warnings.push(diagnostic.warning);
          modelDiagnostics.push(diagnostic);
        }
        lines.push(`${name} ${n[0]} ${n[1]} ${model}`);
        break;
      }
      case "NPN":
      case "PNP": {
        const def = DEFAULT_MODEL_NAMES[c.kind]!;
        const model = v || def;
        if (model === def) opts.usedModels.add(c.kind);
        const diagnostic = missingModelDiagnostic(opts.modelTypesByName, c.kind, model, name, page.id, c.id);
        if (diagnostic) {
          warnings.push(diagnostic.warning);
          modelDiagnostics.push(diagnostic);
        }
        const area = c.params?.area ? ` ${normalizeDeviceValue(c.params.area, "")}` : "";
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${model}${area}`);
        break;
      }
      case "NMOS":
      case "PMOS": {
        const deviceKind = c.kind === "PMOS" ? "PMOS" : "NMOS";
        const def = DEFAULT_MODEL_NAMES[deviceKind]!;
        const model = v || def;
        if (model === def) opts.usedModels.add(deviceKind);
        const diagnostic = missingModelDiagnostic(opts.modelTypesByName, deviceKind, model, name, page.id, c.id);
        if (diagnostic) {
          warnings.push(diagnostic.warning);
          modelDiagnostics.push(diagnostic);
        }
        const L = normalizeLengthValue(c.params?.L ?? "", "1u");
        const W = normalizeLengthValue(c.params?.W ?? "", "10u");
        // Body tied to source by default for the simple symbol.
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${model} L=${L} W=${W}`);
        break;
      }
      case "NMOS4":
      case "PMOS4": {
        const deviceKind = c.kind === "PMOS4" ? "PMOS" : "NMOS";
        const def = DEFAULT_MODEL_NAMES[deviceKind]!;
        const model = v || def;
        if (model === def) opts.usedModels.add(deviceKind);
        const diagnostic = missingModelDiagnostic(opts.modelTypesByName, deviceKind, model, name, page.id, c.id);
        if (diagnostic) {
          warnings.push(diagnostic.warning);
          modelDiagnostics.push(diagnostic);
        }
        const L = normalizeLengthValue(c.params?.L ?? "", "1u");
        const W = normalizeLengthValue(c.params?.W ?? "", "10u");
        lines.push(`${name} ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${model} L=${L} W=${W}`);
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
  const externalPinNames = new Set([...externalPins.values()].map((pin) => pin.name));
  for (const c of page.components) {
    if (c.kind === "GND" || c.kind === "LABEL" || c.kind === "NOTE") continue;
    const layout = getPinLayout(c);
    for (let i = 0; i < layout.length; i++) {
      const node = pinToNode.get(pinKey(c.id, i));
      if (!node || node === "0") continue;
      // Inside a subcircuit, a node that maps to an external pin is *not*
      // floating — it's a port. Skip those.
      if (isSubckt && externalPinNames.has(node)) continue;
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

  for (const nearMiss of netLabelNearMisses(page)) {
    warnings.push(formatNetLabelNearMissWarning(nearMiss, refdes, page));
  }

  return {
    bodyLines: lines,
    modelLines: [],
    refdes,
    nodes: { pinToNode, rootToName, posToNode },
    warnings,
    floatingPins,
    modelDiagnostics,
    externalPins: orderedExternalPins([...externalPins.values()]),
  };
}

function formatLayoutAnnotation(refdes: string, component: CircuitComponent): string {
  const fields = [
    `x=${formatLayoutNumber(component.x)}`,
    `y=${formatLayoutNumber(component.y)}`,
    `rot=${component.rotation}`,
  ];
  if (component.mirrored) fields.push("mirror=1");
  if (component.kind === "SUBX") {
    const w = layoutToken(component.params?.w);
    const h = layoutToken(component.params?.h);
    if (w) fields.push(`w=${w}`);
    if (h) fields.push(`h=${h}`);
  }
  return `* spice-sim-layout: ${refdes} ${fields.join(" ")}`;
}

function formatLayoutNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function layoutToken(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return trimmed.replace(/[\r\n]/g, "");
}

function formatNetLabelNearMissWarning(
  nearMiss: NetLabelNearMiss,
  refdes: Map<string, string>,
  page: SchematicPage,
): string {
  const distance = nearMiss.distance < 0.01 ? "<0.01" : nearMiss.distance.toFixed(2);
  const nearMissTarget = nearMiss.target;
  let targetLabel: string;
  if (nearMissTarget.kind === "pin") {
    const component = page.components.find((c) => c.id === nearMissTarget.componentId);
    const ref = refdes.get(nearMissTarget.componentId) ?? nearMissTarget.componentId;
    const pinLabel = component
      ? pinLabelForKind(component.kind, nearMissTarget.pinIdx)
      : null;
    targetLabel = `${ref} ${pinLabel ? `${pinLabel} pin` : `pin ${nearMissTarget.pinIdx + 1}`}`;
  } else {
    targetLabel = `wire ${nearMissTarget.wireId}`;
  }
  return `Net label "${nearMiss.label}" is ${distance} grid units from ${targetLabel} but is not connected; move the label anchor onto the target to connect it.`;
}

function noteCommentLines(value: string): string[] {
  const lines = value.trimEnd().split(/\r?\n/).map((line) => line.trimEnd());
  if (lines.length === 0 || lines.every((line) => line.trim() === "")) return [];
  return lines.map((line) => `* Note: ${line.replace(/\*\//g, "* /")}`);
}

function orderedExternalPins(pins: ExternalPinCandidate[]): string[] {
  if (pins.length === 0) return [];
  const centerX = pins.reduce((sum, pin) => sum + pin.x, 0) / pins.length;
  return [...pins]
    .sort((a, b) => {
      if (a.order !== null || b.order !== null) {
        if (a.order === null) return 1;
        if (b.order === null) return -1;
        if (a.order !== b.order) return a.order - b.order;
      }
      const sideA = a.x <= centerX ? 0 : 1;
      const sideB = b.x <= centerX ? 0 : 1;
      if (sideA !== sideB) return sideA - sideB;
      if (Math.abs(a.y - b.y) > 1e-9) return a.y - b.y;
      if (Math.abs(a.x - b.x) > 1e-9) return a.x - b.x;
      return a.name.localeCompare(b.name);
    })
    .map((pin) => pin.name);
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
  // Distinct user labels must map to distinct SPICE names — the generic
  // catch-all alone would silently merge labels (e.g. `W+` and `W-` both
  // → `W_`). LaTeX-aware cleanups first (so future KaTeX-rendered labels
  // like `\Delta V` or `W_{+}` keep readable SPICE names), then map +/-
  // to distinct sequences, then strip everything else.
  let out = normalizeMathLabelForNodeName(s)
    .replace(/\\([A-Za-z]+)/g, "$1") // LaTeX commands: \Delta → Delta
    .replace(/[{}]/g, "") // drop braces from subscripts: W_{+} → W_+
    .replace(/\^/g, "") // drop ^ superscript markers
    .replace(/\+/g, "_p")
    .replace(/-/g, "_n")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_") // collapse runs of underscores
    .replace(/^_+|_+$/g, ""); // trim leading/trailing underscores
  // SPICE doesn't like names starting with a digit; prefix one if so.
  if (/^[0-9]/.test(out)) out = "n_" + out;
  return out || "node";
}

function normalizeMathLabelForNodeName(input: string): string {
  let out = input;
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out
      .replace(/\\(?:mathrm|text|operatorname|mathbf|mathit|mathsf)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\mathbb\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\dot\s*\{([^{}]*)\}/g, "$1_dot")
      .replace(/\\ddot\s*\{([^{}]*)\}/g, "$1_ddot")
      .replace(/\\hat\s*\{([^{}]*)\}/g, "$1_hat")
      .replace(/\\(?:bar|overline)\s*\{([^{}]*)\}/g, "$1_bar")
      .replace(/\\tilde\s*\{([^{}]*)\}/g, "$1_tilde")
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1_over_$2")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt_$1");
  }
  return out
    .replace(/\\(?:left|right)\s*\\?[()[\]{}|.]?/g, "_")
    .replace(/\\dot/g, "_dot")
    .replace(/\\ddot/g, "_ddot");
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

function formatInitialCondition(value: string | undefined): string {
  const normalized = normalizeDeviceValue(value ?? "", "");
  return normalized ? ` IC=${normalized}` : "";
}
