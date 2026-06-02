// The GEOMETRY document shape: circuits described as coordinate polylines, the
// way they were stored before the Model-C node-graph migration. This is NOT a
// rival document model — the graph (model.ts / graphModel.ts) is the one and
// only editor document model. These types exist solely as the import / export /
// migration BOUNDARY shape: demos, netlist import, the schematic clipboard,
// persistence migration, and the SVG / netlist projections all speak geometry
// ({wires with points}) and convert to/from the graph via graphConvert.
//
// Enums (ComponentKind, Rotation, …) and the analysis/sim types live in
// model.ts and are shared.

import type { AnalysisSpec, ComponentKind, Rotation, SimSettings } from "./model.ts";

export interface GeometryComponent {
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

/** A wire as a coordinate polyline (the geometry boundary shape). The graph
 *  `Wire` ({id,a,b,bends}) is the editor's real wire; this is what crosses the
 *  import/export/clipboard boundary. */
export interface GeometryWire {
  id: string;
  points: [number, number][];
}

export interface GeometryProbe {
  id: string;
  x: number;
  y: number;
  scopeDx?: number;
  scopeDy?: number;
  label?: string;
  color: string;
}

export interface GeometryPage {
  id: string;
  name: string;
  description?: string;
  components: GeometryComponent[];
  wires: GeometryWire[];
  probes: GeometryProbe[];
}

export interface GeometryDoc {
  pages: GeometryPage[];
  activePageId: string;
  directives: string;
  analysis: AnalysisSpec;
  simSettings?: SimSettings;
}
