// SPICE directives editor: a small editor pane with a header row of
// "insert snippet" chips for the directives users reach for most often
// (.meas / .ic / .param / .options / .step / .subckt), plus line numbers
// alongside the monospace textarea.

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

interface Snippet {
  label: string;
  text: string;
  hint?: string;
}

const SNIPPETS: Snippet[] = [
  { label: ".meas", text: ".meas tran vmax MAX V(out)\n", hint: "Compute a derived measurement (RMS, MAX, FIND, etc.)" },
  { label: ".ic", text: ".ic V(out)=0\n", hint: "Initial node voltage for transient" },
  { label: ".param", text: ".param VAL=1k\n", hint: "Named parameter usable as {VAL} in device values" },
  { label: ".options", text: ".options reltol=1e-4 abstol=1e-12\n", hint: "Solver / convergence tweaks" },
  { label: ".step", text: ".step param VAL 1k 10k 1k\n", hint: "Parametric sweep (orchestrated in Spice Sim's Rust layer)" },
  { label: ".temp", text: ".temp 25 50 75\n", hint: "Temperature sweep" },
  { label: ".mc", text: ".mc 50\n", hint: "Monte Carlo iterations" },
  {
    label: ".subckt",
    text: ".subckt MYBLOCK in out\n  R1 in out 1k\n.ends MYBLOCK\n",
    hint: "Define a reusable subcircuit (or use the Pages sidebar)",
  },
  {
    label: "B-source",
    text: "B1 out 0 V=V(in)*V(in)\n",
    hint: "Behavioral voltage/current source — V= or I= with arbitrary expressions of node voltages, time, etc.",
  },
  {
    label: "E/G/H/F",
    text: "E1 out 0 in 0 100\n",
    hint: "Linear controlled sources: E (VCVS), G (VCCS), H (CCVS), F (CCCS)",
  },
];

export function DirectivesEditor({ value, onChange }: Props) {
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function insertSnippet(text: string) {
    const ta = taRef.current;
    const insertAtEnd = !ta || ta.selectionStart === undefined;
    const sep = value && !value.endsWith("\n") ? "\n" : "";
    let next: string;
    let caret: number;
    if (insertAtEnd) {
      next = value + sep + text;
      caret = next.length;
    } else {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const needsNlBefore = before && !before.endsWith("\n");
      const insert = (needsNlBefore ? "\n" : "") + text;
      next = before + insert + after;
      caret = before.length + insert.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(caret, caret);
      }
    });
  }

  const lineCount = Math.max(1, value.split("\n").length);
  const lines = Array.from({ length: lineCount }, (_, i) => i + 1);

  function focusChip(index: number) {
    const chips = Array.from(
      chipsRef.current?.querySelectorAll<HTMLButtonElement>(".directive-chip") ?? [],
    );
    chips[index]?.focus();
  }

  function onChipKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const chips = Array.from(
      chipsRef.current?.querySelectorAll<HTMLButtonElement>(".directive-chip") ?? [],
    );
    if (chips.length === 0) return;
    const index = chips.findIndex((chip) => chip === e.currentTarget);
    if (index < 0) return;
    let nextIndex: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % chips.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + chips.length) % chips.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = chips.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    focusChip(nextIndex);
  }

  return (
    <div className="directives-editor">
      <div
        ref={chipsRef}
        className="directives-chips"
        role="toolbar"
        aria-label="Insert directive snippet"
      >
        {SNIPPETS.map((s, i) => (
          <button
            key={s.label}
            className="directive-chip"
            onClick={() => insertSnippet(s.text)}
            onKeyDown={onChipKeyDown}
            tabIndex={i === 0 ? 0 : -1}
            title={s.hint}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="directives-body">
        <div className="directives-gutter" aria-hidden="true">
          {lines.map((n) => (
            <span key={n} className="directives-lineno">
              {n}
            </span>
          ))}
        </div>
        <textarea
          ref={taRef}
          className="directives-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Add ngspice directives here, e.g.\n.meas tran vmax MAX V(out)\n.ic V(out)=0\n.param R1=1k"}
          spellCheck={false}
          rows={Math.max(5, lineCount)}
          wrap="off"
        />
      </div>
    </div>
  );
}
