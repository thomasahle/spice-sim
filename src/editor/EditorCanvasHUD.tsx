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
  voltageHeatmap: boolean;
  onToggleHeatmap: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  autoRunUi: ReturnType<typeof describeAutoRunStatus>;
  zoom: number;
  onFit: () => void;
  onZoomReset: () => void;
  onShowShortcuts: () => void;
  /** Pointer position in grid cells, or null when off-canvas. */
  cursor: { x: number; y: number } | null;
}

function formatCell(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function EditorCanvasHUD({
  gridVisible,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
  diagonalWires,
  onToggleDiagonal,
  voltageHeatmap,
  onToggleHeatmap,
  autoRun,
  onToggleAutoRun,
  autoRunUi,
  zoom,
  onFit,
  onZoomReset,
  onShowShortcuts,
  cursor,
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
        className={voltageHeatmap ? "active" : ""}
        onClick={onToggleHeatmap}
        title="Colour wires by node voltage (potential heatmap) at the current playback time"
        aria-label="Toggle voltage heatmap"
        aria-pressed={voltageHeatmap}
      >
        Heatmap: {voltageHeatmap ? "On" : "Off"}
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
      <span className="hud-coords" aria-label="Cursor position in grid cells">
        {cursor ? `${formatCell(cursor.x)}, ${formatCell(cursor.y)}` : "–, –"}
      </span>
      <button
        type="button"
        onClick={onZoomReset}
        title="Reset zoom to 100% (⌘0)"
        aria-label="Reset zoom to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
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
