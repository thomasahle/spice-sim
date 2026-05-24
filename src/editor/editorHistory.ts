import type { CircuitDoc } from "./model.ts";

export interface HistorySnapshot {
  doc: CircuitDoc;
  selectedIds: string[];
}

export function makeHistorySnapshot(doc: CircuitDoc, selectedIds: Iterable<string>): HistorySnapshot {
  return { doc, selectedIds: [...selectedIds] };
}

export function selectedIdsFromSnapshot(snapshot: HistorySnapshot): Set<string> {
  return new Set(snapshot.selectedIds);
}

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
