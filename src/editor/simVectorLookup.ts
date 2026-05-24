import type { SimVector } from "../sim/api";

const RUN_QUALIFIER = /^(op|tran|dc|ac|noise)\d+\.(.+)$/i;

export function unqualifiedTraceName(name: string): string {
  return name.match(RUN_QUALIFIER)?.[2] ?? name;
}

export function traceNodeName(name: string): string {
  return unqualifiedTraceName(name)
    .replace(/^v\(/i, "")
    .replace(/\)$/, "")
    .toLowerCase();
}

export function findNodeTrace(
  vectors: SimVector[],
  node: string,
  currentPlot?: string,
): SimVector | undefined {
  const normalizedNode = node.toLowerCase();
  const traces = vectors.filter(
    (v) => !v.is_scale && traceNodeName(v.name) === normalizedNode,
  );
  return preferCurrentPlot(traces, currentPlot);
}

export function findNamedTrace(
  vectors: SimVector[],
  candidates: string[],
  currentPlot?: string,
): SimVector | undefined {
  const normalizedCandidates = new Set(candidates.map((name) => name.toLowerCase()));
  const traces = vectors.filter(
    (v) => !v.is_scale && normalizedCandidates.has(unqualifiedTraceName(v.name).toLowerCase()),
  );
  return preferCurrentPlot(traces, currentPlot);
}

export function latestNodeVoltages(
  vectors: SimVector[],
  nodeNames: Iterable<string>,
  currentPlot?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const node of nodeNames) {
    const trace = findNodeTrace(vectors, node, currentPlot);
    const latest = trace?.data.at(-1);
    if (latest !== undefined) out.set(node, latest);
  }
  out.set("0", 0);
  return out;
}

function preferCurrentPlot(traces: SimVector[], currentPlot?: string): SimVector | undefined {
  if (traces.length === 0) return undefined;
  if (currentPlot) {
    const prefix = `${currentPlot.toLowerCase()}.`;
    const current = traces.find((trace) => trace.name.toLowerCase().startsWith(prefix));
    if (current) return current;
  }
  return traces[traces.length - 1];
}
