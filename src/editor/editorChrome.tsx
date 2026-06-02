// Small presentational pieces of the editor's UI shell — the bottom
// status bar, the inspector row layout + aria-label propagation, the
// numeric coordinate field, and the toolbar / sidebar icon glyphs.
// Pulled out of Editor.tsx so it doesn't carry these self-contained
// presentational components inline.

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { CircuitDoc } from "./model.ts";
import { isNeutralStatusMessage, type Tool } from "./toolPredicates.ts";

export function StatusBar({
  engineOk,
  engineName,
  analysisKind,
  running,
  status,
  autoRunLabel,
  autoRunTitle,
  nNodes,
  nComponents,
  plot,
  plotStale,
  selection,
}: {
  engineOk: boolean | null;
  engineName: string;
  analysisKind: CircuitDoc["analysis"]["kind"];
  running: boolean;
  status: string;
  autoRunLabel: string;
  autoRunTitle: string;
  nNodes: number;
  nComponents: number;
  plot: string | null;
  plotStale: boolean;
  selection: string | null;
}) {
  const isError = status.startsWith("✗");
  const isStale = status.startsWith("Modified");
  const showNeutralStatus = isNeutralStatusMessage(status);
  const dotCls = running
    ? "warn"
    : engineOk === false
      ? "err"
      : isError
        ? "err"
        : isStale
          ? "warn"
        : engineOk === true && status.startsWith("✓")
          ? "ok"
          : engineOk === true
            ? "idle"
            : "idle";
  return (
    <div className="statusbar">
      <div className="group">
        <span className={`dot ${dotCls}`} />
        <span>
          {running
            ? "Running…"
            : engineOk === false
              ? "Engine offline"
              : isStale
                ? "Rerun needed"
                : showNeutralStatus
                  ? status
                : "Ready"}
        </span>
      </div>
      <div className="group">
        <span>Engine</span>
        <code>{engineName || "probing…"}</code>
      </div>
      <div className="group">
        <span>Analysis</span>
        <code>{analysisKind.toUpperCase()}</code>
      </div>
      {plot && (
        <div className="group" title={plotStale ? "Previous simulation result; rerun to update." : undefined}>
          <span>Plot</span>
          <code>{plotStale ? `${plot} stale` : plot}</code>
        </div>
      )}
      <div className="group" title={autoRunTitle}>
        <span>Auto</span>
        <code>{autoRunLabel}</code>
      </div>
      {selection && (
        <div className="group selection" title={`${selection} selected`}>
          <span>Selection</span>
          <code>{selection}</code>
        </div>
      )}
      <div className="spacer" />
      <div className="group" title={status}>
        <span>Nodes</span>
        <code>{nNodes}</code>
        <span style={{ marginLeft: 12 }}>Components</span>
        <code>{nComponents}</code>
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">{label}</div>
      <div className="row-value">{labelDirectControls(children, label)}</div>
    </div>
  );
}

function labelDirectControls(children: ReactNode, label: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    if (
      typeof element.type === "string" &&
      ["input", "select", "textarea"].includes(element.type) &&
      !element.props["aria-label"] &&
      !element.props["aria-labelledby"]
    ) {
      return cloneElement(element, { "aria-label": label });
    }
    return child;
  });
}

export function formatCoord(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function CoordinateField({
  value,
  step,
  onCommit,
}: {
  value: number;
  step: number;
  onCommit: (value: string) => void;
}) {
  const formatted = formatCoord(value);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => {
    setDraft(formatted);
  }, [formatted]);

  function commit() {
    if (draft.trim() === "" || !Number.isFinite(Number(draft))) {
      setDraft(formatted);
      return;
    }
    onCommit(draft);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(formatted);
      e.currentTarget.blur();
    }
  }

  return (
    <input
      className="value-input"
      type="number"
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

export function SideNavIcon({ kind }: { kind: "new" | "page" | "folder" }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "new":
      // Pencil-on-square — "new chat" style.
      return (
        <svg {...props}>
          <path d="M2.5 11.5v2h2L13 5l-2-2-8.5 8.5z" />
          <path d="M10 4l2 2" />
        </svg>
      );
    case "page":
      return (
        <svg {...props}>
          <path d="M3.5 1.5h6l3 3v9.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
          <path d="M9.5 1.5v3h3" />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path d="M1.8 4.5h4l1.6 1.4h7v7.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4.5z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Minimal monochrome glyphs for the toolbar — SF Symbols-flavoured. */
export function IconGlyph({ kind }: { kind: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "sidebar":
      // Rectangle with a left-hand divider — universal "toggle sidebar" glyph.
      return (
        <svg {...props}>
          <rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25" />
          <path d="M5.5 2.5v11" />
        </svg>
      );
    case "new":
      return (
        <svg {...props}>
          <path d="M3.5 1.5h6l3 3v9.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
          <path d="M9.5 1.5v3h3" />
          <path d="M8 8.5v3M6.5 10h3" />
        </svg>
      );
    case "open":
      return (
        <svg {...props}>
          <path d="M1.5 4.5h4l1.5 1.5h7v7a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1V4.5z" />
        </svg>
      );
    case "save":
      return (
        <svg {...props}>
          <path d="M2.5 2.5h9l3 3v9a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
          <rect x="4.5" y="2.5" width="6" height="4" />
          <rect x="4.5" y="9.5" width="7" height="5.5" />
        </svg>
      );
    case "undo":
      return (
        <svg {...props}>
          <path d="M3 7.5h7a3.5 3.5 0 0 1 0 7H7" />
          <path d="M5.5 4.5L2.5 7.5l3 3" />
        </svg>
      );
    case "redo":
      return (
        <svg {...props}>
          <path d="M13 7.5H6a3.5 3.5 0 0 0 0 7h3" />
          <path d="M10.5 4.5l3 3-3 3" />
        </svg>
      );
    case "play":
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <polygon points="4,2.5 13,8 4,13.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4M12.5 12.5l-1.4-1.4M4.9 4.9L3.5 3.5" />
        </svg>
      );
    case "netlist":
      return (
        <svg {...props}>
          <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" />
        </svg>
      );
    case "share":
      return (
        <svg {...props}>
          <circle cx="5" cy="8" r="1.8" />
          <circle cx="11.5" cy="4" r="1.8" />
          <circle cx="11.5" cy="12" r="1.8" />
          <path d="M6.6 7.1l3.3-2.1M6.6 8.9l3.3 2.1" />
        </svg>
      );
    case "export":
      return (
        <svg {...props}>
          <path d="M8 2.5v7" />
          <path d="M5.5 5l2.5-2.5L10.5 5" />
          <path d="M3 9.5v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
        </svg>
      );
    case "page":
      return (
        <svg {...props}>
          <path d="M4 2.5h5l3 3v9a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
          <path d="M9 2.5v3h3" />
        </svg>
      );
    case "rotate-cw":
      // Three-quarter circular arrow turning clockwise; arrowhead leads at top.
      return (
        <svg {...props}>
          <path d="M8 3a5 5 0 1 1-5 5" />
          <path d="M7.6 1.1 11 3 7.6 4.9Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "rotate-ccw":
      // Mirror of rotate-cw across the vertical axis — turns counter-clockwise.
      return (
        <svg {...props}>
          <path d="M8 3a5 5 0 1 0 5 5" />
          <path d="M8.4 1.1 5 3 8.4 4.9Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "flip-h":
      // Reflect across a vertical axis: dashed mirror line, arrowheads out.
      return (
        <svg {...props}>
          <path d="M8 2v12" strokeDasharray="1.6 1.6" />
          <path d="M5.5 5 5.5 11 2.5 8Z" fill="currentColor" stroke="none" />
          <path d="M10.5 5 10.5 11 13.5 8Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "flip-v":
      // Reflect across a horizontal axis: dashed mirror line, arrowheads out.
      return (
        <svg {...props}>
          <path d="M2 8h12" strokeDasharray="1.6 1.6" />
          <path d="M5 5.5 11 5.5 8 2.5Z" fill="currentColor" stroke="none" />
          <path d="M5 10.5 11 10.5 8 13.5Z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
  return null;
}

export function ToolIcon({ tool }: { tool: Tool }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 36,
    height: 36,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.07,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (tool === "select") {
    return (
      <svg {...common}>
        <path d="M6 3.5l4.6 14.4 2-5.3 5.3-2z" />
      </svg>
    );
  }
  if (tool === "wire") {
    return (
      <svg {...common}>
        <circle cx={5} cy={12} r={2.4} />
        <circle cx={19} cy={12} r={2.4} />
        <line x1={7.4} y1={12} x2={16.6} y2={12} />
      </svg>
    );
  }
  if (tool === "probe") {
    return (
      <svg {...common}>
        <circle cx={11} cy={10} r={4.2} />
        <circle cx={11} cy={10} r={1} fill="currentColor" stroke="none" />
        <line x1={4.5} y1={19.5} x2={8.2} y2={13.2} />
        <path d="M16 10h4M18.3 7.5l2.2 2.5-2.2 2.5" />
      </svg>
    );
  }
  if (tool === "node") {
    // A path with square node handles — the Inkscape-style node-edit glyph.
    return (
      <svg {...common}>
        <path d="M5 17l6-9 8 5" />
        <rect x="3.4" y="15.4" width="3.2" height="3.2" rx="0.4" />
        <rect x="9.4" y="6.4" width="3.2" height="3.2" rx="0.4" fill="currentColor" />
        <rect x="17.4" y="10.4" width="3.2" height="3.2" rx="0.4" />
      </svg>
    );
  }
  return null;
}
