// Derive trace metadata for the waveform pane: aliases (V(node) → friendly
// names from net labels and probe labels), the user-trace allow-list, the
// stepped-run labels, and the parsed .measure directives. Pulled out of
// Editor.tsx as a focused hook — all four memos depend on the same handful
// of inputs and are purely derived.

import { useMemo } from "react";
import { coordKey } from "./netlist.ts";
import { traceAliasKey } from "./traceNames.ts";
import { traceNamesForNodes } from "./traceVisibility.ts";
import { sweepRunLabelsFromDirectives } from "./sweepRunLabels.ts";
import { measurementDirectivesFromText, type MeasurementDirectiveInfo } from "./measurementUnits.ts";
import type { Probe } from "./model.ts";
import type { SimResult } from "../sim/api.ts";

export interface TraceMetadata {
  traceAliases: Map<string, string>;
  userTraceNames: Set<string>;
  runLabels: Map<number, string>;
  measurementDirectives: Map<string, MeasurementDirectiveInfo>;
}

export function useTraceMetadata({
  probes,
  nodeDisplayLabels,
  posToNode,
  simResult,
  directives,
}: {
  probes: Probe[];
  nodeDisplayLabels: Map<string, string>;
  posToNode: Map<string, string>;
  simResult: SimResult | null;
  directives: string;
}): TraceMetadata {
  const traceAliases = useMemo(() => {
    const aliases = new Map<string, string>();
    for (const [node, label] of nodeDisplayLabels) {
      aliases.set(traceAliasKey(`v(${node})`), `V(${label})`);
      aliases.set(traceAliasKey(node), `V(${label})`);
    }
    for (const probe of probes) {
      const label = probe.label?.trim();
      if (!label) continue;
      const node = posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`);
      if (!node) continue;
      aliases.set(traceAliasKey(`v(${node})`), label);
      aliases.set(traceAliasKey(node), label);
    }
    return aliases;
  }, [nodeDisplayLabels, probes, posToNode]);

  const userTraceNames = useMemo(() => {
    if (!simResult) return new Set<string>();
    const probeNodes = probes
      .map((probe) => posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`))
      .filter((node): node is string => !!node);
    const labeledNodes = Array.from(nodeDisplayLabels.keys());
    return new Set([
      ...traceNamesForNodes(simResult.vectors, probeNodes, simResult.plot),
      ...traceNamesForNodes(simResult.vectors, labeledNodes, simResult.plot),
    ]);
  }, [nodeDisplayLabels, probes, posToNode, simResult]);

  const runLabels = useMemo(() => sweepRunLabelsFromDirectives(directives), [directives]);

  const measurementDirectives = useMemo(
    () => measurementDirectivesFromText(directives),
    [directives],
  );

  return { traceAliases, userTraceNames, runLabels, measurementDirectives };
}
