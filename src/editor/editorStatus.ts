export function deletionStatus(
  components: number,
  wires: number,
  probes: number,
  cleanedWires: number,
  cleanedProbes: number,
): string {
  const deleted = selectionSummary(components, wires, probes) || "selection";
  const cleaned: string[] = [];
  if (cleanedWires > 0) cleaned.push(`${cleanedWires} wire stub${cleanedWires === 1 ? "" : "s"}`);
  if (cleanedProbes > 0) cleaned.push(`${cleanedProbes} disconnected probe${cleanedProbes === 1 ? "" : "s"}`);
  return cleaned.length > 0
    ? `Deleted ${deleted}; cleaned ${cleaned.join(", ")}`
    : `Deleted ${deleted}`;
}

export function selectionSummary(components: number, wires: number, probes: number): string {
  const parts: string[] = [];
  if (components > 0) parts.push(`${components} component${components === 1 ? "" : "s"}`);
  if (wires > 0) parts.push(`${wires} wire${wires === 1 ? "" : "s"}`);
  if (probes > 0) parts.push(`${probes} probe${probes === 1 ? "" : "s"}`);
  return parts.join(", ");
}
