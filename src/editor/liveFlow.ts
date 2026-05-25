import { parseSpiceUnitStrict } from "./valueExpressions.ts";

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
  source?: LiveFlowSampleSource;
}

export type LiveFlowSampleSource = "ngspice" | "estimated";

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
  return liveFlowVisualFromSignedCurrent(sample?.normalizedCurrent, sample?.signedCurrent);
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
): "measured" | "estimated" | "missing" {
  if (sample?.source === "estimated") return "estimated";
  if (sample?.source === "ngspice") return "measured";
  return "missing";
}

export function liveFlowReadoutText(
  sample: LiveFlowSample | undefined,
  active: boolean,
): LiveFlowReadoutText {
  if (!sample) {
    return {
      label: "Not sampled",
      detail: null,
      title: "No branch-current or passive-estimate sample is available for this wire at the selected transient time.",
      showArrow: false,
    };
  }
  const currentLabel = formatLiveFlowCurrent(sample.signedCurrent);
  const sourceTitle =
    sample.source === "estimated"
      ? "estimated from node voltages"
      : "measured from simulated branch current";
  if (!active) {
    return {
      label: currentLabel,
      detail: "below range",
      title: `Live Flow is below the ${formatLiveFlowCurrent(LIVE_FLOW_MIN_ABSOLUTE_CURRENT)} display threshold here: ${currentLabel}, ${sourceTitle}.`,
      showArrow: false,
    };
  }
  return {
    label: currentLabel,
    detail: null,
    title: `Live Flow: ${currentLabel} ${sourceTitle}.`,
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
): number | null {
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
  const base = [`@${rd}[i]`, `${rd}#branch`, `i(${rd})`];
  switch (kind) {
    case "D":
    case "LED":
    case "ZENER":
      return [`@${rd}[id]`, ...base];
    case "BJT":
    case "NPN":
    case "PNP":
      return [`@${rd}[ic]`, `@${rd}[ie]`, `@${rd}[ib]`, ...base];
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return [`@${rd}[id]`, `@${rd}[is]`, ...base];
    default:
      return base;
  }
}

export interface PassiveLiveFlowCurrentInput {
  kind: string;
  value: string;
  pin0Voltage: number;
  pin1Voltage: number;
  previousPin0Voltage?: number;
  previousPin1Voltage?: number;
  deltaTime?: number;
}

export function estimatePassiveLiveFlowCurrent({
  kind,
  value,
  pin0Voltage,
  pin1Voltage,
  previousPin0Voltage,
  previousPin1Voltage,
  deltaTime,
}: PassiveLiveFlowCurrentInput): number | null {
  if (!Number.isFinite(pin0Voltage) || !Number.isFinite(pin1Voltage)) return null;
  const componentValue = parseSpiceUnitStrict(value.trim().split(/\s+/)[0] ?? "");
  if (componentValue === null || componentValue <= 0) return null;
  const voltage = pin0Voltage - pin1Voltage;
  if (kind === "R") return voltage / componentValue;
  if (kind !== "C") return null;
  if (
    typeof previousPin0Voltage !== "number" ||
    typeof previousPin1Voltage !== "number" ||
    typeof deltaTime !== "number" ||
    !Number.isFinite(previousPin0Voltage) ||
    !Number.isFinite(previousPin1Voltage) ||
    !Number.isFinite(deltaTime) ||
    deltaTime <= 0
  ) {
    return null;
  }
  const previousVoltage = previousPin0Voltage - previousPin1Voltage;
  return componentValue * ((voltage - previousVoltage) / deltaTime);
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
    if (
      Math.abs(distanceDelta) <= tieTolerance &&
      best.source === "estimated" &&
      sample.source === "ngspice"
    ) {
      best = sample;
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
  source: "none" | "measured" | "estimated" | "mixed";
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
  sampledMeasuredWireCount?: number;
  sampledEstimatedWireCount?: number;
  measuredWireCount?: number;
  estimatedWireCount?: number;
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
  if (liveFlowVisibleWireCount(input) === 0) {
    return {
      show: true,
      label: "No wires",
      title: "The transient result is ready, but there are no visible wires to animate. Draw or connect wires, then run again.",
      tone: "muted",
      source: "none",
    };
  }
  if (input.sampledWireCount === 0) {
    const coverageTitle = liveFlowWireCoverageTitle(input);
    return {
      show: true,
      label: "No samples",
      title: coverageTitle
        ? `No wire-current samples were found for the visible wires. ${coverageTitle}`
        : "No wire-current samples were found for the visible wires.",
      tone: "warning",
      source: "none",
    };
  }
  if (input.activeWireCount === 0) {
    const thresholdLabel = formatLiveFlowCurrent(LIVE_FLOW_MIN_ABSOLUTE_CURRENT);
    const currentContext = currentLabel
      ? `Strongest sampled wire current: ${currentLabel}.`
      : `Strongest sampled wire current is below ${formatLiveFlowCurrent(LIVE_FLOW_STATUS_CURRENT_FLOOR)}.`;
    const wireCoverageTitle = liveFlowWireCoverageTitle(input);
    const sourceCoverageTitle = liveFlowSampledSourceCoverageTitle(input);
    return {
      show: true,
      label: currentLabel ? `Below range · ${currentLabel}` : "No flow now",
      title: input.sampledWireCount > 0
        ? `Current is below the ${thresholdLabel} display threshold at this playback time. ${currentContext} ${wireCoverageTitle} ${sourceCoverageTitle}`
        : `Current is below the ${thresholdLabel} display threshold at this playback time.`,
      tone: "muted",
      source: liveFlowSampledSource(input),
    };
  }
  const coverage = liveFlowCoverageSummary(input);
  const visibleWireCount = liveFlowVisibleWireCount(input);
  const activeWireLabel =
    visibleWireCount > input.activeWireCount
      ? `${input.activeWireCount}/${visibleWireCount}`
      : `${input.activeWireCount}`;
  return {
    show: true,
    label: `${activeWireLabel} ${visibleWireCount === 1 ? "wire" : "wires"}${currentLabel ? ` · ${currentLabel}` : ""}`,
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
  const activeEstimated = Math.max(0, input.estimatedWireCount ?? 0);
  const activeMeasured = Math.max(
    0,
    input.measuredWireCount ?? Math.max(0, input.activeWireCount - activeEstimated),
  );
  const sampledEstimated = Math.max(
    0,
    input.sampledEstimatedWireCount ?? activeEstimated,
  );
  const sampledMeasured = Math.max(
    0,
    input.sampledMeasuredWireCount ?? Math.max(0, input.sampledWireCount - sampledEstimated),
  );
  const activeSourceTotal = activeMeasured + activeEstimated;
  if (activeSourceTotal === 0) {
    return {
      title: liveFlowSampledSourceTitle(sampledMeasured, sampledEstimated),
      source: liveFlowSourceFromCounts(sampledMeasured, sampledEstimated),
    };
  }

  const activeSourceText = `${activeMeasured} measured, ${activeEstimated} estimated`;
  const sampledSourceText = liveFlowSampledSourceTitle(sampledMeasured, sampledEstimated);
  const sourceTitle =
    sampledMeasured === activeMeasured && sampledEstimated === activeEstimated
      ? `Animating streams: ${activeSourceText}.`
      : `Animating streams: ${activeSourceText}. ${sampledSourceText}`;
  if (activeEstimated === 0) {
    return {
      title: `${sourceTitle} Blue streams are simulated branch-current vectors.`,
      source: "measured",
    };
  }
  if (activeMeasured === 0) {
    return {
      title: `${sourceTitle} Amber streams are passive estimates from node voltages.`,
      source: "estimated",
    };
  }
  return {
    title: `${sourceTitle} Blue streams are simulated branch-current vectors; amber streams are passive estimates from node voltages.`,
    source: "mixed",
  };
}

function liveFlowSampledSource(input: LiveFlowStatusInput): LiveFlowStatus["source"] {
  const { measured, estimated } = liveFlowSampledSourceCounts(input);
  return liveFlowSourceFromCounts(measured, estimated);
}

function liveFlowSampledSourceCoverageTitle(input: LiveFlowStatusInput): string {
  const { measured, estimated } = liveFlowSampledSourceCounts(input);
  return liveFlowSampledSourceTitle(measured, estimated);
}

function liveFlowSampledSourceCounts(input: LiveFlowStatusInput): {
  measured: number;
  estimated: number;
} {
  const estimated = Math.max(0, input.sampledEstimatedWireCount ?? 0);
  const measured = Math.max(
    0,
    input.sampledMeasuredWireCount ?? Math.max(0, input.sampledWireCount - estimated),
  );
  return { measured, estimated };
}

function liveFlowSourceFromCounts(
  measured: number,
  estimated: number,
): LiveFlowStatus["source"] {
  if (measured > 0 && estimated > 0) return "mixed";
  if (estimated > 0) return "estimated";
  if (measured > 0) return "measured";
  return "none";
}

function liveFlowSampledSourceTitle(measured: number, estimated: number): string {
  const total = measured + estimated;
  if (total === 0) return "No wire-current source coverage is available.";
  return `Sampled wires: ${measured} measured, ${estimated} estimated.`;
}

function liveFlowVisibleWireCount(input: LiveFlowStatusInput): number {
  const visible =
    typeof input.visibleWireCount === "number" && Number.isFinite(input.visibleWireCount)
      ? input.visibleWireCount
      : input.sampledWireCount;
  return Math.max(0, visible, input.sampledWireCount, input.activeWireCount);
}

function liveFlowWireCoverageTitle(input: LiveFlowStatusInput): string {
  const visible = liveFlowVisibleWireCount(input);
  if (visible === 0) return "";

  const active = Math.max(0, Math.min(input.activeWireCount, visible));
  const sampled = Math.max(0, Math.min(input.sampledWireCount, visible));
  const unsampled = Math.max(0, visible - sampled);
  const inactiveSampled = Math.max(0, sampled - active);
  const parts: string[] = [];

  if (active === visible) {
    parts.push(`All ${visible} visible ${visible === 1 ? "wire is" : "wires are"} animating`);
  } else {
    parts.push(`${active} of ${visible} visible ${visible === 1 ? "wire is" : "wires are"} animating`);
  }
  if (unsampled > 0) {
    parts.push(`${unsampled} visible ${unsampled === 1 ? "wire has" : "wires have"} no usable current sample`);
  }
  if (inactiveSampled > 0) {
    parts.push(`${inactiveSampled} sampled ${inactiveSampled === 1 ? "wire is" : "wires are"} below the display threshold at this playback time`);
  }
  return `${parts.join(". ")}.`;
}
