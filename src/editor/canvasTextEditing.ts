export type CanvasTextEditKind =
  | "LABEL"
  | "NOTE"
  | "VALUE"
  | "PROBE"
  | "SUBX_PIN"
  | "COMPONENT_LABEL";

export type CanvasTextEditFocusMode = "select-all" | "start" | "end";

export type CanvasTextEditState = {
  componentId: string;
  kind: CanvasTextEditKind;
  pinIndex?: number;
} | null;

export const CANVAS_TEXT_EDIT_OPEN_SELECTION_WINDOW_MS = 1200;

export function defaultCanvasTextEditFocusMode(kind: CanvasTextEditKind): CanvasTextEditFocusMode {
  return kind === "NOTE" ? "start" : "select-all";
}

export function canvasTextEditSelection(
  value: string,
  kind: CanvasTextEditKind,
  focusMode: CanvasTextEditFocusMode = defaultCanvasTextEditFocusMode(kind),
): { start: number; end: number; scroll: "start" | "end"; scrollX: "start" | "end" } {
  if (focusMode === "start") return { start: 0, end: 0, scroll: "start", scrollX: "start" };
  const end = value.length;
  if (focusMode === "end") return { start: end, end, scroll: "end", scrollX: "end" };
  return { start: 0, end, scroll: "start", scrollX: "start" };
}

export function shouldRenderCanvasText(
  edit: CanvasTextEditState,
  targetId: string,
  targetKind: CanvasTextEditKind,
  targetPinIndex?: number,
): boolean {
  if (edit?.componentId !== targetId || edit.kind !== targetKind) return true;
  if (targetKind === "SUBX_PIN") return edit.pinIndex !== targetPinIndex;
  return false;
}

export function isEditingCanvasText(
  edit: CanvasTextEditState,
  targetId: string,
  targetKind: CanvasTextEditKind,
  targetPinIndex?: number,
): boolean {
  return !shouldRenderCanvasText(edit, targetId, targetKind, targetPinIndex);
}

export function normalizeCanvasTextEditCommitValue(
  value: string,
  kind: CanvasTextEditKind,
): string {
  return kind === "NOTE" ? value : value.trim();
}

export function canvasTextEditRequiresNonEmptyCommit(kind: CanvasTextEditKind): boolean {
  return kind === "LABEL" || kind === "VALUE" || kind === "SUBX_PIN";
}

export function shouldRestoreCanvasTextSelectionBeforeInput({
  kind,
  key,
  altKey,
  ctrlKey,
  metaKey,
  elapsedMs,
}: {
  kind: CanvasTextEditKind;
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  elapsedMs: number;
}): boolean {
  return (
    kind !== "NOTE" &&
    key.length === 1 &&
    !altKey &&
    !ctrlKey &&
    !metaKey &&
    elapsedMs <= CANVAS_TEXT_EDIT_OPEN_SELECTION_WINDOW_MS
  );
}
