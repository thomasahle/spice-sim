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
  // Group-aware transform controls (Inkscape-style). Disabled when the
  // selection is empty; otherwise they rotate/flip the selection as a rigid
  // group (or a single element in place).
  transformDisabled: boolean;
  onRotateCcw: () => void;
  onRotateCw: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
}

const TRANSFORM_BUTTONS = [
  {
    op: "rotate-ccw",
    icon: "rotate-ccw",
    name: "Rotate 90° counter-clockwise",
    desc: "Turn the selection a quarter-turn left. With more than one object selected, the whole group rotates together about its centre.",
  },
  {
    op: "rotate-cw",
    icon: "rotate-cw",
    name: "Rotate 90° clockwise",
    desc: "Turn the selection a quarter-turn right. With more than one object selected, the whole group rotates together about its centre.",
  },
  {
    op: "flip-h",
    icon: "flip-h",
    name: "Flip Horizontal",
    desc: "Mirror the selection left-to-right. A group reflects about its vertical centre line; a single 2-pin part swaps its terminals in place.",
  },
  {
    op: "flip-v",
    icon: "flip-v",
    name: "Flip Vertical",
    desc: "Mirror the selection top-to-bottom. A group reflects about its horizontal centre line; a single 2-pin part swaps its terminals in place.",
  },
] as const;

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
  transformDisabled,
  onRotateCcw,
  onRotateCw,
  onFlipHorizontal,
  onFlipVertical,
}: EditorTopRunClusterProps) {
  const transformHandlers = {
    "rotate-ccw": onRotateCcw,
    "rotate-cw": onRotateCw,
    "flip-h": onFlipHorizontal,
    "flip-v": onFlipVertical,
  } as const;
  return (
    <div className="canvas-actions" role="group" aria-label="Run and transform controls">
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
      <div className="tb-sep" aria-hidden="true" />
      <div className="tb-group tb-transform" role="group" aria-label="Transform selection">
        <Tooltip.Provider delayDuration={260} skipDelayDuration={120}>
          {TRANSFORM_BUTTONS.map((b) => (
            <Tooltip.Root key={b.op}>
              <Tooltip.Trigger asChild>
                <button
                  className="tb-icon-btn"
                  onClick={transformHandlers[b.op]}
                  disabled={transformDisabled}
                  aria-label={b.name}
                >
                  <IconGlyph kind={b.icon} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tool-tip tool-tip-pill" side="bottom" align="center" sideOffset={10}>
                  <span className="tool-tip-head">
                    <span className="tool-tip-name">{b.name}</span>
                  </span>
                  <span className="tool-tip-desc">{b.desc}</span>
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </Tooltip.Provider>
      </div>
    </div>
  );
}
