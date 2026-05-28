import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function NetlistModal({
  netlist,
  warnings,
  onClose,
}: {
  netlist: string;
  warnings: string[];
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim" />
        <Dialog.Content className="modal-card netlist-modal" aria-label="Generated netlist">
        <div className="modal-header">
          <Dialog.Title className="modal-title">Generated netlist</Dialog.Title>
          <Dialog.Description className="sr-only">
            Read-only SPICE netlist generated from the current schematic. Copy it or close the dialog.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button className="icon-btn" title="Close" aria-label="Close dialog">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <line x1={3.5} y1={3.5} x2={10.5} y2={10.5} />
                <line x1={10.5} y1={3.5} x2={3.5} y2={10.5} />
              </svg>
            </button>
          </Dialog.Close>
        </div>
        {warnings.length > 0 && (
          <div className="form-warn" style={{ marginBottom: 10 }}>
            <strong>Warnings:</strong>
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <pre className="netlist-pre">{netlist}</pre>
        <div className="modal-actions">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(netlist);
            }}
          >
            Copy
          </button>
          <button className="run-btn" onClick={onClose}>
            Done
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ImportNetlistModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (
    text: string,
    opts: {
      signal?: AbortSignal;
      mode?: "auto" | "labels";
      onPhase?: (
        phase: "parsing" | "layout" | "routing" | "rendering",
        detail?: { current?: number; total?: number },
      ) => void;
    },
  ) => Promise<string[]>;
}) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"parsing" | "layout" | "routing" | "rendering" | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<{ current?: number; total?: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (busy) abortRef.current?.abort();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [busy]);

  // Tick an elapsed-seconds counter while the import is running so the
  // user knows the app hasn't frozen.
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const start = performance.now();
    setElapsed(0);
    const handle = window.setInterval(() => {
      setElapsed((performance.now() - start) / 1000);
    }, 100);
    return () => window.clearInterval(handle);
  }, [busy]);

  async function runImport(mode: "auto" | "labels") {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste a SPICE netlist first.");
      return;
    }
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setPhase("parsing");
    setPhaseDetail(null);
    try {
      await onImport(trimmed, {
        signal: controller.signal,
        mode,
        onPhase: (p, d) => {
          setPhase(p);
          setPhaseDetail(d ?? null);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    } finally {
      abortRef.current = null;
      setPhase(null);
      setPhaseDetail(null);
    }
  }

  function fallbackToLabels() {
    // Abort the in-flight ELK run; importNetlist's catch-and-retry will
    // re-run with mode="labels" automatically.
    abortRef.current?.abort();
  }

  const partCount = useMemo(() => countLikelyParts(text), [text]);
  // Show the "use label-only layout" escape hatch as soon as the user
  // can see ELK is going to take a while. For small netlists, wait 2 s
  // (avoids flashing the button on quick imports). For large netlists
  // (>80 parts), surface it immediately — the user already saw the
  // "large netlists can take a few seconds" warning before hitting
  // Import, and shouldn't have to wait another two before getting out.
  const showFallback = busy && (elapsed >= 2 || partCount > 80);
  const sizeHint = partCount
    ? `~${partCount} component${partCount === 1 ? "" : "s"} detected`
    : null;

  return (
    <Dialog.Root open onOpenChange={(open) => {
      if (open) return;
      if (busy) {
        abortRef.current?.abort();
        return;
      }
      onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim" />
        <Dialog.Content
          className="modal-card netlist-modal"
          aria-label="Import netlist"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            textAreaRef.current?.focus();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
        <div className="modal-header">
          <Dialog.Title className="modal-title">Import netlist</Dialog.Title>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            title="Close"
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <line x1={3.5} y1={3.5} x2={10.5} y2={10.5} />
              <line x1={10.5} y1={3.5} x2={3.5} y2={10.5} />
            </svg>
          </button>
        </div>
        <Dialog.Description style={{ margin: "0 0 8px", color: "var(--ink-muted)", fontSize: 12 }}>
          Paste a SPICE-style netlist. It will replace the current schematic
          (use <strong>Open</strong> instead to import from a file on disk).
        </Dialog.Description>
        <textarea
          ref={textAreaRef}
          className="value-input netlist-pre"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder={"V1 in 0 DC 5\nR1 in out 1k\nC1 out 0 1uF\n.tran 10u 10m\n.end"}
          spellCheck={false}
          style={{ minHeight: 220, fontFamily: "var(--mono)", fontSize: 12, resize: "vertical" }}
          disabled={busy}
        />
        {sizeHint && !busy && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-muted)" }}>
            {sizeHint}
            {partCount > 80 && (
              <>
                {" — large netlists can take a few seconds to auto-layout. "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => runImport("labels")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                    cursor: "pointer",
                    boxShadow: "none",
                  }}
                >
                  Skip auto-layout
                </button>
              </>
            )}
          </div>
        )}
        {busy && (
          <div className="form-warn" role="status" aria-live="polite" style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tb-run-spinner" aria-hidden="true" />
              <strong>{phaseHeadline(phase, phaseDetail)} {elapsed.toFixed(1)}s</strong>
            </div>
            <div style={{ marginTop: 4, color: "var(--ink-muted)", fontSize: 11 }}>
              {phaseDetailText(phase, partCount)}
            </div>
            {showFallback && phase !== "rendering" && (
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={fallbackToLabels}>
                  Cancel auto-layout · use disconnected (label-only) layout
                </button>
              </div>
            )}
            <progress
              style={{ marginTop: 8, width: "100%" }}
              aria-label={`Importing, ${elapsed.toFixed(1)} seconds elapsed`}
            />
          </div>
        )}
        {error && !busy && (
          <div className="form-warn" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="run-btn"
            onClick={() => runImport("auto")}
            disabled={busy || !text.trim()}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ImportPhase = "parsing" | "layout" | "routing" | "rendering" | null;
interface ImportPhaseDetail {
  current?: number;
  total?: number;
}

function phaseHeadline(p: ImportPhase, d: ImportPhaseDetail | null): string {
  switch (p) {
    case "parsing":
      return "Parsing netlist…";
    case "layout":
      return "Laying out components…";
    case "routing":
      if (d && typeof d.current === "number" && typeof d.total === "number") {
        return `Routing wires… ${d.current} of ${d.total}`;
      }
      return "Routing wires…";
    case "rendering":
      return "Rendering schematic…";
    default:
      return "Importing…";
  }
}

function phaseDetailText(
  p: ImportPhase,
  partCount: number,
): string {
  switch (p) {
    case "layout":
      return `Auto-layout running over ${partCount || "the"} component${
        partCount === 1 ? "" : "s"
      } in a Web Worker. ELK is single-pass and grows super-linearly with size; expect a few seconds per 100 components.`;
    case "routing":
      return "Routing the orthogonal wire paths between components. This runs on the main thread; the import can still be cancelled.";
    case "rendering":
      return `Layout done. Mounting ${partCount || "the"} component${
        partCount === 1 ? "" : "s"
      } into the canvas — this is a one-shot React commit that briefly blocks the main thread.`;
    case "parsing":
      return "Reading components, nets, models, and directives.";
    default:
      return "Reading components, nets, models, and directives.";
  }
}

/** Quick heuristic for how many SPICE components are in a netlist —
 *  count non-blank, non-comment, non-directive lines. Used to give the
 *  user a "this is going to take a while" hint before they hit Import. */
function countLikelyParts(text: string): number {
  let n = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("*")) continue;
    if (line.startsWith(".")) continue;
    n += 1;
  }
  return n;
}
