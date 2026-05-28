// Encapsulates the doc / past / future storage triumvirate + their refs +
// push/pop helpers. Editor still composes commit/undo/redo from these primitives
// (it needs cross-cutting side effects like capturing selectedIds into a
// snapshot, invalidating the sim, marking disk-dirty) but the *storage* lives
// here so it's no longer ~15 lines of state plumbing inside Editor.tsx.

import { useRef, useState } from "react";
import type { CircuitDoc } from "./model.ts";
import {
  popLatestHistorySnapshot,
  pushBoundedHistory,
  type HistorySnapshot,
} from "./editorHistory.ts";

export interface DocHistory {
  doc: CircuitDoc;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  setDoc: (next: CircuitDoc | ((cur: CircuitDoc) => CircuitDoc)) => void;
  setPast: (next: HistorySnapshot[]) => void;
  setFuture: (next: HistorySnapshot[]) => void;
  /** Bounded push onto the past stack. */
  pushPast: (snapshot: HistorySnapshot) => void;
  /** Pop the most recent snapshot from past; returns null if empty. */
  popLatestPast: () => HistorySnapshot | null;
  docRef: React.MutableRefObject<CircuitDoc>;
  pastRef: React.MutableRefObject<HistorySnapshot[]>;
  futureRef: React.MutableRefObject<HistorySnapshot[]>;
}

export function useDocHistory(initialDoc: CircuitDoc, historyLimit: number): DocHistory {
  const [doc, setDocState] = useState<CircuitDoc>(initialDoc);
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const docRef = useRef(doc);
  docRef.current = doc;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;

  function pushPast(snapshot: HistorySnapshot) {
    setPast(pushBoundedHistory(pastRef.current, snapshot, historyLimit));
  }

  function popLatestPast(): HistorySnapshot | null {
    const popped = popLatestHistorySnapshot(pastRef.current);
    if (!popped.snapshot) return null;
    setPast(popped.history);
    return popped.snapshot;
  }

  return {
    doc,
    past,
    future,
    setDoc: setDocState,
    setPast,
    setFuture,
    pushPast,
    popLatestPast,
    docRef,
    pastRef,
    futureRef,
  };
}
