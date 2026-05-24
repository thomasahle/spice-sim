import type { CircuitComponent, Probe, Wire } from "./model";

const CLIPBOARD_PREFIX = "application/x-spicesim-selection+json;version=1";

export interface SchematicClipboard {
  components: CircuitComponent[];
  wires: Wire[];
  probes: Probe[];
}

export function clipboardHasContent(cb: SchematicClipboard | null): boolean {
  return Boolean(cb && (cb.components.length > 0 || cb.wires.length > 0 || cb.probes.length > 0));
}

export function encodeSchematicClipboard(cb: SchematicClipboard): string {
  return `${CLIPBOARD_PREFIX}\n${JSON.stringify(cb)}`;
}

export function decodeSchematicClipboard(text: string): SchematicClipboard | null {
  if (!text.startsWith(`${CLIPBOARD_PREFIX}\n`)) return null;
  const payload = text.slice(CLIPBOARD_PREFIX.length + 1);
  try {
    return normalizeClipboard(JSON.parse(payload));
  } catch {
    return null;
  }
}

function normalizeClipboard(value: unknown): SchematicClipboard | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const components = normalizeComponents(record.components);
  const wires = normalizeWires(record.wires);
  const probes = normalizeProbes(record.probes);
  if (!components || !wires || !probes) return null;
  return { components, wires, probes };
}

function normalizeComponents(value: unknown): CircuitComponent[] | null {
  if (!Array.isArray(value)) return null;
  const components: CircuitComponent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      typeof c.kind !== "string" ||
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      typeof c.rotation !== "number" ||
      typeof c.value !== "string"
    ) {
      return null;
    }
    components.push({
      ...(c as unknown as CircuitComponent),
      id: c.id,
      kind: c.kind as CircuitComponent["kind"],
      x: c.x,
      y: c.y,
      rotation: c.rotation as CircuitComponent["rotation"],
      value: c.value,
    });
  }
  return components;
}

function normalizeWires(value: unknown): Wire[] | null {
  if (!Array.isArray(value)) return null;
  const wires: Wire[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const w = item as Record<string, unknown>;
    if (typeof w.id !== "string" || !Array.isArray(w.points)) return null;
    const points: [number, number][] = [];
    for (const point of w.points) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        typeof point[0] !== "number" ||
        typeof point[1] !== "number"
      ) {
        return null;
      }
      points.push([point[0], point[1]]);
    }
    wires.push({ id: w.id, points });
  }
  return wires;
}

function normalizeProbes(value: unknown): Probe[] | null {
  if (!Array.isArray(value)) return null;
  const probes: Probe[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    if (
      typeof p.id !== "string" ||
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      typeof p.color !== "string"
    ) {
      return null;
    }
    probes.push({ ...(p as unknown as Probe), id: p.id, x: p.x, y: p.y, color: p.color });
  }
  return probes;
}
