import type {
  AnalysisSpec,
  CircuitComponent,
  CircuitDoc,
  CircuitNode,
  Probe,
  SchematicPage,
  SimSettings,
  Wire,
} from "./model.ts";
import type { GeometryDoc, GeometryWire } from "./geometryModel.ts";
import { GRAPH_DOC_VERSION, makeId } from "./model.ts";
import { geometryDocToGraph } from "./graphConvert.ts";

// normalizeDoc is WIRE-SHAPE-AGNOSTIC: it only ensures the pages structure
// (migrating pre-hierarchy single-page docs) and copies `wires`/`nodes` through
// untouched. That makes it valid for BOTH the legacy v1 polyline shape and the
// Model-C graph shape, so the input page/wire types are intentionally loose.
type AnyWire = Wire | GeometryWire;
interface AnyPage {
  id?: string;
  name?: string;
  description?: string;
  components?: CircuitComponent[];
  nodes?: CircuitNode[];
  wires?: AnyWire[];
  probes?: Probe[];
}
interface AnyDoc {
  version?: number;
  components?: CircuitComponent[];
  nodes?: CircuitNode[];
  wires?: AnyWire[];
  probes?: Probe[];
  pages?: AnyPage[];
  activePageId?: string;
  directives?: string;
  analysis?: AnalysisSpec;
  simSettings?: SimSettings;
}

/**
 * Ensure the pages structure (and migrate pre-hierarchy single-page docs).
 * Wire-shape-agnostic — see note above. Returns a graph-typed `CircuitDoc`;
 * for v1 input the wires are still polylines until `geometryDocToGraph` runs, so
 * callers that need a true graph doc go through `migrateToGraphDoc`.
 */
export function normalizeDoc(d: AnyDoc): CircuitDoc {
  // Migrate legacy single-page docs (pre-hierarchy schema).
  if (!d.pages || !Array.isArray(d.pages) || d.pages.length === 0) {
    const root = {
      id: makeId("page"),
      name: "main",
      description: "",
      components: d.components ?? [],
      ...(d.nodes ? { nodes: d.nodes } : {}),
      wires: d.wires ?? [],
      probes: d.probes ?? [],
    } as SchematicPage;
    return {
      ...(d.version !== undefined ? { version: d.version } : {}),
      pages: [root],
      activePageId: root.id,
      directives: d.directives ?? "",
      analysis: d.analysis ?? { kind: "op" },
      simSettings: d.simSettings,
    };
  }
  const pages = d.pages.map(
    (p) =>
      ({
        id: p.id || makeId("page"),
        name: p.name || "main",
        description: p.description ?? "",
        components: p.components ?? [],
        ...(p.nodes ? { nodes: p.nodes } : {}),
        wires: p.wires ?? [],
        probes: p.probes ?? [],
      }) as SchematicPage,
  );
  return {
    ...(d.version !== undefined ? { version: d.version } : {}),
    pages,
    activePageId:
      d.activePageId && pages.some((p) => p.id === d.activePageId)
        ? d.activePageId
        : pages[0].id,
    directives: d.directives ?? "",
    analysis: d.analysis ?? { kind: "op" },
    simSettings: d.simSettings,
  };
}

/** True when `raw` already encodes a Model-C graph doc (vs. a legacy v1 doc). */
function looksLikeGraphDoc(raw: AnyDoc): boolean {
  // 1. Explicit version tag is authoritative.
  if (typeof raw.version === "number") return raw.version >= GRAPH_DOC_VERSION;
  // 2. No version: inspect structure. A graph doc's wires are node edges
  //    ({a,b,bends}); a legacy wire is a polyline ({points}). Also, only graph
  //    docs carry pin-node ids on components and standalone `nodes` on a page.
  const pages: AnyPage[] = Array.isArray(raw.pages)
    ? raw.pages
    : [{ wires: raw.wires, components: raw.components, nodes: raw.nodes }];
  for (const page of pages) {
    for (const w of page.wires ?? []) {
      // A wire that has edge endpoints (and no polyline) is graph-shaped.
      if ((w as Wire).a !== undefined || (w as Wire).b !== undefined) return true;
      if ((w as GeometryWire).points !== undefined) return false;
    }
    if ((page.nodes?.length ?? 0) > 0) return true;
    for (const c of page.components ?? []) {
      if ((c.pins?.length ?? 0) > 0) return true;
    }
  }
  // 3. Truly ambiguous (no wires, no nodes, no pin ids, no version): an empty
  //    doc. geometryDocToGraph on a doc with no wires only materializes pin-nodes
  //    for components (none here) and is a no-op on connectivity, so treating
  //    it as legacy is safe and yields an equivalent empty graph doc.
  return false;
}

/**
 * Single migration entry for loading a persisted doc. Returns a Model-C GRAPH
 * doc regardless of whether `raw` was stored as v1 (legacy polylines) or v2
 * (graph edges).
 *
 * Why it cannot lose data:
 *  - v2 docs are passed straight through `normalizeDoc` (wire-agnostic), which
 *    copies wires/nodes/pins verbatim — no conversion, nothing dropped.
 *  - v1 docs go through `geometryDocToGraph(normalizeDoc(...))`, the trusted,
 *    connectivity-lossless converter already covered by graphRoundTrip tests.
 *  - The v1/v2 discriminator prefers the explicit `version` tag and otherwise
 *    keys off structural markers that are mutually exclusive between the two
 *    shapes (polyline `points` vs. edge `a`/`b`, plus graph-only `nodes`/pin
 *    ids), so a v2 doc is never fed to the legacy converter (which would
 *    regenerate pins and drop standalone nodes) and vice-versa.
 */
export function migrateToGraphDoc(raw: unknown): CircuitDoc {
  const doc = (raw && typeof raw === "object" ? raw : {}) as AnyDoc;
  if (looksLikeGraphDoc(doc)) {
    // Already a graph doc: just guarantee the pages structure.
    return normalizeDoc(doc);
  }
  // Legacy v1: normalize the pages structure, then convert to the graph model.
  return geometryDocToGraph(normalizeDoc(doc) as unknown as GeometryDoc);
}
