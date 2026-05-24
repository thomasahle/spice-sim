import type {
  AnalysisSpec,
  CircuitComponent,
  CircuitDoc,
  Probe,
  SchematicPage,
  SimSettings,
  Wire,
} from "./model.ts";
import { makeId } from "./model.ts";

export function normalizeDoc(
  d: Partial<CircuitDoc> & {
    components?: CircuitComponent[];
    wires?: Wire[];
    probes?: Probe[];
    pages?: SchematicPage[];
    activePageId?: string;
    directives?: string;
    analysis?: AnalysisSpec;
    simSettings?: SimSettings;
  },
): CircuitDoc {
  // Migrate legacy single-page docs (pre-hierarchy schema).
  if (!d.pages || !Array.isArray(d.pages) || d.pages.length === 0) {
    const root: SchematicPage = {
      id: makeId("page"),
      name: "main",
      description: "",
      components: d.components ?? [],
      wires: d.wires ?? [],
      probes: d.probes ?? [],
    };
    return {
      pages: [root],
      activePageId: root.id,
      directives: d.directives ?? "",
      analysis: d.analysis ?? { kind: "op" },
      simSettings: d.simSettings,
    };
  }
  const pages = d.pages.map((p) => ({
    id: p.id || makeId("page"),
    name: p.name || "main",
    description: p.description ?? "",
    components: p.components ?? [],
    wires: p.wires ?? [],
    probes: p.probes ?? [],
  }));
  return {
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
