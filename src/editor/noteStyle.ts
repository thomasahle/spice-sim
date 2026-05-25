import type { CircuitComponent } from "./model.ts";

export const NOTE_COLOR_PRESETS = [
  { id: "preactivation", label: "Preactivation", color: "#34c759" },
  { id: "activation", label: "Activation", color: "#af52de" },
  { id: "learning", label: "Learning", color: "#ff9f0a" },
  { id: "signal", label: "Signal path", color: "#0a84ff" },
  { id: "warning", label: "Warning", color: "#ff453a" },
  { id: "measurement", label: "Measurement", color: "#30d158" },
  { id: "control", label: "Control", color: "#bf5af2" },
  { id: "reference", label: "Reference", color: "#ff9500" },
] as const;

export const NOTE_COLOR_PALETTE = NOTE_COLOR_PRESETS.map((preset) => preset.color);

export function noteColorForIndex(index: number): string {
  const normalized = Math.max(0, Math.floor(index));
  return NOTE_COLOR_PALETTE[normalized % NOTE_COLOR_PALETTE.length];
}

export function noteColor(c: CircuitComponent): string {
  const color = c.params?.color;
  return isHexColor(color) ? color : NOTE_COLOR_PALETTE[0];
}

export function withDefaultNoteColor(c: CircuitComponent, noteIndex: number): CircuitComponent {
  if (c.kind !== "NOTE" || c.params?.color) return c;
  return {
    ...c,
    params: {
      ...c.params,
      color: noteColorForIndex(noteIndex),
    },
  };
}

export function noteFillColor(c: CircuitComponent, active = false): string {
  return hexWithAlpha(noteColor(c), active ? 0.16 : 0.1);
}

export function noteStrokeColor(c: CircuitComponent, active = false): string {
  return hexWithAlpha(noteColor(c), active ? 0.95 : 0.72);
}

function isHexColor(value: string | undefined): value is string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "");
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const suffix = Math.round(clamped * 255).toString(16).padStart(2, "0");
  return `${hex}${suffix}`;
}
