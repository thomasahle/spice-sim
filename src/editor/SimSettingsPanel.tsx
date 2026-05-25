// Inline simulation settings — always visible in the right pane.
// Mirrors the AnalysisDialog content but as a flat form instead of a modal.

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import type { AnalysisSpec, SimSettings } from "./model";
import { validateAnalysisSpec } from "./analysisValidation";
import { ValueWithUnit } from "./ValueWithUnit";
import { UNIT_FAMILIES } from "./valueUnits";

interface Props {
  analysis: AnalysisSpec;
  settings: SimSettings | undefined;
  sweepableSources: string[];
  sourceLabels?: Map<string, string>;
  onAnalysis: (a: AnalysisSpec) => void;
  onSettings: (s: SimSettings) => void;
}

const KIND_LABEL: Record<AnalysisSpec["kind"], string> = {
  op: "Operating point",
  tran: "Transient",
  dc: "DC sweep",
  ac: "AC sweep",
  noise: "Noise",
};

const DC_RANGE_PRESETS = [
  { label: "0..5", title: "General 0 to 5 V sweep", start: "0", stop: "5", step: "0.1" },
  { label: "-1..1", title: "Diode I/V range", start: "-1", stop: "1", step: "0.05" },
  { label: "0..3", title: "MOS/BJT transfer range", start: "0", stop: "3", step: "0.05" },
];

// SPICE source refdes prefix determines the units for a DC sweep on it: a
// current source ("I…") sweeps amps, anything else (V… by convention)
// sweeps volts. Falls back to voltage when the field is empty / unknown so
// the dropdown picks a sensible default.
function dcSweepFamily(src: string) {
  return src.trim().toUpperCase().startsWith("I")
    ? UNIT_FAMILIES.current
    : UNIT_FAMILIES.voltage;
}

export function SimSettingsPanel({
  analysis,
  settings,
  sweepableSources,
  sourceLabels,
  onAnalysis,
  onSettings,
}: Props) {
  const validationIssues = validateAnalysisSpec(analysis);
  const dcSourceWarning = sourceWarning("DC sweep", analysis.kind === "dc" ? analysis.src : "", sweepableSources);
  const noiseSourceWarning = sourceWarning("Noise analysis", analysis.kind === "noise" ? analysis.src : "", sweepableSources);

  function switchKind(kind: AnalysisSpec["kind"]) {
    if (kind === analysis.kind) return;
    let next: AnalysisSpec;
    if (kind === "op") next = { kind: "op" };
    else if (kind === "tran") next = { kind: "tran", tstep: "10u", tstop: "10m" };
    else if (kind === "dc")
      next = {
        kind: "dc",
        src: sweepableSources[0] ?? "V1",
        start: "0",
        stop: "5",
        step: "0.1",
      };
    else if (kind === "ac")
      next = { kind: "ac", sweep: "dec", npts: 30, fstart: "1", fstop: "1Meg" };
    else
      next = {
        kind: "noise",
        out_node: "out",
        src: sweepableSources[0] ?? "V1",
        sweep: "dec",
        npts: 10,
        fstart: "1",
        fstop: "1Meg",
      };
    onAnalysis(next);
  }

  // Discriminated-union update — the caller knows which variant they're
  // editing; TS can't see through the dispatch here so we widen and trust.
  function updateA(field: string, value: unknown) {
    onAnalysis({ ...analysis, [field]: value } as AnalysisSpec);
  }

  function updateS<K extends keyof SimSettings>(field: K, value: SimSettings[K]) {
    onSettings({ ...(settings ?? {}), [field]: value });
  }

  return (
    <div className="sim-settings">
      <Row label="Analysis">
        <select
          className="value-input"
          value={analysis.kind}
          onChange={(e) => switchKind(e.target.value as AnalysisSpec["kind"])}
        >
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Row>
      {validationIssues.length > 0 && (
        <div className="form-warn">
          {validationIssues.map((issue) => (
            <div key={`${issue.field}-${issue.message}`}>{issue.message}</div>
          ))}
        </div>
      )}

      {analysis.kind === "tran" && (
        <>
          <Row label="Stop time">
            <ValueWithUnit
              value={analysis.tstop}
              onChange={(next) => updateA("tstop", next)}
              family={UNIT_FAMILIES.time}
              placeholder="10"
              ariaLabel="Transient stop time"
            />
          </Row>
          <Row label="Time step">
            <ValueWithUnit
              value={analysis.tstep}
              onChange={(next) => updateA("tstep", next)}
              family={UNIT_FAMILIES.time}
              placeholder="10"
              ariaLabel="Transient time step"
            />
          </Row>
          <Row label="Start time" hint="optional">
            <ValueWithUnit
              value={analysis.tstart ?? ""}
              onChange={(next) => updateA("tstart", next || undefined)}
              family={UNIT_FAMILIES.time}
              placeholder="0"
              ariaLabel="Transient start time"
            />
          </Row>
        </>
      )}

      {analysis.kind === "dc" && (
        <>
          {dcSourceWarning && <div className="form-warn">{dcSourceWarning}</div>}
          <Row label="Source">
            {sweepableSources.length > 0 ? (
              <select
                className="value-input"
                value={analysis.src}
                onChange={(e) => updateA("src", e.target.value)}
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
                value={analysis.src}
                onChange={(e) => updateA("src", e.target.value)}
              />
            )}
          </Row>
          <Row label="Start">
            <ValueWithUnit
              value={analysis.start}
              onChange={(next) => updateA("start", next)}
              family={dcSweepFamily(analysis.src)}
              ariaLabel="DC sweep start"
            />
          </Row>
          <Row label="Stop">
            <ValueWithUnit
              value={analysis.stop}
              onChange={(next) => updateA("stop", next)}
              family={dcSweepFamily(analysis.src)}
              ariaLabel="DC sweep stop"
            />
          </Row>
          <Row label="Step">
            <ValueWithUnit
              value={analysis.step}
              onChange={(next) => updateA("step", next)}
              family={dcSweepFamily(analysis.src)}
              ariaLabel="DC sweep step"
            />
          </Row>
          <Row label="Range">
            <div className="range-preset-chips" role="group" aria-label="DC sweep range presets">
              {DC_RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="range-preset-chip"
                  title={preset.title}
                  onClick={() =>
                    onAnalysis({
                      ...analysis,
                      start: preset.start,
                      stop: preset.stop,
                      step: preset.step,
                    })
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Row>
        </>
      )}

      {analysis.kind === "ac" && (
        <>
          <Row label="Sweep type">
            <div className="seg" role="group" aria-label="AC sweep type">
              {(["dec", "oct", "lin"] as const).map((s) => (
                <button
                  key={s}
                  className={`seg-btn ${analysis.sweep === s ? "active" : ""}`}
                  onClick={() => updateA("sweep", s)}
                  aria-pressed={analysis.sweep === s}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Points">
            <input
              className="value-input"
              type="number"
              value={analysis.npts}
              onChange={(e) => updateA("npts", Number(e.target.value) || 1)}
            />
          </Row>
          <Row label="F start">
            <ValueWithUnit
              value={analysis.fstart}
              onChange={(next) => updateA("fstart", next)}
              family={UNIT_FAMILIES.frequency}
              ariaLabel="Start frequency"
            />
          </Row>
          <Row label="F stop">
            <ValueWithUnit
              value={analysis.fstop}
              onChange={(next) => updateA("fstop", next)}
              family={UNIT_FAMILIES.frequency}
              ariaLabel="Stop frequency"
            />
          </Row>
        </>
      )}

      {analysis.kind === "noise" && (
        <>
          {noiseSourceWarning && <div className="form-warn">{noiseSourceWarning}</div>}
          <Row label="Output node">
            <input
              className="value-input"
              value={analysis.out_node}
              onChange={(e) => updateA("out_node", e.target.value)}
            />
          </Row>
          <Row label="Input source">
            {sweepableSources.length > 0 ? (
              <select
                className="value-input"
                value={analysis.src}
                onChange={(e) => updateA("src", e.target.value)}
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
                value={analysis.src}
                onChange={(e) => updateA("src", e.target.value)}
              />
            )}
          </Row>
          <Row label="Sweep">
            <div className="seg" role="group" aria-label="Noise sweep type">
              {(["dec", "oct", "lin"] as const).map((s) => (
                <button
                  key={s}
                  className={`seg-btn ${analysis.sweep === s ? "active" : ""}`}
                  onClick={() => updateA("sweep", s)}
                  aria-pressed={analysis.sweep === s}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Points">
            <input
              className="value-input"
              type="number"
              value={analysis.npts}
              onChange={(e) => updateA("npts", Number(e.target.value) || 1)}
            />
          </Row>
          <Row label="F start">
            <ValueWithUnit
              value={analysis.fstart}
              onChange={(next) => updateA("fstart", next)}
              family={UNIT_FAMILIES.frequency}
              ariaLabel="Start frequency"
            />
          </Row>
          <Row label="F stop">
            <ValueWithUnit
              value={analysis.fstop}
              onChange={(next) => updateA("fstop", next)}
              family={UNIT_FAMILIES.frequency}
              ariaLabel="Stop frequency"
            />
          </Row>
        </>
      )}

      {analysis.kind === "op" && (
        <div className="sim-hint">No parameters — single DC operating point.</div>
      )}

      <div className="sim-divider" />

      <Row label="Method">
        <select
          className="value-input"
          value={settings?.method ?? "trap"}
          onChange={(e) => updateS("method", e.target.value as SimSettings["method"])}
        >
          <option value="trap">Trapezoidal</option>
          <option value="gear">Gear</option>
          <option value="be">Backward Euler</option>
        </select>
      </Row>
      <Row label="Temperature" hint="default 27">
        <ValueWithUnit
          value={settings?.temperature ?? ""}
          onChange={(next) => updateS("temperature", next)}
          family={UNIT_FAMILIES.temperature}
          placeholder="27"
          ariaLabel="Simulation temperature"
        />
      </Row>
      <Row label="Options" hint="ngspice .options tokens, space-separated">
        <textarea
          className="value-input sim-advanced-area"
          aria-label="ngspice options"
          value={settings?.options ?? ""}
          onChange={(e) => updateS("options", e.target.value)}
          placeholder="reltol=1e-4 abstol=1e-12 gmin=1e-12"
          spellCheck={false}
          rows={2}
        />
      </Row>
    </div>
  );
}

function Row({
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
