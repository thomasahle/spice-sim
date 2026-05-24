import type { SimVector } from "../sim/api";
import { findNodeTrace } from "./simVectorLookup.ts";

export function defaultVisibleTraceNames(
  vectors: SimVector[],
  probeNodes: Iterable<string>,
  plot: string,
): Set<string> {
  const names = new Set<string>();
  for (const node of probeNodes) {
    const trace = findNodeTrace(vectors, node, plot);
    if (trace) names.add(trace.name);
  }
  return names;
}
