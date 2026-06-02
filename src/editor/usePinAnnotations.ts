// Layout / netlist derivations that all share one optimization: while the
// user is mid-drag, freeze the previously-computed value. These walk every
// component/wire/label and would otherwise re-run on every pointermove.
// `useStableDuringDrag` factors out the "ref + reuse" pattern so each memo
// stays a one-liner.

import { useMemo, useRef } from "react";
import { buildNetlistGraph } from "./netlist.ts";
import { buildWireJunctionDots } from "./wireGeometry.ts";
import { graphToLegacyPage } from "./graphConvert.ts";
import { canvasValueLabel } from "./labelFormatting.ts";
import { netLabelLayouts, valueLabelBounds, valueLabelOffsets } from "./labelPlacement.ts";
import type { CircuitDoc as GraphDoc, SchematicPage } from "./model.ts";

export function useStableDuringDrag<T>(
  compute: () => T,
  deps: ReadonlyArray<unknown>,
  isDragging: boolean,
): T {
  const lastRef = useRef<T | null>(null);
  return useMemo(() => {
    if (isDragging && lastRef.current !== null) return lastRef.current;
    const v = compute();
    lastRef.current = v;
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [...deps, isDragging]);
}

export interface PinAnnotationLayouts {
  pinAnnotations: ReturnType<typeof buildNetlistGraph>;
  wireJunctionDots: { x: number; y: number }[];
  componentValueLabelOffsets: ReturnType<typeof valueLabelOffsets>;
  netLabelLayoutMap: ReturnType<typeof netLabelLayouts>;
}

export function usePinAnnotations({
  doc,
  page,
  isDragging,
  canvasValueFontSize,
  stableNodeNames,
}: {
  /** Graph (Model C) doc — connectivity comes from explicit edges. */
  doc: GraphDoc;
  /** Graph (Model C) active page, for cheap layout derivations. */
  page: SchematicPage;
  isDragging: boolean;
  canvasValueFontSize: number;
  stableNodeNames?: Map<string, string>;
}): PinAnnotationLayouts {
  // Only buildNetlistGraph is genuinely expensive — it walks every page to
  // resolve the whole netlist. Freeze just this one while a drag is in flight so
  // we don't rebuild it per pointer-move frame. (The cost: node-name hover text
  // on adjacent wires reads the pre-drag mapping until the drag commits.)
  const pinAnnotations = useStableDuringDrag(() => buildNetlistGraph(doc, stableNodeNames), [doc, stableNodeNames], isDragging);
  // The layout derivations below are cheap single-page traversals, so they run
  // live during a drag — junction dots track the moving wire, value labels and
  // net-label placement reflow as the component moves, instead of snapping into
  // place only on drop.
  // TODO: wireGeometry.buildWireJunctionDots still consumes the legacy polyline
  // page. Bridge through graphToLegacyPage for now — behavior-identical because
  // graphToLegacyPage(graphPage) reconstructs exactly the old legacy page. Drop
  // the bridge once wireGeometry is converted to the graph model.
  const wireJunctionDots = useMemo(() => buildWireJunctionDots(graphToLegacyPage(page)), [page]);
  const componentValueLabelOffsets = useMemo(
    () => valueLabelOffsets(page, (component) => canvasValueLabel(component.kind, component.value) || null),
    [page],
  );
  const netLabelLayoutMap = useMemo(() => {
    const occupied: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const c of page.components) {
      if (c.kind === "LABEL") continue;
      const text = canvasValueLabel(c.kind, c.value);
      const offset = componentValueLabelOffsets.get(c.id);
      if (text && offset) occupied.push(valueLabelBounds(c, offset, text, canvasValueFontSize));
    }
    return netLabelLayouts(page, occupied);
  }, [canvasValueFontSize, componentValueLabelOffsets, page]);
  return { pinAnnotations, wireJunctionDots, componentValueLabelOffsets, netLabelLayoutMap };
}
