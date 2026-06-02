// Probe / label connectivity diagnostics: which probes don't anchor to a
// node, which net labels are connected vs. dangling near a pin. Pulled out
// of Editor.tsx as a small focused hook.

import { useMemo } from "react";
import { coordKey } from "./netlist.ts";
import { connectedNetLabelIds, netLabelNearMisses } from "./netLabelConnections.ts";
import type { Probe } from "./model.ts";
import type { SchematicPage } from "./model.ts";

export interface ProbeConnectivity {
  disconnectedProbeIds: Set<string>;
  connectedLabelIds: Set<string>;
  labelNearMisses: ReturnType<typeof netLabelNearMisses>;
  nearMissLabelIds: Set<string>;
}

export function useProbeConnectivity(
  page: SchematicPage,
  probes: Probe[],
  posToNode: Map<string, string>,
): ProbeConnectivity {
  const disconnectedProbeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const probe of probes) {
      const node = posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`);
      if (!node) ids.add(probe.id);
    }
    return ids;
  }, [probes, posToNode]);
  const connectedLabelIds = useMemo(() => connectedNetLabelIds(page), [page]);
  const labelNearMisses = useMemo(() => netLabelNearMisses(page), [page]);
  const nearMissLabelIds = useMemo(
    () => new Set(labelNearMisses.map((nearMiss) => nearMiss.labelId)),
    [labelNearMisses],
  );
  return { disconnectedProbeIds, connectedLabelIds, labelNearMisses, nearMissLabelIds };
}
