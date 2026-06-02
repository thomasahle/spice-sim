// Node-tool path editing — Inkscape-style operations on a single wire's
// vertices ("nodes"). Pure geometry so it's unit-testable in isolation; the
// editor decides which nodes/segments are eligible (connectivity safety) and
// wraps the results back into the page.
//
// Two v1 operations:
//   • deleteWireNodes — remove vertices and HEAL: re-route an orthogonal
//     segment across each gap so the wire stays one connected polyline.
//   • splitWireAtSegment — remove one edge, SPLITTING the wire into the two
//     fragments on either side.

import { routeWireSegment } from "./placement.ts";
import { compactWirePoints } from "./wireGeometry.ts";
import type { PolylineWire } from "./wireTopology.ts";

// Operates on a single coordinate polyline (`{id, points}`), so it uses the
// polyline shape rather than the graph `Wire`. (See wireTopology.ts.)
type Wire = PolylineWire;

/** Remove `deleted` vertex indices from a wire, healing across each resulting
 *  gap with an orthogonal (or freeform) route so connectivity survives.
 *  Returns the surviving wire (same id) wrapped in an array, or `[]` when fewer
 *  than two vertices remain (the wire is gone). Segments between vertices that
 *  were already adjacent are kept verbatim; only gaps left by a deletion are
 *  re-routed, so untouched bends don't shift. */
export function deleteWireNodes(
  wire: Wire,
  deleted: ReadonlySet<number>,
  orthogonal: boolean,
): Wire[] {
  if (deleted.size === 0) return [wire];
  const kept = wire.points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !deleted.has(i));
  if (kept.length < 2) return [];

  const out: [number, number][] = [kept[0].p];
  for (let k = 1; k < kept.length; k++) {
    const prev = kept[k - 1];
    const cur = kept[k];
    if (cur.i - prev.i === 1) {
      // These two vertices were adjacent in the original — keep the segment.
      out.push(cur.p);
    } else {
      // A vertex (or run) was deleted between them — heal with a fresh route.
      const route = routeWireSegment(
        { x: prev.p[0], y: prev.p[1] },
        { x: cur.p[0], y: cur.p[1] },
        orthogonal,
      );
      for (let r = 1; r < route.length; r++) out.push(route[r]);
    }
  }
  const points = compactWirePoints(out);
  if (points.length < 2) return [];
  return [{ ...wire, points }];
}

/** Split a wire by removing the segment between vertices `segIdx` and
 *  `segIdx+1`, yielding the two fragments on either side. Fragments with fewer
 *  than two vertices (e.g. splitting the only segment of a 2-point wire, or an
 *  end segment) are dropped. The leading fragment keeps the wire's id; the
 *  trailing fragment gets a fresh id from `makeId`. Returns 0, 1, or 2 wires. */
export function splitWireAtSegment(
  wire: Wire,
  segIdx: number,
  makeId: () => string,
): Wire[] {
  if (segIdx < 0 || segIdx >= wire.points.length - 1) return [wire];
  const headPoints = compactWirePoints(wire.points.slice(0, segIdx + 1));
  const tailPoints = compactWirePoints(wire.points.slice(segIdx + 1));
  const out: Wire[] = [];
  if (headPoints.length >= 2) out.push({ ...wire, points: headPoints });
  if (tailPoints.length >= 2) out.push({ id: makeId(), points: tailPoints });
  return out;
}
