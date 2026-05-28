import { useMemo } from "react";
import type { CircuitComponent, Probe, SchematicPage, Wire } from "./model";

export interface EditorSelection {
  selectedList: CircuitComponent[];
  selectedWireList: Wire[];
  selectedProbeList: Probe[];
  lastSelected: CircuitComponent | null;
  lastSelectedWire: Wire | null;
  lastSelectedProbe: Probe | null;
  selectedObjectCount: number;
}

/** Derive the selected components / wires / probes (and the "last selected"
 *  of each, used to drive the inspector) from the active page and the set of
 *  selected ids. Pure derivation — memoized on the page collections so it only
 *  recomputes when the relevant slice or the selection changes. */
export function useEditorSelection(
  page: SchematicPage,
  selectedIds: Set<string>,
): EditorSelection {
  const selectedList = useMemo(
    () => page.components.filter((c) => selectedIds.has(c.id)),
    [page.components, selectedIds],
  );
  const selectedWireList = useMemo(
    () => page.wires.filter((w) => selectedIds.has(w.id)),
    [page.wires, selectedIds],
  );
  const selectedProbeList = useMemo(
    () => page.probes.filter((pr) => selectedIds.has(pr.id)),
    [page.probes, selectedIds],
  );
  const lastSelected = selectedList[selectedList.length - 1] ?? null;
  const lastSelectedWire = selectedWireList[selectedWireList.length - 1] ?? null;
  const lastSelectedProbe = selectedProbeList[selectedProbeList.length - 1] ?? null;
  const selectedObjectCount =
    selectedList.length + selectedWireList.length + selectedProbeList.length;
  return {
    selectedList,
    selectedWireList,
    selectedProbeList,
    lastSelected,
    lastSelectedWire,
    lastSelectedProbe,
    selectedObjectCount,
  };
}
