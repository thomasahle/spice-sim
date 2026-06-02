// Inline probe-scope placements: which probes deserve an inline mini-scope
// overlay, where the scope rectangle goes, and the trace data (if any) to
// draw. Pulled out of Editor.tsx as a focused hook.

import { useMemo } from "react";
import { coordKey } from "./netlist.ts";
import { inlineProbeScopeLabel, shouldRenderInlineProbeScope } from "./probeDisplay.ts";
import { findNodeTrace } from "./simVectorLookup.ts";
import { layoutProbeScopes } from "./scopeLayout.ts";
import type { Probe } from "./model.ts";
import type { LegacySchematicPage as SchematicPage } from "./legacyModel.ts";
import type { SimResult } from "../sim/api.ts";

export interface ProbeScopePlacement {
  probe: Probe;
  visible: boolean;
  node: string | null;
  label: string | undefined;
  scale: number[];
  trace: number[];
  placement: { dx: number; dy: number };
}

interface UseProbeScopesInput {
  page: SchematicPage;
  posToNode: Map<string, string>;
  nodeDisplayLabels: Map<string, string>;
  hoverId: string | null;
  selectedIds: Set<string>;
  scopeDragProbeId: string | null;
  simResult: SimResult | null;
  defaultDx: number;
  defaultDy: number;
  scopeLayoutOptions: Parameters<typeof layoutProbeScopes>[1];
}

export function useProbeScopes({
  page,
  posToNode,
  nodeDisplayLabels,
  hoverId,
  selectedIds,
  scopeDragProbeId,
  simResult,
  defaultDx,
  defaultDy,
  scopeLayoutOptions,
}: UseProbeScopesInput): {
  probeScopes: ProbeScopePlacement[];
  probeScopeLabelIds: Set<string>;
  visibleProbeScopes: ProbeScopePlacement[];
} {
  const probeScopes = useMemo(() => {
    const scale = simResult?.vectors.find((v) => v.is_scale)?.data ?? [];
    const visibleScopeProbes = page.probes.filter((probe) => {
      const node = posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`);
      const hasTrace = Boolean(
        simResult && node && findNodeTrace(simResult.vectors, node, simResult.plot),
      );
      return shouldRenderInlineProbeScope(probe, {
        selected: selectedIds.has(probe.id),
        hovered: hoverId === probe.id,
        dragging: scopeDragProbeId === probe.id,
        hasTrace,
      });
    });
    const scopePlacements = layoutProbeScopes(
      { ...page, probes: visibleScopeProbes },
      scopeLayoutOptions,
    );
    return page.probes.map<ProbeScopePlacement>((probe) => {
      const visible = visibleScopeProbes.some((vp) => vp.id === probe.id);
      const node = posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`) ?? null;
      const placement = scopePlacements.get(probe.id) ?? { dx: defaultDx, dy: defaultDy };
      if (!node) {
        return { probe, visible, node: null, label: undefined, scale: [], trace: [], placement };
      }
      const label = inlineProbeScopeLabel(probe, nodeDisplayLabels.get(node.toLowerCase()));
      if (!simResult) return { probe, visible, node, label, scale, trace: [], placement };
      const trace = findNodeTrace(simResult.vectors, node, simResult.plot);
      if (!trace) return { probe, visible, node, label, scale, trace: [], placement };
      return { probe, visible, node, label, scale, trace: trace.data, placement };
    });
  }, [
    hoverId,
    nodeDisplayLabels,
    page,
    posToNode,
    scopeDragProbeId,
    selectedIds,
    simResult,
    defaultDx,
    defaultDy,
    scopeLayoutOptions,
  ]);
  const probeScopeLabelIds = useMemo(
    () =>
      new Set(
        probeScopes
          .filter(({ label, node }) => Boolean(node && label?.trim()))
          .map(({ probe }) => probe.id),
      ),
    [probeScopes],
  );
  const visibleProbeScopes = useMemo(
    () => probeScopes.filter(({ visible }) => visible),
    [probeScopes],
  );
  return { probeScopes, probeScopeLabelIds, visibleProbeScopes };
}
