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
import { normalizeCoord, normalizePoint, samePoint } from "./geometry.ts";

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

export function importNetlist(text: string): NetlistImportResult {
  const warnings: string[] = [];
  const { mainLines, subckts, structureDirectives } = splitSubcircuits(text, warnings);
  const main = parseNetlistLines(mainLines, warnings, true);
  const analysis: AnalysisSpec = main.analysis ?? { kind: "op" };
  const directives = [...structureDirectives, ...main.directives];

  const { components, wires } = layoutImportedParts(main.parts);
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

  const subPages = subckts.map((subckt) => {
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
    const layout = layoutImportedParts(parsed.parts, { externalPins: subckt.pins });
    return {
      ...emptyDoc.pages[0],
      id: makeId("page"),
      name: sanitizeSubcktName(subckt.name),
      description: "",
      components: layout.components,
      wires: layout.wires,
      probes: [],
    };
  });

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

function layoutImportedParts(
  parts: ImportedPart[],
  options: { externalPins?: string[] } = {},
) {
  const components: CircuitComponent[] = [];
  const wires: { id: string; points: [number, number][] }[] = [];
  const netPins = new Map<string, ImportedPin[]>();
  const rowGap = 7;
  const cols = Math.max(1, Math.ceil(Math.sqrt(parts.length || 1)));
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
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const rotation = defaultRotation(part.kind);
    const component: CircuitComponent = {
      id: makeId(part.kind.toLowerCase()),
      kind: part.kind,
      x: col * 12,
      y: row * rowGap,
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

  for (const [node, pins] of netPins) {
    if (node === "0") {
      for (const pin of pins.filter((p) => p.component.kind !== "LABEL")) {
        addGroundReference(components, wires, pin);
      }
      continue;
    }

    const connectablePins = pins.filter((pin) => pin.component.kind !== "LABEL");
    const hasExternalPort = pins.some((pin) => pin.component.kind === "LABEL" && pin.component.params?.port === "1");
    if (hasExternalPort || isGlobalNet(node) || connectablePins.length > 4) {
      for (const pin of connectablePins) addNetLabelStub(components, wires, node, pin);
      continue;
    }

    const routePins = connectablePins;
    if (routePins.length === 2) {
      addWireRoute(wires, routePins[0].point, routePins[1].point);
    } else if (routePins.length > 2 && routePins.length <= 5) {
      const junction = netJunctionPoint(routePins.map((pin) => pin.point));
      for (const pin of routePins) addWireRoute(wires, pin.point, junction);
    } else {
      for (const pin of connectablePins) addNetLabelStub(components, wires, node, pin);
    }
  }

  return { components, wires };
}

interface ImportedPin {
  component: CircuitComponent;
  pinIdx: number;
  point: { x: number; y: number };
}

function addNetPin(
  netPins: Map<string, ImportedPin[]>,
  node: string,
  component: CircuitComponent,
  pinIdx: number,
): void {
  const point = pinWorldPos(component, pinIdx);
  const pins = netPins.get(node) ?? [];
  pins.push({ component, pinIdx, point });
  netPins.set(node, pins);
}

function addGroundReference(
  components: CircuitComponent[],
  wires: { id: string; points: [number, number][] }[],
  pin: ImportedPin,
): void {
  const anchor = labelAnchor(pin.component, pin.pinIdx);
  addWireRoute(wires, pin.point, tuplePoint(anchor));
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
  addWireRoute(wires, pin.point, tuplePoint(anchor));
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
): void {
  const points = orthogonalRoute(from, to);
  if (points.length >= 2) wires.push({ id: makeId("w"), points });
}

function orthogonalRoute(
  from: { x: number; y: number },
  to: { x: number; y: number },
): [number, number][] {
  const start = normalizePoint(from);
  const end = normalizePoint(to);
  if (samePoint(start, end)) return [];
  const points: [number, number][] = [[start.x, start.y]];
  if (start.x !== end.x && start.y !== end.y) points.push([end.x, start.y]);
  points.push([end.x, end.y]);
  return compactWirePoints(points);
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
