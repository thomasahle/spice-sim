import {
  pointOnSegment,
  pointToSegmentDist,
  projectPointToSegment,
  samePoint,
} from "./geometry.ts";
import type { SchematicPage, Wire } from "./model.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import {
  nearestConnectionTarget,
  type ConnectionSnapOptions,
  type ConnectionTarget,
} from "./canvasHitTest.ts";

export interface NetLabelNearMiss {
  labelId: string;
  label: string;
  anchor: { x: number; y: number };
  distance: number;
  target:
    | {
        kind: "pin";
        componentId: string;
        pinIdx: number;
        position: { x: number; y: number };
      }
    | {
        kind: "wire";
        wireId: string;
        segmentIdx: number;
        position: { x: number; y: number };
      };
}

export interface NetLabelDragSnapResult {
  delta: { x: number; y: number };
  target: ConnectionTarget | null;
  source: "anchor" | "pointer" | null;
}

export function snapNetLabelDrag(
  page: SchematicPage,
  labelId: string,
  initialAnchor: { x: number; y: number },
  pointerStart: { x: number; y: number },
  delta: { x: number; y: number },
  radius: number,
  options: ConnectionSnapOptions & {
    snapPoint?: (point: { x: number; y: number }) => { x: number; y: number };
  } = {},
): NetLabelDragSnapResult {
  const snapPage: SchematicPage = {
    ...page,
    components: page.components.filter((component) => component.id !== labelId),
  };
  const anchor = { x: initialAnchor.x + delta.x, y: initialAnchor.y + delta.y };
  const pointer = { x: pointerStart.x + delta.x, y: pointerStart.y + delta.y };
  const anchorSnap = nearestConnectionTarget(snapPage, anchor.x, anchor.y, radius, options);
  if (anchorSnap) {
    return {
      delta: { x: anchorSnap.x - initialAnchor.x, y: anchorSnap.y - initialAnchor.y },
      target: anchorSnap,
      source: "anchor",
    };
  }

  const pointerSnap = nearestConnectionTarget(snapPage, pointer.x, pointer.y, radius, options);
  if (pointerSnap) {
    return {
      delta: { x: pointerSnap.x - initialAnchor.x, y: pointerSnap.y - initialAnchor.y },
      target: pointerSnap,
      source: "pointer",
    };
  }

  return { delta, target: null, source: null };
}

export function connectedNetLabelIds(page: SchematicPage): Set<string> {
  const ids = new Set<string>();
  for (const label of page.components) {
    if (label.kind !== "LABEL") continue;
    const anchor = pinWorldPos(label, 0);
    if (pointTouchesAnyWire(anchor, page.wires)) {
      ids.add(label.id);
      continue;
    }
    if (
      page.components.some((component) => {
        if (component.id === label.id) return false;
        return getPinLayout(component).some((_, idx) =>
          samePoint(anchor, pinWorldPos(component, idx)),
        );
      })
    ) {
      ids.add(label.id);
    }
  }
  return ids;
}

export function netLabelNearMisses(
  page: SchematicPage,
  threshold = 0.35,
): NetLabelNearMiss[] {
  const connected = connectedNetLabelIds(page);
  const out: NetLabelNearMiss[] = [];
  for (const label of page.components) {
    if (label.kind !== "LABEL") continue;
    if (connected.has(label.id)) continue;
    const value = label.value.trim();
    if (!value) continue;
    const anchor = pinWorldPos(label, 0);
    let best: NetLabelNearMiss | null = null;

    for (const component of page.components) {
      if (component.id === label.id || component.kind === "LABEL" || component.kind === "NOTE") {
        continue;
      }
      for (let pinIdx = 0; pinIdx < getPinLayout(component).length; pinIdx++) {
        const position = pinWorldPos(component, pinIdx);
        const distance = Math.hypot(position.x - anchor.x, position.y - anchor.y);
        if (distance <= 1e-6 || distance > threshold) continue;
        if (best && best.distance <= distance) continue;
        best = {
          labelId: label.id,
          label: value,
          anchor,
          distance,
          target: { kind: "pin", componentId: component.id, pinIdx, position },
        };
      }
    }

    for (const wire of page.wires) {
      for (let segmentIdx = 0; segmentIdx < wire.points.length - 1; segmentIdx++) {
        const [x1, y1] = wire.points[segmentIdx];
        const [x2, y2] = wire.points[segmentIdx + 1];
        const distance = pointToSegmentDist(anchor.x, anchor.y, x1, y1, x2, y2);
        if (distance <= 1e-6 || distance > threshold) continue;
        if (best && best.distance <= distance) continue;
        const projected = projectPointToSegment(anchor.x, anchor.y, x1, y1, x2, y2);
        if (!projected) continue;
        best = {
          labelId: label.id,
          label: value,
          anchor,
          distance,
          target: { kind: "wire", wireId: wire.id, segmentIdx, position: projected },
        };
      }
    }

    if (best) out.push(best);
  }
  return out;
}

function pointTouchesAnyWire(point: { x: number; y: number }, wires: Wire[]): boolean {
  return wires.some((wire) => pointTouchesWirePath(point, wire));
}

function pointTouchesWirePath(point: { x: number; y: number }, wire: Wire): boolean {
  if (wire.points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const [x1, y1] = wire.points[i];
    const [x2, y2] = wire.points[i + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}
