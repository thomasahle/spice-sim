// Canvas notice banner — shows ephemeral status messages, disconnected-probe
// counts, and floating-pin diagnostics with action buttons. Self-contained:
// returns null when there's nothing to show.

import type { FloatingPinDiagnostic } from "./netlist.ts";

interface EditorCanvasNoticeProps {
  canvasNotice: string | null;
  disconnectedProbeIds: Set<string>;
  runFloatingPins: FloatingPinDiagnostic[];
  firstFloatingPinLabel: string | null;
  onRemoveDisconnectedProbes: () => void;
  onSelectFloatingPin: (pin: FloatingPinDiagnostic) => void;
}

export function EditorCanvasNotice({
  canvasNotice,
  disconnectedProbeIds,
  runFloatingPins,
  firstFloatingPinLabel,
  onRemoveDisconnectedProbes,
  onSelectFloatingPin,
}: EditorCanvasNoticeProps) {
  if (!canvasNotice && disconnectedProbeIds.size === 0 && runFloatingPins.length === 0) {
    return null;
  }
  return (
    <div className="canvas-issue-banner" role="status" aria-live="polite">
      {canvasNotice && (
        <span className="canvas-issue-item">
          <span className="canvas-issue-label">{canvasNotice}</span>
        </span>
      )}
      {(disconnectedProbeIds.size > 0 || runFloatingPins.length > 0) && (
        <>
          {disconnectedProbeIds.size > 0 && (
            <span className="canvas-issue-item">
              <span className="canvas-issue-label">
                {disconnectedProbeIds.size} probe{disconnectedProbeIds.size === 1 ? "" : "s"} not connected
              </span>
              <button
                type="button"
                className="canvas-issue-action"
                aria-label={`Remove ${disconnectedProbeIds.size} disconnected probe${disconnectedProbeIds.size === 1 ? "" : "s"}`}
                onClick={onRemoveDisconnectedProbes}
              >
                Remove
              </button>
            </span>
          )}
          {runFloatingPins.length > 0 && (
            <span className="canvas-issue-item">
              <span className="canvas-issue-label">
                {runFloatingPins.length === 1
                  ? `${firstFloatingPinLabel} floating`
                  : `${runFloatingPins.length} floating pins - first: ${firstFloatingPinLabel}`}
              </span>
              <button
                type="button"
                className="canvas-issue-action"
                aria-label={`Show ${firstFloatingPinLabel}`}
                onClick={() => onSelectFloatingPin(runFloatingPins[0])}
              >
                Show pin
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}
