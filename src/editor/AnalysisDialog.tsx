import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import type { AnalysisSpec } from "./model";
import { validateAnalysisSpec } from "./analysisValidation";

interface Props {
  initial: AnalysisSpec;
  open: boolean;
  /** Refdes of sources available to sweep (e.g. ["V1", "V2", "I1"]). */
  sweepableSources: string[];
  sourceLabels?: Map<string, string>;
  /** Whether any voltage source has an AC magnitude. Drives AC-sweep warning. */
  hasAcSource: boolean;
  onClose: () => void;
  onApply: (a: AnalysisSpec) => void;
}

const TABS: { kind: AnalysisSpec["kind"]; label: string; hint: string }[] = [
  { kind: "op", label: "Operating point", hint: "DC bias only (one sample / node)" },
  { kind: "tran", label: "Transient", hint: "Time-domain step response, oscillators, waveforms" },
  { kind: "dc", label: "DC sweep", hint: "Sweep a source over a DC range" },
  { kind: "ac", label: "AC sweep", hint: "Small-signal frequency response (Bode, filters)" },
  { kind: "noise", label: "Noise", hint: "Input-referred / output noise spectral density" },
];

export function AnalysisDialog({
  initial,
  open,
  sweepableSources,
  sourceLabels,
  hasAcSource,
  onClose,
  onApply,
}: Props) {
  const [spec, setSpec] = useState<AnalysisSpec>(initial);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) setSpec(initial);
  }, [open, initial]);
  // Keyboard + focus management. Escape closes; focus is remembered on open
  // and restored on close so the prior trigger button stays in tab order.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    if (card) {
      const focusable = card.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        trapDialogTab(e, cardRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prevFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const tab = spec.kind;
  const validationIssues = validateAnalysisSpec(spec);
  function focusTab(kind: AnalysisSpec["kind"]) {
    window.setTimeout(() => {
      cardRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-analysis-tab="${kind}"]`)
        ?.focus();
    }, 0);
  }

  function onTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.kind === spec.kind);
    if (index < 0) return;
    let nextIndex: number;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    else return;

    e.preventDefault();
    const next = TABS[nextIndex].kind;
    switchTab(next);
    focusTab(next);
  }

  function switchTab(k: AnalysisSpec["kind"]) {
    if (k === spec.kind) return;
    switch (k) {
      case "op":
        setSpec({ kind: "op" });
        break;
      case "tran":
        setSpec({ kind: "tran", tstep: "1u", tstop: "1m" });
        break;
      case "dc":
        setSpec({ kind: "dc", src: sweepableSources[0] ?? "V1", start: "0", stop: "5", step: "0.1" });
        break;
      case "ac":
        setSpec({ kind: "ac", sweep: "dec", npts: 20, fstart: "1", fstop: "1Meg" });
        break;
      case "noise":
        setSpec({
          kind: "noise",
          out_node: "out",
          src: sweepableSources[0] ?? "V1",
          sweep: "dec",
          npts: 10,
          fstart: "1",
          fstop: "1Meg",
        });
        break;
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose} role="presentation">
      <div
        ref={cardRef}
        className="modal-card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Configure simulation"
      >
        <div className="modal-header">
          <div className="modal-title">Configure simulation</div>
          <button className="icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Simulation analysis type">
          {TABS.map((t) => (
            <button
              key={t.kind}
              role="tab"
              aria-selected={tab === t.kind}
              tabIndex={tab === t.kind ? 0 : -1}
              data-analysis-tab={t.kind}
              className={`tab ${tab === t.kind ? "active" : ""}`}
              onKeyDown={onTabKeyDown}
              onClick={() => switchTab(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="tab-hint">
          {TABS.find((t) => t.kind === tab)?.hint}
        </div>

        <div className="form">
          {validationIssues.length > 0 && (
            <div className="form-warn">
              {validationIssues.map((issue) => (
                <div key={`${issue.field}-${issue.message}`}>{issue.message}</div>
              ))}
            </div>
          )}
          {spec.kind === "op" && (
            <div className="form-empty">
              No parameters — operating point is a single DC solve.
            </div>
          )}
          {spec.kind === "tran" && (
            <>
              <FormRow label="Step" hint="Time step (e.g. 1u, 100n)">
                <input
                  className="value-input"
                  value={spec.tstep}
                  onChange={(e) => setSpec({ ...spec, tstep: e.target.value })}
                />
              </FormRow>
              <FormRow label="Stop" hint="Total simulation time (e.g. 1m, 10m)">
                <input
                  className="value-input"
                  value={spec.tstop}
                  onChange={(e) => setSpec({ ...spec, tstop: e.target.value })}
                />
              </FormRow>
              <FormRow label="Start" hint="Output start time (optional)">
                <input
                  className="value-input"
                  value={spec.tstart ?? ""}
                  placeholder="0"
                  onChange={(e) => setSpec({ ...spec, tstart: e.target.value || undefined })}
                />
              </FormRow>
            </>
          )}
          {spec.kind === "dc" && (
            <>
              {sourceWarning("DC sweep", spec.src, sweepableSources) && (
                <div className="form-warn">
                  {sourceWarning("DC sweep", spec.src, sweepableSources)}
                </div>
              )}
              <FormRow label="Source" hint="Refdes of source to sweep">
                {sweepableSources.length > 0 ? (
                  <select
                    className="value-input"
                    value={spec.src}
                    onChange={(e) => setSpec({ ...spec, src: e.target.value })}
                  >
                    {sweepableSources.map((s) => (
                      <option key={s} value={s}>
                        {sourceLabels?.get(s) ?? s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="value-input"
                    value={spec.src}
                    onChange={(e) => setSpec({ ...spec, src: e.target.value })}
                    placeholder="e.g. V1"
                  />
                )}
              </FormRow>
              <FormRow label="Start">
                <input
                  className="value-input"
                  value={spec.start}
                  onChange={(e) => setSpec({ ...spec, start: e.target.value })}
                />
              </FormRow>
              <FormRow label="Stop">
                <input
                  className="value-input"
                  value={spec.stop}
                  onChange={(e) => setSpec({ ...spec, stop: e.target.value })}
                />
              </FormRow>
              <FormRow label="Step">
                <input
                  className="value-input"
                  value={spec.step}
                  onChange={(e) => setSpec({ ...spec, step: e.target.value })}
                />
              </FormRow>
            </>
          )}
          {spec.kind === "ac" && !hasAcSource && (
            <div className="form-warn">
              ⚠ No source in the circuit has an AC magnitude. Set a voltage or current
              source to <code>AC 1</code> (or <code>AC 1 0</code> for phase) so the
              sweep has a stimulus.
            </div>
          )}
          {spec.kind === "ac" && (
            <>
              <FormRow label="Sweep">
                <div className="seg" role="group" aria-label="AC sweep type">
                  {(["dec", "oct", "lin"] as const).map((s) => (
                    <button
                      key={s}
                      className={`seg-btn ${spec.sweep === s ? "active" : ""}`}
                      onClick={() => setSpec({ ...spec, sweep: s })}
                      aria-pressed={spec.sweep === s}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </FormRow>
              <FormRow label="Points" hint="Points per decade/octave (or total for LIN)">
                <input
                  className="value-input"
                  type="number"
                  value={spec.npts}
                  onChange={(e) => setSpec({ ...spec, npts: Number(e.target.value) || 1 })}
                />
              </FormRow>
              <FormRow label="F start">
                <input
                  className="value-input"
                  value={spec.fstart}
                  onChange={(e) => setSpec({ ...spec, fstart: e.target.value })}
                />
              </FormRow>
              <FormRow label="F stop">
                <input
                  className="value-input"
                  value={spec.fstop}
                  onChange={(e) => setSpec({ ...spec, fstop: e.target.value })}
                />
              </FormRow>
            </>
          )}

          {spec.kind === "noise" && (
            <>
              {sourceWarning("Noise analysis", spec.src, sweepableSources) && (
                <div className="form-warn">
                  {sourceWarning("Noise analysis", spec.src, sweepableSources)}
                </div>
              )}
              <FormRow label="Output node" hint="Node label (e.g. out, n3)">
                <input
                  className="value-input"
                  value={spec.out_node}
                  onChange={(e) => setSpec({ ...spec, out_node: e.target.value })}
                />
              </FormRow>
              <FormRow label="Input source" hint="Refdes of input source (e.g. V1)">
                {sweepableSources.length > 0 ? (
                  <select
                    className="value-input"
                    value={spec.src}
                    onChange={(e) => setSpec({ ...spec, src: e.target.value })}
                  >
                    {sweepableSources.map((s) => (
                      <option key={s} value={s}>
                        {sourceLabels?.get(s) ?? s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="value-input"
                    value={spec.src}
                    onChange={(e) => setSpec({ ...spec, src: e.target.value })}
                  />
                )}
              </FormRow>
              <FormRow label="Sweep">
                <div className="seg" role="group" aria-label="Noise sweep type">
                  {(["dec", "oct", "lin"] as const).map((s) => (
                    <button
                      key={s}
                      className={`seg-btn ${spec.sweep === s ? "active" : ""}`}
                      onClick={() => setSpec({ ...spec, sweep: s })}
                      aria-pressed={spec.sweep === s}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </FormRow>
              <FormRow label="Points">
                <input
                  className="value-input"
                  type="number"
                  value={spec.npts}
                  onChange={(e) => setSpec({ ...spec, npts: Number(e.target.value) || 1 })}
                />
              </FormRow>
              <FormRow label="F start">
                <input
                  className="value-input"
                  value={spec.fstart}
                  onChange={(e) => setSpec({ ...spec, fstart: e.target.value })}
                />
              </FormRow>
              <FormRow label="F stop">
                <input
                  className="value-input"
                  value={spec.fstop}
                  onChange={(e) => setSpec({ ...spec, fstop: e.target.value })}
                />
              </FormRow>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="run-btn"
            onClick={() => {
              onApply(spec);
              onClose();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function sourceWarning(
  analysisName: string,
  src: string,
  sweepableSources: string[],
): string | null {
  if (sweepableSources.length === 0) {
    return `${analysisName} needs a voltage or current source.`;
  }
  if (!sweepableSources.some((s) => s.toLowerCase() === src.trim().toLowerCase())) {
    return `${analysisName} source ${src || "(blank)"} is not in this schematic.`;
  }
  return null;
}

function trapDialogTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null && el.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  } else if (!root.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-row">
      <div className="form-label">{label}</div>
      <div className="form-control">
        {labelDirectControls(children, label)}
        {hint && <div className="form-hint">{hint}</div>}
      </div>
    </div>
  );
}

function labelDirectControls(children: React.ReactNode, label: string): React.ReactNode {
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
