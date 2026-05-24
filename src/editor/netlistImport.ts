import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
} from "elkjs/lib/elk.bundled.js";
import {
  type AnalysisSpec,
  type CircuitComponent,
  type CircuitDoc,
  type ComponentKind,
  type Rotation,
  emptyDoc,
  getPinLayout,
  makeId,
  pinWorldPos,
} from "./model.ts";
import {
  componentBounds,
  componentVisualBoundsFor,
  normalizeCoord,
  normalizePoint,
  samePoint,
  wireIntersectsRect,
} from "./geometry.ts";

interface ImportedPart {
  kind: ComponentKind;
  value: string;
  nodes: string[];
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
}

export interface NetlistImportResult {
  doc: CircuitDoc;
  warnings: string[];
}

export async function importNetlist(text: string): Promise<NetlistImportResult> {
  const warnings: string[] = [];
  const { mainLines, subckts, structureDirectives } = splitSubcircuits(text, warnings);
  const main = parseNetlistLines(mainLines, warnings, true);
  const analysis: AnalysisSpec = main.analysis ?? { kind: "op" };
  const directives = [...structureDirectives, ...main.directives];

  const { components, wires } = await layoutImportedParts(main.parts);
  if (!components.some((c) => c.kind === "GND")) {
    warnings.push("Imported netlist has no node 0 reference in supported elements.");
  }

  const root = {
    ...emptyDoc.pages[0],
    id: makeId("page"),
    name: "main",
    description: "",
    components,
    wires,
    probes: [],
  };

  const subPages = [];
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
    const layout = await layoutImportedParts(parsed.parts, { externalPins: subckt.pins });
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

  return {
    doc: {
      pages: [root, ...subPages],
      activePageId: root.id,
      directives: directives.join("\n"),
      analysis,
      simSettings: emptyDoc.simSettings,
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
  let analysis: AnalysisSpec | null = null;

  for (const line of lines) {
    if (line.startsWith(".")) {
      const parsed = parseAnalysis(line);
      if (allowAnalysis && parsed) analysis = parsed;
      else directives.push(line);
      continue;
    }

    const parsed = parseElement(line, warnings);
    if (parsed) parts.push(parsed);
    else directives.push(`* unsupported import: ${line}`);
  }

  return { parts, directives, analysis };
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

function parseElement(line: string, warnings: string[]): ImportedPart | null {
  const tokens = tokenize(line);
  const name = tokens[0] ?? "";
  const prefix = name[0]?.toUpperCase();
  if (!prefix) return null;

  const passive = (kind: ComponentKind): ImportedPart | null =>
    tokens.length >= 4 ? { kind, nodes: tokens.slice(1, 3), value: tokens.slice(3).join(" ") } : null;

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
      return tokens.length >= 4 ? { kind: "D", nodes: tokens.slice(1, 3), value: tokens[3] } : null;
    case "Q": {
      if (tokens.length < 5) return null;
      const model = tokens[4];
      return {
        kind: /pnp|pjt?p|bjtp/i.test(model) ? "PNP" : "NPN",
        nodes: tokens.slice(1, 4),
        value: model,
        params: tokens[5] ? { area: tokens[5] } : undefined,
      };
    }
    case "M": {
      if (tokens.length < 6) return null;
      const model = tokens[5];
      const params = parseParams(tokens.slice(6));
      const isPmos = /pmos|pch|pfet/i.test(model);
      const explicitBulk = tokens[4] !== tokens[3];
      return {
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
      const nodes = rawNodes.slice(0, 16);
      if (rawNodes.length > 16) {
        warnings.push(
          `${name}: subcircuit instance has ${rawNodes.length} pins; only the first 16 are currently shown.`,
        );
      }
      return {
        kind: "SUBX",
        nodes,
        value: sanitizeSubcktName(model),
        params: { npins: String(Math.min(16, Math.max(1, nodes.length))) },
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

function getElk(): Promise<ELK> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then(({ default: ElkConstructor }) => new ElkConstructor({
    defaultLayoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.layered.spacing.edgeNodeBetweenLayers": "48",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
  }));
  return elkPromise;
}

async function layoutImportedParts(
  parts: ImportedPart[],
  options: { externalPins?: string[] } = {},
): Promise<{ components: CircuitComponent[]; wires: { id: string; points: [number, number][] }[] }> {
  const components: CircuitComponent[] = [];
  const wires: { id: string; points: [number, number][] }[] = [];
  const netPins = new Map<string, ImportedPin[]>();
  const seededLabels = new Set<string>();

  options.externalPins?.forEach((pin, idx) => {
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
      params: { port: "1" },
    };
    components.push(component);
    addNetPin(netPins, node, component, 0);
  });

  parts.forEach((part, idx) => {
    const rotation = defaultRotation(part.kind);
    const component: CircuitComponent = {
      id: makeId(part.kind.toLowerCase()),
      kind: part.kind,
      x: idx * 8,
      y: 0,
      rotation,
      value: normalizeImportedValue(part),
      params: part.params,
    };
    components.push(component);

    const pins = getPinLayout(component);
    for (let pinIdx = 0; pinIdx < Math.min(pins.length, part.nodes.length); pinIdx++) {
      const node = normalizeNodeName(part.nodes[pinIdx]);
      addNetPin(netPins, node, component, pinIdx);
    }
  });

  const routingPlan = classifyNets(netPins);
  await applyElkLayout(
    components.filter((component) => component.kind !== "LABEL"),
    routingPlan.localNets,
    routingPlan.junctions,
  );

  for (const [node, pins] of netPins) {
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
      const junction = routingPlan.junctions.get(node) ?? netJunctionPoint(connectablePins.map(pinPoint));
      for (const pin of connectablePins) addWireRoute(wires, pinPoint(pin), junction, components, [pin.component]);
    } else {
      for (const pin of connectablePins) addNetLabelStub(components, wires, node, pin);
    }
  }

  return { components, wires };
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

function classifyNets(netPins: Map<string, ImportedPin[]>): RoutingPlan {
  const localNets: LocalNet[] = [];
  const labelNets = new Set<string>();
  const junctions = new Map<string, { x: number; y: number }>();

  for (const [node, pins] of netPins) {
    if (node === "0") continue;
    const connectablePins = pins.filter((pin) => pin.component.kind !== "LABEL");
    const hasExternalPort = pins.some((pin) => pin.component.kind === "LABEL" && pin.component.params?.port === "1");
    if (hasExternalPort || isGlobalNet(node) || connectablePins.length > 5) {
      labelNets.add(node);
      continue;
    }
    if (connectablePins.length === 2) {
      localNets.push({ node, pins: connectablePins });
    } else if (connectablePins.length > 2 && connectablePins.length <= 5) {
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
): Promise<void> {
  if (components.length === 0) return;

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

  const laidOut = await (await getElk()).layout(graph);
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
  const bounds = componentBounds(component.kind);
  return {
    id: component.id,
    width: bounds.w * ELK_SCALE,
    height: bounds.h * ELK_SCALE,
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
  const points = bestOrthogonalRoute(from, to, obstacles, allowedIntersections);
  if (points.length >= 2) wires.push({ id: makeId("w"), points });
}

function bestOrthogonalRoute(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: CircuitComponent[],
  allowedIntersections: CircuitComponent[],
): [number, number][] {
  const candidates = orthogonalRouteCandidates(from, to);
  let best = candidates[0] ?? [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreRoute(candidate, obstacles, allowedIntersections);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function orthogonalRouteCandidates(
  from: { x: number; y: number },
  to: { x: number; y: number },
): [number, number][][] {
  const start = normalizePoint(from);
  const end = normalizePoint(to);
  if (samePoint(start, end)) return [];
  if (start.x === end.x || start.y === end.y) return [[[start.x, start.y], [end.x, end.y]]];
  const midX = snapImportedCoord((start.x + end.x) / 2);
  const midY = snapImportedCoord((start.y + end.y) / 2);
  return [
    compactWirePoints([[start.x, start.y], [end.x, start.y], [end.x, end.y]]),
    compactWirePoints([[start.x, start.y], [start.x, end.y], [end.x, end.y]]),
    compactWirePoints([[start.x, start.y], [midX, start.y], [midX, end.y], [end.x, end.y]]),
    compactWirePoints([[start.x, start.y], [start.x, midY], [end.x, midY], [end.x, end.y]]),
  ];
}

function scoreRoute(
  points: [number, number][],
  obstacles: CircuitComponent[],
  allowedIntersections: CircuitComponent[],
): number {
  const allowedIds = new Set(allowedIntersections.map((component) => component.id));
  let score = 0;
  for (let idx = 0; idx < points.length - 1; idx++) {
    score += Math.abs(points[idx + 1][0] - points[idx][0]) + Math.abs(points[idx + 1][1] - points[idx][1]);
  }
  score += Math.max(0, points.length - 2) * 2;
  for (const obstacle of obstacles) {
    if (allowedIds.has(obstacle.id) || obstacle.kind === "LABEL" || obstacle.kind === "GND") continue;
    if (wireIntersectsRect(points, componentVisualBoundsFor(obstacle, 0.25))) score += 500;
  }
  return score;
}

function compactWirePoints(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const point of points) {
    if (out.length === 0 || out[out.length - 1][0] !== point[0] || out[out.length - 1][1] !== point[1]) {
      out.push(point);
    }
  }
  return out;
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

function pinPoint(pin: ImportedPin): { x: number; y: number } {
  return pinWorldPos(pin.component, pin.pinIdx);
}

function tuplePoint(point: [number, number]): { x: number; y: number } {
  return { x: point[0], y: point[1] };
}

function isGlobalNet(node: string): boolean {
  return /^(vdd|vcc|vee|vss|vssa|vssd|avdd|dvdd|avss|dvss|\+?\d+v|-?\d+v)$/i.test(node);
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
  const dx = Math.sign(layout.x);
  const dy = Math.sign(layout.y);
  if (dx !== 0) return [pin.x + dx * 1.2, pin.y];
  if (dy !== 0) return [pin.x, pin.y + dy * 1.2];
  return [pin.x + 1.2, pin.y];
}
