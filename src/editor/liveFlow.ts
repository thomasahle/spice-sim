export const LIVE_FLOW_MIN_MAGNITUDE = 0.015;
export const LIVE_FLOW_MIN_ABSOLUTE_CURRENT = 1e-8;
export const LIVE_FLOW_FULL_ABSOLUTE_CURRENT = 1e-3;
const LIVE_FLOW_ABSOLUTE_MAGNITUDE_FLOOR = 0.18;
const LIVE_FLOW_STATUS_CURRENT_FLOOR = 1e-12;

export interface LiveFlowVisual {
  active: boolean;
  magnitude: number;
  direction: 1 | -1;
  opacity: number;
  durationSeconds: number;
  strokeMultiplier: number;
  dash: number;
  gap: number;
}

export interface LiveFlowSample {
  signedCurrent: number;
  normalizedCurrent: number;
  source: LiveFlowSampleSource;
}

export const LIVE_FLOW_SAMPLE_SOURCES = ["ngspice"] as const;
export type LiveFlowSampleSource = typeof LIVE_FLOW_SAMPLE_SOURCES[number];

export function isLiveFlowSampleSource(source: unknown): source is LiveFlowSampleSource {
  return source === "ngspice";
}

export interface LiveFlowRawSample {
  current: unknown;
  source?: unknown;
}

export function normalizeLiveFlowSamples<T extends string>(
  raw: Iterable<[T, LiveFlowRawSample]>,
  scaleCurrents: Iterable<number> = [],
): Map<T, LiveFlowSample> {
  const entries = Array.from(raw).filter((entry): entry is [T, { current: number; source: LiveFlowSampleSource }] => {
    const current = entry[1]?.current;
    return typeof current === "number" && Number.isFinite(current) && isLiveFlowSampleSource(entry[1]?.source);
  });
  let maxI = 1e-15;
  for (const [, sample] of entries) {
    if (Math.abs(sample.current) > maxI) maxI = Math.abs(sample.current);
  }
  for (const current of scaleCurrents) {
    if (Number.isFinite(current) && Math.abs(current) > maxI) {
      maxI = Math.abs(current);
    }
  }
  const out = new Map<T, LiveFlowSample>();
  for (const [id, sample] of entries) {
    out.set(id, {
      signedCurrent: sample.current,
      normalizedCurrent: sample.current / maxI,
      source: sample.source,
    });
  }
  return out;
}

export interface LiveFlowAnimationStyle {
  opacity: number;
  "--flow-duration": string;
  "--flow-cycle": string;
  "--flow-dash": string;
  "--flow-gap": string;
  "--flow-offset": string;
}

export function liveFlowVisual(
  magnitude: number | undefined,
  absoluteCurrent?: number,
): LiveFlowVisual {
  const normalized =
    typeof magnitude === "number" && Number.isFinite(magnitude)
      ? Math.max(0, Math.min(1, magnitude))
      : 0;
  const currentMagnitude =
    typeof absoluteCurrent === "number" && Number.isFinite(absoluteCurrent)
      ? Math.abs(absoluteCurrent)
      : undefined;
  const absoluteIntensity =
    currentMagnitude === undefined
      ? 1
      : liveFlowAbsoluteIntensity(currentMagnitude);
  const visualMagnitude = Math.max(
    normalized,
    currentMagnitude === undefined
      ? 0
      : absoluteIntensity * LIVE_FLOW_ABSOLUTE_MAGNITUDE_FLOOR,
  );
  const intensity = Math.sqrt(visualMagnitude) * (0.28 + 0.72 * absoluteIntensity);
  const currentIsVisible =
    currentMagnitude === undefined || currentMagnitude >= LIVE_FLOW_MIN_ABSOLUTE_CURRENT;

  return {
    active: currentIsVisible && visualMagnitude >= LIVE_FLOW_MIN_MAGNITUDE,
    magnitude: visualMagnitude,
    direction: 1,
    opacity: 0.22 + 0.62 * intensity,
    durationSeconds: Math.max(0.16, 0.95 - 0.68 * intensity),
    strokeMultiplier: 1.05 + 0.4 * intensity,
    dash: 0.14 + 0.08 * intensity,
    gap: 0.5 - 0.1 * intensity,
  };
}

export function liveFlowAbsoluteIntensity(currentMagnitude: number): number {
  if (!Number.isFinite(currentMagnitude) || currentMagnitude <= LIVE_FLOW_MIN_ABSOLUTE_CURRENT) {
    return 0;
  }
  if (currentMagnitude >= LIVE_FLOW_FULL_ABSOLUTE_CURRENT) return 1;
  const min = Math.log10(LIVE_FLOW_MIN_ABSOLUTE_CURRENT);
  const max = Math.log10(LIVE_FLOW_FULL_ABSOLUTE_CURRENT);
  return Math.max(0, Math.min(1, (Math.log10(currentMagnitude) - min) / (max - min)));
}

export function liveFlowVisualFromSignedCurrent(
  current: number | undefined,
  absoluteCurrent?: number,
): LiveFlowVisual {
  const visual = liveFlowVisual(
    typeof current === "number" && Number.isFinite(current)
      ? Math.abs(current)
      : undefined,
    absoluteCurrent,
  );
  return {
    ...visual,
    direction: typeof current === "number" && current < 0 ? -1 : 1,
  };
}

export function liveFlowVisualFromSample(sample: LiveFlowSample | undefined): LiveFlowVisual {
  if (sample?.source !== "ngspice") return liveFlowVisualFromSignedCurrent(undefined);
  return liveFlowVisualFromSignedCurrent(sample?.normalizedCurrent, sample?.signedCurrent);
}

export function liveFlowAnimationStyle(flow: LiveFlowVisual, phase: number): LiveFlowAnimationStyle {
  return {
    opacity: flow.opacity,
    "--flow-duration": `${flow.durationSeconds}s`,
    "--flow-cycle": `${flow.dash + flow.gap}`,
    "--flow-dash": `${flow.dash}`,
    "--flow-gap": `${flow.gap}`,
    "--flow-offset": `${phase}`,
  };
}

export function liveFlowPhaseForId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 720) / 1000;
}

export function formatLiveFlowCurrent(current: number | undefined): string {
  if (typeof current !== "number" || !Number.isFinite(current)) return "unknown current";
  const a = Math.abs(current);
  if (a === 0) return "0 A";
  const prefixes: Array<[number, string]> = [
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  if (a < 1e-15) return "<1.00 fA";
  const [scale, prefix] = prefixes.find(([candidate]) => a >= candidate) ?? [1e-15, "f"];
  return `${(current / scale).toPrecision(3)} ${prefix}A`;
}

export interface LiveFlowReadoutText {
  label: string;
  detail: string | null;
  title: string;
  showArrow: boolean;
}

export function liveFlowReadoutSourceClass(
  sample: Pick<LiveFlowSample, "source"> | undefined,
): "ngspice" | "unsampled" {
  if (sample?.source === "ngspice") return "ngspice";
  return "unsampled";
}

export function liveFlowReadoutText(
  sample: LiveFlowSample | undefined,
  active: boolean,
): LiveFlowReadoutText {
  if (sample?.source !== "ngspice") {
    return {
      label: "No ngspice sample",
      detail: null,
      title: "No ngspice current-vector sample is available for this wire at the selected transient time.",
      showArrow: false,
    };
  }
  const currentLabel = formatLiveFlowCurrent(sample.signedCurrent);
  const sourceTitle = "from ngspice current vectors";
  if (!active) {
    return {
      label: currentLabel,
      detail: "ngspice · low",
      title: `Live Flow is below the ${formatLiveFlowCurrent(LIVE_FLOW_MIN_ABSOLUTE_CURRENT)} display threshold here: ${currentLabel}, sampled ${sourceTitle}.`,
      showArrow: false,
    };
  }
  return {
    label: currentLabel,
    detail: "ngspice",
    title: `Live Flow: ${currentLabel}, sampled ${sourceTitle}.`,
    showArrow: true,
  };
}

export function liveFlowReadoutWidth(readout: LiveFlowReadoutText): number {
  const textUnits = readout.label.length + (readout.detail?.length ?? 0);
  const arrowUnits = readout.showArrow ? 0.9 : 0.55;
  const detailUnits = readout.detail ? 0.42 : 0;
  return Math.min(4.8, Math.max(1.8, textUnits * 0.17 + arrowUnits + detailUnits));
}

export function liveFlowWireHasVisibleLength(
  wirePoints: [number, number][],
  epsilon = 1e-6,
): boolean {
  for (let idx = 0; idx < wirePoints.length - 1; idx++) {
    if (segmentLength(wirePoints[idx], wirePoints[idx + 1]) > epsilon) return true;
  }
  return false;
}

export function wireFlowSignedCurrent(
  componentCurrent: number,
  attachedPinIndex: number,
  pinCount: number,
): number | null {
  if (!Number.isFinite(componentCurrent)) return null;
  if (pinCount !== 2) {
    // Ngspice reports one branch current for many active devices, typically
    // drain/collector current. Do not animate gate/base/bulk control pins from
    // that scalar; it suggests impossible current through insulated/control
    // terminals and makes MOS-heavy circuits look electrically wrong.
    if (attachedPinIndex === 0) return -componentCurrent;
    if (attachedPinIndex === 2) return componentCurrent;
    return null;
  }
  // SPICE branch current is conventionally through the part from pin 0 to pin 1.
  // On the pin-0 lead that current is entering the component, so the visible
  // lead flow is opposite the wire's outgoing geometry.
  return attachedPinIndex === 0 ? -componentCurrent : componentCurrent;
}

export function wireFlowSignedCurrentAlongPolyline(
  componentCurrent: number,
  attachedPinIndex: number,
  pinCount: number,
  attachedAtStart: boolean,
  currentKind: "branch" | "terminal" = "branch",
): number | null {
  if (currentKind === "terminal") {
    if (!Number.isFinite(componentCurrent)) return null;
    // Ngspice terminal currents are positive into that device terminal. If the
    // wire polyline starts at the pin, visible flow is opposite the polyline;
    // if the pin is at the end, visible flow is along the polyline.
    return attachedAtStart ? -componentCurrent : componentCurrent;
  }
  const currentFromAttachment = wireFlowSignedCurrent(
    componentCurrent,
    attachedPinIndex,
    pinCount,
  );
  if (currentFromAttachment === null) return null;
  return attachedAtStart ? currentFromAttachment : -currentFromAttachment;
}

export function liveFlowCurrentTraceCandidates(kind: string, refdes: string): string[] {
  const rd = refdes.trim().toLowerCase();
  if (!rd) return [];
  const deviceCurrent = (name: string) => [`i(@${rd}[${name}])`, `@${rd}[${name}]`];
  const base = [...deviceCurrent("i"), `${rd}#branch`, `i(${rd})`];
  switch (kind) {
    case "I":
      return [...deviceCurrent("current"), ...base];
    case "D":
    case "LED":
    case "ZENER":
      return [...deviceCurrent("id"), ...base];
    case "BJT":
    case "NPN":
    case "PNP":
      return [...deviceCurrent("ic"), ...deviceCurrent("ie"), ...deviceCurrent("ib"), ...base];
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return [...deviceCurrent("id"), ...deviceCurrent("is"), ...base];
    default:
      return base;
  }
}

export function liveFlowTerminalCurrentTraceCandidates(
  kind: string,
  refdes: string,
  pinIndex: number,
): string[] {
  const rd = refdes.trim().toLowerCase();
  if (!rd) return [];
  const deviceCurrent = (name: string) => [`i(@${rd}[${name}])`, `@${rd}[${name}]`];
  switch (kind) {
    case "BJT":
    case "NPN":
    case "PNP":
      return [
        deviceCurrent("ic"),
        deviceCurrent("ib"),
        deviceCurrent("ie"),
      ][pinIndex] ?? [];
    case "NMOS":
    case "PMOS":
      return [
        deviceCurrent("id"),
        deviceCurrent("ig"),
        deviceCurrent("is"),
      ][pinIndex] ?? [];
    case "NMOS4":
    case "PMOS4":
      return [
        deviceCurrent("id"),
        deviceCurrent("ig"),
        deviceCurrent("is"),
        deviceCurrent("ib"),
      ][pinIndex] ?? [];
    default:
      return [];
  }
}

export function liveFlowRequiresTerminalCurrent(kind: string): boolean {
  return (
    kind === "BJT" ||
    kind === "NPN" ||
    kind === "PNP" ||
    kind === "NMOS" ||
    kind === "PMOS" ||
    kind === "NMOS4" ||
    kind === "PMOS4" ||
    kind === "OPAMP"
  );
}

export interface WireFlowAttachment {
  attachedAtStart: boolean;
  distance: number;
  pathDistance: number;
}

export interface WireFlowCandidate {
  componentCurrent: number;
  source: LiveFlowSampleSource;
  attachedPinIndex: number;
  pinCount: number;
  attachedAtStart: boolean;
  distance: number;
  currentKind?: "branch" | "terminal";
}

export interface WireFlowCandidateSample {
  signedCurrent: number;
  source: LiveFlowSampleSource;
  distance: number;
}

export function wireFlowSampleFromCandidates(
  candidates: WireFlowCandidate[],
): WireFlowCandidateSample | null {
  let best: WireFlowCandidateSample | null = null;
  const tieTolerance = 1e-6;
  for (const candidate of candidates) {
    const signedCurrent = wireFlowSignedCurrentAlongPolyline(
      candidate.componentCurrent,
      candidate.attachedPinIndex,
      candidate.pinCount,
      candidate.attachedAtStart,
      candidate.currentKind,
    );
    if (signedCurrent === null) continue;
    const sample = {
      signedCurrent,
      source: candidate.source,
      distance: candidate.distance,
    };
    if (!best) {
      best = sample;
      continue;
    }
    const distanceDelta = sample.distance - best.distance;
    if (distanceDelta < -tieTolerance) {
      best = sample;
      continue;
    }
  }
  return best;
}

export interface LiveFlowReadoutPosition {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface LiveFlowReadoutBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LiveFlowReadoutPlacementOptions {
  width?: number;
  height?: number;
  obstacles?: LiveFlowReadoutBounds[];
}

export function liveFlowReadoutPosition(
  wirePoints: [number, number][],
  offset = 0.38,
  options: LiveFlowReadoutPlacementOptions = {},
): LiveFlowReadoutPosition | null {
  if (wirePoints.length === 0) return null;
  if (wirePoints.length === 1) {
    return { x: wirePoints[0][0], y: wirePoints[0][1] - offset, dx: 1, dy: 0 };
  }

  const candidates: Array<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    length: number;
    preferredSide: boolean;
    centerBias: number;
  }> = [];
  for (let idx = 0; idx < wirePoints.length - 1; idx++) {
    const start = wirePoints[idx];
    const end = wirePoints[idx + 1];
    const length = segmentLength(start, end);
    if (length <= 0) continue;
    const dx = (end[0] - start[0]) / length;
    const dy = (end[1] - start[1]) / length;
    const normal = liveFlowReadoutNormal(dx, dy);
    const sideCandidates = [
      { normal, preferredSide: true },
      { normal: { x: -normal.x, y: -normal.y }, preferredSide: false },
    ];
    for (const t of liveFlowReadoutSegmentFractions(length)) {
      const centerX = start[0] + (end[0] - start[0]) * t;
      const centerY = start[1] + (end[1] - start[1]) * t;
      for (const side of sideCandidates) {
        candidates.push({
          x: centerX + side.normal.x * offset,
          y: centerY + side.normal.y * offset,
          dx,
          dy,
          length,
          preferredSide: side.preferredSide,
          centerBias: Math.abs(t - 0.5),
        });
      }
    }
  }
  if (candidates.length === 0) return null;

  const width = Math.max(0, options.width ?? 0);
  const height = Math.max(0, options.height ?? 0);
  const obstacles = options.obstacles ?? [];
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const bounds = liveFlowReadoutBounds(candidate.x, candidate.y, width, height);
    const score =
      liveFlowReadoutObstacleScore(bounds, obstacles) +
      (candidate.preferredSide ? 0 : 0.18) +
      candidate.centerBias * 0.28 -
      candidate.length * 0.012;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return { x: best.x, y: best.y, dx: best.dx, dy: best.dy };
}

function liveFlowReadoutNormal(dx: number, dy: number): { x: number; y: number } {
  let nx = -dy;
  let ny = dx;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal-ish wires read better above the segment. This preserves the
    // old horizontal placement while keeping diagonal labels off the line.
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
  } else if (nx < 0) {
    // Vertical-ish wires read better to the right, matching common schematic
    // annotation placement.
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function liveFlowReadoutSegmentFractions(length: number): number[] {
  if (length < 2.2) return [0.5];
  return [0.5, 0.36, 0.64];
}

export function liveFlowReadoutBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): LiveFlowReadoutBounds {
  return {
    x1: x - width / 2,
    y1: y - height / 2,
    x2: x + width / 2,
    y2: y + height / 2,
  };
}

export function liveFlowWireObstacleBounds(
  wirePoints: [number, number][],
  pad = 0.12,
): LiveFlowReadoutBounds[] {
  const bounds: LiveFlowReadoutBounds[] = [];
  for (let idx = 0; idx < wirePoints.length - 1; idx++) {
    const start = wirePoints[idx];
    const end = wirePoints[idx + 1];
    if (segmentLength(start, end) <= 0) continue;
    bounds.push({
      x1: Math.min(start[0], end[0]) - pad,
      y1: Math.min(start[1], end[1]) - pad,
      x2: Math.max(start[0], end[0]) + pad,
      y2: Math.max(start[1], end[1]) + pad,
    });
  }
  return bounds;
}

function liveFlowReadoutObstacleScore(
  bounds: LiveFlowReadoutBounds,
  obstacles: LiveFlowReadoutBounds[],
): number {
  let score = 0;
  for (const obstacle of obstacles) {
    const area = rectOverlapArea(bounds, obstacle);
    if (area <= 0) continue;
    score += 18 + area * 240;
  }
  return score;
}

function rectOverlapArea(a: LiveFlowReadoutBounds, b: LiveFlowReadoutBounds): number {
  const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return x * y;
}

export function liveFlowReadoutArrow(
  readout: Pick<LiveFlowReadoutPosition, "dx" | "dy">,
  direction: 1 | -1,
): "→" | "←" | "↓" | "↑" {
  const dx = readout.dx * direction;
  const dy = readout.dy * direction;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "→" : "←";
  return dy >= 0 ? "↓" : "↑";
}

export function wireFlowAttachmentForPoint(
  wirePoints: [number, number][],
  point: { x: number; y: number },
  endpointTolerance = 0.6,
  bodyTolerance = 0.08,
): WireFlowAttachment | null {
  if (wirePoints.length === 0) return null;
  if (wirePoints.length === 1) {
    const only = wirePoints[0];
    const distance = Math.hypot(point.x - only[0], point.y - only[1]);
    return distance <= endpointTolerance
      ? { attachedAtStart: true, distance, pathDistance: 0 }
      : null;
  }

  let totalLength = 0;
  for (let idx = 0; idx < wirePoints.length - 1; idx++) {
    totalLength += segmentLength(wirePoints[idx], wirePoints[idx + 1]);
  }

  const first = wirePoints[0];
  const last = wirePoints[wirePoints.length - 1];
  const endpointCandidates: WireFlowAttachment[] = [
    {
      attachedAtStart: true,
      distance: Math.hypot(point.x - first[0], point.y - first[1]),
      pathDistance: 0,
    },
    {
      attachedAtStart: false,
      distance: Math.hypot(point.x - last[0], point.y - last[1]),
      pathDistance: totalLength,
    },
  ].filter((candidate) => candidate.distance <= endpointTolerance);

  let bestBody: WireFlowAttachment | null = null;
  let travelled = 0;
  for (let idx = 0; idx < wirePoints.length - 1; idx++) {
    const start = wirePoints[idx];
    const end = wirePoints[idx + 1];
    const segment = closestPointOnSegment(point, start, end);
    if (segment) {
      const pathDistance = travelled + segment.distanceAlongSegment;
      const candidate = {
        attachedAtStart: pathDistance <= totalLength / 2,
        distance: segment.distance,
        pathDistance,
      };
      if (
        candidate.distance <= bodyTolerance &&
        (!bestBody || candidate.distance < bestBody.distance)
      ) {
        bestBody = candidate;
      }
    }
    travelled += segmentLength(start, end);
  }

  const bestEndpoint = endpointCandidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
  if (bestBody && (!bestEndpoint || bestBody.distance <= bestEndpoint.distance)) return bestBody;
  return bestEndpoint;
}

function segmentLength(start: [number, number], end: [number, number]): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function closestPointOnSegment(
  point: { x: number; y: number },
  start: [number, number],
  end: [number, number],
): { distance: number; distanceAlongSegment: number } | null {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) return null;
  const t = Math.max(0, Math.min(1, ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / len2));
  const projectedX = start[0] + t * dx;
  const projectedY = start[1] + t * dy;
  return {
    distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    distanceAlongSegment: Math.sqrt(len2) * t,
  };
}

export type LiveFlowStatusTone = "ready" | "muted" | "warning";

export interface LiveFlowStatus {
  show: boolean;
  label: string;
  title: string;
  tone: LiveFlowStatusTone;
  source: "none" | "ngspice";
}

export interface LiveFlowStatusInput {
  enabled: boolean;
  hasResult?: boolean;
  analysisKind?: string;
  isTransient: boolean;
  simulationStale: boolean;
  floatingPinCount: number;
  visibleWireCount?: number;
  activeWireCount: number;
  sampledWireCount: number;
  ngspiceWireCount?: number;
  strongestCurrent?: number;
}

export function liveFlowStatus(input: LiveFlowStatusInput): LiveFlowStatus {
  const currentLabel = liveFlowStatusCurrentLabel(input.strongestCurrent);
  if (!input.enabled) {
    return {
      show: false,
      label: "Off",
      title: "Animate current flow on wires at the selected transient time.",
      tone: "muted",
      source: "none",
    };
  }
  if (input.hasResult === false) {
    if (input.analysisKind && input.analysisKind !== "tran") {
      return {
        show: true,
        label: "Needs transient",
        title: "Switch analysis to transient, then run the simulation to animate wire current flow.",
        tone: "warning",
        source: "none",
      };
    }
    return {
      show: true,
      label: "Run transient",
      title: "Run a transient simulation to animate wire current flow.",
      tone: "muted",
      source: "none",
    };
  }
  if (!input.isTransient) {
    return {
      show: true,
      label: "Needs transient",
      title: "Live Flow needs a transient simulation result.",
      tone: "warning",
      source: "none",
    };
  }
  if (input.simulationStale) {
    return {
      show: true,
      label: "Run needed",
      title: "Run the transient simulation again to refresh Live Flow.",
      tone: "warning",
      source: "none",
    };
  }
  if (input.floatingPinCount > 0) {
    return {
      show: true,
      label: "Fix pins",
      title: "Live Flow is paused because the last run reported floating pins.",
      tone: "warning",
      source: "none",
    };
  }
  const counts = liveFlowStatusCounts(input);
  if (counts.visible === 0) {
    return {
      show: true,
      label: "No wires",
      title: "The transient result is ready, but there are no visible wires to animate. Draw or connect wires, then run again.",
      tone: "muted",
      source: "none",
    };
  }
  if (counts.sampled === 0) {
    const coverageTitle = liveFlowWireCoverageTitle(input);
    return {
      show: true,
      label: "No ngspice",
      title: coverageTitle
        ? `No ngspice current-vector samples were found for the visible wires. ${coverageTitle} Live Flow only animates wires with ngspice current vectors.`
        : "No ngspice current-vector samples were found for the visible wires. Live Flow only animates wires with ngspice current vectors.",
      tone: "warning",
      source: "none",
    };
  }
  if (counts.sampledNgspice === 0) {
    return {
      show: true,
      label: "No ngspice",
      title: `${liveFlowWireCoverageTitle(input)} No ngspice current-vector coverage is available. Live Flow only animates wires with ngspice current vectors.`,
      tone: "warning",
      source: "none",
    };
  }
  if (counts.activeNgspice === 0) {
    const thresholdLabel = formatLiveFlowCurrent(LIVE_FLOW_MIN_ABSOLUTE_CURRENT);
    const currentContext = currentLabel
      ? `Strongest sampled wire current: ${currentLabel}.`
      : `Strongest sampled wire current is below ${formatLiveFlowCurrent(LIVE_FLOW_STATUS_CURRENT_FLOOR)}.`;
    const wireCoverageTitle = liveFlowWireCoverageTitle(input);
    const sourceCoverageTitle = liveFlowSampledSourceTitle(input);
    return {
      show: true,
      label: currentLabel ? `Below range · ${currentLabel}` : "No flow now",
      title: counts.sampledNgspice > 0
        ? `Current is below the ${thresholdLabel} display threshold at this playback time. ${currentContext} ${wireCoverageTitle} ${sourceCoverageTitle}`
        : `Current is below the ${thresholdLabel} display threshold at this playback time.`,
      tone: "muted",
      source: counts.sampledNgspice > 0 ? "ngspice" : "none",
    };
  }
  const coverage = liveFlowCoverageSummary(input);
  const visibleWireCount = counts.visible;
  const activeWireLabel =
    visibleWireCount > counts.activeNgspice
      ? `${counts.activeNgspice}/${visibleWireCount}`
      : `${counts.activeNgspice}`;
  return {
    show: true,
    label: `${activeWireLabel} ngspice${currentLabel ? ` · ${currentLabel}` : ""}`,
    title: `${liveFlowWireCoverageTitle(input)} Strongest sampled wire current: ${currentLabel ?? "unknown current"}. ${coverage.title}`,
    tone: "ready",
    source: coverage.source,
  };
}

function liveFlowStatusCurrentLabel(current: number | undefined): string | null {
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  if (Math.abs(current) < LIVE_FLOW_STATUS_CURRENT_FLOOR) return null;
  return formatLiveFlowCurrent(Math.abs(current));
}

function liveFlowCoverageSummary(input: LiveFlowStatusInput): {
  title: string;
  source: LiveFlowStatus["source"];
} {
  const { activeNgspice, sampledNgspice } = liveFlowStatusCounts(input);
  if (activeNgspice === 0) {
    return {
      title: liveFlowSampledSourceTitle(input),
      source: sampledNgspice > 0 ? "ngspice" : "none",
    };
  }

  const activeSourceText = liveFlowNgspiceVectorLabel(activeNgspice);
  const sampledSourceText = liveFlowSampledSourceTitle(input);
  const sourceTitle =
    sampledNgspice === activeNgspice
      ? `Animating streams: ${activeSourceText}.`
      : `Animating streams: ${activeSourceText}. ${sampledSourceText}`;
  return {
    title: `${sourceTitle} Live Flow only animates wires with ngspice current vectors.`,
    source: "ngspice",
  };
}

function liveFlowSampledSourceTitle(input: LiveFlowStatusInput): string {
  const ngspice = liveFlowStatusCounts(input).sampledNgspice;
  if (ngspice === 0) return "No ngspice current-vector coverage is available.";
  return `Sampled wires: ${liveFlowNgspiceVectorLabel(ngspice)}.`;
}

function liveFlowNgspiceVectorLabel(count: number): string {
  return `${count} ngspice current ${count === 1 ? "vector" : "vectors"}`;
}

function liveFlowVisibleWireCount(input: LiveFlowStatusInput): number {
  const visible =
    typeof input.visibleWireCount === "number" && Number.isFinite(input.visibleWireCount)
      ? input.visibleWireCount
      : input.sampledWireCount;
  return Math.max(0, visible, input.sampledWireCount, input.activeWireCount);
}

function liveFlowWireCoverageTitle(input: LiveFlowStatusInput): string {
  const counts = liveFlowStatusCounts(input);
  const visible = counts.visible;
  if (visible === 0) return "";

  const active = Math.max(0, Math.min(counts.activeNgspice, visible));
  const sampled = Math.max(0, Math.min(counts.sampledNgspice, visible));
  const unsampled = Math.max(0, visible - sampled);
  const inactiveSampled = Math.max(0, sampled - active);
  const parts: string[] = [];

  if (active === visible) {
    parts.push(`All ${visible} visible ${visible === 1 ? "wire is" : "wires are"} animating`);
  } else {
    parts.push(`${active} of ${visible} visible ${visible === 1 ? "wire is" : "wires are"} animating`);
  }
  if (unsampled > 0) {
    parts.push(`${unsampled} visible ${unsampled === 1 ? "wire has" : "wires have"} no ngspice current-vector sample`);
  }
  if (inactiveSampled > 0) {
    parts.push(`${inactiveSampled} sampled ${inactiveSampled === 1 ? "wire is" : "wires are"} below the display threshold at this playback time`);
  }
  return `${parts.join(". ")}.`;
}

function liveFlowStatusCounts(input: LiveFlowStatusInput): {
  visible: number;
  sampled: number;
  sampledNgspice: number;
  activeNgspice: number;
} {
  const visible = liveFlowVisibleWireCount(input);
  const sampled = Math.max(0, input.sampledWireCount);
  // Runtime Live Flow samples are produced only from ngspice current vectors.
  // Keep the status model aligned with that invariant so the UI cannot drift
  // back into representing estimated/fallback coverage.
  const sampledNgspice = Math.max(0, Math.min(sampled, visible));
  const activeNgspice = Math.max(0, Math.min(input.ngspiceWireCount ?? input.activeWireCount, sampledNgspice, visible));
  return { visible, sampled, sampledNgspice, activeNgspice };
}
