import type { SimVector } from "../sim/api";
import { findNodeTrace } from "./simVectorLookup.ts";
import { isInternalTraceName } from "./waveformEmptyState.ts";
import { voltageTraceNames } from "./xyPlot.ts";

export function defaultVisibleTraceNames(
  vectors: SimVector[],
  probeNodes: Iterable<string>,
  plot: string,
  labeledNodes: Iterable<string> = [],
): Set<string> {
  const probedNames = traceNamesForNodes(vectors, probeNodes, plot);
  if (probedNames.size > 0) return probedNames;

  const labeledNames = traceNamesForNodes(vectors, labeledNodes, plot);
  if (labeledNames.size > 0) return labeledNames;

  const names = new Set<string>();
  for (const name of voltageTraceNames(
    vectors
      .filter((vector) => !vector.is_scale && !isInternalTraceName(vector.name))
      .map((vector) => vector.name),
  )) {
    names.add(name);
  }
  return names;
}

export function traceNamesForNodes(
  vectors: SimVector[],
  nodes: Iterable<string>,
  plot: string,
): Set<string> {
  const names = new Set<string>();
  for (const node of nodes) {
    const trace = findNodeTrace(vectors, node, plot);
    if (trace) names.add(trace.name);
  }
  return names;
}
