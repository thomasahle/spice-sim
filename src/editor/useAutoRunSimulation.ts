// Auto-run: debounced sim re-run on any doc change while autoRun is on,
// the Select tool is active, and the canvas isn't mid-interaction. Pulled
// out of Editor.tsx — `runSimulation` lives in the editor and is captured
// via a ref so this hook doesn't need to know about its identity.

import { useEffect, useRef } from "react";
import type { CircuitDoc } from "./model.ts";
import type { Tool } from "./toolPredicates.ts";

export function useAutoRunSimulation({
  doc,
  autoRun,
  tool,
  canvasInteractionActive,
  autoRunRunnable,
  runSimulation,
}: {
  doc: CircuitDoc;
  autoRun: boolean;
  tool: Tool;
  canvasInteractionActive: boolean;
  autoRunRunnable: boolean;
  runSimulation: () => void;
}) {
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = runSimulation;
  });
  useEffect(() => {
    if (!autoRun) return;
    // Do not let auto-run open or resize the waveform pane while the user is
    // still constructing a schematic. Manual Run remains available in any tool.
    if (tool !== "select") return;
    // Preview drags mutate the document while the Select tool is active. Wait
    // for pointer-up/cancel so ngspice never runs against transient geometry.
    if (canvasInteractionActive) return;
    if (!autoRunRunnable) return;
    const t = setTimeout(() => runRef.current(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, autoRunRunnable, tool, canvasInteractionActive]);
}
