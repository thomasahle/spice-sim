import {
  memo,
  useId,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";
import type {
  CircuitDoc,
  CircuitComponent,
  ComponentKind,
  Probe,
  SchematicPage,
  Wire,
} from "./model";
import {
  COMPONENT_LABELS,
  currentPage,
  defaultValue,
  effectiveSubcircuitPinSidesForInstance,
  emptyDoc,
  getPinLayout,
  makeId,
  makePage,
  flipRotation,
  parsePortOrder,
  pinWorldPos,
  rotateNext,
  rotationForKindSwap,
  SWAPPABLE_PASSIVE_KINDS,
  rotatePoint,
  subcircuitBodyHeight,
  subcircuitBodyWidth,
  subcircuitInstanceParamsForPage,
  subcircuitPinLabelsForInstance,
  subcircuitPortCount,
  subcircuitPortComponents,
  subcircuitPortLabels,
  subcircuitPageForInstance,
  updatePageMeta,
  updateCurrentPage,
} from "./model";
import { ComponentGlyph } from "./symbols";
import {
  canStartCanvasValueEditFromTyping,
  canvasValueLabel,
  isCanvasModelKind as isModelKind,
  isEditableCanvasComponentValue,
} from "./labelFormatting";
import { ValueWithUnit } from "./ValueWithUnit";
import { componentValueUnitFamily } from "./valueUnitFamilies";
import { isComplexValue } from "./valueUnits";
import {
  liveFlowAnimationStyle,
  liveFlowPhaseForId,
  liveFlowReadoutArrow,
  liveFlowReadoutBounds,
  liveFlowReadoutPosition,
  liveFlowReadoutSourceClass,
  liveFlowReadoutText,
  liveFlowReadoutWidth,
  liveFlowVisualFromSample,
  liveFlowWireObstacleBounds,
} from "./liveFlow";
import { SOURCE_BODY_FLOW_CLIP_RADIUS, componentLiveFlowPaths } from "./componentLiveFlowPaths";
import type {
  LiveFlowReadoutPosition,
  LiveFlowSample,
} from "./liveFlow";
import {
  componentUserLabelBounds,
  netLabelLayout,
  netLabelLayouts,
  valueLabelBounds,
  valueLabelOffsets,
} from "./labelPlacement";
import {
  boundsFromPoints,
  componentVisualBoundsFor,
  noteComponentHeight,
  noteComponentWidth,
  noteHeight,
  NOTE_RENDER_ROW_STEP,
  noteRenderItems,
  noteTextLines,
  noteWidth,
  normalizeCoord,
  normalizePoint,
  pointOnPolylineBody,
  pointOnSegment,
  rectsIntersect,
  samePoint,
  sameTuple,
  wireIntersectsRect,
} from "./geometry";
import {
  buildNetlist,
  coordKey,
  type FloatingPinDiagnostic,
  type ModelDiagnostic,
} from "./netlist";
import { normalizeDoc } from "./docNormalize";
import { snapNetLabelDrag } from "./netLabelConnections";
import { SvgInlineMathText } from "./mathTextSvg";
import { estimateInlineMathTextWidth } from "./mathText.ts";
import {
  canvasTextEditRequiresNonEmptyCommit,
  canvasTextEditSelection,
  defaultCanvasTextEditFocusMode,
  isEditingCanvasText,
  normalizeCanvasTextEditCommitValue,
  shouldRestoreCanvasTextSelectionBeforeInput,
  shouldRenderCanvasText,
  type CanvasTextEditFocusMode,
  type CanvasTextEditKind,
} from "./canvasTextEditing";
import {
  NOTE_COLOR_PRESETS,
  noteColor,
  noteFillColor,
  noteStrokeColor,
  withDefaultNoteColor,
} from "./noteStyle";
import {
  applyMosfetPreset,
  BUILTIN_MODEL_DEFINITIONS,
  BUILTIN_MOSFET_PRESETS,
  componentMatchesMosfetPreset,
  defaultModelParams,
  modelTypesForKind,
  mosfetPresetKindForComponentKind,
  mosfetPresetFromComponent,
  normalizeModelDefinition,
  parseModelDefinitions,
  removeModelDefinitionInDoc,
  type ModelDefinition,
  type MosfetPreset,
  type ModelDeviceType,
  uniqueModelName,
  updateModelDefinitionInDoc,
  upsertModelDefinition,
} from "./modelPresets";
import { isAcStimulus, sourceValueWithAcStimulus } from "./sourceValues";
import { isIndependentSourceKind, isSimulationStimulusKind } from "./sourceKinds";
import { simulate, engineProbe, resetHttpProbe } from "../sim/api";
import type { SimResult } from "../sim/api";
import { analysisToApi, analysisWithSweepSource, validateAnalysisSpec } from "./analysisValidation";
import { describeAutoRunStatus } from "./autoRunStatus";
import { AnalysisDialog } from "./AnalysisDialog";
import { DirectivesPanel } from "./DirectivesPanel";
import { SourceEditor } from "./SourceEditor";
import { SimSettingsPanel } from "./SimSettingsPanel";
import { CheckboxField, SelectField } from "./RadixControls";
import { readStoredBoolean, writeStoredBoolean } from "./storage";
import { ImportNetlistModal, NetlistModal } from "./NetlistModals";
import { useEditorSelection } from "./useEditorSelection";
import {
  addWireWithJunctions,
  compactWirePoints,
  normalizeWireList,
  pointTouchesWirePath,
  splitWiresAtPoint,
} from "./wireGeometry";
import { collectPageBounds, pinHintsFor } from "./selectionBounds";
import {
  defaultMosfetPresetId,
  ensureBuiltinModelDirective,
  loadCustomMosfetPresets,
  mergeMosfetPresets,
  modelOptionsForKind,
  mosfetPresetById,
  saveCustomMosfetPresets,
  writeDefaultMosfetPresetId,
} from "./presetLibrary";
import {
  isActiveMultiPinKind,
  isSinglePinSnappingTool,
  isTransientPlot,
  type Tool,
} from "./toolPredicates";
import {
  CoordinateField,
  formatCoord,
  IconGlyph,
  Row,
  StatusBar,
} from "./editorChrome";
import { EditorCanvasHUD } from "./EditorCanvasHUD";
import { EditorCanvasNotice } from "./EditorCanvasNotice";
import { EditorTopRunCluster } from "./EditorTopRunCluster";
import { WaveformSection } from "./WaveformSection";
import { EditorToolStrip } from "./EditorToolStrip";
import { EditorLeftSidebar } from "./EditorLeftSidebar";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { useTraceMetadata } from "./useTraceMetadata";
import { useProbeConnectivity } from "./useProbeConnectivity";
import { usePinAnnotations } from "./usePinAnnotations";
import { useProbeScopes } from "./useProbeScopes";
import { useLiveFlowSamples } from "./useLiveFlowSamples";
import { findTimeIndex } from "./simSampleTime";
import { useAutoRunSimulation } from "./useAutoRunSimulation";
import { useDocHistory } from "./useDocHistory";
import {
  FloatingPinMarkers,
  MarqueeOverlay,
  NetLabelNearMissMarkers,
  SelectionBoundsOverlay,
} from "./canvasOverlays";
import {
  copiedProbesForInsertedTopology,
  copyConnectedProbes,
  floatingPinSummary,
  probeHasConnection,
} from "./probeValidation";
import {
  buildRotatedPinContactWires,
  buildTranslatedPinContactWires,
  collectDirectContactPins,
  collectTransformedPinMoves,
  moveWiresToRotatedPins,
  wireEndpointAnchors,
  type DirectContactPin,
} from "./dragMath";
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
import { traceDisplayName } from "./traceNames";
import { PlayBar } from "./PlayBar";
import { MiniScope } from "./MiniScope";
import { formatMeasurementAxisValue } from "./measurementFormatting";
import { formatMeasurementResultValue } from "./measurementUnits";
import { probeScopeLabelBounds } from "./scopeLayout";
import { DEMOS } from "./demos";
import { exportCsv, exportNetlist, exportSvg, onMenuEvent, openDoc, saveDoc } from "../sim/files";
import { applyWheelPan } from "./panMath";
import { deletionStatus, selectionSummary } from "./editorStatus";
import { sharedDocFromHash, shareUrlForDoc } from "./shareUrl";
import { schematicSvgFromCanvas } from "./svgExport";
import { findNodeTrace, latestNodeVoltages, traceNodeName } from "./simVectorLookup";
import { formatSimulationErrorLog, summarizeSimulationError } from "./simulationErrors";
import { defaultVisibleTraceNames } from "./traceVisibility";
import { analysisXAxisLabel, axisUnitFromLabel } from "./waveformAxis";
import {
  decodeSchematicClipboard,
  encodeSchematicClipboard,
  type SchematicClipboard,
} from "./schematicClipboard";
import { collectSelectedTopology } from "./selectionTopology";
import {
  type HistorySnapshot,
} from "./editorHistory";
import {
  componentFromDrag,
  moveAttachedWirePoints,
  moveAttachedWirePointsAvoiding,
  moveProbesFromInsertedWireSpan,
  moveWirePointsWithAnchors,
  moveWirePointsWithAnchorsAvoiding,
  placementConnectionWires,
  placementLength,
  placementWireCutSpan,
  removeLastWireDraftPoint,
  reshapeDraggedWirePointAvoiding,
  routeWireSegmentAvoiding,
  wireMovesAsRigidShape,
  type WireEndpointAnchors,
} from "./placement";
import {
  movePointBetweenWirePaths,
  moveProbesWithPinMoves,
  moveUnmovedProbesWithChangedWirePaths,
  probeShouldMoveWithSelectedPin,
} from "./wireMotion";
import { autoFormatWiresAvoiding, wireIdsForAutoFormat } from "./wireFormatting";
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
  placementCanInsertInline,
  placementShouldBeginTextEdit,
  placementShouldSnapToConnections,
  pinTargetTone,
  pointerSelectionHit,
  selectPointerIntent,
  selectionClickStartsDrag,
  shouldSuppressOriginalConnectionSnap,
} from "./canvasInteraction";
import { cutWireSegmentBetweenPoints } from "./wireTopology";

let netlistImportModulePromise: Promise<typeof import("./netlistImport")> | null = null;
function loadNetlistImportModule() {
  netlistImportModulePromise ??= import("./netlistImport");
  return netlistImportModulePromise;
}

let autoLayoutModulePromise: Promise<typeof import("./autoLayout")> | null = null;
function loadAutoLayoutModule() {
  autoLayoutModulePromise ??= import("./autoLayout");
  return autoLayoutModulePromise;
}

const STARTER_DEMO_IDS = new Set(["divider", "rc_step", "inverting_opamp"]);
const STARTER_DEMOS = DEMOS.filter((demo) => STARTER_DEMO_IDS.has(demo.id));

type WireGestureMode = "wire-tool" | "quick-wire";
type CanvasClickEditTarget = {
  id: string;
  kind: CanvasTextEditKind;
  pinIndex?: number;
};

const CELL = 20;
const SCOPE_OFFSET_X = 0.9;
const SCOPE_OFFSET_Y = -3.05;
const SCOPE_WIDTH = 4.6;
const SCOPE_HEIGHT = 1.75;

function canvasValueEditorWidthUnits(renderedWidth: number, rawValue: string): number {
  const raw = rawValue.trim();
  if (!raw) return Math.max(1.5, renderedWidth);
  const mathEstimate = estimateInlineMathTextWidth(raw) * 0.42 + 0.95;
  const plainTextEstimate = raw.length * 0.34 + 1.05;
  return Math.max(1.5, Math.min(13, Math.max(renderedWidth, mathEstimate, plainTextEstimate)));
}

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
        desc: "Reference node (0 V). Drag from an existing net to place and connect a ground stub.",
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
        desc: "Drag to place and orient. C/B/E pins stay visible on selection and snap strongly while wiring.",
      },
      { tool: "PNP", kind: "PNP", name: "PNP BJT" },
      {
        tool: "NMOS",
        kind: "NMOS",
        name: "NMOS",
        hint: "M",
        desc: "Drag to place and orient. D/G/S pins stay visible on selection and snap strongly while wiring.",
      },
      { tool: "PMOS", kind: "PMOS", name: "PMOS" },
      {
        tool: "NMOS4",
        kind: "NMOS4",
        name: "NMOS 4-pin",
        desc: "Explicit-body NMOS. Wire drain, gate, source, and bulk separately.",
      },
      {
        tool: "PMOS4",
        kind: "PMOS4",
        name: "PMOS 4-pin",
        desc: "Explicit-body PMOS. Wire drain, gate, source, and bulk separately.",
      },
      {
        tool: "OPAMP",
        kind: "OPAMP",
        name: "Op-amp",
        hint: "O",
        desc: "Drag to place and orient; wire the +, −, and OUT pins. Pins stay visible on selection and snap strongly while wiring.",
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
        desc: "Drag onto a wire or pin to name that net. Two labels with the same name are electrically connected.",
      },
      {
        tool: "NOTE",
        kind: "NOTE",
        name: "Note",
        hint: "T",
        desc: "Drag to place and size a canvas note. Notes are visual comments and export as SPICE comment lines.",
      },
    ],
  },
];

const PALETTE_ITEMS = PALETTE_SECTIONS.flatMap((section) => section.items);
const BASIC_TOOL_ITEMS = PALETTE_SECTIONS.find((section) => section.label === "Tools")?.items ?? [];
const ESSENTIAL_TOOL_ITEMS = ["GND", "LABEL", "NOTE"]
  .map((tool) => PALETTE_ITEMS.find((item) => item.tool === tool))
  .filter((item): item is PaletteItem => Boolean(item));
const DIRECT_TOOL_ITEMS = [...BASIC_TOOL_ITEMS, ...ESSENTIAL_TOOL_ITEMS];
const MODEL_TYPE_OPTIONS: Array<{ value: ModelDeviceType; label: ModelDeviceType }> = [
  { value: "NMOS", label: "NMOS" },
  { value: "PMOS", label: "PMOS" },
  { value: "D", label: "D" },
  { value: "NPN", label: "NPN" },
  { value: "PNP", label: "PNP" },
];

interface ToolGroup {
  id: string;
  label: string;
  summary: string;
  primary: Tool;
  tools: Tool[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "sources",
    label: "Sources",
    summary: "Drive circuits with fixed, time-varying, or expression-based signals.",
    primary: "V",
    tools: ["V", "I", "B"],
  },
  {
    id: "passive",
    label: "Passive Elements",
    summary: "Basic energy and impedance components for shaping current, voltage, and frequency response.",
    primary: "R",
    tools: ["R", "C", "L"],
  },
  {
    id: "opamps",
    label: "Operational Amplifiers",
    summary: "High-gain building blocks for amplification, buffering, filtering, and feedback.",
    primary: "OPAMP",
    tools: ["OPAMP"],
  },
  {
    id: "diodes",
    label: "Diodes",
    summary: "One-way and nonlinear devices for rectification, clamps, and protection.",
    primary: "D",
    tools: ["D"],
  },
  {
    id: "bjts",
    label: "BJTs",
    summary: "Current-controlled transistors for switching, biasing, and analog gain stages.",
    primary: "NPN",
    tools: ["NPN", "PNP"],
  },
  {
    id: "mosfets",
    label: "MOSFETs",
    summary: "Voltage-controlled transistors for switching, logic, and high-impedance input stages.",
    primary: "NMOS",
    tools: ["NMOS", "PMOS", "NMOS4", "PMOS4"],
  },
];

const SUBX_PIN_SIDE_OPTIONS = [
  { id: "L", label: "L", title: "Left side" },
  { id: "R", label: "R", title: "Right side" },
  { id: "T", label: "T", title: "Top side" },
  { id: "B", label: "B", title: "Bottom side" },
] as const;

// Default to the RC step demo so the scope is alive on first launch
// (transient with an exponential charge curve), instead of the divider OP
// which only renders a flat-line 5V scope.
const DEMO: CircuitDoc = (DEMOS.find((d) => d.id === "rc_step") ?? DEMOS[0]).build();

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

// Per-item memo'd render nodes. Big imported circuits (100+ components,
// 500+ wires) used to re-jsxDEV the whole canvas on every drag frame —
// `Editor` body ~6 s in a drag profile, dominated by inline `.map(...)`
// JSX construction. Hoisting each list item to a memo'd component lets
// React skip 99 % of the work: only the dragged element's props change,
// every other child gets reference-equality and skips reconcile.

type RegularComponentNodeProps = {
  c: CircuitComponent;
  selected: boolean;
  hovered: boolean;
  floating: boolean;
  liveActive: boolean;
  flowSample: LiveFlowSample | undefined;
  tool: Tool;
  activeConnectionGesture: boolean;
  showSubxResizeHandle: boolean;
  editingComponentValue: boolean;
  editingComponentLabel: boolean;
  valueLabelOffset: { x: number; y: number; anchor: "start" | "middle" | "end" } | undefined;
  valueLabelText: string | null;
  selectedStroke: number;
  defaultStroke: number;
  valueFontSize: number;
  subxBodyWidth: number;
  subxPinLabels: string[] | undefined;
  subxPinSides: ReturnType<typeof effectiveSubcircuitPinSidesForInstance> | undefined;
  subxPinLabelEditingIndex: number | null;
  scheduleCanvasDoubleAction: (target: EventTarget | null) => boolean;
};

const RegularComponentNode = memo(function RegularComponentNode({
  c,
  selected: sel,
  hovered,
  floating,
  liveActive,
  flowSample,
  tool,
  activeConnectionGesture,
  showSubxResizeHandle,
  editingComponentValue,
  editingComponentLabel,
  valueLabelOffset,
  valueLabelText,
  selectedStroke,
  defaultStroke,
  valueFontSize,
  subxBodyWidth,
  subxPinLabels,
  subxPinSides,
  subxPinLabelEditingIndex,
  scheduleCanvasDoubleAction,
}: RegularComponentNodeProps) {
  const bounds = componentVisualBoundsFor(c, 0.16);
  const connectionToolActive = tool === "wire" || tool === "probe";
  const activeDevice = isActiveMultiPinKind(c.kind);
  const componentLabel = c.label?.trim() ?? "";
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
  const componentFlow = liveActive ? liveFlowVisualFromSample(flowSample) : null;
  const componentFlowActive = Boolean(componentFlow?.active);
  // Show D/G/S (and other named) pin labels whenever an active multi-pin
  // device is hovered, so users can identify terminals without starting a
  // wire — and also while a connection gesture targets a selected device.
  const pinHints =
    activeDevice && (hovered || (activeConnectionGesture && sel)) ? pinHintsFor(c) : [];
  const onDouble = (event: React.MouseEvent) => {
    if (event.detail >= 2 && scheduleCanvasDoubleAction(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onDoubleClick = (event: React.MouseEvent) => {
    if (scheduleCanvasDoubleAction(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <g
      data-component-id={c.id}
      className={`component-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""} ${floating ? "floating" : ""} ${editingComponentValue ? "text-editing" : ""}`}
      onClick={onDouble}
      onMouseDown={onDouble}
      onDoubleClick={onDoubleClick}
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
          strokeWidth={sel ? selectedStroke : defaultStroke}
          mirrored={c.mirrored}
          subxPins={c.kind === "SUBX" ? getPinLayout(c) : undefined}
          subxLabel={c.kind === "SUBX" ? (c.value || "X") : undefined}
          subxPinSides={c.kind === "SUBX" ? subxPinSides : undefined}
          subxPinLabels={
            c.kind === "SUBX" && subxPinLabels
              ? subxPinLabels.map((label, pinIndex) =>
                  subxPinLabelEditingIndex === pinIndex ? "" : label,
                )
              : undefined
          }
        />
        {componentFlowActive && componentFlow && (
          <ComponentLiveFlowGlyph
            component={c}
            flow={componentFlow}
            sample={flowSample}
            strokeWidth={defaultStroke}
          />
        )}
        {c.kind === "SUBX" && (() => {
          const w = Math.max(1.1, Math.min(subxBodyWidth - 0.5, estimateInlineMathTextWidth(c.value || "X") * 0.42 + 0.85));
          return (
            <rect
              x={-w / 2}
              y={-0.36}
              width={w}
              height={0.72}
              rx={0.18}
              className="subx-body-label-hit"
              data-subx-label-edit-id={c.id}
            />
          );
        })()}
        {c.kind === "SUBX" && getPinLayout(c).map((p, pinIndex) => {
          const side = subxPinSides?.[pinIndex] ?? (p.x < 0 ? "L" : "R");
          const bodyHalfW = subxBodyWidth / 2;
          const bodyHalfH = subcircuitBodyHeight(c) / 2;
          const labelCenter =
            side === "T"
              ? { x: p.x, y: -bodyHalfH + 0.42, w: 1.6, h: 0.72 }
              : side === "B"
                ? { x: p.x, y: bodyHalfH - 0.18, w: 1.6, h: 0.72 }
                : side === "L"
                  ? { x: -bodyHalfW + 0.95, y: p.y + 0.11, w: 1.35, h: 0.72 }
                  : { x: bodyHalfW - 0.95, y: p.y + 0.11, w: 1.35, h: 0.72 };
          return (
            <rect
              key={`subx-pin-label-hit-${pinIndex}`}
              x={labelCenter.x - labelCenter.w / 2}
              y={labelCenter.y - labelCenter.h / 2}
              width={labelCenter.w}
              height={labelCenter.h}
              rx={0.16}
              className="subx-pin-label-click-target"
              data-subx-pin-label-index={pinIndex}
            />
          );
        })}
        {getPinLayout(c).map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={0.42}
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
              r={showPinTargets ? 0.2 : 0.14}
              className={`component-pin ${sel ? "selected" : ""} ${showPinTargets ? terminalTone : "idle"}`}
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
      {valueLabelText && (() => {
        const off = valueLabelOffset ?? { x: 0, y: 1.45, anchor: "middle" as const };
        const labelBounds = valueLabelBounds(c, off, valueLabelText, valueFontSize);
        const labelBoxHeight = labelBounds.y2 - labelBounds.y1;
        const labelCenterY = (labelBounds.y1 + labelBounds.y2) / 2;
        const inlinePad = 0.18;
        const labelBoxWidth = labelBounds.x2 - labelBounds.x1;
        const labelX =
          off.anchor === "start"
            ? labelBounds.x1 + inlinePad
            : off.anchor === "end"
              ? labelBounds.x2 - inlinePad
              : c.x + off.x;
        const labelMaxWidth =
          off.anchor === "middle"
            ? labelBoxWidth
            : Math.max(0.1, labelBoxWidth - inlinePad * 2);
        return (
          <g className="component-value-label" pointerEvents="all">
            <rect
              x={labelBounds.x1 - 0.14}
              y={labelBounds.y1 - 0.08}
              width={labelBounds.x2 - labelBounds.x1 + 0.28}
              height={labelBounds.y2 - labelBounds.y1 + 0.16}
              rx={0.14}
              className="component-value-hit-target"
            />
            {!editingComponentValue && (
              <SvgInlineMathText
                x={labelX}
                y={labelCenterY}
                textAnchor={off.anchor}
                className="component-value-text"
                fontSize={valueFontSize}
                text={valueLabelText}
                maxWidth={labelMaxWidth}
                boxHeight={labelBoxHeight}
                verticalAnchor="middle"
              />
            )}
          </g>
        );
      })()}
      {componentLabel && (() => {
        const labelBounds = componentUserLabelBounds(c, componentLabel);
        const labelX = (labelBounds.x1 + labelBounds.x2) / 2;
        const labelBoxHeight = labelBounds.y2 - labelBounds.y1;
        const labelCenterY = (labelBounds.y1 + labelBounds.y2) / 2;
        return (
          <g
            className={`component-user-label ${editingComponentLabel ? "editing" : ""}`}
            data-component-label-edit-id={c.id}
            pointerEvents="all"
          >
            <rect
              x={labelBounds.x1}
              y={labelBounds.y1}
              width={labelBounds.x2 - labelBounds.x1}
              height={labelBounds.y2 - labelBounds.y1}
              rx={0.18}
              className="component-user-label-chip"
            />
            {!editingComponentLabel && (
              <SvgInlineMathText
                x={labelX}
                y={labelCenterY}
                textAnchor="middle"
                className="component-user-label-text"
                fontSize={0.38}
                text={componentLabel}
                maxWidth={labelBounds.x2 - labelBounds.x1 - 0.2}
                boxHeight={labelBoxHeight}
                verticalAnchor="middle"
              />
            )}
          </g>
        );
      })()}
      {showSubxResizeHandle && (
        <rect
          x={bounds.x2 - 0.34}
          y={bounds.y2 - 0.34}
          width={0.46}
          height={0.46}
          rx={0.11}
          className="note-resize-handle subx-resize-handle"
          data-subx-resize-id={c.id}
        />
      )}
    </g>
  );
});

function ComponentLiveFlowGlyph({
  component,
  flow,
  sample,
  strokeWidth,
}: {
  component: CircuitComponent;
  flow: ReturnType<typeof liveFlowVisualFromSample>;
  sample: LiveFlowSample | undefined;
  strokeWidth: number;
}) {
  const reactClipId = useId();
  if (!flow.active || sample?.source !== "ngspice") return null;
  const paths = componentLiveFlowPaths(component);
  if (paths.length === 0) return null;
  const phase = liveFlowPhaseForId(`component:${component.id}`);
  const flowStyle = liveFlowAnimationStyle(flow, phase) as CSSProperties;
  const flowDirection = component.kind === "V" || component.kind === "GND" ? 1 : flow.direction;
  // Source-body flow is drawn as internal down-streams. Clip source streams to
  // the source circle so the dash caps/glow never read as flow outside the body.
  const clipSourceFlow = component.kind === "V" || component.kind === "I" || component.kind === "B";
  const clipId = clipSourceFlow ? `source-flow-${reactClipId.replaceAll(":", "")}` : undefined;
  return (
    <g
      className="component-live-group"
      transform={component.mirrored ? "scale(-1 1)" : undefined}
      pointerEvents="none"
      data-component-flow-id={component.id}
      data-component-flow-kind={component.kind}
    >
      {clipId && (
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={SOURCE_BODY_FLOW_CLIP_RADIUS} />
        </clipPath>
      )}
      {paths.map((path, index) => (
        <path
          key={`casing-${index}`}
          d={path}
          fill="none"
          strokeWidth={strokeWidth * (flow.strokeMultiplier + 0.72)}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`component-live-casing ${clipSourceFlow ? "source-body" : ""}`}
          data-component-flow-id={component.id}
          data-component-flow-segment={index}
          clipPath={clipId ? `url(#${clipId})` : undefined}
        />
      ))}
      {paths.map((path, index) => (
        <path
          key={`flow-${index}`}
          d={path}
          fill="none"
          strokeWidth={strokeWidth * flow.strokeMultiplier}
          strokeDasharray={`${flow.dash} ${flow.gap}`}
          strokeDashoffset={phase}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`component-live component-live-overlay ngspice ${clipSourceFlow ? "source-body" : ""} ${flowDirection === -1 ? "reverse" : ""}`}
          data-component-flow-id={component.id}
          data-component-flow-segment={index}
          data-component-flow-kind={component.kind}
          data-live-flow-source="ngspice"
          data-live-flow-current={sample.signedCurrent}
          data-live-flow-direction={flowDirection}
          style={flowStyle}
          clipPath={clipId ? `url(#${clipId})` : undefined}
        />
      ))}
    </g>
  );
}

type WireNodeProps = {
  w: Wire;
  selected: boolean;
  hovered: boolean;
  liveActive: boolean;
  flowSample: LiveFlowSample | undefined;
  flowReadout: LiveFlowReadoutPosition | null;
  flowReadoutWidth: number;
  selectedStroke: number;
  hoveredStroke: number;
  defaultStroke: number;
};

const WireNode = memo(function WireNode({
  w,
  selected: sel,
  hovered,
  liveActive,
  flowSample,
  flowReadout,
  flowReadoutWidth,
  selectedStroke,
  hoveredStroke,
  defaultStroke,
}: WireNodeProps) {
  const flow = liveActive ? liveFlowVisualFromSample(flowSample) : null;
  const wireFlowActive = Boolean(flow?.active);
  const flowPhase = liveFlowPhaseForId(w.id);
  const flowStyle: React.CSSProperties | undefined = wireFlowActive && flow
    ? (liveFlowAnimationStyle(flow, flowPhase) as React.CSSProperties)
    : undefined;
  const flowReadoutText = liveActive
    ? liveFlowReadoutText(flowSample, wireFlowActive)
    : null;
  const wireTitle = flowReadoutText?.title;
  const flowReadoutArrow =
    flowReadout && flow && flowReadoutText?.showArrow
      ? liveFlowReadoutArrow(flowReadout, flow.direction)
      : "";
  const polyPoints = w.points.map((p) => p.join(",")).join(" ");
  return (
    <g className={`wire-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}>
      {wireTitle && <title>{wireTitle}</title>}
      <polyline
        points={polyPoints}
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
        points={polyPoints}
        fill="none"
        stroke={sel || hovered ? "var(--accent)" : "var(--ink)"}
        strokeWidth={sel ? selectedStroke : hovered ? hoveredStroke : defaultStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-wire-id={w.id}
      />
      {wireFlowActive && (
        <>
          <polyline
            points={polyPoints}
            fill="none"
            strokeWidth={defaultStroke * ((flow?.strokeMultiplier ?? 1.25) + 0.56)}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
            className="wire-live-casing"
            data-wire-id={w.id}
          />
          <polyline
            points={polyPoints}
            fill="none"
            strokeWidth={defaultStroke * (flow?.strokeMultiplier ?? 1.25)}
            strokeDasharray={flow ? `${flow.dash} ${flow.gap}` : undefined}
            strokeDashoffset={flow ? flowPhase : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
            className={`wire-live wire-live-overlay ngspice ${flow?.direction === -1 ? "reverse" : ""}`}
            data-wire-id={w.id}
            data-live-flow-source="ngspice"
            data-live-flow-current={flowSample?.signedCurrent}
            data-live-flow-direction={flow?.direction}
            style={flowStyle}
          />
        </>
      )}
      {flowReadout && flowReadoutText && (
        <foreignObject
          x={flowReadout.x - flowReadoutWidth / 2}
          y={flowReadout.y - 0.32}
          width={flowReadoutWidth}
          height={0.64}
          className="live-flow-readout-object"
          pointerEvents="none"
        >
          <div
            className={`live-flow-readout ${liveFlowReadoutSourceClass(flowSample)} ${wireFlowActive ? "active" : "inactive"}`}
            aria-label={flowReadoutText.title}
          >
            {flowSample && <span className="live-flow-readout-dot" aria-hidden="true" />}
            {flowReadoutText.showArrow && <strong aria-hidden="true">{flowReadoutArrow}</strong>}
            <span className="live-flow-readout-label">{flowReadoutText.label}</span>
            {flowReadoutText.detail && <small className="live-flow-readout-detail">{flowReadoutText.detail}</small>}
          </div>
        </foreignObject>
      )}
    </g>
  );
});

type ProbeNodeProps = {
  p: Probe;
  node: string | undefined;
  selected: boolean;
  hovered: boolean;
  showBadge: boolean;
  editing: boolean;
};

const ProbeNode = memo(function ProbeNode({
  p,
  node,
  selected: sel,
  hovered: hov,
  showBadge,
  editing,
}: ProbeNodeProps) {
  const disconnected = !node;
  const label = p.label?.trim() ?? "";
  const badgeW = Math.max(2.6, estimateInlineMathTextWidth(label) * 0.42 + 0.7);
  const badgeH = 0.7;
  const badgeX = p.x + 0.45;
  const badgeY = p.y - 0.92;
  return (
    <g
      className={`probe-marker ${sel ? "selected" : ""} ${hov ? "hovered" : ""} ${disconnected ? "disconnected" : ""}`}
      data-probe-id={p.id}
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
      {showBadge && !editing && (
        <>
          <rect
            x={badgeX}
            y={badgeY}
            width={badgeW}
            height={badgeH}
            rx={0.18}
            className="probe-badge-chip"
            fill="var(--bg-window)"
            stroke={p.color}
            strokeWidth={0.05}
          />
          <SvgInlineMathText
            x={badgeX + badgeW / 2}
            y={badgeY + badgeH / 2}
            fontSize={0.42}
            text={label}
            textAnchor="middle"
            className="probe-badge-text"
            maxWidth={Math.max(0.1, badgeW - 0.36)}
            boxHeight={badgeH}
            verticalAnchor="middle"
            overflow="hidden"
            style={{
              fill: p.color,
              fontWeight: 600,
            }}
          />
        </>
      )}
    </g>
  );
});

// Undo history is bounded to avoid unbounded memory growth on long editing
// sessions. 100 steps comfortably exceeds a session's worth of edits while
// keeping memory in the tens of KB even for large schematics.
const UNDO_LIMIT = 100;

// Same-source commits (same mergeKey) within this window collapse into a
// single undo step — so typing "2.2k" into a value field is one undo, not four.
const COMMIT_MERGE_WINDOW_MS = 600;

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
  const {
    doc,
    setDoc,
    setPast,
    setFuture,
    pushPast,
    popLatestPast,
    docRef,
    pastRef,
    futureRef,
  } = useDocHistory(
    (() => {
      const w = loadWorkspace();
      if (w.active) {
        const loaded = loadProject(w.active);
        if (loaded) return normalizeDoc(loaded);
      }
      return emptyDoc;
    })(),
    UNDO_LIMIT,
  );
  const stableNodeNamesRef = useRef<Map<string, string>>(new Map());
  const stableNodeScopeRef = useRef("");
  const copyShareLinkRef = useRef<(() => Promise<void>) | null>(null);
  const [showStartupEmptyCard, setShowStartupEmptyCard] = useState(() => {
    const shared = currentSharedDoc();
    if (shared) return activeSchematicIsEmpty(normalizeDoc(shared));
    const w = loadWorkspace();
    if (w.active) {
      const loaded = loadProject(w.active);
      if (loaded) return activeSchematicIsEmpty(normalizeDoc(loaded));
    }
    return true;
  });
  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wireDraft, setWireDraft] = useState<[number, number][] | null>(null);
  const [wireGesture, setWireGesture] = useState<null | {
    /** Anchor for the wire route — snapped to a pin / wire point. */
    start: [number, number];
    /** Raw world-space pointer position at pointer-down, used solely for
     *  drag-vs-click detection. We deliberately don't use `start`: the snap
     *  point can be up to ~0.36 units away, which would otherwise trip the
     *  drag threshold on a perfectly stationary click. */
    pointerStart: [number, number];
    moved: boolean;
    mode: WireGestureMode;
    fallbackSelectionId?: string;
  }>(null);
  const wireDraftRef = useRef<[number, number][] | null>(null);
  const wireGestureRef = useRef<null | {
    start: [number, number];
    pointerStart: [number, number];
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
  const [runModelDiagnostics, setRunModelDiagnostics] = useState<ModelDiagnostic[]>([]);
  const [engineName, setEngineName] = useState<string>("");
  const [running, setRunning] = useState(false);
  // Throttled mirror of `running`: only flips true after the sim has been in
  // flight for ~120 ms so fast (<1 frame) auto-runs don't flash the spinner
  // and the "Running…" text.
  const [runningVisible, setRunningVisible] = useState(false);
  useEffect(() => {
    if (!running) {
      setRunningVisible(false);
      return;
    }
    const t = setTimeout(() => setRunningVisible(true), 120);
    return () => clearTimeout(t);
  }, [running]);
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
    clickEditTarget?: CanvasClickEditTarget;
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
  const [noteResize, setNoteResize] = useState<null | {
    noteId: string;
    startWorld: { x: number; y: number };
    initialWidth: number;
    initialHeight: number;
    committed: boolean;
  }>(null);
  const [subxResize, setSubxResize] = useState<null | {
    componentId: string;
    startWorld: { x: number; y: number };
    initialWidth: number;
    initialHeight: number;
    minHeight: number;
    committed: boolean;
  }>(null);
  const [textEdit, setTextEdit] = useState<null | {
    componentId: string;
    kind: CanvasTextEditKind;
    value: string;
    focusMode?: CanvasTextEditFocusMode;
    pinIndex?: number;
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
  const [simulationStale, setSimulationStale] = useState(false);
  // Duration of the last completed run; gates auto-run's adaptive idle window
  // and its "too slow, pause" cutoff. Null until the first run completes.
  const [lastRunMs, setLastRunMs] = useState<number | null>(null);
  const [waveformVisible, setWaveformVisible] = useState(true);
  const [selectedTraces, setSelectedTraces] = useState<Set<string>>(new Set());
  const [filePath, setFilePath] = useState<string | null>(null);
  // True when the in-memory doc has diverged from the disk file last
  // opened/saved. Only matters when filePath is set — if there's no on-disk
  // file the workspace localStorage handles persistence on its own.
  const [diskDirty, setDiskDirty] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [liveFlow, setLiveFlow] = useState(() => readStoredBoolean("spicesim.liveFlow", true));
  const [autoRun, setAutoRun] = useState(() => readStoredBoolean("spicesim.autoRun", true));
  const [snapToGrid, setSnapToGrid] = useState(() => readStoredBoolean("spicesim.snapToGrid", true));
  const [gridVisible, setGridVisible] = useState(() => readStoredBoolean("spicesim.gridVisible", true));
  const [netlistOpen, setNetlistOpen] = useState(false);
  const [importNetlistOpen, setImportNetlistOpen] = useState(false);
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [activeToolGroupId, setActiveToolGroupId] = useState<string | null>(null);
  const [activeToolGroupTop, setActiveToolGroupTop] = useState(0);
  const [selectedSubcircuitPageId, setSelectedSubcircuitPageId] = useState<string | null>(null);
  const [selectedMosfetPresetId, setSelectedMosfetPresetId] = useState<Record<"NMOS" | "PMOS", string>>(() => ({
    NMOS: defaultMosfetPresetId("NMOS"),
    PMOS: defaultMosfetPresetId("PMOS"),
  }));
  const [customMosfetPresets, setCustomMosfetPresets] = useState<MosfetPreset[]>(loadCustomMosfetPresets);
  const toolGroupCloseTimerRef = useRef<number | null>(null);
  // Default to collapsed on narrow viewports so the canvas is visible when a
  // first-time visitor opens the site on a phone. Matches the breakpoint in
  // styles.css that turns the panels into overlays.
  const [pagesCollapsed, setPagesCollapsed] = useState<boolean>(() =>
    readStoredBoolean("spicesim.pagesCollapsed", isNarrowViewport()),
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() =>
    readStoredBoolean("spicesim.inspectorCollapsed", isNarrowViewport()),
  );
  useEffect(() => {
    writeStoredBoolean("spicesim.pagesCollapsed", pagesCollapsed);
    window.dispatchEvent(
      new CustomEvent("spicesim:sidebar-state", {
        detail: { collapsed: pagesCollapsed },
      }),
    );
  }, [pagesCollapsed]);
  useEffect(() => () => clearToolGroupCloseTimer(), []);
  useEffect(() => {
    writeStoredBoolean("spicesim.inspectorCollapsed", inspectorCollapsed);
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
    const share = () => {
      void copyShareLinkRef.current?.();
    };
    window.addEventListener("spicesim:toggle-sidebar", sidebar);
    window.addEventListener("spicesim:toggle-inspector", inspector);
    window.addEventListener("spicesim:share", share);
    return () => {
      window.removeEventListener("spicesim:toggle-sidebar", sidebar);
      window.removeEventListener("spicesim:toggle-inspector", inspector);
      window.removeEventListener("spicesim:share", share);
    };
  }, []);
  useEffect(() => {
    writeStoredBoolean("spicesim.snapToGrid", snapToGrid);
  }, [snapToGrid]);
  useEffect(() => {
    writeStoredBoolean("spicesim.gridVisible", gridVisible);
  }, [gridVisible]);
  useEffect(() => {
    writeStoredBoolean("spicesim.autoRun", autoRun);
  }, [autoRun]);
  useEffect(() => {
    writeStoredBoolean("spicesim.liveFlow", liveFlow);
  }, [liveFlow]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const textEditRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const textEditCancelBlurRef = useRef(false);
  const textEditOpenedAtRef = useRef(0);
  const preferredTextEditTargetRef = useRef<CanvasClickEditTarget | null>(null);
  const pendingCanvasDoubleActionRef = useRef<number | null>(null);
  const spacePanRef = useRef(false);
  // Multi-touch gesture tracking. Touch pointers go into `activeTouches`
  // keyed by pointerId; when two touches are active simultaneously we enter
  // pinch-zoom mode and record the starting distance / zoom / world center.
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<null | {
    startDist: number;
    startZoom: number;
    centerWorld: { x: number; y: number };
  }>(null);
  // Derive the active page once per render so most editor code can treat
  // `page.components` etc as the source of truth.
  const page = currentPage(doc);
  const stableNodeScope = `${workspace.active ?? "shared"}:${doc.pages[0]?.id ?? "root"}`;
  if (stableNodeScopeRef.current !== stableNodeScope) {
    stableNodeScopeRef.current = stableNodeScope;
    stableNodeNamesRef.current.clear();
  }
  const activeTextEditId = textEdit?.componentId ?? null;
  const activeTextEditKind = textEdit?.kind ?? null;
  const applyCanvasTextEditFocusSelection = useCallback(
    (editor: HTMLInputElement | HTMLTextAreaElement) => {
      if (!activeTextEditKind) return;
      if (textEditOpenedAtRef.current <= 0) return;
      editor.focus();
      const focusMode = textEdit?.focusMode ?? defaultCanvasTextEditFocusMode(activeTextEditKind);
      const selection = canvasTextEditSelection(editor.value, activeTextEditKind, focusMode);
      editor.setSelectionRange(selection.start, selection.end);
      editor.scrollTop = selection.scroll === "end" ? editor.scrollHeight : 0;
      editor.scrollLeft = selection.scrollX === "end" ? editor.scrollWidth : 0;
    },
    [activeTextEditKind, textEdit?.focusMode],
  );
  const setCanvasTextEditRef = useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      textEditRef.current = node;
      if (!node) return;
      window.requestAnimationFrame(() => {
        if (textEditRef.current === node) applyCanvasTextEditFocusSelection(node);
      });
      window.setTimeout(() => {
        if (textEditRef.current === node) applyCanvasTextEditFocusSelection(node);
      }, 0);
    },
    [applyCanvasTextEditFocusSelection],
  );
  useEffect(() => {
    if (showStartupEmptyCard && !activeSchematicIsEmpty(doc)) {
      setShowStartupEmptyCard(false);
    }
  }, [doc, showStartupEmptyCard]);
  useEffect(() => {
    if (!activeTextEditId || !activeTextEditKind) return;
    const component = page.components.find((c) => c.id === activeTextEditId);
    const probe = page.probes.find((p) => p.id === activeTextEditId);
    const subxTargetPage = component?.kind === "SUBX" ? subcircuitPageForInstance(docRef.current, component) : null;
    const subxPinPort =
      subxTargetPage && textEdit?.pinIndex !== undefined
        ? subcircuitPortComponents(subxTargetPage)[textEdit.pinIndex]
        : undefined;
    if (
      activeTextEditKind === "SUBX_PIN"
        ? !subxPinPort
        : activeTextEditKind === "PROBE"
        ? !probe
        : !component ||
          (activeTextEditKind !== "VALUE" &&
            activeTextEditKind !== "COMPONENT_LABEL" &&
            component.kind !== activeTextEditKind) ||
          (activeTextEditKind === "VALUE" && !isEditableComponentValue(component))
    ) {
      setTextEdit(null);
      return;
    }
    let followupFrame: number | null = null;
    const followupTimeouts: number[] = [];
    const applyFocusSelection = () => {
      const editor = textEditRef.current;
      if (!editor) return;
      applyCanvasTextEditFocusSelection(editor);
    };
    const frame = window.requestAnimationFrame(() => {
      applyFocusSelection();
      followupFrame = window.requestAnimationFrame(applyFocusSelection);
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 0));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 90));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 180));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 240));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 300));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 360));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 420));
      followupTimeouts.push(window.setTimeout(applyFocusSelection, 900));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (followupFrame !== null) window.cancelAnimationFrame(followupFrame);
      for (const timeout of followupTimeouts) window.clearTimeout(timeout);
    };
  }, [page.components, page.probes, activeTextEditId, activeTextEditKind, textEdit?.pinIndex, docRef, applyCanvasTextEditFocusSelection]);
  // Always-current refs to dodge stale closures inside global listeners.
  // (docRef is provided by useDocHistory above.)
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const handledShareHashRef = useRef(
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useWorkspacePersistence(workspace, doc, workspaceRef, docRef);

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
    setShowStartupEmptyCard(false);
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
    setShowStartupEmptyCard(false);
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
    setShowStartupEmptyCard(false);
    setStatus(`Created schematic: ${name}`);
  }

  function updateActivePageMeta(patch: Partial<Pick<SchematicPage, "name" | "description">>) {
    // Key the merge by which field is being typed so a name burst and a
    // description burst stay distinct undo steps.
    const field = "name" in patch ? "name" : "description";
    commit((d) => updatePageMeta(d, d.activePageId, patch), `page-meta:${field}`);
  }

  function resetInteractionState() {
    selectTool("select");
    setSelectedIds(new Set());
    setCursor(null);
  }

  function selectTool(nextTool: Tool) {
    clearToolGroupCloseTimer();
    setTool(nextTool);
    setActiveToolGroupId(null);
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
    pointerStart: [number, number];
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
            pointerStart: activeGesture?.pointerStart ?? next[next.length - 1],
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
    setSimulationStale(false);
    // Reset the slow-run gate so a fresh (e.g. just-cleared or freshly loaded)
    // circuit isn't held in the "paused — last run was slow" state inherited
    // from a previous, heavier circuit.
    setLastRunMs(null);
    setSelectedTraces(new Set());
    setLog("");
    setRunWarnings([]);
    setRunFloatingPins([]);
    setRunModelDiagnostics([]);
    setPlaying(false);
  }

  function invalidateSimulationState() {
    editGenerationRef.current += 1;
    const hadResult = Boolean(simResultRef.current || readingsRef.current);
    const wasRunning = runningRef.current;
    setReadings(null);
    setSimulationStale(Boolean(simResultRef.current));
    setRunWarnings([]);
    setRunFloatingPins([]);
    setRunModelDiagnostics([]);
    setPlaying(false);
    if (wasRunning) setRunning(false);
    if (hadResult || wasRunning) {
      setLog("");
      // Auto-run already has a re-run on the way, so the "rerun simulation"
      // nudge just flashes through and gets immediately overwritten by the
      // next "✓ tran1". Skip it in that case.
      if (!autoRun) setStatus("Modified — rerun simulation");
    }
  }

  function clearStaleRunOutput() {
    editGenerationRef.current += 1;
    latestRunIdRef.current += 1;
    setReadings(null);
    setSimResult(null);
    setSimulationStale(false);
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
  // Tracks the most recent merge-keyed commit so bursts of same-source edits
  // (e.g. typing into a field) coalesce into one undo step. See `commit`.
  const lastCommitMergeRef = useRef<{ key: string; at: number } | null>(null);
  // pastRef / futureRef / docRef are provided by useDocHistory.
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
  const noteResizeRef = useRef<typeof noteResize>(noteResize);
  noteResizeRef.current = noteResize;
  const subxResizeRef = useRef<typeof subxResize>(subxResize);
  subxResizeRef.current = subxResize;
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
    if (showProbing) {
      setEngineName("probing…");
      // Explicit refresh: re-arm the HTTP bridge probe so a dev bridge that
      // started after page load can be picked up without a reload.
      resetHttpProbe();
    }
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

  function historySnapshot(): HistorySnapshot {
    return docRef.current;
  }
  function restoreHistorySnapshot(snapshot: HistorySnapshot) {
    setDoc(snapshot);
    // Selection is preserved across undo/redo (it does not ride with history),
    // but drop ids that the restored doc no longer contains so we never keep a
    // ghost selection pointing at deleted objects.
    const restoredPage = currentPage(snapshot);
    const liveIds = new Set<string>([
      ...restoredPage.components.map((c) => c.id),
      ...restoredPage.wires.map((w) => w.id),
      ...restoredPage.probes.map((p) => p.id),
    ]);
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (liveIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }
  // Coalesce rapid same-source commits (e.g. typing into a value field) into a
  // single undo step. The first commit of a burst pushes the pre-edit doc;
  // subsequent commits with the same mergeKey within the window reuse that
  // entry (skip the push) so undo rewinds the whole burst, not one keystroke.
  function commit(updater: (d: CircuitDoc) => CircuitDoc, mergeKey?: string) {
    const now = performance.now();
    const last = lastCommitMergeRef.current;
    const merge =
      mergeKey != null && last?.key === mergeKey && now - last.at < COMMIT_MERGE_WINDOW_MS;
    if (!merge) pushPast(historySnapshot());
    lastCommitMergeRef.current = mergeKey != null ? { key: mergeKey, at: now } : null;
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
  /** Parse a SPICE-style netlist string and replace the current doc with it.
   *  Used by the paste-import modal. Accepts an `AbortSignal` for cancelling
   *  the (potentially slow) ELK auto-layout, and a `mode` to force the
   *  faster label-only fallback up front. */
  async function importNetlistFromText(
    text: string,
    opts: {
      signal?: AbortSignal;
      mode?: "auto" | "labels";
      /** Called as the import advances through phases — used by the
       *  paste-import modal to keep the spinner copy informative when
       *  the work bounces between the worker and the main thread. */
      onPhase?: (
        phase: "parsing" | "layout" | "routing" | "rendering",
        detail?: { current?: number; total?: number },
      ) => void;
    } = {},
  ): Promise<string[]> {
    if (!confirmDiscardIfDirty()) return [];
    opts.onPhase?.("parsing");
    const { importNetlist } = await loadNetlistImportModule();
    opts.onPhase?.("layout");
    const imported = await importNetlist(text, {
      signal: opts.signal,
      mode: opts.mode,
      // Forward routing/layout progress straight through.
      onPhase: (phase, detail) => opts.onPhase?.(phase, detail),
    });
    // Rendering 100+ fresh component subtrees in one React commit blocks
    // the main thread; give the spinner one paint to update its message
    // before the commit lands so the user sees "Rendering…" instead of a
    // mystery freeze.
    opts.onPhase?.("rendering");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    commit(() => normalizeDoc(imported.doc));
    setFilePath(null);
    setDiskDirty(true);
    resetInteractionState();
    clearSimulationState();
    setShowStartupEmptyCard(false);
    setWaveformVisible(false);
    const suffix = imported.warnings.length
      ? ` (${imported.warnings.length} warning${imported.warnings.length === 1 ? "" : "s"})`
      : "";
    setStatus(
      `Imported pasted netlist${imported.labelOnly ? " — label-only layout" : ""}${suffix}`,
    );
    window.setTimeout(fitToContent, 0);
    return imported.warnings;
  }
  function undo() {
    const p = pastRef.current;
    if (p.length === 0) return;
    // End any in-progress commit-merge burst so the next edit starts fresh.
    lastCommitMergeRef.current = null;
    const prev = p[p.length - 1];
    setPast(p.slice(0, -1));
    setFuture([historySnapshot(), ...futureRef.current]);
    restoreHistorySnapshot(prev);
    invalidateSimulationState();
  }
  function redo() {
    const f = futureRef.current;
    if (f.length === 0) return;
    lastCommitMergeRef.current = null;
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
    const activeNoteResize = noteResizeRef.current;
    const activeSubxResize = subxResizeRef.current;
    const hasInteraction = Boolean(
      activeDrag ||
        activeWireDrag ||
        activeScopeDrag ||
        activeNoteResize ||
        activeSubxResize ||
        placementDraftRef.current ||
        marqueeRef.current ||
        panningRef.current,
    );
    if (!hasInteraction) return false;

    const hasCommittedPreview = Boolean(
      activeDrag?.committed ||
        activeWireDrag?.committed ||
        activeScopeDrag?.committed ||
        activeNoteResize?.committed ||
        activeSubxResize?.committed,
    );
    if (hasCommittedPreview) {
      const snapshot = popLatestPast();
      if (snapshot) {
        setFuture([]);
        restoreHistorySnapshot(snapshot);
        invalidateSimulationState();
      }
    }

    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setSubxResize(null);
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
      setShowStartupEmptyCard(false);
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
        setShowStartupEmptyCard(false);
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
        setShowStartupEmptyCard(false);
        setWaveformVisible(false);
        setStatus(`Opened ${r.path}`);
        window.setTimeout(fitToContent, 0);
        break;
      }
      case "file:import_netlist": {
        // Paste-to-import: the file-open path is already covered by the
        // dedicated "Open" command, so this menu now surfaces a modal
        // with a textarea instead of a second file picker.
        setImportNetlistOpen(true);
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
        const r = buildNetlist(docRef.current, stableNodeNamesRef.current);
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
      const inEditableField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      const k = e.key.toLowerCase();
      const meta = e.metaKey || e.ctrlKey;

      // Undo/redo run from anywhere — they are doc-level. Controlled inputs
      // make the browser's native input-level undo unreliable anyway, so
      // intercepting ⌘Z here gives the user a single, consistent stack.
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

      // Every other shortcut yields to text editing inside form fields.
      if (inEditableField) return;
      if (e.code === "Space") {
        e.preventDefault();
        spacePanRef.current = true;
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
      if (!meta && (e.key === "Enter" || e.key === "F2") && selRef.current.size === 1) {
        if (beginSelectedTextEdit()) {
          e.preventDefault();
          return;
        }
      }
      if (!meta && selRef.current.size === 1 && beginSelectedTextEditFromTyping(e)) {
        e.preventDefault();
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
      if (k === "t" && !meta) {
        selectTool("NOTE");
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

  function probeLabelEditIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-probe-label-edit-id]")?.getAttribute("data-probe-label-edit-id") ?? null;
  }

  function probeIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-probe-id]")?.getAttribute("data-probe-id") ?? null;
  }

  function wireIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-wire-id]")?.getAttribute("data-wire-id") ?? null;
  }

  function componentIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-component-id]")?.getAttribute("data-component-id") ?? null;
  }

  function subxLabelEditIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-subx-label-edit-id]")?.getAttribute("data-subx-label-edit-id") ?? null;
  }

  function componentLabelEditIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-component-label-edit-id]")?.getAttribute("data-component-label-edit-id") ?? null;
  }

  function subxPinLabelIndexFromTarget(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    const raw = target.closest("[data-subx-pin-label-index]")?.getAttribute("data-subx-pin-label-index");
    if (raw == null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function targetInClass(target: EventTarget | null, className: string): boolean {
    return target instanceof Element && target.closest(`.${className}`) !== null;
  }

  function textEditTargetFromPointerTarget(
    target: EventTarget | null,
    targetComponent: CircuitComponent | null,
    targetProbe: Probe | null,
  ): CanvasClickEditTarget | undefined {
    if (targetProbe && (probeLabelEditIdFromTarget(target) || probeIdFromTarget(target))) {
      return { id: targetProbe.id, kind: "PROBE" };
    }
    if (!targetComponent) return undefined;
    const targetSubxPinLabelIndex = subxPinLabelIndexFromTarget(target);
    if (targetComponent.kind === "SUBX" && targetSubxPinLabelIndex !== null) {
      return {
        id: targetComponent.id,
        kind: "SUBX_PIN",
        pinIndex: targetSubxPinLabelIndex,
      };
    }
    if (componentLabelEditIdFromTarget(target) && targetComponent.kind !== "LABEL" && targetComponent.kind !== "NOTE") {
      return { id: targetComponent.id, kind: "COMPONENT_LABEL" };
    }
    if (targetComponent.kind === "LABEL" || targetComponent.kind === "NOTE") {
      return { id: targetComponent.id, kind: targetComponent.kind };
    }
    const clickedValueText =
      targetInClass(target, "component-value-label") ||
      targetInClass(target, "subx-body-label") ||
      Boolean(subxLabelEditIdFromTarget(target));
    if (clickedValueText && isEditableComponentValue(targetComponent)) {
      return { id: targetComponent.id, kind: "VALUE" };
    }
    return undefined;
  }

  function clickEditTargetForSelectionClick(
    target: EventTarget | null,
    hit: CircuitComponent | Wire | Probe | null,
    targetComponent: CircuitComponent | null,
    targetProbe: Probe | null,
    additive: boolean,
  ): CanvasClickEditTarget | undefined {
    if (additive || !hit || !selectedIds.has(hit.id)) return undefined;
    const editTarget = textEditTargetFromPointerTarget(target, targetComponent, targetProbe);
    return editTarget?.id === hit.id ? editTarget : undefined;
  }

  function isWireVertexHandleTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(".wire-vertex") !== null;
  }

  function isConnectionHandleTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest("[data-connection-handle='true']") !== null;
  }

  function noteResizeIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-note-resize-id]")?.getAttribute("data-note-resize-id") ?? null;
  }

  function subxResizeIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-subx-resize-id]")?.getAttribute("data-subx-resize-id") ?? null;
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
    routingContext?: {
      components: CircuitComponent[];
      wires: Wire[];
      ignoreComponentIds?: Set<string>;
    },
  ): Wire[] {
    return normalizeWireList(
      wires.map((w) => {
        const init = initialWires.get(w.id);
        if (!init) return w;
        if (movingWireIds.has(w.id)) {
          const anchors = movingWireAnchors.get(w.id) ?? {};
          const ignoreWireIds = new Set<string>([w.id]);
          return {
            ...w,
            points: routingContext
              ? moveWirePointsWithAnchorsAvoiding(init, dx, dy, anchors, orthogonal, {
                  components: routingContext.components,
                  wires: routingContext.wires,
                  ignoreComponentIds: routingContext.ignoreComponentIds,
                  ignoreWireIds,
                })
              : moveWirePointsWithAnchors(init, dx, dy, anchors, orthogonal),
          };
        }
        const attached = attachedWirePoints.get(w.id);
        if (!attached) return w;
        const ignoreWireIds = new Set<string>([w.id]);
        return {
          ...w,
          points: routingContext
            ? moveAttachedWirePointsAvoiding(init, attached, dx, dy, orthogonal, {
                components: routingContext.components,
                wires: routingContext.wires,
                ignoreComponentIds: routingContext.ignoreComponentIds,
                ignoreWireIds,
              })
            : moveAttachedWirePoints(init, attached, dx, dy, orthogonal),
        };
      }),
    );
  }

  function moveProbeOnChangedWirePath(
    attachment: { wireId: string; point: { x: number; y: number } },
    beforeWires: Map<string, [number, number][]>,
    afterWires: Wire[],
    dx: number,
    dy: number,
  ): { x: number; y: number } {
    const before = beforeWires.get(attachment.wireId);
    const after = afterWires.find((wire) => wire.id === attachment.wireId)?.points;
    if (before && after) {
      const moved = movePointBetweenWirePaths(attachment.point, before, after);
      if (moved) return moved;
    }
    return normalizePoint({ x: attachment.point.x + dx, y: attachment.point.y + dy });
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
    const movingComponentIds = new Set(activeDrag.initial.keys());
    const movedWires = applyMovedWires(
      baseWires,
      activeDrag.initialWires,
      activeDrag.movingWireIds,
      activeDrag.movingWireAnchors,
      activeDrag.attachedWirePoints,
      dx,
      dy,
      orthogonal,
      { components: nextComponents, wires: baseWires, ignoreComponentIds: movingComponentIds },
    );
    let nextProbes = sourcePage.probes.map((pr) => {
      const wireAttachment = activeDrag.movingWireProbeAttachments.get(pr.id);
      if (wireAttachment) {
        return {
          ...pr,
          ...moveProbeOnChangedWirePath(
            wireAttachment,
            activeDrag.initialWires,
            movedWires,
            dx,
            dy,
          ),
        };
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
      { ...sourcePage, components: nextComponents, wires: movedWires },
      movingComponentIds,
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

  function netLabelDragSnap(
    activeDrag: NonNullable<typeof drag>,
    dx: number,
    dy: number,
  ): { delta: { x: number; y: number }; target: ConnectionTarget | null } {
    const componentIds = [...activeDrag.initial.keys()].filter((id) =>
      page.components.some((component) => component.id === id),
    );
    if (componentIds.length !== 1) return { delta: { x: dx, y: dy }, target: null };
    const label = page.components.find((component) => component.id === componentIds[0]);
    if (!label || label.kind !== "LABEL") return { delta: { x: dx, y: dy }, target: null };
    const initial = activeDrag.initial.get(label.id);
    if (!initial) return { delta: { x: dx, y: dy }, target: null };

    const snap = snapNetLabelDrag(page, label.id, initial, activeDrag.startWorld, { x: dx, y: dy }, 0.7, {
      ...WIRING_SNAP,
      pinRadius: 0.8,
      wirePointRadius: 0.8,
      segmentRadius: 0.6,
      snapPoint,
    });
    return { delta: normalizePoint(snap.delta), target: snap.target };
  }

  function componentFromPlacementDraft(
    draft: NonNullable<typeof placementDraft>,
    id: string,
  ): { component: CircuitComponent; preset: MosfetPreset | null } {
    const subcircuitPage =
      draft.kind === "SUBX"
        ? docRef.current.pages.find((p) => p.id === selectedSubcircuitPageId && p.id !== docRef.current.activePageId)
        : null;
    const subcircuitParams = subcircuitPage ? subcircuitInstanceParamsForPage(subcircuitPage) : undefined;
    const base = componentFromDrag(
      draft.kind,
      draft.start,
      draft.end,
      id,
      subcircuitParams,
    );
    const noteCount = currentPage(docRef.current).components.filter((component) => component.kind === "NOTE").length;
    const withNoteDefaults = withDefaultNoteColor(base, noteCount);
    const withSubcircuit: CircuitComponent = subcircuitPage
      ? {
          ...withNoteDefaults,
          value: subcircuitPage.name,
          params: { ...withNoteDefaults.params, ...subcircuitParams },
        }
      : withNoteDefaults;
    const placementPresetKind = mosfetPresetKindForComponentKind(draft.kind);
    const placementPreset =
      placementPresetKind
        ? mosfetPresetById(
            mosfetPresets,
            selectedMosfetPresetId[placementPresetKind] || defaultMosfetPresetId(placementPresetKind),
            placementPresetKind,
          )
        : null;
    return {
      component: placementPreset ? applyMosfetPreset(withSubcircuit, placementPreset) : withSubcircuit,
      preset: placementPreset,
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

  function traceNameForWire(wireId: string): string | null {
    if (!simResultRef.current) return null;
    const wire = page.wires.find((candidate) => candidate.id === wireId);
    if (!wire) return null;
    for (const [x, y] of wire.points) {
      const node = pinAnnotations.nodes.posToNode.get(`${coordKey(x)},${coordKey(y)}`);
      if (!node || node === "0") continue;
      const trace = findNodeTrace(simResultRef.current.vectors, node, simResultRef.current.plot);
      if (trace) return trace.name;
    }
    return null;
  }

  function addWireTraceToScope(wireId: string) {
    const traceName = traceNameForWire(wireId);
    if (!traceName) return;
    setSelectedTraces((previous) => {
      const next = new Set(previous.size > 0 ? previous : userTraceNames);
      next.add(traceName);
      return next;
    });
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
    if (e.pointerType === "touch") {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Two simultaneous touches → start pinch-zoom. Cancel any in-flight
      // single-touch pan/drag so the gestures don't fight.
      if (activeTouchesRef.current.size === 2) {
        e.preventDefault();
        const [a, b] = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const centerScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const centerWorld = screenToWorld(centerScreen.x, centerScreen.y);
        pinchRef.current = { startDist: dist || 1, startZoom: zoom, centerWorld };
        setPanning(null);
        setDrag(null);
        setWireDrag(null);
        setScopeDrag(null);
        return;
      }
    }
    if (e.button === 1 || (e.button === 0 && (tool === "pan" || e.altKey || spacePanRef.current))) {
      e.preventDefault();
      capturePointer(e);
      setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    // Touch on empty canvas pans instead of starting a rubber-band selection.
    // Tap-to-select on a component still works because it routes through the
    // existing target-id handlers below before we reach the empty-canvas case.
    if (e.pointerType === "touch" && e.button === 0 && tool === "select") {
      const targetWire = wireIdFromTarget(e.target);
      const targetComp = componentIdFromTarget(e.target);
      const targetScope = scopeProbeIdFromTarget(e.target);
      if (!targetWire && !targetComp && !targetScope) {
        e.preventDefault();
        capturePointer(e);
        setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        return;
      }
    }
    if (e.button !== 0) return;
    if (tool === "select" && e.detail >= 2 && scheduleCanvasDoubleAction(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    capturePointer(e);
    const g = screenToGrid(e.clientX, e.clientY);
    const raw = screenToWorld(e.clientX, e.clientY);
    const targetWireId = wireIdFromTarget(e.target);
    const targetComponentId = componentIdFromTarget(e.target);
    const targetNoteResizeId = noteResizeIdFromTarget(e.target);
    const targetSubxResizeId = subxResizeIdFromTarget(e.target);

    if (tool === "select" && targetNoteResizeId) {
      const note = page.components.find(
        (component) => component.id === targetNoteResizeId && component.kind === "NOTE",
      );
      if (!note) return;
      const lines = noteTextLines(note.value);
      setSelectedIds(new Set([note.id]));
      setHoverId(null);
      setNoteResize({
        noteId: note.id,
        startWorld: raw,
        initialWidth: noteComponentWidth(note, lines),
        initialHeight: noteComponentHeight(note, lines),
        committed: false,
      });
      return;
    }

    if (tool === "select" && targetSubxResizeId) {
      const component = page.components.find(
        (candidate) => candidate.id === targetSubxResizeId && candidate.kind === "SUBX",
      );
      if (!component) return;
      const minHeight = subcircuitBodyHeight({ ...component, params: { ...component.params, h: "" } });
      setSelectedIds(new Set([component.id]));
      setHoverId(null);
      setSubxResize({
        componentId: component.id,
        startWorld: raw,
        initialWidth: subcircuitBodyWidth(component),
        initialHeight: subcircuitBodyHeight(component),
        minHeight,
        committed: false,
      });
      return;
    }

    const scopeProbeId = scopeProbeIdFromTarget(e.target);
    if (tool === "select" && scopeProbeId) {
      const probe = page.probes.find((p) => p.id === scopeProbeId);
      if (probe) {
        const nextSelected = nextSelectionForHit(probe.id, e.shiftKey);
        setSelectedIds(nextSelected);
        if (
          probeLabelEditIdFromTarget(e.target) ||
          !selectionClickStartsDrag(e.shiftKey) ||
          nextSelected.size === 0
        ) {
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
        updateWireGesture({
          start: target,
          pointerStart: [raw.x, raw.y],
          moved: false,
          mode: "wire-tool",
        });
      } else {
        const prev = activeDraft[activeDraft.length - 1];
        const route = [
          ...activeDraft,
          ...routeWireSegmentAvoiding(
            { x: prev[0], y: prev[1] },
            { x: target[0], y: target[1] },
            snapToGrid,
            { components: page.components, wires: page.wires },
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
      const targetProbeId = probeIdFromTarget(e.target);
      const targetProbe = targetProbeId
        ? page.probes.find((probe) => probe.id === targetProbeId) ?? null
        : null;
      const geometricHit = hitSelectable(raw.x, raw.y, targetWireId);
      const hit = pointerSelectionHit(geometricHit, targetComponent ?? targetProbe);
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
          pointerStart: [raw.x, raw.y],
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
        if (hitKindForItem(hit) === "wire") {
          addWireTraceToScope(hit.id);
        }
        const pointerTextTarget = textEditTargetFromPointerTarget(e.target, targetComponent, targetProbe);
        preferredTextEditTargetRef.current =
          !e.shiftKey && pointerTextTarget?.id === hit.id ? pointerTextTarget : null;
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
          clickEditTarget: clickEditTargetForSelectionClick(
            e.target,
            hit,
            targetComponent,
            targetProbe,
            e.shiftKey,
          ),
        });
      } else {
        // Begin marquee
        preferredTextEditTargetRef.current = null;
        if (!e.shiftKey) setSelectedIds(new Set());
        setMarquee({ sx: raw.x, sy: raw.y, ex: raw.x, ey: raw.y, additive: e.shiftKey });
      }
      return;
    }

    const kindTool = tool as ComponentKind;
    const subcircuitPage =
      kindTool === "SUBX"
        ? docRef.current.pages.find((p) => p.id === selectedSubcircuitPageId && p.id !== docRef.current.activePageId)
        : null;
    if (kindTool === "SUBX" && !subcircuitPage) {
      showCanvasNotice("Choose a schematic from the Subcircuits menu first.");
      selectTool("select");
      return;
    }
    if (kindTool === "SUBX" && subcircuitPage && subcircuitPortCount(subcircuitPage) === 0) {
      showCanvasNotice(`Add port labels to "${subcircuitPage.name}" before placing it as a subcircuit.`);
      return;
    }
    const pinCount = getPinLayout({ id: "__draft", kind: kindTool, x: 0, y: 0, rotation: 0, value: "" }).length;
    const start = placementShouldSnapToConnections(pinCount)
      ? pointerConnectionPoint(e.clientX, e.clientY, 1.0, WIRING_SNAP)
      : g;
    setPlacementDraft({ kind: kindTool, start, end: start });
    setSelectedIds(new Set());
    setHoverId(null);
  }

  function onCanvasPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    // Track moving touches so pinch-zoom math sees fresh positions.
    if (e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (pinch && activeTouchesRef.current.size >= 2) {
        e.preventDefault();
        const [a, b] = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = dist / pinch.startDist;
        const newZoom = Math.max(0.2, Math.min(8, pinch.startZoom * ratio));
        // Keep the world point originally under the pinch center stationary
        // under the (possibly moved) current pinch center.
        const centerScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const rect = svgRef.current!.getBoundingClientRect();
        setZoom(newZoom);
        setPan({
          x: centerScreen.x - rect.left - pinch.centerWorld.x * CELL * newZoom,
          y: centerScreen.y - rect.top - pinch.centerWorld.y * CELL * newZoom,
        });
        return;
      }
    }
    if (panning) {
      e.preventDefault();
      // Skip the React round-trip during an active pan: ~100 imported
      // components rerendering on every pointermove was the lag the user
      // reported. We just rewrite the root <g>'s transform attribute and
      // commit to state once on pointer-up.
      applyPanTransformImperative({
        x: e.clientX - panning.x,
        y: e.clientY - panning.y,
      });
      return;
    }
    const g = screenToGrid(e.clientX, e.clientY);
    const raw = screenToWorld(e.clientX, e.clientY);
    setCursor(g);
    if (tool === "wire" || isSinglePinSnappingTool(tool) || wireGestureRef.current) {
      setSnapTarget(nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP));
      const activeGesture = wireGestureRef.current;
      if (activeGesture && !activeGesture.moved) {
        // Measure pointer travel from the raw click point, not from the
        // snapped pin. A user clicking inside the snap radius (~0.36 units
        // off pin centre) hasn't dragged at all; measuring from `start`
        // would falsely report movement and commit a wire. Quick-wire
        // (Select tool) uses a generous threshold ≈ a component's pin-to-pin
        // length so an off-axis nudge can't trigger a wire — only a clear
        // pull-away from the component does. The dedicated Wire tool keeps
        // a small threshold since wires are the whole point there.
        const threshold = activeGesture.mode === "quick-wire" ? 4 : 0.35;
        const moved = movedBeyondThreshold(
          { x: activeGesture.pointerStart[0], y: activeGesture.pointerStart[1] },
          raw,
          threshold,
        );
        if (moved) updateWireGesture({ ...activeGesture, moved: true });
      }
    } else if (!wireDrag && !placementDraft && snapTarget) {
      setSnapTarget(null);
    }

    if (placementDraft) {
      const pinCount =
        getPinLayout({
          id: "__draft",
          kind: placementDraft.kind,
          x: 0,
          y: 0,
          rotation: 0,
          value: "",
        }).length;
      const snap = placementShouldSnapToConnections(pinCount)
        ? nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP)
        : null;
      setSnapTarget(snap ? { x: snap.x, y: snap.y } : null);
      setPlacementDraft({ ...placementDraft, end: normalizePoint(snap ?? g) });
      setHoverId(null);
      return;
    }

    if (noteResize) {
      setHoverId(null);
      const delta = noteResize.committed
        ? canvasDragDelta(noteResize.startWorld, raw, snapToGridRef.current)
        : canvasDragDeltaAfterThreshold(noteResize.startWorld, raw, snapToGridRef.current);
      if (!delta) return;
      const width = normalizeCoord(Math.max(2.8, noteResize.initialWidth + delta.x));
      const height = normalizeCoord(Math.max(1.4, noteResize.initialHeight + delta.y));
      if (
        !noteResize.committed &&
        width === noteResize.initialWidth &&
        height === noteResize.initialHeight
      ) {
        return;
      }
      if (!noteResize.committed) {
        pushPast(historySnapshot());
        setFuture([]);
        setNoteResize({ ...noteResize, committed: true });
      }
      previewMutate((d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          components: p.components.map((component) =>
            component.id === noteResize.noteId
              ? {
                  ...component,
                  params: {
                    ...component.params,
                    w: String(width),
                    h: String(height),
                  },
                }
              : component,
          ),
        })),
      );
      return;
    }

    if (subxResize) {
      setHoverId(null);
      const delta = subxResize.committed
        ? canvasDragDelta(subxResize.startWorld, raw, snapToGridRef.current)
        : canvasDragDeltaAfterThreshold(subxResize.startWorld, raw, snapToGridRef.current);
      if (!delta) return;
      const width = normalizeCoord(Math.max(3.4, subxResize.initialWidth + delta.x));
      const height = normalizeCoord(Math.max(subxResize.minHeight, subxResize.initialHeight + delta.y));
      if (
        !subxResize.committed &&
        width === subxResize.initialWidth &&
        height === subxResize.initialHeight
      ) {
        return;
      }
      if (!subxResize.committed) {
        pushPast(historySnapshot());
        setFuture([]);
        setSubxResize({ ...subxResize, committed: true });
      }
      previewMutate((d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          components: p.components.map((component) =>
            component.id === subxResize.componentId && component.kind === "SUBX"
              ? {
                  ...component,
                  params: {
                    ...component.params,
                    w: String(width),
                    h: String(height),
                  },
                }
              : component,
          ),
        })),
      );
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
              points: reshapeDraggedWirePointAvoiding(
                wireDrag.initialPoints,
                pointIdx,
                [nx, ny],
                !snapToGridRef.current,
                {
                  components: p.components,
                  wires: p.wires,
                  ignoreWireIds: new Set([wireId]),
                },
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
      const snap = netLabelDragSnap(drag, delta.x, delta.y);
      const { x: dx, y: dy } = snap.delta;
      if (dx === 0 && dy === 0 && !drag.committed) return;
      setSnapTarget(snap.target ? { x: snap.target.x, y: snap.target.y } : null);
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
    if (e.pointerType === "touch") {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) pinchRef.current = null;
    }
    if (panning) {
      // Pan was driven imperatively for low latency; flush the final
      // position into React state so anything reading `pan` from closure
      // (screen↔world math, sim, etc.) catches up.
      setPan(panRef.current);
    }
    setPanning(null);
    if (drag) {
      const activeDrag = drag;
      setDrag(null);
      if (activeDrag.committed) {
        const raw = screenToWorld(e.clientX, e.clientY);
        const delta = canvasDragDelta(
          activeDrag.startWorld,
          raw,
          snapToGridRef.current,
        );
        const snap = netLabelDragSnap(activeDrag, delta.x, delta.y);
        const { x: dx, y: dy } = snap.delta;
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
      } else if (activeDrag.clickEditTarget) {
        beginCanvasClickEditTarget(activeDrag.clickEditTarget);
      }
      setSnapTarget(null);
    }
    if (scopeDrag) {
      setScopeDrag(null);
    }
    if (noteResize) {
      setNoteResize(null);
    }
    if (subxResize) {
      setSubxResize(null);
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
      const pointerUpThreshold = activeWireGesture.mode === "quick-wire" ? 4 : 0.35;
      const moved =
        activeWireGesture.moved ||
        movedBeyondThreshold(
          { x: activeWireGesture.pointerStart[0], y: activeWireGesture.pointerStart[1] },
          raw,
          pointerUpThreshold,
        );
      if (moved) {
        const snap = nearestConnection(raw.x, raw.y, 1.0, WIRING_SNAP);
        const target = snap ? { x: snap.x, y: snap.y } : g;
        const start = activeWireDraft[activeWireDraft.length - 1];
        const route = [
          ...activeWireDraft,
          ...routeWireSegmentAvoiding(
            { x: start[0], y: start[1] },
            target,
            snapToGrid,
            { components: page.components, wires: page.wires },
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
      const { component: c, preset } = componentFromPlacementDraft(
        placementDraft,
        makeId(placementDraft.kind.toLowerCase()),
      );
      let insertedInline = false;
      let addedStubCount = 0;
      commit((d) => {
        const nextDoc = updateCurrentPage(d, (p) => {
          const pinCount = getPinLayout(c).length;
          const canInsertInline = placementCanInsertInline(pinCount, placementLength(placementDraft));
          const cutSpan = canInsertInline
            ? placementWireCutSpan(c, placementDraft.start, placementDraft.end)
            : null;
          let nextWires = cutSpan
            ? cutWireSegmentBetweenPoints(
                p.wires,
                [cutSpan.start.x, cutSpan.start.y],
                [cutSpan.end.x, cutSpan.end.y],
                () => makeId("w"),
              )
            : p.wires;
          insertedInline = cutSpan ? nextWires !== p.wires : false;
          const placementWires = placementConnectionWires(
            c,
            placementDraft.start,
            placementDraft.end,
            snapToGrid,
            insertedInline,
            () => makeId("w"),
            {
              components: [...p.components, c],
              wires: nextWires,
              ignoreComponentIds: new Set([c.id]),
            },
          );
          addedStubCount = placementWires.length;
          for (const w of placementWires) {
            nextWires = addWireWithJunctions({ wires: nextWires }, w).wires;
          }
          if (pinCount > 0) {
            for (let pinIdx = 0; pinIdx < pinCount; pinIdx++) {
              const pin = pinWorldPos(c, pinIdx);
              nextWires = splitWiresAtPoint(nextWires, [pin.x, pin.y]);
            }
          }
          const nextProbes = insertedInline && cutSpan
            ? moveProbesFromInsertedWireSpan(p.probes, c, cutSpan, placementWires)
            : p.probes;
          return { ...p, components: [...p.components, c], wires: nextWires, probes: nextProbes };
        });
        return preset ? ensureBuiltinModelDirective(nextDoc, preset.model) : nextDoc;
      });
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
      if (placementShouldBeginTextEdit(c.kind)) {
        beginTextEdit(c);
      }
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
      const autoFormatCount = wireIdsForAutoFormat(page, working).size;
      if (hasSelectedComponents) {
        items.push({ label: "Rotate", shortcut: "⇧R", onSelect: () => rotateSelected() });
        items.push({ label: "Mirror ↔ (horizontal)", onSelect: () => mirrorSelected() });
        items.push({ label: "Flip ↕ (vertical)", onSelect: () => flipVerticalSelected() });
      }
      items.push(
        { label: "Fit Selection", shortcut: "⇧2", onSelect: () => fitSelectionToContent() },
        {
          label: "Auto arrange selection",
          disabled: !hasSelectedComponents,
          onSelect: () => {
            void autoArrangeSchematic(working);
          },
        },
        {
          label: "Auto format wiring",
          disabled: autoFormatCount === 0,
          onSelect: () => autoFormatWiring(working),
        },
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
          label: "Auto arrange schematic",
          onSelect: () => {
            void autoArrangeSchematic(new Set());
          },
        },
        { label: "Auto format wiring", onSelect: () => autoFormatWiring(new Set()) },
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

  function hasCanvasDoubleAction(target: EventTarget | null): boolean {
    const targetComponentLabelEditId = componentLabelEditIdFromTarget(target);
    if (
      targetComponentLabelEditId &&
      page.components.some((c) => c.id === targetComponentLabelEditId && c.kind !== "LABEL" && c.kind !== "NOTE")
    ) {
      return true;
    }
    const targetSubxLabelEditId = subxLabelEditIdFromTarget(target);
    if (targetSubxLabelEditId && page.components.some((c) => c.id === targetSubxLabelEditId && c.kind === "SUBX")) {
      return true;
    }
    const targetSubxPinLabelIndex = subxPinLabelIndexFromTarget(target);
    const targetComponentId = componentIdFromTarget(target);
    if (targetComponentId) {
      const component = page.components.find((c) => c.id === targetComponentId);
      if (component?.kind === "SUBX" && targetSubxPinLabelIndex !== null) {
        const targetPage = subcircuitPageForInstance(docRef.current, component);
        if (targetPage && subcircuitPortComponents(targetPage).length > targetSubxPinLabelIndex) return true;
      }
      if (component?.kind === "LABEL" || component?.kind === "NOTE" || component?.kind === "SUBX") return true;
      if (component && isEditableComponentValue(component)) return true;
    }
    const targetProbeId = probeLabelEditIdFromTarget(target) ?? probeIdFromTarget(target) ?? scopeProbeIdFromTarget(target);
    return Boolean(targetProbeId && page.probes.some((p) => p.id === targetProbeId));
  }

  function scheduleCanvasDoubleAction(target: EventTarget | null): boolean {
    if (!hasCanvasDoubleAction(target)) return false;
    if (pendingCanvasDoubleActionRef.current !== null) {
      window.clearTimeout(pendingCanvasDoubleActionRef.current);
    }
    pendingCanvasDoubleActionRef.current = window.setTimeout(() => {
      pendingCanvasDoubleActionRef.current = null;
      handleCanvasDoubleAction(target);
    }, 80);
    return true;
  }
  // Stable reference for memoised children: each Editor render re-creates
  // `scheduleCanvasDoubleAction`, which would defeat React.memo. Routing
  // through a ref keeps the prop reference identical across renders while
  // the body still sees the latest closure.
  const scheduleCanvasDoubleActionRef = useRef(scheduleCanvasDoubleAction);
  scheduleCanvasDoubleActionRef.current = scheduleCanvasDoubleAction;
  const scheduleCanvasDoubleActionStable = useCallback(
    (target: EventTarget | null) => scheduleCanvasDoubleActionRef.current(target),
    [],
  );

  function handleCanvasDoubleAction(target: EventTarget | null): boolean {
    if (pendingCanvasDoubleActionRef.current !== null) {
      window.clearTimeout(pendingCanvasDoubleActionRef.current);
      pendingCanvasDoubleActionRef.current = null;
    }
    const targetComponentLabelEditId = componentLabelEditIdFromTarget(target);
    if (targetComponentLabelEditId) {
      const component = page.components.find((c) => c.id === targetComponentLabelEditId && c.kind !== "LABEL" && c.kind !== "NOTE");
      if (component) {
        beginComponentLabelEdit(component);
        return true;
      }
    }
    const targetSubxLabelEditId = subxLabelEditIdFromTarget(target);
    if (targetSubxLabelEditId) {
      const component = page.components.find((c) => c.id === targetSubxLabelEditId && c.kind === "SUBX");
      if (component) {
        beginValueEdit(component);
        return true;
      }
    }
    const targetComponentId = componentIdFromTarget(target);
    if (targetComponentId) {
      const component = page.components.find((c) => c.id === targetComponentId);
      const targetSubxPinLabelIndex = subxPinLabelIndexFromTarget(target);
      if (component?.kind === "SUBX" && targetSubxPinLabelIndex !== null) {
        beginSubxPinLabelEdit(component, targetSubxPinLabelIndex);
        return true;
      }
      if (component?.kind === "LABEL" || component?.kind === "NOTE") {
        beginTextEdit(component);
        return true;
      }
      if (component?.kind === "SUBX") {
        if (targetInClass(target, "subx-body-label")) {
          beginValueEdit(component);
          return true;
        }
        const targetPage = subcircuitPageForInstance(docRef.current, component);
        if (!targetPage) {
          showCanvasNotice(`No schematic named "${component.value || "subcircuit"}"`);
          return true;
        }
        commit((d) => ({ ...d, activePageId: targetPage.id }));
        resetInteractionState();
        setStatus(`Opened subcircuit: ${targetPage.name}`);
        return true;
      }
      if (component && isEditableComponentValue(component)) {
        beginValueEdit(component);
        return true;
      }
    }
    const targetProbeId = probeLabelEditIdFromTarget(target) ?? probeIdFromTarget(target) ?? scopeProbeIdFromTarget(target);
    if (targetProbeId) {
      const probe = page.probes.find((p) => p.id === targetProbeId);
      if (probe) {
        beginProbeLabelEdit(probe);
        return true;
      }
    }
    return false;
  }

  function onCanvasDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (scheduleCanvasDoubleAction(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
  // Ref to the root <g> so an active pan can write the transform directly
  // via DOM instead of triggering a React re-render of ~100 components per
  // pointermove. We commit the final pan to React state on pointer-up so
  // every other code path that reads `pan` from closure stays consistent.
  const panGroupRef = useRef<SVGGElement | null>(null);
  function applyPanTransformImperative(next: { x: number; y: number }) {
    panRef.current = next;
    const g = panGroupRef.current;
    if (g) {
      g.setAttribute(
        "transform",
        `translate(${next.x} ${next.y}) scale(${CELL * zoomRef.current})`,
      );
    }
  }
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
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
        // Two-finger scroll -> pan using natural trackpad direction.
        setPan(applyWheelPan(panRef.current, e.deltaX, e.deltaY));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Rotate / mirror / flip all share the same wire- and probe-rerouting
  // machinery; they differ only in how each selected component is mutated.
  // `mutate` is applied both when measuring pin movement and when rewriting
  // the components, so the two always agree.
  function transformSelected(
    mutate: (c: CircuitComponent) => CircuitComponent,
    selection: Set<string> = selectedIds,
  ) {
    if (selection.size === 0) return;
    const selected = new Set(selection);
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const pinMoves = collectTransformedPinMoves(p.components, selected, mutate);
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
        const nextComponents = p.components.map((c) => (selected.has(c.id) ? mutate(c) : c));
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

  function rotateSelected(selection: Set<string> = selectedIds) {
    transformSelected((c) => ({ ...c, rotation: rotateNext(c.rotation) }), selection);
  }

  function mirrorSelected(selection: Set<string> = selectedIds) {
    transformSelected((c) => ({ ...c, mirrored: c.mirrored ? undefined : true }), selection);
  }

  function flipVerticalSelected(selection: Set<string> = selectedIds) {
    transformSelected(
      (c) => ({ ...c, mirrored: c.mirrored ? undefined : true, rotation: flipRotation(c.rotation) }),
      selection,
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
    commit((d) =>
      updateCurrentPage(d, (page) => {
        const nextComponents = page.components.map((c) => {
          const init = initial.get(c.id);
          if (!init) return c;
          return { ...c, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        const movedWires = applyMovedWires(
          page.wires,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          attachedWirePoints,
          dx,
          dy,
          snapToGridRef.current,
          { components: nextComponents, wires: page.wires, ignoreComponentIds: selected },
        );
        let nextProbes = page.probes.map((pr) => {
          const wireAttachment = movingWireProbeAttachments.get(pr.id);
          if (wireAttachment) {
            return {
              ...pr,
              ...moveProbeOnChangedWirePath(wireAttachment, initialWires, movedWires, dx, dy),
            };
          }
          const init = initial.get(pr.id);
          if (!init) return pr;
          return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        const contactWires = buildTranslatedPinContactWires(
          directContactPins,
          dx,
          dy,
          snapToGridRef.current,
          { ...page, components: nextComponents, wires: movedWires },
          selected,
        );
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

  function autoFormatWiring(selection: Set<string> = selectedIds) {
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const targetWireIds = wireIdsForAutoFormat(p, selection);
        if (targetWireIds.size === 0) return p;
        const formattedPage = autoFormatWiresAvoiding(p, targetWireIds);
        return {
          ...formattedPage,
          wires: pruneUnanchoredWireJunctions(formattedPage.wires, p.components, p.probes),
        };
      }),
    );
    const count = wireIdsForAutoFormat(page, selection).size;
    setStatus(count > 0 ? `Auto-formatted ${count} wire${count === 1 ? "" : "s"}` : "No wires to format");
  }

  async function autoArrangeSchematic(selection: Set<string> = selectedIds) {
    const sourcePage = currentPage(docRef.current);
    const { autoArrangePage } = await loadAutoLayoutModule();
    const result = await autoArrangePage(sourcePage, selection);
    if (result.movedComponentIds.length === 0) {
      setStatus("No components to arrange");
      return;
    }
    commit((d) =>
      updateCurrentPage(d, (p) => (p.id === sourcePage.id ? result.page : p)),
    );
    const scope = selection.size > 0 ? "selection" : "schematic";
    const wireText = result.formattedWireIds.length === 1 ? "wire" : "wires";
    setStatus(
      `Auto-arranged ${scope} and formatted ${result.formattedWireIds.length} ${wireText}`,
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
    commit(
      (d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          components: p.components.map((c) => (c.id === id ? { ...c, value } : c)),
        })),
      `value:${id}`,
    );
  }

  // Swap a passive in place (R↔C↔L) without rewiring: the rotation is
  // adjusted so both pins stay at their current world positions, and the
  // value resets to the new kind's default since the unit family changes.
  function changeComponentKind(id: string, kind: ComponentKind) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) =>
          c.id === id
            ? {
                ...c,
                kind,
                value: defaultValue(kind),
                rotation: rotationForKindSwap(c.kind, kind, c.rotation),
              }
            : c,
        ),
      })),
    );
    setStatus(`Changed type to ${COMPONENT_LABELS[kind]}`);
  }

  function updateComponentLabel(id: string, label: string) {
    commit(
      (d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          components: p.components.map((c) =>
            c.id === id ? { ...c, label: label.trim() ? label : undefined } : c,
          ),
        })),
      `label:${id}`,
    );
  }

  function beginTextEdit(
    component: CircuitComponent,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ) {
    if (component.kind !== "LABEL" && component.kind !== "NOTE") return;
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = performance.now();
    setSelectedIds(new Set([component.id]));
    setTool("select");
    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setPlacementDraft(null);
    setWireDraft(null);
    updateWireGesture(null);
    setTextEdit({
      componentId: component.id,
      kind: component.kind,
      value: options.value ?? component.value,
      focusMode: options.focusMode,
    });
  }

  function beginValueEdit(
    component: CircuitComponent,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ) {
    if (!isEditableComponentValue(component)) return;
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = performance.now();
    setSelectedIds(new Set([component.id]));
    setTool("select");
    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setPlacementDraft(null);
    setWireDraft(null);
    updateWireGesture(null);
    setTextEdit({
      componentId: component.id,
      kind: "VALUE",
      value: options.value ?? component.value,
      focusMode: options.focusMode,
    });
  }

  function beginComponentLabelEdit(
    component: CircuitComponent,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ) {
    if (component.kind === "LABEL" || component.kind === "NOTE") return;
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = performance.now();
    setSelectedIds(new Set([component.id]));
    setTool("select");
    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setPlacementDraft(null);
    setWireDraft(null);
    updateWireGesture(null);
    setTextEdit({
      componentId: component.id,
      kind: "COMPONENT_LABEL",
      value: options.value ?? component.label ?? "",
      focusMode: options.focusMode,
    });
  }

  function beginProbeLabelEdit(
    probe: Probe,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ) {
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = performance.now();
    setSelectedIds(new Set([probe.id]));
    setTool("select");
    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setPlacementDraft(null);
    setWireDraft(null);
    updateWireGesture(null);
    setTextEdit({
      componentId: probe.id,
      kind: "PROBE",
      value: options.value ?? probe.label ?? "",
      focusMode: options.focusMode,
    });
  }

  function beginSubxPinLabelEdit(
    component: CircuitComponent,
    pinIndex: number,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ) {
    if (component.kind !== "SUBX") return;
    const targetPage = subcircuitPageForInstance(docRef.current, component);
    const port = targetPage ? subcircuitPortComponents(targetPage)[pinIndex] : undefined;
    if (!targetPage || !port) return;
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = performance.now();
    setSelectedIds(new Set([component.id]));
    setTool("select");
    setDrag(null);
    setWireDrag(null);
    setScopeDrag(null);
    setNoteResize(null);
    setPlacementDraft(null);
    setWireDraft(null);
    updateWireGesture(null);
    setTextEdit({
      componentId: component.id,
      kind: "SUBX_PIN",
      value: options.value ?? port.value,
      focusMode: options.focusMode,
      pinIndex,
    });
  }

  function beginCanvasClickEditTarget(
    target: CanvasClickEditTarget,
    options: { value?: string; focusMode?: CanvasTextEditFocusMode } = {},
  ): boolean {
    const activePage = currentPage(docRef.current);
    if (target.kind === "PROBE") {
      const probe = activePage.probes.find((candidate) => candidate.id === target.id);
      if (!probe) return false;
      beginProbeLabelEdit(probe, options);
      return true;
    }
    const component = activePage.components.find((candidate) => candidate.id === target.id);
    if (!component) return false;
    if (target.kind === "LABEL" || target.kind === "NOTE") {
      if (component.kind !== target.kind) return false;
      beginTextEdit(component, options);
      return true;
    }
    if (target.kind === "VALUE") {
      if (!isEditableComponentValue(component)) return false;
      beginValueEdit(component, options);
      return true;
    }
    if (target.kind === "COMPONENT_LABEL") {
      if (component.kind === "LABEL" || component.kind === "NOTE") return false;
      beginComponentLabelEdit(component, options);
      return true;
    }
    if (target.kind === "SUBX_PIN") {
      if (component.kind !== "SUBX" || target.pinIndex == null) return false;
      beginSubxPinLabelEdit(component, target.pinIndex, options);
      return true;
    }
    return false;
  }

  function beginSelectedTextEdit(initialValue?: string): boolean {
    const focusMode = initialValue === undefined ? undefined : "end";
    const [selectedId] = Array.from(selRef.current);
    if (!selectedId) return false;
    const preferredTarget = preferredTextEditTargetRef.current;
    if (
      preferredTarget?.id === selectedId &&
      beginCanvasClickEditTarget(preferredTarget, { value: initialValue, focusMode })
    ) {
      return true;
    }
    const activePage = currentPage(docRef.current);
    const component = activePage.components.find((candidate) => candidate.id === selectedId);
    if (component) {
      if (component.kind === "LABEL" || component.kind === "NOTE") {
        beginTextEdit(component, { value: initialValue, focusMode });
        return true;
      }
      if (isEditableComponentValue(component)) {
        beginValueEdit(component, { value: initialValue, focusMode });
        return true;
      }
      return false;
    }
    const probe = activePage.probes.find((candidate) => candidate.id === selectedId);
    if (!probe) return false;
    beginProbeLabelEdit(probe, { value: initialValue, focusMode });
    return true;
  }

  function beginSelectedTextEditFromTyping(e: KeyboardEvent): boolean {
    const initialValue = directTextEditInitialValue(e);
    if (initialValue === null) return false;
    const [selectedId] = Array.from(selRef.current);
    if (!selectedId) return false;
    const preferredTarget = preferredTextEditTargetRef.current;
    if (
      preferredTarget?.id === selectedId &&
      beginCanvasClickEditTarget(preferredTarget, { value: initialValue, focusMode: "end" })
    ) {
      return true;
    }
    const activePage = currentPage(docRef.current);
    const component = activePage.components.find((candidate) => candidate.id === selectedId);
    if (component) {
      if (component.kind === "LABEL" || component.kind === "NOTE") {
        return beginSelectedTextEdit(initialValue);
      }
      if (canStartCanvasValueEditFromTyping(component.kind, component.value, initialValue)) {
        return beginSelectedTextEdit(initialValue);
      }
      beginComponentLabelEdit(component, { value: initialValue, focusMode: "end" });
      return true;
    }
    const probe = activePage.probes.find((candidate) => candidate.id === selectedId);
    return Boolean(probe && beginSelectedTextEdit(initialValue));
  }

  function cancelTextEdit() {
    textEditCancelBlurRef.current = true;
    textEditOpenedAtRef.current = 0;
    setTextEdit(null);
  }

  function commitTextEdit(
    value = textEdit?.value ?? "",
    options: { keepOpenOnRequiredEmpty?: boolean } = {},
  ) {
    textEditCancelBlurRef.current = false;
    textEditOpenedAtRef.current = 0;
    if (!textEdit) return;
    const nextValue = normalizeCanvasTextEditCommitValue(value, textEdit.kind);
    if (!nextValue && canvasTextEditRequiresNonEmptyCommit(textEdit.kind)) {
      const message =
        textEdit.kind === "LABEL"
          ? "Net label text cannot be empty"
          : textEdit.kind === "SUBX_PIN"
            ? "Subcircuit pin label cannot be empty"
            : "Component value cannot be empty";
      setStatus(message);
      if (options.keepOpenOnRequiredEmpty) {
        textEditOpenedAtRef.current = performance.now();
        setTextEdit((edit) => (edit ? { ...edit, value, focusMode: "select-all" } : edit));
        window.requestAnimationFrame(() => textEditRef.current?.focus());
        return;
      }
      setTextEdit(null);
      return;
    }
    if (textEdit.kind === "PROBE") {
      const probe = page.probes.find((p) => p.id === textEdit.componentId);
      const current = probe?.label?.trim() ?? "";
      if (probe && current !== nextValue) {
        updateProbeLabel(textEdit.componentId, nextValue);
        setStatus(nextValue ? "Probe label updated" : "Probe label cleared");
      }
      setTextEdit(null);
      return;
    }
    if (textEdit.kind === "SUBX_PIN") {
      const instance = page.components.find((c) => c.id === textEdit.componentId && c.kind === "SUBX");
      const targetPage = instance ? subcircuitPageForInstance(docRef.current, instance) : null;
      const port = targetPage && textEdit.pinIndex !== undefined
        ? subcircuitPortComponents(targetPage)[textEdit.pinIndex]
        : undefined;
      if (targetPage && port && port.value !== nextValue) {
        commit((d) => ({
          ...d,
          pages: d.pages.map((candidate) =>
            candidate.id === targetPage.id
              ? {
                  ...candidate,
                  components: candidate.components.map((component) =>
                    component.id === port.id ? { ...component, value: nextValue } : component,
                  ),
                }
              : candidate,
          ),
        }));
        setStatus(`Subcircuit pin ${textEdit.pinIndex! + 1} label updated`);
      }
      setTextEdit(null);
      return;
    }
    const component = page.components.find((c) => c.id === textEdit.componentId);
    if (textEdit.kind === "COMPONENT_LABEL") {
      const current = component?.label?.trim() ?? "";
      if (component && current !== nextValue) {
        updateComponentLabel(textEdit.componentId, nextValue);
        setStatus(nextValue ? "Component label updated" : "Component label cleared");
      }
      setTextEdit(null);
      return;
    }
    if (component && component.value !== nextValue) {
      updateValue(textEdit.componentId, nextValue);
      setStatus(textEdit.kind === "VALUE" ? "Component value updated" : `${COMPONENT_LABELS[textEdit.kind]} updated`);
    }
    setTextEdit(null);
  }

  function onTextEditKeyDown(e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.stopPropagation();
    if (!textEdit) return;
    if (shouldRestoreCanvasTextSelectionBeforeInput({
      kind: textEdit.kind,
      key: e.key,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      elapsedMs: performance.now() - textEditOpenedAtRef.current,
    })) {
      const selection = canvasTextEditSelection(
        e.currentTarget.value,
        textEdit.kind,
        textEdit.focusMode ?? defaultCanvasTextEditFocusMode(textEdit.kind),
      );
      e.currentTarget.setSelectionRange(selection.start, selection.end);
      textEditOpenedAtRef.current = 0;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelTextEdit();
      return;
    }
    if (
      (textEdit.kind === "LABEL" ||
        textEdit.kind === "VALUE" ||
        textEdit.kind === "PROBE" ||
        textEdit.kind === "SUBX_PIN" ||
        textEdit.kind === "COMPONENT_LABEL") &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      commitTextEdit(undefined, { keepOpenOnRequiredEmpty: true });
      return;
    }
    if (textEdit.kind === "NOTE" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitTextEdit();
    }
  }

  function updateComponentModel(id: string, value: string) {
    commit((d) => {
      const nextDoc = updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) => (c.id === id ? { ...c, value } : c)),
      }));
      return ensureBuiltinModelDirective(nextDoc, value);
    });
  }

  function addSharedModel(type: ModelDeviceType) {
    const model: ModelDefinition = {
      name: uniqueModelName(modelDefinitions, `${type}_MODEL`),
      type,
      params: defaultModelParams(type),
    };
    commit((d) => ({
      ...d,
      directives: upsertModelDefinition(d.directives, model),
    }));
    setStatus(`Added model: ${model.name}`);
  }

  function updateSharedModel(previous: ModelDefinition, next: ModelDefinition) {
    const normalized = normalizeModelDefinition(next);
    if (!normalized) return;
    commit((d) => updateModelDefinitionInDoc(d, previous, normalized));
  }

  function removeSharedModel(model: ModelDefinition) {
    commit((d) => removeModelDefinitionInDoc(d, model));
    setStatus(`Removed model: ${model.name}`);
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
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const nextComponents = p.components.map((c) =>
          c.id === id ? { ...c, ...normalizePoint({ x: c.x + dx, y: c.y + dy }) } : c,
        );
        const movedWires = applyMovedWires(
          p.wires,
          initialWires,
          movingWireIds,
          movingWireAnchors,
          attachedWirePoints,
          dx,
          dy,
          snapToGridRef.current,
          { components: nextComponents, wires: p.wires, ignoreComponentIds: new Set([id]) },
        );
        let nextProbes = p.probes.map((pr) => {
          const wireAttachment = movingWireProbeAttachments.get(pr.id);
          if (wireAttachment) {
            return {
              ...pr,
              ...moveProbeOnChangedWirePath(wireAttachment, initialWires, movedWires, dx, dy),
            };
          }
          const init = initial.get(pr.id);
          if (!init) return pr;
          return { ...pr, ...normalizePoint({ x: init.x + dx, y: init.y + dy }) };
        });
        const contactWires = buildTranslatedPinContactWires(
          directContactPins,
          dx,
          dy,
          snapToGridRef.current,
          { ...p, components: nextComponents, wires: movedWires },
          new Set([id]),
        );
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
    commit(
      (d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          components: p.components.map((c) =>
            c.id === id
              ? { ...c, params: { ...(c.params ?? {}), [key]: value } }
              : c,
          ),
        })),
      `param:${id}:${key}`,
    );
  }

  function updateSubcircuitPinSides(id: string, pinSides: string) {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) => {
          if (c.id !== id || c.kind !== "SUBX") return c;
          const params = { ...(c.params ?? {}) };
          if (/^[LRTB]+$/.test(pinSides)) params.pinSides = pinSides;
          else delete params.pinSides;
          return { ...c, params };
        }),
      })),
    );
  }

  function updateSubcircuitPinSide(id: string, pinIdx: number, side: "L" | "R" | "T" | "B") {
    const component = page.components.find((c) => c.id === id && c.kind === "SUBX");
    if (!component) return;
    const sides = effectiveSubcircuitPinSidesForInstance(component);
    if (pinIdx < 0 || pinIdx >= sides.length) return;
    sides[pinIdx] = side;
    updateSubcircuitPinSides(id, sides.join(""));
  }

  function resetSubcircuitPinSides(id: string) {
    const component = page.components.find((c) => c.id === id && c.kind === "SUBX");
    if (!component) return;
    const subPage = subcircuitPageForInstance(docRef.current, component);
    const next = subPage ? subcircuitInstanceParamsForPage(subPage).pinSides ?? "" : "";
    updateSubcircuitPinSides(id, next);
  }

  function updateLabelPortSide(id: string, side: "L" | "R" | "T" | "B" | "") {
    commit((d) =>
      updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) => {
          if (c.id !== id || c.kind !== "LABEL") return c;
          const params = { ...(c.params ?? {}) };
          if (side) params.portSide = side;
          else delete params.portSide;
          return { ...c, params };
        }),
      })),
    );
  }

  function setLabelPort(id: string, enabled: boolean) {
    commit((d) =>
      updateCurrentPage(d, (p) => {
        const existingOrders = p.components
          .filter((component) => component.id !== id && component.kind === "LABEL" && component.params?.port === "1")
          .map((component) => parsePortOrder(component.params?.portOrder) ?? 0);
        const nextOrder = Math.max(0, ...existingOrders) + 1;
        return {
          ...p,
          components: p.components.map((c) => {
            if (c.id !== id) return c;
            const params = { ...(c.params ?? {}) };
            if (enabled) {
              params.port = "1";
              if (!parsePortOrder(params.portOrder)) params.portOrder = String(nextOrder);
            } else {
              params.port = "0";
              delete params.portOrder;
              delete params.portSide;
            }
            return { ...c, params };
          }),
        };
      }),
    );
  }

  function applyPresetToComponent(id: string, presetId: string) {
    const component = page.components.find((c) => c.id === id);
    const presetKind = component ? mosfetPresetKindForComponentKind(component.kind) : null;
    if (!component || !presetKind) return;
    const preset = mosfetPresetById(mosfetPresets, presetId, presetKind);
    if (!preset) return;
    commit((d) => {
      const nextDoc = updateCurrentPage(d, (p) => ({
        ...p,
        components: p.components.map((c) =>
          c.id === id ? applyMosfetPreset(c, preset) : c,
        ),
      }));
      return ensureBuiltinModelDirective(nextDoc, preset.model);
    });
    setSelectedMosfetPresetId((prev) => ({ ...prev, [preset.kind]: preset.id }));
    setStatus(`Applied preset: ${preset.name}`);
  }

  function persistCustomMosfetPreset(component: CircuitComponent, name: string): MosfetPreset | null {
    const preset = mosfetPresetFromComponent(component, name);
    if (!preset) return null;
    const next = mergeMosfetPresets([...customMosfetPresets, preset], []);
    setCustomMosfetPresets(next);
    saveCustomMosfetPresets(next);
    setSelectedMosfetPresetId((prev) => ({ ...prev, [preset.kind]: preset.id }));
    updateParam(component.id, "preset", preset.id);
    return preset;
  }

  function saveSelectedMosfetPreset(component: CircuitComponent) {
    const presetKind = mosfetPresetKindForComponentKind(component.kind);
    if (!presetKind) return;
    const name = window.prompt("Preset name", `${presetKind} custom`);
    const preset = persistCustomMosfetPreset(component, name ?? "");
    if (!preset) return;
    setStatus(`Saved preset: ${preset.name}`);
  }

  function setDefaultMosfetPreset(kind: "NMOS" | "PMOS", presetId: string) {
    const preset = mosfetPresetById(mosfetPresets, presetId, kind);
    if (!preset) return;
    writeDefaultMosfetPresetId(kind, preset.id);
    setSelectedMosfetPresetId((prev) => ({ ...prev, [kind]: preset.id }));
    setStatus(`Default ${kind} preset: ${preset.name}`);
  }

  function setDefaultMosfetPresetForComponent(component: CircuitComponent) {
    const presetKind = mosfetPresetKindForComponentKind(component.kind);
    if (!presetKind) return;
    const matchingPreset = mosfetPresets.find((preset) =>
      componentMatchesMosfetPreset(component, preset),
    );
    if (matchingPreset) {
      if (component.params?.preset !== matchingPreset.id) {
        updateParam(component.id, "preset", matchingPreset.id);
      }
      setDefaultMosfetPreset(presetKind, matchingPreset.id);
      return;
    }

    const name = window.prompt("Preset name", `${presetKind} custom`);
    const preset = persistCustomMosfetPreset(component, name ?? "");
    if (!preset) return;
    setDefaultMosfetPreset(preset.kind, preset.id);
    setStatus(`Saved and set default: ${preset.name}`);
  }

  function updateProbeLabel(id: string, label: string) {
    commit(
      (d) =>
        updateCurrentPage(d, (p) => ({
          ...p,
          probes: p.probes.map((probe) =>
            probe.id === id ? { ...probe, label: label.trim() ? label : undefined } : probe,
          ),
        })),
      `probe-label:${id}`,
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
    const next = collectSelectedTopology(p, selRef.current);
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
    const { components: comps, wires, probes } = collectSelectedTopology(p, selRef.current);
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
  copyShareLinkRef.current = copyShareLink;

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
      setRunModelDiagnostics([]);
      return;
    }
    if (currentPage(docRef.current).components.length === 0) {
      clearStaleRunOutput();
      setStatus("✗ Place at least one component from the palette before running.");
      setRunWarnings([]);
      setRunFloatingPins([]);
      setRunModelDiagnostics([]);
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
      setRunModelDiagnostics([]);
      return;
    }
    const runId = latestRunIdRef.current + 1;
    latestRunIdRef.current = runId;
    const runGeneration = editGenerationRef.current;
    setRunning(true);
    setStatus("Building netlist…");
    const result = buildNetlist(docRef.current, stableNodeNamesRef.current);
    const runIssues = [...result.errors, ...result.warnings];
    setRunWarnings(runIssues);
    setRunFloatingPins(result.floatingPins);
    setRunModelDiagnostics(result.modelDiagnostics);
      if (result.errors.length > 0) {
        setReadings(null);
        setSimResult(null);
        setSimulationStale(false);
        setSelectedTraces(new Set());
      setPlaying(false);
      setWaveformVisible(false);
      setStatus(
        `✗ Netlist has ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`,
      );
      setLog(
        "Fix netlist errors before running:\n" +
          result.errors.map((m) => `  • ${m}`).join("\n") +
          (result.warnings.length
            ? "\n\nNetlist warnings:\n" + result.warnings.map((m) => `  • ${m}`).join("\n")
            : ""),
      );
      setRunning(false);
      return;
    }
    const runStartedAt = performance.now();
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
      setSimulationStale(false);
      setWaveformVisible(true);
      const scale = sim.vectors.find((v) => v.is_scale);
      if (scale && scale.data.length > 1) {
        const newEnd = scale.data[scale.data.length - 1];
        const prevScale = simResultRef.current?.vectors.find((v) => v.is_scale);
        const prevEnd = prevScale && prevScale.data.length > 0
          ? prevScale.data[prevScale.data.length - 1]
          : null;
        setPlayTime((prev) => {
          if (prevEnd == null || prev >= prevEnd - 1e-12) return newEnd;
          return Math.min(prev, newEnd);
        });
      }
      const page = currentPage(docRef.current);
      const probeNodes = page.probes
        .map((probe) => result.nodes.posToNode.get(`${coordKey(probe.x)},${coordKey(probe.y)}`))
        .filter((node): node is string => !!node);
      const labeledNodes = page.components
        .filter((component) => component.kind === "LABEL" && component.value.trim())
        .map((label) => result.nodes.posToNode.get(`${coordKey(label.x)},${coordKey(label.y)}`))
        .filter((node): node is string => !!node && node !== "0");
      setSelectedTraces((prev) => {
        const availableNames = new Set(sim.vectors.map((v) => v.name));
        const surviving = new Set<string>();
        for (const n of prev) if (availableNames.has(n)) surviving.add(n);
        if (surviving.size > 0) return surviving;
        return defaultVisibleTraceNames(sim.vectors, probeNodes, sim.plot, labeledNodes);
      });
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
      setSimulationStale(false);
      setSelectedTraces(new Set());
      setPlaying(false);
      setWaveformVisible(false);
      setStatus(`✗ ${summary.status}`);
      setLog(formatSimulationErrorLog(summary));
    } finally {
      if (runId === latestRunIdRef.current) {
        setRunning(false);
        // Record how long this run took so auto-run can scale its idle window
        // and pause itself on circuits that are too heavy to rerun live.
        setLastRunMs(performance.now() - runStartedAt);
      }
    }
  }

  function clearDoc() {
    commit(() => emptyDoc);
    resetInteractionState();
    clearSimulationState();
    setShowStartupEmptyCard(false);
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
    setShowStartupEmptyCard(false);
    setWaveformVisible(true);
    setStatus(`Loaded: ${demo.name}`);
    // On narrow viewports the side panels are overlay drawers; close them
    // after loading a demo so the user immediately sees the schematic.
    if (isNarrowViewport()) {
      setPagesCollapsed(true);
      setInspectorCollapsed(true);
    }
    // Fit once immediately, then again after layout settles — on mobile the
    // drawer-close + waveform-pane appearing both change the canvas size, so
    // a single fit at t=0 lands at the wrong zoom and the schematic gets
    // clipped on the right.
    window.setTimeout(fitToContent, 0);
    window.setTimeout(fitToContent, 220);
  }

  useEffect(() => {
    const t = window.setTimeout(fitToContent, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    selectedList,
    selectedWireList,
    selectedProbeList,
    lastSelected,
    lastSelectedWire,
    lastSelectedProbe,
    selectedObjectCount,
  } = useEditorSelection(page, selectedIds);
  const selectedAutoFormatWireCount = useMemo(
    () => wireIdsForAutoFormat(page, selectedIds).size,
    [page, selectedIds],
  );
  const arrangeableComponentCount = useMemo(
    () => page.components.filter((component) => component.kind !== "NOTE").length,
    [page.components],
  );
  const showInspectorActions = selectedObjectCount > 0 || arrangeableComponentCount > 0 || page.wires.length > 0;
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
  // `runningVisible` is the 120 ms-throttled mirror of `running`. Using it
  // here keeps the Run button (and its disabled / title state) stable across
  // sub-frame auto-runs. Race-safety is still handled inside `runSimulation`
  // via `latestRunIdRef`, so a click during a fast in-flight sim just
  // supersedes the old one.
  const runDisabled = runningVisible || engineOk === false;
  const runTitle =
    engineOk === false
      ? "Simulation engine offline"
      : runningVisible
        ? "Simulation is running"
        : "Run (⌘R)";
  // buildNetlist walks every page's components/wires/labels and is invoked
  // again every time `doc` changes. During a drag we mutate `doc` on every
  // pointermove — so without gating, every move triggers a full netlist
  // rebuild. The annotations driven from this (refdes labels, hover node
  // names) don't materially change while a component is being moved; reuse
  // the previous result until the drag commits at pointerup.
  const isDragging =
    drag !== null ||
    wireDrag !== null ||
    scopeDrag !== null ||
    noteResize !== null ||
    subxResize !== null;
  const { pinAnnotations, wireJunctionDots, componentValueLabelOffsets, netLabelLayoutMap } =
    usePinAnnotations({
      doc,
      page,
      isDragging,
      canvasValueFontSize,
      stableNodeNames: stableNodeNamesRef.current,
    });
  const lastSelectedProbeNode = lastSelectedProbe
    ? pinAnnotations.nodes.posToNode.get(
        `${coordKey(lastSelectedProbe.x)},${coordKey(lastSelectedProbe.y)}`,
      )
    : undefined;
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
    noteResize,
    subxResize,
    placementDraft,
    marquee,
    panning,
    textEdit,
    wireDraft,
    wireGesture,
  });
  // The simulation always builds from the root page; gate the auto-run
  // component/ground/source checks on that page (not the active subcircuit).
  const mainPage = doc.pages[0];
  const isMainPageActive = mainPage?.id === doc.activePageId;
  const autoRunComponentCount = mainPage ? mainPage.components.length : 0;
  const autoRunHasGround = mainPage ? mainPage.components.some((c) => c.kind === "GND") : false;
  const autoRunHasStimulus = mainPage
    ? mainPage.components.some((c) => isSimulationStimulusKind(c.kind))
    : false;
  // There's something worth auto-running only when the result is missing or
  // has gone stale since the last run.
  const needsRun = simResult === null || simulationStale;
  const autoRunUi = describeAutoRunStatus({
    autoRun,
    running: runningVisible,
    engineOk,
    tool,
    interactionActive: canvasInteractionActive,
    componentCount: autoRunComponentCount,
    hasGround: autoRunHasGround,
    hasStimulus: autoRunHasStimulus,
    isMainPageActive,
    lastRunMs,
  });

  useAutoRunSimulation({
    doc,
    autoRun,
    tool,
    canvasInteractionActive,
    autoRunRunnable: autoRunUi.runnable,
    isMainPageActive,
    needsRun,
    lastRunMs,
    runSimulation: () => void runSimulation(),
  });

  // Voltage overlay readings interpolated at playTime when a transient result exists.
  // We intentionally keep showing the previous result during a stale window so the
  // canvas labels don't blink off and back on for every auto-run cycle.
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
    isTransientPlot(simResult!.plot);
  // Freeze live-flow when the last run flagged floating pins — the
  // dashed motion implies "this circuit is alive" which is misleading
  // when ngspice's result is built on top of broken connectivity.
  // Keep the wire-flow animation running across an auto-run cycle (edit →
  // stale → re-run → fresh). Without this exception the dashed overlay
  // blinks off every time the user nudges the doc and back on once the
  // sim returns.
  const liveActive =
    isTransient
    && (autoRun || !simulationStale)
    && liveFlow
    && runFloatingPins.length === 0;
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
  const { probeScopes, probeScopeLabelIds, visibleProbeScopes } = useProbeScopes({
    page,
    posToNode: pinAnnotations.nodes.posToNode,
    nodeDisplayLabels,
    hoverId,
    selectedIds,
    scopeDragProbeId: scopeDrag?.probeId ?? null,
    simResult,
    defaultDx: SCOPE_OFFSET_X,
    defaultDy: SCOPE_OFFSET_Y,
    scopeLayoutOptions: SCOPE_LAYOUT,
  });
  const textEditOverlay = useMemo(() => {
    if (!textEdit) return null;
    const toPixels = (x: number, y: number, width: number, height: number) => ({
      left: pan.x + x * CELL * zoom,
      top: pan.y + y * CELL * zoom,
      width: width * CELL * zoom,
      height: height * CELL * zoom,
    });
    if (textEdit.kind === "PROBE") {
      const probe = page.probes.find((candidate) => candidate.id === textEdit.componentId);
      if (!probe) return null;
      const scoped = probeScopes.find(({ probe: candidate }) => candidate.id === probe.id);
      if (scoped && probeScopeLabelIds.has(probe.id)) {
        const scopeX = probe.x + scoped.placement.dx;
        const scopeY = probe.y + scoped.placement.dy;
        return {
          kind: textEdit.kind,
          componentId: probe.id,
          ariaLabel: "Edit probe label",
          className: "probe-editor",
          ...toPixels(scopeX + 0.24, scopeY + 0.18, Math.max(2.4, SCOPE_WIDTH - 0.48), 0.7),
          fontSize: Math.max(11, Math.min(17, 0.42 * CELL * zoom)),
          accent: probe.color,
        };
      }
      const label = probe.label?.trim() ?? "";
      const badgeW = Math.max(2.6, estimateInlineMathTextWidth(label || textEdit.value || "out") * 0.42 + 0.7);
      return {
        kind: textEdit.kind,
        componentId: probe.id,
        ariaLabel: "Edit probe label",
        className: "probe-editor",
        ...toPixels(probe.x + 0.45, probe.y - 0.94, Math.max(2.4, badgeW), 0.74),
        fontSize: Math.max(11, Math.min(17, 0.42 * CELL * zoom)),
        accent: probe.color,
      };
    }

    const component = page.components.find((candidate) => candidate.id === textEdit.componentId);
    if (!component) return null;
    if (textEdit.kind === "NOTE" && component.kind === "NOTE") {
      const lines = noteTextLines(textEdit.value);
      const width = noteComponentWidth(component, lines);
      const height = noteComponentHeight(component, lines);
      return {
        kind: textEdit.kind,
        componentId: component.id,
        ariaLabel: "Edit note",
        className: "note-editor",
        ...toPixels(component.x, component.y, width, height),
        fontSize: Math.max(12, Math.min(18, 0.42 * CELL * zoom)),
        accent: noteColor(component),
        fill: noteFillColor(component, true),
        stroke: noteStrokeColor(component, true),
      };
    }
    if (textEdit.kind === "LABEL" && component.kind === "LABEL") {
      const draftLabel = textEdit.value.trim() || component.value.trim() || "label";
      const committedLayout = netLabelLayoutMap.get(component.id);
      const layout = draftLabel === component.value.trim()
        ? committedLayout
        : netLabelLayout(component, page, draftLabel);
      return {
        kind: textEdit.kind,
        componentId: component.id,
        ariaLabel: "Edit net label",
        className: "label-editor",
        ...toPixels(
          (layout?.chipX ?? component.x + 0.42) - 0.02,
          (layout?.chipY ?? component.y - 0.44) - 0.02,
          (layout?.chipW ?? 2.1) + 0.04,
          (layout?.chipH ?? 0.88) + 0.04,
        ),
        fontSize: Math.max(12, Math.min(18, 0.46 * CELL * zoom)),
        accent: "var(--accent)",
      };
    }
    if (textEdit.kind === "SUBX_PIN" && component.kind === "SUBX" && textEdit.pinIndex !== undefined) {
      const pins = getPinLayout(component);
      const pin = pins[textEdit.pinIndex];
      if (!pin) return null;
      const sides = effectiveSubcircuitPinSidesForInstance(component);
      const side = sides[textEdit.pinIndex] ?? (pin.x < 0 ? "L" : "R");
      const bodyHalfW = subcircuitBodyWidth(component) / 2;
      const bodyHalfH = subcircuitBodyHeight(component) / 2;
      const local =
        side === "T"
          ? { x: pin.x, y: -bodyHalfH + 0.42 }
          : side === "B"
            ? { x: pin.x, y: bodyHalfH - 0.18 }
            : side === "L"
              ? { x: -bodyHalfW + 0.55, y: pin.y + 0.11 }
              : { x: bodyHalfW - 0.55, y: pin.y + 0.11 };
      const rotated = rotatePoint(local, component.rotation);
      const label = textEdit.value.trim() || "pin";
      const width = Math.max(1.5, Math.min(4.2, estimateInlineMathTextWidth(label) * 0.34 + 0.75));
      return {
        kind: textEdit.kind,
        componentId: component.id,
        ariaLabel: "Edit subcircuit pin label",
        className: "subx-pin-label-editor",
        ...toPixels(component.x + rotated.x - width / 2, component.y + rotated.y - 0.35, width, 0.7),
        fontSize: Math.max(11, Math.min(15, 0.34 * CELL * zoom)),
        accent: "var(--accent)",
      };
    }
    if (textEdit.kind === "COMPONENT_LABEL") {
      const label = textEdit.value.trim() || component.label?.trim() || "label";
      const bounds = componentUserLabelBounds(component, label);
      return {
        kind: textEdit.kind,
        componentId: component.id,
        ariaLabel: "Edit component label",
        className: "component-label-editor",
        ...toPixels(bounds.x1, bounds.y1, bounds.x2 - bounds.x1, bounds.y2 - bounds.y1),
        fontSize: Math.max(11, Math.min(16, 0.38 * CELL * zoom)),
        accent: "var(--accent)",
      };
    }
    if (textEdit.kind === "VALUE") {
      if (component.kind === "SUBX") {
        const bodyWidth = subcircuitBodyWidth(component);
        const bodyHeight = subcircuitBodyHeight(component);
        const editorWidth = Math.max(
          1.8,
          Math.min(bodyWidth - 0.5, estimateInlineMathTextWidth(textEdit.value || component.value || "X") * 0.42 + 0.85),
        );
        return {
          kind: textEdit.kind,
          componentId: component.id,
          ariaLabel: "Edit subcircuit name",
          className: "value-editor subx-label-editor",
          ...toPixels(component.x - editorWidth / 2, component.y - Math.min(0.42, bodyHeight / 2), editorWidth, 0.82),
          fontSize: Math.max(11, Math.min(17, 0.42 * CELL * zoom)),
          accent: "var(--accent)",
        };
      }
      const formattedDraftValue = canvasValueLabel(component.kind, textEdit.value);
      const formattedCommittedValue = canvasValueLabel(component.kind, component.value);
      const valueLabel =
        formattedDraftValue ??
        formattedCommittedValue ??
        (textEdit.value.trim() || component.value.trim() || "value");
      if (!valueLabel) return null;
      const off = componentValueLabelOffsets.get(component.id) ?? { x: 0, y: 1.45, anchor: "middle" as const };
      const labelX = component.x + off.x;
      const labelY = component.y + off.y;
      const labelBounds = valueLabelBounds(component, off, valueLabel, canvasValueFontSize);
      const renderedWidth = labelBounds.x2 - labelBounds.x1 + 0.34;
      const rawEditorValue = textEdit.value.trim() || component.value.trim() || valueLabel;
      const width = canvasValueEditorWidthUnits(renderedWidth, rawEditorValue);
      const x =
        off.anchor === "end"
          ? labelX - width
          : off.anchor === "middle"
            ? labelX - width / 2
            : labelX;
      return {
        kind: textEdit.kind,
        componentId: component.id,
        ariaLabel: "Edit component value",
        className: "value-editor",
        ...toPixels(x, labelY - 0.58, width, 0.78),
        fontSize: Math.max(11, Math.min(17, 0.42 * CELL * zoom)),
        accent: "var(--accent)",
      };
    }
    return null;
  }, [
    canvasValueFontSize,
    componentValueLabelOffsets,
    netLabelLayoutMap,
    page,
    pan.x,
    pan.y,
    probeScopeLabelIds,
    probeScopes,
    textEdit,
    zoom,
  ]);
  const { traceAliases, userTraceNames, runLabels, measurementDirectives } = useTraceMetadata({
    probes: page.probes,
    nodeDisplayLabels,
    posToNode: pinAnnotations.nodes.posToNode,
    simResult,
    directives: doc.directives,
  });
  const measurementAxisUnit = axisUnitFromLabel(analysisXAxisLabel(doc.analysis));

  // Per-wire signed current samples at playTime (driven by ngspice
  // savecurrents output). We keep both real current and normalized current:
  // real current makes hover/status text useful, normalized current drives the
  // visual speed, opacity, and direction.
  const { wireFlowSamples, componentFlowSamples, liveFlowUiStatus } = useLiveFlowSamples({
    liveFlow,
    animateLiveFlow: liveActive,
    simResult,
    isTransient,
    playTime,
    page,
    pinAnnotations,
    analysisKind: doc.analysis.kind,
    simulationStale,
    floatingPinCount: runFloatingPins.length,
  });
  const liveFlowReadoutObstacles = useMemo(() => {
    const obstacles = page.components.map((component) => componentVisualBoundsFor(component, 0.18));
    const valueOffsets = valueLabelOffsets(page, (component) =>
      canvasValueLabel(component.kind, component.value),
    );
    const occupiedValueLabels = [];
    for (const component of page.components) {
      const text = canvasValueLabel(component.kind, component.value);
      const offset = valueOffsets.get(component.id);
      if (!text || !offset) continue;
      const bounds = valueLabelBounds(component, offset, text, canvasValueFontSize);
      occupiedValueLabels.push(bounds);
      obstacles.push(bounds);
    }
    for (const layout of netLabelLayouts(page, occupiedValueLabels).values()) {
      obstacles.push(layout.bounds);
    }
    for (const probe of page.probes) {
      obstacles.push({
        x1: probe.x - 0.58,
        y1: probe.y - 0.58,
        x2: probe.x + 0.58,
        y2: probe.y + 0.58,
      });
      const label = probe.label?.trim();
      if (label) obstacles.push(probeScopeLabelBounds(probe, label));
    }
    for (const { probe, visible, placement } of probeScopes) {
      if (!visible) continue;
      obstacles.push({
        x1: probe.x + placement.dx,
        y1: probe.y + placement.dy,
        x2: probe.x + placement.dx + SCOPE_WIDTH,
        y2: probe.y + placement.dy + SCOPE_HEIGHT,
      });
    }
    return obstacles;
  }, [canvasValueFontSize, page, probeScopes]);
  const liveFlowWireReadoutObstacles = useMemo(() => {
    const allWireBounds = page.wires.map((wire) => ({
      id: wire.id,
      bounds: liveFlowWireObstacleBounds(wire.points, 0.14),
    }));
    const byWire = new Map<string, ReturnType<typeof liveFlowWireObstacleBounds>>();
    for (const wire of page.wires) {
      const obstacles = [];
      for (const entry of allWireBounds) {
        if (entry.id !== wire.id) obstacles.push(...entry.bounds);
      }
      byWire.set(wire.id, obstacles);
    }
    return byWire;
  }, [page.wires]);

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

  const {
    disconnectedProbeIds,
    connectedLabelIds,
    labelNearMisses,
    nearMissLabelIds,
  } = useProbeConnectivity(page, page.probes, pinAnnotations.nodes.posToNode);
  const firstFloatingPinLabel = runFloatingPins[0]
    ? floatingPinSummary(runFloatingPins[0])
    : null;
  const modelDefinitions = useMemo(() => {
    const byKey = new Map<string, ModelDefinition>();
    for (const model of BUILTIN_MODEL_DEFINITIONS) {
      byKey.set(`${model.type}:${model.name}`, model);
    }
    for (const model of parseModelDefinitions(doc.directives)) {
      byKey.set(`${model.type}:${model.name}`, model);
    }
    return Array.from(byKey.values());
  }, [doc.directives]);
  const customModelDefinitions = useMemo(
    () => parseModelDefinitions(doc.directives),
    [doc.directives],
  );
  const sharedModelRows = useMemo(() => {
    const byKey = new Map<
      string,
      { model: ModelDefinition; source: "builtin" | "custom" }
    >();
    for (const model of BUILTIN_MODEL_DEFINITIONS) {
      byKey.set(`${model.type}:${model.name.toLowerCase()}`, {
        model,
        source: "builtin",
      });
    }
    for (const model of customModelDefinitions) {
      byKey.set(`${model.type}:${model.name.toLowerCase()}`, {
        model,
        source: "custom",
      });
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.model.type === b.model.type
        ? a.model.name.localeCompare(b.model.name)
        : a.model.type.localeCompare(b.model.type),
    );
  }, [customModelDefinitions]);
  const modelUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const schematic of doc.pages) {
      for (const component of schematic.components) {
        const value = component.value.trim();
        if (!value) continue;
        for (const type of modelTypesForKind(component.kind)) {
          const key = `${type}:${value.toLowerCase()}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [doc.pages]);
  const mosfetPresets = useMemo(
    () => mergeMosfetPresets(BUILTIN_MOSFET_PRESETS, customMosfetPresets),
    [customMosfetPresets],
  );
  const openToolGroup = TOOL_GROUPS.find((group) => group.id === activeToolGroupId) ?? null;
  const openToolItems = openToolGroup?.tools
    .map((groupTool) => paletteItemForTool(groupTool))
    .filter((item): item is PaletteItem => item !== undefined) ?? [];
  const subcircuitMenuOpen = activeToolGroupId === "subcircuits";
  const subcircuitPages = doc.pages.slice(1).filter((p) => p.id !== doc.activePageId);
  const selectedSubcircuitPage = selectedSubcircuitPageId
    ? subcircuitPages.find((p) => p.id === selectedSubcircuitPageId) ?? null
    : null;

  function clearToolGroupCloseTimer() {
    if (toolGroupCloseTimerRef.current !== null) {
      window.clearTimeout(toolGroupCloseTimerRef.current);
      toolGroupCloseTimerRef.current = null;
    }
  }

  function openToolGroupMenu(groupId: string, top: number) {
    clearToolGroupCloseTimer();
    setActiveToolGroupTop(top);
    setActiveToolGroupId(groupId);
  }

  function selectSubcircuitTool(pageId: string) {
    const target = docRef.current.pages.find((p) => p.id === pageId);
    if (!target) return;
    if (subcircuitPortCount(target) === 0) {
      showCanvasNotice(`Add port labels to "${target.name}" before placing it as a subcircuit.`);
      return;
    }
    setSelectedSubcircuitPageId(pageId);
    selectTool("SUBX");
    setStatus(`Subcircuit tool: ${target.name}`);
  }

  function scheduleToolGroupClose() {
    clearToolGroupCloseTimer();
    toolGroupCloseTimerRef.current = window.setTimeout(() => {
      setActiveToolGroupId(null);
      toolGroupCloseTimerRef.current = null;
    }, 140);
  }

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

  function selectModelDiagnostic(diagnostic: ModelDiagnostic) {
    const targetPage = docRef.current.pages.find((p) => p.id === diagnostic.pageId);
    if (!targetPage) return;
    const component = targetPage.components.find((c) => c.id === diagnostic.componentId);
    if (!component) return;
    if (docRef.current.activePageId !== targetPage.id) {
      commit((d) => ({ ...d, activePageId: targetPage.id }));
    }
    setSelectedIds(new Set([diagnostic.componentId]));
    setTool("select");
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPan({
      x: rect.width / 2 - component.x * CELL * zoom,
      y: rect.height / 2 - component.y * CELL * zoom,
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
      <EditorLeftSidebar
        workspace={workspace}
        pages={doc.pages}
        activePageId={doc.activePageId}
        pagesCollapsed={pagesCollapsed}
        onCreateProject={createProject}
        onRenameProject={renameProject}
        onSwitchProject={switchProject}
        onRemoveProject={removeProject}
        onCreateSubcircuitPage={createSubcircuitPage}
        onSwitchPage={(pageId) => commit((d) => ({ ...d, activePageId: pageId }))}
        onRenameSubPage={(pageId, name) =>
          commit((d) => ({
            ...d,
            pages: d.pages.map((x) => (x.id === pageId ? { ...x, name } : x)),
          }))
        }
        onDeleteSubPage={(pageId) =>
          commit((d) => {
            const remaining = d.pages.filter((x) => x.id !== pageId);
            return {
              ...d,
              pages: remaining,
              activePageId: d.activePageId === pageId ? remaining[0].id : d.activePageId,
            };
          })
        }
        onMenu={(action) => void handleMenu(action)}
        onExportSchematicSvg={() => void exportSchematicSvg()}
        onCopyShareLink={() => void copyShareLink()}
        onLoadDemo={loadDemo}
      />

      <aside className="right-pane" aria-hidden={inspectorCollapsed}>
        <div className="sidebar-section">
          <div className="section-label">Schematic</div>
          <div className="schematic-meta-form">
            <label className="meta-field">
              <span>Name</span>
              <input
                className="value-input"
                value={page.name}
                onChange={(e) => updateActivePageMeta({ name: e.target.value })}
                disabled={doc.pages[0]?.id === page.id}
                spellCheck={false}
                aria-label="Schematic name"
                title={
                  doc.pages[0]?.id === page.id
                    ? "The main schematic's name comes from the project; rename it in the side panel"
                    : undefined
                }
              />
            </label>
            <label className="meta-field">
              <span>Description</span>
              <textarea
                className="value-input schematic-description-input"
                value={page.description ?? ""}
                onChange={(e) => updateActivePageMeta({ description: e.target.value })}
                placeholder="Short summary for subcircuit menus"
                rows={3}
              />
            </label>
          </div>
        </div>

        {showInspectorActions && (
          <div className="sidebar-section">
            <div className="section-label">{selectedObjectCount > 0 ? "Inspector" : "Canvas"}</div>
            <div className="inspector">
              {lastSelected ? (
                <>
                  <Row label="Type">
                    <span className="row-type-value">
                      {SWAPPABLE_PASSIVE_KINDS.includes(lastSelected.kind) ? (
                        <SelectField
                          ariaLabel="Component type"
                          value={lastSelected.kind}
                          onValueChange={(value) =>
                            changeComponentKind(lastSelected.id, value as ComponentKind)
                          }
                          options={SWAPPABLE_PASSIVE_KINDS.map((k) => ({
                            value: k,
                            label: COMPONENT_LABELS[k],
                          }))}
                        />
                      ) : (
                        <span className="mono">{COMPONENT_LABELS[lastSelected.kind]}</span>
                      )}
                      <ComponentHelp kind={lastSelected.kind} />
                    </span>
                  </Row>
                  {lastSelected.kind !== "LABEL" && lastSelected.kind !== "NOTE" && (
                    <Row label="Label">
                      <input
                        className="value-input"
                        value={lastSelected.label ?? ""}
                        onChange={(e) => updateComponentLabel(lastSelected.id, e.target.value)}
                        placeholder="Optional canvas label"
                      />
                    </Row>
                  )}
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
                    lastSelected.kind !== "I" &&
                    lastSelected.kind !== "NOTE" && (
                      <>
                        {mosfetPresetKindForComponentKind(lastSelected.kind) && (() => {
                          const presetKind = mosfetPresetKindForComponentKind(lastSelected.kind)!;
                          const kindPresets = mosfetPresets.filter((preset) => preset.kind === presetKind);
                          // Show the preset the selected device *actually* matches
                          // (by model + W/L), not whatever it was placed with — so
                          // hand-editing W/L surfaces as "Custom" instead of a stale
                          // preset name. Picking a real preset re-applies it.
                          const matching = kindPresets.find((preset) =>
                            componentMatchesMosfetPreset(lastSelected, preset),
                          );
                          const CUSTOM_PRESET = "__custom__";
                          const options = kindPresets.map((preset) => ({ value: preset.id, label: preset.name }));
                          return (
                            <Row label="Preset">
                              <SelectField
                                ariaLabel="Preset"
                                value={matching?.id ?? CUSTOM_PRESET}
                                onValueChange={(value) => {
                                  if (value !== CUSTOM_PRESET) applyPresetToComponent(lastSelected.id, value);
                                }}
                                options={
                                  matching
                                    ? options
                                    : [{ value: CUSTOM_PRESET, label: "Custom (edited)" }, ...options]
                                }
                              />
                            </Row>
                          );
                        })()}
                        <Row label={lastSelected.kind === "B" ? "Expression" : isModelKind(lastSelected.kind) ? "Model" : "Value"}>
                          {isModelKind(lastSelected.kind) && lastSelected.kind !== "OPAMP" ? (
                            <SelectField
                              ariaLabel="Model"
                              value={lastSelected.value}
                              onValueChange={(value) => updateComponentModel(lastSelected.id, value)}
                              options={modelOptionsForKind(modelDefinitions, lastSelected.kind, lastSelected.value).map(
                                (model) => ({ value: model.name, label: model.name }),
                              )}
                            />
                          ) : (() => {
                            const family = componentValueUnitFamily(lastSelected.kind);
                            if (!family || isComplexValue(lastSelected.value)) {
                              return (
                                <input
                                  className="value-input"
                                  aria-label={lastSelected.kind === "B" ? "Expression" : "Value"}
                                  value={lastSelected.value}
                                  onChange={(e) => updateValue(lastSelected.id, e.target.value)}
                                  placeholder={lastSelected.kind === "B" ? "V=sin(2*pi*1k*time)" : undefined}
                                />
                              );
                            }
                            return (
                              <ValueWithUnit
                                ariaLabel="Value"
                                value={lastSelected.value}
                                onChange={(next) => updateValue(lastSelected.id, next)}
                                family={family}
                              />
                            );
                          })()}
                        </Row>
                      </>
                    )}
                  {lastSelected.kind === "NOTE" && (
                    <>
                      <Row label="Text">
                        <textarea
                          className="value-input note-text-input"
                          value={lastSelected.value}
                          onChange={(e) => updateValue(lastSelected.id, e.target.value)}
                          placeholder="Add design notes, assumptions, or TODOs"
                          rows={5}
                        />
                      </Row>
                      <Row label="Color">
                        <div className="note-color-picker">
                          <input
                            className="note-color-input"
                            type="color"
                            value={noteColor(lastSelected)}
                            onChange={(e) => updateParam(lastSelected.id, "color", e.target.value)}
                            aria-label="Note color"
                          />
                          <div className="note-color-swatches" aria-label="Annotation color presets">
                            {NOTE_COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="note-color-swatch"
                                aria-label={`Set note preset: ${preset.label}`}
                                aria-pressed={noteColor(lastSelected).toLowerCase() === preset.color.toLowerCase()}
                                title={preset.label}
                                onClick={() => updateParam(lastSelected.id, "color", preset.color)}
                              >
                                <span
                                  className="note-color-swatch-dot"
                                  style={{ backgroundColor: preset.color }}
                                />
                                <span>{preset.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </Row>
                      <Row label="Width">
                        <input
                          className="value-input"
                          type="number"
                          min="2.8"
                          step="0.1"
                          value={lastSelected.params?.w ?? ""}
                          placeholder={noteWidth(noteTextLines(lastSelected.value)).toFixed(1)}
                          onChange={(e) => updateParam(lastSelected.id, "w", e.target.value)}
                        />
                      </Row>
                      <Row label="Height">
                        <input
                          className="value-input"
                          type="number"
                          min="1.4"
                          step="0.1"
                          value={lastSelected.params?.h ?? ""}
                          placeholder={noteHeight(noteTextLines(lastSelected.value)).toFixed(1)}
                          onChange={(e) => updateParam(lastSelected.id, "h", e.target.value)}
                        />
                      </Row>
                    </>
                  )}
                  {lastSelected.kind === "LABEL" && doc.pages[0]?.id !== page.id && (
                    <Row label="Subcircuit port">
                      <CheckboxField
                        checked={lastSelected.params?.port === "1"}
                        onCheckedChange={(checked) => setLabelPort(lastSelected.id, checked)}
                        ariaLabel="Expose as subcircuit pin"
                      >
                        Expose as pin
                      </CheckboxField>
                    </Row>
                  )}
                  {lastSelected.kind === "LABEL" &&
                    doc.pages[0]?.id !== page.id &&
                    lastSelected.params?.port === "1" && (
                      <>
                        <Row label="Pin order">
                          <input
                            className="value-input"
                            type="number"
                            min="1"
                            step="1"
                            value={lastSelected.params?.portOrder ?? ""}
                            placeholder="Auto"
                            onChange={(e) => updateParam(lastSelected.id, "portOrder", e.target.value)}
                            title="External subcircuit pin order used by the generated .subckt line and placed SUBX symbol"
                          />
                        </Row>
                        <Row label="Pin side">
                          <span className="subx-pin-side-buttons" role="group" aria-label="Subcircuit port side">
                            <button
                              type="button"
                              className="subx-pin-side-btn"
                              aria-pressed={!/^[LRTB]$/i.test(lastSelected.params?.portSide ?? "")}
                              title="Infer side from this port label's position in the schematic"
                              onClick={() => updateLabelPortSide(lastSelected.id, "")}
                            >
                              Auto
                            </button>
                            {SUBX_PIN_SIDE_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className="subx-pin-side-btn"
                                aria-pressed={(lastSelected.params?.portSide ?? "").toUpperCase() === option.id}
                                title={option.title}
                                onClick={() => updateLabelPortSide(lastSelected.id, option.id)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </span>
                        </Row>
                      </>
                    )}
                  {lastSelected.kind === "SUBX" && (
                    <>
                      <Row label="Symbol width">
                        <input
                          className="value-input"
                          type="number"
                          min="3.4"
                          max="16"
                          step="0.1"
                          value={lastSelected.params?.w ?? ""}
                          placeholder="4.8"
                          onChange={(e) => updateParam(lastSelected.id, "w", e.target.value)}
                          title="Subcircuit body width in grid units"
                        />
                      </Row>
                      <Row label="Symbol height">
                        <input
                          className="value-input"
                          type="number"
                          min="2"
                          max="24"
                          step="0.1"
                          value={lastSelected.params?.h ?? ""}
                          placeholder="Auto"
                          onChange={(e) => updateParam(lastSelected.id, "h", e.target.value)}
                          title="Subcircuit body height in grid units; pins spread along each side"
                        />
                      </Row>
                      <Row label="Pin sides">
                        <div className="subx-pin-side-editor">
                          <div className="subx-pin-side-toolbar">
                            <span>
                              {effectiveSubcircuitPinSidesForInstance(lastSelected).length} pins
                            </span>
                            <button
                              type="button"
                              className="mini-btn subx-pin-side-auto"
                              onClick={() => resetSubcircuitPinSides(lastSelected.id)}
                              title="Recompute pin sides from the referenced schematic ports"
                            >
                              Auto
                            </button>
                          </div>
                          <div className="subx-pin-side-list">
                            {effectiveSubcircuitPinSidesForInstance(lastSelected).map((activeSide, pinIdx) => {
                              const labels = subcircuitPinLabelsForInstance(doc, lastSelected);
                              const pinLabel = labels[pinIdx]?.trim() || `Pin ${pinIdx + 1}`;
                              return (
                                <div className="subx-pin-side-row" key={`${lastSelected.id}-${pinIdx}`}>
                                  <span className="subx-pin-side-name" title={pinLabel}>
                                    {pinLabel}
                                  </span>
                                  <span className="subx-pin-side-buttons" role="group" aria-label={`Side for ${pinLabel}`}>
                                    {SUBX_PIN_SIDE_OPTIONS.map((option) => (
                                      <button
                                        key={option.id}
                                        type="button"
                                        className="subx-pin-side-btn"
                                        aria-pressed={activeSide === option.id}
                                        title={option.title}
                                        onClick={() => updateSubcircuitPinSide(lastSelected.id, pinIdx, option.id)}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Row>
                    </>
                  )}
                  {mosfetPresetKindForComponentKind(lastSelected.kind) && (
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
                      <Row label="Preset actions">
                        <div className="preset-actions">
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => saveSelectedMosfetPreset(lastSelected)}
                          >
                            Save as preset
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => setDefaultMosfetPresetForComponent(lastSelected)}
                          >
                            Set default
                          </button>
                        </div>
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
                  {lastSelected.kind === "C" && (
                    <Row label="Initial voltage">
                      <input
                        className="value-input"
                        value={lastSelected.params?.IC ?? ""}
                        onChange={(e) =>
                          updateParam(lastSelected.id, "IC", e.target.value)
                        }
                        placeholder="optional IC, e.g. 1.35"
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
                    {(() => {
                      const atDefault =
                        lastSelectedProbe.scopeDx === undefined &&
                        lastSelectedProbe.scopeDy === undefined;
                      return (
                        <button
                          type="button"
                          onClick={() => resetProbeScopeOffset(lastSelectedProbe.id)}
                          disabled={atDefault}
                          title={atDefault ? "Scope is already at its default offset" : "Move the scope back to its default offset from the probe"}
                        >
                          Reset placement
                        </button>
                      );
                    })()}
                  </Row>
                </>
              ) : null}
              <div className="inspector-actions">
                {selectedList.length > 0 && <button onClick={() => rotateSelected()}>Rotate</button>}
                {selectedList.length > 0 && (
                  <button onClick={() => mirrorSelected()} title="Mirror left ↔ right">
                    Mirror ↔
                  </button>
                )}
                {selectedList.length > 0 && (
                  <button onClick={() => flipVerticalSelected()} title="Flip top ↕ bottom">
                    Flip ↕
                  </button>
                )}
                <button
                  onClick={() => {
                    void autoArrangeSchematic(selectedList.length > 0 ? selectedIds : new Set());
                  }}
                  disabled={arrangeableComponentCount === 0}
                  title={
                    selectedList.length > 0
                      ? "Arrange selected components with ELK and re-route their wires"
                      : arrangeableComponentCount > 0
                        ? "Arrange the whole schematic with ELK and re-route its wires"
                        : "Add components to arrange"
                  }
                >
                  Auto arrange
                </button>
                <button
                  onClick={() => autoFormatWiring()}
                  disabled={selectedAutoFormatWireCount === 0}
                  title={
                    selectedAutoFormatWireCount === 0
                      ? "Add wires, or select wires or connected components to re-route"
                      : selectedObjectCount > 0
                        ? "Re-route selected wiring around components and existing wires without moving components"
                        : "Re-route all wiring around components and existing wires without moving components"
                  }
                >
                  Format wires
                </button>
                <button onClick={duplicateSelection}>Duplicate</button>
                {/* Delete intentionally omitted — Delete/Backspace keyboard
                   shortcuts and the right-click menu already cover it, and
                   a destructive button this close to common edits invites
                   accidents. */}
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
          <div className="section-label">Netlist</div>
          <div className="panel-summary-grid">
            <div>
              <span>Nodes</span>
              <code>{pinAnnotations.nodes.rootToName.size}</code>
            </div>
            <div>
              <span>Components</span>
              <code>{electricalComponentCount(page)}</code>
            </div>
          </div>
          <button
            type="button"
            className="panel-row-action"
            onClick={() => setNetlistOpen(true)}
            title="Inspect generated SPICE netlist"
          >
            <IconGlyph kind="netlist" />
            <span>Inspect generated netlist</span>
          </button>
          <button
            type="button"
            className="panel-row-action"
            onClick={() => handleMenu("file:import_netlist")}
            title="Import a SPICE netlist as an approximate schematic"
          >
            <IconGlyph kind="open" />
            <span>Import netlist</span>
          </button>
          <button type="button" className="panel-clear-btn danger" onClick={clearDoc}>
            Clear schematic
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Models & measurements</div>
          <div className="models-panel">
            <div className="models-panel-head">
              <div>
                <strong>Shared models</strong>
                <span>Used by model-backed devices across the schematic.</span>
              </div>
              <div className="models-add-row">
                {(["NMOS", "PMOS", "D", "NPN", "PNP"] satisfies ModelDeviceType[]).map((type) => (
                  <button key={type} type="button" onClick={() => addSharedModel(type)}>
                    + {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="model-list">
              {sharedModelRows.map(({ model, source }) => {
                const isCustom = source === "custom";
                const key = `${model.type}:${model.name}`;
                const usageCount = modelUsageCounts.get(`${model.type}:${model.name.toLowerCase()}`) ?? 0;
                return (
                  <div key={key} className={`model-card ${isCustom ? "custom" : "builtin"}`}>
                    <div className="model-card-top">
                      {isCustom ? (
                        <>
                          <input
                            className="model-name-input"
                            value={model.name}
                            onChange={(e) =>
                              updateSharedModel(model, {
                                ...model,
                                name: e.target.value,
                              })
                            }
                            aria-label={`${model.name} model name`}
                            spellCheck={false}
                          />
                          <SelectField
                            className="model-type-select"
                            value={model.type}
                            onValueChange={(value) =>
                              updateSharedModel(model, {
                                ...model,
                                type: value as ModelDeviceType,
                              })
                            }
                            ariaLabel={`${model.name} model type`}
                            options={MODEL_TYPE_OPTIONS}
                          />
                          <button
                            type="button"
                            className="model-remove-btn"
                            onClick={() => removeSharedModel(model)}
                            title={
                              usageCount > 0
                                ? `Remove model ${model.name}; ${usageCount} component${usageCount === 1 ? "" : "s"} will switch to the default ${model.type} model`
                                : `Remove model ${model.name}`
                            }
                            aria-label={`Remove model ${model.name}`}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>{model.name}</strong>
                          <span className="model-type-chip">{model.type}</span>
                          <span className="model-source-chip">Built-in</span>
                        </>
                      )}
                      {usageCount > 0 && (
                        <span className="model-usage-chip">
                          {usageCount} use{usageCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {isCustom ? (
                      <textarea
                        className="model-params-input"
                        value={model.params}
                        onChange={(e) =>
                          updateSharedModel(model, {
                            ...model,
                            params: e.target.value,
                          })
                        }
                        aria-label={`${model.name} model parameters`}
                        spellCheck={false}
                        rows={2}
                      />
                    ) : (
                      <code className="model-params-code">{model.params}</code>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
                  const modelDiagnostic = runModelDiagnostics.find((diagnostic) =>
                    diagnostic.warning === warning,
                  );
                  if (modelDiagnostic) {
                    return (
                      <button
                        key={`${warning}-${i}`}
                        type="button"
                        className="run-warning-row clickable"
                        onClick={() => selectModelDiagnostic(modelDiagnostic)}
                      >
                        <span>{warning}</span>
                        <span className="run-warning-action">Show component</span>
                      </button>
                    );
                  }
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
        {/* Pane toggles + brand + Run + analysis pills all live outside the
           canvas now (app header + floating cluster). Canvas-area's first
           grid row is therefore empty for web builds — the canvas takes the
           top slot directly. */}
        <div className="canvas-wrap" tabIndex={-1}>
        {/* Floating Run + analysis-type cluster — sits over the canvas at the
           top so it's always reachable without dedicating toolbar space. */}
        <EditorTopRunCluster
          analysisKind={doc.analysis.kind}
          onSwitchAnalysis={switchAnalysis}
          running={runningVisible}
          runDisabled={runDisabled}
          runTitle={runTitle}
          engineOk={engineOk}
          onRun={runSimulation}
        />
        <EditorCanvasNotice
          canvasNotice={canvasNotice}
          disconnectedProbeIds={disconnectedProbeIds}
          runFloatingPins={runFloatingPins}
          firstFloatingPinLabel={firstFloatingPinLabel}
          onRemoveDisconnectedProbes={removeDisconnectedProbes}
          onSelectFloatingPin={selectFloatingPin}
        />
        {showStartupEmptyCard && page.components.length === 0 && page.wires.length === 0 && tool === "select" && (
          <div className="empty-canvas">
            <div className="empty-canvas-card">
              <div className="empty-canvas-title">Schematic is empty</div>
              <div className="empty-canvas-hint">
                Pick a tool from the strip on the left and drag in the
                canvas, or load one of these starters.
              </div>
              <div className="empty-canvas-demos">
                {STARTER_DEMOS.map((d) => (
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
        <EditorToolStrip
          tool={tool}
          directItems={DIRECT_TOOL_ITEMS}
          toolGroups={TOOL_GROUPS}
          activeToolGroupId={activeToolGroupId}
          activeToolGroupTop={activeToolGroupTop}
          subcircuitMenuOpen={subcircuitMenuOpen}
          openToolGroup={openToolGroup}
          openToolItems={openToolItems}
          subcircuitPages={subcircuitPages}
          selectedSubcircuitPage={selectedSubcircuitPage}
          selectedSubcircuitPageId={selectedSubcircuitPageId}
          mosfetPresets={mosfetPresets}
          selectedMosfetPresetId={selectedMosfetPresetId}
          onSelectTool={selectTool}
          onSelectSubcircuitTool={selectSubcircuitTool}
          onSetSelectedMosfetPresetId={setSelectedMosfetPresetId}
          onClearActiveToolGroup={() => setActiveToolGroupId(null)}
          onOpenToolGroupMenu={openToolGroupMenu}
          onScheduleToolGroupClose={scheduleToolGroupClose}
          onClearToolGroupCloseTimer={clearToolGroupCloseTimer}
          lookupPaletteItem={paletteItemForTool}
        />
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

          <g ref={panGroupRef} transform={`translate(${pan.x} ${pan.y}) scale(${CELL * zoom})`}>
            {gridVisible && (
              <>
                <line x1={-10000} y1={0} x2={10000} y2={0} className="canvas-axis" />
                <line x1={0} y1={-10000} x2={0} y2={10000} className="canvas-axis" />
              </>
            )}
            {(() => {
              const placedFlowReadouts: Array<ReturnType<typeof liveFlowReadoutBounds>> = [];
              return page.wires.map((w) => {
                const sel = selectedIds.has(w.id);
                const hovered = hoverId === w.id;
                const flowSample = liveActive ? wireFlowSamples.get(w.id) : undefined;
                const wireFlowActive = liveActive && Boolean(liveFlowVisualFromSample(flowSample)?.active);
                const showFlowReadout = Boolean(liveActive && (sel || hovered) && flowSample?.source === "ngspice");
                let flowReadout: LiveFlowReadoutPosition | null = null;
                let flowReadoutWidth = 0;
                if (showFlowReadout) {
                  const readoutText = liveFlowReadoutText(flowSample, wireFlowActive);
                  flowReadoutWidth = liveFlowReadoutWidth(readoutText);
                  flowReadout = liveFlowReadoutPosition(w.points, 0.38, {
                    width: flowReadoutWidth,
                    height: 0.64,
                    obstacles: [
                      ...liveFlowReadoutObstacles,
                      ...(liveFlowWireReadoutObstacles.get(w.id) ?? []),
                      ...placedFlowReadouts,
                    ],
                  });
                  if (flowReadout) {
                    placedFlowReadouts.push(liveFlowReadoutBounds(
                      flowReadout.x,
                      flowReadout.y,
                      flowReadoutWidth,
                      0.64,
                    ));
                  }
                }
                return (
                  <WireNode
                    key={w.id}
                    w={w}
                    selected={sel}
                    hovered={hovered}
                    liveActive={liveActive}
                    flowSample={flowSample}
                    flowReadout={flowReadout}
                    flowReadoutWidth={flowReadoutWidth}
                    selectedStroke={selectedSchematicStrokeWidth}
                    hoveredStroke={hoveredSchematicStrokeWidth}
                    defaultStroke={schematicStrokeWidth}
                  />
                );
              });
            })()}

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
                ...routeWireSegmentAvoiding(
                  { x: last[0], y: last[1] },
                  tip,
                  snapToGrid,
                  { components: page.components, wires: page.wires },
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
              const { component: draft } = componentFromPlacementDraft(placementDraft, "__placement");
              const draftBounds = componentVisualBoundsFor(draft, 0.24);
              const pins = getPinLayout(draft).map((_, idx) => pinWorldPos(draft, idx));
              const canInsertInline = placementCanInsertInline(pins.length, placementLength(placementDraft));
              const cutSpan = canInsertInline
                ? placementWireCutSpan(draft, placementDraft.start, placementDraft.end)
                : null;
              const inlineInsertion = cutSpan
                ? (
                cutWireSegmentBetweenPoints(
                  page.wires,
                  [cutSpan.start.x, cutSpan.start.y],
                  [cutSpan.end.x, cutSpan.end.y],
                  () => "__preview-cut",
                ) !== page.wires)
                : false;
              const stubs = placementConnectionWires(
                draft,
                placementDraft.start,
                placementDraft.end,
                snapToGrid,
                inlineInsertion,
                () => "__stub",
                {
                  components: [...page.components, draft],
                  wires: page.wires,
                  ignoreComponentIds: new Set([draft.id]),
                },
              );
              return (
                <g className="placement-draft" pointerEvents="none">
                  {stubs.map((stub, idx) => (
                    <polyline
                      key={idx}
                      points={stub.points.map((p) => p.join(",")).join(" ")}
                      className="placement-draft-stub"
                    />
                  ))}
                  <rect
                    x={draftBounds.x1}
                    y={draftBounds.y1}
                    width={draftBounds.x2 - draftBounds.x1}
                    height={draftBounds.y2 - draftBounds.y1}
                    rx={0.28}
                    className="placement-draft-footprint"
                  />
                  {draft.kind === "NOTE" ? (() => {
                    const lines = noteTextLines(draft.value);
                    const width = noteComponentWidth(draft, lines);
                    const height = noteComponentHeight(draft, lines);
                    return (
                      <>
                        <rect
                          x={draft.x}
                          y={draft.y}
                          width={width}
                          height={height}
                          rx={0.22}
                          className="note-card selected"
                          style={{
                            fill: noteFillColor(draft, true),
                            stroke: noteStrokeColor(draft, true),
                            strokeWidth: 0.075,
                          }}
                        />
                        {noteRenderItems(draft.value).slice(0, 3).map((line, idx) => (
                          <SvgInlineMathText
                            key={idx}
                            x={draft.x + 0.45}
                            y={draft.y + 0.76 + line.row * NOTE_RENDER_ROW_STEP}
                            fontSize={0.5}
                            className="note-text"
                            text={line.text || " "}
                          />
                        ))}
                      </>
                    );
                  })() : (
                    <g transform={`translate(${draft.x} ${draft.y}) rotate(${draft.rotation})`}>
                      <ComponentGlyph
                        kind={draft.kind}
                        selected
                        strokeWidth={selectedSchematicStrokeWidth}
                        mirrored={draft.mirrored}
                        subxPins={draft.kind === "SUBX" ? getPinLayout(draft) : undefined}
                        subxLabel={draft.kind === "SUBX" ? draft.value : undefined}
                        subxPinSides={draft.kind === "SUBX" ? effectiveSubcircuitPinSidesForInstance(draft) : undefined}
                        subxPinLabels={draft.kind === "SUBX" && selectedSubcircuitPage
                          ? subcircuitPortLabels(selectedSubcircuitPage).slice(0, getPinLayout(draft).length)
                          : undefined}
                      />
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
                  )}
                  {pins.map((pin, idx) => (
                    <circle
                      key={idx}
                      cx={pin.x}
                      cy={pin.y}
                      r={0.34}
                      className="placement-draft-endpoint"
                    />
                  ))}
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
                const connected = connectedLabelIds.has(c.id);
                const nearMiss = nearMissLabelIds.has(c.id);
                return (
                  <g
                    key={c.id}
                    data-component-id={c.id}
                    className={`component-group net-label-group ${connected ? "connected" : "unconnected"} ${nearMiss ? "near-miss" : ""} ${sel ? "selected" : ""} ${hovered ? "hovered" : ""}`}
                    onClick={(event) => {
                      if (event.detail >= 2 && scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                    onMouseDown={(event) => {
                      if (event.detail >= 2 && scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                  >
                    <title>
                      {connected
                        ? `${label || "Net label"} is attached to a net`
                        : nearMiss
                          ? `${label || "Net label"} is close to a pin or wire but not connected`
                          : `${label || "Net label"} is not physically attached`}
                    </title>
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
                      className={`net-label-anchor-dot ${connected ? "connected" : nearMiss ? "near-miss" : "unconnected"}`}
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
                        {shouldRenderCanvasText(textEdit, c.id, "LABEL") && (
                          <SvgInlineMathText
                            x={layout.textX}
                            y={layout.chipY + layout.chipH / 2}
                            fontSize={0.42}
                            textAnchor="middle"
                            className="net-label-text"
                            text={label}
                            maxWidth={Math.max(0.1, layout.chipW - 0.44)}
                            boxHeight={Math.max(0.1, layout.chipH - 0.12)}
                            verticalAnchor="middle"
                            overflow="hidden"
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              }
              if (c.kind === "NOTE") {
                const sel = selectedIds.has(c.id);
                const hovered = hoverId === c.id;
                const lines = noteTextLines(c.value);
                const width = noteComponentWidth(c, lines);
                const height = noteComponentHeight(c, lines);
                const noteEditing = isEditingCanvasText(textEdit, c.id, "NOTE");
                const showResizeHandle = !noteEditing && (sel || hovered || noteResize?.noteId === c.id);
                const noteActive = !noteEditing && (sel || hovered);
                return (
                  <g
                    key={c.id}
                    data-component-id={c.id}
                    className={`component-group note-group ${sel ? "selected" : ""} ${hovered ? "hovered" : ""} ${noteEditing ? "text-editing" : ""}`}
                    onClick={(event) => {
                      if (event.detail >= 2 && scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                    onMouseDown={(event) => {
                      if (event.detail >= 2 && scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (scheduleCanvasDoubleAction(event.target)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                  >
                    <rect
                      x={c.x}
                      y={c.y}
                      width={width}
                      height={height}
                      rx={0.22}
                      className="component-hit-target"
                    />
                    <rect
                      x={c.x}
                      y={c.y}
                      width={width}
                      height={height}
                      rx={0.22}
                      className={`note-card ${sel ? "selected" : ""} ${hovered ? "hovered" : ""} ${noteEditing ? "editing" : ""}`}
                      style={{
                        fill: noteEditing
                          ? `color-mix(in srgb, white 92%, ${noteColor(c)} 8%)`
                          : noteFillColor(c, noteActive),
                        stroke: noteEditing ? noteColor(c) : noteStrokeColor(c, noteActive),
                        strokeWidth: noteEditing || noteActive ? 0.075 : 0.05,
                      }}
                    />
                    {!noteEditing &&
                      noteRenderItems(c.value).map((line, idx) => (
                        <SvgInlineMathText
                          key={idx}
                          x={c.x + 0.45}
                          y={c.y + 0.76 + line.row * NOTE_RENDER_ROW_STEP}
                          fontSize={0.5}
                          className="note-text"
                          text={line.text || " "}
                        />
                      ))}
                    {showResizeHandle && (
                      <rect
                        x={c.x + width - 0.34}
                        y={c.y + height - 0.34}
                        width={0.46}
                        height={0.46}
                        rx={0.11}
                        className="note-resize-handle"
                        data-note-resize-id={c.id}
                      />
                    )}
                  </g>
                );
              }
              const sel = selectedIds.has(c.id);
              const hovered = hoverId === c.id;
              const floating = floatingComponentIds.has(c.id);
              const activeConnectionGesture = Boolean(wireDraft) || Boolean(wireGesture);
              const showSubxResizeHandle =
                c.kind === "SUBX" && tool === "select" && (sel || hovered || subxResize?.componentId === c.id);
              const editingComponentValue = isEditingCanvasText(textEdit, c.id, "VALUE");
              const editingComponentLabel = isEditingCanvasText(textEdit, c.id, "COMPONENT_LABEL");
              const valueLabelText = canvasValueLabel(c.kind, c.value) || null;
              const isSubx = c.kind === "SUBX";
              const subxPinLabels = isSubx ? subcircuitPinLabelsForInstance(doc, c) : undefined;
              let subxPinLabelEditingIndex: number | null = null;
              if (isSubx && subxPinLabels) {
                for (let i = 0; i < subxPinLabels.length; i++) {
                  if (isEditingCanvasText(textEdit, c.id, "SUBX_PIN", i)) {
                    subxPinLabelEditingIndex = i;
                    break;
                  }
                }
              }
              return (
                <RegularComponentNode
                  key={c.id}
                  c={c}
                  selected={sel}
                  hovered={hovered}
                  floating={floating}
                  liveActive={liveActive}
                  flowSample={componentFlowSamples.get(c.id)}
                  tool={tool}
                  activeConnectionGesture={activeConnectionGesture}
                  showSubxResizeHandle={showSubxResizeHandle}
                  editingComponentValue={editingComponentValue}
                  editingComponentLabel={editingComponentLabel}
                  valueLabelOffset={componentValueLabelOffsets.get(c.id)}
                  valueLabelText={valueLabelText}
                  selectedStroke={selectedSchematicStrokeWidth}
                  defaultStroke={schematicStrokeWidth}
                  valueFontSize={canvasValueFontSize}
                  subxBodyWidth={isSubx ? subcircuitBodyWidth(c) : 0}
                  subxPinLabels={subxPinLabels}
                  subxPinSides={isSubx ? effectiveSubcircuitPinSidesForInstance(c) : undefined}
                  subxPinLabelEditingIndex={subxPinLabelEditingIndex}
                  scheduleCanvasDoubleAction={scheduleCanvasDoubleActionStable}
                />
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

            <FloatingPinMarkers markers={floatingPinMarkers} />
            <NetLabelNearMissMarkers nearMisses={labelNearMisses} />

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
                  labelEditId={probe.id}
                />
              </g>
              );
            })}

            {page.probes.map((p) => {
              const node = pinAnnotations.nodes.posToNode.get(
                `${coordKey(p.x)},${coordKey(p.y)}`,
              );
              const sel = selectedIds.has(p.id);
              const hov = hoverId === p.id;
              const showBadge = Boolean(p.label?.trim()) && !probeScopeLabelIds.has(p.id);
              const editing = !shouldRenderCanvasText(textEdit, p.id, "PROBE");
              return (
                <ProbeNode
                  key={p.id}
                  p={p}
                  node={node}
                  selected={sel}
                  hovered={hov}
                  showBadge={showBadge}
                  editing={editing}
                />
              );
            })}

            <SelectionBoundsOverlay bounds={selectionBounds} />
            <MarqueeOverlay marquee={marquee} />
          </g>
        </svg>
        {textEdit && textEditOverlay && (
          <div
            className={`canvas-text-editor-overlay ${textEditOverlay.kind.toLowerCase()}-editor-overlay`}
            style={{
              left: textEditOverlay.left,
              top: textEditOverlay.top,
              width: textEditOverlay.width,
              height: textEditOverlay.height,
              fontSize: textEditOverlay.fontSize,
              "--text-editor-accent": textEditOverlay.accent,
              "--text-editor-fill": "fill" in textEditOverlay ? textEditOverlay.fill : undefined,
              "--text-editor-stroke": "stroke" in textEditOverlay ? textEditOverlay.stroke : undefined,
            } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {textEdit.kind === "NOTE" ? (
              <textarea
                ref={setCanvasTextEditRef}
                className={`canvas-text-editor ${textEditOverlay.className}`}
                value={textEdit.value}
                onChange={(event) => {
                  textEditOpenedAtRef.current = 0;
                  setTextEdit((edit) =>
                    edit?.componentId === textEditOverlay.componentId
                      ? { ...edit, value: event.target.value }
                      : edit,
                  );
                }}
                onBlur={() => {
                  if (textEditCancelBlurRef.current) {
                    textEditCancelBlurRef.current = false;
                    return;
                  }
                  commitTextEdit();
                }}
                onKeyDown={onTextEditKeyDown}
                aria-label={textEditOverlay.ariaLabel}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap="soft"
              />
            ) : (
              <input
                ref={setCanvasTextEditRef}
                className={`canvas-text-editor ${textEditOverlay.className}`}
                value={textEdit.value}
                onChange={(event) => {
                  textEditOpenedAtRef.current = 0;
                  setTextEdit((edit) =>
                    edit?.componentId === textEditOverlay.componentId
                      ? { ...edit, value: event.target.value }
                      : edit,
                  );
                }}
                onBlur={() => {
                  if (textEditCancelBlurRef.current) {
                    textEditCancelBlurRef.current = false;
                    return;
                  }
                  commitTextEdit();
                }}
                onKeyDown={onTextEditKeyDown}
                aria-label={textEditOverlay.ariaLabel}
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            )}
          </div>
        )}
        <EditorCanvasHUD
          gridVisible={gridVisible}
          onToggleGrid={() => setGridVisible((v) => !v)}
          snapToGrid={snapToGrid}
          onToggleSnap={() => setSnapToGrid((v) => !v)}
          autoRun={autoRun}
          onToggleAutoRun={() => setAutoRun((v) => !v)}
          autoRunUi={autoRunUi}
          zoom={zoom}
          onFit={fitToContent}
        />
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
            liveFlowStatus={liveFlowUiStatus}
          />
        )}

        <WaveformSection
          simResult={simResult}
          waveformVisible={waveformVisible}
          onSetWaveformVisible={setWaveformVisible}
          selectedTraces={selectedTraces}
          onSetSelectedTraces={setSelectedTraces}
          userTraceNames={userTraceNames}
          traceAliases={traceAliases}
          runLabels={runLabels}
          xAxisLabel={analysisXAxisLabel(doc.analysis)}
          directives={doc.directives}
          runWarnings={runWarnings}
          viewerStale={simulationStale && !autoRun}
          simulationStale={simulationStale}
          log={log}
        />
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
      {importNetlistOpen && (
        <ImportNetlistModal
          onClose={() => setImportNetlistOpen(false)}
          onImport={async (text, opts) => {
            const warnings = await importNetlistFromText(text, opts);
            setImportNetlistOpen(false);
            return warnings;
          }}
        />
      )}
    </div>
    <StatusBar
      engineOk={engineOk}
      engineName={engineName}
      analysisKind={doc.analysis.kind}
      running={runningVisible}
      status={status}
      autoRunLabel={autoRunUi.statusLabel}
      autoRunTitle={autoRunUi.title}
      nNodes={pinAnnotations.nodes.rootToName.size}
      nComponents={electricalComponentCount(page)}
      plot={simResult?.plot ?? null}
      plotStale={simulationStale && !autoRun}
      selection={selectionStatus}
    />
    </>
  );
}



function activeSchematicIsEmpty(doc: CircuitDoc): boolean {
  const page = currentPage(doc);
  return page.components.length === 0 && page.wires.length === 0;
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




function directTextEditInitialValue(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key.length !== 1) return null;
  if (e.key === " ") return null;
  return e.key;
}

function isEditableComponentValue(component: CircuitComponent): boolean {
  return isEditableCanvasComponentValue(component.kind, component.value);
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


function paletteItemForTool(tool: Tool): PaletteItem | undefined {
  return PALETTE_ITEMS.find((item) => item.tool === tool);
}


function electricalComponentCount(page: SchematicPage): number {
  return page.components.filter((c) => c.kind !== "GND" && c.kind !== "LABEL" && c.kind !== "NOTE").length;
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

/** Compact line-art glyphs for the left sidebar nav rows. */

/** Minimal monochrome glyphs for the toolbar — SF Symbols-flavoured. */

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
