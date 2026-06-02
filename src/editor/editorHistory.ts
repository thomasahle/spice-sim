import type { LegacyCircuitDoc as CircuitDoc } from "./legacyModel.ts";

// A history entry is just the document. Selection is intentionally NOT part of
// the snapshot — undo/redo restore the circuit but leave the user's current
// selection alone (decision: undo should not yank selection back to a past
// state). The editor prunes any now-missing ids after a restore.
export type HistorySnapshot = CircuitDoc;

export function pushBoundedHistory(
  history: HistorySnapshot[],
  snapshot: HistorySnapshot,
  limit: number,
): HistorySnapshot[] {
  return history.length >= limit
    ? [...history.slice(history.length - limit + 1), snapshot]
    : [...history, snapshot];
}

export function popLatestHistorySnapshot(
  history: HistorySnapshot[],
): { snapshot: HistorySnapshot | null; history: HistorySnapshot[] } {
  if (history.length === 0) return { snapshot: null, history };
  return {
    snapshot: history[history.length - 1],
    history: history.slice(0, -1),
  };
}
