import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
} from "elkjs/lib/elk.bundled.js";
import type { CircuitComponent, SchematicPage, Wire } from "./model.ts";
import {
  componentBoundsFor,
  boundsFromPoints,
  normalizeCoord,
  normalizeTuple,
  pointOnSegment,
  samePoint,
} from "./geometry.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import { autoFormatWiresAvoiding, autoFormatWireStops } from "./wireFormatting.ts";

const ELK_SCALE = 48;

interface LayoutPin {
  component: CircuitComponent;
  pinIdx: number;
}

interface LayoutNet {
  id: string;
  pins: LayoutPin[];
  junctionId?: string;
}

interface LayoutTopology {
  nets: LayoutNet[];
  anchors: CircuitComponent[];
}

export interface AutoArrangeResult {
  page: SchematicPage;
  movedComponentIds: string[];
  formattedWireIds: string[];
}

let elkPromise: Promise<ELK> | null = null;

function getElk(): Promise<ELK> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then(({ default: ElkConstructor }) => new ElkConstructor({
    defaultLayoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": "104",
      "elk.layered.spacing.edgeNodeBetweenLayers": "48",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
  }));
  return elkPromise;
}

export async function autoArrangePage(
  page: SchematicPage,
  selection: Set<string> = new Set(),
): Promise<AutoArrangeResult> {
  const selectedComponents = selection.size > 0
    ? page.components.filter((component) => selection.has(component.id) && component.kind !== "NOTE")
    : page.components.filter((component) => component.kind !== "NOTE");
  if (selectedComponents.length === 0) {
    return { page, movedComponentIds: [], formattedWireIds: [] };
  }

  const moveIds = new Set(selectedComponents.map((component) => component.id));
  const topology = layoutTopologyForPage(page, moveIds, selection.size > 0);
  const arranged = selectedComponents.map((component) => ({ ...component }));
  const anchors = topology.anchors.map((component) => ({ ...component }));
  const anchorOrigins = new Map(anchors.map((component) => [component.id, { x: component.x, y: component.y }]));
  const layoutComponents = [...arranged, ...anchors];
  const liveNets = remapLayoutNets(topology.nets, layoutComponents);
  await applyElkLayout(layoutComponents, liveNets);
  applyDeviceAwareLayout(arranged, liveNets);
  if (anchors.length > 0) {
    preserveExternalAnchorCentroid(anchorOrigins, anchors, arranged);
  } else {
    preserveArrangeCenter(selectedComponents, arranged);
  }

  const arrangedById = new Map(arranged.map((component) => [component.id, component]));
  const movedComponents = page.components.map((component) => arrangedById.get(component.id) ?? component);
  const movedPage = { ...page, components: movedComponents };
  const touchedWires = wireIdsTouchingComponents(page, moveIds, selection);
  const retargetedPage = retargetMovedWiresForArrange(page, movedPage, moveIds, touchedWires);
  const formattedPage = autoFormatWiresAvoiding(retargetedPage, touchedWires);

  return {
    page: formattedPage,
    movedComponentIds: [...moveIds],
    formattedWireIds: [...touchedWires],
  };
}

function layoutTopologyForPage(
  page: SchematicPage,
  moveIds: Set<string>,
  useExternalAnchors: boolean,
): LayoutTopology {
  const union = new DisjointSet();
  const pinKeys: string[] = [];
  const pinByKey = new Map<string, LayoutPin>();

  for (const component of page.components) {
    getPinLayout(component).forEach((_, pinIdx) => {
      const key = pinKey(component.id, pinIdx);
      const point = pinWorldPos(component, pinIdx);
      pinKeys.push(key);
      pinByKey.set(key, { component, pinIdx });
      union.add(key);
      union.union(key, pointKey(point.x, point.y));
    });
  }

  for (const wire of page.wires) {
    const wireKey = `w:${wire.id}`;
    union.add(wireKey);
    for (const [x, y] of wire.points) {
      union.union(wireKey, pointKey(x, y));
    }
    for (const [key, pin] of pinByKey) {
      const point = pinWorldPos(pin.component, pin.pinIdx);
      if (pointTouchesWirePath(point, wire)) union.union(key, wireKey);
    }
  }

  const pinsByRoot = new Map<string, LayoutPin[]>();
  for (const key of pinKeys) {
    const pin = pinByKey.get(key);
    if (!pin) continue;
    const root = union.find(key);
    const pins = pinsByRoot.get(root) ?? [];
    pins.push(pin);
    pinsByRoot.set(root, pins);
  }

  const nets: LayoutNet[] = [];
  const anchors: CircuitComponent[] = [];
  let idx = 0;
  for (const pins of pinsByRoot.values()) {
    const unique = dedupeLayoutPins(pins);
    const movablePins = unique.filter((pin) => moveIds.has(pin.component.id));
    if (movablePins.length === 0) continue;
    const externalPins = unique.filter((pin) => !moveIds.has(pin.component.id));
    let netPins = movablePins;
    if (useExternalAnchors && externalPins.length > 0) {
      const anchor = externalAnchorForPins(`anchor:${idx}`, externalPins);
      anchors.push(anchor);
      netPins = [...movablePins, { component: anchor, pinIdx: 0 }];
    }
    if (netPins.length < 2) continue;
    nets.push({
      id: `net:${idx++}`,
      pins: netPins,
      junctionId: netPins.length > 2 ? `junction:${idx}` : undefined,
    });
  }
  return { nets, anchors };
}

function remapLayoutNets(nets: LayoutNet[], components: CircuitComponent[]): LayoutNet[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  return nets.map((net) => ({
    ...net,
    pins: net.pins.flatMap((pin) => {
      const component = byId.get(pin.component.id);
      return component ? [{ component, pinIdx: pin.pinIdx }] : [];
    }),
  })).filter((net) => net.pins.length >= 2);
}

async function applyElkLayout(components: CircuitComponent[], nets: LayoutNet[]): Promise<void> {
  if (components.length === 0) return;
  const junctionNets = nets.filter((net) => net.junctionId);
  const graph: ElkNode = {
    id: "auto-layout-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "64",
      "elk.layered.spacing.nodeNodeBetweenLayers": "104",
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
    edges: nets.flatMap(netToElkEdges),
  };

  const laidOut = await (await getElk()).layout(graph);
  const byId = new Map((laidOut.children ?? []).map((child) => [child.id, child]));
  for (const component of components) {
    const node = byId.get(component.id);
    if (!node || node.x == null || node.y == null || node.width == null || node.height == null) continue;
    component.x = snapLayoutCoord((node.x + node.width / 2) / ELK_SCALE);
    component.y = snapLayoutCoord((node.y + node.height / 2) / ELK_SCALE);
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
      id: elkPortId(component.id, idx),
      width: 6,
      height: 6,
      layoutOptions: {
        "elk.port.side": elkPortSide(pin),
      },
    })),
  };
}

function netToElkEdges(net: LayoutNet): ElkExtendedEdge[] {
  if (net.junctionId) {
    return net.pins.map((pin, idx) => ({
      id: `${net.id}:${idx}`,
      sources: [elkPortId(pin.component.id, pin.pinIdx)],
      targets: [net.junctionId!],
    }));
  }
  if (net.pins.length !== 2) return [];
  return [
    {
      id: net.id,
      sources: [elkPortId(net.pins[0].component.id, net.pins[0].pinIdx)],
      targets: [elkPortId(net.pins[1].component.id, net.pins[1].pinIdx)],
    },
  ];
}

function preserveArrangeCenter(before: CircuitComponent[], after: CircuitComponent[]): void {
  const beforeBounds = componentGroupBounds(before);
  const afterBounds = componentGroupBounds(after);
  if (!beforeBounds || !afterBounds) return;
  const beforeCx = (beforeBounds.x1 + beforeBounds.x2) / 2;
  const beforeCy = (beforeBounds.y1 + beforeBounds.y2) / 2;
  const afterCx = (afterBounds.x1 + afterBounds.x2) / 2;
  const afterCy = (afterBounds.y1 + afterBounds.y2) / 2;
  const dx = snapLayoutCoord(beforeCx - afterCx);
  const dy = snapLayoutCoord(beforeCy - afterCy);
  for (const component of after) {
    component.x = normalizeCoord(component.x + dx);
    component.y = normalizeCoord(component.y + dy);
  }
}

function preserveExternalAnchorCentroid(
  origins: Map<string, { x: number; y: number }>,
  anchors: CircuitComponent[],
  arranged: CircuitComponent[],
): void {
  const originalPoints = anchors
    .map((anchor) => origins.get(anchor.id))
    .filter((point): point is { x: number; y: number } => Boolean(point));
  if (originalPoints.length === 0 || anchors.length === 0) return;
  const original = averagePoint(originalPoints);
  const current = averagePoint(anchors.map((anchor) => ({ x: anchor.x, y: anchor.y })));
  const dx = snapLayoutCoord(original.x - current.x);
  const dy = snapLayoutCoord(original.y - current.y);
  for (const component of arranged) {
    component.x = normalizeCoord(component.x + dx);
    component.y = normalizeCoord(component.y + dy);
  }
}

function componentGroupBounds(components: CircuitComponent[]) {
  return boundsFromPoints(
    components.map((component) => component.x),
    components.map((component) => component.y),
  );
}

function applyDeviceAwareLayout(components: CircuitComponent[], nets: LayoutNet[]): void {
  applyCmosPairHeuristics(components, nets);
  applySeriesMosStackHeuristics(components, nets);
  applySeriesPmosStackHeuristics(components, nets);
  applyShuntPartHeuristics(components, nets);
}

function applyCmosPairHeuristics(components: CircuitComponent[], nets: LayoutNet[]): void {
  const byId = new Map(components.map((component) => [component.id, component]));
  const pmoses = components.filter((component) => component.kind === "PMOS" || component.kind === "PMOS4");
  const nmoses = components.filter((component) => component.kind === "NMOS" || component.kind === "NMOS4");

  for (const pmos of pmoses) {
    for (const nmos of nmoses) {
      const pGate = netIdForPin(nets, pmos.id, 1);
      const nGate = netIdForPin(nets, nmos.id, 1);
      const pDrain = netIdForPin(nets, pmos.id, 0);
      const nDrain = netIdForPin(nets, nmos.id, 0);
      if (!pGate || !nGate || !pDrain || !nDrain) continue;
      if (pGate !== nGate || pDrain !== nDrain) continue;
      if (!byId.has(pmos.id) || !byId.has(nmos.id)) continue;

      const centerX = snapLayoutCoord((pmos.x + nmos.x) / 2);
      const centerY = snapLayoutCoord((pmos.y + nmos.y) / 2);
      pmos.x = centerX;
      pmos.y = normalizeCoord(centerY - 2);
      pmos.rotation = 180;
      nmos.x = centerX;
      nmos.y = normalizeCoord(centerY + 2);
      nmos.rotation = 0;
    }
  }
}

function applySeriesMosStackHeuristics(components: CircuitComponent[], nets: LayoutNet[]): void {
  const nmoses = components.filter((component) => component.kind === "NMOS" || component.kind === "NMOS4");
  for (const topCandidate of nmoses) {
    for (const bottomCandidate of nmoses) {
      if (topCandidate.id === bottomCandidate.id) continue;
      const topSource = netIdForPin(nets, topCandidate.id, 2);
      const bottomDrain = netIdForPin(nets, bottomCandidate.id, 0);
      if (!topSource || topSource !== bottomDrain) continue;
      const sharedNet = netForPin(nets, topCandidate.id, 2);
      if (!sharedNet || netIsRail(sharedNet)) continue;
      const centerX = snapLayoutCoord((topCandidate.x + bottomCandidate.x) / 2);
      const centerY = snapLayoutCoord((topCandidate.y + bottomCandidate.y) / 2);
      topCandidate.x = centerX;
      topCandidate.y = normalizeCoord(centerY - 2);
      topCandidate.rotation = 0;
      bottomCandidate.x = centerX;
      bottomCandidate.y = normalizeCoord(centerY + 2);
      bottomCandidate.rotation = 0;
    }
  }
}

function applySeriesPmosStackHeuristics(components: CircuitComponent[], nets: LayoutNet[]): void {
  const pmoses = components.filter((component) => component.kind === "PMOS" || component.kind === "PMOS4");
  for (const lowerCandidate of pmoses) {
    for (const upperCandidate of pmoses) {
      if (lowerCandidate.id === upperCandidate.id) continue;
      const lowerSource = netIdForPin(nets, lowerCandidate.id, 2);
      const upperDrain = netIdForPin(nets, upperCandidate.id, 0);
      if (!lowerSource || lowerSource !== upperDrain) continue;
      const sharedNet = netForPin(nets, lowerCandidate.id, 2);
      if (!sharedNet || netIsRail(sharedNet)) continue;
      const centerX = snapLayoutCoord((lowerCandidate.x + upperCandidate.x) / 2);
      const centerY = snapLayoutCoord((lowerCandidate.y + upperCandidate.y) / 2);
      upperCandidate.x = centerX;
      upperCandidate.y = normalizeCoord(centerY - 2);
      upperCandidate.rotation = 180;
      lowerCandidate.x = centerX;
      lowerCandidate.y = normalizeCoord(centerY + 2);
      lowerCandidate.rotation = 180;
    }
  }
}

function netIdForPin(nets: LayoutNet[], componentId: string, pinIdx: number): string | null {
  for (const net of nets) {
    if (net.pins.some((pin) => pin.component.id === componentId && pin.pinIdx === pinIdx)) return net.id;
  }
  return null;
}

function applyShuntPartHeuristics(components: CircuitComponent[], nets: LayoutNet[]): void {
  const componentIds = new Set(components.map((component) => component.id));
  for (const component of components) {
    if (!isPassiveKind(component.kind)) continue;
    const net0 = netForPin(nets, component.id, 0);
    const net1 = netForPin(nets, component.id, 1);
    if (!net0 || !net1) continue;
    const net0Rail = netIsRail(net0);
    const net1Rail = netIsRail(net1);
    if (net0Rail === net1Rail) continue;

    const signalIdx = net0Rail ? 1 : 0;
    const signalNet = net0Rail ? net1 : net0;
    const railNet = net0Rail ? net0 : net1;
    const anchor = signalAnchorForShunt(component, signalNet);
    if (!anchor) continue;

    const railAbove = netIsPositiveRail(railNet);
    orientShuntPart(component, signalIdx, !railAbove);
    component.x = shuntX(component, anchor, signalNet);
    component.y = normalizeCoord(anchor.y + (railAbove ? -2 : 2));
    alignMovableRailSymbols(component, signalIdx, railNet, componentIds);
  }
}

function isPassiveKind(kind: string): boolean {
  return kind === "R" || kind === "C" || kind === "L";
}

function netForPin(nets: LayoutNet[], componentId: string, pinIdx: number): LayoutNet | null {
  return nets.find((net) =>
    net.pins.some((pin) => pin.component.id === componentId && pin.pinIdx === pinIdx),
  ) ?? null;
}

function netIsRail(net: LayoutNet): boolean {
  return net.pins.some((pin) => pin.component.kind === "GND" || isGlobalLabel(pin.component));
}

function netIsPositiveRail(net: LayoutNet): boolean {
  return net.pins.some((pin) => isGlobalLabel(pin.component) && isPositiveRailLabel(pin.component.value));
}

function isGlobalLabel(component: CircuitComponent): boolean {
  return component.kind === "LABEL" && isGlobalLabelValue(component.value);
}

function isGlobalLabelValue(value: string): boolean {
  return /^(vdd|vcc|vee|vss|vssa|vssd|avdd|dvdd|avss|dvss|\+?\d+v|-?\d+v)$/i.test(value.trim());
}

function isPositiveRailLabel(value: string): boolean {
  return /^(vdd|vcc|avdd|dvdd|\+?\d+v)$/i.test(value.trim());
}

function signalAnchorForShunt(
  component: CircuitComponent,
  net: LayoutNet,
): { x: number; y: number } | null {
  const pins = net.pins.filter((pin) =>
    pin.component.id !== component.id &&
    pin.component.kind !== "LABEL" &&
    pin.component.kind !== "GND"
  );
  if (pins.length === 0) return null;
  return averagePoint(pins.map((pin) => pinWorldPos(pin.component, pin.pinIdx)));
}

function shuntX(component: CircuitComponent, anchor: { x: number; y: number }, net: LayoutNet): number {
  const touchesActiveDevice = net.pins.some((pin) =>
    pin.component.id !== component.id && isActiveDeviceKind(pin.component.kind),
  );
  if (!touchesActiveDevice) return normalizeCoord(anchor.x);
  if (net.pins.some((pin) => isOutputPin(pin))) return normalizeCoord(anchor.x + 4);
  const side = component.x >= anchor.x ? 1 : -1;
  return normalizeCoord(anchor.x + side * 4);
}

function isOutputPin(pin: LayoutPin): boolean {
  return pin.component.kind === "OPAMP" && pin.pinIdx === 2;
}

function isActiveDeviceKind(kind: string): boolean {
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

function alignMovableRailSymbols(
  component: CircuitComponent,
  signalIdx: number,
  railNet: LayoutNet,
  movableComponentIds: Set<string>,
): void {
  const railPinIdx = signalIdx === 0 ? 1 : 0;
  const railPoint = pinWorldPos(component, railPinIdx);
  for (const pin of railNet.pins) {
    if (!movableComponentIds.has(pin.component.id)) continue;
    if (pin.component.kind === "GND") {
      pin.component.x = normalizeCoord(railPoint.x);
      pin.component.y = normalizeCoord(railPoint.y + 1.2);
    } else if (isGlobalLabel(pin.component)) {
      pin.component.x = normalizeCoord(railPoint.x);
      pin.component.y = normalizeCoord(railPoint.y - 1.2);
    }
  }
}

function externalAnchorForPins(id: string, pins: LayoutPin[]): CircuitComponent {
  const point = averagePoint(pins.map((pin) => pinWorldPos(pin.component, pin.pinIdx)));
  return {
    id,
    kind: "LABEL",
    x: snapLayoutCoord(point.x),
    y: snapLayoutCoord(point.y),
    rotation: 0,
    value: "",
  };
}

function averagePoint(points: { x: number; y: number }[]): { x: number; y: number } {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function wireIdsTouchingComponents(
  page: SchematicPage,
  componentIds: Set<string>,
  selection: Set<string>,
): Set<string> {
  const target = new Set<string>();
  for (const wire of page.wires) {
    if (selection.has(wire.id)) target.add(wire.id);
  }
  const components = page.components.filter((component) => componentIds.has(component.id));
  for (const wire of page.wires) {
    if (target.has(wire.id)) continue;
    if (components.some((component) =>
      getPinLayout(component).some((_, pinIdx) => pointTouchesWirePath(pinWorldPos(component, pinIdx), wire)),
    )) {
      target.add(wire.id);
    }
  }
  return target;
}

function retargetMovedWiresForArrange(
  before: SchematicPage,
  after: SchematicPage,
  movedComponentIds: Set<string>,
  touchedWireIds: Set<string>,
): SchematicPage {
  const movedPinPoints = movedPinPointMap(before, after, movedComponentIds);
  if (movedPinPoints.size === 0 || touchedWireIds.size === 0) return after;
  const beforeWireById = new Map(before.wires.map((wire) => [wire.id, wire]));
  const wires = after.wires.map((wire) => {
    if (!touchedWireIds.has(wire.id)) return wire;
    const beforeWire = beforeWireById.get(wire.id) ?? wire;
    const stops = autoFormatWireStops(beforeWire, before);
    const points = compactWirePoints(stops.map((point) =>
      movedPinPoints.get(pointKey(point[0], point[1])) ?? point,
    ));
    return points.length >= 2 ? { ...wire, points } : wire;
  });
  return { ...after, wires };
}

function movedPinPointMap(
  before: SchematicPage,
  after: SchematicPage,
  movedComponentIds: Set<string>,
): Map<string, [number, number]> {
  const afterById = new Map(after.components.map((component) => [component.id, component]));
  const map = new Map<string, [number, number]>();
  for (const component of before.components) {
    if (!movedComponentIds.has(component.id)) continue;
    const moved = afterById.get(component.id);
    if (!moved) continue;
    getPinLayout(component).forEach((_, pinIdx) => {
      const oldPoint = pinWorldPos(component, pinIdx);
      const newPoint = pinWorldPos(moved, pinIdx);
      map.set(pointKey(oldPoint.x, oldPoint.y), normalizeTuple([newPoint.x, newPoint.y]));
    });
  }
  return map;
}

function pointTouchesWirePath(point: { x: number; y: number }, wire: Wire): boolean {
  if (wire.points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let idx = 0; idx < wire.points.length - 1; idx++) {
    const [x1, y1] = wire.points[idx];
    const [x2, y2] = wire.points[idx + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}

function dedupeLayoutPins(pins: LayoutPin[]): LayoutPin[] {
  const seen = new Set<string>();
  const out: LayoutPin[] = [];
  for (const pin of pins) {
    const key = pinKey(pin.component.id, pin.pinIdx);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pin);
  }
  return out;
}

function compactWirePoints(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const point of points.map(normalizeTuple)) {
    if (out.length === 0 || !sameTuple(out[out.length - 1], point)) out.push(point);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let idx = 1; idx < out.length - 1; idx++) {
      const prev = out[idx - 1];
      const cur = out[idx];
      const next = out[idx + 1];
      if ((prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1])) {
        out.splice(idx, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function sameTuple(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function elkPortId(componentId: string, pinIdx: number): string {
  return `${componentId}:pin:${pinIdx}`;
}

function elkPortSide(pin: { x: number; y: number }): string {
  if (Math.abs(pin.x) >= Math.abs(pin.y)) return pin.x < 0 ? "WEST" : "EAST";
  return pin.y < 0 ? "NORTH" : "SOUTH";
}

function pinKey(componentId: string, pinIdx: number): string {
  return `p:${componentId}:${pinIdx}`;
}

function pointKey(x: number, y: number): string {
  return `${normalizeCoord(x)},${normalizeCoord(y)}`;
}

function snapLayoutCoord(value: number): number {
  return normalizeCoord(Math.round(value * 2) / 2);
}

class DisjointSet {
  private parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}
