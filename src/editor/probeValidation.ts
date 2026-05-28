// Probe-connectivity helpers — formatting a floating-pin diagnostic, and
// validating that a probe (often after a copy/translate) still anchors to a
// component pin or wire segment. Pulled out of Editor.tsx; these are pure
// helpers with model/geometry dependencies only.

import type { CircuitComponent, Probe, Wire } from "./model.ts";
import { getPinLayout, makeId, pinWorldPos } from "./model.ts";
import { normalizeCoord, pointOnSegment, samePoint } from "./geometry.ts";
import type { FloatingPinDiagnostic } from "./netlist.ts";

export function floatingPinSummary(pin: FloatingPinDiagnostic): string {
  return `${pin.refdes} ${pin.pinLabel ? `${pin.pinLabel} pin` : `pin ${pin.pinIdx + 1}`}`;
}

export function probeHasConnection(
  probe: Probe,
  components: CircuitComponent[],
  wires: Wire[],
): boolean {
  const p = { x: probe.x, y: probe.y };
  for (const c of components) {
    for (let i = 0; i < getPinLayout(c).length; i++) {
      if (samePoint(p, pinWorldPos(c, i))) return true;
    }
  }
  for (const w of wires) {
    if (w.points.some(([x, y]) => samePoint(p, { x, y }))) return true;
    for (let idx = 0; idx < w.points.length - 1; idx++) {
      const [x1, y1] = w.points[idx];
      const [x2, y2] = w.points[idx + 1];
      if (pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) return true;
    }
  }
  return false;
}

export function copyConnectedProbes(
  probes: Probe[],
  components: CircuitComponent[],
  wires: Wire[],
  ox: number,
  oy: number,
): Probe[] {
  return probes
    .map((pr) => ({
      ...pr,
      id: makeId("probe"),
      x: pr.x + ox,
      y: pr.y + oy,
      scopeDx: pr.scopeDx == null ? undefined : normalizeCoord(pr.scopeDx),
      scopeDy: pr.scopeDy == null ? undefined : normalizeCoord(pr.scopeDy),
    }))
    .filter((pr) => probeHasConnection(pr, components, wires));
}

export function copiedProbesForInsertedTopology(
  probes: Probe[],
  components: CircuitComponent[],
  insertedWires: Wire[],
  existingProbes: Probe[],
): Probe[] {
  return probes.filter((probe) => {
    if (existingProbes.some((existing) => samePoint(existing, probe))) return false;
    return probeHasConnection(probe, components, insertedWires);
  });
}
