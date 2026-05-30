// Below-canvas waveform area: WaveformViewer when there's a result and the
// pane is open; a "Waveform hidden" rail when collapsed; an "no plottable
// vectors" notice when the result has no waveform data; or the log pane when
// only a log exists. Pulled out of Editor.tsx as one cohesive subcomponent.

import { WaveformViewer } from "./WaveformViewer.tsx";
import { hasPlottableWaveform, waveformPaneEmptyState } from "./waveformEmptyState.ts";
import type { SimResult } from "../sim/api.ts";

interface WaveformSectionProps {
  simResult: SimResult | null;
  waveformVisible: boolean;
  onSetWaveformVisible: (visible: boolean) => void;
  selectedTraces: Set<string>;
  onSetSelectedTraces: (traces: Set<string>) => void;
  userTraceNames: Set<string>;
  traceAliases: Map<string, string>;
  runLabels: Map<number, string>;
  xAxisLabel: string;
  directives: string;
  runWarnings: string[];
  /** simulationStale && !autoRun — what WaveformViewer renders as its "stale" banner. */
  viewerStale: boolean;
  /** simulationStale — used by the collapsed/empty-result banners directly. */
  simulationStale: boolean;
  log: string;
}

export function WaveformSection({
  simResult,
  waveformVisible,
  onSetWaveformVisible,
  selectedTraces,
  onSetSelectedTraces,
  userTraceNames,
  traceAliases,
  runLabels,
  xAxisLabel,
  directives,
  runWarnings,
  viewerStale,
  simulationStale,
  log,
}: WaveformSectionProps) {
  if (simResult && hasPlottableWaveform(simResult.vectors) && waveformVisible) {
    return (
      <WaveformViewer
        plot={simResult.plot}
        vectors={simResult.vectors}
        selectedTraces={selectedTraces}
        userTraceNames={userTraceNames}
        traceAliases={traceAliases}
        runLabels={runLabels}
        xAxisLabel={xAxisLabel}
        directives={directives}
        measurements={simResult.measurements}
        runWarnings={runWarnings}
        stale={viewerStale}
        onToggleTrace={(name) => {
          const next = new Set(selectedTraces);
          if (next.has(name)) next.delete(name);
          else next.add(name);
          onSetSelectedTraces(next);
        }}
        onSetVisibleTraces={onSetSelectedTraces}
        onShowAllTraces={() => onSetSelectedTraces(new Set())}
        onClose={() => onSetWaveformVisible(false)}
      />
    );
  }
  if (simResult && hasPlottableWaveform(simResult.vectors) && !waveformVisible) {
    return (
      <div className="wf-collapsed">
        <div>
          <strong>{simulationStale ? "Previous waveform hidden" : "Waveform hidden"}</strong>
          <span>{simulationStale ? `${simResult.plot} · stale` : simResult.plot}</span>
        </div>
        <button onClick={() => onSetWaveformVisible(true)}>Show waveform</button>
      </div>
    );
  }
  if (simResult && !hasPlottableWaveform(simResult.vectors) && waveformVisible) {
    const emptyState = waveformPaneEmptyState(simResult.plot, simResult.vectors);
    return (
      <div className="wf-collapsed wf-empty-result" role="status">
        <div className="wf-empty-copy">
          <strong>
            {simulationStale ? `Previous ${emptyState.title.toLowerCase()}` : emptyState.title}
          </strong>
          <span>
            {simulationStale
              ? "The schematic has changed since this run. Press Run to update the result."
              : emptyState.detail}
          </span>
        </div>
        <button onClick={() => onSetWaveformVisible(false)}>Hide</button>
      </div>
    );
  }
  if (log && !simResult) {
    return (
      <div className="log-pane">
        <pre>{log}</pre>
      </div>
    );
  }
  return null;
}
