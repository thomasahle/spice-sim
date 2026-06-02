// Frozen snapshot of the pre-Model-C (polyline) document shapes. These describe
// circuits as they were stored before the node-graph migration: wires as
// coordinate polylines, probes by coordinate, components without pin-node ids.
//
// Kept as the *input* type for the legacy→graph converter (graphConvert) and for
// loading/migrating older saved docs. New code uses the graph types in
// model.ts / graphModel.ts. Enums (ComponentKind, Rotation, …) still live in
// model.ts and are shared.

import type { AnalysisSpec, ComponentKind, Rotation, SimSettings } from "./model.ts";

export interface LegacyCircuitComponent {
  id: string;
  kind: ComponentKind;
  x: number;
  y: number;
  rotation: Rotation;
  mirrored?: boolean;
  value: string;
  label?: string;
  params?: Record<string, string>;
}

export interface LegacyWire {
  id: string;
  points: [number, number][];
}

export interface LegacyProbe {
  id: string;
  x: number;
  y: number;
  scopeDx?: number;
  scopeDy?: number;
  label?: string;
  color: string;
}

export interface LegacySchematicPage {
  id: string;
  name: string;
  description?: string;
  components: LegacyCircuitComponent[];
  wires: LegacyWire[];
  probes: LegacyProbe[];
}

export interface LegacyCircuitDoc {
  pages: LegacySchematicPage[];
  activePageId: string;
  directives: string;
  analysis: AnalysisSpec;
  simSettings?: SimSettings;
}

// ---------------------------------------------------------------------------
// Legacy-typed wrappers around the (graph-typed) doc/page helpers in model.ts.
//
// These helpers are pure structural plumbing — they find/map pages and read
// component lists; none of them inspect a wire's shape. Graph and legacy pages
// differ ONLY in `wires` (and graph's optional `nodes`), so casting that one
// field away is sound. Editor.tsx imports these while it still edits legacy
// (polyline) docs internally; they disappear once the editor edits the graph
// natively (Model-C C5).
// ---------------------------------------------------------------------------
import {
  emptyDoc as graphEmptyDoc,
  makePage as graphMakePage,
  currentPage as graphCurrentPage,
  updateCurrentPage as graphUpdateCurrentPage,
  updatePageMeta as graphUpdatePageMeta,
  subcircuitPageForInstance as graphSubcircuitPageForInstance,
  subcircuitPinLabelsForInstance as graphSubcircuitPinLabelsForInstance,
  subcircuitPortLabels as graphSubcircuitPortLabels,
  subcircuitPortComponents as graphSubcircuitPortComponents,
  subcircuitPortCount as graphSubcircuitPortCount,
  subcircuitInstanceParamsForPage as graphSubcircuitInstanceParamsForPage,
} from "./model.ts";
import type { CircuitComponent } from "./model.ts";

export const emptyDoc = graphEmptyDoc as unknown as LegacyCircuitDoc;

export function makePage(name: string): LegacySchematicPage {
  return graphMakePage(name) as unknown as LegacySchematicPage;
}

export function currentPage(d: LegacyCircuitDoc): LegacySchematicPage {
  return graphCurrentPage(d as never) as unknown as LegacySchematicPage;
}

export function updateCurrentPage(
  d: LegacyCircuitDoc,
  updater: (p: LegacySchematicPage) => LegacySchematicPage,
): LegacyCircuitDoc {
  return graphUpdateCurrentPage(d as never, updater as never) as unknown as LegacyCircuitDoc;
}

export function updatePageMeta(
  d: LegacyCircuitDoc,
  pageId: string,
  patch: Partial<Pick<LegacySchematicPage, "name" | "description">>,
): LegacyCircuitDoc {
  return graphUpdatePageMeta(d as never, pageId, patch) as unknown as LegacyCircuitDoc;
}

export function subcircuitPageForInstance(
  d: LegacyCircuitDoc,
  component: LegacyCircuitComponent,
): LegacySchematicPage | null {
  return graphSubcircuitPageForInstance(d as never, component as never) as unknown as
    | LegacySchematicPage
    | null;
}

export function subcircuitPinLabelsForInstance(
  d: LegacyCircuitDoc,
  component: LegacyCircuitComponent,
): string[] {
  return graphSubcircuitPinLabelsForInstance(d as never, component as never);
}

export function subcircuitPortLabels(page: LegacySchematicPage): string[] {
  return graphSubcircuitPortLabels(page as never);
}

export function subcircuitPortComponents(page: LegacySchematicPage): CircuitComponent[] {
  return graphSubcircuitPortComponents(page as never);
}

export function subcircuitPortCount(page: LegacySchematicPage): number {
  return graphSubcircuitPortCount(page as never);
}

export function subcircuitInstanceParamsForPage(
  page: LegacySchematicPage,
): Record<string, string> {
  return graphSubcircuitInstanceParamsForPage(page as never);
}
