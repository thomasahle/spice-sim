// Canvas bottom-right HUD: grid / snap / auto-run toggles, zoom readout,
// fit-to-content, and the Live Flow status badge. Purely presentational —
// state and behaviors are passed in from Editor.tsx.

import type { describeAutoRunStatus } from "./autoRunStatus.ts";
import type { liveFlowStatus } from "./liveFlow.ts";

interface EditorCanvasHUDProps {
  gridVisible: boolean;
  onToggleGrid: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  autoRunUi: ReturnType<typeof describeAutoRunStatus>;
  zoom: number;
  onFit: () => void;
  isTransient: boolean;
  liveFlowUiStatus: ReturnType<typeof liveFlowStatus>;
}

export function EditorCanvasHUD({
  gridVisible,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
  autoRun,
  onToggleAutoRun,
  autoRunUi,
  zoom,
  onFit,
  isTransient,
  liveFlowUiStatus,
}: EditorCanvasHUDProps) {
  return (
    <div className="canvas-hud">
      <button
        type="button"
        className={gridVisible ? "active" : ""}
        onClick={onToggleGrid}
        title="Toggle grid visibility (Shift+G)"
        aria-label="Toggle grid visibility"
        aria-pressed={gridVisible}
      >
        Grid: {gridVisible ? "On" : "Off"}
      </button>
      <button
        type="button"
        className={snapToGrid ? "active" : ""}
        onClick={onToggleSnap}
        title="Toggle snap to grid (Shift+S)"
        aria-label="Toggle snap to grid"
        aria-pressed={snapToGrid}
      >
        Snap: {snapToGrid ? "On" : "Off"}
      </button>
      <button
        type="button"
        className={autoRun ? "active" : ""}
        onClick={onToggleAutoRun}
        title={autoRunUi.title}
        aria-label={`${autoRunUi.title} Toggle auto-run.`}
        aria-pressed={autoRun}
      >
        {autoRunUi.buttonLabel}
      </button>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      <button
        type="button"
        onClick={onFit}
        title="Fit schematic to view (Shift+F)"
        aria-label="Fit schematic to view"
      >
        Fit
      </button>
      {!isTransient && liveFlowUiStatus.show && (
        <span
          className={`live-flow-status ${liveFlowUiStatus.tone} ${liveFlowUiStatus.source}`}
          title={liveFlowUiStatus.title}
          role="status"
          aria-live="polite"
          aria-label={`Live Flow: ${liveFlowUiStatus.label}. ${liveFlowUiStatus.title}`}
          data-live-flow-source={liveFlowUiStatus.source}
          data-live-flow-tone={liveFlowUiStatus.tone}
        >
          <span className="live-flow-source-dot" aria-hidden="true" />
          <span className="live-flow-status-label">Live Flow: {liveFlowUiStatus.label}</span>
        </span>
      )}
    </div>
  );
}
