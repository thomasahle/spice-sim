// Beginner-friendly help popovers for each component kind. Surfaced via a
// (?) button next to the Inspector "Type" row so new EDA users can learn
// what a component does, what its value format looks like, and what it's
// typically used for — without leaving the schematic.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentKind } from "./model";

const COMPONENT_HELP: Partial<
  Record<ComponentKind, { title: string; body: React.ReactNode }>
> = {
  R: {
    title: "Resistor",
    body: (
      <>
        <p>
          A resistor opposes current. <b>V = I × R</b> (Ohm's law). It
          dissipates power as heat: <b>P = I² × R</b>.
        </p>
        <p>
          <b>Value format:</b> plain number is ohms. Use SI suffixes:{" "}
          <code>1k</code> = 1 kΩ, <code>4.7M</code> = 4.7 MΩ,{" "}
          <code>220</code> = 220 Ω.
        </p>
        <p>
          Common roles: limit LED current, set opamp gain, form RC filters
          with a capacitor, bias transistor bases.
        </p>
      </>
    ),
  },
  C: {
    title: "Capacitor",
    body: (
      <>
        <p>
          Stores charge on plates separated by an insulator.{" "}
          <b>I = C × dV/dt</b> — current flows only when voltage changes.
          Blocks DC, passes AC.
        </p>
        <p>
          <b>Value format:</b> farads. <code>100n</code> = 100 nF,{" "}
          <code>1u</code> = 1 µF, <code>10p</code> = 10 pF.
        </p>
        <p>
          Common roles: smoothing power-supply ripple, AC-coupling between
          stages, setting filter cut-off frequency, decoupling next to ICs.
        </p>
      </>
    ),
  },
  L: {
    title: "Inductor",
    body: (
      <>
        <p>
          Stores energy in a magnetic field. <b>V = L × dI/dt</b> — voltage
          builds across an inductor when current changes. Passes DC, resists
          AC.
        </p>
        <p>
          <b>Value format:</b> henries. <code>10m</code> = 10 mH,{" "}
          <code>1u</code> = 1 µH.
        </p>
        <p>
          Common roles: switching-converter energy storage, RF tuned
          circuits, LC low-pass filters.
        </p>
      </>
    ),
  },
  D: {
    title: "Diode",
    body: (
      <>
        <p>
          Conducts in one direction only — anode (▷) to cathode (|). A
          silicon diode drops about <b>0.7 V</b> when forward-biased.
        </p>
        <p>
          Add a <code>.model</code> directive in SPICE DIRECTIVES for a
          specific part (e.g. 1N4148).
        </p>
        <p>
          Common roles: rectification (AC→DC), voltage clamps,
          reverse-polarity protection, flyback for inductive loads.
        </p>
      </>
    ),
  },
  V: {
    title: "Voltage source",
    body: (
      <>
        <p>
          An <b>independent</b> voltage source — holds the specified
          voltage between its <b>+</b> and <b>−</b> terminals no matter the
          load (ideal).
        </p>
        <p>
          <b>Waveform options:</b>
        </p>
        <ul>
          <li>
            <b>DC</b> — constant voltage.
          </li>
          <li>
            <b>SIN</b> — sinusoid; set amplitude and frequency.
          </li>
          <li>
            <b>PULSE</b> — step / square wave with rise / fall times.
          </li>
          <li>
            <b>PWL</b> — piecewise-linear; specify (t, V) points.
          </li>
          <li>
            <b>AC</b> — small-signal source for an AC sweep.
          </li>
        </ul>
        <p>Most analyses need at least one source plus a ground.</p>
      </>
    ),
  },
  I: {
    title: "Current source",
    body: (
      <>
        <p>
          Forces the specified current from <b>+</b> to <b>−</b> (ideal).
          Same waveform options as a voltage source.
        </p>
      </>
    ),
  },
  B: {
    title: "Behavioral source",
    body: (
      <>
        <p>
          A programmable source driven by an expression. Use <code>V=</code>{" "}
          for a voltage source or <code>I=</code> for a current source.
        </p>
        <p>
          Expressions can reference <code>time</code>, constants, and node
          voltages such as <code>v(in)</code>. Example:{" "}
          <code>V=sin(2*pi*1k*time)</code>.
        </p>
      </>
    ),
  },
  GND: {
    title: "Ground (reference)",
    body: (
      <>
        <p>
          The <b>0 V</b> reference node. Every node voltage the simulator
          reports is relative to ground.
        </p>
        <p>
          <b>Every circuit needs at least one GND</b> or the solver can't
          converge — you'll see "no DC path to ground" errors.
        </p>
      </>
    ),
  },
  NPN: {
    title: "NPN BJT",
    body: (
      <>
        <p>
          When the base (B) is biased about <b>0.7 V</b> above the emitter
          (E), collector → emitter current flows, amplified by β (often
          ~100×).
        </p>
        <p>
          Pins (left → right): <b>Collector</b>, <b>Base</b>,{" "}
          <b>Emitter</b>.
        </p>
        <p>Common roles: small-signal amplifier, switch, current mirror.</p>
      </>
    ),
  },
  PNP: {
    title: "PNP BJT",
    body: (
      <>
        <p>
          Mirror of NPN — current flows <b>emitter → collector</b> when the
          base is pulled ~0.7 V <b>below</b> the emitter. Often used as a
          high-side switch or push-pull output.
        </p>
      </>
    ),
  },
  NMOS: {
    title: "NMOS transistor",
    body: (
      <>
        <p>
          Voltage-controlled. When V<sub>GS</sub> exceeds the threshold
          (~2 V for the level-1 model), current flows drain → source.
        </p>
        <p>
          Pins (left → right): <b>Drain</b>, <b>Gate</b>, <b>Source</b>.
          Parameters <code>W</code>/<code>L</code> set drive strength.
        </p>
      </>
    ),
  },
  PMOS: {
    title: "PMOS transistor",
    body: (
      <>
        <p>
          Conducts when the gate is pulled below the source by more than
          |V<sub>thp</sub>|. The CMOS pull-up partner of NMOS.
        </p>
      </>
    ),
  },
  OPAMP: {
    title: "Operational amplifier",
    body: (
      <>
        <p>
          An ideal opamp drives its output until <b>V(+) = V(−)</b>. Needs
          negative feedback to operate linearly.
        </p>
        <p>
          Pins: <b>+ input</b>, <b>− input</b>, <b>Output</b>.
        </p>
        <p>
          Configurations: inverting amp (R<sub>f</sub> from out to −,{" "}
          R<sub>in</sub> from input to −), non-inverting (resistor divider
          in feedback), buffer (− tied to output), integrator (cap in
          feedback), filter sections.
        </p>
      </>
    ),
  },
  LABEL: {
    title: "Net label",
    body: (
      <>
        <p>
          Names a wire. Two labels with the <b>same name</b> are
          electrically connected even when not touching — useful for
          keeping busy schematics readable.
        </p>
        <p>The label name becomes the node name in simulator output.</p>
      </>
    ),
  },
};

export function ComponentHelp({ kind }: { kind: ComponentKind }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  // Anchor coords for the portalled popover. Recomputed on open + on resize
  // so it tracks the (?) button no matter where the Inspector scrolls.
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    function recompute() {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    // defer to avoid the opening click being interpreted as outside click
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      prevFocusRef.current?.focus?.();
    };
  }, [open]);

  const entry = COMPONENT_HELP[kind];
  if (!entry) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="help-toggle"
        aria-label={`Help: ${entry.title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={`What is a ${entry.title.toLowerCase()}?`}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="help-popover"
            role="dialog"
            aria-modal="false"
            aria-label={`${entry.title} help`}
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="help-popover-head">
              <span className="help-popover-title">{entry.title}</span>
              <button
                ref={closeRef}
                type="button"
                className="help-popover-close"
                onClick={() => setOpen(false)}
                aria-label="Close help"
              >
                ×
              </button>
            </div>
            <div className="help-popover-body">{entry.body}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
