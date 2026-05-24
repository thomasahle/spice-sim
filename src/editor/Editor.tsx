import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import type {
  CircuitDoc,
  CircuitComponent,
  AnalysisSpec,
  ComponentKind,
  Probe,
  SchematicPage,
  Wire,
} from "./model";
import {
  COMPONENT_LABELS,
  currentPage,
  defaultValue,
  emptyDoc,
  getPinLayout,
  makeId,
  makePage,
  pinLabelForKind,
  pinWorldPos,
  rotateNext,
  updateCurrentPage,
} from "./model";
import { ComponentGlyph, PaletteGlyph } from "./symbols";
import { canvasValueLabel } from "./labelFormatting";
import {
  netLabelLayout,
  netLabelLayouts,
  valueLabelBounds,
  valueLabelOffsets,
} from "./labelPlacement";
import { draftMeasurement, dragDeltaMeasurement } from "./draftMeasurement";
import {
  boundsFromPoints,
  componentBoundsFor,
  componentVisualBoundsFor,
  normalizeCoord,
  normalizePoint,
  normalizeTuple,
  pointOnPolylineBody,
  pointOnSegment,
  rectsIntersect,
  samePoint,
  sameTuple,
  wireIntersectsRect,
} from "./geometry";
import { buildNetlist, coordKey, type FloatingPinDiagnostic } from "./netlist";
import { isAcStimulus, sourceValueWithAcStimulus } from "./sourceValues";
import { isIndependentSourceKind, isSimulationStimulusKind } from "./sourceKinds";
import { simulate, engineProbe } from "../sim/api";
import type { SimResult } from "../sim/api";
import { analysisToApi, analysisWithSweepSource, validateAnalysisSpec } from "./analysisValidation";
import { AnalysisDialog } from "./AnalysisDialog";
import { DirectivesPanel } from "./DirectivesPanel";
import { SourceEditor } from "./SourceEditor";
import { SimSettingsPanel } from "./SimSettingsPanel";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { ComponentHelp } from "./ComponentHelp";
import {
  loadProject,
  loadWorkspace,
  newProjectId,
  saveProject,
  saveWorkspace,
  setStorageFailureHandler,
  deleteProject,
  type Workspace,
} from "./projects";
import { WaveformViewer } from "./WaveformViewer";
import { traceAliasKey, traceDisplayName } from "./traceNames";
import { PlayBar } from "./PlayBar";
import { MiniScope } from "./MiniScope";
import { formatMeasurementAxisValue } from "./measurementFormatting";
import {
  formatMeasurementResultValue,
  measurementDirectivesFromText,
} from "./measurementUnits";
import { layoutProbeScopes } from "./scopeLayout";
import { DEMOS } from "./demos";
import { exportCsv, exportNetlist, exportSvg, onMenuEvent, openDoc, saveDoc } from "../sim/files";
import { applyWheelPan } from "./panMath";
import { deletionStatus, selectionSummary } from "./editorStatus";
import { sharedDocFromHash, shareUrlForDoc } from "./shareUrl";
import { schematicSvgFromCanvas } from "./svgExport";
import { sweepRunLabelsFromDirectives } from "./sweepRunLabels";
import { findNamedTrace, findNodeTrace, latestNodeVoltages, traceNodeName } from "./simVectorLookup";
import { inlineProbeScopeLabel, probeHasDisplayLabel, shouldRenderInlineProbeScope } from "./probeDisplay";
import { formatSimulationErrorLog, summarizeSimulationError } from "./simulationErrors";
import { defaultVisibleTraceNames } from "./traceVisibility";
import { analysisXAxisLabel, axisUnitFromLabel } from "./waveformAxis";
import {
  decodeSchematicClipboard,
  encodeSchematicClipboard,
  type SchematicClipboard,
} from "./schematicClipboard";
import {
  makeHistorySnapshot,
  popLatestHistorySnapshot,
  pushBoundedHistory,
  selectedIdsFromSnapshot,
  type HistorySnapshot,
} from "./editorHistory";
import {
  componentFromClick,
  componentFromTerminals,
  movePointWithAnchoredWire,
  moveAttachedWirePoints,
  moveProbesFromInsertedWireSpan,
  moveWirePointsWithAnchors,
  placementConnectionWires,
  placementLength,
  placementWireCutSpan,
  removeLastWireDraftPoint,
  reshapeDraggedWirePoint,
  rotatedContactRoutes,
  routeWireSegment,
  translatedContactRoutes,
  wireMovesAsRigidShape,
  type WireEndpointAnchors,
} from "./placement";
import {
  moveProbesWithPinMoves,
  moveUnmovedProbesWithChangedWirePaths,
  moveWirePointsToTargets,
  probeShouldMoveWithSelectedPin,
  wireConnectsMovedPins,
  wireEndpointMoveTargets,
} from "./wireMotion";
import { pruneUnanchoredWireJunctions, pruneWiresAfterComponentDelete } from "./topologyCleanup";
import {
  nearestConnectionTarget,
  selectableItemAt,
  type ConnectionSnapOptions,
  type ConnectionTarget,
  wireVertexDragHitAt,
} from "./canvasHitTest";
import {
  fitBoundsToViewport,
  screenToWorldPoint,
  snapWorldPoint,
  zoomAtViewportPoint,
} from "./canvasViewport";
import {
  CANVAS_DRAG_START_THRESHOLD,
  canvasDragDelta,
  canvasDragDeltaAfterThreshold,
  hasActiveCanvasInteraction,
  movedBeyondThreshold,
  pinTargetTone,
  pointerSelectionHit,
  selectPointerIntent,
  selectionClickStartsDrag,
  shouldSuppressOriginalConnectionSnap,
} from "./canvasInteraction";
import {
  cutWireSegmentBetweenPoints,
  insertWireEndpointJunctions,
  normalizeWireListPreservingJunctions,
  wirePathCoveredByWires,
} from "./wireTopology";

type Tool = "select" | "pan" | "wire" | "probe" | ComponentKind;
type WireGestureMode = "wire-tool" | "quick-wire";

const CELL = 20;
const SCOPE_OFFSET_X = 0.9;
const SCOPE_OFFSET_Y = -3.05;
const SCOPE_WIDTH = 4.6;
const SCOPE_HEIGHT = 1.75;
const SCOPE_LAYOUT = {
  defaultDx: SCOPE_OFFSET_X,
  defaultDy: SCOPE_OFFSET_Y,
  width: SCOPE_WIDTH,
  height: SCOPE_HEIGHT,
};
const WIRING_SNAP: ConnectionSnapOptions = {
  includeSegments: true,
  pinRadius: 1.35,
  wirePointRadius: 0.95,
  segmentRadius: 0.7,
};
const QUICK_WIRE_START_SNAP: ConnectionSnapOptions = {
  includeSegments: false,
  pinRadius: 0.36,
  wirePointRadius: 0.36,
};

const PROBE_COLORS = [
  "#0a84ff",
  "#ff9f0a",
  "#30d158",
  "#bf5af2",
  "#ff453a",
  "#64d2ff",
  "#ffd60a",
  "#ff375f",
];

interface PaletteItem {
  tool: Tool;
  kind?: ComponentKind;
  name: string;
  hint?: string;
  /** One-sentence beginner-friendly description shown in the hover card. */
  desc?: string;
}

const PALETTE_SECTIONS: { label: string; items: PaletteItem[] }[] = [
  {
    label: "Tools",
    items: [
      {
        tool: "select",
        name: "Select",
        hint: "S",
        desc: "Click to select, drag to move. Shift-click to add to selection. Rubber-band to multi-select.",
      },
      {
        tool: "pan",
        name: "Pan",
        hint: "H",
        desc: "Drag the canvas to move around the schematic.",
      },
      {
        tool: "wire",
        name: "Wire",
        hint: "W",
        desc: "Click two points to draw a connecting wire. Wires snap to pins and other wires.",
      },
      {
        tool: "probe",
        name: "Probe",
        hint: "P",
        desc: "Click a wire or pin to add an oscilloscope probe. Probed nodes appear in the waveform pane.",
      },
    ],
  },
  {
    label: "Passive",
    items: [
      {
        tool: "R",
        kind: "R",
        name: "Resistor",
        hint: "R",
        desc: "Limits current and drops voltage. Drag to place. Value in ohms (e.g. 1k = 1kΩ, 4.7M = 4.7 MΩ).",
      },
      {
        tool: "C",
        kind: "C",
        name: "Capacitor",
        hint: "C",
        desc: "Stores charge; blocks DC, passes AC. Drag to place. Value in farads (e.g. 100n, 1u, 10p).",
      },
      {
        tool: "L",
        kind: "L",
        name: "Inductor",
        hint: "L",
        desc: "Stores energy in a magnetic field; passes DC, resists AC. Drag to place. Value in henries (e.g. 10m, 1u).",
      },
      {
        tool: "D",
        kind: "D",
        name: "Diode",
        hint: "D",
        desc: "Conducts current in one direction only. Drag from anode to cathode. ~0.7V forward drop (silicon).",
      },
    ],
  },
  {
    label: "Sources",
    items: [
      {
        tool: "V",
        kind: "V",
        name: "Voltage source",
        hint: "V",
        desc: "Independent voltage source. Drag to place; configure DC, sine, pulse, PWL etc. in the Inspector.",
      },
      {
        tool: "I",
        kind: "I",
        name: "Current source",
        hint: "I",
        desc: "Independent current source. Drag to place; same waveform options as the voltage source.",
      },
      {
        tool: "B",
        kind: "B",
        name: "Behavioral source",
        hint: "B",
        desc: "Programmable voltage/current source. Drag to place; enter V= or I= expressions using time and node voltages.",
      },
      {
        tool: "GND",
        kind: "GND",
        name: "Ground",
        hint: "G",
        desc: "Reference node (0 V). Every circuit needs at least one ground for the simulator to converge.",
      },
    ],
  },
  {
    label: "Active",
    items: [
      {
        tool: "NPN",
        kind: "NPN",
        name: "NPN BJT",
        hint: "Q",
        desc: "Click to place. Pins stay visible on selection and snap strongly while wiring.",
      },
      { tool: "PNP", kind: "PNP", name: "PNP BJT" },
      {
        tool: "NMOS",
        kind: "NMOS",
        name: "NMOS",
        hint: "M",
        desc: "Click to place. Pins stay visible on selection and snap strongly while wiring.",
      },
      { tool: "PMOS", kind: "PMOS", name: "PMOS" },
      {
        tool: "OPAMP",
        kind: "OPAMP",
        name: "Op-amp",
        hint: "O",
        desc: "Click to place; wire the +, −, and OUT pins. Pins stay visible on selection and snap strongly while wiring.",
      },
    ],
  },
  {
    label: "Labels",
    items: [
      {
        tool: "LABEL",
        kind: "LABEL",
        name: "Net label",
        hint: "N",
        desc: "Names a wire so it's easy to probe. Two labels with the same name are electrically connected.",
      },
    ],
  },
];

// Default to the RC step demo so the scope is alive on first launch
// (transient with an exponential charge curve), instead of the divider OP
// which only renders a flat-line 5V scope.
const DEMO: CircuitDoc = (DEMOS.find((d) => d.id === "rc_step") ?? DEMOS[0]).build();

// Web build has no native window chrome, so the global title bar is dropped
// and the pane toggles are rendered inline at the toolbar ends instead.
const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Match the responsive breakpoint in styles.css: phones (portrait + landscape)
// and short tablets get the overlay-drawer layout instead of the three-column
// grid.
function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth < 900 ||
    (window.innerHeight <= 540 && window.innerWidth <= 1024)
  );
}

export function Editor() {
  // Workspace: tracks multiple projects, each holding its own CircuitDoc in
  // localStorage. Loaded lazily on first render; if empty, we bootstrap with
  // a "Default" project initialised from the demo.
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const shared = currentSharedDoc();
    if (shared) {
      const id = newProjectId();
      const name = "Shared circuit";
      const fresh: Workspace = { active: id, projects: [{ id, name }] };
      saveWorkspace(fresh);
      saveProject(id, shared);
      return fresh;
    }
    const w = loadWorkspace();
    if (w.projects.length > 0) return w;
    // First-run / reset: bootstrap with an EMPTY project. The canvas's
    // welcome-card lets the user pick a starter demo if they want one.
    // (Older bootstrap loaded the inverting amplifier DEMO automatically,
    // which made "Reset workspace" feel broken — it wasn't actually empty.)
    const id = newProjectId();
    const fresh: Workspace = { active: id, projects: [{ id, name: "Untitled" }] };
    saveWorkspace(fresh);
    saveProject(id, emptyDoc);
    return fresh;
  });
  const [doc, setDoc] = useState<CircuitDoc>(() => {
    const w = loadWorkspace();
    if (w.active) {
      const loaded = loadProject(w.active);
      if (loaded) return normalizeDoc(loaded);
    }
    return emptyDoc;
  });
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wireDraft, setWireDraft] = useState<[number, number][] | null>(null);
  const [wireGesture, setWireGesture] = useState<null | {
    start: [number, number];
    moved: boolean;
    mode: WireGestureMode;
    fallbackSelectionId?: string;
  }>(null);
  const wireDraftRef = useRef<[number, number][] | null>(null);
  const wireGestureRef = useRef<null | {
    start: [number, number];
    moved: boolean;
    mode: WireGestureMode;
    fallbackSelectionId?: string;
  }>(null);
  const [placementDraft, setPlacementDraft] = useState<null | {
    kind: ComponentKind;
    start: { x: number; y: number };
    end: { x: number; y: number };
  }>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 600, y: 360 });
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const [readings, setReadings] = useState<Map<string, number> | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [log, setLog] = useState<string>("");
  const [runWarnings, setRunWarnings] = useState<string[]>([]);
  const [runFloatingPins, setRunFloatingPins] = useState<FloatingPinDiagnostic[]>([]);
  const [engineName, setEngineName] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState<null | {
    initial: Map<string, { x: number; y: number }>;
    initialWires: Map<string, [number, number][]>;
    movingWireIds: Set<string>;
    movingWireAnchors: Map<string, WireEndpointAnchors>;
    movingWireProbeAttachments: Map<string, { wireId: string; point: { x: number; y: number } }>;
    attachedWirePoints: Map<string, Set<number>>;
    directContactPins: DirectContactPin[];
    previewWireIds: string[];
    startGrid: { x: number; y: number };
    startWorld: { x: number; y: number };
    delta: { x: number; y: number };
    committed: boolean;
  }>(null);
  const [wireDrag, setWireDrag] = useState<null | {
    wireId: string;
    pointIdx: number;
    startWorld: { x: number; y: number };
    initialPoints: [number, number][];
    initialProbes: Map<string, { x: number; y: number }>;
    committed: boolean;
  }>(null);
  const [scopeDrag, setScopeDrag] = useState<null | {
    probeId: string;
    startGrid: { x: number; y: number };
    startWorld: { x: number; y: number };
    delta: { x: number; y: number };
    initialDx: number;
    initialDy: number;
    committed: boolean;
  }>(null);
  const [marquee, setMarquee] = useState<null | {
    sx: number;
    sy: number;
    ex: number;
    ey: number;
    additive: boolean;
  }>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ x: number; y: number } | null>(null);
  const [canvasNotice, setCanvasNotice] = useState<string | null>(null);
  const canvasNoticeTimerRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<null | {
    x: number;
    y: number;
    items: ContextMenuEntry[];
  }>(null);
  const [clipboard, setClipboard] = useState<SchematicClipboard | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [waveformVisible, setWaveformVisible] = useState(true);
  const [waveformRunKey, setWaveformRunKey] = useState(0);
  const [selectedTraces, setSelectedTraces] = useState<Set<string>>(new Set());
  const [filePath, setFilePath] = useState<string | null>(null);
  // True when the in-memory doc has diverged from the disk file last
  // opened/saved. Only matters when filePath is set — if there's no on-disk
  // file the workspace localStorage handles persistence on its own.
  const [diskDirty, setDiskDirty] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [liveFlow, setLiveFlow] = useState(() => {
    try {
      return localStorage.getItem("spicesim.liveFlow") !== "0";
    } catch {
      return true;
    }
  });
  const [autoRun, setAutoRun] = useState(() => {
    try {
      return localStorage.getItem("spicesim.autoRun") !== "0";
    } catch {
      return true;
    }
  });
  const [snapToGrid, setSnapToGrid] = useState(() => {
    try {
      return localStorage.getItem("spicesim.snapToGrid") !== "0";
    } catch {
      return true;
    }
  });
  const [gridVisible, setGridVisible] = useState(() => {
    try {
      return localStorage.getItem("spicesim.gridVisible") !== "0";
    } catch {
      return true;
    }
  });
  const [naturalPan, setNaturalPan] = useState(() => {
    try {
      return localStorage.getItem("spicesim.naturalPan") !== "0";
    } catch {
      return true;
    }
  });
  const [netlistOpen, setNetlistOpen] = useState(false);
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [bjtVariant, setBjtVariant] = useState<"NPN" | "PNP">("NPN");
  const [mosVariant, setMosVariant] = useState<"NMOS" | "PMOS">("NMOS");
  const [pagesCollapsed, setPagesCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("spicesim.pagesCollapsed");
      if (stored != null) return stored === "1";
      // Default to collapsed on narrow viewports so the canvas is visible
      // when a first-time visitor opens the site on a phone.
      return isNarrowViewport();
    } catch {
      return false;
    }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("spicesim.inspectorCollapsed");
      if (stored != null) return stored === "1";
      return isNarrowViewport();
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.pagesCollapsed", pagesCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("spicesim:sidebar-state", {
        detail: { collapsed: pagesCollapsed },
      }),
    );
  }, [pagesCollapsed]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "spicesim.inspectorCollapsed",
        inspectorCollapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("spicesim:inspector-state", {
        detail: { collapsed: inspectorCollapsed },
      }),
    );
  }, [inspectorCollapsed]);
  // Toggle buttons in the titlebar (App.tsx) dispatch these events; we own
  // the state here so we don't need to lift it up.
  useEffect(() => {
    const sidebar = () => setPagesCollapsed((c) => !c);
    const inspector = () => setInspectorCollapsed((c) => !c);
    window.addEventListener("spicesim:toggle-sidebar", sidebar);
    window.addEventListener("spicesim:toggle-inspector", inspector);
    return () => {
      window.removeEventListener("spicesim:toggle-sidebar", sidebar);
      window.removeEventListener("spicesim:toggle-inspector", inspector);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.snapToGrid", snapToGrid ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [snapToGrid]);
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.gridVisible", gridVisible ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [gridVisible]);
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.naturalPan", naturalPan ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [naturalPan]);
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.autoRun", autoRun ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [autoRun]);
  useEffect(() => {
    try {
      localStorage.setItem("spicesim.liveFlow", liveFlow ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [liveFlow]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const spacePanRef = useRef(false);
  // Derive the active page once per render so most editor code can treat
  // `page.components` etc as the source of truth.
  const page = currentPage(doc);
  // Always-current refs to dodge stale closures inside global listeners.
  const docRef = useRef(doc);
  docRef.current = doc;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const handledShareHashRef = useRef(
    typeof window === "undefined" ? "" : window.location.hash,
  );
  // Persist the active project's doc on every change, debounced lightly.
  useEffect(() => {
    if (!workspace.active) return;
    const id = workspace.active;
    const t = window.setTimeout(() => saveProject(id, doc), 200);
    return () => window.clearTimeout(t);
  }, [doc, workspace.active]);
  // Persist workspace itself when project list changes.
  useEffect(() => {
    saveWorkspace(workspace);
  }, [workspace]);
  // Last-resort flush so the most recent edit always makes it to localStorage
  // even when the user closes the window within the 200ms debounce window.
  // beforeunload fires synchronously, so we just call saveProject directly.
  useEffect(() => {
    const flush = () => {
      if (workspaceRef.current.active) {
        try {
          saveProject(workspaceRef.current.active, docRef.current);
          saveWorkspace(workspaceRef.current);
        } catch {
          /* ignore — best effort on unload */
        }
      }
    };
    window.addEventListener("beforeunload", flush);
    // visibilitychange catches Tauri hide / OS suspend (no beforeunload fires
    // when the webview is suspended without a real navigation).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    return () => {
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // Reflect the active project name in the window title.
  useEffect(() => {
    const active = workspace.projects.find((p) => p.id === workspace.active);
    const name = active?.name ?? "Untitled";
    document.title = `${name} — Spice Sim`;
    window.dispatchEvent(new CustomEvent("spicesim:title", { detail: name }));
  }, [workspace]);

  function switchProject(id: string) {
    if (id === workspace.active) return;
    // Flush current doc first so we don't lose pending changes.
    if (workspace.active) saveProject(workspace.active, docRef.current);
    const loaded = loadProject(id);
    const next = loaded ? normalizeDoc(loaded) : emptyDoc;
    setDoc(next);
    setPast([]);
    setFuture([]);
    resetInteractionState();
    clearSimulationState();
    // Empty projects shouldn't pop the (empty) waveform pane open.
    setWaveformVisible(next.pages[0].components.length > 0);
    setStatus("Idle");
    setWorkspace({ ...workspace, active: id });
    window.setTimeout(() => {
      if (next.pages[0].components.length > 0) fitToContent();
      else resetCanvasView();
    }, 0);
  }

  function createProject() {
    const baseName = "Project";
    let n = workspace.projects.length + 1;
    let name = `${baseName} ${n}`;
    while (workspace.projects.some((p) => p.name === name)) {
      n += 1;
      name = `${baseName} ${n}`;
    }
    const id = newProjectId();
    if (workspace.active) saveProject(workspace.active, docRef.current);
    saveProject(id, emptyDoc);
    setDoc(emptyDoc);
    setPast([]);
    setFuture([]);
    resetInteractionState();
    clearSimulationState();
    // New project is empty — no point showing the waveform pane yet.
    setWaveformVisible(false);
    setStatus(`Created project: ${name}`);
    setWorkspace({
      active: id,
      projects: [...workspace.projects, { id, name }],
    });
    window.setTimeout(resetCanvasView, 0);
  }

  function createSubcircuitPage() {
    let n = doc.pages.length;
    let name = `sub${n}`;
    while (doc.pages.some((p) => p.name === name)) {
      n += 1;
      name = `sub${n}`;
    }
    const newPage = makePage(name);
    commit((d) => ({
      ...d,
      pages: [...d.pages, newPage],
      activePageId: newPage.id,
    }));
    setSelectedIds(new Set());
    setStatus(`Created subcircuit: ${name}`);
  }

  function resetInteractionState() {
    selectTool("select");
    setSelectedIds(new Set());
    setCursor(null);
  }

  function selectTool(nextTool: Tool) {
    if (nextTool === "NPN" || nextTool === "PNP") setBjtVariant(nextTool);
    if (nextTool === "NMOS" || nextTool === "PMOS") setMosVariant(nextTool);
    setTool(nextTool);
    updateWireDraft(null);
    updateWireGesture(null);
    setPlacementDraft(null);
    setWireDrag(null);
    setDrag(null);
    setMarquee(null);
    setPanning(null);
    setHoverId(null);
    setSnapTarget(null);
    setContextMenu(null);
    clearCanvasNotice();
  }

  function showCanvasNotice(message: string, durationMs = 2200) {
    if (canvasNoticeTimerRef.current !== null) {
      window.clearTimeout(canvasNoticeTimerRef.current);
      canvasNoticeTimerRef.current = null;
    }
    setCanvasNotice(message);
    canvasNoticeTimerRef.current = window.setTimeout(() => {
      canvasNoticeTimerRef.current = null;
      setCanvasNotice(null);
    }, durationMs);
  }

  function clearCanvasNotice() {
    if (canvasNoticeTimerRef.current !== null) {
      window.clearTimeout(canvasNoticeTimerRef.current);
      canvasNoticeTimerRef.current = null;
    }
    setCanvasNotice(null);
  }

  function updateWireDraft(next: [number, number][] | null) {
    wireDraftRef.current = next;
    setWireDraft(next);
  }

  function updateWireGesture(next: null | {
    start: [number, number];
    moved: boolean;
    mode: WireGestureMode;
    fallbackSelectionId?: string;
  }) {
    wireGestureRef.current = next;
    setWireGesture(next);
  }

  function stepBackWireDraft(): boolean {
    const activeDraft = wireDraftRef.current;
    if (!activeDraft) return false;
    const next = removeLastWireDraftPoint(activeDraft);
    const activeGesture = wireGestureRef.current;
    updateWireDraft(next);
    updateWireGesture(
      next
        ? {
            start: next[next.length - 1],
            moved: false,
            mode: activeGesture?.mode ?? "wire-tool",
            fallbackSelectionId: activeGesture?.fallbackSelectionId,
          }
        : null,
    );
    setSnapTarget(null);
    setStatus(next ? "Removed last wire point" : "Wire canceled");
    return true;
  }

  function clearSimulationState() {
    editGenerationRef.current += 1;
    setReadings(null);
    setSimResult(null);
    setSelectedTraces(new Set());
    setLog("");
    setRunWarnings([]);
    setRunFloatingPins([]);
    setPlaying(false);
  }

  function invalidateSimulationState() {
    editGenerationRef.current += 1;
    const hadResult = Boolean(simResultRef.current || readingsRef.current);
    const wasRunning = runningRef.current;
    setReadings(null);
    setSimResult(null);
    setSelectedTraces(new Set());
    setRunWarnings([]);
    setRunFloatingPins([]);
    setPlaying(false);
    if (wasRunning) setRunning(false);
    if (hadResult || wasRunning) {
      setLog("");
      setStatus("Modified — rerun simulation");
    }
  }

  function clearStaleRunOutput() {
    editGenerationRef.current += 1;
    latestRunIdRef.current += 1;
    setReadings(null);
    setSimResult(null);
    setSelectedTraces(new Set());
    setPlaying(false);
    setRunning(false);
    setWaveformVisible(false);
  }

  function resetCanvasView() {
    const rect = svgRef.current?.getBoundingClientRect();
    setZoom(1);
    setPan({
      x: rect ? rect.width / 2 : 600,
      y: rect ? rect.height / 2 : 360,
    });
  }

  function zoomViewport(factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    const oldZoom = zoomRef.current;
    const newZoom = Math.max(0.3, Math.min(4, oldZoom * factor));
    if (newZoom === oldZoom) return;
    const oldPan = panRef.current;
    const cx = rect ? rect.width / 2 : 600;
    const cy = rect ? rect.height / 2 : 360;
    setPan({
      x: cx - (cx - oldPan.x) * (newZoom / oldZoom),
      y: cy - (cy - oldPan.y) * (newZoom / oldZoom),
    });
    setZoom(newZoom);
  }

  function renameProject(id: string, name: string) {
    const cleaned = name.trim() || "Untitled";
    setWorkspace({
      ...workspace,
      projects: workspace.projects.map((p) =>
        p.id === id ? { ...p, name: cleaned } : p,
      ),
    });
  }

  function removeProject(id: string) {
    if (workspace.projects.length <= 1) {
      setStatus("Can't delete the only project");
      return;
    }
    const target = workspace.projects.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`Delete project "${target.name}"? This can't be undone.`)) return;
    deleteProject(id);
    const remaining = workspace.projects.filter((p) => p.id !== id);
    const nextActive = workspace.active === id ? remaining[0].id : workspace.active;
    setWorkspace({ active: nextActive, projects: remaining });
    if (workspace.active === id) {
      const loaded = loadProject(nextActive);
      setDoc(loaded ? normalizeDoc(loaded) : DEMO);
      setPast([]);
      setFuture([]);
      setSelectedIds(new Set());
    }
  }
  const selRef = useRef(selectedIds);
  selRef.current = selectedIds;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;
  const dragRef = useRef<typeof drag>(drag);
  dragRef.current = drag;
  const wireDragRef = useRef<typeof wireDrag>(wireDrag);
  wireDragRef.current = wireDrag;
  const scopeDragRef = useRef<typeof scopeDrag>(scopeDrag);
  scopeDragRef.current = scopeDrag;
  const placementDraftRef = useRef<typeof placementDraft>(placementDraft);
  placementDraftRef.current = placementDraft;
  const marqueeRef = useRef<typeof marquee>(marquee);
  marqueeRef.current = marquee;
  const panningRef = useRef<typeof panning>(panning);
  panningRef.current = panning;
  const simResultRef = useRef(simResult);
  simResultRef.current = simResult;
  const readingsRef = useRef(readings);
  readingsRef.current = readings;
  const runningRef = useRef(running);
  runningRef.current = running;
  const engineOkRef = useRef(engineOk);
  engineOkRef.current = engineOk;

  const probeEngine = useCallback((showProbing = false) => {
    if (showProbing) setEngineName("probing…");
    return engineProbe()
      .then((info) => {
        setEngineName(`${info.name} · ${cleanEngineVersion(info.version)}`);
        setEngineOk(true);
        return true;
      })
      .catch((e) => {
        const raw = e instanceof Error ? e.message : String(e);
        const msg = raw.replace(/^Error:\s*/i, "").slice(0, 100);
        setEngineName(`unavailable — ${msg}`);
        setEngineOk(false);
        return false;
      });
  }, []);
  const snapToGridRef = useRef(snapToGrid);
  snapToGridRef.current = snapToGrid;
  const editGenerationRef = useRef(0);
  const latestRunIdRef = useRef(0);

  // Undo history is bounded to avoid unbounded memory growth on long
  // editing sessions. 100 steps comfortably exceeds a session's worth of
  // edits while keeping memory in the tens of KB even for large schematics.
  const UNDO_LIMIT = 100;
  function historySnapshot(): HistorySnapshot {
    return makeHistorySnapshot(docRef.current, selRef.current);
  }
  function restoreHistorySnapshot(snapshot: HistorySnapshot) {
    setDoc(snapshot.doc);
    setSelectedIds(selectedIdsFromSnapshot(snapshot));
  }
  function pushPast(snapshot: HistorySnapshot) {
    const cur = pastRef.current;
    setPast(pushBoundedHistory(cur, snapshot, UNDO_LIMIT));
  }
  function commit(updater: (d: CircuitDoc) => CircuitDoc) {
    pushPast(historySnapshot());
    setFuture([]);
    setDoc(updater(docRef.current));
    invalidateSimulationState();
    // Any commit dirties the disk file if one is open. Workspace localStorage
    // is the source of truth in-app, so we never block on it.
    if (filePathRef.current) setDiskDirty(true);
  }
  function confirmDiscardIfDirty(): boolean {
    if (!filePathRef.current || !diskDirtyRef.current) return true;
    return confirm(
      "You have unsaved changes in the file. Discard and continue?",
    );
  }
  function previewMutate(updater: (d: CircuitDoc) => CircuitDoc) {
    setDoc(updater(docRef.current));
    invalidateSimulationState();
  }
  function undo() {
    const p = pastRef.current;
    if (p.length === 0) return;
    const prev = p[p.length - 1];
    setPast(p.slice(0, -1));
    setFuture([historySnapshot(), ...futureRef.current]);
    restoreHistorySnapshot(prev);
    invalidateSimulationState();
  }
  function redo() {
    const f = futureRef.current;
    if (f.length === 0) return;
    const next = f[0];
    setFuture(f.slice(1));
    pushPast(historySnapshot());
    restoreHistorySnapshot(next);
    invalidateSimulationState();
  }

  function cancelActiveCanvasInteraction(): boolean {
    const activeDrag = dragRef.current;
    const activeWireDrag = wireDragRef.current;
    const activeScopeDrag = scopeDragRef.current;
    const hasInteraction = Boolean(
      activeDrag ||
        activeWireDrag ||
        activeScopeDrag ||
        placementDraftRef.current ||
        marqueeRef.current ||
        panningRef.current,
    );
    if (!hasInteraction) return false;

    const hasCommittedPreview = Boolean(
      activeDrag?.committed ||
        activeWireDrag?.committed ||
        activeScopeDrag?.committed,
    );
    if (hasCommittedPreview) {
      const popped = popLatestHistorySnapshot(pastRef.current);
      if (popped.snapshot) {
        setPast(popped.history);
        setFuture([]);
        restoreHistorySnapshot(popped.snapshot);
        invalidateSimulationState();
      }
    }

    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setPlacementDraft(null);
    setMarquee(null);
    setPanning(null);
    setSnapTarget(null);
    setHoverId(null);
    setStatus(hasCommittedPreview ? "Drag canceled" : "Canceled");
    return true;
  }

  // Engine probe on mount.
  useEffect(() => {
    void probeEngine();
  }, [probeEngine]);

  // Browser/dev recovery: if the page loads before Tauri's HTTP bridge, retry
  // quietly so Run becomes available as soon as the bridge appears.
  useEffect(() => {
    if (engineOk !== false) return;
    const id = window.setInterval(() => {
      void probeEngine();
    }, 3000);
    return () => window.clearInterval(id);
  }, [engineOk, probeEngine]);

  // Native menu wiring.
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const diskDirtyRef = useRef(diskDirty);
  diskDirtyRef.current = diskDirty;
  // Surface localStorage quota failures (private browsing / ~5MB limit hit)
  // so the user knows their edits stopped persisting and can act.
  useEffect(() => {
    setStorageFailureHandler((kind) => {
      setStatus(
        `⚠ Storage full — ${kind} not saved. Free space or use File → Save to write to disk.`,
      );
    });
    return () => setStorageFailureHandler(null);
  }, []);
  // Browser prompt before unloading if there are unsaved file changes. In
  // Tauri 2 the OS Cmd-Q close-window confirm dialog is wired through this
  // same beforeunload handler.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (filePathRef.current && diskDirtyRef.current) {
        e.preventDefault();
        e.returnValue = ""; // Required for Chrome to show the prompt.
        return "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  // Import shared URLs even when the app is already open and only the #doc=
  // hash changes. Sharing and remixing should not require a manual reload.
  useEffect(() => {
    const importSharedHash = () => {
      const hash = window.location.hash;
      if (!hash || hash === handledShareHashRef.current) return;
      const shared = currentSharedDoc();
      handledShareHashRef.current = hash;
      if (!shared) return;
      if (sameCircuitDoc(shared, docRef.current)) {
        setStatus("Shared circuit already open");
        return;
      }
      const previousActive = workspaceRef.current.active;
      if (previousActive) saveProject(previousActive, docRef.current);

      const id = newProjectId();
      const name = nextSharedProjectName(workspaceRef.current.projects);
      saveProject(id, shared);
      setDoc(shared);
      setPast([]);
      setFuture([]);
      setFilePath(null);
      setDiskDirty(false);
      resetInteractionState();
      clearSimulationState();
      setWaveformVisible(shared.pages[0]?.components.length > 0);
      setWorkspace({
        active: id,
        projects: [...workspaceRef.current.projects, { id, name }],
      });
      setStatus(`Imported ${name}`);
      window.setTimeout(() => {
        if (shared.pages[0]?.components.length > 0) fitToContent();
        else resetCanvasView();
      }, 0);
    };
    window.addEventListener("hashchange", importSharedHash);
    return () => window.removeEventListener("hashchange", importSharedHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onMenuEvent((id) => handleMenu(id)).then((u) => (unlisten = u));
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMenu(id: string) {
    try {
      await handleMenuImpl(id);
    } catch (e) {
      // Native dialogs throw on cancel / permission errors. Surface in the
      // status bar instead of leaving the rejection unhandled.
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg.slice(0, 140)}`);
      console.error("[Spice Sim] menu action failed", id, e);
    }
  }
  async function handleMenuImpl(id: string) {
    switch (id) {
      case "file:new":
        if (!confirmDiscardIfDirty()) return;
        commit(() => emptyDoc);
        setFilePath(null);
        setDiskDirty(false);
        resetInteractionState();
        clearSimulationState();
        setWaveformVisible(false);
        setStatus("New circuit");
        window.setTimeout(resetCanvasView, 0);
        break;
      case "file:open": {
        if (!confirmDiscardIfDirty()) return;
        const r = await openDoc();
        if (!r) return;
        commit(() => normalizeDoc(r.doc));
        setFilePath(r.path);
        setDiskDirty(false);
        resetInteractionState();
        clearSimulationState();
        setWaveformVisible(false);
        setStatus(`Opened ${r.path}`);
        window.setTimeout(fitToContent, 0);
        break;
      }
      case "file:save": {
        const p = await saveDoc(docRef.current, filePathRef.current);
        if (p) {
          setFilePath(p);
          setDiskDirty(false);
          setStatus(`Saved to ${p}`);
        }
        break;
      }
      case "file:save_as": {
        const p = await saveDoc(docRef.current, null);
        if (p) {
          setFilePath(p);
          setDiskDirty(false);
          setStatus(`Saved to ${p}`);
        }
        break;
      }
      case "file:export_netlist": {
        const r = buildNetlist(docRef.current);
        const p = await exportNetlist(r.netlist);
        if (p) setStatus(`Exported netlist to ${p}`);
        break;
      }
      case "file:export_svg": {
        await exportSchematicSvg();
        break;
      }
      case "file:export_csv": {
        if (!simResult) {
          setStatus("✗ Run a simulation before exporting waveforms");
          return;
        }
        const p = await exportCsv(
          "waveform.csv",
          simResult.vectors.map((v) => ({
            name: v.name,
            displayName: v.is_scale ? v.name : traceDisplayName(v.name, traceAliases, runLabels),
            data: v.data,
            phase: v.phase,
          })),
        );
        if (p) setStatus(`Exported waveform to ${p}`);
        break;
      }
      case "edit:undo":
        undo();
        break;
      case "edit:redo":
        redo();
        break;
      case "sim:run":
        runSimulation();
        break;
      case "sim:configure":
        setAnalysisOpen(true);
        break;
      case "view:zoom_in":
        zoomViewport(1.2);
        break;
      case "view:zoom_out":
        zoomViewport(1 / 1.2);
        break;
      case "view:zoom_reset":
        resetCanvasView();
        break;
      case "view:fit":
        fitToContent();
        break;
      case "view:fit_selection":
        fitSelectionToContent();
        break;
      case "view:toggle_grid":
        setGridVisible((v) => !v);
        break;
      case "view:toggle_snap":
        setSnapToGrid((v) => !v);
        break;
    }
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        spacePanRef.current = true;
        return;
      }
      const k = e.key.toLowerCase();
      const meta = e.metaKey || e.ctrlKey;

      // Undo/redo
      if (meta && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      // Run
      if (meta && k === "r") {
        e.preventDefault();
        runSimulation();
        return;
      }
      // ⌘\ → toggle sidebar; ⇧⌘\ → toggle inspector. Matches the macOS
      // convention used by Finder / Mail / Notes for primary/secondary panes.
      if (meta && (e.key === "\\" || e.code === "Backslash")) {
        e.preventDefault();
        if (e.shiftKey) setInspectorCollapsed((c) => !c);
        else setPagesCollapsed((c) => !c);
        return;
      }
      if (meta && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomViewport(1.2);
        return;
      }
      if (meta && e.key === "-") {
        e.preventDefault();
        zoomViewport(1 / 1.2);
        return;
      }
      if (meta && e.key === "0") {
        e.preventDefault();
        resetCanvasView();
        return;
      }
      if (e.shiftKey && !meta && k === "f") {
        e.preventDefault();
        fitToContent();
        return;
      }
      if (e.shiftKey && !meta && (e.key === "2" || e.code === "Digit2")) {
        e.preventDefault();
        fitSelectionToContent();
        return;
      }
      if (e.shiftKey && !meta && k === "g") {
        e.preventDefault();
        setGridVisible((v) => !v);
        return;
      }
      if (e.shiftKey && !meta && k === "s") {
        e.preventDefault();
        setSnapToGrid((v) => !v);
        return;
      }
      if (e.shiftKey && !meta && k === "p") {
        e.preventDefault();
        setNaturalPan((v) => !v);
        return;
      }
      // ⌘1..9 → switch to that page in the active project.
      if (meta && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const pgs = docRef.current.pages;
        if (idx < pgs.length) {
          e.preventDefault();
          const targetId = pgs[idx].id;
          commit((d) => ({ ...d, activePageId: targetId }));
        }
        return;
      }
      // Select all
      if (meta && k === "a") {
        e.preventDefault();
        const p = currentPage(docRef.current);
        setSelectedIds(
          new Set([
            ...p.components.map((c) => c.id),
            ...p.wires.map((w) => w.id),
            ...p.probes.map((pr) => pr.id),
          ]),
        );
        return;
      }
      // Copy / Paste / Duplicate
      if (meta && k === "c") {
        e.preventDefault();
        void copySelectionToClipboard();
        return;
      }
      if (meta && k === "v") {
        e.preventDefault();
        void pasteAtCursor();
        return;
      }
      if (meta && k === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (!meta && e.key.startsWith("Arrow") && selRef.current.size > 0) {
        e.preventDefault();
        const step = (snapToGridRef.current ? 1 : 0.1) * (e.shiftKey ? 10 : 1);
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx !== 0 || dy !== 0) nudgeSelection(dx, dy);
        return;
      }

      if (k === "escape") {
        e.preventDefault();
        if (wireDraftRef.current) {
          updateWireDraft(null);
          updateWireGesture(null);
          setSnapTarget(null);
          setStatus("Wire canceled");
          return;
        }
        if (cancelActiveCanvasInteraction()) return;
        selectTool("select");
        setSelectedIds(new Set());
        return;
      }
      if ((k === "backspace" || k === "delete") && wireDraftRef.current) {
        e.preventDefault();
        stepBackWireDraft();
        return;
      }
      // Tool shortcuts. V = Voltage source (LTspice convention); S = Select.
      if (k === "s" && !meta) {
        selectTool("select");
        return;
      }
      if (k === "w" && !meta) {
        selectTool("wire");
        return;
      }
      if (k === "p" && !meta) {
        selectTool("probe");
        return;
      }
      if (k === "h" && !meta) {
        selectTool("pan");
        return;
      }
      if (k === "v" && !meta) {
        selectTool("V");
        return;
      }
      if (k === "r" && !meta) {
        if (e.shiftKey && selRef.current.size > 0) {
          rotateSelected(selRef.current);
        } else {
          selectTool("R");
        }
        return;
      }
      if (k === "c" && !meta) {
        selectTool("C");
        return;
      }
      if (k === "l" && !meta) {
        selectTool("L");
        return;
      }
      if (k === "d" && !meta) {
        selectTool("D");
        return;
      }
      if (k === "i" && !meta) {
        selectTool("I");
        return;
      }
      if (k === "g" && !meta) {
        selectTool("GND");
        return;
      }
      if (k === "q" && !meta) {
        selectTool(e.shiftKey ? "PNP" : "NPN");
        return;
      }
      if (k === "m" && !meta) {
        selectTool(e.shiftKey ? "PMOS" : "NMOS");
        return;
      }
      if (k === "o" && !meta) {
        selectTool("OPAMP");
        return;
      }
      if (k === "n" && !meta) {
        selectTool("LABEL");
        return;
      }
      if ((k === "backspace" || k === "delete") && selRef.current.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spacePanRef.current = false;
      }
    };
    const blur = () => {
      spacePanRef.current = false;
    };
    window.addEventListener("keydown", h);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", h);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function screenToGrid(clientX: number, clientY: number): { x: number; y: number } {
    return snapPoint(screenToWorld(clientX, clientY));
  }

  function pointerConnectionPoint(
    clientX: number,
    clientY: number,
    radius = 0.95,
    opts: ConnectionSnapOptions = {},
  ): ConnectionTarget | { x: number; y: number } {
    const raw = screenToWorld(clientX, clientY);
    return nearestConnection(raw.x, raw.y, radius, opts) ?? snapPoint(raw);
  }

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToWorldPoint(clientX, clientY, rect, { pan, zoom, cellPx: CELL });
  }

  function snapPoint(p: { x: number; y: number }): { x: number; y: number } {
    return snapWorldPoint(p, snapToGrid);
  }

  function fitToContent() {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    fitBoundsToView(collectPageBounds(currentPage(docRef.current)), rect);
  }

  function fitSelectionToContent() {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const selected = selRef.current;
    if (selected.size === 0) {
      fitToContent();
      return;
    }
    fitBoundsToView(collectPageBounds(currentPage(docRef.current), selected), rect);
  }

  function fitBoundsToView(bounds: { xs: number[]; ys: number[] }, rect: DOMRect) {
    const next = fitBoundsToViewport(bounds, rect, CELL);
    setZoom(next.zoom);
    setPan(next.pan);
  }

  function capturePointer(e: React.PointerEvent<SVGSVGElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore capture races */
    }
  }

  function releasePointer(e: React.PointerEvent<SVGSVGElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore if capture was already released */
    }
  }

  function nearestConnection(
    gx: number,
    gy: number,
    radius = 0.7,
    opts: ConnectionSnapOptions = {},
  ): ConnectionTarget | null {
    return nearestConnectionTarget(page, gx, gy, radius, { ...opts, snapPoint });
  }

  function hitWireVertex(
    gx: number,
    gy: number,
    radius = 0.45,
    opts: { handleVisible?: boolean } = {},
  ): { wireId: string; idx: number } | null {
    return wireVertexDragHitAt(page, gx, gy, radius, opts);
  }

  function nextSelectionForHit(id: string, additive: boolean): Set<string> {
    if (additive) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }
    return selectedIds.has(id) ? selectedIds : new Set([id]);
  }

  function hitSelectable(
    gx: number,
    gy: number,
    targetWireId: string | null = null,
  ): CircuitComponent | Wire | Probe | null {
    return selectableItemAt(page, gx, gy, targetWireId);
  }

  function scopeProbeIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-probe-scope-id]")?.getAttribute("data-probe-scope-id") ?? null;
  }

  function wireIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-wire-id]")?.getAttribute("data-wire-id") ?? null;
  }

  function componentIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
  }

  function isWireVertexHandleTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(".wire-vertex") !== null;
  }

  function isConnectionHandleTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest("[data-connection-handle='true']") !== null;
  }

  function hitKindForItem(item: CircuitComponent | Wire | Probe | null): "component" | "wire" | "probe" | null {
    if (!item) return null;
    if (page.probes.some((probe) => probe.id === item.id)) return "probe";
    if (page.wires.some((wire) => wire.id === item.id)) return "wire";
    return "component";
  }

  function collectDragWires(
    selected: Set<string>,
    sourcePage: SchematicPage = page,
  ): {
    initialWires: Map<string, [number, number][]>;
    movingWireIds: Set<string>;
    movingWireAnchors: Map<string, WireEndpointAnchors>;
    attachedWirePoints: Map<string, Set<number>>;
  } {
    const movingWireIds = new Set<string>();
    const movingWireAnchors = new Map<string, WireEndpointAnchors>();
    const attachedWirePoints = new Map<string, Set<number>>();
    const initialWires = new Map<string, [number, number][]>();
    const selectedPinPositions: { x: number; y: number }[] = [];

    for (const c of sourcePage.components) {
      if (!selected.has(c.id)) continue;
      for (let i = 0; i < getPinLayout(c).length; i++) {
        selectedPinPositions.push(pinWorldPos(c, i));
      }
    }

    for (const w of sourcePage.wires) {
      if (selected.has(w.id)) {
        movingWireIds.add(w.id);
        movingWireAnchors.set(w.id, wireEndpointAnchors(w, sourcePage, selected));
        initialWires.set(w.id, w.points.map(([x, y]) => [x, y]));
        continue;
      }
      w.points.forEach(([x, y], idx) => {
        const point = { x, y };
        if (
          selectedPinPositions.some((p) => Math.hypot(p.x - x, p.y - y) < 0.08) &&
          !pointOnPolylineBody(point, w.points)
        ) {
          let points = attachedWirePoints.get(w.id);
          if (!points) {
            points = new Set<number>();
            attachedWirePoints.set(w.id, points);
            initialWires.set(w.id, w.points.map(([px, py]) => [px, py]));
          }
          points.add(idx);
        }
      });
    }

    return { initialWires, movingWireIds, movingWireAnchors, attachedWirePoints };
  }

  function collectDragMotion(
    selected: Set<string>,
    sourcePage: SchematicPage = page,
  ): {
    initial: Map<string, { x: number; y: number }>;
    initialWires: Map<string, [number, number][]>;
    movingWireIds: Set<string>;
    movingWireAnchors: Map<string, WireEndpointAnchors>;
    movingWireProbeAttachments: Map<string, { wireId: string; point: { x: number; y: number } }>;
    attachedWirePoints: Map<string, Set<number>>;
    directContactPins: DirectContactPin[];
  } {
    const wireMotion = collectDragWires(selected, sourcePage);
    const directContactPins = collectDirectContactPins(sourcePage.components, sourcePage.wires, selected);
    const movingWireProbeAttachments = collectMovingWireProbeAttachments(
      sourcePage.probes,
      sourcePage.wires,
      wireMotion.movingWireIds,
      selected,
    );
    const initial = new Map<string, { x: number; y: number }>();
    for (const c of sourcePage.components) {
      if (selected.has(c.id)) initial.set(c.id, { x: c.x, y: c.y });
    }

    const selectedPinPositions: { x: number; y: number }[] = [];
    for (const c of sourcePage.components) {
      if (!selected.has(c.id)) continue;
      for (let i = 0; i < getPinLayout(c).length; i++) {
        selectedPinPositions.push(pinWorldPos(c, i));
      }
    }

    for (const pr of sourcePage.probes) {
      const movingWireAttachment = movingWireProbeAttachments.get(pr.id);
      if (
        selected.has(pr.id) ||
        probeShouldMoveWithSelectedPin(
          pr,
          selectedPinPositions,
          sourcePage.components,
          sourcePage.wires,
          selected,
        ) ||
        probeTouchesTranslatedAttachedWire(pr, wireMotion.attachedWirePoints, sourcePage) ||
        (probeTouchesMovingWire(pr, wireMotion.movingWireIds, sourcePage) && !movingWireAttachment)
      ) {
        initial.set(pr.id, { x: pr.x, y: pr.y });
      }
    }

    return { initial, directContactPins, movingWireProbeAttachments, ...wireMotion };
  }

  function probeTouchesMovingWire(
    probe: Probe,
    movingWireIds: Set<string>,
    sourcePage: SchematicPage = page,
  ): boolean {
    for (const w of sourcePage.wires) {
      if (!movingWireIds.has(w.id)) continue;
      for (let i = 0; i < w.points.length - 1; i++) {
        const [x1, y1] = w.points[i];
        const [x2, y2] = w.points[i + 1];
        if (pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) return true;
      }
      if (w.points.some(([x, y]) => samePoint(probe, { x, y }))) return true;
    }
    return false;
  }

  function probeTouchesTranslatedAttachedWire(
    probe: Probe,
    attachedWirePoints: Map<string, Set<number>>,
    sourcePage: SchematicPage = page,
  ): boolean {
    for (const w of sourcePage.wires) {
      const attached = attachedWirePoints.get(w.id);
      if (!attached || !wireMovesAsRigidShape(w.points, attached)) continue;
      for (let i = 0; i < w.points.length - 1; i++) {
        const [x1, y1] = w.points[i];
        const [x2, y2] = w.points[i + 1];
        if (pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) return true;
      }
      if (w.points.some(([x, y]) => samePoint(probe, { x, y }))) return true;
    }
    return false;
  }

  function collectMovingWireProbeAttachments(
    probes: Probe[],
    wires: Wire[],
    movingWireIds: Set<string>,
    selected: Set<string>,
  ): Map<string, { wireId: string; point: { x: number; y: number } }> {
    const out = new Map<string, { wireId: string; point: { x: number; y: number } }>();
    for (const probe of probes) {
      if (selected.has(probe.id)) continue;
      for (const wire of wires) {
        if (!movingWireIds.has(wire.id)) continue;
        if (!pointTouchesWirePath(probe, wire)) continue;
        out.set(probe.id, { wireId: wire.id, point: { x: probe.x, y: probe.y } });
        break;
      }
    }
    return out;
  }

  function probesAtPoint(point: [number, number]): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    for (const pr of page.probes) {
      if (sameTuple([pr.x, pr.y], point)) out.set(pr.id, { x: pr.x, y: pr.y });
    }
    return out;
  }

  function applyMovedWires(
    wires: Wire[],
    initialWires: Map<string, [number, number][]>,
    movingWireIds: Set<string>,
    movingWireAnchors: Map<string, WireEndpointAnchors>,
    attachedWirePoints: Map<string, Set<number>>,
    dx: number,
    dy: number,
    orthogonal: boolean,
  ): Wire[] {
    return normalizeWireList(
      wires.map((w) => {
        const init = initialWires.get(w.id);
        if (!init) return w;
        if (movingWireIds.has(w.id)) {
          const anchors = movingWireAnchors.get(w.id) ?? {};
          return {
            ...w,
            points: moveWirePointsWithAnchors(init, dx, dy, anchors, orthogonal),
          };
        }
        const attached = attachedWirePoints.get(w.id);
        if (!attached) return w;
        return {
          ...w,
          points: moveAttachedWirePoints(init, attached, dx, dy, orthogonal),
        };
      }),
    );
  }

  function applySelectionDragPreview(
    sourcePage: SchematicPage,
    activeDrag: NonNullable<typeof drag>,
    dx: number,
    dy: number,
    orthogonal: boolean,
    trackPreviewWires: boolean,
  ): { page: SchematicPage; previewWireIds: string[] } {
    const previewWireIds = new Set(activeDrag.previewWireIds);
    const baseWires =
      previewWireIds.size > 0
        ? sourcePage.wires.filter((wire) => !previewWireIds.has(wire.id))
        : sourcePage.wires;
    const nextComponents = sourcePage.components.map((c) => {
      const init = activeDrag.initial.get(c.id);
      if (!init) return c;
      return { ...c, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
    });
    const movedWires = applyMovedWires(
      baseWires,
      activeDrag.initialWires,
      activeDrag.movingWireIds,
      activeDrag.movingWireAnchors,
      activeDrag.attachedWirePoints,
      dx,
      dy,
      orthogonal,
    );
    let nextProbes = sourcePage.probes.map((pr) => {
      const wireAttachment = activeDrag.movingWireProbeAttachments.get(pr.id);
      if (wireAttachment) {
        const wire = activeDrag.initialWires.get(wireAttachment.wireId);
        return wire
          ? {
              ...pr,
              ...movePointWithAnchoredWire(
                wireAttachment.point,
                wire,
                dx,
                dy,
                activeDrag.movingWireAnchors.get(wireAttachment.wireId) ?? {},
              ),
            }
          : pr;
      }
      const init = activeDrag.initial.get(pr.id);
      if (!init) return pr;
      return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
    });
    const contactWires = buildTranslatedPinContactWires(
      activeDrag.directContactPins,
      dx,
      dy,
      orthogonal,
    );
    const withContacts = appendConnectionWiresWithInsertedIds(movedWires, contactWires);
    nextProbes = moveUnmovedProbesWithChangedWirePaths(
      nextProbes,
      sourcePage.probes,
      sourcePage.wires,
      withContacts.wires,
    );
    return {
      page: {
        ...sourcePage,
        components: nextComponents,
        probes: nextProbes,
        wires: pruneUnanchoredWireJunctions(
          withContacts.wires,
          nextComponents,
          nextProbes,
        ),
      },
      previewWireIds: trackPreviewWires ? withContacts.insertedIds : [],
    };
  }

  function appendConnectionWires(wires: Wire[], additions: Wire[]): Wire[] {
    return appendConnectionWiresWithInsertedIds(wires, additions).wires;
  }

  function appendConnectionWiresWithInsertedIds(
    wires: Wire[],
    additions: Wire[],
  ): { wires: Wire[]; insertedIds: string[] } {
    let next = normalizeWireList(wires);
    const insertedIds: string[] = [];
    for (const wire of additions) {
      const inserted = addWireWithJunctions({ wires: next }, wire).wires;
      if (inserted.some((w) => w.id === wire.id) && !next.some((w) => w.id === wire.id)) {
        insertedIds.push(wire.id);
      }
      next = inserted;
    }
    return { wires: next, insertedIds };
  }

  function commitWireRoute(points: [number, number][]) {
    const route = compactWirePoints(points);
    if (route.length < 2) return;
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        ...addWireWithJunctions(p, { id: makeId("w"), points: route }),
      })),
    );
  }

  function onCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // SVG elements aren't focusable, so clicking the canvas would leave focus
    // in whatever input the user last touched — that breaks the Delete /
    // Backspace shortcut because the global key handler bails out when an
    // input is focused. Steal focus back to the canvas wrapper here.
    const wrap = (e.currentTarget.closest(".canvas-wrap") as HTMLElement | null);
    if (wrap && document.activeElement !== wrap) {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) active.blur?.();
      wrap.focus({ preventScroll: true });
    }
    if (e.button === 1 || (e.button === 0 && (tool === "pan" || e.altKey || spacePanRef.current))) {
      e.preventDefault();
      capturePointer(e);
      setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    if (e.button !== 0) return;
    capturePointer(e);
    const g = screenToGrid(e.clientX, e.clientY);
    const raw = screenToWorld(e.clientX, e.clientY);
    const targetWireId = wireIdFromTarget(e.target);
    const targetComponentId = componentIdFromTarget(e.target);

    const scopeProbeId = scopeProbeIdFromTarget(e.target);
    if (tool === "select" && scopeProbeId) {
      const probe = page.probes.find((p) => p.id === scopeProbeId);
      if (probe) {
        const nextSelected = nextSelectionForHit(probe.id, e.shiftKey);
        setSelectedIds(nextSelected);
        if (!selectionClickStartsDrag(e.shiftKey) || nextSelected.size === 0) {
          setScopeDrag(null);
          setHoverId(null);
          return;
        }
        setScopeDrag({
          probeId: probe.id,
          startGrid: g,
          startWorld: raw,
          delta: { x: 0, y: 0 },
          initialDx: probe.scopeDx ?? SCOPE_OFFSET_X,
          initialDy: probe.scopeDy ?? SCOPE_OFFSET_Y,
          committed: false,
        });
        setHoverId(null);
      }
      return;
    }

    if (tool === "probe") {
      const snap = nearestConnection(raw.x, raw.y, 1.15, WIRING_SNAP);
      if (!snap) {
        showCanvasNotice("Probe must snap to a pin or wire");
        return;
      }
      clearCanvasNotice();
      const existing = page.probes.find(
        (p) => Math.abs(p.x - snap.x) < 0.6 && Math.abs(p.y - snap.y) < 0.6,
      );
      if (existing && e.shiftKey) {
        commit((d) =>
          updateCurrentPage(d, (p) => ({
            ...p,
            probes: p.probes.filter((pr) => pr.id !== existing.id),
          })),
        );
        setSelectedIds(new Set());
      } else if (existing) {
        setSelectedIds(new Set([existing.id]));
      } else if (!existing) {
        const colorIdx = page.probes.length % PROBE_COLORS.length;
        const probe = {
          id: makeId("probe"),
          x: snap.x,
          y: snap.y,
          color: PROBE_COLORS[colorIdx],
        };
        commit((d) =>
          updateCurrentPage(d, (p) => ({
            ...p,
            wires: splitWiresAtPoint(p.wires, [snap.x, snap.y]),
            probes: [...p.probes, probe],
          })),
        );
        setSelectedIds(new Set([probe.id]));
        setStatus("Probe added");
      }
      return;
    }

    if (tool === "wire") {
      const snap = nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP);
      const target: [number, number] = snap ? [snap.x, snap.y] : [g.x, g.y];
      const activeDraft = wireDraftRef.current;
      if (!activeDraft) {
        updateWireDraft([target]);
        updateWireGesture({ start: target, moved: false, mode: "wire-tool" });
      } else {
        const prev = activeDraft[activeDraft.length - 1];
        const route = [
          ...activeDraft,
          ...routeWireSegment(
            { x: prev[0], y: prev[1] },
            { x: target[0], y: target[1] },
            snapToGrid,
          ).slice(1),
        ];
        // If we landed on a pin and have ≥1 real segment, commit the wire.
        if (snap && route.length >= 2) {
          commitWireRoute(route);
          updateWireDraft(null);
          updateWireGesture(null);
        } else {
          updateWireDraft(route);
          updateWireGesture(null);
        }
      }
      return;
    }

    if (tool === "select") {
      const targetIsWireVertexHandle = isWireVertexHandleTarget(e.target);
      const targetIsConnectionHandle = isConnectionHandleTarget(e.target);
      const targetComponent = targetComponentId
        ? page.components.find((component) => component.id === targetComponentId) ?? null
        : null;
      const geometricHit = hitSelectable(raw.x, raw.y, targetWireId);
      const hit = pointerSelectionHit(geometricHit, targetComponent);
      const intent = selectPointerIntent({
        additive: e.shiftKey,
        hitKind: hitKindForItem(hit),
        onConnectionHandle: targetIsConnectionHandle,
        onWireVertexHandle: targetIsWireVertexHandle,
      });
      if (intent === "wire-vertex-drag") {
        const vhit = hitWireVertex(raw.x, raw.y, 0.45, { handleVisible: true });
        if (!vhit) return;
        const w = page.wires.find((ww) => ww.id === vhit.wireId);
        if (w) {
          setWireDrag({
            wireId: w.id,
            pointIdx: vhit.idx,
            startWorld: raw,
            initialPoints: w.points.map(([x, y]) => [x, y]),
            initialProbes: probesAtPoint(w.points[vhit.idx]),
            committed: false,
          });
          return;
        }
      }
      const quickWireStart = intent === "quick-wire"
        ? nearestConnection(raw.x, raw.y, 0.48, QUICK_WIRE_START_SNAP)
        : null;
      if (quickWireStart) {
        const target: [number, number] = [quickWireStart.x, quickWireStart.y];
        updateWireDraft([target]);
        updateWireGesture({
          start: target,
          moved: false,
          mode: "quick-wire",
          fallbackSelectionId: hit?.id,
        });
        setSelectedIds(new Set());
        setHoverId(null);
        setSnapTarget({ x: quickWireStart.x, y: quickWireStart.y });
        setStatus("Drag from a terminal to wire");
        return;
      }
      if (intent === "object-selection" && hit) {
        const nextSelected = nextSelectionForHit(hit.id, e.shiftKey);
        setSelectedIds(nextSelected);
        if (!selectionClickStartsDrag(e.shiftKey) || nextSelected.size === 0) {
          setDrag(null);
          setHoverId(null);
          return;
        }
        const {
          initial,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          movingWireProbeAttachments,
          attachedWirePoints,
          directContactPins,
        } =
          collectDragMotion(nextSelected);
        setDrag({
          initial,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          movingWireProbeAttachments,
          attachedWirePoints,
          directContactPins,
          previewWireIds: [],
          startGrid: g,
          startWorld: raw,
          delta: { x: 0, y: 0 },
          committed: false,
        });
      } else {
        // Begin marquee
        if (!e.shiftKey) setSelectedIds(new Set());
        setMarquee({ sx: raw.x, sy: raw.y, ex: raw.x, ey: raw.y, additive: e.shiftKey });
      }
      return;
    }

    const kindTool = tool as ComponentKind;
    if (isTwoTerminalKind(kindTool)) {
      const snap = pointerConnectionPoint(e.clientX, e.clientY, 1.0, WIRING_SNAP);
      setPlacementDraft({ kind: kindTool, start: snap, end: snap });
      setSelectedIds(new Set());
      setHoverId(null);
      return;
    }

    const placementPoint =
      kindTool === "GND" || kindTool === "LABEL"
        ? pointerConnectionPoint(e.clientX, e.clientY, 1.0, WIRING_SNAP)
        : g;
    // Multi-pin/single-pin tools place at the pointer-down location. Moving is
    // an explicit Select-tool action so a placement drag cannot silently shift
    // the symbol away from the pin positions the user just targeted.
    const c: CircuitComponent = {
      id: makeId(tool.toLowerCase()),
      kind: kindTool,
      x: placementPoint.x,
      y: placementPoint.y,
      rotation: 0,
      value: defaultValue(kindTool),
    };
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: [...p.components, c],
        wires:
          kindTool === "GND" || kindTool === "LABEL"
            ? splitWiresAtPoint(p.wires, [placementPoint.x, placementPoint.y])
            : p.wires,
      })),
    );
    setSelectedIds(new Set([c.id]));
    if (kindTool !== "GND" && kindTool !== "LABEL") setTool("select");
    setStatus(placementStatusFor(kindTool));
  }

  function onCanvasPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (panning) {
      e.preventDefault();
      setPan({ x: e.clientX - panning.x, y: e.clientY - panning.y });
      return;
    }
    const g = screenToGrid(e.clientX, e.clientY);
    const raw = screenToWorld(e.clientX, e.clientY);
    setCursor(g);
    if (tool === "wire" || isSinglePinSnappingTool(tool) || wireGestureRef.current) {
      setSnapTarget(nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP));
      const activeGesture = wireGestureRef.current;
      if (activeGesture && !activeGesture.moved) {
        const moved = movedBeyondThreshold(
          { x: activeGesture.start[0], y: activeGesture.start[1] },
          raw,
          0.35,
        );
        if (moved) updateWireGesture({ ...activeGesture, moved: true });
      }
    } else if (!wireDrag && !placementDraft && snapTarget) {
      setSnapTarget(null);
    }

    if (placementDraft) {
      const snap = nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP);
      setSnapTarget(snap ? { x: snap.x, y: snap.y } : null);
      setPlacementDraft({ ...placementDraft, end: normalizePoint(snap ?? g) });
      setHoverId(null);
      return;
    }

    if (scopeDrag) {
      setHoverId(null);
      const delta = scopeDrag.committed
        ? canvasDragDelta(scopeDrag.startWorld, raw, snapToGridRef.current)
        : canvasDragDeltaAfterThreshold(scopeDrag.startWorld, raw, snapToGridRef.current);
      if (!delta) return;
      const { x: dx, y: dy } = delta;
      if (dx === 0 && dy === 0 && !scopeDrag.committed) return;
      if (!scopeDrag.committed) {
        pushPast(historySnapshot());
        setFuture([]);
        setScopeDrag({ ...scopeDrag, committed: true, delta: { x: dx, y: dy } });
      } else {
        setScopeDrag({ ...scopeDrag, delta: { x: dx, y: dy } });
      }
      const scopeDx = normalizeCoord(scopeDrag.initialDx + dx);
      const scopeDy = normalizeCoord(scopeDrag.initialDy + dy);
      previewMutate((d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          probes: p.probes.map((probe) =>
            probe.id === scopeDrag.probeId ? { ...probe, scopeDx, scopeDy } : probe,
          ),
        })),
      );
      return;
    }

    if (wireDrag) {
      setHoverId(null);
      if (
        !wireDrag.committed &&
        !movedBeyondThreshold(wireDrag.startWorld, raw, CANVAS_DRAG_START_THRESHOLD)
      ) {
        return;
      }
      // Drag a single wire vertex / endpoint. It should reconnect to any
      // nearby pin, wire vertex, or wire segment; otherwise users have to be
      // pixel-perfect when repairing a connection.
      const rawSnap = nearestConnection(raw.x, raw.y, 1.0, {
        ...WIRING_SNAP,
        excludeWireId: wireDrag.wireId,
      });
      const cur = wireDrag.initialPoints[wireDrag.pointIdx];
      const snap = shouldSuppressOriginalConnectionSnap(
        { x: cur[0], y: cur[1] },
        raw,
        rawSnap,
      )
        ? null
        : rawSnap;
      setSnapTarget(snap ? { x: snap.x, y: snap.y } : null);
      const nextPoint = normalizePoint(snap ?? g);
      const nx = nextPoint.x;
      const ny = nextPoint.y;
      const wireId = wireDrag.wireId;
      const pointIdx = wireDrag.pointIdx;
      const dx = nx - cur[0];
      const dy = ny - cur[1];
      if (cur[0] === nx && cur[1] === ny && !wireDrag.committed) return;
      if (!wireDrag.committed) {
        pushPast(historySnapshot());
        setFuture([]);
        setWireDrag({ ...wireDrag, committed: true });
      }
      previewMutate((d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          wires: p.wires.map((w) => {
            if (w.id !== wireId) return w;
            return {
              ...w,
              points: reshapeDraggedWirePoint(
                wireDrag.initialPoints,
                pointIdx,
                [nx, ny],
                !snapToGridRef.current,
              ),
            };
          }),
          probes: p.probes.map((pr) => {
            const init = wireDrag.initialProbes.get(pr.id);
            if (!init) return pr;
            return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
          }),
        })),
      );
      return;
    }

    if (drag) {
      setHoverId(null);
      const delta = drag.committed
        ? canvasDragDelta(drag.startWorld, raw, snapToGridRef.current)
        : canvasDragDeltaAfterThreshold(drag.startWorld, raw, snapToGridRef.current);
      if (!delta) return;
      const { x: dx, y: dy } = delta;
      if (dx === 0 && dy === 0 && !drag.committed) return;
      if (!drag.committed) {
        pushPast(historySnapshot());
        setFuture([]);
      }
      let previewWireIds: string[] = [];
      previewMutate((d) =>
        updateCurrentPage(d, (p) => {
          const preview = applySelectionDragPreview(
            p,
            drag,
            dx,
            dy,
            snapToGridRef.current,
            true,
          );
          previewWireIds = preview.previewWireIds;
          return preview.page;
        }),
      );
      setDrag({
        ...drag,
        committed: true,
        delta: { x: dx, y: dy },
        previewWireIds,
      });
      return;
    }

    if (marquee) {
      setMarquee({ ...marquee, ex: raw.x, ey: raw.y });
      setHoverId(null);
      return;
    }

    if (tool === "select") {
      const hit = hitSelectable(raw.x, raw.y);
      setHoverId(hit?.id ?? null);
    }
  }

  function onCanvasPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    releasePointer(e);
    setPanning(null);
    if (drag) {
      const activeDrag = drag;
      setDrag(null);
      if (activeDrag.committed) {
        const raw = screenToWorld(e.clientX, e.clientY);
        const { x: dx, y: dy } = canvasDragDelta(
          activeDrag.startWorld,
          raw,
          snapToGridRef.current,
        );
        previewMutate((d) =>
          updateCurrentPage(d, (p) =>
            applySelectionDragPreview(
              p,
              activeDrag,
              dx,
              dy,
              snapToGridRef.current,
              false,
            ).page,
          ),
        );
      }
    }
    if (scopeDrag) {
      setScopeDrag(null);
    }
    if (wireDrag) {
      if (wireDrag.committed) {
        const finalWire = currentPage(docRef.current).wires.find(
          (w) => w.id === wireDrag.wireId,
        );
        const finalPoint = finalWire?.points[Math.min(wireDrag.pointIdx, finalWire.points.length - 1)];
        if (finalPoint) {
          previewMutate((d) =>
            updateCurrentPage(d, (p) => ({
              ...p,
              wires: splitWiresAtPoint(p.wires, finalPoint),
            })),
          );
        }
      }
      setSelectedIds(new Set([wireDrag.wireId]));
      setWireDrag(null);
      setSnapTarget(null);
    }
    const activeWireGesture = wireGestureRef.current;
    const activeWireDraft = wireDraftRef.current;
    if (activeWireGesture && activeWireDraft) {
      const g = screenToGrid(e.clientX, e.clientY);
      const raw = screenToWorld(e.clientX, e.clientY);
      const moved =
        activeWireGesture.moved ||
        movedBeyondThreshold(
          { x: activeWireGesture.start[0], y: activeWireGesture.start[1] },
          raw,
          0.35,
        );
      if (moved) {
        const snap = nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP);
        const target = snap ? { x: snap.x, y: snap.y } : g;
        const start = activeWireDraft[activeWireDraft.length - 1];
        const route = [
          ...activeWireDraft,
          ...routeWireSegment(
            { x: start[0], y: start[1] },
            target,
            snapToGrid,
          ).slice(1),
        ];
        commitWireRoute(route);
        updateWireDraft(null);
        setStatus("Wire added");
      } else if (activeWireGesture.mode === "quick-wire") {
        updateWireDraft(null);
        if (activeWireGesture.fallbackSelectionId) {
          setSelectedIds(new Set([activeWireGesture.fallbackSelectionId]));
        }
      }
      updateWireGesture(null);
      setSnapTarget(null);
      return;
    }
    if (placementDraft) {
      if (placementLength(placementDraft) < 0.35) {
        const c = componentFromClick(
          placementDraft.kind,
          placementDraft.start,
          makeId(placementDraft.kind.toLowerCase()),
        );
        commit((d) =>
          updateCurrentPage(d, (p) => ({
            ...p,
            components: [...p.components, c],
          })),
        );
        setSelectedIds(new Set([c.id]));
        setPlacementDraft(null);
        setSnapTarget(null);
        setTool("select");
        setStatus(`Added ${COMPONENT_LABELS[c.kind]}`);
        return;
      }
      const c = componentFromTerminals(
        placementDraft.kind,
        placementDraft.start,
        placementDraft.end,
        makeId(placementDraft.kind.toLowerCase()),
      );
      let insertedInline = false;
      let addedStubCount = 0;
      commit((d) =>
        updateCurrentPage(d, (p) => {
          const cutSpan = placementWireCutSpan(c, placementDraft.start, placementDraft.end);
          let nextWires = cutWireSegmentBetweenPoints(
            p.wires,
            [cutSpan.start.x, cutSpan.start.y],
            [cutSpan.end.x, cutSpan.end.y],
            () => makeId("w"),
          );
          insertedInline = nextWires !== p.wires;
          const placementWires = placementConnectionWires(
            c,
            placementDraft.start,
            placementDraft.end,
            snapToGrid,
            insertedInline,
            () => makeId("w"),
          );
          addedStubCount = placementWires.length;
          for (const w of placementWires) {
            nextWires = addWireWithJunctions({ wires: nextWires }, w).wires;
          }
          const nextProbes = insertedInline
            ? moveProbesFromInsertedWireSpan(p.probes, c, cutSpan, placementWires)
            : p.probes;
          return { ...p, components: [...p.components, c], wires: nextWires, probes: nextProbes };
        }),
      );
      if (insertedInline) {
        setStatus(`Inserted ${COMPONENT_LABELS[c.kind]} into wire`);
      } else if (addedStubCount > 0) {
        setStatus(`Added ${COMPONENT_LABELS[c.kind]} with connection stubs`);
      } else {
        setStatus(`Added ${COMPONENT_LABELS[c.kind]}`);
      }
      setSelectedIds(new Set([c.id]));
      setPlacementDraft(null);
      setSnapTarget(null);
      setTool("select");
      return;
    }
    if (marquee) {
      const x1 = Math.min(marquee.sx, marquee.ex);
      const x2 = Math.max(marquee.sx, marquee.ex);
      const y1 = Math.min(marquee.sy, marquee.ey);
      const y2 = Math.max(marquee.sy, marquee.ey);
      const componentHits = page.components
        .filter((c) => rectsIntersect({ x1, y1, x2, y2 }, componentVisualBoundsFor(c, 0.1)))
        .map((c) => c.id);
      const wireHits = page.wires
        .filter((w) => wireIntersectsRect(w.points, { x1, y1, x2, y2 }))
        .map((w) => w.id);
      const probeHits = page.probes
        .filter((pr) => pr.x >= x1 && pr.x <= x2 && pr.y >= y1 && pr.y <= y2)
        .map((pr) => pr.id);
      const hits = [...componentHits, ...wireHits, ...probeHits];
      if (hits.length > 0) {
        setSelectedIds(
          marquee.additive ? new Set([...selectedIds, ...hits]) : new Set(hits),
        );
      }
      setMarquee(null);
    }
  }

  function onCanvasPointerLeave(e: React.PointerEvent<SVGSVGElement>) {
    if (!panning && !drag && !wireDrag && !placementDraft) {
      setCursor(null);
      setSnapTarget(null);
      setHoverId(null);
    }
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      onCanvasPointerUp(e);
    }
  }

  function onCanvasContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const raw = screenToWorld(e.clientX, e.clientY);
    // Right-clicking on a component: if it isn't already selected, replace
    // the selection with just it, then offer per-component actions.
    const targetWireId =
      e.target instanceof SVGElement
        ? e.target.getAttribute("data-wire-id")
        : null;
    const hit = hitSelectable(raw.x, raw.y, targetWireId);
    let working = selectedIds;
    if (hit && !selectedIds.has(hit.id)) {
      working = new Set([hit.id]);
      setSelectedIds(working);
    }
    const canPaste = true;
    const items: ContextMenuEntry[] = [];
    if (working.size > 0) {
      const hasSelectedComponents = page.components.some((c) => working.has(c.id));
      if (hasSelectedComponents) {
        items.push({ label: "Rotate", shortcut: "⇧R", onSelect: () => rotateSelected() });
      }
      items.push(
        { label: "Fit Selection", shortcut: "⇧2", onSelect: () => fitSelectionToContent() },
        { divider: true },
        { label: "Copy", shortcut: "⌘C", onSelect: () => void copySelectionToClipboard() },
        { label: "Duplicate", shortcut: "⌘D", onSelect: () => duplicateSelection() },
        { label: "Paste", shortcut: "⌘V", disabled: !canPaste, onSelect: () => void pasteAtCursor() },
        { divider: true },
        {
          label: "Delete",
          shortcut: "⌫",
          danger: true,
          onSelect: () => deleteSelected(),
        },
      );
    } else {
      items.push(
        { label: "Fit to Content", shortcut: "⇧F", onSelect: () => fitToContent() },
        {
          label: gridVisible ? "Hide Grid" : "Show Grid",
          shortcut: "⇧G",
          onSelect: () => setGridVisible((v) => !v),
        },
        {
          label: snapToGrid ? "Disable Snap" : "Enable Snap",
          shortcut: "⇧S",
          onSelect: () => setSnapToGrid((v) => !v),
        },
        { divider: true },
        { label: "Paste", shortcut: "⌘V", disabled: !canPaste, onSelect: () => void pasteAtCursor() },
        { divider: true },
        {
          label: "Select all",
          shortcut: "⌘A",
          onSelect: () => {
            setSelectedIds(
              new Set([
                ...page.components.map((c) => c.id),
                ...page.wires.map((w) => w.id),
                ...page.probes.map((p) => p.id),
              ]),
            );
          },
        },
      );
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }

  function onCanvasDoubleClick() {
    const activeDraft = wireDraftRef.current;
    if (tool === "wire" && activeDraft && activeDraft.length >= 2) {
      commitWireRoute(activeDraft);
      updateWireDraft(null);
      updateWireGesture(null);
    }
  }

  // Mac trackpad convention, matching Figma / Sketch / Procreate:
  //   - two-finger scroll (wheel without ctrlKey) → pan
  //   - pinch (browsers synthesize a wheel event with ctrlKey=true) → zoom
  //   - ⌥-drag from earlier still works as an explicit pan fallback for mice.
  // Attached via a native listener so `passive: false` is honoured and the
  // browser's own page-zoom on pinch is properly suppressed inside the canvas.
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const naturalPanRef = useRef(naturalPan);
  naturalPanRef.current = naturalPan;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // Pinch → zoom toward cursor
        const factor = Math.exp(-e.deltaY * 0.012);
        const next = zoomAtViewportPoint(
          panRef.current,
          zoomRef.current,
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          factor,
          0.3,
          4,
        );
        setPan(next.pan);
        setZoom(next.zoom);
      } else {
        // Two-finger scroll -> pan. The default uses the OS-reported macOS
        // trackpad direction; users can flip it if their driver reports deltas
        // the other way.
        setPan(applyWheelPan(panRef.current, e.deltaX, e.deltaY, naturalPanRef.current));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  function rotateSelected(selection: Set<string> = selectedIds) {
    if (selection.size === 0) return;
    const selected = new Set(selection);
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const pinMoves = collectRotatedPinMoves(p.components, selected);
        const contactWires = buildRotatedPinContactWires(
          p.components,
          p.wires,
          selected,
          pinMoves,
          snapToGridRef.current,
        );
        let nextWires = moveWiresToRotatedPins(p.wires, pinMoves, snapToGridRef.current);
        for (const wire of contactWires) {
          nextWires = addWireWithJunctions({ wires: nextWires }, wire).wires;
        }
        const nextComponents = p.components.map((c) =>
          selected.has(c.id) ? { ...c, rotation: rotateNext(c.rotation) } : c,
        );
        const movedPinProbes = moveProbesWithPinMoves(
          p.probes,
          pinMoves,
          p.components,
          p.wires,
          selected,
        );
        const nextProbes = moveUnmovedProbesWithChangedWirePaths(
          movedPinProbes,
          p.probes,
          p.wires,
          nextWires,
        );
        return {
          ...p,
          components: nextComponents,
          wires: pruneUnanchoredWireJunctions(nextWires, nextComponents, nextProbes),
          probes: nextProbes,
        };
      }),
    );
  }

  function nudgeSelection(dx: number, dy: number) {
    const selected = selRef.current;
    if (selected.size === 0) return;
    const p = currentPage(docRef.current);
    const {
      initial,
      initialWires,
      movingWireIds,
      movingWireAnchors,
      movingWireProbeAttachments,
      attachedWirePoints,
      directContactPins,
    } =
      collectDragMotion(selected, p);
    if (initial.size === 0 && initialWires.size === 0) return;
    const contactWires = buildTranslatedPinContactWires(
      directContactPins,
      dx,
      dy,
      snapToGridRef.current,
    );
    commit((d) =>
      updateCurrentPage(d, (page) => {
        const movedWires = applyMovedWires(
          page.wires,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          attachedWirePoints,
          dx,
          dy,
          snapToGridRef.current,
        );
        const nextComponents = page.components.map((c) => {
          const init = initial.get(c.id);
          if (!init) return c;
          return { ...c, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        let nextProbes = page.probes.map((pr) => {
          const wireAttachment = movingWireProbeAttachments.get(pr.id);
          if (wireAttachment) {
            const wire = initialWires.get(wireAttachment.wireId);
            return wire
              ? {
                  ...pr,
                  ...movePointWithAnchoredWire(
                    wireAttachment.point,
                    wire,
                    dx,
                    dy,
                    movingWireAnchors.get(wireAttachment.wireId) ?? {},
                  ),
                }
              : pr;
          }
          const init = initial.get(pr.id);
          if (!init) return pr;
          return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        const nextWires = appendConnectionWires(movedWires, contactWires);
        nextProbes = moveUnmovedProbesWithChangedWirePaths(
          nextProbes,
          page.probes,
          page.wires,
          nextWires,
        );
        return {
          ...page,
          components: nextComponents,
          probes: nextProbes,
          wires: pruneUnanchoredWireJunctions(nextWires, nextComponents, nextProbes),
        };
      }),
    );
  }

  function deleteSelected() {
    // selRef tracks the live state — the key-handler closure that calls us
    // was captured at mount time, so reading `selectedIds` directly would
    // always see the initial empty Set.
    const sel = selRef.current;
    if (sel.size === 0) return;
    const sourcePage = currentPage(docRef.current);
    const selectedComponentCount = sourcePage.components.filter((c) => sel.has(c.id)).length;
    const selectedWireCount = sourcePage.wires.filter((w) => sel.has(w.id)).length;
    const selectedProbeCount = sourcePage.probes.filter((pr) => sel.has(pr.id)).length;
    let cleanedWireCount = 0;
    let cleanedProbeCount = 0;
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const deletedComponents = p.components.filter((c) => sel.has(c.id));
        const nextComponents = p.components.filter((c) => !sel.has(c.id));
        const keptWires = p.wires.filter((w) => !sel.has(w.id));
        const nextWires = pruneWiresAfterComponentDelete(
          keptWires,
          deletedComponents,
          nextComponents,
        );
        cleanedWireCount = Math.max(0, keptWires.length - nextWires.length);
        const keptProbes = p.probes.filter((pr) => !sel.has(pr.id));
        const nextProbes = keptProbes.filter((pr) =>
          probeHasConnection(pr, nextComponents, nextWires),
        );
        cleanedProbeCount = Math.max(0, keptProbes.length - nextProbes.length);
        return {
          ...p,
          components: nextComponents,
          wires: nextWires,
          probes: nextProbes,
        };
      }),
    );
    setSelectedIds(new Set());
    setStatus(
      deletionStatus(
        selectedComponentCount,
        selectedWireCount,
        selectedProbeCount,
        cleanedWireCount,
        cleanedProbeCount,
      ),
    );
  }

  function updateValue(id: string, value: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) => (c.id === id ? { ...c, value } : c)),
      })),
    );
  }

  function updateComponentPosition(id: string, axis: "x" | "y", raw: string) {
    const nextValue = Number(raw);
    if (!Number.isFinite(nextValue)) return;
    const component = page.components.find((c) => c.id === id);
    if (!component) return;
    const normalizedValue = normalizeCoord(nextValue);
    const dx = axis === "x" ? normalizedValue - component.x : 0;
    const dy = axis === "y" ? normalizedValue - component.y : 0;
    if (dx === 0 && dy === 0) return;
    const {
      initial,
      initialWires,
      movingWireIds,
      movingWireAnchors,
      movingWireProbeAttachments,
      attachedWirePoints,
      directContactPins,
    } =
      collectDragMotion(new Set([id]));
    const contactWires = buildTranslatedPinContactWires(
      directContactPins,
      dx,
      dy,
      snapToGridRef.current,
    );
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const movedWires = applyMovedWires(
          p.wires,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          attachedWirePoints,
          dx,
          dy,
          snapToGridRef.current,
        );
        const nextComponents = p.components.map((c) =>
          c.id === id ? { ...c, ...normalizePoint({ x: c.x + dx, y: c.y + dy }) } : c,
        );
        let nextProbes = p.probes.map((pr) => {
          const wireAttachment = movingWireProbeAttachments.get(pr.id);
          if (wireAttachment) {
            const wire = initialWires.get(wireAttachment.wireId);
            return wire
              ? {
                  ...pr,
                  ...movePointWithAnchoredWire(
                    wireAttachment.point,
                    wire,
                    dx,
                    dy,
                    movingWireAnchors.get(wireAttachment.wireId) ?? {},
                  ),
                }
              : pr;
          }
          const init = initial.get(pr.id);
          if (!init) return pr;
          return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        const nextWires = appendConnectionWires(movedWires, contactWires);
        nextProbes = moveUnmovedProbesWithChangedWirePaths(
          nextProbes,
          p.probes,
          p.wires,
          nextWires,
        );
        return {
          ...p,
          components: nextComponents,
          probes: nextProbes,
          wires: pruneUnanchoredWireJunctions(nextWires, nextComponents, nextProbes),
        };
      }),
    );
  }

  function updateProbePosition(id: string, axis: "x" | "y", raw: string) {
    const nextValue = Number(raw);
    if (!Number.isFinite(nextValue)) return;
    const normalizedValue = normalizeCoord(nextValue);
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        probes: p.probes.map((probe) =>
          probe.id === id ? { ...probe, [axis]: normalizedValue } : probe,
        ),
      })),
    );
  }

  function updateParam(id: string, key: string, value: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) =>
          c.id === id
            ? { ...c, params: { ...(c.params ?? {}), [key]: value } }
            : c,
        ),
      })),
    );
  }

  function updateProbeLabel(id: string, label: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        probes: p.probes.map((probe) =>
          probe.id === id ? { ...probe, label: label.trim() ? label : undefined } : probe,
        ),
      })),
    );
  }

  function resetProbeScopeOffset(id: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        probes: p.probes.map((probe) =>
          probe.id === id
            ? {
                ...probe,
                scopeDx: undefined,
                scopeDy: undefined,
              }
            : probe,
        ),
      })),
    );
  }

  function removeDisconnectedProbes() {
    if (disconnectedProbeIds.size === 0) return;
    const ids = new Set(disconnectedProbeIds);
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        probes: p.probes.filter((probe) => !ids.has(probe.id)),
      })),
    );
    setSelectedIds((idsNow) => new Set([...idsNow].filter((id) => !ids.has(id))));
    setStatus(`Removed ${ids.size} disconnected probe${ids.size === 1 ? "" : "s"}`);
  }

  async function copySelectionToClipboard() {
    const p = currentPage(docRef.current);
    const next = {
      components: p.components.filter((c) => selRef.current.has(c.id)),
      wires: p.wires.filter((w) => selRef.current.has(w.id)),
      probes: p.probes.filter((pr) => selRef.current.has(pr.id)),
    };
    if (next.components.length === 0 && next.wires.length === 0 && next.probes.length === 0) {
      return;
    }
    setClipboard(next);
    const summary = selectionSummary(next.components.length, next.wires.length, next.probes.length);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("System clipboard unavailable");
      await navigator.clipboard.writeText(encodeSchematicClipboard(next));
      setStatus(`${summary} copied`);
    } catch {
      setStatus(`${summary} copied locally`);
    }
  }

  async function pasteAtCursor() {
    const cb = (await readSystemSchematicClipboard()) ?? clipboardRef.current;
    if (
      !cb ||
      (cb.components.length === 0 && cb.wires.length === 0 && cb.probes.length === 0)
    ) {
      return;
    }
    const cur = cursorRef.current ?? { x: 0, y: 0 };
    const anchor = clipboardAnchor(cb.components, cb.wires, cb.probes);
    const ox = cur.x - anchor.x;
    const oy = cur.y - anchor.y;
    const newComps = cb.components.map((c) => ({
      ...c,
      id: makeId(c.kind.toLowerCase()),
      x: c.x + ox,
      y: c.y + oy,
    }));
    const newWires = cb.wires.map((w) => ({
      ...w,
      id: makeId("w"),
      points: w.points.map(([x, y]) => [x + ox, y + oy] as [number, number]),
    }));
    const newProbes = copyConnectedProbes(cb.probes, newComps, newWires, ox, oy);
    if (newComps.length === 0 && newWires.length === 0 && newProbes.length === 0) {
      return;
    }
    let insertedWireIds: string[] = [];
    let insertedProbeIds: string[] = [];
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const wireInsert = appendConnectionWiresWithInsertedIds(p.wires, newWires);
        insertedWireIds = wireInsert.insertedIds;
        const insertedWires = wireInsert.wires.filter((w) => insertedWireIds.includes(w.id));
        const insertedProbes = copiedProbesForInsertedTopology(
          newProbes,
          newComps,
          insertedWires,
          p.probes,
        );
        insertedProbeIds = insertedProbes.map((pr) => pr.id);
        return {
          ...p,
          components: [...p.components, ...newComps],
          wires: wireInsert.wires,
          probes: [...p.probes, ...insertedProbes],
        };
      }),
    );
    setSelectedIds(
      new Set([
        ...newComps.map((c) => c.id),
        ...insertedWireIds,
        ...insertedProbeIds,
      ]),
    );
    setStatus(
      `Pasted ${selectionSummary(newComps.length, insertedWireIds.length, insertedProbeIds.length)}`,
    );
  }

  function duplicateSelection() {
    const p = currentPage(docRef.current);
    const comps = p.components.filter((c) => selRef.current.has(c.id));
    const wires = p.wires.filter((w) => selRef.current.has(w.id));
    const probes = p.probes.filter((pr) => selRef.current.has(pr.id));
    if (comps.length === 0 && wires.length === 0 && probes.length === 0) return;
    const newComps = comps.map((c) => ({
      ...c,
      id: makeId(c.kind.toLowerCase()),
      x: c.x + 2,
      y: c.y + 2,
    }));
    const newWires = wires.map((w) => ({
      ...w,
      id: makeId("w"),
      points: w.points.map(([x, y]) => [x + 2, y + 2] as [number, number]),
    }));
    const newProbes = copyConnectedProbes(probes, newComps, newWires, 2, 2);
    if (newComps.length === 0 && newWires.length === 0 && newProbes.length === 0) {
      return;
    }
    let insertedWireIds: string[] = [];
    let insertedProbeIds: string[] = [];
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const wireInsert = appendConnectionWiresWithInsertedIds(p.wires, newWires);
        insertedWireIds = wireInsert.insertedIds;
        const insertedWires = wireInsert.wires.filter((w) => insertedWireIds.includes(w.id));
        const insertedProbes = copiedProbesForInsertedTopology(
          newProbes,
          newComps,
          insertedWires,
          p.probes,
        );
        insertedProbeIds = insertedProbes.map((pr) => pr.id);
        return {
          ...p,
          components: [...p.components, ...newComps],
          wires: wireInsert.wires,
          probes: [...p.probes, ...insertedProbes],
        };
      }),
    );
    setSelectedIds(
      new Set([
        ...newComps.map((c) => c.id),
        ...insertedWireIds,
        ...insertedProbeIds,
      ]),
    );
  }

  async function copyShareLink() {
    const url = shareUrlForDoc(window.location.href, docRef.current);
    try {
      await navigator.clipboard?.writeText(url);
      setStatus("Share link copied");
    } catch {
      window.location.hash = new URL(url).hash;
      setStatus("Share link added to URL");
    }
  }

  async function exportSchematicSvg() {
    const svg = svgRef.current;
    const p = currentPage(docRef.current);
    if (!svg || p.components.length === 0) {
      setStatus("✗ Draw a schematic before exporting SVG");
      return;
    }
    const collected = collectPageBounds(p);
    const bounds = boundsFromPoints(collected.xs, collected.ys, 1.2);
    if (!bounds) {
      setStatus("✗ Draw a schematic before exporting SVG");
      return;
    }
    const activeProject = workspaceRef.current.projects.find(
      (project) => project.id === workspaceRef.current.active,
    );
    const title = activeProject?.name ?? currentPage(docRef.current).name ?? "Schematic";
    const markup = schematicSvgFromCanvas(svg, bounds, title);
    const filename = `${safeExportName(title)}.svg`;
    const exported = await exportSvg(filename, markup);
    setStatus(exported ? `Exported schematic to ${exported}` : "Schematic SVG exported");
  }

  function switchAnalysis(kind: CircuitDoc["analysis"]["kind"]) {
    // Quick-pill switch: preserve the user's last-known settings per kind
    // by carrying over numeric fields when possible.
    commit((d) => {
      const prev = d.analysis;
      let next: CircuitDoc["analysis"];
      if (kind === "op") next = { kind: "op" };
      else if (kind === "tran")
        next = {
          kind: "tran",
          tstep: prev.kind === "tran" ? prev.tstep : "10u",
          tstop: prev.kind === "tran" ? prev.tstop : "10m",
        };
      else if (kind === "dc")
        next = {
          kind: "dc",
          src:
            prev.kind === "dc"
              ? prev.src
              : sweepableSources[0] ?? "V1",
          start: prev.kind === "dc" ? prev.start : "0",
          stop: prev.kind === "dc" ? prev.stop : "5",
          step: prev.kind === "dc" ? prev.step : "0.1",
        };
      else if (kind === "ac")
        next = {
          kind: "ac",
          sweep: prev.kind === "ac" ? prev.sweep : "dec",
          npts: prev.kind === "ac" ? prev.npts : 30,
          fstart: prev.kind === "ac" ? prev.fstart : "1",
          fstop: prev.kind === "ac" ? prev.fstop : "1Meg",
        };
      else if (kind === "noise")
        next = {
          kind: "noise",
          out_node: prev.kind === "noise" ? prev.out_node : "out",
          src: prev.kind === "noise" ? prev.src : sweepableSources[0] ?? "V1",
          sweep: prev.kind === "noise" ? prev.sweep : "dec",
          npts: prev.kind === "noise" ? prev.npts : 10,
          fstart: prev.kind === "noise" ? prev.fstart : "1",
          fstop: prev.kind === "noise" ? prev.fstop : "1Meg",
        };
      else next = prev;
      return { ...d, analysis: next };
    });
  }

  function setSelectedSourceForSweep(refdes: string) {
    commit((d) => {
      const analysis = analysisWithSweepSource(d.analysis, refdes);
      return analysis === d.analysis ? d : { ...d, analysis };
    });
  }

  function setSelectedSourceForAcStimulus(id: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) =>
          c.id === id ? { ...c, value: sourceValueWithAcStimulus(c.value) } : c,
        ),
      })),
    );
  }

  async function runSimulation() {
    if (engineOkRef.current === false) {
      clearStaleRunOutput();
      setStatus("✗ Simulation engine offline");
      setLog("Simulation engine offline. Launch the Tauri app for native ngspice, or use a browser build with a WASM simulator backend.");
      setRunWarnings([]);
      setRunFloatingPins([]);
      return;
    }
    if (currentPage(docRef.current).components.length === 0) {
      clearStaleRunOutput();
      setStatus("✗ Place at least one component from the palette before running.");
      setRunWarnings([]);
      setRunFloatingPins([]);
      return;
    }
    const analysisIssues = validateAnalysisSpec(docRef.current.analysis);
    if (analysisIssues.length > 0) {
      const messages = analysisIssues.map((issue) => issue.message);
      clearStaleRunOutput();
      setStatus(`✗ ${messages[0]}`);
      setLog("Fix simulation settings before running:\n" + messages.map((m) => `  • ${m}`).join("\n"));
      setRunWarnings(messages);
      setRunFloatingPins([]);
      return;
    }
    const runId = latestRunIdRef.current + 1;
    latestRunIdRef.current = runId;
    const runGeneration = editGenerationRef.current;
    setRunning(true);
    setStatus("Building netlist…");
    const result = buildNetlist(docRef.current);
    setRunWarnings(result.warnings);
    setRunFloatingPins(result.floatingPins);
    try {
      setStatus("Running ngspice…");
      const apiAnalysis = analysisToApi(docRef.current.analysis);
      const sim = await simulate(result.netlist, apiAnalysis);
      if (runId !== latestRunIdRef.current || runGeneration !== editGenerationRef.current) {
        return;
      }
      setSimResult({
        plot: sim.plot,
        vectors: sim.vectors,
        log: sim.log,
        measurements: sim.measurements,
      });
      setWaveformVisible(true);
      setWaveformRunKey((key) => key + 1);
      const scale = sim.vectors.find((v) => v.is_scale);
      if (scale && scale.data.length > 1) {
        setPlayTime(scale.data[scale.data.length - 1]);
      }
      const page = currentPage(docRef.current);
      const probeNodes = page.probes
        .map((probe) => result.nodes.posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`))
        .filter((node): node is string => !!node);
      setSelectedTraces(defaultVisibleTraceNames(sim.vectors, probeNodes, sim.plot));
      setReadings(latestNodeVoltages(sim.vectors, result.nodes.rootToName.values(), sim.plot));
      const wstr = result.warnings.length
        ? "\n\nNetlist warnings:\n" + result.warnings.map((w) => "  • " + w).join("\n")
        : "";
      setLog(sim.log + wstr);
      const warnHint = result.warnings.length
        ? ` · ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`
        : "";
      setStatus(`✓ ${sim.plot}${warnHint}`);
    } catch (e) {
      if (runId !== latestRunIdRef.current || runGeneration !== editGenerationRef.current) {
        return;
      }
      // String(Error) is "Error: msg"; avoid double-prefixing.
      const raw = e instanceof Error ? e.message : String(e);
      const summary = summarizeSimulationError(raw);
      setReadings(null);
      setSimResult(null);
      setSelectedTraces(new Set());
      setPlaying(false);
      setWaveformVisible(false);
      setStatus(`✗ ${summary.status}`);
      setLog(formatSimulationErrorLog(summary));
    } finally {
      if (runId === latestRunIdRef.current) setRunning(false);
    }
  }

  function clearDoc() {
    commit(() => emptyDoc);
    resetInteractionState();
    clearSimulationState();
    setWaveformVisible(false);
    setStatus("Cleared");
    window.setTimeout(resetCanvasView, 0);
  }
  function loadDemo(id: string) {
    const demo = DEMOS.find((d) => d.id === id);
    if (!demo) return;
    commit(() => demo.build());
    resetInteractionState();
    clearSimulationState();
    setWaveformVisible(true);
    setStatus(`Loaded: ${demo.name}`);
    // On narrow viewports the side panels are overlay drawers; close them
    // after loading a demo so the user immediately sees the schematic.
    if (isNarrowViewport()) {
      setPagesCollapsed(true);
      setInspectorCollapsed(true);
    }
    window.setTimeout(fitToContent, 0);
  }

  useEffect(() => {
    const t = window.setTimeout(fitToContent, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const selectionBounds = useMemo(() => {
    if (tool !== "select" || selectedObjectCount <= 1) return null;
    const bounds = collectPageBounds(page, selectedIds);
    return boundsFromPoints(bounds.xs, bounds.ys, 0.42);
  }, [page, selectedIds, selectedObjectCount, tool]);
  const schematicStrokeWidth = Math.max(0.055, Math.min(0.12, 2.6 / (CELL * zoom)));
  const selectedSchematicStrokeWidth = schematicStrokeWidth * 1.45;
  const hoveredSchematicStrokeWidth = schematicStrokeWidth * 1.25;
  const canvasValueFontSize = Math.max(0.28, Math.min(0.56, 14 / (CELL * zoom)));
  const selectionStatus = selectedObjectCount > 0
    ? selectionSummary(
        selectedList.length,
        selectedWireList.length,
        selectedProbeList.length,
      )
    : null;
  const runDisabled = running || engineOk === false;
  const runTitle =
    engineOk === false
      ? "Simulation engine offline"
      : running
        ? "Simulation is running"
        : "Run (⌘R)";
  const pinAnnotations = useMemo(() => buildNetlist(doc), [doc]);
  const lastSelectedProbeNode = lastSelectedProbe
    ? pinAnnotations.nodes.posToNode.get(
        `${coordKey(lastSelectedProbe.x)},${coordKey(lastSelectedProbe.y)}`,
      )
    : undefined;
  const wireJunctionDots = useMemo(() => buildWireJunctionDots(page), [page]);
  const componentValueLabelOffsets = useMemo(
    () =>
      valueLabelOffsets(page, (component) => canvasValueLabel(component.kind, component.value) || null),
    [page],
  );
  const netLabelLayoutMap = useMemo(() => {
    const occupied: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const c of page.components) {
      if (c.kind === "LABEL") continue;
      const text = canvasValueLabel(c.kind, c.value);
      const offset = componentValueLabelOffsets.get(c.id);
      if (text && offset) occupied.push(valueLabelBounds(c, offset, text));
    }
    return netLabelLayouts(page, occupied);
  }, [componentValueLabelOffsets, page]);
  const sweepableSources = useMemo(() => {
    const out: string[] = [];
    for (const c of page.components) {
      if (isIndependentSourceKind(c.kind)) {
        const refdes = pinAnnotations.refdes.get(c.id);
        if (refdes) out.push(refdes);
      }
    }
    return out;
  }, [page.components, pinAnnotations]);
  const sourceLabels = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of page.components) {
      if (!isIndependentSourceKind(c.kind)) continue;
      const refdes = pinAnnotations.refdes.get(c.id);
      if (!refdes) continue;
      const value = canvasValueLabel(c.kind, c.value) || c.value.trim() || defaultValue(c.kind);
      out.set(refdes, `${refdes} — ${COMPONENT_LABELS[c.kind]} · ${value}`);
    }
    return out;
  }, [page.components, pinAnnotations]);
  const selectedRefdes = lastSelected ? pinAnnotations.refdes.get(lastSelected.id) : undefined;
  const hasAcSource = useMemo(
    () =>
      page.components.some((c) => isIndependentSourceKind(c.kind) && isAcStimulus(c.value)),
    [page.components],
  );
  const canvasInteractionActive = hasActiveCanvasInteraction({
    drag,
    wireDrag,
    scopeDrag,
    placementDraft,
    marquee,
    panning,
    wireDraft,
    wireGesture,
  });
  const autoRunPaused = autoRun && (tool !== "select" || canvasInteractionActive);

  // Auto-run: debounced sim re-run on any doc change.
  const runRef = useRef<() => void>(() => {});
  useEffect(() => {
    runRef.current = () => {
      void runSimulation();
    };
  });
  useEffect(() => {
    if (!autoRun) return;
    // Do not let auto-run open or resize the waveform pane while the user is
    // still constructing a schematic. Manual Run remains available in any tool.
    if (tool !== "select") return;
    // Preview drags mutate the document while the Select tool is active. Wait
    // for pointer-up/cancel so ngspice never runs against transient geometry.
    if (canvasInteractionActive) return;
    if (running) return;
    if (engineOk === false) return; // skip storms when ngspice unavailable
    if (page.components.length === 0) return;
    // Skip auto-run on incomplete circuits. Need at least one GND reference,
    // a source-of-some-kind, and 2+ components. Avoids running OP on a
    // single dangling resistor or capacitor — wastes CPU and produces a
    // nonsense plot.
    const hasGnd = page.components.some((c) => c.kind === "GND");
    const hasSource = page.components.some((c) => isSimulationStimulusKind(c.kind));
    if (!hasGnd || !hasSource || page.components.length < 2) return;
    const t = setTimeout(() => runRef.current(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, autoRun, engineOk, tool, canvasInteractionActive]);

  // Voltage overlay readings interpolated at playTime when a transient result exists.
  const liveReadings = useMemo(() => {
    if (!simResult) return readings;
    const scale = simResult.vectors.find((v) => v.is_scale);
    if (!scale || scale.data.length <= 1) return readings;
    const m = new Map<string, number>();
    const idx = findTimeIndex(scale.data, playTime);
    for (const v of simResult.vectors) {
      if (v.is_scale || v.data.length === 0) continue;
      const n = traceNodeName(v.name);
      m.set(n, v.data[idx]);
    }
    const out = new Map<string, number>();
    for (const name of pinAnnotations.nodes.rootToName.values()) {
      const v = m.get(name.toLowerCase());
      if (v !== undefined) out.set(name, v);
    }
    out.set("0", 0);
    return out;
  }, [simResult, playTime, pinAnnotations, readings]);

  const transientScale = simResult?.vectors.find((v) => v.is_scale);
  const isTransient =
    !!transientScale &&
    transientScale.data.length > 1 &&
    simResult!.plot.startsWith("tran");
  const liveActive = isTransient && liveFlow;
  const nodeDisplayLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const c of page.components) {
      if (c.kind !== "LABEL") continue;
      const label = c.value.trim();
      if (!label) continue;
      const node = pinAnnotations.nodes.posToNode.get(
        `${coordKey(c.x)},${coordKey(c.y)}`,
      );
      if (!node || node === "0") continue;
      labels.set(node.toLowerCase(), label);
    }
    return labels;
  }, [page.components, pinAnnotations.nodes.posToNode]);
  const probeScopes = useMemo(() => {
    const scale = simResult?.vectors.find((v) => v.is_scale)?.data ?? [];
    const visibleScopeProbes = page.probes.filter((probe) => {
      const node = pinAnnotations.nodes.posToNode.get(
        `${coordKey(probe.x)},${coordKey(probe.y)}`,
      );
      const hasTrace = Boolean(
        simResult && node && findNodeTrace(simResult.vectors, node, simResult.plot),
      );
      return shouldRenderInlineProbeScope(probe, {
        selected: selectedIds.has(probe.id),
        hovered: hoverId === probe.id,
        dragging: scopeDrag?.probeId === probe.id,
        hasTrace,
      });
    });
    const scopePlacements = layoutProbeScopes(
      { ...page, probes: visibleScopeProbes },
      SCOPE_LAYOUT,
    );
    return page.probes.map((probe) => {
      const visible = visibleScopeProbes.some((visibleProbe) => visibleProbe.id === probe.id);
      const node = pinAnnotations.nodes.posToNode.get(
        `${coordKey(probe.x)},${coordKey(probe.y)}`,
      );
      const placement = scopePlacements.get(probe.id) ?? {
        dx: SCOPE_OFFSET_X,
        dy: SCOPE_OFFSET_Y,
      };
      if (!node) {
        return { probe, visible, node: null, label: undefined, scale: [], trace: [], placement };
      }
      const label = inlineProbeScopeLabel(
        probe,
        nodeDisplayLabels.get(node.toLowerCase()),
      );
      if (!simResult) return { probe, visible, node, label, scale, trace: [], placement };
      const trace = findNodeTrace(simResult.vectors, node, simResult.plot);
      if (!trace) return { probe, visible, node, label, scale, trace: [], placement };
      return {
        probe,
        visible,
        node,
        label,
        scale,
        trace: trace.data,
        placement,
      };
    });
  }, [hoverId, nodeDisplayLabels, page, pinAnnotations.nodes.posToNode, scopeDrag, selectedIds, simResult]);
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
  const traceAliases = useMemo(() => {
    const aliases = new Map<string, string>();
    for (const [node, label] of nodeDisplayLabels) {
      aliases.set(traceAliasKey(`v(${node})`), `V(${label})`);
      aliases.set(traceAliasKey(node), `V(${label})`);
    }
    for (const probe of page.probes) {
      const label = probe.label?.trim();
      if (!label) continue;
      const node = pinAnnotations.nodes.posToNode.get(
        `${coordKey(probe.x)},${coordKey(probe.y)}`,
      );
      if (!node) continue;
      aliases.set(traceAliasKey(`v(${node})`), label);
      aliases.set(traceAliasKey(node), label);
    }
    return aliases;
  }, [nodeDisplayLabels, page.probes, pinAnnotations.nodes.posToNode]);
  const runLabels = useMemo(() => sweepRunLabelsFromDirectives(doc.directives), [doc.directives]);
  const measurementAxisUnit = axisUnitFromLabel(analysisXAxisLabel(doc.analysis));
  const measurementDirectives = useMemo(
    () => measurementDirectivesFromText(doc.directives),
    [doc.directives],
  );

  // Per-wire normalized current magnitude at playTime (driven by ngspice
  // savecurrents output). Used to modulate flow-animation speed and opacity.
  const wireCurrents = useMemo(() => {
    const out = new Map<string, number>();
    if (!simResult || !isTransient) return out;
    const scale = simResult.vectors.find((v) => v.is_scale);
    if (!scale) return out;
    const idx = findTimeIndex(scale.data, playTime);

    const componentCurrents = new Map<string, number>();
    for (const c of page.components) {
      const rd = pinAnnotations.refdes.get(c.id);
      if (!rd) continue;
      const rdL = rd.toLowerCase();
      const candidates = [
        `@${rdL}[i]`,
        `${rdL}#branch`,
        `@${rdL}[id]`,
        `i(${rdL})`,
      ];
      for (const name of candidates) {
        const v = findNamedTrace(simResult.vectors, [name], simResult.plot);
        if (v && idx < v.data.length) {
          componentCurrents.set(c.id, Math.abs(v.data[idx]));
          break;
        }
      }
    }

    let maxI = 1e-15;
    const raw = new Map<string, number>();
    for (const w of page.wires) {
      if (w.points.length === 0) continue;
      const [fx, fy] = w.points[0];
      let bestId: string | null = null;
      let bestD = 0.6;
      for (const c of page.components) {
        for (let i = 0; i < getPinLayout(c).length; i++) {
          const p = pinWorldPos(c, i);
          const d = Math.hypot(p.x - fx, p.y - fy);
          if (d < bestD) {
            bestD = d;
            bestId = c.id;
          }
        }
      }
      if (bestId) {
        const cur = componentCurrents.get(bestId) ?? 0;
        raw.set(w.id, cur);
        if (cur > maxI) maxI = cur;
      }
    }
    for (const [id, cur] of raw) out.set(id, cur / maxI);
    return out;
  }, [simResult, playTime, page.components, page.wires, pinAnnotations, isTransient]);

  const floatingPinMarkers = useMemo(() => {
    if (runFloatingPins.length === 0) return [];
    const byId = new Map(page.components.map((c) => [c.id, c]));
    return runFloatingPins.flatMap((fp) => {
      const component = byId.get(fp.componentId);
      if (!component || fp.pinIdx >= getPinLayout(component).length) return [];
      const position = pinWorldPos(component, fp.pinIdx);
      return [{ ...fp, position }];
    });
  }, [runFloatingPins, page.components]);

  const floatingComponentIds = useMemo(
    () => new Set(runFloatingPins.map((fp) => fp.componentId)),
    [runFloatingPins],
  );

  const disconnectedProbeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const probe of page.probes) {
      const node = pinAnnotations.nodes.posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`);
      if (!node) ids.add(probe.id);
    }
    return ids;
  }, [page.probes, pinAnnotations.nodes.posToNode]);
  const firstFloatingPinLabel = runFloatingPins[0]
    ? floatingPinSummary(runFloatingPins[0])
    : null;

  function selectFloatingPin(fp: FloatingPinDiagnostic) {
    setSelectedIds(new Set([fp.componentId]));
    setTool("select");
    const component = page.components.find((c) => c.id === fp.componentId);
    if (!component) return;
    const pin = pinWorldPos(component, fp.pinIdx);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPan({
      x: rect.width / 2 - pin.x * CELL * zoom,
      y: rect.height / 2 - pin.y * CELL * zoom,
    });
  }

  return (
    <>
    <div
      className={`editor-root${pagesCollapsed ? " pages-collapsed" : ""}${
        inspectorCollapsed ? " inspector-collapsed" : ""
      }`}
    >
      {/* On mobile the side panels become overlay drawers; this backdrop
         dismisses them on tap. Pointer events are toggled in CSS so the
         backdrop is inert at desktop widths and when both panels are
         collapsed. */}
      <div
        className="mobile-backdrop"
        aria-hidden="true"
        onClick={() => {
          setPagesCollapsed(true);
          setInspectorCollapsed(true);
        }}
      />
      {/* Sidebar always rendered so the grid-column transition can animate
         the collapse. When `pagesCollapsed`, the column goes to 0 and the
         aside is clipped via overflow:hidden — see styles.css. */}
      <aside className="side-nav" aria-hidden={pagesCollapsed}>
          {/* Sidebar toggle lives in the app titlebar — see App.tsx. */}

          {/* Top utility actions — Claude-style nav rows. */}
          <nav className="side-nav-actions">
            <button
              className="side-nav-action"
              onClick={createProject}
              title="New project"
              aria-label="New project"
            >
              <SideNavIcon kind="new" />
              <span>New project</span>
            </button>
          </nav>

          <div className="side-nav-section-head">
            <span>Projects</span>
            <button
              type="button"
              className="side-nav-add"
              onClick={createSubcircuitPage}
              title="Add subcircuit page"
              aria-label="Add subcircuit page"
            >
              +
            </button>
          </div>

          <div className="side-nav-projects">
            {workspace.projects.map((proj) => {
              const isActive = proj.id === workspace.active;
              const pages = isActive ? doc.pages : [];
              return (
                <div
                  key={proj.id}
                  className={`side-proj ${isActive ? "expanded" : ""}`}
                >
                  {isActive ? (
                    <div
                      className="side-proj-head active"
                      title={proj.name}
                      aria-current="true"
                    >
                      <SideNavIcon kind="folder" />
                      <input
                        className="side-proj-name-input"
                        value={proj.name}
                        onChange={(e) => renameProject(proj.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Project name"
                        spellCheck={false}
                      />
                      {workspace.projects.length > 1 && (
                        <button
                          type="button"
                          className="side-proj-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProject(proj.id);
                          }}
                          title="Delete this project"
                          aria-label={`Delete project ${proj.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="side-proj-head"
                      onClick={() => switchProject(proj.id)}
                      title={`Open project: ${proj.name}`}
                      aria-label={`Open project ${proj.name}`}
                    >
                      <SideNavIcon kind="folder" />
                      <span className="side-proj-name">{proj.name}</span>
                    </button>
                  )}
                  {pages.map((p, i) => {
                    const pageActive = p.id === doc.activePageId;
                    const isMain = i === 0;
                    return (
                      <div
                        key={p.id}
                        className={`side-page ${pageActive ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-current={pageActive ? "page" : undefined}
                        aria-label={isMain ? "Open main schematic" : `Open subcircuit ${p.name}`}
                        onClick={() =>
                          commit((d) => ({ ...d, activePageId: p.id }))
                        }
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          commit((d) => ({ ...d, activePageId: p.id }));
                        }}
                        title={
                          isMain
                            ? "Root schematic (emits main netlist)"
                            : `.subckt ${p.name}`
                        }
                      >
                        {pageActive && !isMain ? (
                          <input
                            className="side-page-input"
                            value={p.name}
                            onChange={(e) => {
                              const next = e.target.value.replace(
                                /[^A-Za-z0-9_]/g,
                                "_",
                              );
                              commit((d) => ({
                                ...d,
                                pages: d.pages.map((x) =>
                                  x.id === p.id ? { ...x, name: next } : x,
                                ),
                              }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            aria-label="Subcircuit name"
                          />
                        ) : (
                          <span className="side-page-name">
                            {isMain ? "Main schematic" : p.name}
                          </span>
                        )}
                        {i < 9 && (
                          <span className="side-page-shortcut">⌘{i + 1}</span>
                        )}
                        {!isMain && (
                          <button
                            type="button"
                            className="side-page-del"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm(`Delete subcircuit "${p.name}"?`))
                                return;
                              commit((d) => {
                                const remaining = d.pages.filter(
                                  (x) => x.id !== p.id,
                                );
                                return {
                                  ...d,
                                  pages: remaining,
                                  activePageId:
                                    d.activePageId === p.id
                                      ? remaining[0].id
                                      : d.activePageId,
                                };
                              });
                            }}
                            title="Delete subcircuit"
                            aria-label={`Delete subcircuit ${p.name}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="side-nav-section-head side-nav-examples-head">
            <span>Examples</span>
          </div>
          <div className="side-nav-examples">
            {DEMOS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="side-nav-example"
                onClick={() => loadDemo(d.id)}
                title={d.description}
              >
                {d.name}
              </button>
            ))}
          </div>
      </aside>

      <aside className="right-pane" aria-hidden={inspectorCollapsed}>
        <div className="sidebar-section">
          <div className="section-label">Project tools</div>
          <div className="panel-action-grid">
            <button type="button" onClick={() => setNetlistOpen(true)} title="Inspect generated SPICE netlist">
              <IconGlyph kind="netlist" />
              <span>Netlist</span>
            </button>
            <button type="button" onClick={() => setAnalysisOpen(true)} title="Open the full simulation settings dialog">
              <IconGlyph kind="settings" />
              <span>Settings</span>
            </button>
            <button type="button" onClick={() => void exportSchematicSvg()} title="Export schematic SVG">
              <IconGlyph kind="export" />
              <span>Export</span>
            </button>
            <button type="button" onClick={() => void copyShareLink()} title="Copy shareable circuit URL">
              <IconGlyph kind="share" />
              <span>Share</span>
            </button>
          </div>
          <button type="button" className="panel-clear-btn danger" onClick={clearDoc}>
            Clear schematic
          </button>
        </div>

        {selectedObjectCount > 0 && (
          <div className="sidebar-section">
            <div className="section-label">Inspector</div>
            <div className="inspector">
              {lastSelected ? (
                <>
                  <Row label="Type">
                    <span className="row-type-value">
                      <span className="mono">
                        {COMPONENT_LABELS[lastSelected.kind]}
                      </span>
                      <ComponentHelp kind={lastSelected.kind} />
                    </span>
                  </Row>
                  {selectedRefdes && (
                    <Row label="Reference">
                      <span className="component-ref-chip" title="SPICE reference designator">
                        {selectedRefdes}
                      </span>
                    </Row>
                  )}
                  {selectedRefdes &&
                    (lastSelected.kind === "V" || lastSelected.kind === "I") &&
                    (doc.analysis.kind === "dc" || doc.analysis.kind === "noise") && (
                      <Row label={doc.analysis.kind === "dc" ? "Sweep" : "Noise input"}>
                        {doc.analysis.src === selectedRefdes ? (
                          <span className="source-use-chip">
                            {doc.analysis.kind === "dc" ? "Current sweep source" : "Current input source"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="source-use-btn"
                            onClick={() => setSelectedSourceForSweep(selectedRefdes)}
                          >
                            Use {selectedRefdes}
                          </button>
                        )}
                      </Row>
                    )}
                  {selectedRefdes &&
                    (lastSelected.kind === "V" || lastSelected.kind === "I") &&
                    doc.analysis.kind === "ac" && (
                      <Row label="AC input">
                        {isAcStimulus(lastSelected.value) ? (
                          <span className="source-use-chip">AC stimulus</span>
                        ) : (
                          <button
                            type="button"
                            className="source-use-btn"
                            onClick={() => setSelectedSourceForAcStimulus(lastSelected.id)}
                          >
                            Set AC 1
                          </button>
                        )}
                      </Row>
                    )}
                  <Row label="Position">
                    <div className="xy-inputs">
                      <label>
                        <span>X</span>
                        <CoordinateField
                          value={lastSelected.x}
                          step={snapToGrid ? 1 : 0.1}
                          onCommit={(value) =>
                            updateComponentPosition(lastSelected.id, "x", value)
                          }
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <CoordinateField
                          value={lastSelected.y}
                          step={snapToGrid ? 1 : 0.1}
                          onCommit={(value) =>
                            updateComponentPosition(lastSelected.id, "y", value)
                          }
                        />
                      </label>
                    </div>
                  </Row>
                  {(lastSelected.kind === "V" || lastSelected.kind === "I") && (
                    <SourceEditor
                      value={lastSelected.value}
                      sourceKind={lastSelected.kind}
                      onChange={(next) => updateValue(lastSelected.id, next)}
                    />
                  )}
                  {lastSelected.kind !== "GND" &&
                    lastSelected.kind !== "V" &&
                    lastSelected.kind !== "I" && (
                      <Row label={lastSelected.kind === "B" ? "Expression" : isModelKind(lastSelected.kind) ? "Model" : "Value"}>
                        <input
                          className="value-input"
                          value={lastSelected.value}
                          onChange={(e) => updateValue(lastSelected.id, e.target.value)}
                          placeholder={lastSelected.kind === "B" ? "V=sin(2*pi*1k*time)" : undefined}
                        />
                      </Row>
                    )}
                  {(lastSelected.kind === "NMOS" || lastSelected.kind === "PMOS") && (
                    <>
                      <Row label="W">
                        <input
                          className="value-input"
                          value={lastSelected.params?.W ?? "10u"}
                          onChange={(e) =>
                            updateParam(lastSelected.id, "W", e.target.value)
                          }
                          placeholder="10u"
                        />
                      </Row>
                      <Row label="L">
                        <input
                          className="value-input"
                          value={lastSelected.params?.L ?? "1u"}
                          onChange={(e) =>
                            updateParam(lastSelected.id, "L", e.target.value)
                          }
                          placeholder="1u"
                        />
                      </Row>
                    </>
                  )}
                  {(lastSelected.kind === "NPN" || lastSelected.kind === "PNP") && (
                    <Row label="Area">
                      <input
                        className="value-input"
                        value={lastSelected.params?.area ?? ""}
                        onChange={(e) =>
                          updateParam(lastSelected.id, "area", e.target.value)
                        }
                        placeholder="1 (optional emitter area multiplier)"
                      />
                    </Row>
                  )}
                  <Row label="Rotation">
                    <span className="mono">{lastSelected.rotation}°</span>
                  </Row>
                </>
              ) : lastSelectedWire ? (
                <>
                  <Row label="Type">
                    <span className="mono">Wire</span>
                  </Row>
                  <Row label="Points">
                    <span className="mono">{lastSelectedWire.points.length}</span>
                  </Row>
                  <Row label="Start">
                    <span className="mono">
                      ({formatCoord(lastSelectedWire.points[0]?.[0] ?? 0)},{" "}
                      {formatCoord(lastSelectedWire.points[0]?.[1] ?? 0)})
                    </span>
                  </Row>
                  <Row label="End">
                    <span className="mono">
                      ({formatCoord(lastSelectedWire.points[lastSelectedWire.points.length - 1]?.[0] ?? 0)},{" "}
                      {formatCoord(lastSelectedWire.points[lastSelectedWire.points.length - 1]?.[1] ?? 0)})
                    </span>
                  </Row>
                </>
              ) : lastSelectedProbe ? (
                <>
                  <Row label="Type">
                    <span className="mono">Probe</span>
                  </Row>
                  <Row label="Position">
                    <div className="xy-inputs">
                      <label>
                        <span>X</span>
                        <CoordinateField
                          value={lastSelectedProbe.x}
                          step={snapToGrid ? 1 : 0.1}
                          onCommit={(value) =>
                            updateProbePosition(lastSelectedProbe.id, "x", value)
                          }
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <CoordinateField
                          value={lastSelectedProbe.y}
                          step={snapToGrid ? 1 : 0.1}
                          onCommit={(value) =>
                            updateProbePosition(lastSelectedProbe.id, "y", value)
                          }
                        />
                      </label>
                    </div>
                  </Row>
                  <Row label="Label">
                    <div className="probe-label-editor">
                      <input
                        className="value-input"
                        value={lastSelectedProbe.label ?? ""}
                        onChange={(e) =>
                          updateProbeLabel(lastSelectedProbe.id, e.target.value)
                        }
                        placeholder="Optional display label"
                      />
                      <div className="probe-label-chips" role="group" aria-label="Probe label presets">
                        {["Vin", "Vout", "Gate"].map((label) => (
                          <button
                            key={label}
                            type="button"
                            className="probe-label-chip"
                            onClick={() => updateProbeLabel(lastSelectedProbe.id, label)}
                          >
                            {label}
                          </button>
                        ))}
                        {lastSelectedProbeNode && lastSelectedProbeNode !== "0" && (
                          <button
                            type="button"
                            className="probe-label-chip"
                            onClick={() => updateProbeLabel(lastSelectedProbe.id, lastSelectedProbeNode)}
                          >
                            Use node
                          </button>
                        )}
                      </div>
                    </div>
                  </Row>
                  <Row label="Node">
                    <span className="mono">
                      {lastSelectedProbeNode ?? "unresolved"}
                    </span>
                  </Row>
                  <Row label="Scope">
                    <button
                      type="button"
                      onClick={() => resetProbeScopeOffset(lastSelectedProbe.id)}
                      disabled={
                        lastSelectedProbe.scopeDx === undefined &&
                        lastSelectedProbe.scopeDy === undefined
                      }
                    >
                      Reset placement
                    </button>
                  </Row>
                </>
              ) : null}
              <div className="inspector-actions">
                {selectedList.length > 0 && <button onClick={() => rotateSelected()}>Rotate</button>}
                <button onClick={duplicateSelection}>Duplicate</button>
                <button onClick={deleteSelected} className="danger">
                  Delete
                </button>
              </div>
              {selectedObjectCount > 1 && (
                <div className="multi-hint">
                  {selectionSummary(
                    selectedList.length,
                    selectedWireList.length,
                    selectedProbeList.length,
                  )} selected · actions apply to all
                </div>
              )}
            </div>
          </div>
        )}

        <div className="sidebar-section">
          <div className="section-label">Simulation settings</div>
          <SimSettingsPanel
            analysis={doc.analysis}
            settings={doc.simSettings}
            sweepableSources={sweepableSources}
            sourceLabels={sourceLabels}
            onAnalysis={(a) => commit((d) => ({ ...d, analysis: a }))}
            onSettings={(s) => commit((d) => ({ ...d, simSettings: s }))}
          />
        </div>

        <div className="sidebar-section">
          <div className="section-label">Models & measurements</div>
          <DirectivesPanel
            value={doc.directives}
            onChange={(next) =>
              commit((d) => ({ ...d, directives: next }))
            }
          />
          {(() => {
            const subs = detectSubckts(doc.directives);
            if (subs.length === 0) return null;
            return (
              <div className="subckt-list">
                <div className="subckt-list-head">Detected subcircuits</div>
                {subs.map((s) => (
                  <div key={s.name} className="subckt-chip" title={`pins: ${s.pins.join(", ")}`}>
                    <code>{s.name}</code>
                    <span>({s.pins.length} pins)</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {simResult?.measurements && simResult.measurements.length > 0 && (
          <div className="sidebar-section">
            <div className="section-label">.meas results</div>
            <div className="meas-list">
              {simResult.measurements.map((m, i) => (
                <div key={i} className="meas-row" title={m.raw}>
                  <span className="meas-name">{m.name}</span>
                  <span className="meas-value">
                    {formatMeasurementResultValue(
                      m,
                      measurementDirectives.get(m.name.toLowerCase()),
                      measurementAxisUnit,
                    )}
                  </span>
                  {m.at !== null && (
                    <span className="meas-at">@ {formatMeasurementAxisValue(m.at, measurementAxisUnit)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {runWarnings.length > 0 && (
          <div className="sidebar-section">
            <div className="section-label">Netlist warnings</div>
            <div className="run-warning-list">
              {runWarnings.map((warning, i) => (
                (() => {
                  const fp = runFloatingPins.find((pin) =>
                    warning.includes(`${pin.refdes} ${pin.pinLabel ? `${pin.pinLabel} pin` : `pin ${pin.pinIdx + 1}`}`),
                  );
                  if (!fp) {
                    return (
                      <div key={`${warning}-${i}`} className="run-warning-row">
                        {warning}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={`${warning}-${i}`}
                      type="button"
                      className="run-warning-row clickable"
                      onClick={() => selectFloatingPin(fp)}
                    >
                      <span>{warning}</span>
                      <span className="run-warning-action">Show pin</span>
                    </button>
                  );
                })()
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-spacer" />

        <div className="sidebar-section status">
          <div className="section-label">Engine</div>
          <div className="status-line">{engineName || "probing…"}</div>
          <button
            className="reprobe-btn"
            onClick={() => {
              void probeEngine(true);
            }}
          >
            Refresh
          </button>
        </div>
      </aside>

      <main className="canvas-area">
        <div className="toolbar" role="toolbar" aria-label="Main toolbar">
          {!IS_TAURI && (
            <button
              className={`tb-icon-btn tb-pane-toggle ${pagesCollapsed ? "collapsed" : ""}`}
              onClick={() => setPagesCollapsed((c) => !c)}
              aria-pressed={!pagesCollapsed}
              title={pagesCollapsed ? "Show sidebar (⌘\\)" : "Hide sidebar (⌘\\)"}
              aria-label="Toggle sidebar"
            >
              <svg width={17} height={17} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="2.75" width="13" height="10.5" rx="1.5" />
                <path d="M5.75 2.75v10.5" />
              </svg>
            </button>
          )}
          <div className="tb-group" role="group" aria-label="File actions">
            <button
              className="tb-icon-btn"
              onClick={() => handleMenu("file:new")}
              title="New (⌘N)"
              aria-label="New"
            >
              <IconGlyph kind="new" />
            </button>
            <button
              className="tb-icon-btn"
              onClick={() => handleMenu("file:open")}
              title="Open (⌘O)"
              aria-label="Open"
            >
              <IconGlyph kind="open" />
            </button>
            <button
              className="tb-icon-btn"
              onClick={() => handleMenu("file:save")}
              title="Save (⌘S)"
              aria-label="Save"
            >
              <IconGlyph kind="save" />
            </button>
          </div>
          <div className="tb-sep" />
          <div className="tb-group" role="group" aria-label="Edit history">
            <button
              className="tb-icon-btn"
              onClick={undo}
              disabled={past.length === 0}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              <IconGlyph kind="undo" />
            </button>
            <button
              className="tb-icon-btn"
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
            >
              <IconGlyph kind="redo" />
            </button>
          </div>
          <div className="tb-sep" />
          <button
            className={`tb-run ${running ? "running" : ""}`}
            onClick={runSimulation}
            disabled={runDisabled}
            title={runTitle}
            aria-label={engineOk === false ? "Simulation engine unavailable" : running ? "Running simulation" : "Run simulation"}
          >
            {running ? (
              <span className="tb-run-spinner" />
            ) : (
              <IconGlyph kind="play" />
            )}
            <span>{engineOk === false ? "Unavailable" : running ? "Running…" : "Run"}</span>
          </button>
          <div className="tb-sep" />
          <div className="tb-group tb-analyses" role="group" aria-label="Analysis type">
            {(
              [
                {
                  kind: "tran",
                  label: "Tran",
                  name: "Transient",
                  desc: "Solve voltages and currents over time. Use for step responses, ringing, oscillation — any time-domain behavior.",
                },
                {
                  kind: "ac",
                  label: "AC",
                  name: "AC sweep",
                  desc: "Small-signal frequency response. Plots gain and phase versus frequency for filters, amplifiers, and impedance.",
                },
                {
                  kind: "dc",
                  label: "DC",
                  name: "DC sweep",
                  desc: "Vary a source value and plot the steady-state response. Useful for IV curves and transfer characteristics.",
                },
                {
                  kind: "op",
                  label: "OP",
                  name: "Operating point",
                  desc: "Single steady-state DC solution. Shows node voltages and branch currents with no time variation.",
                },
              ] as const
            ).map((a) => {
              const tipId = `tb-pill-tip-${a.kind}`;
              return (
                <button
                  key={a.kind}
                  className={`tb-pill ${doc.analysis.kind === a.kind ? "active" : ""}`}
                  onClick={() => switchAnalysis(a.kind)}
                  title={`${a.name} analysis`}
                  aria-label={`${a.name} analysis`}
                  aria-pressed={doc.analysis.kind === a.kind}
                  aria-describedby={tipId}
                >
                  {a.label}
                  <span id={tipId} className="tool-tip" role="tooltip">
                    <span className="tool-tip-head">
                      <span className="tool-tip-name">{a.name}</span>
                    </span>
                    <span className="tool-tip-desc">{a.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="tb-title">
            <span className="tb-title-icon">
              <IconGlyph kind="page" />
            </span>
            <span className="tb-title-text">{filePath ? trimPath(filePath) : "Untitled circuit"}</span>
            <span className="tb-title-chevron">▾</span>
          </div>

          <label
            className={`tb-auto ${autoRunPaused ? "paused" : ""}`}
            title={
              autoRunPaused
                ? "Auto-run is paused while a drawing tool is active. Press Run or switch to Select to resume."
                : "Re-run automatically when the circuit changes"
            }
          >
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(e) => setAutoRun(e.target.checked)}
              aria-label="Auto-run simulation"
            />
            <span>{autoRunPaused ? "Auto-run paused" : "Auto-run"}</span>
          </label>
          {!IS_TAURI && (
            <button
              className={`tb-icon-btn tb-pane-toggle ${inspectorCollapsed ? "collapsed" : ""}`}
              onClick={() => setInspectorCollapsed((c) => !c)}
              aria-pressed={!inspectorCollapsed}
              title={inspectorCollapsed ? "Show inspector (⇧⌘\\)" : "Hide inspector (⇧⌘\\)"}
              aria-label="Toggle inspector"
            >
              <svg width={17} height={17} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="2.75" width="13" height="10.5" rx="1.5" />
                <path d="M10.25 2.75v10.5" />
              </svg>
            </button>
          )}
        </div>
        <div className="canvas-wrap" tabIndex={-1}>
        {(canvasNotice || disconnectedProbeIds.size > 0 || runFloatingPins.length > 0) && (
          <div className="canvas-issue-banner" role="status" aria-live="polite">
            {canvasNotice && (
              <span className="canvas-issue-item">
                <span className="canvas-issue-label">{canvasNotice}</span>
              </span>
            )}
            {(disconnectedProbeIds.size > 0 || runFloatingPins.length > 0) && (
              <>
                {disconnectedProbeIds.size > 0 && (
                  <span className="canvas-issue-item">
                    <span className="canvas-issue-label">
                      {disconnectedProbeIds.size} probe{disconnectedProbeIds.size === 1 ? "" : "s"} not connected
                    </span>
                    <button
                      type="button"
                      className="canvas-issue-action"
                      aria-label={`Remove ${disconnectedProbeIds.size} disconnected probe${disconnectedProbeIds.size === 1 ? "" : "s"}`}
                      onClick={removeDisconnectedProbes}
                    >
                      Remove
                    </button>
                  </span>
                )}
                {runFloatingPins.length > 0 && (
                  <span className="canvas-issue-item">
                    <span className="canvas-issue-label">
                      {runFloatingPins.length === 1
                        ? `${firstFloatingPinLabel} floating`
                        : `${runFloatingPins.length} floating pins - first: ${firstFloatingPinLabel}`}
                    </span>
                    <button
                      type="button"
                      className="canvas-issue-action"
                      aria-label={`Show ${firstFloatingPinLabel}`}
                      onClick={() => selectFloatingPin(runFloatingPins[0])}
                    >
                      Show pin
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {page.components.length === 0 && page.wires.length === 0 && tool === "select" && (
          <div className="empty-canvas">
            <div className="empty-canvas-card">
              <div className="empty-canvas-title">Schematic is empty</div>
              <div className="empty-canvas-hint">
                Pick a tool from the strip on the left and click in the
                canvas, or load one of the examples below.
              </div>
              <div className="empty-canvas-demos">
                {DEMOS.map((d) => (
                  <button
                    key={d.id}
                    className="empty-canvas-demo"
                    onClick={() => loadDemo(d.id)}
                    title={d.description}
                  >
                    <span className="empty-canvas-demo-name">{d.name}</span>
                    <span className="empty-canvas-demo-hint">{d.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <aside className="tool-strip" role="toolbar" aria-label="Drawing tools">
          {PALETTE_SECTIONS.flatMap((sec, sIdx) => [
            sIdx > 0 ? <div key={`sep-${sec.label}`} className="tool-sep" /> : null,
            ...sec.items
              .filter((p) => p.tool !== "PNP" && p.tool !== "PMOS")
              .map((p) => {
                const isBJT = p.tool === "NPN";
                const isMOS = p.tool === "NMOS";
                const grouped = isBJT || isMOS;
                const activeKind = isBJT ? bjtVariant : isMOS ? mosVariant : (p.kind ?? null);
                const activeDesc = activeKind ? toolDescriptionFor(activeKind as ComponentKind, p.desc) : p.desc;
                const otherKind = isBJT
                  ? bjtVariant === "NPN" ? "PNP" : "NPN"
                  : isMOS
                    ? mosVariant === "NMOS" ? "PMOS" : "NMOS"
                    : null;
                const isActive =
                  (activeKind ? tool === (activeKind as Tool) : tool === p.tool) ||
                  (isBJT && (tool === "NPN" || tool === "PNP")) ||
                  (isMOS && (tool === "NMOS" || tool === "PMOS"));
                const tooltipId = `tool-tip-${p.tool}`;
                return (
                  <button
                    key={p.tool}
                    className={`tool-icon ${isActive ? "active" : ""}`}
                    onClick={(e) => {
                      if (grouped && e.shiftKey && otherKind) {
                        selectTool(otherKind as Tool);
                      } else {
                        selectTool((activeKind ?? p.tool) as Tool);
                      }
                    }}
                    onContextMenu={(e) => {
                      if (!grouped || !otherKind) return;
                      e.preventDefault();
                      selectTool(otherKind as Tool);
                    }}
                    aria-label={
                      grouped
                        ? `${COMPONENT_LABELS[activeKind as ComponentKind]}, shift-click for ${otherKind}`
                        : p.name
                    }
                    aria-pressed={isActive}
                    aria-keyshortcuts={p.hint}
                    aria-describedby={tooltipId}
                    title={
                      grouped && otherKind
                        ? `${COMPONENT_LABELS[activeKind as ComponentKind]} (${p.hint ?? ""}); shift-click or right-click for ${otherKind}`
                        : `${p.name}${p.hint ? ` (${p.hint})` : ""}`
                    }
                  >
                    {activeKind ? (
                      <PaletteGlyph kind={activeKind as ComponentKind} />
                    ) : (
                      <ToolIcon tool={p.tool} />
                    )}
                    {p.hint && <span className="tool-hint">{p.hint}</span>}
                    {grouped && <span className="tool-variant-mark">▾</span>}
                    <span id={tooltipId} className="tool-tip" role="tooltip">
                      <span className="tool-tip-head">
                        <span className="tool-tip-name">
                          {grouped
                            ? COMPONENT_LABELS[activeKind as ComponentKind]
                            : p.name}
                        </span>
                        {p.hint && (
                          <kbd className="tool-tip-key">{p.hint}</kbd>
                        )}
                      </span>
                      {activeDesc && (
                        <span className="tool-tip-desc">{activeDesc}</span>
                      )}
                      {grouped && otherKind && (
                        <span className="tool-tip-aux">
                          Shift-click for {otherKind}
                        </span>
                      )}
                    </span>
                  </button>
                );
              }),
          ]).filter(Boolean)}
        </aside>

        <svg
          ref={svgRef}
          className={`canvas ${
            panning
              ? "is-panning"
              : tool === "pan"
                ? "is-pan-tool"
                : tool === "select"
                  ? "is-selecting"
                  : "is-placing"
          }`}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerLeave}
          onDoubleClick={onCanvasDoubleClick}
          onContextMenu={onCanvasContextMenu}
        >
          <defs>
            <pattern
              id="grid"
              x={pan.x}
              y={pan.y}
              width={CELL * zoom}
              height={CELL * zoom}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${CELL * zoom} 0 L 0 0 0 ${CELL * zoom}`}
                fill="none"
                stroke="var(--grid-dot)"
                strokeWidth={1}
              />
            </pattern>
            <pattern
              id="major-grid"
              x={pan.x}
              y={pan.y}
              width={CELL * zoom * 5}
              height={CELL * zoom * 5}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${CELL * zoom * 5} 0 L 0 0 0 ${CELL * zoom * 5}`}
                fill="none"
                stroke="var(--grid-major)"
                strokeWidth={1}
              />
            </pattern>
          </defs>
          {gridVisible && (
            <>
              <rect className="grid-layer" width="100%" height="100%" fill="url(#grid)" />
              <rect
                className="grid-layer major"
                width="100%"
                height="100%"
                fill="url(#major-grid)"
                opacity={zoom > 0.45 ? 1 : 0}
              />
            </>
          )}

          <g transform={`translate(${pan.x} ${pan.y}) scale(${CELL * zoom})`}>
            {gridVisible && (
              <>
                <line x1={-10000} y1={0} x2={10000} y2={0} className="canvas-axis" />
                <line x1={0} y1={-10000} x2={0} y2={10000} className="canvas-axis" />
              </>
            )}
            {page.wires.map((w) => {
              const sel = selectedIds.has(w.id);
              const hovered = hoverId === w.id;
              const cur = wireCurrents.get(w.id) ?? 0;
              const flowStyle: React.CSSProperties | undefined = liveActive
                ? ({
                    opacity: 0.3 + 0.7 * cur,
                    "--flow-duration": `${Math.max(0.12, 0.9 - 0.78 * cur)}s`,
                  } as React.CSSProperties)
                : undefined;
              return (
                <g key={w.id} className={`wire-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}>
                  <polyline
                    points={w.points.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="var(--ink)"
                    opacity={0.001}
                    strokeWidth={0.72}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="all"
                    className="wire-hit-target"
                    data-wire-id={w.id}
                  />
                  <polyline
                    points={w.points.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke={sel || hovered ? "var(--accent)" : liveActive ? "var(--accent)" : "var(--ink)"}
                    strokeWidth={
                      sel
                        ? selectedSchematicStrokeWidth
                        : hovered
                          ? hoveredSchematicStrokeWidth
                          : schematicStrokeWidth
                    }
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={liveActive ? "wire-live" : undefined}
                    data-wire-id={w.id}
                    style={flowStyle}
                  />
                </g>
              );
            })}

            {wireJunctionDots.map((point) => (
              <circle
                key={`${point.x},${point.y}`}
                cx={point.x}
                cy={point.y}
                r={0.18}
                className="wire-junction-dot"
              />
            ))}

            {wireDraft && cursor && (() => {
              const last = wireDraft[wireDraft.length - 1];
              const tip = snapTarget ?? cursor;
              const preview = [
                ...wireDraft,
                ...routeWireSegment(
                  { x: last[0], y: last[1] },
                  tip,
                  snapToGrid,
                ).slice(1),
              ];
              return (
                <>
                  <polyline
                    points={preview.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={0.12}
                    strokeDasharray="0.3 0.2"
                  />
                  {(() => {
                    const measurement = draftMeasurement(preview.map(([x, y]) => ({ x, y })));
                    if (!measurement) return null;
                    return (
                      <g className="draft-measure" transform={`translate(${measurement.x} ${measurement.y})`}>
                        <rect
                          x={-measurement.width / 2}
                          y={-0.32}
                          width={measurement.width}
                          height={0.54}
                          rx={0.14}
                        />
                        <text x={0} y={0.08} textAnchor="middle">
                          {measurement.label}
                        </text>
                      </g>
                    );
                  })()}
                </>
              );
            })()}

            {(tool === "wire" ||
              isSinglePinSnappingTool(tool) ||
              wireDraft ||
              wireGesture ||
              wireDrag ||
              placementDraft) && snapTarget && (
              <g pointerEvents="none">
                <circle
                  cx={snapTarget.x}
                  cy={snapTarget.y}
                  r={0.35}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={0.08}
                />
                <circle
                  cx={snapTarget.x}
                  cy={snapTarget.y}
                  r={0.16}
                  fill="var(--accent)"
                />
              </g>
            )}

            {placementDraft && (() => {
              const draft = componentFromTerminals(
                placementDraft.kind,
                placementDraft.start,
                placementDraft.end,
                "__placement",
              );
              const pins = getPinLayout(draft).map((_, idx) => pinWorldPos(draft, idx));
              const endpointLabels = twoTerminalPinLabels(draft.kind);
              const cutSpan = placementWireCutSpan(draft, placementDraft.start, placementDraft.end);
              const inlineInsertion =
                cutWireSegmentBetweenPoints(
                  page.wires,
                  [cutSpan.start.x, cutSpan.start.y],
                  [cutSpan.end.x, cutSpan.end.y],
                  () => "__preview-cut",
                ) !== page.wires;
              const stubs = placementConnectionWires(
                draft,
                placementDraft.start,
                placementDraft.end,
                snapToGrid,
                inlineInsertion,
                () => "__stub",
              );
              const target = placementDraft.end;
              const measurement = draftMeasurement(pins);
              return (
                <g className="placement-draft" pointerEvents="none">
                  <line
                    x1={placementDraft.start.x}
                    y1={placementDraft.start.y}
                    x2={target.x}
                    y2={target.y}
                    className="placement-draft-guide"
                  />
                  <line
                    x1={pins[0].x}
                    y1={pins[0].y}
                    x2={pins[1].x}
                    y2={pins[1].y}
                    className="placement-draft-axis"
                  />
                  {stubs.map((stub, idx) => (
                    <polyline
                      key={idx}
                      points={stub.points.map((p) => p.join(",")).join(" ")}
                      className="placement-draft-stub"
                    />
                  ))}
                  <g transform={`translate(${draft.x} ${draft.y}) rotate(${draft.rotation})`}>
                    <ComponentGlyph kind={draft.kind} selected strokeWidth={selectedSchematicStrokeWidth} />
                    {getPinLayout(draft).map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={0.2}
                        fill="var(--accent)"
                      />
                    ))}
                  </g>
                  <circle
                    cx={pins[0].x}
                    cy={pins[0].y}
                    r={0.34}
                    className="placement-draft-endpoint"
                  />
                  <circle
                    cx={pins[1].x}
                    cy={pins[1].y}
                    r={0.34}
                    className="placement-draft-endpoint"
                  />
                  {endpointLabels.map((label, idx) => {
                    const pin = pins[idx];
                    const other = pins[idx === 0 ? 1 : 0];
                    const awayX = pin.x - other.x;
                    const awayY = pin.y - other.y;
                    const horizontal = Math.abs(awayX) >= Math.abs(awayY);
                    const x = pin.x + (horizontal ? (awayX >= 0 ? 0.48 : -0.48) : 0);
                    const y = pin.y + (horizontal ? 0 : awayY >= 0 ? 0.56 : -0.56);
                    const chipW = Math.max(0.52, label.length * 0.24 + 0.34);
                    return (
                      <g key={`${label}-${idx}`} className="placement-draft-label">
                        <rect
                          x={x - chipW / 2}
                          y={y - 0.25}
                          width={chipW}
                          height={0.48}
                          rx={0.13}
                        />
                        <text x={x} y={y + 0.15} textAnchor="middle">
                          {label}
                        </text>
                      </g>
                    );
                  })}
                  {measurement && (
                    <g className="draft-measure" transform={`translate(${measurement.x} ${measurement.y})`}>
                      <rect
                        x={-measurement.width / 2}
                        y={-0.32}
                        width={measurement.width}
                        height={0.54}
                        rx={0.14}
                      />
                      <text x={0} y={0.08} textAnchor="middle">
                        {measurement.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}

            {page.components.map((c) => {
              if (c.kind === "LABEL") {
                const label = c.value.trim();
                const layout = label
                  ? netLabelLayoutMap.get(c.id) ?? netLabelLayout(c, page, label)
                  : null;
                const sel = selectedIds.has(c.id);
                const hovered = hoverId === c.id;
                return (
                  <g
                    key={c.id}
                    data-component-id={c.id}
                    className={`component-group net-label-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}
                  >
                    {layout ? (
                      <>
                        <line
                          x1={c.x}
                          y1={c.y}
                          x2={layout.stemX2}
                          y2={layout.stemY2}
                          className="net-label-stem-hit"
                        />
                        <rect
                          x={layout.chipX}
                          y={layout.chipY}
                          width={layout.chipW}
                          height={layout.chipH}
                          rx={0.18}
                          className="component-hit-target"
                        />
                      </>
                    ) : (
                      <rect
                        x={c.x - 0.28}
                        y={c.y - 0.28}
                        width={0.96}
                        height={0.56}
                        className="component-hit-target"
                      />
                    )}
                    <line
                      x1={c.x}
                      y1={c.y}
                      x2={layout ? layout.stemX2 : c.x + 0.68}
                      y2={layout ? layout.stemY2 : c.y}
                      className="net-label-stem"
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={0.32}
                      className="net-label-anchor-hit"
                      data-connection-handle="true"
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={0.18}
                      fill="var(--pin)"
                      data-connection-handle="true"
                    />
                    {layout && (
                      <>
                        <rect
                          x={layout.chipX}
                          y={layout.chipY}
                          width={layout.chipW}
                          height={layout.chipH}
                          rx={0.18}
                          className={`net-label-chip ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}
                        />
                        <text
                          x={layout.textX}
                          y={layout.textY}
                          fontSize={0.46}
                          textAnchor="middle"
                          className="net-label-text"
                        >
                          {label}
                        </text>
                      </>
                    )}
                  </g>
                );
              }
              const sel = selectedIds.has(c.id);
              const hovered = hoverId === c.id;
              const floating = floatingComponentIds.has(c.id);
              const bounds = componentVisualBoundsFor(c, 0.16);
              const connectionToolActive = tool === "wire" || tool === "probe";
              const activeConnectionGesture = Boolean(wireDraft) || Boolean(wireGesture);
              const activeDevice = isActiveMultiPinKind(c.kind);
              const terminalTone =
                c.kind === "GND"
                  ? "hidden"
                  : pinTargetTone({
                      connectionGestureActive: activeConnectionGesture,
                      connectionToolActive,
                      hovered,
                      selected: sel,
                      selectToolActive: tool === "select",
                    });
              const showPinTargets = terminalTone !== "hidden";
              const pinHints = activeDevice && activeConnectionGesture && (sel || hovered) ? pinHintsFor(c) : [];
              return (
                <g
                  key={c.id}
                  data-component-id={c.id}
                  className={`component-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""} ${floating ? "floating" : ""}`}
                >
                  <rect
                    x={bounds.x1}
                    y={bounds.y1}
                    width={bounds.x2 - bounds.x1}
                    height={bounds.y2 - bounds.y1}
                    rx={0.35}
                    className="component-hit-target"
                  />
                  {floating && (
                    <rect
                      x={bounds.x1}
                      y={bounds.y1}
                      width={bounds.x2 - bounds.x1}
                      height={bounds.y2 - bounds.y1}
                      rx={0.35}
                      className="component-floating"
                    />
                  )}
                  <g transform={`translate(${c.x} ${c.y}) rotate(${c.rotation})`}>
                    <ComponentGlyph
                      kind={c.kind}
                      selected={sel}
                      strokeWidth={sel ? selectedSchematicStrokeWidth : schematicStrokeWidth}
                      subxPins={c.kind === "SUBX" ? getPinLayout(c) : undefined}
                      subxLabel={c.kind === "SUBX" ? (c.value || "X") : undefined}
                    />
                    {getPinLayout(c).map((p, i) => (
                      <g key={i}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={0.24}
                          className="component-pin-hit"
                          data-connection-handle="true"
                        />
                        {showPinTargets && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={0.36}
                            className={`pin-target-ring ${terminalTone}`}
                            data-connection-handle="true"
                          />
                        )}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={showPinTargets ? 0.22 : 0.18}
                          className={`component-pin ${sel ? "selected" : ""}`}
                          data-connection-handle="true"
                        />
                      </g>
                    ))}
                  </g>
                  {pinHints.map(({ label, position, anchor, dx, dy }) => {
                    const x = position.x + dx;
                    const y = position.y + dy;
                    return (
                      <g key={`${c.id}-${label}-${position.x}-${position.y}`} className="pin-hint" pointerEvents="none">
                        <text
                          x={x}
                          y={y + 0.13}
                          textAnchor={anchor}
                          className="pin-hint-text"
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                  {(() => {
                    const valueLabel = canvasValueLabel(c.kind, c.value);
                    if (!valueLabel) return null;
                    const off = componentValueLabelOffsets.get(c.id) ?? { x: 0, y: 1.45, anchor: "middle" as const };
                    const labelX = c.x + off.x;
                    const labelY = c.y + off.y;
                    return (
                      <g className="component-value-label" pointerEvents="none">
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor={off.anchor}
                          className="component-value-text"
                          fontSize={canvasValueFontSize}
                        >
                          {valueLabel}
                        </text>
                      </g>
                    );
                  })()}
	                </g>
	              );
	            })}

            {page.wires.map((w) => {
              const sel = selectedIds.has(w.id);
              const hovered = hoverId === w.id;
              const showHandles = tool === "select" && (sel || hovered || wireDrag?.wireId === w.id);
              if (!showHandles) return null;
              return (
                <g key={`wire-handles-${w.id}`} className={`wire-handle-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}>
                  {w.points.map(([px, py], idx) => {
                    const isEnd = idx === 0 || idx === w.points.length - 1;
                    return (
                      <circle
                        key={idx}
                        cx={px}
                        cy={py}
                        r={isEnd ? 0.18 : 0.13}
                        fill="var(--bg-canvas)"
                        stroke={sel ? "var(--accent)" : "var(--ink-muted)"}
                        strokeWidth={0.05}
                        className="wire-vertex"
                        data-wire-id={w.id}
                        data-wire-point-idx={idx}
                      />
                    );
                  })}
                </g>
              );
            })}

            {floatingPinMarkers.map(({ componentId, pinIdx, pinLabel, refdes, node, position }) => (
              <g
                key={`${componentId}-${pinIdx}-${node}`}
                className="floating-pin-marker"
                pointerEvents="none"
              >
                <title>{`${refdes} ${pinLabel ? `${pinLabel} pin` : `pin ${pinIdx + 1}`} is floating (${node})`}</title>
                <circle cx={position.x} cy={position.y} r={0.42} className="floating-pin-ring" />
                <circle cx={position.x} cy={position.y} r={0.16} className="floating-pin-dot" />
                <text x={position.x + 0.34} y={position.y - 0.34} className="floating-pin-text">
                  !
                </text>
              </g>
            ))}

            {liveReadings && doc.analysis.kind === "op" && simResult?.plot.startsWith("op") && (
              <NodeReadingsOverlay
                page={page}
                netlist={pinAnnotations}
                readings={liveReadings}
                showAllNodes
              />
            )}

            {visibleProbeScopes.map(({ probe, node, label, scale, trace, placement }) => {
              const { dx: scopeDx, dy: scopeDy } = placement;
              const scopeX = probe.x + scopeDx;
              const scopeY = probe.y + scopeDy;
              const leaderX = Math.min(scopeX + SCOPE_WIDTH, Math.max(scopeX, probe.x));
              const leaderY = Math.min(scopeY + SCOPE_HEIGHT, Math.max(scopeY, probe.y));
              return (
              <g
                key={`scope-${probe.id}`}
                className="probe-scope"
                data-probe-scope-id={probe.id}
                pointerEvents={tool === "select" ? "all" : "none"}
              >
                <line
                  x1={probe.x}
                  y1={probe.y}
                  x2={leaderX}
                  y2={leaderY}
                  className="probe-scope-leader"
                  pointerEvents="none"
                />
                <MiniScope
                  x={scopeX}
                  y={scopeY}
                  width={SCOPE_WIDTH}
                  height={SCOPE_HEIGHT}
                  color={probe.color}
                  label={label}
                  scale={scale}
                  trace={trace}
                  emptyMessage={node ? "press Run" : "not connected"}
                  playTime={isTransient ? playTime : null}
                />
              </g>
              );
            })}

            {page.probes.map((p) => {
              const node = pinAnnotations.nodes.posToNode.get(
                `${coordKey(p.x)},${coordKey(p.y)}`,
              );
              const disconnected = !node;
              const label = p.label?.trim() ?? "";
              const badgeW = Math.max(2.6, label.length * 0.38 + 0.7);
              const badgeX = p.x + 0.45;
              const badgeY = p.y - 0.92;
              const sel = selectedIds.has(p.id);
              const hov = hoverId === p.id;
              const showBadge = Boolean(label) && !probeScopeLabelIds.has(p.id);
              return (
                <g
                  key={p.id}
                  className={`probe-marker ${sel ? "selected" : ""} ${hov ? "hovered" : ""} ${disconnected ? "disconnected" : ""}`}
                >
                  <title>{node ? `Probe: ${node}` : "Probe"}</title>
                  {(sel || hov || disconnected) && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={sel ? 0.42 : 0.38}
                      fill="none"
                      stroke={disconnected ? "var(--danger)" : "var(--accent)"}
                      strokeWidth={sel ? 0.045 : 0.035}
                      strokeDasharray={disconnected ? "0.16 0.1" : undefined}
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={0.24}
                    fill={p.color}
                    fillOpacity={0.08}
                    stroke={disconnected ? "var(--danger)" : p.color}
                    strokeWidth={0.06}
                  />
                  <circle cx={p.x} cy={p.y} r={0.09} fill={disconnected ? "var(--danger)" : p.color} />
                  {showBadge && (
                    <>
                      <rect
                        x={badgeX}
                        y={badgeY}
                        width={badgeW}
                        height={0.7}
                        rx={0.18}
                        fill="var(--bg-window)"
                        stroke={p.color}
                        strokeWidth={0.05}
                      />
                      <text
                        x={badgeX + 0.28}
                        y={badgeY + 0.48}
                        fontSize={0.42}
                        fill={p.color}
                        fontWeight={600}
                      >
                        {label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {selectionBounds && (
              <g className="group-selection-frame" pointerEvents="none">
                <rect
                  x={selectionBounds.x1}
                  y={selectionBounds.y1}
                  width={selectionBounds.x2 - selectionBounds.x1}
                  height={selectionBounds.y2 - selectionBounds.y1}
                  rx={0.24}
                />
              </g>
            )}

            {(drag || scopeDrag) && (() => {
              const start = drag?.startGrid ?? scopeDrag?.startGrid;
              const delta = drag?.delta ?? scopeDrag?.delta;
              if (!start || !delta) return null;
              const measurement = dragDeltaMeasurement(start, {
                x: start.x + delta.x,
                y: start.y + delta.y,
              });
              if (!measurement) return null;
              return (
                <g className="draft-measure drag-delta-measure" transform={`translate(${measurement.x} ${measurement.y})`} pointerEvents="none">
                  <rect
                    x={-measurement.width / 2}
                    y={-0.32}
                    width={measurement.width}
                    height={0.54}
                    rx={0.14}
                  />
                  <text x={0} y={0.08} textAnchor="middle">
                    {measurement.label}
                  </text>
                </g>
              );
            })()}

            {marquee && (
              <rect
                x={Math.min(marquee.sx, marquee.ex) - 0.2}
                y={Math.min(marquee.sy, marquee.ey) - 0.2}
                width={Math.abs(marquee.ex - marquee.sx) + 0.4}
                height={Math.abs(marquee.ey - marquee.sy) + 0.4}
                fill="var(--accent)"
                fillOpacity={0.08}
                stroke="var(--accent)"
                strokeWidth={0.05}
                strokeDasharray="0.3 0.2"
              />
            )}
          </g>
        </svg>
        <div className="canvas-hud">
          <button
            type="button"
            className={gridVisible ? "active" : ""}
            onClick={() => setGridVisible((v) => !v)}
            title="Toggle grid visibility (Shift+G)"
            aria-label="Toggle grid visibility"
            aria-pressed={gridVisible}
          >
            Grid: {gridVisible ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={snapToGrid ? "active" : ""}
            onClick={() => setSnapToGrid((v) => !v)}
            title="Toggle snap to grid (Shift+S)"
            aria-label="Toggle snap to grid"
            aria-pressed={snapToGrid}
          >
            Snap: {snapToGrid ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={naturalPan ? "active" : ""}
            onClick={() => setNaturalPan((v) => !v)}
            title="Toggle trackpad pan direction (Shift+P)"
            aria-label="Toggle trackpad pan direction"
            aria-pressed={naturalPan}
          >
            Pan: {naturalPan ? "Natural" : "Reverse"}
          </button>
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          {cursor && <span>X {formatCoord(cursor.x)} · Y {formatCoord(cursor.y)}</span>}
          <button
            type="button"
            onClick={fitToContent}
            title="Fit schematic to view (Shift+F)"
            aria-label="Fit schematic to view"
          >
            Fit
          </button>
        </div>
        </div>

        {isTransient && transientScale && (
          <PlayBar
            tmin={transientScale.data[0]}
            tmax={transientScale.data[transientScale.data.length - 1]}
            time={playTime}
            setTime={setPlayTime}
            playing={playing}
            setPlaying={setPlaying}
            speed={playSpeed}
            setSpeed={setPlaySpeed}
            liveFlow={liveFlow}
            setLiveFlow={setLiveFlow}
          />
        )}

        {simResult && hasWaveform(simResult) && waveformVisible && (
          <WaveformViewer
            key={waveformRunKey}
            plot={simResult.plot}
            vectors={simResult.vectors}
            selectedTraces={selectedTraces}
            traceAliases={traceAliases}
            runLabels={runLabels}
            xAxisLabel={analysisXAxisLabel(doc.analysis)}
            directives={doc.directives}
            measurements={simResult.measurements}
            runWarnings={runWarnings}
            onToggleTrace={(name) => {
              const next = new Set(selectedTraces);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              setSelectedTraces(next);
            }}
            onSetVisibleTraces={setSelectedTraces}
            onShowAllTraces={() => setSelectedTraces(new Set())}
            onClose={() => setWaveformVisible(false)}
          />
        )}

        {simResult && hasWaveform(simResult) && !waveformVisible && (
          <div className="wf-collapsed">
            <div>
              <strong>Waveform hidden</strong>
              <span>{simResult.plot}</span>
            </div>
            <button onClick={() => setWaveformVisible(true)}>Show waveform</button>
          </div>
        )}

        {log && !simResult && (
          <div className="log-pane">
            <pre>{log}</pre>
          </div>
        )}
      </main>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <AnalysisDialog
        open={analysisOpen}
        initial={doc.analysis}
        sweepableSources={sweepableSources}
        sourceLabels={sourceLabels}
        hasAcSource={hasAcSource}
        onClose={() => setAnalysisOpen(false)}
        onApply={(a) => commit((d) => ({ ...d, analysis: a }))}
      />
      {netlistOpen && (
        <NetlistModal
          netlist={pinAnnotations.netlist}
          warnings={pinAnnotations.warnings}
          onClose={() => setNetlistOpen(false)}
        />
      )}
    </div>
    <StatusBar
      engineOk={engineOk}
      engineName={engineName}
      analysisKind={doc.analysis.kind}
      running={running}
      status={status}
      autoRun={autoRun}
      autoRunPaused={autoRunPaused}
      nNodes={pinAnnotations.nodes.rootToName.size}
      nComponents={page.components.filter((c) => c.kind !== "GND" && c.kind !== "LABEL").length}
      plot={simResult?.plot ?? null}
      selection={selectionStatus}
    />
    </>
  );
}

function StatusBar({
  engineOk,
  engineName,
  analysisKind,
  running,
  status,
  autoRun,
  autoRunPaused,
  nNodes,
  nComponents,
  plot,
  selection,
}: {
  engineOk: boolean | null;
  engineName: string;
  analysisKind: CircuitDoc["analysis"]["kind"];
  running: boolean;
  status: string;
  autoRun: boolean;
  autoRunPaused: boolean;
  nNodes: number;
  nComponents: number;
  plot: string | null;
  selection: string | null;
}) {
  const isError = status.startsWith("✗");
  const isStale = status.startsWith("Modified");
  const showNeutralStatus = isNeutralStatusMessage(status);
  const dotCls = running
    ? "warn"
    : engineOk === false
      ? "err"
      : isError
        ? "err"
        : isStale
          ? "warn"
        : engineOk === true && status.startsWith("✓")
          ? "ok"
          : engineOk === true
            ? "idle"
            : "idle";
  return (
    <div className="statusbar">
      <div className="group">
        <span className={`dot ${dotCls}`} />
        <span>
          {running
            ? "Running…"
            : engineOk === false
              ? "Engine offline"
              : isStale
                ? "Rerun needed"
                : showNeutralStatus
                  ? status
                : "Ready"}
        </span>
      </div>
      <div className="group">
        <span>Engine</span>
        <code>{engineName || "probing…"}</code>
      </div>
      <div className="group">
        <span>Analysis</span>
        <code>{analysisKind.toUpperCase()}</code>
      </div>
      {plot && (
        <div className="group">
          <span>Plot</span>
          <code>{plot}</code>
        </div>
      )}
      <div className="group">
        <span>Auto</span>
        <code>{autoRunPaused ? "paused" : autoRun ? "on" : "off"}</code>
      </div>
      {selection && (
        <div className="group selection" title={`${selection} selected`}>
          <span>Selection</span>
          <code>{selection}</code>
        </div>
      )}
      <div className="spacer" />
      <div className="group" title={status}>
        <span>Nodes</span>
        <code>{nNodes}</code>
        <span style={{ marginLeft: 12 }}>Components</span>
        <code>{nComponents}</code>
      </div>
    </div>
  );
}

function isNeutralStatusMessage(status: string): boolean {
  return (
    status !== "" &&
    status !== "Idle" &&
    !status.startsWith("✓") &&
    !status.startsWith("✗") &&
    !status.startsWith("Modified")
  );
}

function NetlistModal({
  netlist,
  warnings,
  onClose,
}: {
  netlist: string;
  warnings: string[];
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    cardRef.current
      ?.querySelector<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        trapModalTab(e, cardRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prevFocusRef.current?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-scrim" onMouseDown={onClose} role="presentation">
      <div
        ref={cardRef}
        className="modal-card netlist-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Generated netlist"
      >
        <div className="modal-header">
          <div className="modal-title">Generated netlist</div>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        {warnings.length > 0 && (
          <div className="form-warn" style={{ marginBottom: 10 }}>
            <strong>Warnings:</strong>
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <pre className="netlist-pre">{netlist}</pre>
        <div className="modal-actions">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(netlist);
            }}
          >
            Copy
          </button>
          <button className="run-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function trapModalTab(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null && el.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  } else if (!root.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

function findTimeIndex(xs: number[], t: number): number {
  if (xs.length === 0) return 0;
  if (t <= xs[0]) return 0;
  if (t >= xs[xs.length - 1]) return xs.length - 1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - t) < Math.abs(xs[hi] - t) ? lo : hi;
}

function normalizeDoc(
  d: Partial<CircuitDoc> & {
    components?: CircuitComponent[];
    wires?: Wire[];
    probes?: import("./model").Probe[];
    pages?: SchematicPage[];
    activePageId?: string;
  },
): CircuitDoc {
  // Migrate legacy single-page docs (pre-hierarchy schema).
  if (!d.pages || !Array.isArray(d.pages) || d.pages.length === 0) {
    const root: SchematicPage = {
      id: makeId("page"),
      name: "main",
      components: d.components ?? [],
      wires: d.wires ?? [],
      probes: d.probes ?? [],
    };
    return {
      pages: [root],
      activePageId: root.id,
      directives: d.directives ?? "",
      analysis: d.analysis ?? { kind: "op" },
    };
  }
  const pages = d.pages.map((p) => ({
    id: p.id || makeId("page"),
    name: p.name || "main",
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
  };
}

function currentSharedDoc(): CircuitDoc | null {
  if (typeof window === "undefined") return null;
  const shared = sharedDocFromHash(window.location.hash);
  if (!shared || typeof shared !== "object") return null;
  return normalizeDoc(shared as Partial<CircuitDoc>);
}

function sameCircuitDoc(a: CircuitDoc, b: CircuitDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(normalizeDoc(b));
}

function nextSharedProjectName(projects: Workspace["projects"]): string {
  const base = "Shared circuit";
  if (!projects.some((p) => p.name === base)) return base;
  let n = 2;
  while (projects.some((p) => p.name === `${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function safeExportName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "schematic";
}

function hasWaveform(r: { vectors: { is_scale: boolean; data: number[] }[] }): boolean {
  const scale = r.vectors.find((v) => v.is_scale);
  return !!scale && scale.data.length > 1;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">{label}</div>
      <div className="row-value">{labelDirectControls(children, label)}</div>
    </div>
  );
}

function labelDirectControls(children: React.ReactNode, label: string): React.ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    if (
      typeof element.type === "string" &&
      ["input", "select", "textarea"].includes(element.type) &&
      !element.props["aria-label"] &&
      !element.props["aria-labelledby"]
    ) {
      return cloneElement(element, { "aria-label": label });
    }
    return child;
  });
}

function CoordinateField({
  value,
  step,
  onCommit,
}: {
  value: number;
  step: number;
  onCommit: (value: string) => void;
}) {
  const formatted = formatCoord(value);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => {
    setDraft(formatted);
  }, [formatted]);

  function commit() {
    if (draft.trim() === "" || !Number.isFinite(Number(draft))) {
      setDraft(formatted);
      return;
    }
    onCommit(draft);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(formatted);
      e.currentTarget.blur();
    }
  }

  return (
    <input
      className="value-input"
      type="number"
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

function detectSubckts(directives: string): { name: string; pins: string[] }[] {
  const out: { name: string; pins: string[] }[] = [];
  for (const raw of directives.split(/\r?\n/)) {
    const m = raw.trim().match(/^\.subckt\s+(\S+)\s+(.*)$/i);
    if (m) {
      // Pins are the remaining tokens until any "params:" keyword or end.
      const rest = m[2].split(/\s+/);
      const pins: string[] = [];
      for (const tok of rest) {
        if (tok.toLowerCase() === "params:" || tok.includes("=")) break;
        pins.push(tok);
      }
      out.push({ name: m[1], pins });
    }
  }
  return out;
}

function isModelKind(k: ComponentKind): boolean {
  return k === "D" || k === "NPN" || k === "PNP" || k === "NMOS" || k === "PMOS" || k === "OPAMP";
}

function isTwoTerminalKind(k: ComponentKind): boolean {
  return k === "R" || k === "C" || k === "L" || k === "D" || k === "V" || k === "B" || k === "I";
}

function twoTerminalPinLabels(kind: ComponentKind): [string, string] {
  switch (kind) {
    case "D":
      return ["A", "K"];
    case "V":
    case "B":
    case "I":
      return ["+", "−"];
    case "R":
    case "C":
    case "L":
      return ["1", "2"];
    default:
      return ["1", "2"];
  }
}

function isSinglePinSnappingTool(tool: Tool): boolean {
  return tool === "GND" || tool === "LABEL";
}

function isActiveMultiPinKind(kind: ComponentKind): boolean {
  return kind === "NPN" || kind === "PNP" || kind === "NMOS" || kind === "PMOS" || kind === "OPAMP" || kind === "SUBX";
}

function toolDescriptionFor(kind: ComponentKind, fallback?: string): string | undefined {
  switch (kind) {
    case "NPN":
      return "Click to place. C/B/E pins stay visible on selection and snap strongly while wiring.";
    case "PNP":
      return "Click to place. C/B/E pins stay visible on selection and snap strongly while wiring.";
    case "NMOS":
      return "Click to place. D/G/S pins stay visible on selection and snap strongly while wiring.";
    case "PMOS":
      return "Click to place. D/G/S pins stay visible on selection and snap strongly while wiring.";
    case "OPAMP":
      return "Click to place; wire the +, - and OUT pins. Pins stay visible on selection and snap strongly while wiring.";
    default:
      return fallback;
  }
}

function placementStatusFor(kind: ComponentKind): string {
  if (kind === "GND" || kind === "LABEL") return `Added ${COMPONENT_LABELS[kind]}`;
  if (isActiveMultiPinKind(kind)) return `Added ${COMPONENT_LABELS[kind]} - wire the highlighted pins`;
  return `Added ${COMPONENT_LABELS[kind]}`;
}

function floatingPinSummary(pin: FloatingPinDiagnostic): string {
  return `${pin.refdes} ${pin.pinLabel ? `${pin.pinLabel} pin` : `pin ${pin.pinIdx + 1}`}`;
}

function addWireWithJunctions<T extends { wires: Wire[] }>(page: T, wire: Wire): T {
  const existingWires = normalizeWireList(page.wires);
  const compactedWire = compactWirePoints(wire.points);
  if (compactedWire.length < 2) return page;
  if (existingWires.some((existing) => sameWirePath(existing.points, compactedWire))) {
    return { ...page, wires: existingWires };
  }

  const endpoints = [compactedWire[0], compactedWire[compactedWire.length - 1]];
  const nextWires = insertWireEndpointJunctions(existingWires, endpoints);
  if (wirePathCoveredByWires(compactedWire, nextWires)) {
    return { ...page, wires: nextWires };
  }

  return { ...page, wires: [...nextWires, { ...wire, points: compactedWire }] };
}

function normalizeWireList(wires: Wire[]): Wire[] {
  return normalizeWireListPreservingJunctions(wires);
}

function splitWiresAtPoint(wires: Wire[], point: [number, number]): Wire[] {
  return insertWireEndpointJunctions(wires, [point]);
}

function compactWirePoints(points: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const point of points.map(normalizeTuple)) {
    const last = deduped[deduped.length - 1];
    if (!last || !sameTuple(last, point)) deduped.push(point);
  }
  if (deduped.length <= 2) return deduped;
  const compacted: [number, number][] = [];
  for (const point of deduped) {
    compacted.push(point);
    while (compacted.length >= 3) {
      const a = compacted[compacted.length - 3];
      const b = compacted[compacted.length - 2];
      const c = compacted[compacted.length - 1];
      if (!sameLineAndDirection(a, b, c)) break;
      compacted.splice(compacted.length - 2, 1);
    }
  }
  return compacted;
}

function sameLineAndDirection(a: [number, number], b: [number, number], c: [number, number]): boolean {
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return dot >= -1e-6;
}

function sameWirePath(a: [number, number][], b: [number, number][]): boolean {
  const aa = compactWirePoints(a);
  const bb = compactWirePoints(b);
  if (aa.length !== bb.length) return false;
  const sameForward = aa.every((point, idx) => sameTuple(point, bb[idx]));
  if (sameForward) return true;
  return aa.every((point, idx) => sameTuple(point, bb[bb.length - 1 - idx]));
}

function clipboardAnchor(
  components: CircuitComponent[],
  wires: Wire[],
  probes: Probe[],
): { x: number; y: number } {
  if (components.length > 0) return { x: components[0].x, y: components[0].y };
  const firstPoint = wires[0]?.points[0];
  if (firstPoint) return { x: firstPoint[0], y: firstPoint[1] };
  const firstProbe = probes[0];
  return firstProbe ? { x: firstProbe.x, y: firstProbe.y } : { x: 0, y: 0 };
}

async function readSystemSchematicClipboard(): Promise<SchematicClipboard | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return text ? decodeSchematicClipboard(text) : null;
  } catch {
    return null;
  }
}

function copyConnectedProbes(
  probes: Probe[],
  components: CircuitComponent[],
  wires: Wire[],
  ox: number,
  oy: number,
): Probe[] {
  return probes
    .map((pr) => ({
      ...pr,
      id: makeId("probe"),
      x: pr.x + ox,
      y: pr.y + oy,
      scopeDx: pr.scopeDx == null ? undefined : normalizeCoord(pr.scopeDx),
      scopeDy: pr.scopeDy == null ? undefined : normalizeCoord(pr.scopeDy),
    }))
    .filter((pr) => probeHasConnection(pr, components, wires));
}

function copiedProbesForInsertedTopology(
  probes: Probe[],
  components: CircuitComponent[],
  insertedWires: Wire[],
  existingProbes: Probe[],
): Probe[] {
  return probes.filter((probe) => {
    if (existingProbes.some((existing) => samePoint(existing, probe))) return false;
    return probeHasConnection(probe, components, insertedWires);
  });
}

function probeHasConnection(
  probe: Probe,
  components: CircuitComponent[],
  wires: Wire[],
): boolean {
  const p = { x: probe.x, y: probe.y };
  for (const c of components) {
    for (let i = 0; i < getPinLayout(c).length; i++) {
      if (samePoint(p, pinWorldPos(c, i))) return true;
    }
  }
  for (const w of wires) {
    if (w.points.some(([x, y]) => samePoint(p, { x, y }))) return true;
    for (let idx = 0; idx < w.points.length - 1; idx++) {
      const [x1, y1] = w.points[idx];
      const [x2, y2] = w.points[idx + 1];
      if (pointOnSegment(probe.x, probe.y, x1, y1, x2, y2)) return true;
    }
  }
  return false;
}

type PinHint = {
  label: string;
  position: { x: number; y: number };
  anchor: "start" | "middle" | "end";
  dx: number;
  dy: number;
};

function pinHintsFor(c: CircuitComponent): PinHint[] {
  return getPinLayout(c)
    .map<PinHint | null>((_, idx) => {
      const label = pinHintLabel(c, idx);
      if (!label) return null;
      const position = pinWorldPos(c, idx);
      const deltaX = position.x - c.x;
      const deltaY = position.y - c.y;
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        const anchor: "start" | "end" = deltaX >= 0 ? "start" : "end";
        return {
          label,
          position,
          anchor,
          dx: deltaX >= 0 ? 0.34 : -0.34,
          dy: 0.02,
        };
      }
      return {
        label,
        position,
        anchor: "middle",
        dx: 0,
        dy: deltaY >= 0 ? 0.46 : -0.46,
      };
    })
    .filter((hint): hint is PinHint => Boolean(hint));
}

function pinHintLabel(c: CircuitComponent, idx: number): string | null {
  const label = pinLabelForKind(c.kind, idx);
  return label === "-" ? "−" : label;
}

function collectPageBounds(p: SchematicPage, selected?: Set<string>): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of p.components) {
    if (selected && !selected.has(c.id)) continue;
    const bounds = componentBoundsFor(c);
    xs.push(bounds.x1, bounds.x2);
    ys.push(bounds.y1, bounds.y2);
    const pins = getPinLayout(c);
    for (let i = 0; i < pins.length; i++) {
      const wp = pinWorldPos(c, i);
      xs.push(wp.x);
      ys.push(wp.y);
    }
  }
  for (const w of p.wires) {
    if (selected && !selected.has(w.id)) continue;
    for (const [x, y] of w.points) {
      xs.push(x);
      ys.push(y);
    }
  }
  includeCanvasLabelBounds(p, selected, xs, ys);
  for (const probe of p.probes) {
    if (selected && !selected.has(probe.id)) continue;
    xs.push(probe.x);
    ys.push(probe.y);
    if (probeHasDisplayLabel(probe)) {
      const label = probe.label!.trim();
      const width = Math.max(2.6, label.length * 0.38 + 0.7);
      xs.push(probe.x + 0.45, probe.x + 0.45 + width);
      ys.push(probe.y - 0.92, probe.y - 0.22);
    }
  }
  return { xs, ys };
}

function includeCanvasLabelBounds(
  p: SchematicPage,
  selected: Set<string> | undefined,
  xs: number[],
  ys: number[],
) {
  const offsets = valueLabelOffsets(p, (component) =>
    canvasValueLabel(component.kind, component.value),
  );
  for (const c of p.components) {
    if (selected && !selected.has(c.id)) continue;
    if (c.kind === "LABEL") {
      const text = c.value.trim();
      if (!text) continue;
      const bounds = netLabelLayout(c, p, text).bounds;
      xs.push(c.x, bounds.x1, bounds.x2);
      ys.push(c.y, bounds.y1, bounds.y2);
      continue;
    }
    const text = canvasValueLabel(c.kind, c.value);
    const offset = offsets.get(c.id);
    if (!text || !offset) continue;
    const bounds = valueLabelBounds(c, offset, text);
    xs.push(bounds.x1, bounds.x2);
    ys.push(bounds.y1, bounds.y2);
  }
}

type PinMove = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type DirectContactPin = {
  componentId: string;
  pinIdx: number;
  from: { x: number; y: number };
};

function collectRotatedPinMoves(
  components: CircuitComponent[],
  selected: Set<string>,
): PinMove[] {
  const moves: PinMove[] = [];
  for (const c of components) {
    if (!selected.has(c.id)) continue;
    const rotated = { ...c, rotation: rotateNext(c.rotation) };
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const from = pinWorldPos(c, i);
      const to = pinWorldPos(rotated, i);
      if (!samePoint(from, to)) moves.push({ from, to });
    }
  }
  return moves;
}

function collectDirectContactPins(
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
): DirectContactPin[] {
  const stationaryPins = new Set<string>();
  for (const c of components) {
    if (selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      stationaryPins.add(`${coordKey(p.x)},${coordKey(p.y)}`);
    }
  }
  const stationaryWires = wires.filter((wire) => !selected.has(wire.id));
  if (stationaryPins.size === 0 && stationaryWires.length === 0) return [];

  const seen = new Set<string>();
  const contacts: DirectContactPin[] = [];
  for (const c of components) {
    if (!selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const from = pinWorldPos(c, i);
      const key = `${c.id}#${i}:${coordKey(from.x)},${coordKey(from.y)}`;
      if (seen.has(key)) continue;
      const fromKey = `${coordKey(from.x)},${coordKey(from.y)}`;
      if (!stationaryPins.has(fromKey) && !pointTouchesWireInterior(from, stationaryWires)) continue;
      seen.add(key);
      contacts.push({ componentId: c.id, pinIdx: i, from });
    }
  }
  return contacts;
}

function moveWiresToRotatedPins(
  wires: Wire[],
  pinMoves: PinMove[],
  orthogonal: boolean,
): Wire[] {
  if (pinMoves.length === 0) return wires;
  return wires.flatMap((wire) => {
    const pointMoves = wireEndpointMoveTargets(wire.points, pinMoves);
    if (pointMoves.size === 0) return [wire];
    const points = moveWirePointsToTargets(wire.points, pointMoves, orthogonal);
    if (wireConnectsMovedPins(points, pinMoves)) return [];
    return [{ ...wire, points }];
  });
}

function buildRotatedPinContactWires(
  components: CircuitComponent[],
  wires: Wire[],
  selected: Set<string>,
  pinMoves: PinMove[],
  orthogonal: boolean,
): Wire[] {
  if (pinMoves.length === 0) return [];
  const stationaryPins = new Set<string>();
  for (const c of components) {
    if (selected.has(c.id)) continue;
    for (let i = 0; i < getPinLayout(c).length; i++) {
      const p = pinWorldPos(c, i);
      stationaryPins.add(`${coordKey(p.x)},${coordKey(p.y)}`);
    }
  }
  const stationaryWires = wires.filter((wire) => !selected.has(wire.id));
  const seen = new Set<string>();
  const contactMoves: PinMove[] = [];
  for (const move of pinMoves) {
    const fromKey = `${coordKey(move.from.x)},${coordKey(move.from.y)}`;
    if (!stationaryPins.has(fromKey) && !pointTouchesWireInterior(move.from, stationaryWires)) continue;
    const key = `${fromKey}->${coordKey(move.to.x)},${coordKey(move.to.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contactMoves.push(move);
  }
  return rotatedContactRoutes(contactMoves, orthogonal).map((points) => ({
    id: makeId("w"),
    points,
  }));
}

function pointTouchesWireInterior(point: { x: number; y: number }, wires: Wire[]): boolean {
  return wires.some((wire) => pointOnPolylineBody(point, wire.points));
}

function pointTouchesWirePath(point: { x: number; y: number }, wire: Wire): boolean {
  if (wire.points.some(([x, y]) => samePoint(point, { x, y }))) return true;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const [x1, y1] = wire.points[i];
    const [x2, y2] = wire.points[i + 1];
    if (pointOnSegment(point.x, point.y, x1, y1, x2, y2)) return true;
  }
  return false;
}

function wireEndpointAnchors(
  wire: Wire,
  sourcePage: SchematicPage,
  selected: Set<string>,
): WireEndpointAnchors {
  if (wire.points.length < 2) return {};
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  return {
    start: pointTouchesStationaryConnection(
      { x: first[0], y: first[1] },
      wire.id,
      sourcePage,
      selected,
    ),
    end: pointTouchesStationaryConnection(
      { x: last[0], y: last[1] },
      wire.id,
      sourcePage,
      selected,
    ),
  };
}

function pointTouchesStationaryConnection(
  point: { x: number; y: number },
  currentWireId: string,
  sourcePage: SchematicPage,
  selected: Set<string>,
): boolean {
  for (const component of sourcePage.components) {
    if (selected.has(component.id)) continue;
    for (let idx = 0; idx < getPinLayout(component).length; idx++) {
      if (samePoint(pinWorldPos(component, idx), point)) return true;
    }
  }

  for (const wire of sourcePage.wires) {
    if (wire.id === currentWireId || selected.has(wire.id)) continue;
    if (pointTouchesWirePath(point, wire)) return true;
  }

  return false;
}

function buildTranslatedPinContactWires(
  contacts: DirectContactPin[],
  dx: number,
  dy: number,
  orthogonal: boolean,
): Wire[] {
  return translatedContactRoutes(contacts, dx, dy, orthogonal).map((points) => ({
    id: makeId("w"),
    points,
  }));
}

function buildWireJunctionDots(page: SchematicPage): { x: number; y: number }[] {
  const counts = new Map<string, { x: number; y: number; degree: number }>();
  const add = (x: number, y: number, degree = 1) => {
    const key = `${coordKey(x)},${coordKey(y)}`;
    const current = counts.get(key);
    if (current) current.degree += degree;
    else counts.set(key, { x, y, degree });
  };

  for (const wire of page.wires) {
    for (let idx = 0; idx < wire.points.length - 1; idx++) {
      const endpoints = [wire.points[idx], wire.points[idx + 1]];
      for (const [x, y] of endpoints) {
        add(x, y);
      }
    }
  }

  for (const candidate of wireEndpointPositions(page.wires)) {
    for (const wire of page.wires) {
      for (let idx = 0; idx < wire.points.length - 1; idx++) {
        const a = wire.points[idx];
        const b = wire.points[idx + 1];
        if (sameTuple(candidate, a) || sameTuple(candidate, b)) continue;
        if (pointOnSegment(candidate[0], candidate[1], a[0], a[1], b[0], b[1])) {
          add(candidate[0], candidate[1], 2);
        }
      }
    }
  }

  return [...counts.values()]
    .filter((point) => point.degree >= 3)
    .map(({ x, y }) => ({ x, y }));
}

function wireEndpointPositions(wires: Wire[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const wire of wires) {
    for (const [x, y] of wire.points) {
      const key = `${coordKey(x)},${coordKey(y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([x, y]);
    }
  }
  return out;
}

function formatCoord(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function NodeReadingsOverlay({
  page,
  netlist,
  readings,
  showAllNodes,
}: {
  page: SchematicPage;
  netlist: ReturnType<typeof buildNetlist>;
  readings: Map<string, number>;
  /** OP: true (annotate every node). Tran/AC: false (only probed nodes). */
  showAllNodes: boolean;
}) {
  const annotations: { x: number; y: number; text: string }[] = [];
  // Dedupe by NODE — many pins (opamp out + probe + wire junction) can sit
  // on the same node and otherwise produce stacked-pill clutter.
  const seenNodes = new Set<string>();

  // Probed nodes are always shown.
  const probedNodes = new Set<string>();
  for (const pr of page.probes) {
    const probeKey = `${coordKey(pr.x)},${coordKey(pr.y)}`;
    const node = netlist.nodes.posToNode.get(probeKey);
    if (node) probedNodes.add(node);
  }

  for (const c of page.components) {
    const layout = getPinLayout(c);
    for (let i = 0; i < layout.length; i++) {
      const pinKey = `${c.id}#${i}`;
      const node = netlist.nodes.pinToNode.get(pinKey);
      if (!node) continue;
      if (seenNodes.has(node)) continue;
      // For transient/AC, only annotate probed nodes to avoid a flashing
      // forest of mV pills jumping on every animation frame.
      if (!showAllNodes && !probedNodes.has(node)) continue;
      const v = readings.get(node);
      if (v === undefined) continue;
      seenNodes.add(node);
      const wp = pinWorldPos(c, i);
      annotations.push({ x: wp.x, y: wp.y, text: formatVolts(v) });
    }
  }
  return (
    <g>
      {annotations.map((a, i) => {
        const w = a.text.length * 0.28 + 0.4;
        return (
          <g key={i} transform={`translate(${a.x} ${a.y})`}>
            <rect
              x={0.35}
              y={-1.05}
              width={w}
              height={0.7}
              rx={0.18}
              ry={0.18}
              fill="var(--reading-bg)"
              stroke="var(--accent)"
              strokeOpacity={0.4}
              strokeWidth={0.04}
            />
            <text
              x={0.35 + w / 2}
              y={-0.55}
              fontSize={0.46}
              fill="var(--accent)"
              fillOpacity={0.85}
              textAnchor="middle"
              fontWeight={600}
            >
              {a.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function trimPath(p: string): string {
  // ~/some/dir/file.ext  → file.ext  (just the basename for the toolbar)
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}

/** Compact line-art glyphs for the left sidebar nav rows. */
function SideNavIcon({ kind }: { kind: "new" | "page" | "folder" }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "new":
      // Pencil-on-square — "new chat" style.
      return (
        <svg {...props}>
          <path d="M2.5 11.5v2h2L13 5l-2-2-8.5 8.5z" />
          <path d="M10 4l2 2" />
        </svg>
      );
    case "page":
      return (
        <svg {...props}>
          <path d="M3.5 1.5h6l3 3v9.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
          <path d="M9.5 1.5v3h3" />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path d="M1.8 4.5h4l1.6 1.4h7v7.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4.5z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Minimal monochrome glyphs for the toolbar — SF Symbols-flavoured. */
function IconGlyph({ kind }: { kind: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "sidebar":
      // Rectangle with a left-hand divider — universal "toggle sidebar" glyph.
      return (
        <svg {...props}>
          <rect x="1.75" y="2.5" width="12.5" height="11" rx="1.25" />
          <path d="M5.5 2.5v11" />
        </svg>
      );
    case "new":
      return (
        <svg {...props}>
          <path d="M3.5 1.5h6l3 3v9.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
          <path d="M9.5 1.5v3h3" />
          <path d="M8 8.5v3M6.5 10h3" />
        </svg>
      );
    case "open":
      return (
        <svg {...props}>
          <path d="M1.5 4.5h4l1.5 1.5h7v7a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1V4.5z" />
        </svg>
      );
    case "save":
      return (
        <svg {...props}>
          <path d="M2.5 2.5h9l3 3v9a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
          <rect x="4.5" y="2.5" width="6" height="4" />
          <rect x="4.5" y="9.5" width="7" height="5.5" />
        </svg>
      );
    case "undo":
      return (
        <svg {...props}>
          <path d="M3 7.5h7a3.5 3.5 0 0 1 0 7H7" />
          <path d="M5.5 4.5L2.5 7.5l3 3" />
        </svg>
      );
    case "redo":
      return (
        <svg {...props}>
          <path d="M13 7.5H6a3.5 3.5 0 0 0 0 7h3" />
          <path d="M10.5 4.5l3 3-3 3" />
        </svg>
      );
    case "play":
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <polygon points="4,2.5 13,8 4,13.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4M12.5 12.5l-1.4-1.4M4.9 4.9L3.5 3.5" />
        </svg>
      );
    case "netlist":
      return (
        <svg {...props}>
          <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7" />
        </svg>
      );
    case "share":
      return (
        <svg {...props}>
          <circle cx="5" cy="8" r="1.8" />
          <circle cx="11.5" cy="4" r="1.8" />
          <circle cx="11.5" cy="12" r="1.8" />
          <path d="M6.6 7.1l3.3-2.1M6.6 8.9l3.3 2.1" />
        </svg>
      );
    case "export":
      return (
        <svg {...props}>
          <path d="M8 2.5v7" />
          <path d="M5.5 5l2.5-2.5L10.5 5" />
          <path d="M3 9.5v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
        </svg>
      );
    case "page":
      return (
        <svg {...props}>
          <path d="M4 2.5h5l3 3v9a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z" />
          <path d="M9 2.5v3h3" />
        </svg>
      );
  }
  return null;
}

function cleanEngineVersion(raw: string | undefined): string {
  if (!raw) return "?";
  // libngspice's version banner reaches us as a long line like
  // "stdout ** ngspice-46 : Circuit level simulation program". Strip the
  // stdout/stderr prefix and trim to the version token.
  const v = raw.replace(/^(stdout|stderr)\s*/i, "").replace(/^\*+\s*/, "").trim();
  const m = v.match(/ngspice-?\s*\d+(?:\.\d+)?/i);
  if (m) return m[0];
  return v.slice(0, 32);
}

function formatVolts(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  // Treat very small magnitudes as zero so we don't show "0.00e+0V" overlays.
  if (a < 1e-9) return "0 V";
  if (a >= 1) return `${v.toFixed(3)} V`;
  if (a >= 1e-3) return `${(v * 1e3).toFixed(2)} mV`;
  if (a >= 1e-6) return `${(v * 1e6).toFixed(2)} µV`;
  return `${(v * 1e9).toFixed(2)} nV`;
}

function ToolIcon({ tool }: { tool: Tool }) {
  if (tool === "select") {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3l5 16 2-7 7-2z" />
      </svg>
    );
  }
  if (tool === "wire") {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <circle cx={5} cy={12} r={2.2} />
        <circle cx={19} cy={12} r={2.2} />
        <line x1={7} y1={12} x2={17} y2={12} />
      </svg>
    );
  }
  if (tool === "probe") {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5l5.2-5.2" />
        <circle cx={12} cy={9} r={3.2} />
        <circle cx={12} cy={9} r={0.8} fill="currentColor" stroke="none" />
        <path d="M15.2 9h4.3" />
        <path d="M18.2 6.3l1.8 2.7-1.8 2.7" />
      </svg>
    );
  }
  if (tool === "pan") {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 12.5V6.7a1.2 1.2 0 0 1 2.4 0v4.8" />
        <path d="M10.9 11.5V5.8a1.2 1.2 0 0 1 2.4 0v5.7" />
        <path d="M13.3 11.6V7a1.2 1.2 0 0 1 2.4 0v5.4" />
        <path d="M15.7 12.4V9.2a1.2 1.2 0 0 1 2.4 0v4.2c0 4.1-2.5 6.6-6.1 6.6h-1.1c-2.3 0-3.6-1.1-4.9-3.2l-1.5-2.5a1.25 1.25 0 0 1 2.1-1.35L8 15.1" />
      </svg>
    );
  }
  return null;
}
