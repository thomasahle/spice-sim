// Canvas bottom-right HUD: grid / snap / auto-run toggles, zoom readout,
// and fit-to-content. Purely presentational — state and behaviors are
// passed in from Editor.tsx.

import type { describeAutoRunStatus } from "./autoRunStatus.ts";

interface EditorCanvasHUDProps {
  gridVisible: boolean;
  onToggleGrid: () => void;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  diagonalWires: boolean;
  onToggleDiagonal: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  autoRunUi: ReturnType<typeof describeAutoRunStatus>;
  zoom: number;
  onFit: () => void;
  onShowShortcuts: () => void;
}

export function EditorCanvasHUD({
  gridVisible,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
  diagonalWires,
  onToggleDiagonal,
  autoRun,
  onToggleAutoRun,
  autoRunUi,
  zoom,
  onFit,
  onShowShortcuts,
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
        className={diagonalWires ? "active" : ""}
        onClick={onToggleDiagonal}
        title="Toggle diagonal wire routing (off = orthogonal/Manhattan, independent of snap)"
        aria-label="Toggle diagonal wire routing"
        aria-pressed={diagonalWires}
      >
        Wires: {diagonalWires ? "Diagonal" : "Right-angle"}
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
      <button
        type="button"
        onClick={onShowShortcuts}
        title="Keyboard shortcuts (?)"
        aria-label="Show keyboard shortcuts"
      >
        ?
      </button>
    </div>
  );
}
