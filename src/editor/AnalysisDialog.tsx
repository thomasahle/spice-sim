import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import type { AnalysisSpec } from "./model";
import { validateAnalysisSpec } from "./analysisValidation";
import { SegmentedControl, SelectField, type SelectFieldOption } from "./RadixControls";

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

const SWEEP_TYPE_OPTIONS = [
  { value: "dec", label: "DEC" },
  { value: "oct", label: "OCT" },
  { value: "lin", label: "LIN" },
] as const;

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
  useEffect(() => {
    if (open) setSpec(initial);
  }, [open, initial]);

  const tab = spec.kind;
  const validationIssues = validateAnalysisSpec(spec);
  const sourceOptions = sourceSelectOptions(sweepableSources, sourceLabels);

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
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim" />
        <Dialog.Content className="modal-card" aria-label="Configure simulation">
        <div className="modal-header">
          <Dialog.Title className="modal-title">Configure simulation</Dialog.Title>
          <Dialog.Description className="sr-only">
            Choose the analysis type (operating point, transient, AC, or DC sweep) and its parameters, then run the simulation.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              className="icon-btn"
              title="Close"
              aria-label="Close dialog"
            >
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <line x1={3.5} y1={3.5} x2={10.5} y2={10.5} />
                <line x1={10.5} y1={3.5} x2={3.5} y2={10.5} />
              </svg>
            </button>
          </Dialog.Close>
        </div>

        <Tabs.Root
          value={tab}
          onValueChange={(value) => switchTab(value as AnalysisSpec["kind"])}
        >
          <Tabs.List className="tabs" aria-label="Simulation analysis type">
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.kind}
                value={t.kind}
                className={`tab ${tab === t.kind ? "active" : ""}`}
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
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
                  <SelectField
                    value={spec.src}
                    onValueChange={(src) => setSpec({ ...spec, src })}
                    options={sourceOptions}
                    ariaLabel="Source"
                  />
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
                <SegmentedControl
                  value={spec.sweep}
                  onValueChange={(sweep) => setSpec({ ...spec, sweep: sweep as "dec" | "oct" | "lin" })}
                  options={SWEEP_TYPE_OPTIONS}
                  ariaLabel="AC sweep type"
                />
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
                  <SelectField
                    value={spec.src}
                    onValueChange={(src) => setSpec({ ...spec, src })}
                    options={sourceOptions}
                    ariaLabel="Input source"
                  />
                ) : (
                  <input
                    className="value-input"
                    value={spec.src}
                    onChange={(e) => setSpec({ ...spec, src: e.target.value })}
                  />
                )}
              </FormRow>
              <FormRow label="Sweep">
                <SegmentedControl
                  value={spec.sweep}
                  onValueChange={(sweep) => setSpec({ ...spec, sweep: sweep as "dec" | "oct" | "lin" })}
                  options={SWEEP_TYPE_OPTIONS}
                  ariaLabel="Noise sweep type"
                />
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function sourceSelectOptions(
  sweepableSources: string[],
  sourceLabels?: Map<string, string>,
): SelectFieldOption[] {
  return sweepableSources.map((source) => ({
    value: source,
    label: sourceLabels?.get(source) ?? source,
  }));
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
