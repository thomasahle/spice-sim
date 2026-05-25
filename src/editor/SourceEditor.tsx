// Structured editor for V / I source value strings.
//
// SPICE source values are positional and tedious to hand-edit:
//   "DC 5"
//   "SIN(0 1 1k)"
//   "PULSE(0 5 0 1u 1u 5m 10m)"
//   "AC 1"
// This editor parses the current string, shows labeled fields for the
// active waveform shape, and serialises back on every change.

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { sourcePresetValue, type SourcePreset } from "./sourceValues";
import { ValueWithUnit } from "./ValueWithUnit";
import { UNIT_FAMILIES, type UnitFamily } from "./valueUnits";

export type SourceType = "DC" | "AC" | "SIN" | "PULSE" | "EXP" | "SFFM" | "PWL";

interface Props {
  value: string;
  sourceKind?: "V" | "I";
  onChange: (next: string) => void;
}

interface DCFields { v: string }
interface ACFields { mag: string; phase: string }
interface SINFields { vo: string; va: string; freq: string; td: string; theta: string; phase: string }
interface PULSEFields { v1: string; v2: string; td: string; tr: string; tf: string; pw: string; per: string }
interface EXPFields { v1: string; v2: string; td1: string; tau1: string; td2: string; tau2: string }
interface SFFMFields { vo: string; va: string; fc: string; mdi: string; fs: string }
interface PWLFields { points: { t: string; v: string }[] }

interface Parsed {
  type: SourceType;
  raw?: string; // unparsable remainder, shown as fallback
  dc?: DCFields;
  ac?: ACFields;
  sin?: SINFields;
  pulse?: PULSEFields;
  exp?: EXPFields;
  sffm?: SFFMFields;
  pwl?: PWLFields;
}

const TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "DC", label: "DC" },
  { value: "AC", label: "AC" },
  { value: "SIN", label: "SIN" },
  { value: "PULSE", label: "PULSE" },
  { value: "EXP", label: "EXP" },
  { value: "SFFM", label: "SFFM" },
  { value: "PWL", label: "PWL" },
];

const SOURCE_PRESETS: { id: SourcePreset; label: string; title: string }[] = [
  { id: "ac1", label: "AC 1", title: "Small-signal AC stimulus for frequency sweeps" },
  { id: "sine60", label: "60 Hz sine", title: "5 Vpk voltage sine, useful for rectifiers and line-frequency demos" },
  { id: "sine1k", label: "1 kHz sine", title: "1 Vpk sine, useful for filters and amplifiers" },
  { id: "pulseStep", label: "0→5 step", title: "0 to 5 V pulse with 10 ms period, useful for RC step response" },
];

function pad<T>(arr: string[], idx: number, fallback: T): string | T {
  return idx < arr.length ? arr[idx] : fallback;
}

function parseArgs(inside: string): string[] {
  return inside.split(/[\s,]+/).filter(Boolean);
}

export function parseSource(value: string): Parsed {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { type: "DC", dc: { v: "0" } };
  const upper = trimmed.toUpperCase();
  const fnMatch = trimmed.match(/^(\w+)\s*\(([^)]*)\)/i);
  if (fnMatch) {
    const kind = fnMatch[1].toUpperCase();
    const args = parseArgs(fnMatch[2]);
    switch (kind) {
      case "SIN":
        return {
          type: "SIN",
          sin: {
            vo: (pad(args, 0, "0") as string) || "0",
            va: (pad(args, 1, "1") as string) || "1",
            freq: (pad(args, 2, "1k") as string) || "1k",
            td: (pad(args, 3, "") as string),
            theta: (pad(args, 4, "") as string),
            phase: (pad(args, 5, "") as string),
          },
        };
      case "PULSE":
        return {
          type: "PULSE",
          pulse: {
            v1: (pad(args, 0, "0") as string) || "0",
            v2: (pad(args, 1, "5") as string) || "5",
            td: (pad(args, 2, "0") as string) || "0",
            tr: (pad(args, 3, "1u") as string) || "1u",
            tf: (pad(args, 4, "1u") as string) || "1u",
            pw: (pad(args, 5, "5m") as string) || "5m",
            per: (pad(args, 6, "10m") as string) || "10m",
          },
        };
      case "EXP":
        return {
          type: "EXP",
          exp: {
            v1: (pad(args, 0, "0") as string) || "0",
            v2: (pad(args, 1, "1") as string) || "1",
            td1: (pad(args, 2, "0") as string) || "0",
            tau1: (pad(args, 3, "1m") as string) || "1m",
            td2: (pad(args, 4, "5m") as string) || "5m",
            tau2: (pad(args, 5, "1m") as string) || "1m",
          },
        };
      case "SFFM":
        return {
          type: "SFFM",
          sffm: {
            vo: (pad(args, 0, "0") as string) || "0",
            va: (pad(args, 1, "1") as string) || "1",
            fc: (pad(args, 2, "1k") as string) || "1k",
            mdi: (pad(args, 3, "5") as string) || "5",
            fs: (pad(args, 4, "100") as string) || "100",
          },
        };
      case "PWL": {
        const points: { t: string; v: string }[] = [];
        for (let i = 0; i < args.length; i += 2) {
          points.push({ t: args[i] || "0", v: args[i + 1] || "0" });
        }
        if (points.length === 0) points.push({ t: "0", v: "0" });
        return { type: "PWL", pwl: { points } };
      }
    }
  }
  // Keyword-led forms:
  // "DC 5", "AC 1 30deg", "AC 1"
  if (upper.startsWith("DC")) {
    const rest = trimmed.replace(/^DC\s*/i, "").trim();
    return { type: "DC", dc: { v: rest || "0" } };
  }
  if (upper.startsWith("AC")) {
    const rest = trimmed.replace(/^AC\s*/i, "").trim();
    const [mag, phase] = rest.split(/\s+/);
    return { type: "AC", ac: { mag: mag || "1", phase: phase || "" } };
  }
  // Bare number → DC
  if (/^[-+]?[0-9.][a-zA-Z0-9.eE+\-µ]*$/.test(trimmed)) {
    return { type: "DC", dc: { v: trimmed } };
  }
  // Unknown — show as raw, default to DC.
  return { type: "DC", dc: { v: "0" }, raw: trimmed };
}

export function serializeSource(p: Parsed): string {
  switch (p.type) {
    case "DC":
      return `DC ${p.dc?.v ?? "0"}`;
    case "AC":
      return `AC ${p.ac?.mag ?? "1"}${p.ac?.phase ? " " + p.ac.phase : ""}`;
    case "SIN": {
      const s = p.sin!;
      const tail = [s.td, s.theta, s.phase].filter((x) => x && x.trim() !== "").join(" ");
      const head = `${s.vo} ${s.va} ${s.freq}`;
      return `SIN(${tail ? head + " " + tail : head})`;
    }
    case "PULSE": {
      const x = p.pulse!;
      return `PULSE(${x.v1} ${x.v2} ${x.td} ${x.tr} ${x.tf} ${x.pw} ${x.per})`;
    }
    case "EXP": {
      const x = p.exp!;
      return `EXP(${x.v1} ${x.v2} ${x.td1} ${x.tau1} ${x.td2} ${x.tau2})`;
    }
    case "SFFM": {
      const x = p.sffm!;
      return `SFFM(${x.vo} ${x.va} ${x.fc} ${x.mdi} ${x.fs})`;
    }
    case "PWL": {
      const x = p.pwl!;
      return `PWL(${x.points.map((p) => `${p.t} ${p.v}`).join(" ")})`;
    }
  }
}

export function SourceEditor({ value, sourceKind = "V", onChange }: Props) {
  const typeGroupRef = useRef<HTMLDivElement | null>(null);
  const parsed = useMemo(() => parseSource(value), [value]);
  const isCurrentSource = sourceKind === "I";
  const dcLabel = isCurrentSource ? "Current" : "Voltage";
  const level: UnitFamily = isCurrentSource ? UNIT_FAMILIES.current : UNIT_FAMILIES.voltage;
  const pulseInitialLabel = isCurrentSource ? "I₁ initial" : "V₁ initial";
  const pulseFinalLabel = isCurrentSource ? "I₂ pulsed" : "V₂ pulsed";
  const expInitialLabel = isCurrentSource ? "I₁ initial" : "V₁ initial";
  const expPeakLabel = isCurrentSource ? "I₂ peak" : "V₂ peak";

  function setType(t: SourceType) {
    const next: Parsed = { type: t };
    switch (t) {
      case "DC": next.dc = parsed.dc ?? { v: "5" }; break;
      case "AC": next.ac = parsed.ac ?? { mag: "1", phase: "" }; break;
      case "SIN": next.sin = parsed.sin ?? { vo: "0", va: "1", freq: "1k", td: "", theta: "", phase: "" }; break;
      case "PULSE": next.pulse = parsed.pulse ?? { v1: "0", v2: "5", td: "0", tr: "1u", tf: "1u", pw: "5m", per: "10m" }; break;
      case "EXP": next.exp = parsed.exp ?? { v1: "0", v2: "1", td1: "0", tau1: "1m", td2: "5m", tau2: "1m" }; break;
      case "SFFM": next.sffm = parsed.sffm ?? { vo: "0", va: "1", fc: "1k", mdi: "5", fs: "100" }; break;
      case "PWL": next.pwl = parsed.pwl ?? { points: [{ t: "0", v: "0" }, { t: "1m", v: "5" }] }; break;
    }
    onChange(serializeSource(next));
  }

  function focusTypeButton(type: SourceType) {
    window.setTimeout(() => {
      typeGroupRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-source-type="${type}"]`)
        ?.focus();
    }, 0);
  }

  function onTypeKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = TYPE_OPTIONS.findIndex((o) => o.value === parsed.type);
    if (index < 0) return;
    let nextIndex: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % TYPE_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + TYPE_OPTIONS.length) % TYPE_OPTIONS.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = TYPE_OPTIONS.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const next = TYPE_OPTIONS[nextIndex].value;
    setType(next);
    focusTypeButton(next);
  }

  function update<K extends keyof Parsed>(field: K, mut: (cur: NonNullable<Parsed[K]>) => Parsed[K]) {
    const next: Parsed = { ...parsed };
    (next as unknown as Record<string, unknown>)[field as string] = mut(
      parsed[field] as NonNullable<Parsed[K]>,
    );
    onChange(serializeSource(next));
  }

  return (
    <div className="src-editor">
      <div className="src-type-row">
        <span className="form-label">Waveform</span>
        <div
          ref={typeGroupRef}
          className="src-type-segments"
          role="group"
          aria-label="Source waveform"
        >
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              data-source-type={o.value}
              className={`src-type-btn ${parsed.type === o.value ? "active" : ""}`}
              tabIndex={parsed.type === o.value ? 0 : -1}
              onKeyDown={onTypeKeyDown}
              onClick={() => setType(o.value)}
              aria-pressed={parsed.type === o.value}
              title={sourceTypeTitle(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="src-preset-row">
        <span className="form-label">Presets</span>
        <div className="src-preset-chips" role="group" aria-label="Source presets">
          {SOURCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="src-preset-chip"
              onClick={() => onChange(sourcePresetValue(preset.id, sourceKind))}
              title={preset.title}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {parsed.type === "DC" && parsed.dc && (
        <SrcRow label={dcLabel}>
          <ValueWithUnit
            value={parsed.dc.v}
            onChange={(next) => update("dc", (c) => ({ ...c, v: next }))}
            family={level}
            ariaLabel={dcLabel}
          />
        </SrcRow>
      )}
      {parsed.type === "AC" && parsed.ac && (
        <>
          <SrcRow label="Magnitude">
            <ValueWithUnit
              value={parsed.ac.mag}
              onChange={(next) => update("ac", (c) => ({ ...c, mag: next }))}
              family={level}
              ariaLabel="AC magnitude"
            />
          </SrcRow>
          <SrcRow label="Phase" hint="blank for 0">
            <ValueWithUnit
              value={parsed.ac.phase}
              onChange={(next) => update("ac", (c) => ({ ...c, phase: next }))}
              family={UNIT_FAMILIES.angle}
              ariaLabel="AC phase"
            />
          </SrcRow>
        </>
      )}
      {parsed.type === "SIN" && parsed.sin && (
        <>
          <SrcRow label="DC offset">
            <ValueWithUnit value={parsed.sin.vo} onChange={(n) => update("sin", (c) => ({ ...c, vo: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Amplitude">
            <ValueWithUnit value={parsed.sin.va} onChange={(n) => update("sin", (c) => ({ ...c, va: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Frequency">
            <ValueWithUnit value={parsed.sin.freq} onChange={(n) => update("sin", (c) => ({ ...c, freq: n }))} family={UNIT_FAMILIES.frequency} />
          </SrcRow>
          <SrcRow label="Delay" hint="optional">
            <ValueWithUnit value={parsed.sin.td} onChange={(n) => update("sin", (c) => ({ ...c, td: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Damping θ" hint="optional">
            <ValueWithUnit value={parsed.sin.theta} onChange={(n) => update("sin", (c) => ({ ...c, theta: n }))} family={UNIT_FAMILIES.dimensionless} />
          </SrcRow>
          <SrcRow label="Phase" hint="optional">
            <ValueWithUnit value={parsed.sin.phase} onChange={(n) => update("sin", (c) => ({ ...c, phase: n }))} family={UNIT_FAMILIES.angle} />
          </SrcRow>
        </>
      )}
      {parsed.type === "PULSE" && parsed.pulse && (
        <>
          <SrcRow label={pulseInitialLabel}>
            <ValueWithUnit value={parsed.pulse.v1} onChange={(n) => update("pulse", (c) => ({ ...c, v1: n }))} family={level} />
          </SrcRow>
          <SrcRow label={pulseFinalLabel}>
            <ValueWithUnit value={parsed.pulse.v2} onChange={(n) => update("pulse", (c) => ({ ...c, v2: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Delay">
            <ValueWithUnit value={parsed.pulse.td} onChange={(n) => update("pulse", (c) => ({ ...c, td: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Rise time">
            <ValueWithUnit value={parsed.pulse.tr} onChange={(n) => update("pulse", (c) => ({ ...c, tr: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Fall time">
            <ValueWithUnit value={parsed.pulse.tf} onChange={(n) => update("pulse", (c) => ({ ...c, tf: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Pulse width">
            <ValueWithUnit value={parsed.pulse.pw} onChange={(n) => update("pulse", (c) => ({ ...c, pw: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Period">
            <ValueWithUnit value={parsed.pulse.per} onChange={(n) => update("pulse", (c) => ({ ...c, per: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
        </>
      )}
      {parsed.type === "EXP" && parsed.exp && (
        <>
          <SrcRow label={expInitialLabel}>
            <ValueWithUnit value={parsed.exp.v1} onChange={(n) => update("exp", (c) => ({ ...c, v1: n }))} family={level} />
          </SrcRow>
          <SrcRow label={expPeakLabel}>
            <ValueWithUnit value={parsed.exp.v2} onChange={(n) => update("exp", (c) => ({ ...c, v2: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Rise delay">
            <ValueWithUnit value={parsed.exp.td1} onChange={(n) => update("exp", (c) => ({ ...c, td1: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Rise τ">
            <ValueWithUnit value={parsed.exp.tau1} onChange={(n) => update("exp", (c) => ({ ...c, tau1: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Fall delay">
            <ValueWithUnit value={parsed.exp.td2} onChange={(n) => update("exp", (c) => ({ ...c, td2: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
          <SrcRow label="Fall τ">
            <ValueWithUnit value={parsed.exp.tau2} onChange={(n) => update("exp", (c) => ({ ...c, tau2: n }))} family={UNIT_FAMILIES.time} />
          </SrcRow>
        </>
      )}
      {parsed.type === "SFFM" && parsed.sffm && (
        <>
          <SrcRow label="Offset Vo">
            <ValueWithUnit value={parsed.sffm.vo} onChange={(n) => update("sffm", (c) => ({ ...c, vo: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Amplitude">
            <ValueWithUnit value={parsed.sffm.va} onChange={(n) => update("sffm", (c) => ({ ...c, va: n }))} family={level} />
          </SrcRow>
          <SrcRow label="Carrier fc">
            <ValueWithUnit value={parsed.sffm.fc} onChange={(n) => update("sffm", (c) => ({ ...c, fc: n }))} family={UNIT_FAMILIES.frequency} />
          </SrcRow>
          <SrcRow label="Mod index">
            <ValueWithUnit value={parsed.sffm.mdi} onChange={(n) => update("sffm", (c) => ({ ...c, mdi: n }))} family={UNIT_FAMILIES.dimensionless} />
          </SrcRow>
          <SrcRow label="Signal fs">
            <ValueWithUnit value={parsed.sffm.fs} onChange={(n) => update("sffm", (c) => ({ ...c, fs: n }))} family={UNIT_FAMILIES.frequency} />
          </SrcRow>
        </>
      )}
      {parsed.type === "PWL" && parsed.pwl && (
        <div className="src-pwl">
          <div className="form-label">Points (time, {isCurrentSource ? "current" : "voltage"})</div>
          {parsed.pwl.points.map((pt, i) => (
            <div key={i} className="src-pwl-row">
              <ValueWithUnit
                value={pt.t}
                onChange={(next) =>
                  update("pwl", (c) => ({
                    points: c.points.map((p, j) => (j === i ? { ...p, t: next } : p)),
                  }))
                }
                family={UNIT_FAMILIES.time}
                ariaLabel={`PWL point ${i + 1} time`}
              />
              <ValueWithUnit
                value={pt.v}
                onChange={(next) =>
                  update("pwl", (c) => ({
                    points: c.points.map((p, j) => (j === i ? { ...p, v: next } : p)),
                  }))
                }
                family={level}
                ariaLabel={`PWL point ${i + 1} ${isCurrentSource ? "current" : "voltage"}`}
              />
              <button
                className="src-pwl-del"
                onClick={() =>
                  update("pwl", (c) => ({
                    points: c.points.filter((_, j) => j !== i),
                  }))
                }
                title="Remove point"
                aria-label={`Remove PWL point ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="src-pwl-add"
            onClick={() =>
              update("pwl", (c) => ({ points: [...c.points, { t: "", v: "" }] }))
            }
          >
            + Add point
          </button>
        </div>
      )}

      {parsed.raw && (
        <div className="src-raw-warning">
          Unparsed: <code>{parsed.raw}</code>
        </div>
      )}
    </div>
  );
}

function sourceTypeTitle(type: SourceType): string {
  switch (type) {
    case "DC":
      return "Constant DC source";
    case "AC":
      return "Small-signal AC source";
    case "SIN":
      return "Sinusoidal source";
    case "PULSE":
      return "Pulse source";
    case "EXP":
      return "Exponential source";
    case "SFFM":
      return "Single-frequency FM source";
    case "PWL":
      return "Piecewise-linear source";
  }
}

function SrcRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
