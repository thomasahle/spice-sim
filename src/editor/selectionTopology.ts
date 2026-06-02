import { pointOnSegment, samePoint } from "./geometry.ts";
import {
  getPinLayout,
  pinWorldPos,
  type CircuitComponent,
  type Probe,
} from "./model.ts";
import {
  pinNodeIndex,
  wirePolyline,
  type PinNodeOwner,
  type SchematicPage,
  type Wire,
} from "./graphModel.ts";

export interface SelectedTopology {
  components: CircuitComponent[];
  wires: Wire[];
  probes: Probe[];
}

export function collectSelectedTopology(
  page: SchematicPage,
  selectedIds: Set<string>,
): SelectedTopology {
  const components = page.components.filter((component) => selectedIds.has(component.id));
  const wires = page.wires.filter((wire) => selectedIds.has(wire.id));
  const idx = pinNodeIndex(page);
  const probes = page.probes.filter(
    (probe) =>
      selectedIds.has(probe.id) ||
      probeHasConnectionToTopology(probe, components, wires, page, idx),
  );
  return { components, wires, probes };
}

export function probeHasConnectionToTopology(
  probe: Probe,
  components: CircuitComponent[],
  wires: Wire[],
  page: SchematicPage,
  pinIdx?: Map<string, PinNodeOwner>,
): boolean {
  const point = { x: probe.x, y: probe.y };
  for (const component of components) {
    for (let idx = 0; idx < getPinLayout(component).length; idx++) {
      if (samePoint(point, pinWorldPos(component, idx))) return true;
    }
  }
  for (const wire of wires) {
    const points = wirePolyline(page, wire, pinIdx);
    if (!points) continue;
    if (points.some(([x, y]) => samePoint(point, { x, y }))) return true;
    for (let idx = 0; idx < points.length - 1; idx++) {
      const [x1, y1] = points[idx];
      const [x2, y2] = points[idx + 1];
      if (pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) return true;
    }
  }
  return false;
}
