// Auto-run: idle-triggered sim rerun after the doc settles, while autoRun is
// on, the main page is in view, the Select tool is active, the canvas isn't
// mid-interaction, and the circuit is runnable + actually stale. Pulled out
// of Editor.tsx — `runSimulation` lives in the editor and is captured via a
// ref so this hook doesn't depend on its identity.

import { useEffect, useRef } from "react";
import type { CircuitDoc } from "./model.ts";
import type { Tool } from "./toolPredicates.ts";

// The idle window scales with how long the last run took: small circuits feel
// near-live, while heavier ones get a longer settle window so we don't queue a
// run on every keystroke. (The hard "too slow, stop entirely" cap lives in
// describeAutoRunStatus via autoRunRunnable.)
const AUTO_RUN_MIN_IDLE_MS = 350;
const AUTO_RUN_MAX_IDLE_MS = 1500;

export function useAutoRunSimulation({
  doc,
  autoRun,
  tool,
  canvasInteractionActive,
  autoRunRunnable,
  isMainPageActive,
  needsRun,
  lastRunMs,
  runSimulation,
}: {
  doc: CircuitDoc;
  autoRun: boolean;
  tool: Tool;
  canvasInteractionActive: boolean;
  autoRunRunnable: boolean;
  isMainPageActive: boolean;
  needsRun: boolean;
  lastRunMs: number | null;
  runSimulation: () => void;
}) {
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = runSimulation;
  });
  useEffect(() => {
    if (!autoRun) return;
    // The sim always builds from the main page; don't rerun it while the user
    // is heads-down in a subcircuit. Switching back here (activePageId is part
    // of `doc`) re-fires this effect, so a stale main page reruns on return.
    if (!isMainPageActive) return;
    // Do not let auto-run open or resize the waveform pane while the user is
    // still constructing a schematic. Manual Run remains available in any tool.
    if (tool !== "select") return;
    // Preview drags mutate the document while the Select tool is active. Wait
    // for pointer-up/cancel so ngspice never runs against transient geometry.
    if (canvasInteractionActive) return;
    if (!autoRunRunnable) return;
    // Already up to date — avoid a redundant rerun (e.g. on a bare page switch
    // back to an unchanged main page).
    if (!needsRun) return;
    const idleMs = Math.max(
      AUTO_RUN_MIN_IDLE_MS,
      Math.min(lastRunMs ?? 0, AUTO_RUN_MAX_IDLE_MS),
    );
    const t = setTimeout(() => runRef.current(), idleMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, autoRunRunnable, tool, canvasInteractionActive, isMainPageActive, needsRun, lastRunMs]);
}
