// Layout / netlist derivations that all share one optimization: while the
// user is mid-drag, freeze the previously-computed value. These walk every
// component/wire/label and would otherwise re-run on every pointermove.
// `useStableDuringDrag` factors out the "ref + reuse" pattern so each memo
// stays a one-liner.

import { useMemo, useRef } from "react";
import { buildNetlist } from "./netlist.ts";
import { buildWireJunctionDots } from "./wireGeometry.ts";
import { canvasValueLabel } from "./labelFormatting.ts";
import { netLabelLayouts, valueLabelBounds, valueLabelOffsets } from "./labelPlacement.ts";
import type { CircuitDoc, SchematicPage } from "./model.ts";

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
  pinAnnotations: ReturnType<typeof buildNetlist>;
  wireJunctionDots: { x: number; y: number }[];
  componentValueLabelOffsets: ReturnType<typeof valueLabelOffsets>;
  netLabelLayoutMap: ReturnType<typeof netLabelLayouts>;
}

export function usePinAnnotations({
  doc,
  page,
  isDragging,
  canvasValueFontSize,
}: {
  doc: CircuitDoc;
  page: SchematicPage;
  isDragging: boolean;
  canvasValueFontSize: number;
}): PinAnnotationLayouts {
  const pinAnnotations = useStableDuringDrag(() => buildNetlist(doc), [doc], isDragging);
  const wireJunctionDots = useStableDuringDrag(
    () => buildWireJunctionDots(page),
    [page],
    isDragging,
  );
  const componentValueLabelOffsets = useStableDuringDrag(
    () => valueLabelOffsets(page, (component) => canvasValueLabel(component.kind, component.value) || null),
    [page],
    isDragging,
  );
  const netLabelLayoutMap = useStableDuringDrag(
    () => {
      const occupied: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const c of page.components) {
        if (c.kind === "LABEL") continue;
        const text = canvasValueLabel(c.kind, c.value);
        const offset = componentValueLabelOffsets.get(c.id);
        if (text && offset) occupied.push(valueLabelBounds(c, offset, text, canvasValueFontSize));
      }
      return netLabelLayouts(page, occupied);
    },
    [canvasValueFontSize, componentValueLabelOffsets, page],
    isDragging,
  );
  return { pinAnnotations, wireJunctionDots, componentValueLabelOffsets, netLabelLayoutMap };
}
