// Voltage (node-potential) heatmap: sample each net's voltage at the current
// playback time and map it to a colour, so wires read as a potential map.
// Complementary to live-flow (which shows current direction + speed): this
// shows the potential the current flows "downhill" across.

import type { SimVector } from "../sim/api";
import { findNodeTrace } from "./simVectorLookup.ts";

export interface VoltageHeatmap {
  /** Lower-cased node name → voltage at the sampled time. */
  nodeVoltage: Map<string, number>;
  min: number;
  max: number;
  /** True when at least one non-ground node had a finite voltage. */
  ready: boolean;
}

const EMPTY: VoltageHeatmap = { nodeVoltage: new Map(), min: 0, max: 0, ready: false };

export function emptyVoltageHeatmap(): VoltageHeatmap {
  return EMPTY;
}

/** Min/max node voltage across the WHOLE run (every node, every sample), so
 *  the heatmap scale + legend stay fixed while scrubbing playback instead of
 *  rescaling each frame. Ground (0 V) is always included. */
export function voltageHeatmapGlobalRange(
  vectors: SimVector[],
  nodeNames: Iterable<string>,
  plot: string | undefined,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const name of nodeNames) {
    if (name.toLowerCase() === "0") continue;
    const trace = findNodeTrace(vectors, name, plot);
    if (!trace) continue;
    for (const v of trace.data) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}

/** Sample every node's voltage at `sampleIndex` (the playback time index for
 *  transient runs, or the last sample for static analyses). Ground is pinned
 *  at 0 V and always included so the scale spans from the reference up. The
 *  colour scale uses `range` (the whole-run extent) when given so colours stay
 *  comparable across playback time. */
export function buildVoltageHeatmap(
  vectors: SimVector[],
  nodeNames: Iterable<string>,
  plot: string | undefined,
  sampleIndex: number,
  range?: { min: number; max: number },
): VoltageHeatmap {
  const nodeVoltage = new Map<string, number>();
  let min = range?.min ?? 0;
  let max = range?.max ?? 0;
  let ready = false;
  nodeVoltage.set("0", 0);
  for (const name of nodeNames) {
    const lower = name.toLowerCase();
    if (lower === "0") continue;
    const trace = findNodeTrace(vectors, name, plot);
    if (!trace || trace.data.length === 0) continue;
    const i = Math.min(Math.max(0, sampleIndex), trace.data.length - 1);
    const v = trace.data[i];
    if (!Number.isFinite(v)) continue;
    nodeVoltage.set(lower, v);
    if (!range) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ready = true;
  }
  return { nodeVoltage, min, max, ready };
}

/** Normalized [0,1] position of a node's voltage within the heatmap range. */
export function voltageFraction(heatmap: VoltageHeatmap, node: string | null | undefined): number | null {
  if (node == null) return null;
  const v = heatmap.nodeVoltage.get(node.toLowerCase());
  if (v === undefined) return null;
  if (heatmap.max <= heatmap.min) return 0.5;
  return (v - heatmap.min) / (heatmap.max - heatmap.min);
}

export function voltageColorForNode(
  heatmap: VoltageHeatmap,
  node: string | null | undefined,
): string | null {
  const t = voltageFraction(heatmap, node);
  return t === null ? null : heatColor(t);
}

/** Diverging cool→warm scale: low potential = blue, mid = magenta/purple,
 *  high = red. The hue arc 240°→360° skips the garish green/yellow of a full
 *  rainbow, matching the conventional voltage-heatmap look (blue→purple→red). */
export function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const hue = 240 + 120 * c;
  return `hsl(${hue.toFixed(1)} 90% 55%)`;
}

/** Format a voltage for the heatmap legend (compact engineering form). */
export function formatHeatmapVoltage(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0 V";
  const prefixes: Array<[number, string]> = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
  ];
  const [scale, prefix] = prefixes.find(([candidate]) => a >= candidate) ?? [1e-9, "n"];
  const scaled = v / scale;
  const text = Math.abs(scaled) < 10 ? scaled.toFixed(2) : scaled.toFixed(1);
  return `${text} ${prefix}V`;
}
