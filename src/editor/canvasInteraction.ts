import { normalizePoint } from "./geometry.ts";

export interface CanvasPoint {
  x: number;
  y: number;
}

/**
 * Design-tool drag rule: the pointer may start anywhere on the object, but
 * snapping applies to the movement delta. That avoids edge-grab jumps where a
 * rounded cursor position moves the object before the user has actually moved
 * by a grid cell.
 */
export function canvasDragDelta(
  start: CanvasPoint,
  current: CanvasPoint,
  snapToGrid: boolean,
): CanvasPoint {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return snapToGrid
    ? normalizePoint({ x: Math.round(dx), y: Math.round(dy) })
    : normalizePoint({ x: dx, y: dy });
}

export const CANVAS_DRAG_START_THRESHOLD = 0.08;

export function canvasDragDeltaAfterThreshold(
  start: CanvasPoint,
  current: CanvasPoint,
  snapToGrid: boolean,
  threshold = CANVAS_DRAG_START_THRESHOLD,
): CanvasPoint | null {
  if (!movedBeyondThreshold(start, current, threshold)) return null;
  return canvasDragDelta(start, current, snapToGrid);
}

export interface CanvasInteractionActivity {
  drag?: unknown | null;
  wireDrag?: unknown | null;
  scopeDrag?: unknown | null;
  noteResize?: unknown | null;
  placementDraft?: unknown | null;
  marquee?: unknown | null;
  panning?: unknown | null;
  wireDraft?: unknown | null;
  wireGesture?: unknown | null;
}

export function hasActiveCanvasInteraction(activity: CanvasInteractionActivity): boolean {
  return Boolean(
    activity.drag ||
      activity.wireDrag ||
      activity.scopeDrag ||
      activity.noteResize ||
      activity.placementDraft ||
      activity.marquee ||
      activity.panning ||
      activity.wireDraft ||
      activity.wireGesture,
  );
}

export function movedBeyondThreshold(
  start: CanvasPoint,
  current: CanvasPoint,
  threshold = 0.18,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function shouldSuppressOriginalConnectionSnap(
  start: CanvasPoint,
  current: CanvasPoint,
  snapTarget: CanvasPoint | null,
  detachRadius = 0.55,
): boolean {
  if (!snapTarget) return false;
  if (Math.hypot(snapTarget.x - start.x, snapTarget.y - start.y) > 1e-6) return false;
  return movedBeyondThreshold(start, current, detachRadius);
}

export function selectionClickStartsDrag(additive: boolean): boolean {
  return !additive;
}

export type SelectPointerHitKind = "component" | "probe" | "wire" | null;

export type SelectPointerIntent =
  | "wire-vertex-drag"
  | "quick-wire"
  | "object-selection"
  | "marquee";

export interface SelectPointerIntentState {
  additive: boolean;
  hitKind: SelectPointerHitKind;
  onConnectionHandle: boolean;
  onWireVertexHandle: boolean;
}

export function pointerSelectionHit<T>(geometricHit: T | null, domFallbackHit: T | null): T | null {
  return geometricHit ?? domFallbackHit;
}

/**
 * CircuitLab/Figma-style selection rule:
 * - explicit wire vertices reshape wires;
 * - explicit terminal handles start wiring;
 * - object bodies move/select objects;
 * - empty canvas starts a marquee.
 *
 * "Near a pin" is intentionally not enough to start wiring in select mode.
 * Users need component edges to be predictable drag targets.
 */
export function selectPointerIntent({
  additive,
  hitKind,
  onConnectionHandle,
  onWireVertexHandle,
}: SelectPointerIntentState): SelectPointerIntent {
  if (onWireVertexHandle && !additive) return "wire-vertex-drag";
  if (onConnectionHandle && !additive && hitKind !== "probe") return "quick-wire";
  if (hitKind) return "object-selection";
  return "marquee";
}

export interface PinTargetVisibilityState {
  connectionGestureActive: boolean;
  connectionToolActive: boolean;
  hovered: boolean;
  selected: boolean;
  selectToolActive: boolean;
}

export type PinTargetTone = "hidden" | "subtle" | "active";

export function pinTargetTone({
  connectionGestureActive,
  connectionToolActive,
  hovered,
  selected,
  selectToolActive,
}: PinTargetVisibilityState): PinTargetTone {
  if (connectionGestureActive) {
    return hovered || selected ? "active" : "subtle";
  }
  if (connectionToolActive) {
    return hovered || selected ? "active" : "subtle";
  }
  if (selectToolActive && (hovered || selected)) {
    return "subtle";
  }
  return "hidden";
}

export function shouldShowPinTargets(state: PinTargetVisibilityState): boolean {
  return pinTargetTone(state) !== "hidden";
}
