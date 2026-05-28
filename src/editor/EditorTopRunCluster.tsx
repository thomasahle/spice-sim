// Floating Run + analysis-type cluster — sits over the canvas at the top so
// it's always reachable without dedicating toolbar space. Pulled out of
// Editor.tsx; pure presentation driven by props.

import * as Tooltip from "@radix-ui/react-tooltip";
import { IconGlyph } from "./editorChrome.tsx";
import type { CircuitDoc } from "./model.ts";

type AnalysisKind = CircuitDoc["analysis"]["kind"];

interface EditorTopRunClusterProps {
  analysisKind: AnalysisKind;
  onSwitchAnalysis: (kind: AnalysisKind) => void;
  running: boolean;
  runDisabled: boolean;
  runTitle: string;
  engineOk: boolean | null;
  onRun: () => void;
}

const ANALYSIS_TABS = [
  {
    kind: "tran",
    label: "Tran",
    name: "Transient",
    desc: "Solve voltages and currents over time. Use for step responses, ringing, oscillation — any time-domain behavior.",
  },
  {
    kind: "ac",
    label: "AC",
    name: "AC sweep",
    desc: "Small-signal frequency response. Plots gain and phase versus frequency for filters, amplifiers, and impedance.",
  },
  {
    kind: "dc",
    label: "DC",
    name: "DC sweep",
    desc: "Vary a source value and plot the steady-state response. Useful for IV curves and transfer characteristics.",
  },
  {
    kind: "op",
    label: "OP",
    name: "Operating point",
    desc: "Single steady-state DC solution. Shows node voltages and branch currents with no time variation.",
  },
] as const;

export function EditorTopRunCluster({
  analysisKind,
  onSwitchAnalysis,
  running,
  runDisabled,
  runTitle,
  engineOk,
  onRun,
}: EditorTopRunClusterProps) {
  return (
    <div className="canvas-actions" role="group" aria-label="Run controls">
      <div className="tb-group tb-analyses" role="group" aria-label="Analysis type">
        <Tooltip.Provider delayDuration={260} skipDelayDuration={120}>
          {ANALYSIS_TABS.map((a) => (
            <Tooltip.Root key={a.kind}>
              <Tooltip.Trigger asChild>
                <button
                  className={`tb-pill ${analysisKind === a.kind ? "active" : ""}`}
                  onClick={() => onSwitchAnalysis(a.kind)}
                  aria-label={`${a.name} analysis`}
                  aria-pressed={analysisKind === a.kind}
                >
                  {a.label}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tool-tip tool-tip-pill" side="bottom" align="center" sideOffset={10}>
                  <span className="tool-tip-head">
                    <span className="tool-tip-name">{a.name}</span>
                  </span>
                  <span className="tool-tip-desc">{a.desc}</span>
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </Tooltip.Provider>
      </div>
      <button
        className={`tb-run ${running ? "running" : ""}`}
        onClick={onRun}
        disabled={runDisabled}
        title={runTitle}
        aria-label={engineOk === false ? "Simulation engine unavailable" : running ? "Running simulation" : "Run simulation"}
      >
        {running ? (
          <span className="tb-run-spinner" />
        ) : (
          <IconGlyph kind="play" />
        )}
        <span>{engineOk === false ? "Unavailable" : running ? "Running…" : "Run"}</span>
      </button>
    </div>
  );
}
