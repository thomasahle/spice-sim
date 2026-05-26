import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
} from "elkjs/lib/elk-api.js";
import {
  type AnalysisSpec,
  type CircuitComponent,
  type CircuitDoc,
  type ComponentKind,
  type Rotation,
  emptyDoc,
  getPinLayout,
  makeId,
  MAX_SUBCIRCUIT_PINS,
  pinWorldPos,
  rotatePoint,
} from "./model.ts";
import {
  componentBoundsFor,
  normalizeCoord,
} from "./geometry.ts";
import { routeWireSegmentAvoiding } from "./placement.ts";

interface ImportedPart {
  name: string;
  kind: ComponentKind;
  value: string;
  nodes: string[];
  params?: Record<string, string>;
  layout?: ImportLayoutAnnotation;
}

interface ImportLayoutAnnotation {
  x?: number;
  y?: number;
  rotation?: Rotation;
  mirrored?: boolean;
  params?: Record<string, string>;
}

interface ParsedSubckt {
  name: string;
  pins: string[];
  lines: string[];
}

interface ParsedLines {
  parts: ImportedPart[];
  directives: string[];
  analysis: AnalysisSpec | null;
  modelTypes: Map<string, string>;
}

export interface NetlistImportResult {
  doc: CircuitDoc;
  warnings: string[];
  /** True when ELK auto-layout was skipped — components were placed in a
   *  grid and connectivity is expressed entirely through net labels.
   *  Set when the caller chose label-only mode upfront or aborted ELK. */
  labelOnly?: boolean;
}

export interface NetlistImportOptions {
  /** Abort an in-flight ELK auto-layout (or the wire-routing phase that
   *  runs after it on the main thread). When aborted, the layout falls
   *  back to the label-only grid placement. */
  signal?: AbortSignal;
  /** "auto" → run ELK auto-layout (default).
   *  "labels" → skip ELK entirely; place components on a grid and rely
   *             on net labels for connectivity. Much faster on large
   *             netlists; visually messier. */
  mode?: "auto" | "labels";
  /** Called as the import advances through phases. The modal uses this
   *  to keep the spinner copy informative when the work hops between the
   *  worker and the main thread. */
  onPhase?: (phase: ImportPhase, detail?: ImportPhaseDetail) => void;
}

export type ImportPhase = "layout" | "routing";
export interface ImportPhaseDetail {
  /** For "routing": index of the net currently being routed (0-based). */
  current?: number;
  /** Total nets to route. */
  total?: number;
}

export type ImportNetKind =
  | "ground"
  | "global"
  | "external-port"
  | "local"
  | "junction"
  | "high-fanout"
  | "single-pin";

export interface ImportPinIr {
  partName: string;
  pinIdx: number;
  node: string;
}

export interface ImportPartIr {
  name: string;
  kind: ComponentKind;
  value: string;
  nodes: string[];
  params?: Record<string, string>;
  layout?: ImportLayoutAnnotation;
}

export interface ImportNetIr {
  name: string;
  kind: ImportNetKind;
  pins: ImportPinIr[];
  isExternalPort: boolean;
}

export interface ImportPageIr {
  name: string;
  pins: string[];
  parts: ImportPartIr[];
  nets: ImportNetIr[];
  directives: string[];
  analysis: AnalysisSpec | null;
  modelTypes: Record<string, string>;
}

export interface NetlistImportIr {
  root: ImportPageIr;
  subcircuits: ImportPageIr[];
  directives: string[];
  analysis: AnalysisSpec;
}

export async function importNetlist(
  text: string,
  opts: NetlistImportOptions = {},
): Promise<NetlistImportResult> {
  const { ir, warnings } = parseNetlistImportIr(text);

  let labelOnly = false;
  const layoutOpts = {
    signal: opts.signal,
    mode: opts.mode ?? "auto",
    onPhase: opts.onPhase,
  } as const;

  // Root page: run the requested layout; on abort, transparently fall back
  // to label-only so the user still gets a doc out of the import. The
  // retry intentionally drops the signal — once aborted the same signal
  // would refuse the second attempt too, leaving the user with nothing.
  let rootLayout;
  try {
    rootLayout = await layoutImportedPage(ir.root, layoutOpts);
  } catch (e) {
    if (isAbortError(e)) {
      labelOnly = true;
      rootLayout = await layoutImportedPage(ir.root, {
        mode: "labels",
        onPhase: opts.onPhase,
      });
    } else {
      throw e;
    }
  }

  if (!rootLayout.components.some((c) => c.kind === "GND")) {
    warnings.push("Imported netlist has no node 0 reference in supported elements.");
  }

  const root = {
    ...emptyDoc.pages[0],
    id: makeId("page"),
    name: "main",
    description: "",
    components: rootLayout.components,
    wires: rootLayout.wires,
    probes: [],
  };

  const subPages = [];
  const subLayoutMode = labelOnly ? "labels" : layoutOpts.mode;
  for (const subckt of ir.subcircuits) {
    let layout;
    try {
      layout = await layoutImportedPage(subckt, { ...layoutOpts, mode: subLayoutMode });
    } catch (e) {
      if (isAbortError(e)) {
        labelOnly = true;
        // Drop signal: same reason as the root-page retry above.
        layout = await layoutImportedPage(subckt, {
          mode: "labels",
          onPhase: opts.onPhase,
        });
      } else {
        throw e;
      }
    }
    subPages.push({
      ...emptyDoc.pages[0],
      id: makeId("page"),
      name: sanitizeSubcktName(subckt.name),
      description: "",
      components: layout.components,
      wires: layout.wires,
      probes: [],
    });
  }

  if (labelOnly) {
    warnings.push(
      "Auto-layout skipped: components were placed on a grid and connectivity is shown via net labels. Run Auto arrange to reflow when you have time.",
    );
  }

  return {
    doc: {
      pages: [root, ...subPages],
      activePageId: root.id,
      directives: ir.directives.join("\n"),
      analysis: ir.analysis,
      simSettings: emptyDoc.simSettings,
    },
    warnings,
    labelOnly: labelOnly || layoutOpts.mode === "labels" ? true : undefined,
  };
}

function isAbortError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "AbortError" || e.message === "AbortError")
  );
}

function makeAbortError(): Error {
  const err = new Error("AbortError");
  err.name = "AbortError";
  return err;
}

/** Fallback layout when ELK is unwanted or aborted. Components go on a
 *  square-ish grid with enough spacing to leave room for their own pins.
 *  The grid is rough but deterministic — Auto arrange can clean it up
 *  later once the user is ready to wait. */
function layoutComponentsAsGrid(components: CircuitComponent[]): void {
  if (components.length === 0) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(components.length)));
  const dx = 12;
  const dy = 10;
  components.forEach((component, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    component.x = normalizeCoord(col * dx);
    component.y = normalizeCoord(row * dy);
  });
}

/** For every multi-pin local net, drop a LABEL stub at each pin so the
 *  netlist still resolves the same net. Used by the label-only layout
 *  path — no wires are drawn, the labels do all the work. */
function promoteLocalNetsToLabels(
  localNets: LocalNet[],
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  for (const net of localNets) {
    const pins = netPins.get(net.node) ?? [];
    if (pins.length < 2) continue;
    for (const pin of pins) {
      const p = pinWorldPos(pin.component, pin.pinIdx);
      components.push({
        id: makeId("label"),
        kind: "LABEL",
        x: snapImportedCoord(p.x),
        y: snapImportedCoord(p.y),
        rotation: 0,
        value: net.node,
        params: {},
      });
    }
  }
}

export function parseNetlistImportIr(text: string): { ir: NetlistImportIr; warnings: string[] } {
  const warnings: string[] = [];
  const { mainLines, subckts, structureDirectives } = splitSubcircuits(text, warnings);
  const main = parseNetlistLines(mainLines, warnings, true);
  const analysis: AnalysisSpec = main.analysis ?? { kind: "op" };
  const directives = [...structureDirectives, ...main.directives];

  const subcircuits: ImportPageIr[] = [];
  for (const subckt of subckts) {
    const subWarnings: string[] = [];
    const parsed = parseNetlistLines(subckt.lines, subWarnings, false);
    warnings.push(...subWarnings.map((warning) => `${subckt.name}: ${warning}`));
    if (parsed.analysis) {
      warnings.push(`${subckt.name}: analysis directives inside subcircuits are preserved but not applied.`);
    }
    if (parsed.directives.length > 0) {
      directives.push(`* directives from .subckt ${subckt.name}`);
      directives.push(...parsed.directives);
    }
    subcircuits.push(buildImportPageIr(sanitizeSubcktName(subckt.name), subckt.pins, parsed));
  }
  const subcircuitPinSides = new Map(
    subcircuits.map((subckt) => [subckt.name.toLowerCase(), inferSubcircuitPinSidesFromNames(subckt.pins)]),
  );
  const root = applySubcircuitInstanceSideHints(buildImportPageIr("main", [], main), subcircuitPinSides);

  return {
    ir: {
      root,
      subcircuits: subcircuits.map((subckt) => applySubcircuitInstanceSideHints(subckt, subcircuitPinSides)),
      directives,
      analysis,
    },
    warnings,
  };
}

function splitSubcircuits(
  text: string,
  warnings: string[],
): { mainLines: string[]; subckts: ParsedSubckt[]; structureDirectives: string[] } {
  const mainLines: string[] = [];
  const subckts: ParsedSubckt[] = [];
  const structureDirectives: string[] = [];
  let current: ParsedSubckt | null = null;

  for (const raw of joinContinuations(text)) {
    const layoutLine = preserveLayoutAnnotation(raw);
    if (layoutLine) {
      if (current) current.lines.push(layoutLine);
      else mainLines.push(layoutLine);
      continue;
    }

    const line = stripComment(raw).trim();
    if (!line) continue;
    const tokens = tokenize(line);
    const directive = tokens[0]?.toLowerCase();

    if (directive === ".subckt") {
      if (current) {
        warnings.push(`${current.name}: nested .subckt blocks are imported as sibling subcircuits.`);
        subckts.push(current);
      }
      const name = tokens[1] ?? "subckt";
      current = {
        name,
        pins: tokens.slice(2).map(normalizeNodeName).filter(Boolean),
        lines: [],
      };
      continue;
    }

    if (directive === ".ends") {
      if (!current) {
        structureDirectives.push(`* unmatched import directive: ${line}`);
        continue;
      }
      subckts.push(current);
      current = null;
      continue;
    }

    if (current) current.lines.push(line);
    else mainLines.push(line);
  }

  if (current) {
    warnings.push(`${current.name}: missing .ends; imported subcircuit body anyway.`);
    subckts.push(current);
  }

  return { mainLines, subckts, structureDirectives };
}

function parseNetlistLines(
  lines: string[],
  warnings: string[],
  allowAnalysis: boolean,
): ParsedLines {
  const parts: ImportedPart[] = [];
  const directives: string[] = [];
  const layoutAnnotations = new Map<string, ImportLayoutAnnotation>();
  let analysis: AnalysisSpec | null = null;
  const modelTypes = collectModelTypes(lines);

  for (const line of lines) {
    const layout = parseLayoutAnnotation(line);
    if (layout) {
      layoutAnnotations.set(layout.name.toLowerCase(), layout.annotation);
      continue;
    }

    if (line.startsWith(".")) {
      const parsed = parseAnalysis(line);
      if (allowAnalysis && parsed) analysis = parsed;
      else directives.push(line);
      continue;
    }

    const parsed = parseElement(line, warnings, modelTypes);
    if (parsed) parts.push(parsed);
    else {
      warnings.push(`Unsupported element preserved as directive but not drawn: ${line}`);
      directives.push(`* unsupported import: ${line}`);
    }
  }

  const annotatedParts = parts.map((part) => {
    const layout = layoutAnnotations.get(part.name.toLowerCase());
    return layout ? { ...part, layout } : part;
  });

  return { parts: annotatedParts, directives, analysis, modelTypes };
}

function buildImportPageIr(
  name: string,
  pins: string[],
  parsed: ParsedLines,
): ImportPageIr {
  const normalizedPins = pins.map(normalizeNodeName).filter(Boolean);
  const parts = parsed.parts.map((part): ImportPartIr => ({
    name: part.name,
    kind: part.kind,
    value: part.value,
    nodes: part.nodes.map(normalizeNodeName),
    ...(part.params ? { params: part.params } : {}),
    ...(part.layout ? { layout: part.layout } : {}),
  }));
  return {
    name,
    pins: normalizedPins,
    parts,
    nets: buildImportNets(parts, normalizedPins),
    directives: [...parsed.directives],
    analysis: parsed.analysis,
    modelTypes: Object.fromEntries(parsed.modelTypes),
  };
}

function applySubcircuitInstanceSideHints(
  page: ImportPageIr,
  sideHintsBySubcircuitName: Map<string, string>,
): ImportPageIr {
  return {
    ...page,
    parts: page.parts.map((part) => {
      if (part.kind !== "SUBX" || part.params?.pinSides) return part;
      const sideHints = sideHintsBySubcircuitName.get(part.value.toLowerCase());
      if (!sideHints) return part;
      const nPins = Math.min(part.nodes.length, sideHints.length, MAX_SUBCIRCUIT_PINS);
      if (nPins <= 0) return part;
      return {
        ...part,
        params: {
          ...(part.params ?? {}),
          pinSides: sideHints.slice(0, nPins),
        },
      };
    }),
  };
}

function inferSubcircuitPinSidesFromNames(pins: string[]): string {
  return pins.slice(0, MAX_SUBCIRCUIT_PINS).map((pin) => {
    const normalized = normalizeNodeName(pin).toLowerCase();
    if (isPositiveRailPinName(normalized)) return "T";
    if (isNegativeRailPinName(normalized)) return "B";
    if (isOutputPinName(normalized)) return "R";
    return "L";
  }).join("");
}

function buildImportNets(parts: ImportPartIr[], externalPins: string[]): ImportNetIr[] {
  const pinMap = new Map<string, ImportPinIr[]>();
  for (const part of parts) {
    part.nodes.forEach((node, pinIdx) => {
      const normalized = normalizeNodeName(node);
      const pins = pinMap.get(normalized) ?? [];
      pins.push({ partName: part.name, pinIdx, node: normalized });
      pinMap.set(normalized, pins);
    });
  }
  for (const external of externalPins) {
    const normalized = normalizeNodeName(external);
    if (!pinMap.has(normalized)) pinMap.set(normalized, []);
  }

  const externalSet = new Set(externalPins.map((pin) => normalizeNodeName(pin).toLowerCase()));
  return [...pinMap.entries()].map(([node, pins]) => {
    const isExternalPort = externalSet.has(node.toLowerCase());
    return {
      name: node,
      kind: classifyImportNet(node, pins.length, isExternalPort),
      pins,
      isExternalPort,
    };
  });
}

function classifyImportNet(
  node: string,
  pinCount: number,
  isExternalPort: boolean,
): ImportNetKind {
  if (node === "0") return "ground";
  if (isExternalPort) return "external-port";
  if (isGlobalNet(node)) return "global";
  if (pinCount > 5) return "high-fanout";
  if (pinCount > 2) return "junction";
  if (pinCount === 1) return "single-pin";
  return "local";
}

function collectModelTypes(lines: string[]): Map<string, string> {
  const modelTypes = new Map<string, string>();
  for (const line of lines) {
    if (!/^\s*\.model\s+/i.test(line)) continue;
    const tokens = tokenize(line);
    const name = tokens[1]?.toLowerCase();
    const type = tokens[2]?.replace(/\(.*/, "");
    if (name && type) modelTypes.set(name, type);
  }
  return modelTypes;
}

function joinContinuations(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*\+/.test(raw) && lines.length > 0) {
      lines[lines.length - 1] += ` ${raw.replace(/^\s*\+\s*/, "")}`;
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

function stripComment(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("*") || trimmed.startsWith(";")) return "";
  return line.replace(/\s;.*$/, "");
}

function preserveLayoutAnnotation(line: string): string | null {
  const trimmed = line.trim();
  return parseLayoutAnnotation(trimmed) ? trimmed : null;
}

function parseLayoutAnnotation(line: string): { name: string; annotation: ImportLayoutAnnotation } | null {
  const match = line.match(/^\*\s*spice-sim-layout:\s+(\S+)(?:\s+(.*))?$/i);
  if (!match) return null;
  const name = match[1];
  const rest = match[2] ?? "";
  const annotation: ImportLayoutAnnotation = {};
  const params: Record<string, string> = {};

  for (const token of tokenize(rest)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq).toLowerCase();
    const value = token.slice(eq + 1);
    if (key === "x" || key === "y") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) annotation[key] = parsed;
    } else if (key === "rot" || key === "rotation") {
      const rotation = parseRotation(value);
      if (rotation !== null) annotation.rotation = rotation;
    } else if (key === "mirror" || key === "mirrored") {
      annotation.mirrored = /^(1|true|yes|on)$/i.test(value);
    } else if (key === "w" || key === "h") {
      params[key] = value;
    } else if (key.toLowerCase() === "pinsides" && /^[LRTB]+$/i.test(value)) {
      params.pinSides = value.toUpperCase();
    }
  }

  if (Object.keys(params).length > 0) annotation.params = params;
  return { name, annotation };
}

function parseRotation(value: string): Rotation | null {
  const parsed = Number.parseInt(value, 10);
  if (parsed === 0 || parsed === 90 || parsed === 180 || parsed === 270) return parsed;
  return null;
}

function parseAnalysis(line: string): AnalysisSpec | null {
  const tokens = tokenize(line);
  const directive = tokens[0]?.toLowerCase();
  if (directive === ".op") return { kind: "op" };
  if (directive === ".tran" && tokens.length >= 3) {
    return {
      kind: "tran",
      tstep: tokens[1],
      tstop: tokens[2],
      ...(tokens[3] && !/^uic$/i.test(tokens[3]) ? { tstart: tokens[3] } : {}),
    };
  }
  if (directive === ".ac" && tokens.length >= 5) {
    const sweep = tokens[1].toLowerCase();
    return {
      kind: "ac",
      sweep: sweep === "lin" || sweep === "oct" ? sweep : "dec",
      npts: Number.parseInt(tokens[2], 10) || 100,
      fstart: tokens[3],
      fstop: tokens[4],
    };
  }
  if (directive === ".dc" && tokens.length >= 5) {
    return {
      kind: "dc",
      src: tokens[1],
      start: tokens[2],
      stop: tokens[3],
      step: tokens[4],
    };
  }
  return null;
}

function parseElement(
  line: string,
  warnings: string[],
  modelTypes: Map<string, string>,
): ImportedPart | null {
  const tokens = tokenize(line);
  const name = tokens[0] ?? "";
  const prefix = name[0]?.toUpperCase();
  if (!prefix) return null;

  const passive = (kind: ComponentKind): ImportedPart | null =>
    tokens.length >= 4 ? { name, kind, nodes: tokens.slice(1, 3), value: tokens.slice(3).join(" ") } : null;

  switch (prefix) {
    case "R":
      return passive("R");
    case "C":
      return passive("C");
    case "L":
      return passive("L");
    case "V":
      return passive("V");
    case "I":
      return passive("I");
    case "B":
      return passive("B");
    case "D":
      return tokens.length >= 4 ? { name, kind: "D", nodes: tokens.slice(1, 3), value: tokens[3] } : null;
    case "Q": {
      if (tokens.length < 5) return null;
      const model = tokens[4];
      const modelType = modelTypes.get(model.toLowerCase()) ?? model;
      return {
        name,
        kind: /pnp|pjt?p|bjtp/i.test(modelType) ? "PNP" : "NPN",
        nodes: tokens.slice(1, 4),
        value: model,
        params: tokens[5] ? { area: tokens[5] } : undefined,
      };
    }
    case "M": {
      if (tokens.length < 6) return null;
      const model = tokens[5];
      const params = parseParams(tokens.slice(6));
      const modelType = modelTypes.get(model.toLowerCase()) ?? model;
      const isPmos = /pmos|pch|pfet/i.test(modelType);
      const explicitBulk = tokens[4] !== tokens[3];
      return {
        name,
        kind: explicitBulk ? (isPmos ? "PMOS4" : "NMOS4") : isPmos ? "PMOS" : "NMOS",
        nodes: explicitBulk ? tokens.slice(1, 5) : tokens.slice(1, 4),
        value: model,
        params,
      };
    }
    case "X": {
      if (tokens.length < 3) return null;
      const model = tokens[tokens.length - 1];
      const rawNodes = tokens.slice(1, -1);
      if (/^opamp$/i.test(model) && rawNodes.length >= 3) {
        return {
          name,
          kind: "OPAMP",
          nodes: rawNodes.slice(0, 3),
          value: "OPAMP",
        };
      }
      const nodes = rawNodes.slice(0, MAX_SUBCIRCUIT_PINS);
      if (rawNodes.length > MAX_SUBCIRCUIT_PINS) {
        warnings.push(
          `${name}: subcircuit instance has ${rawNodes.length} pins; only the first ${MAX_SUBCIRCUIT_PINS} are currently shown.`,
        );
      }
      return {
        name,
        kind: "SUBX",
        nodes,
        value: sanitizeSubcktName(model),
        params: { npins: String(Math.min(MAX_SUBCIRCUIT_PINS, Math.max(1, nodes.length))) },
      };
    }
    default:
      return null;
  }
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of line.trim()) {
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseParams(tokens: string[]): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  for (const token of tokens) {
    const match = token.match(/^([A-Za-z][A-Za-z0-9_]*)=(.+)$/);
    if (!match) continue;
    const key = match[1].toUpperCase();
    if (key === "L" || key === "W") params[key] = match[2];
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

const ELK_SCALE = 48;

let elkPromise: Promise<ELK> | null = null;

let elkWorker: Worker | null = null;

const ELK_DEFAULT_LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "64",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.layered.spacing.edgeNodeBetweenLayers": "48",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
} as const;

function getElk(): Promise<ELK> {
  if (elkPromise) return elkPromise;
  // Browsers: worker-backed elk-api so layout runs off the main thread.
  // Without this the import-progress spinner can't repaint and the
  // user has no way to click "abort" while a multi-second layout runs.
  // Node (unit-test runner): no global Worker, fall back to the bundled
  // in-process variant so the layout tests still execute.
  if (typeof Worker !== "undefined") {
    elkPromise = import("elkjs/lib/elk-api.js").then(({ default: ElkConstructor }) => new ElkConstructor({
      workerFactory: () => {
        const w = new Worker(
          new URL("elkjs/lib/elk-worker.min.js", import.meta.url),
          { type: "classic" },
        );
        elkWorker = w;
        return w;
      },
      defaultLayoutOptions: { ...ELK_DEFAULT_LAYOUT_OPTIONS },
    }));
  } else {
    elkPromise = import("elkjs/lib/elk.bundled.js").then(({ default: ElkConstructor }) => new ElkConstructor({
      defaultLayoutOptions: { ...ELK_DEFAULT_LAYOUT_OPTIONS },
    }));
  }
  return elkPromise;
}

/** Force-terminate the elk worker (called when the user aborts a layout)
 *  and clear our cached ELK instance so the next call spins up a fresh
 *  worker. Without this the aborted layout keeps running and the next
 *  layout request queues behind it. */
function terminateElkWorker(): void {
  elkWorker?.terminate();
  elkWorker = null;
  elkPromise = null;
}

async function layoutImportedPage(
  page: ImportPageIr,
  opts: {
    signal?: AbortSignal;
    mode?: "auto" | "labels";
    onPhase?: (phase: ImportPhase, detail?: ImportPhaseDetail) => void;
  } = {},
): Promise<{ components: CircuitComponent[]; wires: { id: string; points: [number, number][] }[] }> {
  const components: CircuitComponent[] = [];
  const wires: { id: string; points: [number, number][] }[] = [];
  const netPins = new Map<string, ImportedPin[]>();
  const seededLabels = new Set<string>();
  const layoutByComponentId = new Map<string, ImportLayoutAnnotation>();

  page.pins.forEach((pin, idx) => {
    const node = normalizeNodeName(pin);
    if (!node || seededLabels.has(node.toLowerCase())) return;
    seededLabels.add(node.toLowerCase());
    const component: CircuitComponent = {
      id: makeId("port"),
      kind: "LABEL",
      x: -7,
      y: idx * 1.5,
      rotation: 0,
      value: node,
      params: { port: "1", portOrder: String(idx + 1) },
    };
    components.push(component);
    addNetPin(netPins, node, component, 0);
  });

  page.parts.forEach((part, idx) => {
    const rotation = part.layout?.rotation ?? defaultRotation(part.kind);
    const component: CircuitComponent = {
      id: makeId(part.kind.toLowerCase()),
      kind: part.kind,
      x: part.layout?.x ?? idx * 8,
      y: part.layout?.y ?? 0,
      rotation,
      ...(part.layout?.mirrored ? { mirrored: true } : {}),
      value: normalizeImportedValue(part),
      params: mergeImportedParams(part.params, part.layout?.params),
    };
    components.push(component);
    if (part.layout) layoutByComponentId.set(component.id, part.layout);

    const pins = getPinLayout(component);
    for (let pinIdx = 0; pinIdx < Math.min(pins.length, part.nodes.length); pinIdx++) {
      const node = normalizeNodeName(part.nodes[pinIdx]);
      addNetPin(netPins, node, component, pinIdx);
    }
  });

  const routingPlan = classifyNets(netPins, page.nets);
  if (opts.mode === "labels") {
    // Skip ELK entirely. Lay components out on a grid; downstream code
    // converts every local net into a set of LABEL stubs (one per pin)
    // rather than routed wires, so the schematic still represents the
    // same connectivity — just visually flat.
    layoutComponentsAsGrid(
      components.filter((component) => component.kind !== "LABEL"),
    );
    promoteLocalNetsToLabels(routingPlan.localNets, components, netPins);
    // Drop the local-net routing plan so no wires get drawn.
    routingPlan.localNets = [];
  } else {
    await applyElkLayout(
      components.filter((component) => component.kind !== "LABEL"),
      routingPlan.localNets,
      routingPlan.junctions,
      opts.signal,
    );
  }
  applyCircuitSpecificLayouts(components, netPins);
  applyImportedLayoutAnnotations(components, layoutByComponentId);

  // Wire routing is the *other* expensive phase — `addWireRoute` runs an
  // O(N · obstacles) candidate search per net on the main thread. For a
  // ~100-component circuit this was the multi-second freeze the user
  // reported after the worker came back. Report progress per net, and
  // yield to the browser every YIELD_EVERY nets so the spinner / abort
  // button stay responsive.
  // Label-only mode skips wire routing entirely — connectivity is fully
  // expressed via the LABEL stubs `promoteLocalNetsToLabels` already
  // dropped at every pin. Ground still needs its GND symbol per pin.
  if (opts.mode === "labels") {
    for (const [node, pins] of netPins) {
      if (node !== "0") continue;
      for (const pin of pins.filter((p) => p.component.kind !== "LABEL")) {
        addGroundReference(components, wires, pin);
      }
    }
    return { components, wires };
  }
  opts.onPhase?.("routing", { current: 0, total: netPins.size });
  // Yield after every net: a single complex net can take 100+ ms inside
  // `orthogonalRouteCandidates`, so coarser batching produced visible
  // multi-hundred-ms freezes between updates. setTimeout(0) is enough to
  // let React paint the spinner increment and process the abort click.
  let netIdx = 0;
  for (const [node, pins] of netPins) {
    if (netIdx > 0) {
      opts.onPhase?.("routing", { current: netIdx, total: netPins.size });
      if (opts.signal?.aborted) throw makeAbortError();
      await new Promise((r) => setTimeout(r, 0));
    }
    netIdx += 1;
    if (node === "0") {
      for (const pin of pins.filter((p) => p.component.kind !== "LABEL")) {
        addGroundReference(components, wires, pin);
      }
      continue;
    }

    const connectablePins = pins.filter((pin) => pin.component.kind !== "LABEL");
    if (routingPlan.labelNets.has(node)) {
      for (const pin of connectablePins) addNetLabelStub(components, wires, node, pin);
      continue;
    }

    if (connectablePins.length === 2) {
      addWireRoute(wires, pinPoint(connectablePins[0]), pinPoint(connectablePins[1]), components, [
        connectablePins[0].component,
        connectablePins[1].component,
      ]);
    } else if (connectablePins.length > 2 && connectablePins.length <= 5) {
      const junction = preferredJunctionPoint(connectablePins, routingPlan.junctions.get(node));
      for (const pin of connectablePins) addWireRoute(wires, pinPoint(pin), junction, components, [pin.component]);
    } else {
      for (const pin of connectablePins) addNetLabelStub(components, wires, node, pin);
    }
  }

  return { components, wires };
}

function mergeImportedParams(
  params: Record<string, string> | undefined,
  layoutParams: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged = { ...(params ?? {}), ...(layoutParams ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function applyImportedLayoutAnnotations(
  components: CircuitComponent[],
  layoutByComponentId: Map<string, ImportLayoutAnnotation>,
): void {
  if (layoutByComponentId.size === 0) return;
  for (const component of components) {
    const layout = layoutByComponentId.get(component.id);
    if (!layout) continue;
    if (layout.x !== undefined) component.x = layout.x;
    if (layout.y !== undefined) component.y = layout.y;
    if (layout.rotation !== undefined) component.rotation = layout.rotation;
    component.mirrored = layout.mirrored ? true : undefined;
    component.params = mergeImportedParams(component.params, layout.params);
  }
}

function applyCircuitSpecificLayouts(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  applyGroundedSourceLayout(components, netPins);
  applyCmosPairLayout(components, netPins);
  applySeriesMosStackLayout(components, netPins);
  applySeriesPmosStackLayout(components, netPins);
  applyShuntPartLayout(components, netPins);
}

function applyGroundedSourceLayout(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  for (const component of components) {
    if (!isGroundReferencedSourceKind(component.kind)) continue;
    const n0 = nodeForPin(netPins, component, 0);
    const n1 = nodeForPin(netPins, component, 1);
    if (!n0 || !n1) continue;
    const n0Ground = n0 === "0";
    const n1Ground = n1 === "0";
    if (n0Ground === n1Ground) continue;

    const signalIdx = n0Ground ? 1 : 0;
    const signalNode = signalIdx === 0 ? n0 : n1;
    const signalAnchor = signalAnchorForSource(component, signalNode, netPins);
    if (!signalAnchor) continue;

    component.rotation = signalIdx === 0 ? 0 : 180;
    const sourceOffset = isGlobalNet(signalNode) ? 6 : 4;
    component.x = normalizeCoord(signalAnchor.x - sourceOffset);
    component.y = normalizeCoord(signalAnchor.y + (signalIdx === 0 ? 2 : -2));
  }
}

function isGroundReferencedSourceKind(kind: ComponentKind): boolean {
  return kind === "V" || kind === "I" || kind === "B";
}

function signalAnchorForSource(
  component: CircuitComponent,
  node: string,
  netPins: Map<string, ImportedPin[]>,
): { x: number; y: number } | null {
  const pins = (netPins.get(node) ?? []).filter((pin) =>
    pin.component.id !== component.id &&
    pin.component.kind !== "LABEL" &&
    pin.component.kind !== "GND"
  );
  if (pins.length === 0) return null;
  const points = pins.map(pinPoint);
  return {
    x: normalizeCoord(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: normalizeCoord(points.reduce((sum, point) => sum + point.y, 0) / points.length),
  };
}

function applyShuntPartLayout(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  for (const component of components) {
    if (!isPassiveKind(component.kind)) continue;
    const n0 = nodeForPin(netPins, component, 0);
    const n1 = nodeForPin(netPins, component, 1);
    if (!n0 || !n1) continue;

    const n0Rail = isRailNet(n0);
    const n1Rail = isRailNet(n1);
    if (n0Rail === n1Rail) continue;

    const signalIdx = n0Rail ? 1 : 0;
    const railIdx = n0Rail ? 0 : 1;
    const signalNode = signalIdx === 0 ? n0 : n1;
    const railNode = railIdx === 0 ? n0 : n1;
    const signalAnchor = signalAnchorForShunt(component, signalNode, netPins);
    if (!signalAnchor) continue;

    const railAbove = isPositiveRailNet(railNode);
    orientShuntPart(component, signalIdx, !railAbove);
    component.x = shuntX(component, signalAnchor, signalNode, netPins);
    component.y = normalizeCoord(signalAnchor.y + (railAbove ? -2 : 2));
  }
}

function isPassiveKind(kind: ComponentKind): boolean {
  return kind === "R" || kind === "C" || kind === "L";
}

function isRailNet(node: string): boolean {
  return node === "0" || isGlobalNet(node);
}

function isPositiveRailNet(node: string): boolean {
  return /^(vdd|vcc|avdd|dvdd|\+?\d+v)$/i.test(node);
}

function signalAnchorForShunt(
  component: CircuitComponent,
  node: string,
  netPins: Map<string, ImportedPin[]>,
): { x: number; y: number } | null {
  const pins = (netPins.get(node) ?? []).filter((pin) =>
    pin.component.id !== component.id &&
    pin.component.kind !== "LABEL" &&
    pin.component.kind !== "GND"
  );
  if (pins.length === 0) return null;
  const points = pins.map(pinPoint);
  return {
    x: normalizeCoord(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: normalizeCoord(points.reduce((sum, point) => sum + point.y, 0) / points.length),
  };
}

function shuntX(
  component: CircuitComponent,
  signalAnchor: { x: number; y: number },
  node: string,
  netPins: Map<string, ImportedPin[]>,
): number {
  const otherPins = (netPins.get(node) ?? []).filter((pin) => pin.component.id !== component.id);
  const touchesActiveDevice = otherPins.some((pin) => isActiveDeviceKind(pin.component.kind));
  if (!touchesActiveDevice) return normalizeCoord(signalAnchor.x);
  if (otherPins.some((pin) => isOutputPin(pin))) return normalizeCoord(signalAnchor.x + 4);
  const currentSide = component.x >= signalAnchor.x ? 1 : -1;
  return normalizeCoord(signalAnchor.x + currentSide * 4);
}

function isOutputPin(pin: ImportedPin): boolean {
  return pin.component.kind === "OPAMP" && pin.pinIdx === 2;
}

function isActiveDeviceKind(kind: ComponentKind): boolean {
  return (
    kind === "NMOS" ||
    kind === "PMOS" ||
    kind === "NMOS4" ||
    kind === "PMOS4" ||
    kind === "NPN" ||
    kind === "PNP" ||
    kind === "OPAMP"
  );
}

function orientShuntPart(component: CircuitComponent, signalIdx: number, signalOnTop: boolean): void {
  if (component.kind === "R") {
    component.rotation = (signalIdx === 0) === signalOnTop ? 90 : 270;
    return;
  }
  component.rotation = (signalIdx === 0) === signalOnTop ? 0 : 180;
}

function applyCmosPairLayout(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  const pmoses = components.filter((component) => isPmosKind(component.kind));
  const nmoses = components.filter((component) => isNmosKind(component.kind));

  for (const pmos of pmoses) {
    for (const nmos of nmoses) {
      const pGate = nodeForPin(netPins, pmos, 1);
      const nGate = nodeForPin(netPins, nmos, 1);
      const pDrain = nodeForPin(netPins, pmos, 0);
      const nDrain = nodeForPin(netPins, nmos, 0);
      const pSource = nodeForPin(netPins, pmos, 2);
      const nSource = nodeForPin(netPins, nmos, 2);
      if (!pGate || !nGate || !pDrain || !nDrain || !pSource || !nSource) continue;
      if (pGate !== nGate || pDrain !== nDrain) continue;
      if (!isGlobalNet(pSource) || nSource !== "0") continue;

      pmos.x = 0;
      pmos.y = 0;
      pmos.rotation = 180;
      nmos.x = 0;
      nmos.y = 4;
      nmos.rotation = 0;

      placeSuppliesForCmosPair(components, netPins, pGate, pSource);
      placeOutputLoadsForCmosPair(components, netPins, pDrain);
      return;
    }
  }
}

function applySeriesMosStackLayout(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  const nmoses = components.filter((component) => isNmosKind(component.kind));
  for (const topCandidate of nmoses) {
    for (const bottomCandidate of nmoses) {
      if (topCandidate.id === bottomCandidate.id) continue;
      const shared = nodeForPin(netPins, topCandidate, 2);
      if (!shared || shared === "0" || isGlobalNet(shared)) continue;
      if (nodeForPin(netPins, bottomCandidate, 0) !== shared) continue;
      const centerX = snapImportedCoord((topCandidate.x + bottomCandidate.x) / 2);
      const centerY = snapImportedCoord((topCandidate.y + bottomCandidate.y) / 2);
      topCandidate.x = centerX;
      topCandidate.y = normalizeCoord(centerY - 2);
      topCandidate.rotation = 0;
      bottomCandidate.x = centerX;
      bottomCandidate.y = normalizeCoord(centerY + 2);
      bottomCandidate.rotation = 0;
    }
  }
}

function applySeriesPmosStackLayout(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
): void {
  const pmoses = components.filter((component) => isPmosKind(component.kind));
  for (const lowerCandidate of pmoses) {
    for (const upperCandidate of pmoses) {
      if (lowerCandidate.id === upperCandidate.id) continue;
      const shared = nodeForPin(netPins, lowerCandidate, 2);
      if (!shared || shared === "0" || isGlobalNet(shared)) continue;
      if (nodeForPin(netPins, upperCandidate, 0) !== shared) continue;
      const centerX = snapImportedCoord((lowerCandidate.x + upperCandidate.x) / 2);
      const centerY = snapImportedCoord((lowerCandidate.y + upperCandidate.y) / 2);
      upperCandidate.x = centerX;
      upperCandidate.y = normalizeCoord(centerY - 2);
      upperCandidate.rotation = 180;
      lowerCandidate.x = centerX;
      lowerCandidate.y = normalizeCoord(centerY + 2);
      lowerCandidate.rotation = 180;
    }
  }
}

function placeSuppliesForCmosPair(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
  gateNode: string,
  vddNode: string,
): void {
  const inputSource = components.find((component) => (
    (component.kind === "V" || component.kind === "I") &&
    nodeForPin(netPins, component, 0) === gateNode &&
    nodeForPin(netPins, component, 1) === "0"
  ));
  if (inputSource) {
    inputSource.x = -6;
    inputSource.y = 4;
    inputSource.rotation = 0;
  }

  const supplySource = components.find((component) => (
    component.kind === "V" &&
    nodeForPin(netPins, component, 0) === vddNode &&
    nodeForPin(netPins, component, 1) === "0"
  ));
  if (supplySource) {
    supplySource.x = -6;
    supplySource.y = -3;
    supplySource.rotation = 0;
  }
}

function placeOutputLoadsForCmosPair(
  components: CircuitComponent[],
  netPins: Map<string, ImportedPin[]>,
  outputNode: string,
): void {
  let loadIndex = 0;
  for (const component of components) {
    if (component.kind !== "R" && component.kind !== "C" && component.kind !== "L") continue;
    const n0 = nodeForPin(netPins, component, 0);
    const n1 = nodeForPin(netPins, component, 1);
    if (!((n0 === outputNode && n1 === "0") || (n1 === outputNode && n0 === "0"))) continue;
    component.x = 4 + loadIndex * 3;
    component.y = 4;
    component.rotation = n0 === outputNode ? 0 : 180;
    loadIndex++;
  }
}

function nodeForPin(
  netPins: Map<string, ImportedPin[]>,
  component: CircuitComponent,
  pinIdx: number,
): string | null {
  for (const [node, pins] of netPins) {
    if (pins.some((pin) => pin.component.id === component.id && pin.pinIdx === pinIdx)) return node;
  }
  return null;
}

function isNmosKind(kind: ComponentKind): boolean {
  return kind === "NMOS" || kind === "NMOS4";
}

function isPmosKind(kind: ComponentKind): boolean {
  return kind === "PMOS" || kind === "PMOS4";
}

interface ImportedPin {
  component: CircuitComponent;
  pinIdx: number;
}

interface LocalNet {
  node: string;
  pins: ImportedPin[];
  junctionId?: string;
}

interface RoutingPlan {
  localNets: LocalNet[];
  labelNets: Set<string>;
  junctions: Map<string, { x: number; y: number }>;
}

function addNetPin(
  netPins: Map<string, ImportedPin[]>,
  node: string,
  component: CircuitComponent,
  pinIdx: number,
): void {
  const pins = netPins.get(node) ?? [];
  pins.push({ component, pinIdx });
  netPins.set(node, pins);
}

function classifyNets(
  netPins: Map<string, ImportedPin[]>,
  netIr: ImportNetIr[] = [],
): RoutingPlan {
  const localNets: LocalNet[] = [];
  const labelNets = new Set<string>();
  const junctions = new Map<string, { x: number; y: number }>();
  const netKindByName = new Map(netIr.map((net) => [net.name.toLowerCase(), net.kind]));

  for (const [node, pins] of netPins) {
    const kind = netKindByName.get(node.toLowerCase()) ?? classifyImportNet(
      node,
      pins.filter((pin) => pin.component.kind !== "LABEL").length,
      pins.some((pin) => pin.component.kind === "LABEL" && pin.component.params?.port === "1"),
    );
    if (kind === "ground") continue;
    const connectablePins = pins.filter((pin) => pin.component.kind !== "LABEL");
    if (kind === "external-port" || kind === "global" || kind === "high-fanout") {
      labelNets.add(node);
      continue;
    }
    if (kind === "local" && connectablePins.length === 2) {
      localNets.push({ node, pins: connectablePins });
    } else if (kind === "junction" && connectablePins.length > 2) {
      localNets.push({ node, pins: connectablePins, junctionId: `junction:${node}` });
    } else if (connectablePins.length > 0) {
      labelNets.add(node);
    }
  }

  return { localNets, labelNets, junctions };
}

async function applyElkLayout(
  components: CircuitComponent[],
  localNets: LocalNet[],
  junctions: Map<string, { x: number; y: number }>,
  signal?: AbortSignal,
): Promise<void> {
  if (components.length === 0) return;
  if (signal?.aborted) throw makeAbortError();

  const junctionNets = localNets.filter((net) => net.junctionId);
  const graph: ElkNode = {
    id: "import-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": "108",
      "elk.layered.spacing.edgeNodeBetweenLayers": "48",
    },
    children: [
      ...components.map(componentToElkNode),
      ...junctionNets.map((net) => ({
        id: net.junctionId!,
        width: 10,
        height: 10,
      })),
    ],
    edges: localNets.flatMap(netToElkEdges),
  };

  const elk = await getElk();
  // ELK has no native cancellation, so race the layout against the abort
  // signal. If aborted, tear down the worker so its queued layout isn't
  // still hogging a CPU after the user has fallen back to label-only —
  // the next import call will spin up a fresh worker via getElk().
  const laidOut = signal
    ? await Promise.race([
        elk.layout(graph),
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            terminateElkWorker();
            reject(makeAbortError());
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }),
      ])
    : await elk.layout(graph);
  const children = laidOut.children ?? [];
  const byId = new Map(children.map((child) => [child.id, child]));
  const componentById = new Map(components.map((component) => [component.id, component]));

  for (const component of components) {
    const node = byId.get(component.id);
    if (!node || node.x == null || node.y == null || node.width == null || node.height == null) continue;
    component.x = snapImportedCoord((node.x + node.width / 2) / ELK_SCALE);
    component.y = snapImportedCoord((node.y + node.height / 2) / ELK_SCALE);
  }

  const xs = components.map((component) => component.x);
  const ys = components.map((component) => component.y);
  const shiftX = xs.length ? snapImportedCoord(-Math.min(...xs)) : 0;
  const shiftY = ys.length ? snapImportedCoord(-Math.min(...ys)) : 0;
  for (const component of components) {
    component.x = normalizeCoord(component.x + shiftX);
    component.y = normalizeCoord(component.y + shiftY);
  }

  for (const net of junctionNets) {
    const node = byId.get(net.junctionId!);
    if (!node || node.x == null || node.y == null || node.width == null || node.height == null) continue;
    const x = snapImportedCoord((node.x + node.width / 2) / ELK_SCALE + shiftX);
    const y = snapImportedCoord((node.y + node.height / 2) / ELK_SCALE + shiftY);
    const livePins = net.pins.filter((pin) => componentById.has(pin.component.id));
    const fallback = netJunctionPoint(livePins.map(pinPoint));
    const cleanX = Number.isFinite(x) ? x : fallback.x;
    const cleanY = Number.isFinite(y) ? y : fallback.y;
    // Store by net name; routing later renders the junction as wire bends, not a visible component.
    junctions.set(net.node, { x: cleanX, y: cleanY });
  }
}

function componentToElkNode(component: CircuitComponent): ElkNode {
  const bounds = componentBoundsFor(component);
  return {
    id: component.id,
    width: (bounds.x2 - bounds.x1) * ELK_SCALE,
    height: (bounds.y2 - bounds.y1) * ELK_SCALE,
    layoutOptions: {
      "elk.portConstraints": "FIXED_SIDE",
    },
    ports: getPinLayout(component).map((pin, idx): ElkPort => ({
      id: elkPortId(component, idx),
      width: 6,
      height: 6,
      layoutOptions: {
        "elk.port.side": elkPortSide(pin),
      },
    })),
  };
}

function netToElkEdges(net: LocalNet): ElkExtendedEdge[] {
  if (net.junctionId) {
    return net.pins.map((pin, idx) => ({
      id: `edge:${net.node}:${idx}`,
      sources: [elkPortId(pin.component, pin.pinIdx)],
      targets: [net.junctionId!],
    }));
  }
  if (net.pins.length !== 2) return [];
  return [
    {
      id: `edge:${net.node}`,
      sources: [elkPortId(net.pins[0].component, net.pins[0].pinIdx)],
      targets: [elkPortId(net.pins[1].component, net.pins[1].pinIdx)],
    },
  ];
}

function elkPortId(component: CircuitComponent, pinIdx: number): string {
  return `${component.id}:pin:${pinIdx}`;
}

function elkPortSide(pin: { x: number; y: number }): string {
  if (Math.abs(pin.x) >= Math.abs(pin.y)) return pin.x < 0 ? "WEST" : "EAST";
  return pin.y < 0 ? "NORTH" : "SOUTH";
}

function snapImportedCoord(value: number): number {
  return normalizeCoord(Math.round(value * 2) / 2);
}

function addGroundReference(
  components: CircuitComponent[],
  wires: { id: string; points: [number, number][] }[],
  pin: ImportedPin,
): void {
  const anchor = labelAnchor(pin.component, pin.pinIdx);
  addWireRoute(wires, pinPoint(pin), tuplePoint(anchor), components, [pin.component]);
  components.push({
    id: makeId("gnd"),
    kind: "GND",
    x: anchor[0],
    y: anchor[1],
    rotation: 0,
    value: "",
  });
}

function addNetLabelStub(
  components: CircuitComponent[],
  wires: { id: string; points: [number, number][] }[],
  node: string,
  pin: ImportedPin,
): void {
  const anchor = labelAnchor(pin.component, pin.pinIdx);
  addWireRoute(wires, pinPoint(pin), tuplePoint(anchor), components, [pin.component]);
  components.push({
    id: makeId("lbl"),
    kind: "LABEL",
    x: anchor[0],
    y: anchor[1],
    rotation: 0,
    value: node,
  });
}

function addWireRoute(
  wires: { id: string; points: [number, number][] }[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: CircuitComponent[] = [],
  allowedIntersections: CircuitComponent[] = [],
): void {
  const points = routeWireSegmentAvoiding(from, to, true, {
    components: obstacles,
    wires,
    ignoreComponentIds: new Set(allowedIntersections.map((component) => component.id)),
  });
  if (points.length >= 2) wires.push({ id: makeId("w"), points });
}

function netJunctionPoint(points: { x: number; y: number }[]): { x: number; y: number } {
  const average = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: normalizeCoord(average.x / points.length),
    y: normalizeCoord(average.y / points.length),
  };
}

function preferredJunctionPoint(
  pins: ImportedPin[],
  fallback?: { x: number; y: number },
): { x: number; y: number } {
  const points = pins.map(pinPoint);
  if (points.length === 0) return fallback ?? { x: 0, y: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  if (xSpread <= 0.5) return { x: normalizeCoord(median(xs)), y: normalizeCoord(median(ys)) };
  if (ySpread <= 0.5) return { x: normalizeCoord(median(xs)), y: normalizeCoord(median(ys)) };
  const local = netJunctionPoint(points);
  if (!fallback) return local;
  const localDistance = totalDistance(points, local);
  const fallbackDistance = totalDistance(points, fallback);
  return localDistance <= fallbackDistance * 1.35 ? local : fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function totalDistance(points: { x: number; y: number }[], target: { x: number; y: number }): number {
  return points.reduce((sum, point) => sum + Math.abs(point.x - target.x) + Math.abs(point.y - target.y), 0);
}

function pinPoint(pin: ImportedPin): { x: number; y: number } {
  return pinWorldPos(pin.component, pin.pinIdx);
}

function tuplePoint(point: [number, number]): { x: number; y: number } {
  return { x: point[0], y: point[1] };
}

function isGlobalNet(node: string): boolean {
  return /^(vdd|vcc|vee|vss|vssa|vssd|avdd|dvdd|avss|dvss|\+?\d+v|-?\d+v)$/i.test(node);
}

function isPositiveRailPinName(node: string): boolean {
  return /^(vdd|vcc|avdd|dvdd|\+?\d+(?:\.\d+)?v?)$/i.test(node);
}

function isNegativeRailPinName(node: string): boolean {
  return /^(0|gnd|vss|vssa|vssd|avss|dvss|vee|-?\d+(?:\.\d+)?v?)$/i.test(node) && !isPositiveRailPinName(node);
}

function isOutputPinName(node: string): boolean {
  return /^(y|z|h|q\d*|out\d*|output\d*|vout|vo|sum|carry|cout|result)$/i.test(node)
    || /(^|[_-])out($|[_-]|\d)/i.test(node);
}

function defaultRotation(kind: ComponentKind): Rotation {
  return kind === "R" ? 0 : 0;
}

function normalizeImportedValue(part: ImportedPart): string {
  if ((part.kind === "V" || part.kind === "I") && /^dc\s+/i.test(part.value)) {
    return part.value.replace(/^dc\s+/i, "DC ");
  }
  return part.value;
}

function normalizeNodeName(raw: string): string {
  if (/^(0|gnd)$/i.test(raw)) return "0";
  return raw.replace(/[^A-Za-z0-9_+\-.]/g, "_");
}

function sanitizeSubcktName(raw: string): string {
  const sanitized = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return sanitized || "subckt";
}

function labelAnchor(component: CircuitComponent, pinIdx: number): [number, number] {
  const layout = getPinLayout(component)[pinIdx] ?? { x: 0, y: 0 };
  const pin = pinWorldPos(component, pinIdx);
  const rotated = rotatePoint(layout, component.rotation);
  const dx = Math.sign(rotated.x);
  const dy = Math.sign(rotated.y);
  if (dx !== 0) return [pin.x + dx * 1.2, pin.y];
  if (dy !== 0) return [pin.x, pin.y + dy * 1.2];
  return [pin.x + 1.2, pin.y];
}
