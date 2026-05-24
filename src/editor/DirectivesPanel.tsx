// Structured directives editor. Replaces the raw textarea with one card per
// directive: each card knows its directive shape (.meas / .ic / .param /
// .options / .step / .temp / .mc / .subckt) and shows labeled form fields
// instead of positional SPICE syntax. Unrecognised lines fall through as a
// "raw" card so power users aren't blocked.

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";

export type DirectiveKind =
  | "meas"
  | "ic"
  | "param"
  | "options"
  | "step-range"
  | "step-list"
  | "temp"
  | "mc"
  | "subckt"
  | "raw";

type MeasAnalysis = "tran" | "ac" | "dc" | "noise";

export interface Directive {
  id: string;
  kind: DirectiveKind;
  // common
  meas?: {
    analysis: MeasAnalysis;
    name: string;
    func: "MAX" | "MIN" | "AVG" | "RMS" | "PP" | "FIND" | "WHEN" | "INTEG" | "DERIV";
    expr: string;
  };
  ic?: { entries: { node: string; voltage: string }[] };
  param?: { entries: { name: string; value: string }[] };
  options?: { entries: { key: string; value: string }[] };
  stepRange?: { param: string; start: string; stop: string; step: string };
  stepList?: { param: string; values: string[] };
  temp?: { values: string[] };
  mc?: { n: string };
  subckt?: { body: string };
  raw?: { text: string };
}

const MEAS_FUNCS = ["MAX", "MIN", "AVG", "RMS", "PP", "FIND", "WHEN", "INTEG", "DERIV"] as const;

let DIRECTIVE_NEXT_ID = 1;
function nextId(): string { return `dir-${DIRECTIVE_NEXT_ID++}`; }

// ---- parse -----------------------------------------------------------

export function parseDirectives(text: string): Directive[] {
  const out: Directive[] = [];
  const rawLines = (text ?? "").split("\n");
  // Join continuation lines (lines starting with "+").
  const lines: string[] = [];
  for (const ln of rawLines) {
    if (lines.length > 0 && ln.trim().startsWith("+")) {
      lines[lines.length - 1] += " " + ln.trim().slice(1).trim();
    } else {
      lines.push(ln);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("*")) {
      // Comment — preserve as raw.
      out.push({ id: nextId(), kind: "raw", raw: { text: line } });
      continue;
    }
    const lower = line.toLowerCase();
    if (lower.startsWith(".subckt")) {
      // Collect lines until .ends.
      const buf: string[] = [raw];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().toLowerCase().startsWith(".ends")) {
        buf.push(lines[j]);
        j++;
      }
      if (j < lines.length) buf.push(lines[j]);
      i = j;
      out.push({ id: nextId(), kind: "subckt", subckt: { body: buf.join("\n") } });
      continue;
    }
    if (lower.startsWith(".meas")) {
      // .meas <analysis> <name> <FUNC> <expr...>
      const parts = line.split(/\s+/);
      const analysis = (parts[1] || "tran").toLowerCase() as MeasAnalysis;
      const name = parts[2] || "result";
      const funcGuess = (parts[3] || "MAX").toUpperCase();
      const func: typeof MEAS_FUNCS[number] = (MEAS_FUNCS as readonly string[]).includes(
        funcGuess,
      )
        ? (funcGuess as typeof MEAS_FUNCS[number])
        : "MAX";
      const expr = parts.slice(4).join(" ").trim() || "V(out)";
      out.push({
        id: nextId(),
        kind: "meas",
        meas: { analysis, name, func, expr },
      });
      continue;
    }
    if (lower.startsWith(".ic")) {
      // .ic V(a)=1 V(b)=0 ...
      const body = line.slice(3).trim();
      const re = /V\(([^)]+)\)\s*=\s*([^\s,]+)/gi;
      const entries: { node: string; voltage: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        entries.push({ node: m[1], voltage: m[2] });
      }
      if (entries.length === 0) entries.push({ node: "", voltage: "" });
      out.push({ id: nextId(), kind: "ic", ic: { entries } });
      continue;
    }
    if (lower.startsWith(".param")) {
      // .param a=1 b=2  (also .params)
      const body = line.replace(/^\.param[s]?/i, "").trim();
      const entries: { name: string; value: string }[] = [];
      const re = /([A-Za-z_][\w]*)\s*=\s*([^=\s]+(?:\([^)]*\))?)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        entries.push({ name: m[1], value: m[2] });
      }
      if (entries.length === 0) entries.push({ name: "", value: "" });
      out.push({ id: nextId(), kind: "param", param: { entries } });
      continue;
    }
    if (lower.startsWith(".options") || lower.startsWith(".option")) {
      const body = line.replace(/^\.option[s]?/i, "").trim();
      // Tokens are either "key=value" or bare boolean keys.
      const entries: { key: string; value: string }[] = [];
      for (const tok of body.split(/\s+/).filter(Boolean)) {
        if (tok.includes("=")) {
          const [k, ...rest] = tok.split("=");
          entries.push({ key: k, value: rest.join("=") });
        } else {
          entries.push({ key: tok, value: "" });
        }
      }
      if (entries.length === 0) entries.push({ key: "", value: "" });
      out.push({ id: nextId(), kind: "options", options: { entries } });
      continue;
    }
    if (lower.startsWith(".step")) {
      // .step param NAME start stop step
      // .step param NAME list V1 V2 ...
      const parts = line.split(/\s+/);
      // expect parts[0]=.step parts[1]=param parts[2]=NAME ...
      if (parts.length >= 5 && (parts[1] || "").toLowerCase() === "param") {
        const param = parts[2];
        if ((parts[3] || "").toLowerCase() === "list") {
          out.push({
            id: nextId(),
            kind: "step-list",
            stepList: { param, values: parts.slice(4) },
          });
        } else if (parts.length >= 6) {
          out.push({
            id: nextId(),
            kind: "step-range",
            stepRange: { param, start: parts[3], stop: parts[4], step: parts[5] },
          });
        } else {
          out.push({ id: nextId(), kind: "raw", raw: { text: line } });
        }
      } else {
        out.push({ id: nextId(), kind: "raw", raw: { text: line } });
      }
      continue;
    }
    if (lower.startsWith(".temp")) {
      const values = line.replace(/^\.temp/i, "").trim().split(/\s+/).filter(Boolean);
      out.push({ id: nextId(), kind: "temp", temp: { values: values.length ? values : ["27"] } });
      continue;
    }
    if (lower.startsWith(".mc")) {
      const n = line.replace(/^\.mc/i, "").trim().split(/\s+/)[0] || "50";
      out.push({ id: nextId(), kind: "mc", mc: { n } });
      continue;
    }
    out.push({ id: nextId(), kind: "raw", raw: { text: line } });
  }
  return out;
}

// ---- serialize -------------------------------------------------------

export function serializeDirectives(dirs: Directive[]): string {
  const out: string[] = [];
  for (const d of dirs) {
    switch (d.kind) {
      case "meas":
        if (!d.meas) continue;
        out.push(`.meas ${d.meas.analysis} ${d.meas.name} ${d.meas.func} ${d.meas.expr}`);
        break;
      case "ic":
        if (!d.ic || d.ic.entries.length === 0) continue;
        out.push(
          ".ic " +
            d.ic.entries
              .filter((e) => e.node.trim() !== "")
              .map((e) => `V(${e.node})=${e.voltage}`)
              .join(" "),
        );
        break;
      case "param":
        if (!d.param || d.param.entries.length === 0) continue;
        out.push(
          ".param " +
            d.param.entries
              .filter((e) => e.name.trim() !== "")
              .map((e) => `${e.name}=${e.value}`)
              .join(" "),
        );
        break;
      case "options":
        if (!d.options || d.options.entries.length === 0) continue;
        out.push(
          ".options " +
            d.options.entries
              .filter((e) => e.key.trim() !== "")
              .map((e) => (e.value ? `${e.key}=${e.value}` : e.key))
              .join(" "),
        );
        break;
      case "step-range":
        if (!d.stepRange) continue;
        out.push(
          `.step param ${d.stepRange.param} ${d.stepRange.start} ${d.stepRange.stop} ${d.stepRange.step}`,
        );
        break;
      case "step-list":
        if (!d.stepList) continue;
        out.push(`.step param ${d.stepList.param} list ${d.stepList.values.join(" ")}`);
        break;
      case "temp":
        if (!d.temp) continue;
        out.push(`.temp ${d.temp.values.join(" ")}`);
        break;
      case "mc":
        if (!d.mc) continue;
        out.push(`.mc ${d.mc.n}`);
        break;
      case "subckt":
        if (!d.subckt) continue;
        out.push(d.subckt.body);
        break;
      case "raw":
        if (d.raw?.text) out.push(d.raw.text);
        break;
    }
  }
  return out.join("\n");
}

// ---- UI --------------------------------------------------------------

interface Props {
  value: string;
  onChange: (next: string) => void;
}

interface AddOption {
  kind: DirectiveKind;
  label: string;
  hint: string;
  factory: () => Directive;
}

const ADD_OPTIONS: AddOption[] = [
  {
    kind: "meas",
    label: ".meas — measurement",
    hint: "Compute Vpp, RMS, MAX, etc. of a trace",
    factory: () => ({
      id: nextId(),
      kind: "meas",
      meas: { analysis: "tran", name: "vmax", func: "MAX", expr: "V(out)" },
    }),
  },
  {
    kind: "ic",
    label: ".ic — initial conditions",
    hint: "Set node voltages at t=0 for transient",
    factory: () => ({
      id: nextId(),
      kind: "ic",
      ic: { entries: [{ node: "out", voltage: "0" }] },
    }),
  },
  {
    kind: "param",
    label: ".param — named parameters",
    hint: "Define values referenced by {NAME} in device fields",
    factory: () => ({
      id: nextId(),
      kind: "param",
      param: { entries: [{ name: "VAL", value: "1k" }] },
    }),
  },
  {
    kind: "options",
    label: ".options — solver knobs",
    hint: "reltol / abstol / gmin / savecurrents …",
    factory: () => ({
      id: nextId(),
      kind: "options",
      options: { entries: [{ key: "reltol", value: "1e-4" }] },
    }),
  },
  {
    kind: "step-range",
    label: ".step — parametric sweep",
    hint: "Re-run for each value of a parameter",
    factory: () => ({
      id: nextId(),
      kind: "step-range",
      stepRange: { param: "VAL", start: "1k", stop: "10k", step: "1k" },
    }),
  },
  {
    kind: "temp",
    label: ".temp — temperature sweep",
    hint: "Re-run at each listed temperature (°C)",
    factory: () => ({
      id: nextId(),
      kind: "temp",
      temp: { values: ["25", "50", "75"] },
    }),
  },
  {
    kind: "mc",
    label: ".mc — Monte Carlo",
    hint: "Repeat the analysis N times with parameter variation",
    factory: () => ({
      id: nextId(),
      kind: "mc",
      mc: { n: "50" },
    }),
  },
  {
    kind: "subckt",
    label: ".subckt — subcircuit (raw)",
    hint: "Multi-line subckt definition — body is raw SPICE",
    factory: () => ({
      id: nextId(),
      kind: "subckt",
      subckt: {
        body: ".subckt MYBLOCK in out\n  R1 in out 1k\n.ends MYBLOCK",
      },
    }),
  },
];

const KIND_LABEL: Record<DirectiveKind, string> = {
  meas: ".meas",
  ic: ".ic",
  param: ".param",
  options: ".options",
  "step-range": ".step",
  "step-list": ".step (list)",
  temp: ".temp",
  mc: ".mc",
  subckt: ".subckt",
  raw: "raw line",
};

export function DirectivesPanel({ value, onChange }: Props) {
  const dirs = useMemo(() => parseDirectives(value), [value]);
  const [adding, setAdding] = useState(false);
  const addListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!adding) return;
    addListRef.current?.querySelector<HTMLButtonElement>(".dirs-add-row")?.focus();
  }, [adding]);

  function commit(next: Directive[]) {
    onChange(serializeDirectives(next));
  }

  function updateAt(idx: number, mutator: (d: Directive) => Directive) {
    const next = dirs.slice();
    next[idx] = mutator(next[idx]);
    commit(next);
  }
  function removeAt(idx: number) {
    const next = dirs.slice();
    next.splice(idx, 1);
    commit(next);
  }
  function add(opt: AddOption) {
    setAdding(false);
    commit([...dirs, opt.factory()]);
  }

  function focusAddOption(index: number) {
    const buttons = Array.from(
      addListRef.current?.querySelectorAll<HTMLButtonElement>(".dirs-add-row") ?? [],
    );
    buttons[index]?.focus();
  }

  function onAddOptionKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const buttons = Array.from(
      addListRef.current?.querySelectorAll<HTMLButtonElement>(".dirs-add-row") ?? [],
    );
    if (buttons.length === 0) return;
    const index = buttons.findIndex((button) => button === e.currentTarget);
    if (index < 0) return;
    let nextIndex: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      nextIndex = (index + 1) % buttons.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      nextIndex = (index - 1 + buttons.length) % buttons.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = buttons.length - 1;
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAdding(false);
      return;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    focusAddOption(nextIndex);
  }

  return (
    <div className="dirs">
      {dirs.length === 0 && !adding && (
        <div className="dirs-empty">
          No directives. <button className="link-btn" onClick={() => setAdding(true)}>
            Add one
          </button>
        </div>
      )}
      <div className="dirs-list">
        {dirs.map((d, i) => (
          <DirectiveCard
            key={d.id}
            directive={d}
            onChange={(nd) => updateAt(i, () => nd)}
            onDelete={() => removeAt(i)}
          />
        ))}
      </div>

      {adding ? (
        <div
          ref={addListRef}
          className="dirs-add-list"
          role="menu"
          aria-label="Add SPICE directive"
        >
          {ADD_OPTIONS.map((o) => (
            <button
              key={o.kind}
              className="dirs-add-row"
              role="menuitem"
              onKeyDown={onAddOptionKeyDown}
              onClick={() => add(o)}
              title={o.hint}
            >
              <span className="dirs-add-label">{o.label}</span>
              <span className="dirs-add-hint">{o.hint}</span>
            </button>
          ))}
          <button className="dirs-add-cancel" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        dirs.length > 0 && (
          <button className="dirs-add" onClick={() => setAdding(true)}>
            + Add directive
          </button>
        )
      )}
    </div>
  );
}

function DirectiveCard({
  directive,
  onChange,
  onDelete,
}: {
  directive: Directive;
  onChange: (d: Directive) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`dir-card dir-${directive.kind}`}>
      <div className="dir-head">
        <span className="dir-tag">{KIND_LABEL[directive.kind]}</span>
        <span className="dir-summary">{summary(directive)}</span>
        <button className="dir-del" onClick={onDelete} title="Remove">
          ×
        </button>
      </div>
      <div className="dir-body">
        <CardBody directive={directive} onChange={onChange} />
      </div>
    </div>
  );
}

function summary(d: Directive): string {
  switch (d.kind) {
    case "meas":
      return d.meas ? `${d.meas.name} = ${d.meas.func} ${d.meas.expr}` : "";
    case "ic":
      return d.ic ? `${d.ic.entries.length} node${d.ic.entries.length === 1 ? "" : "s"}` : "";
    case "param":
      return d.param ? `${d.param.entries.length} param${d.param.entries.length === 1 ? "" : "s"}` : "";
    case "options":
      return d.options ? `${d.options.entries.length} key${d.options.entries.length === 1 ? "" : "s"}` : "";
    case "step-range":
      return d.stepRange
        ? `${d.stepRange.param}: ${d.stepRange.start}…${d.stepRange.stop} / ${d.stepRange.step}`
        : "";
    case "step-list":
      return d.stepList ? `${d.stepList.param}: ${d.stepList.values.join(", ")}` : "";
    case "temp":
      return d.temp ? d.temp.values.join(", ") + " °C" : "";
    case "mc":
      return d.mc ? `${d.mc.n} runs` : "";
    case "subckt":
      return d.subckt
        ? (d.subckt.body.split("\n")[0] ?? "").slice(0, 40)
        : "";
    case "raw":
      return d.raw?.text.slice(0, 40) ?? "";
  }
}

function CardBody({
  directive,
  onChange,
}: {
  directive: Directive;
  onChange: (d: Directive) => void;
}) {
  switch (directive.kind) {
    case "meas": {
      const m = directive.meas!;
      return (
        <>
          <Row label="Analysis">
            <select
              className="value-input"
              value={m.analysis}
              onChange={(e) =>
                onChange({
                  ...directive,
                  meas: { ...m, analysis: e.target.value as MeasAnalysis },
                })
              }
            >
              <option value="tran">Transient</option>
              <option value="ac">AC</option>
              <option value="dc">DC</option>
              <option value="noise">Noise</option>
            </select>
          </Row>
          <Row label="Name">
            <input
              className="value-input"
              value={m.name}
              onChange={(e) =>
                onChange({ ...directive, meas: { ...m, name: e.target.value } })
              }
              placeholder="vmax"
            />
          </Row>
          <Row label="Function">
            <select
              className="value-input"
              value={m.func}
              onChange={(e) =>
                onChange({
                  ...directive,
                  meas: { ...m, func: e.target.value as typeof MEAS_FUNCS[number] },
                })
              }
            >
              {MEAS_FUNCS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Expression" hint="ngspice trace name or function arg, e.g. V(out)">
            <input
              className="value-input"
              value={m.expr}
              onChange={(e) =>
                onChange({ ...directive, meas: { ...m, expr: e.target.value } })
              }
            />
          </Row>
        </>
      );
    }
    case "ic": {
      const ic = directive.ic!;
      return (
        <KeyValRows
          entries={ic.entries}
          keyLabel="Node"
          valLabel="Voltage (V)"
          onChange={(entries) =>
            onChange({ ...directive, ic: { entries: entries as { node: string; voltage: string }[] } })
          }
          mapKey={(e) => (e as { node: string }).node}
          mapVal={(e) => (e as { voltage: string }).voltage}
          mkEntry={() => ({ node: "", voltage: "" })}
          renameKeys={(k, v) => ({ node: k, voltage: v })}
        />
      );
    }
    case "param": {
      const p = directive.param!;
      return (
        <KeyValRows
          entries={p.entries}
          keyLabel="Name"
          valLabel="Value"
          onChange={(entries) =>
            onChange({ ...directive, param: { entries: entries as { name: string; value: string }[] } })
          }
          mapKey={(e) => (e as { name: string }).name}
          mapVal={(e) => (e as { value: string }).value}
          mkEntry={() => ({ name: "", value: "" })}
          renameKeys={(k, v) => ({ name: k, value: v })}
        />
      );
    }
    case "options": {
      const o = directive.options!;
      return (
        <KeyValRows
          entries={o.entries}
          keyLabel="Key"
          valLabel="Value (blank = flag)"
          onChange={(entries) =>
            onChange({ ...directive, options: { entries: entries as { key: string; value: string }[] } })
          }
          mapKey={(e) => (e as { key: string }).key}
          mapVal={(e) => (e as { value: string }).value}
          mkEntry={() => ({ key: "", value: "" })}
          renameKeys={(k, v) => ({ key: k, value: v })}
        />
      );
    }
    case "step-range": {
      const s = directive.stepRange!;
      return (
        <>
          <Row label="Parameter">
            <input
              className="value-input"
              value={s.param}
              onChange={(e) =>
                onChange({ ...directive, stepRange: { ...s, param: e.target.value } })
              }
            />
          </Row>
          <Row label="Start">
            <input
              className="value-input"
              value={s.start}
              onChange={(e) =>
                onChange({ ...directive, stepRange: { ...s, start: e.target.value } })
              }
            />
          </Row>
          <Row label="Stop">
            <input
              className="value-input"
              value={s.stop}
              onChange={(e) =>
                onChange({ ...directive, stepRange: { ...s, stop: e.target.value } })
              }
            />
          </Row>
          <Row label="Step">
            <input
              className="value-input"
              value={s.step}
              onChange={(e) =>
                onChange({ ...directive, stepRange: { ...s, step: e.target.value } })
              }
            />
          </Row>
        </>
      );
    }
    case "step-list": {
      const s = directive.stepList!;
      return (
        <>
          <Row label="Parameter">
            <input
              className="value-input"
              value={s.param}
              onChange={(e) =>
                onChange({ ...directive, stepList: { ...s, param: e.target.value } })
              }
            />
          </Row>
          <Row label="Values" hint="space-separated">
            <input
              className="value-input"
              value={s.values.join(" ")}
              onChange={(e) =>
                onChange({
                  ...directive,
                  stepList: { ...s, values: e.target.value.split(/\s+/).filter(Boolean) },
                })
              }
            />
          </Row>
        </>
      );
    }
    case "temp": {
      const t = directive.temp!;
      return (
        <Row label="Temperatures (°C)" hint="space-separated">
          <input
            className="value-input"
            value={t.values.join(" ")}
            onChange={(e) =>
              onChange({
                ...directive,
                temp: { values: e.target.value.split(/\s+/).filter(Boolean) },
              })
            }
          />
        </Row>
      );
    }
    case "mc": {
      const m = directive.mc!;
      return (
        <Row label="Iterations">
          <input
            className="value-input"
            type="number"
            value={m.n}
            onChange={(e) =>
              onChange({ ...directive, mc: { n: e.target.value } })
            }
          />
        </Row>
      );
    }
    case "subckt": {
      const s = directive.subckt!;
      return (
        <>
          <div className="form-hint">
            Subcircuit bodies stay as raw SPICE — paste / edit the .subckt block here.
          </div>
          <textarea
            className="value-input dirs-subckt-area"
            value={s.body}
            spellCheck={false}
            onChange={(e) =>
              onChange({ ...directive, subckt: { body: e.target.value } })
            }
            rows={Math.min(8, Math.max(3, s.body.split("\n").length))}
          />
        </>
      );
    }
    case "raw":
      return (
        <>
          <div className="form-hint">
            Unrecognised directive — kept as raw SPICE.
          </div>
          <input
            className="value-input"
            value={directive.raw?.text ?? ""}
            spellCheck={false}
            onChange={(e) =>
              onChange({ ...directive, raw: { text: e.target.value } })
            }
          />
        </>
      );
  }
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

function KeyValRows<E extends object>({
  entries,
  keyLabel,
  valLabel,
  onChange,
  mapKey,
  mapVal,
  mkEntry,
  renameKeys,
}: {
  entries: E[];
  keyLabel: string;
  valLabel: string;
  onChange: (entries: E[]) => void;
  mapKey: (e: E) => string;
  mapVal: (e: E) => string;
  mkEntry: () => E;
  renameKeys: (k: string, v: string) => E;
}) {
  return (
    <div className="kv-rows">
      <div className="kv-head">
        <span>{keyLabel}</span>
        <span>{valLabel}</span>
      </div>
      {entries.map((e, i) => (
        <div className="kv-row" key={i}>
          <input
            className="value-input"
            aria-label={`${keyLabel} ${i + 1}`}
            value={mapKey(e)}
            onChange={(ev) =>
              onChange(
                entries.map((x, j) => (j === i ? renameKeys(ev.target.value, mapVal(x)) : x)),
              )
            }
          />
          <input
            className="value-input"
            aria-label={`${valLabel} ${i + 1}`}
            value={mapVal(e)}
            onChange={(ev) =>
              onChange(
                entries.map((x, j) => (j === i ? renameKeys(mapKey(x), ev.target.value) : x)),
              )
            }
          />
          <button
            className="kv-del"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            title="Remove"
            aria-label={`Remove row ${i + 1}`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="kv-add"
        onClick={() => onChange([...entries, mkEntry()])}
      >
        + Add row
      </button>
    </div>
  );
}
