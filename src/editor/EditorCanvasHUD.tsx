// Canvas bottom-right HUD: grid / snap / auto-run toggles, zoom readout,
// and fit-to-content. Purely presentational — state and behaviors are
// passed in from Editor.tsx.

import type { describeAutoRunStatus } from "./autoRunStatus.ts";

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
    </div>
  );
}
