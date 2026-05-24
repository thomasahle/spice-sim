// Multi-trace plot pane for transient / AC / DC sweep results.

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import type { Measurement, SimVector } from "../sim/api";
import { exportSvg } from "../sim/files";
import { formatMeasurementAxisValue } from "./measurementFormatting";
import {
  formatMeasurementResultValue,
  measurementDirectivesFromText,
  type MeasurementDirectiveInfo,
} from "./measurementUnits";
import { traceDisplayName } from "./traceNames";
import { fallbackWaveformTab, isWaveformTabEnabled, type ViewTab } from "./waveformTabs";
import { defaultXyTraceNames, nearestXySample, pairedXySamples, voltageTraceNames, type XySample } from "./xyPlot";
import { axisUnitFromLabel } from "./waveformAxis";
import { traceAxisLabel, traceValueUnit } from "./traceUnits";
import { computeSweepMetrics } from "./dcSweepMetrics";

type YMode = "linear" | "db";

const VIEW_TABS: { kind: ViewTab; label: string }[] = [
  { kind: "viewer", label: "Waveform Viewer" },
  { kind: "xy", label: "X/Y Plot" },
  { kind: "ac", label: "AC Analysis" },
  { kind: "dc", label: "DC Sweep" },
  { kind: "bode", label: "Bode Plot" },
  { kind: "info", label: "Info" },
];

export interface TraceMetrics {
  vpp: number;
  vmin: number;
  vmax: number;
  vmean: number;
  vrms: number;
  /** Estimated fundamental frequency via zero crossings; NaN if not detectable. */
  freqHz: number;
}

export function computeMetrics(scale: number[], data: number[]): TraceMetrics {
  let vmin = Infinity;
  let vmax = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (const v of data) {
    if (!Number.isFinite(v)) continue;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    sum += v;
    sumSq += v * v;
    n++;
  }
  if (n === 0) {
    return { vpp: NaN, vmin: NaN, vmax: NaN, vmean: NaN, vrms: NaN, freqHz: NaN };
  }
  const vmean = sum / n;
  const vrms = Math.sqrt(sumSq / n);
  const vpp = vmax - vmin;
  // Frequency via zero crossings of (data - mean) — pairs make one period.
  let crossings = 0;
  let lastSign = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] - vmean;
    const s = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (s !== 0 && lastSign !== 0 && s !== lastSign) crossings++;
    if (s !== 0) lastSign = s;
  }
  let freqHz = NaN;
  if (
    crossings >= 2 &&
    scale.length === data.length &&
    scale.length > 1 &&
    Number.isFinite(scale[scale.length - 1] - scale[0])
  ) {
    const dt = scale[scale.length - 1] - scale[0];
    if (dt > 0) freqHz = crossings / (2 * dt);
  }
  return { vpp, vmin, vmax, vmean, vrms, freqHz };
}

interface Props {
  plot: string;
  vectors: SimVector[];
  selectedTraces: Set<string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
  xAxisLabel?: string;
  directives?: string;
  measurements?: Measurement[];
  runWarnings?: string[];
  onToggleTrace: (name: string) => void;
  onSetVisibleTraces: (names: Set<string>) => void;
  onShowAllTraces: () => void;
  onClose: () => void;
}

const TRACE_COLORS = [
  "#0a84ff",
  "#ff9f0a",
  "#30d158",
  "#bf5af2",
  "#ff453a",
  "#64d2ff",
  "#ffd60a",
  "#ff375f",
];

/**
 * Stable per-trace color: maps a trace's index in the FULL trace list
 * to a palette entry. Both the legend swatch and the plotted line use
 * this — without it the swatch (indexed in full list) and the path
 * color (indexed in filtered list) disagree whenever some traces are
 * deselected.
 */
function buildColorMap(traces: { name: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  traces.forEach((t, i) => {
    m.set(t.name, TRACE_COLORS[i % TRACE_COLORS.length]);
  });
  return m;
}

function isInternalTraceName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.startsWith("@") ||
    n.includes(".") ||
    /^x\d+\./.test(n) ||
    /^e\.x\d+\./.test(n)
  );
}

export function WaveformViewer({
  plot,
  vectors,
  selectedTraces,
  traceAliases,
  runLabels,
  xAxisLabel,
  directives = "",
  measurements = [],
  runWarnings = [],
  onToggleTrace,
  onSetVisibleTraces,
  onShowAllTraces,
  onClose,
}: Props) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 240 });
  const [cursor, setCursor] = useState<{ px: number; py: number } | null>(null);
  const [yMode, setYMode] = useState<YMode>("linear");
  const [tab, setTab] = useState<ViewTab>("viewer");
  const [cursorAx, setCursorAx] = useState<number | null>(null);
  const [cursorBx, setCursorBx] = useState<number | null>(null);
  const [showFft, setShowFft] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const [xyXName, setXyXName] = useState("");
  const [xyYName, setXyYName] = useState("");
  const [exportStatus, setExportStatus] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const rawScale = vectors.find((v) => v.is_scale);
  const rawTraces = vectors.filter((v) => !v.is_scale);
  const userTraces = rawTraces.filter((t) => !isInternalTraceName(t.name));
  const hiddenInternalCount = rawTraces.length - userTraces.length;
  const baseTraces = !showInternal && userTraces.length > 0 ? userTraces : rawTraces;
  // Stable color per trace name — based on position in the full (unfiltered)
  // trace list so swatch and plotted line always agree.
  const colorMap = useMemo(() => buildColorMap(rawTraces), [rawTraces]);
  const isAc = plot.startsWith("ac");
  const isTran = plot.startsWith("tran");
  const isDc = plot.startsWith("dc");
  const fftActive = !!(showFft && isTran && rawScale && rawScale.data.length > 8);

  // If FFT mode is on, replace scale with frequency axis and replace each
  // trace with its magnitude spectrum.
  let scale: SimVector | undefined = rawScale;
  let traces = baseTraces;
  if (fftActive && rawScale) {
    const N = nextPow2(Math.min(rawScale.data.length, 4096));
    const { dt } = resampleUniform(rawScale.data, rawScale.data, N);
    const fs = 1 / dt;
    const freqs: number[] = [];
    for (let i = 1; i < N / 2; i++) freqs.push((i * fs) / N);
    scale = { name: "frequency", is_scale: true, data: freqs };
    traces = baseTraces.map((t) => ({
      ...t,
      data: computeFFT(rawScale.data, t.data, N),
    }));
  }

  const logX = isAc || fftActive;

  // Filter by selection (default: all selected if none chosen yet)
  const hasSelectedVisibleTrace = traces.some((t) => selectedTraces.has(t.name));
  const visibleTraces = traces.filter((t) =>
    selectedTraces.size === 0 || !hasSelectedVisibleTrace ? true : selectedTraces.has(t.name),
  );
  const xyTraces = visibleTraces.length >= 2 ? visibleTraces : traces;
  const xyAvailable = xyTraces.length >= 2;
  const xyTraceKey = xyTraces.map((t) => t.name).join("\u0000");
  const xyTraceNames = useMemo(
    () => (xyTraceKey ? xyTraceKey.split("\u0000") : []),
    [xyTraceKey],
  );
  const shown = visibleTraces.map((t) =>
      yMode === "db"
        ? {
            ...t,
            data: t.data.map((v) =>
              v > 0 ? 20 * Math.log10(v) : v < 0 ? 20 * Math.log10(-v) : -200,
            ),
          }
        : t,
  );
  const traceFilterActive = selectedTraces.size > 0 && hasSelectedVisibleTrace;
  const voltageNames = useMemo(() => voltageTraceNames(traces.map((t) => t.name)), [traces]);
  const voltageFilterActive =
    voltageNames.length > 0 &&
    voltageNames.length === visibleTraces.length &&
    voltageNames.every((name) => visibleTraces.some((trace) => trace.name === name));

  useEffect(() => {
    if (xyTraceNames.length === 0) return;
    const defaults = defaultXyTraceNames(xyTraceNames);
    setXyXName((prev) => xyTraceNames.includes(prev) ? prev : (defaults?.xName ?? xyTraceNames[0]));
    setXyYName((prev) => {
      const defaultX = defaults?.xName ?? xyTraceNames[0];
      if (xyTraceNames.includes(prev) && prev !== defaultX) return prev;
      return defaults?.yName ?? xyTraceNames[1] ?? xyTraceNames[0];
    });
  }, [xyTraceNames]);

  const { plotPath, yPx, yMin, yMax, xMin, xMax } = useMemo(() => {
    return computePlot(scale, shown, size, logX);
  }, [scale, shown, size, logX]);

  function onMove(e: React.MouseEvent) {
    const rect = (e.target as Element).getBoundingClientRect();
    setCursor({ px: e.clientX - rect.left, py: e.clientY - rect.top });
  }

  function onClick(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD_L || px > size.w - PAD_R) return;
    const x = pxToX(px, size.w, logX, xMin, xMax, PAD_L, PAD_R);
    if (e.shiftKey) setCursorBx(x);
    else setCursorAx(x);
  }
  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setCursorAx(null);
    setCursorBx(null);
  }
  function sampleEach(x: number): { name: string; rawName: string; color: string; v: number }[] {
    if (!scale) return [];
    return shown.map((t) => ({
      name: traceDisplayName(t.name, traceAliases, runLabels),
      rawName: t.name,
      color: colorMap.get(t.name) ?? TRACE_COLORS[0],
      v: sampleAt(scale.data, t.data, x, logX),
    }));
  }

  function handleTraceClick(name: string) {
    if (!traceFilterActive) {
      if (traces.length <= 1) return;
      onSetVisibleTraces(new Set(traces.map((t) => t.name).filter((n) => n !== name)));
      return;
    }
    if (selectedTraces.has(name) && visibleTraces.length <= 1) return;
    onToggleTrace(name);
  }

  function isViewTabEnabled(kind: ViewTab): boolean {
    return isWaveformTabEnabled(kind, { plot, xyAvailable });
  }

  function viewTabTitle(kind: ViewTab): string | undefined {
    if (kind === "xy") {
      return xyAvailable
        ? visibleTraces.length >= 2
          ? "Plot one visible simulated vector against another"
          : "Plot any available trace against another"
        : "Run a simulation with at least two traces";
    }
    if (kind === "ac") return isAc ? "Magnitude / phase tables" : "Run an AC sweep to enable";
    if (kind === "dc") return isDc ? "DC sweep table" : "Run a DC sweep to enable";
    if (kind === "bode") return isAc ? "Bode plot — magnitude (dB) + phase (deg)" : "Run an AC sweep to enable";
    if (kind === "info") return "Log + measurements summary";
    return undefined;
  }

  useEffect(() => {
    setTab((active) => fallbackWaveformTab(active, { plot, xyAvailable }));
  }, [plot, xyAvailable]);

  function setFocusedTab(kind: ViewTab) {
    setTab(kind);
    window.setTimeout(() => {
      paneRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-waveform-tab="${kind}"]`)
        ?.focus();
    }, 0);
  }

  function onViewTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const enabledTabs = VIEW_TABS.filter((t) => isViewTabEnabled(t.kind));
    const index = enabledTabs.findIndex((t) => t.kind === tab);
    if (index < 0) return;
    let nextIndex: number;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % enabledTabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + enabledTabs.length) % enabledTabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = enabledTabs.length - 1;
    else return;

    e.preventDefault();
    setFocusedTab(enabledTabs[nextIndex].kind);
  }

  async function exportActivePlotSvg() {
    const svg = paneRef.current?.querySelector<SVGSVGElement>(
      ".wf-canvas-wrap > svg, .wf-xy-svg, .wf-bode-svg",
    );
    if (!svg) {
      setExportStatus("No plot to export");
      return;
    }
    const filename = `waveform-${plot}-${tab}.svg`.replace(/[^a-z0-9._-]+/gi, "-");
    const markup = waveformSvgFromElement(svg, `${plot} ${tab}`);
    const saved = await exportSvg(filename, markup);
    setExportStatus(saved ? `Exported ${saved}` : "Plot SVG exported");
  }

  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 10;
  const PAD_B = 34;
  const xAxisTitle = fftActive ? "Frequency (Hz)" : (xAxisLabel ?? fallbackXAxisLabel(plot));
  const yAxisTitle = yMode === "db" ? "Magnitude (dB)" : yAxisLabelForTraces(shown);
  const xAxisUnit = axisUnitFromLabel(xAxisTitle);
  const xInverseUnit = inverseAxisUnit(xAxisUnit);
  const showTimeDomainStats = isTran && !fftActive;
  const grid = gridLines(xMin, xMax, yMin, yMax, size, logX, PAD_L, PAD_R, PAD_T, PAD_B);
  const measurementDirectives = useMemo(
    () => measurementDirectivesFromText(directives),
    [directives],
  );


  // Pre-compute metrics for each trace (used in both tabs).
  const metrics = new Map<string, TraceMetrics>();
  for (const t of traces) {
    if (scale && scale.data.length === t.data.length) {
      metrics.set(t.name, computeMetrics(scale.data, t.data));
    } else {
      metrics.set(t.name, computeMetrics([], t.data));
    }
  }

  return (
    <div ref={paneRef} className="wf-pane">
      <div className="wf-header">
        <div className="wf-tabs" role="tablist" aria-label="Waveform views">
          {VIEW_TABS.map((viewTab) => {
            const enabled = isViewTabEnabled(viewTab.kind);
            return (
              <button
                key={viewTab.kind}
                role="tab"
                aria-selected={enabled && tab === viewTab.kind}
                aria-disabled={!enabled}
                tabIndex={enabled && tab === viewTab.kind ? 0 : -1}
                data-waveform-tab={viewTab.kind}
                aria-label={viewTab.label}
                className={`wf-tab ${tab === viewTab.kind ? "active" : ""} ${!enabled ? "dim" : ""}`}
                onKeyDown={onViewTabKeyDown}
                onClick={() => {
                  if (enabled) setTab(viewTab.kind);
                }}
                title={viewTabTitle(viewTab.kind)}
              >
                {viewTab.label}
              </button>
            );
          })}
          <span className="wf-plot-tag" title={`ngspice plot: ${plot}`}>Plot: {plot}</span>
        </div>
        {isAc && tab === "viewer" && (
          <div className="seg" role="group" aria-label="AC plot scale">
            <button
              className={`seg-btn ${yMode === "linear" ? "active" : ""}`}
              aria-pressed={yMode === "linear"}
              onClick={() => setYMode("linear")}
            >
              Linear
            </button>
            <button
              className={`seg-btn ${yMode === "db" ? "active" : ""}`}
              aria-pressed={yMode === "db"}
              onClick={() => setYMode("db")}
            >
              dB
            </button>
          </div>
        )}
        {isTran && tab === "viewer" && (
          <div className="seg" role="group" aria-label="Transient plot mode">
            <button
              className={`seg-btn ${!showFft ? "active" : ""}`}
              aria-pressed={!showFft}
              onClick={() => setShowFft(false)}
              title="Time-domain trace"
            >
              Time
            </button>
            <button
              className={`seg-btn ${showFft ? "active" : ""}`}
              aria-pressed={showFft}
              onClick={() => setShowFft(true)}
              title="Magnitude spectrum (FFT, Hann window)"
            >
              FFT
            </button>
          </div>
        )}
        {hiddenInternalCount > 0 && (
          <button
            className={`wf-internal-toggle ${showInternal ? "active" : ""}`}
            aria-pressed={showInternal}
            onClick={() => setShowInternal((v) => !v)}
            title={showInternal ? "Hide generated subcircuit/internal vectors" : "Show generated subcircuit/internal vectors"}
          >
            Internal {showInternal ? "On" : hiddenInternalCount}
          </button>
        )}
        <div className="wf-header-spacer" />
        {exportStatus && <span className="wf-export-status">{exportStatus}</span>}
        <button
          className="wf-export-button"
          onClick={() => void exportActivePlotSvg()}
          title="Export the active plot as SVG"
        >
          Export SVG
        </button>
        <button className="icon-btn" onClick={onClose} title="Close waveform">
          ×
        </button>
      </div>

      {tab === "info" && (
        <InfoTab
          plot={plot}
          traces={visibleTraces}
          metrics={metrics}
          colorMap={colorMap}
          traceAliases={traceAliases}
          runLabels={runLabels}
          measurements={measurements}
          runWarnings={runWarnings}
          xAxisUnit={xAxisUnit}
          measurementDirectives={measurementDirectives}
        />
      )}
      {tab === "ac" && (
        <AcAnalysisTable scale={scale} traces={visibleTraces} colorMap={colorMap} traceAliases={traceAliases} runLabels={runLabels} />
      )}
      {tab === "dc" && (
        <DcSweepTable
          scale={scale}
          traces={visibleTraces}
          colorMap={colorMap}
          traceAliases={traceAliases}
          runLabels={runLabels}
          xAxisUnit={xAxisUnit}
        />
      )}
      {tab === "bode" && (
        <BodePane
          scale={scale}
          traces={visibleTraces}
          size={size}
          colorMap={colorMap}
          traceAliases={traceAliases}
          runLabels={runLabels}
        />
      )}
      {tab === "xy" && (
        <XyPane
          traces={xyTraces}
          colorMap={colorMap}
          xName={xyXName}
          yName={xyYName}
          onXName={setXyXName}
          onYName={setXyYName}
          size={size}
          traceAliases={traceAliases}
          runLabels={runLabels}
        />
      )}
      {tab === "viewer" && (
        <div className="wf-body">
          <div className="wf-trace-list">
            {traces.length === 0 ? (
              <div className="wf-trace-empty">no traces</div>
            ) : (
              <ul className="wf-trace-rows">
                {traces.map((t) => {
                  const active =
                    selectedTraces.size === 0 || !hasSelectedVisibleTrace || selectedTraces.has(t.name);
                  const m = metrics.get(t.name);
                  const last = t.data.length ? t.data[t.data.length - 1] : NaN;
                  const color = colorMap.get(t.name) ?? TRACE_COLORS[0];
                  return (
                    <li
                      key={t.name}
                      className={`wf-trow ${active ? "on" : "off"}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      aria-label={`${active ? "Hide" : "Show"} ${traceDisplayName(t.name, traceAliases, runLabels)}`}
                      title={`${active ? "Hide" : "Show"} ${traceDisplayName(t.name, traceAliases, runLabels)}`}
                      onClick={() => handleTraceClick(t.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleTraceClick(t.name);
                        }
                      }}
                    >
                      <span
                        className="wf-trow-swatch"
                        style={{ background: color }}
                      />
                      <span className="wf-trow-name" title={t.name}>
                        {traceDisplayName(t.name, traceAliases, runLabels)}
                      </span>
                      <span className="wf-trow-val">
                        {formatTraceValue(last, t.name)}
                      </span>
                      {showTimeDomainStats && m && Number.isFinite(m.vpp) && (
                        <span className="wf-trow-vpp" title="Peak-to-peak">
                          {formatTraceValue(m.vpp, t.name)} pp
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="wf-trace-actions">
              <span>
                {visibleTraces.length}/{traces.length} visible
              </span>
              <button
                className={`wf-trace-action ${traceFilterActive ? "primary" : ""}`}
                onClick={onShowAllTraces}
                disabled={!traceFilterActive}
                title={traceFilterActive ? "Show every available trace" : "All traces are visible"}
              >
                Show all
              </button>
              <button
                className={`wf-trace-action ${voltageFilterActive ? "primary" : ""}`}
                onClick={() => onSetVisibleTraces(new Set(voltageNames))}
                disabled={voltageNames.length === 0 || voltageFilterActive}
                title={
                  voltageFilterActive
                    ? "Only voltage traces are visible"
                    : "Show voltage traces and hide branch currents"
                }
              >
                Voltages
              </button>
            </div>
          </div>
          <div ref={containerRef} className="wf-canvas-wrap">
        <svg
          width={size.w}
          height={size.h}
          onMouseMove={onMove}
          onMouseLeave={() => setCursor(null)}
          onClick={onClick}
          onContextMenu={onContextMenu}
          style={{ cursor: "crosshair" }}
        >
          {/* gridlines */}
          {grid.xs.map((g, i) => (
            <g key={`x${i}`}>
              <line
                x1={g.px}
                x2={g.px}
                y1={PAD_T}
                y2={size.h - PAD_B}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
              <text
                x={g.px}
                y={size.h - 18}
                fontSize={10}
                fill="var(--ink-muted)"
                textAnchor="middle"
              >
                {g.label}
              </text>
            </g>
          ))}
          {grid.ys.map((g, i) => (
            <g key={`y${i}`}>
              <line
                x1={PAD_L}
                x2={size.w - PAD_R}
                y1={g.px}
                y2={g.px}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={g.px + 3}
                fontSize={10}
                fill="var(--ink-muted)"
                textAnchor="end"
              >
                {g.label}
              </text>
            </g>
          ))}
          <text
            x={(PAD_L + size.w - PAD_R) / 2}
            y={size.h - 5}
            fontSize={10}
            fill="var(--ink-muted)"
            textAnchor="middle"
          >
            {xAxisTitle}
          </text>
          <text
            x={12}
            y={(PAD_T + size.h - PAD_B) / 2}
            fontSize={10}
            fill="var(--ink-muted)"
            textAnchor="middle"
            transform={`rotate(-90 12 ${(PAD_T + size.h - PAD_B) / 2})`}
          >
            {yAxisTitle}
          </text>
          {/* zero line */}
          {yMin < 0 && yMax > 0 && (
            <line
              x1={PAD_L}
              x2={size.w - PAD_R}
              y1={yPx(0)}
              y2={yPx(0)}
              stroke="var(--ink-muted)"
              strokeWidth={1}
              opacity={0.4}
            />
          )}
          {/* traces */}
          {plotPath.map((p) => (
            <path
              key={p.name}
              d={p.d}
              fill="none"
              stroke={colorMap.get(p.name) ?? TRACE_COLORS[0]}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
          {/* hover cursor (ephemeral) */}
          {cursor && cursor.px >= PAD_L && cursor.px <= size.w - PAD_R && (
            <line
              x1={cursor.px}
              x2={cursor.px}
              y1={PAD_T}
              y2={size.h - PAD_B}
              stroke="var(--ink-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
              pointerEvents="none"
            />
          )}
          {/* persistent cursors A and B */}
          {cursorAx !== null && (() => {
            const inner = size.w - PAD_L - PAD_R;
            const px = logX
              ? PAD_L + ((Math.log10(Math.max(cursorAx, 1e-30)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * inner
              : PAD_L + ((cursorAx - xMin) / (xMax - xMin)) * inner;
            return (
              <g pointerEvents="none">
                <line x1={px} x2={px} y1={PAD_T} y2={size.h - PAD_B} stroke="#0a84ff" strokeWidth={1.5} />
                <text x={px + 4} y={PAD_T + 12} fontSize={10} fill="#0a84ff" fontWeight={600}>A</text>
              </g>
            );
          })()}
          {cursorBx !== null && (() => {
            const inner = size.w - PAD_L - PAD_R;
            const px = logX
              ? PAD_L + ((Math.log10(Math.max(cursorBx, 1e-30)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * inner
              : PAD_L + ((cursorBx - xMin) / (xMax - xMin)) * inner;
            return (
              <g pointerEvents="none">
                <line x1={px} x2={px} y1={PAD_T} y2={size.h - PAD_B} stroke="#ff9f0a" strokeWidth={1.5} strokeDasharray="4 2" />
                <text x={px + 4} y={PAD_T + 12} fontSize={10} fill="#ff9f0a" fontWeight={600}>B</text>
              </g>
            );
          })()}
        </svg>
        {(cursorAx !== null || cursorBx !== null) && (
          <div className="wf-cursors">
            {cursorAx !== null && (
              <div className="wf-cursor-section">
                <div className="wf-cursor-head">
                  <span className="wf-cursor-dot" style={{ background: "#0a84ff" }} />
                  Cursor A
                  <span className="wf-cursor-row" style={{ flex: 1, justifyContent: "flex-end" }}>
                    <span className="val">{formatMeasurementAxisValue(cursorAx, xAxisUnit)}</span>
                  </span>
                </div>
                {sampleEach(cursorAx).map((r) => (
                  <div key={r.name} className="wf-cursor-row">
                    <span className="lbl" style={{ color: r.color }}>{r.name}</span>
                    <span className="val">{formatTraceValue(r.v, r.rawName)}</span>
                  </div>
                ))}
              </div>
            )}
            {cursorBx !== null && (
              <div className="wf-cursor-section">
                <div className="wf-cursor-head">
                  <span className="wf-cursor-dot" style={{ background: "#ff9f0a" }} />
                  Cursor B
                  <span className="wf-cursor-row" style={{ flex: 1, justifyContent: "flex-end" }}>
                    <span className="val">{formatMeasurementAxisValue(cursorBx, xAxisUnit)}</span>
                  </span>
                </div>
                {sampleEach(cursorBx).map((r) => (
                  <div key={r.name} className="wf-cursor-row">
                    <span className="lbl" style={{ color: r.color }}>{r.name}</span>
                    <span className="val">{formatTraceValue(r.v, r.rawName)}</span>
                  </div>
                ))}
              </div>
            )}
            {cursorAx !== null && cursorBx !== null && (
              <div className="wf-cursor-section">
                <div className="wf-cursor-head">Δ (B − A)</div>
                <div className="wf-cursor-row">
                  <span className="lbl">Δx</span>
                  <span className="val">{formatMeasurementAxisValue(cursorBx - cursorAx, xAxisUnit)}</span>
                </div>
                <div className="wf-cursor-row">
                  <span className="lbl">1/Δx</span>
                  <span className="val">
                    {cursorBx !== cursorAx ? formatMeasurementAxisValue(1 / (cursorBx - cursorAx), xInverseUnit) : "—"}
                  </span>
                </div>
                {sampleEach(cursorAx).map((rA, i) => {
                  const rB = sampleEach(cursorBx)[i];
                  return (
                    <div key={rA.name} className="wf-cursor-row">
                      <span className="lbl" style={{ color: rA.color }}>Δ{rA.name}</span>
                      <span className="val">{formatTraceValue(rB.v - rA.v, rA.rawName)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="wf-cursor-clear"
              onClick={() => {
                setCursorAx(null);
                setCursorBx(null);
              }}
            >
              Clear
            </button>
          </div>
        )}
          </div>
        </div>
      )}
    </div>
  );
}

function DcSweepTable({
  scale,
  traces,
  colorMap,
  traceAliases,
  runLabels,
  xAxisUnit,
}: {
  scale: SimVector | undefined;
  traces: SimVector[];
  colorMap: Map<string, string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
  xAxisUnit: string;
}) {
  if (!scale || scale.data.length === 0) {
    return (
      <div className="wf-info-pane">
        <div className="sim-hint">Run a DC sweep to see sweep measurements.</div>
      </div>
    );
  }
  return (
    <div className="wf-measure-pane">
      <table className="wf-measure-table">
        <thead>
          <tr>
            <th>Trace</th>
            <th>Start</th>
            <th>End</th>
            <th>Δ</th>
            <th>Min</th>
            <th>Min at</th>
            <th>Max</th>
            <th>Max at</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => {
            const m = computeSweepMetrics(scale.data, t.data);
            const color = colorMap.get(t.name) ?? TRACE_COLORS[0];
            return (
              <tr key={t.name}>
                <td>
                  <span className="wf-swatch" style={{ background: color }} />
                  <span title={t.name}>{traceDisplayName(t.name, traceAliases, runLabels)}</span>
                </td>
                <td>{formatTraceValue(m.start, t.name)}</td>
                <td>{formatTraceValue(m.end, t.name)}</td>
                <td>{formatTraceValue(m.delta, t.name)}</td>
                <td>{formatTraceValue(m.min, t.name)}</td>
                <td>{formatMeasurementAxisValue(m.minX, xAxisUnit)}</td>
                <td>{formatTraceValue(m.max, t.name)}</td>
                <td>{formatMeasurementAxisValue(m.maxX, xAxisUnit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AcAnalysisTable({
  scale,
  traces,
  colorMap,
  traceAliases,
  runLabels,
}: {
  scale: SimVector | undefined;
  traces: SimVector[];
  colorMap: Map<string, string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
}) {
  if (!scale || scale.data.length === 0) {
    return (
      <div className="wf-info-pane">
        <div className="sim-hint">Run an AC sweep to see frequency-response measurements.</div>
      </div>
    );
  }
  return (
    <div className="wf-measure-pane">
      <table className="wf-measure-table">
        <thead>
          <tr>
            <th>Trace</th>
            <th>Start</th>
            <th>Start phase</th>
            <th>End</th>
            <th>End phase</th>
            <th>Peak</th>
            <th>Peak freq</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => {
            const summary = acTraceSummary(scale.data, t);
            const color = colorMap.get(t.name) ?? TRACE_COLORS[0];
            return (
              <tr key={t.name}>
                <td>
                  <span className="wf-swatch" style={{ background: color }} />
                  <span title={t.name}>{traceDisplayName(t.name, traceAliases, runLabels)}</span>
                </td>
                <td>{formatDb(summary.startMagDb)}</td>
                <td>{formatDeg(summary.startPhase)}</td>
                <td>{formatDb(summary.endMagDb)}</td>
                <td>{formatDeg(summary.endPhase)}</td>
                <td>{formatDb(summary.peakMagDb)}</td>
                <td>
                  {Number.isFinite(summary.peakFreq) ? formatMeasurementAxisValue(summary.peakFreq, "Hz") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InfoTab({
  plot,
  traces,
  metrics,
  colorMap,
  traceAliases,
  runLabels,
  measurements,
  runWarnings,
  xAxisUnit,
  measurementDirectives,
}: {
  plot: string;
  traces: SimVector[];
  metrics: Map<string, TraceMetrics>;
  colorMap: Map<string, string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
  measurements: Measurement[];
  runWarnings: string[];
  xAxisUnit: string;
  measurementDirectives: Map<string, MeasurementDirectiveInfo>;
}) {
  const totalSamples = traces.reduce((a, t) => a + t.data.length, 0);
  const showTransientMetrics = plot.startsWith("tran");
  return (
    <div className="wf-info-pane">
      <div className="wf-info-grid">
        <span className="wf-info-key">Plot</span>
        <span className="wf-info-val">{plot}</span>
        <span className="wf-info-key">Traces</span>
        <span className="wf-info-val">{traces.length}</span>
        <span className="wf-info-key">Samples / trace</span>
        <span className="wf-info-val">{traces[0]?.data.length ?? 0}</span>
        <span className="wf-info-key">Total samples</span>
        <span className="wf-info-val">{totalSamples}</span>
        <span className="wf-info-key">Measurements</span>
        <span className="wf-info-val">{measurements.length}</span>
      </div>
      {measurements.length > 0 && (
        <>
          <div className="wf-info-divider" />
          <div className="wf-info-title">.meas results</div>
          <div className="wf-info-measurements">
            {measurements.map((m, i) => (
              <div key={`${m.name}-${i}`} className="wf-info-measurement" title={m.raw}>
                <span className="wf-info-meas-name">{m.name}</span>
                <span className="wf-info-meas-value">
                  {formatMeasurementResultValue(
                    m,
                    measurementDirectives.get(m.name.toLowerCase()),
                    xAxisUnit,
                  )}
                </span>
                <span className="wf-info-meas-at">
                  {m.at !== null ? `@ ${formatMeasurementAxisValue(m.at, xAxisUnit)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {runWarnings.length > 0 && (
        <>
          <div className="wf-info-divider" />
          <div className="wf-info-title">Run warnings</div>
          <ul className="wf-info-warnings">
            {runWarnings.map((warning, i) => (
              <li key={`${warning}-${i}`}>{warning}</li>
            ))}
          </ul>
        </>
      )}
      <div className="wf-info-divider" />
      <div className="wf-info-title">Trace summary</div>
      <ul className="wf-info-traces">
        {traces.map((t) => {
          const m = metrics.get(t.name);
          return (
            <li key={t.name}>
              <span
                className="wf-swatch"
                style={{ background: colorMap.get(t.name) ?? TRACE_COLORS[0] }}
              />
              <code title={t.name}>{traceDisplayName(t.name, traceAliases, runLabels)}</code>
              {showTransientMetrics && m && Number.isFinite(m.vpp) && (
                <span className="wf-info-stat">
                  pp {formatTraceValue(m.vpp, t.name)} · rms {formatTraceValue(m.vrms, t.name)} · mean{" "}
                  {formatTraceValue(m.vmean, t.name)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function XyPane({
  traces,
  colorMap,
  xName,
  yName,
  onXName,
  onYName,
  size,
  traceAliases,
  runLabels,
}: {
  traces: SimVector[];
  colorMap: Map<string, string>;
  xName: string;
  yName: string;
  onXName: (name: string) => void;
  onYName: (name: string) => void;
  size: { w: number; h: number };
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const plotSize = useMeasuredSize(plotRef, { w: 800, h: 220 });
  const xTrace = traces.find((t) => t.name === xName) ?? traces[0];
  const yTrace = traces.find((t) => t.name === yName) ?? traces[1] ?? traces[0];
  if (!xTrace || !yTrace || traces.length < 2) {
    return (
      <div className="wf-info-pane">
        <div className="sim-hint">Run a simulation with at least two traces to use X/Y plot.</div>
      </div>
    );
  }

  return (
    <div className="wf-xy-pane">
      <div className="wf-xy-toolbar" role="group" aria-label="X/Y trace selection">
        <label>
          <span>X</span>
          <select
            value={xTrace.name}
            onChange={(e) => onXName(e.target.value)}
            aria-label="X trace"
          >
            {traces.map((t) => (
              <option key={t.name} value={t.name}>{traceDisplayName(t.name, traceAliases, runLabels)}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wf-xy-swap"
          onClick={() => {
            onXName(yTrace.name);
            onYName(xTrace.name);
          }}
          disabled={xTrace.name === yTrace.name}
          aria-label="Swap X and Y traces"
          title="Swap X and Y traces"
        >
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 6h10" />
            <path d="M10 3l3 3-3 3" />
            <path d="M15 12H5" />
            <path d="M8 9l-3 3 3 3" />
          </svg>
        </button>
        <label>
          <span>Y</span>
          <select
            value={yTrace.name}
            onChange={(e) => onYName(e.target.value)}
            aria-label="Y trace"
          >
            {traces.map((t) => (
              <option key={t.name} value={t.name}>{traceDisplayName(t.name, traceAliases, runLabels)}</option>
            ))}
          </select>
        </label>
        <span className="wf-xy-hint" aria-live="polite">
          {Math.min(xTrace.data.length, yTrace.data.length)} paired samples
        </span>
      </div>
      <div ref={plotRef} className="wf-xy-plot-wrap">
        <XyPlot
          xTrace={xTrace}
          yTrace={yTrace}
          color={colorMap.get(yTrace.name) ?? TRACE_COLORS[1]}
          size={plotSize.w > 0 && plotSize.h > 0 ? plotSize : size}
          traceAliases={traceAliases}
          runLabels={runLabels}
        />
      </div>
    </div>
  );
}

function useMeasuredSize(
  ref: RefObject<HTMLElement | null>,
  fallback: { w: number; h: number },
): { w: number; h: number } {
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (rect: DOMRectReadOnly) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize({ w: rect.width, h: rect.height });
    };
    update(el.getBoundingClientRect());
    const ro = new ResizeObserver((entries) => update(entries[0].contentRect));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

function XyPlot({
  xTrace,
  yTrace,
  color,
  size,
  traceAliases,
  runLabels,
}: {
  xTrace: SimVector;
  yTrace: SimVector;
  color: string;
  size: { w: number; h: number };
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
}) {
  const [hovered, setHovered] = useState<XySample | null>(null);
  const PAD_L = 58;
  const PAD_R = 18;
  const PAD_T = 16;
  const PAD_B = 34;
  const w = Math.max(320, size.w);
  const h = Math.max(180, size.h);
  const points: ({ x: number; y: number } | null)[] = [];
  const finitePoints = pairedXySamples(xTrace.data, yTrace.data);
  const finiteByIndex = new Map(finitePoints.map((point) => [point.index, point]));
  for (let i = 0; i < Math.min(xTrace.data.length, yTrace.data.length); i++) {
    const point = finiteByIndex.get(i);
    points.push(point ? { x: point.x, y: point.y } : null);
  }
  if (finitePoints.length === 0) {
    return <div className="wf-xy-empty">No finite X/Y samples</div>;
  }

  const xRange = paddedRange(finitePoints.map((p) => p.x));
  const yRange = paddedRange(finitePoints.map((p) => p.y));
  const innerW = w - PAD_L - PAD_R;
  const innerH = h - PAD_T - PAD_B;
  const xPx = (x: number) => PAD_L + ((x - xRange.min) / (xRange.max - xRange.min)) * innerW;
  const yPx = (y: number) => PAD_T + (1 - (y - yRange.min) / (yRange.max - yRange.min)) * innerH;
  const d = buildSvgPath(points.map((p) => (p ? { x: xPx(p.x), y: yPx(p.y) } : null)));
  const xTicks = niceTicks(xRange.min, xRange.max, 6);
  const yTicks = niceTicks(yRange.min, yRange.max, 5);
  const start = finitePoints[0];
  const end = finitePoints[finitePoints.length - 1];
  const activeSample = hovered ?? end;
  const activePx = xPx(activeSample.x);
  const activePy = yPx(activeSample.y);
  const xDisplayName = traceDisplayName(xTrace.name, traceAliases, runLabels);
  const yDisplayName = traceDisplayName(yTrace.name, traceAliases, runLabels);
  const xAxisLabel = traceAxisLabel(xDisplayName, xTrace.name);
  const yAxisLabel = traceAxisLabel(yDisplayName, yTrace.name);

  function handlePointerMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setHovered(nearestXySample(finitePoints, px, py, (sample) => ({
      px: xPx(sample.x),
      py: yPx(sample.y),
    })));
  }

  return (
    <svg
      width={w}
      height={h}
      className="wf-xy-svg"
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setHovered(null)}
    >
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={xPx(t)} x2={xPx(t)} y1={PAD_T} y2={h - PAD_B} stroke="var(--hairline)" />
          <text x={xPx(t)} y={h - 10} textAnchor="middle" fontSize={10} fill="var(--ink-muted)">
            {formatSI(t)}
          </text>
        </g>
      ))}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD_L} x2={w - PAD_R} y1={yPx(t)} y2={yPx(t)} stroke="var(--hairline)" />
          <text x={PAD_L - 8} y={yPx(t) + 3} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
            {formatSI(t)}
          </text>
        </g>
      ))}
      {xRange.min < 0 && xRange.max > 0 && (
        <line x1={xPx(0)} x2={xPx(0)} y1={PAD_T} y2={h - PAD_B} stroke="var(--ink-muted)" opacity={0.45} />
      )}
      {yRange.min < 0 && yRange.max > 0 && (
        <line x1={PAD_L} x2={w - PAD_R} y1={yPx(0)} y2={yPx(0)} stroke="var(--ink-muted)" opacity={0.45} />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <circle cx={xPx(start.x)} cy={yPx(start.y)} r={3} fill="var(--bg-canvas)" stroke={color} strokeWidth={1.5} />
      <circle cx={xPx(end.x)} cy={yPx(end.y)} r={3} fill={color} />
      {hovered && (
        <g pointerEvents="none">
          <line x1={activePx} x2={activePx} y1={PAD_T} y2={h - PAD_B} className="wf-xy-cursor-line" />
          <line x1={PAD_L} x2={w - PAD_R} y1={activePy} y2={activePy} className="wf-xy-cursor-line" />
        </g>
      )}
      <g pointerEvents="none">
        <circle cx={activePx} cy={activePy} r={4.5} fill="var(--bg-window)" stroke={color} strokeWidth={1.8} />
        <circle cx={activePx} cy={activePy} r={2} fill={color} />
      </g>
      <g
        className="wf-xy-readout"
        transform={`translate(${Math.min(w - PAD_R - 150, Math.max(PAD_L + 8, activePx + 10))} ${Math.max(PAD_T + 8, activePy - 42)})`}
        pointerEvents="none"
      >
        <rect width={142} height={34} rx={6} />
        <text x={8} y={14}>
          <tspan className="wf-xy-readout-key">X </tspan>
          <tspan>{formatTraceValue(activeSample.x, xTrace.name)}</tspan>
        </text>
        <text x={8} y={27}>
          <tspan className="wf-xy-readout-key">Y </tspan>
          <tspan>{formatTraceValue(activeSample.y, yTrace.name)}</tspan>
        </text>
        <text x={134} y={27} textAnchor="end" className="wf-xy-readout-key">
          #{activeSample.index + 1}
        </text>
      </g>
      <text x={w / 2} y={h - 2} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
        {xAxisLabel}
      </text>
      <text
        x={14}
        y={h / 2}
        textAnchor="middle"
        fontSize={11}
        fill="var(--ink-muted)"
        transform={`rotate(-90 14 ${h / 2})`}
      >
        {yAxisLabel}
      </text>
    </svg>
  );
}

function BodePane({
  scale,
  traces,
  size,
  colorMap,
  traceAliases,
  runLabels,
}: {
  scale: SimVector | undefined;
  traces: SimVector[];
  size: { w: number; h: number };
  colorMap: Map<string, string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
}) {
  if (!scale || scale.data.length < 2) {
    return (
      <div className="wf-info-pane">
        <div className="sim-hint">Run an AC sweep to see a Bode plot.</div>
      </div>
    );
  }
  const magTraces: SimVector[] = traces.map((t) => ({
    ...t,
    data: t.data.map((v) =>
      v > 0 ? 20 * Math.log10(v) : v < 0 ? 20 * Math.log10(-v) : -200,
    ),
  }));
  const phaseTraces: SimVector[] = traces
    .filter((t) => t.phase && t.phase.length > 0)
    .map((t) => ({
      ...t,
      data: unwrapPhase(t.phase ?? []),
    }));
  return (
    <div className="wf-bode-pane">
      <div className="wf-bode-mag">
        <div className="wf-bode-axis-label">Magnitude (dB)</div>
        <BodePlot
          scale={scale}
          traces={magTraces}
          size={size}
          unit="dB"
          colorMap={colorMap}
          traceAliases={traceAliases}
          runLabels={runLabels}
        />
      </div>
      <div className="wf-bode-phase">
        <div className="wf-bode-axis-label">Phase (deg)</div>
        {phaseTraces.length > 0 ? (
          <BodePlot
            scale={scale}
            traces={phaseTraces}
            size={size}
            unit="°"
            colorMap={colorMap}
            traceAliases={traceAliases}
            runLabels={runLabels}
          />
        ) : (
          <div className="sim-hint">No complex phase vectors returned for this run.</div>
        )}
      </div>
    </div>
  );
}

function BodePlot({
  scale,
  traces,
  size,
  unit,
  colorMap,
  traceAliases,
  runLabels,
}: {
  scale: SimVector;
  traces: SimVector[];
  size: { w: number; h: number };
  unit: string;
  colorMap: Map<string, string>;
  traceAliases?: Map<string, string>;
  runLabels?: Map<number, string>;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 8;
  const PAD_B = 24;
  const h = Math.max(140, Math.floor((size.h - 40) / 2));
  const w = Math.max(320, size.w);
  const innerW = w - PAD_L - PAD_R;
  const innerH = h - PAD_T - PAD_B;
  let xMin = Math.max(scale.data[0], 1e-30);
  let xMax = Math.max(scale.data[scale.data.length - 1], 1e-30);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 1e-3;
    xMax = 1;
  } else if (xMin === xMax) {
    xMin = Math.max(1e-30, xMin / 10);
    xMax = Math.max(xMin * 10, xMax * 10);
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const t of traces) {
    for (const v of t.data) {
      if (Number.isFinite(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
  }
  if (!Number.isFinite(yMin)) {
    yMin = -60;
    yMax = 6;
  } else {
    const yRange = paddedNumericRange(yMin, yMax);
    yMin = yRange.min;
    yMax = yRange.max;
  }
  const xTicks = logTicks(xMin, xMax);
  const yTicks = niceTicks(yMin, yMax, 5);
  const mapX = (x: number) =>
    PAD_L +
    ((Math.log10(Math.max(x, 1e-30)) - Math.log10(xMin)) /
      (Math.log10(xMax) - Math.log10(xMin))) *
      innerW;
  const mapY = (y: number) =>
    PAD_T + (1 - (y - yMin) / (yMax - yMin)) * innerH;
  const hoverFrequency = hoverIndex !== null ? scale.data[hoverIndex] : NaN;
  const hoverX = Number.isFinite(hoverFrequency) ? mapX(hoverFrequency) : null;
  const hoverRows =
    hoverIndex !== null
      ? traces
          .map((trace) => ({
            name: traceDisplayName(trace.name, traceAliases, runLabels),
            rawName: trace.name,
            value: trace.data[hoverIndex],
          }))
          .filter((row) => Number.isFinite(row.value))
          .slice(0, 4)
      : [];
  const readoutWidth = 184;
  const readoutHeight = 28 + hoverRows.length * 16;
  const readoutX =
    hoverX === null ? PAD_L + 8 : Math.min(w - PAD_R - readoutWidth - 4, Math.max(PAD_L + 8, hoverX + 10));
  const readoutY = PAD_T + 8;

  function handlePointerMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < PAD_L || px > w - PAD_R || py < PAD_T || py > h - PAD_B) {
      setHoverIndex(null);
      return;
    }
    const logMin = Math.log10(xMin);
    const logMax = Math.log10(xMax);
    const targetLog = logMin + ((px - PAD_L) / innerW) * (logMax - logMin);
    let bestIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < scale.data.length; i++) {
      const freq = scale.data[i];
      if (!Number.isFinite(freq) || freq <= 0) continue;
      const dist = Math.abs(Math.log10(freq) - targetLog);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    setHoverIndex(bestIndex >= 0 ? bestIndex : null);
  }

  return (
    <svg
      width={w}
      height={h}
      className="wf-bode-svg"
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      {xTicks.map((x) => (
        <g key={`x${x}`}>
          <line x1={mapX(x)} x2={mapX(x)} y1={PAD_T} y2={h - PAD_B} className="wf-bode-grid" />
          <text x={mapX(x)} y={h - 7} textAnchor="middle" className="wf-bode-tick">
            {formatSI(x)}
          </text>
        </g>
      ))}
      {yTicks.map((y) => (
        <g key={`y${y}`}>
          <line x1={PAD_L} x2={w - PAD_R} y1={mapY(y)} y2={mapY(y)} className="wf-bode-grid" />
          <text x={PAD_L - 7} y={mapY(y) + 3} textAnchor="end" className="wf-bode-tick">
            {formatAxisValue(y, unit)}
          </text>
        </g>
      ))}
      {traces.map((t) => {
        const points: ({ x: number; y: number } | null)[] = [];
        const n = Math.min(t.data.length, scale.data.length);
        for (let j = 0; j < n; j++) {
          if (!Number.isFinite(t.data[j]) || !Number.isFinite(scale.data[j])) {
            points.push(null);
            continue;
          }
          points.push({ x: mapX(scale.data[j]), y: mapY(t.data[j]) });
        }
        const d = buildSvgPath(points);
        return (
          <path
            key={t.name}
            d={d}
            fill="none"
            stroke={colorMap.get(t.name) ?? TRACE_COLORS[0]}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        );
      })}
      {hoverX !== null && (
        <g pointerEvents="none">
          <line x1={hoverX} x2={hoverX} y1={PAD_T} y2={h - PAD_B} className="wf-bode-cursor-line" />
          {hoverRows.map((row) => (
            <circle
              key={row.rawName}
              cx={hoverX}
              cy={mapY(row.value)}
              r={3.5}
              fill="var(--bg-window)"
              stroke={colorMap.get(row.rawName) ?? TRACE_COLORS[0]}
              strokeWidth={1.4}
            />
          ))}
        </g>
      )}
      {hoverRows.length > 0 && (
        <g className="wf-bode-readout" transform={`translate(${readoutX} ${readoutY})`} pointerEvents="none">
          <rect width={readoutWidth} height={readoutHeight} rx={6} />
          <text x={8} y={15}>
            <tspan className="wf-bode-readout-key">f </tspan>
            <tspan>{formatMeasurementAxisValue(hoverFrequency, "Hz")}</tspan>
          </text>
          {hoverRows.map((row, i) => (
            <text key={row.rawName} x={8} y={31 + i * 16}>
              <tspan fill={colorMap.get(row.rawName) ?? TRACE_COLORS[0]}>● </tspan>
              <tspan className="wf-bode-readout-key">{compactTraceLabel(row.name)} </tspan>
              <tspan>{formatBodeReadoutValue(row.value, unit)}</tspan>
            </text>
          ))}
        </g>
      )}
      <text x={(PAD_L + w - PAD_R) / 2} y={h - 1} textAnchor="middle" className="wf-bode-axis-text">
        Frequency (Hz)
      </text>
    </svg>
  );
}

function computePlot(
  scale: SimVector | undefined,
  traces: SimVector[],
  size: { w: number; h: number },
  logX: boolean,
) {
  const PAD_L = 56;
  const PAD_R = 12;
  const PAD_T = 10;
  const PAD_B = 24;
  const xs = scale?.data ?? [];
  if (xs.length === 0 || traces.length === 0) {
    return {
      plotPath: [] as { name: string; d: string }[],
      xPx: () => 0,
      yPx: () => 0,
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    };
  }
  let xMin = xs[0];
  let xMax = xs[xs.length - 1];
  if (logX) {
    xMin = Math.max(xMin, 1e-30);
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = logX ? 1e-3 : 0;
    xMax = logX ? 1 : 1;
  } else if (xMin === xMax) {
    const pad = Math.max(Math.abs(xMin) * 0.01, logX ? 1e-12 : 1);
    xMin = logX ? Math.max(1e-30, xMin / 10) : xMin - pad;
    xMax = logX ? Math.max(xMin * 10, xMax * 10) : xMax + pad;
  }
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const t of traces) {
    for (const v of t.data) {
      if (Number.isFinite(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -1;
    yMax = 1;
  } else {
    const yRange = paddedNumericRange(yMin, yMax);
    yMin = yRange.min;
    yMax = yRange.max;
  }

  function xPx(x: number): number {
    const inner = size.w - PAD_L - PAD_R;
    if (logX) {
      const lx = Math.log10(Math.max(x, 1e-30));
      const lmin = Math.log10(xMin);
      const lmax = Math.log10(xMax);
      return PAD_L + ((lx - lmin) / (lmax - lmin)) * inner;
    }
    return PAD_L + ((x - xMin) / (xMax - xMin)) * inner;
  }
  function yPx(y: number): number {
    const inner = size.h - PAD_T - PAD_B;
    return PAD_T + (1 - (y - yMin) / (yMax - yMin)) * inner;
  }

  const plotPath = traces.map((t) => {
    const points: ({ x: number; y: number } | null)[] = [];
    const n = Math.min(xs.length, t.data.length);
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const y = t.data[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        points.push(null);
        continue;
      }
      points.push({ x: xPx(x), y: yPx(y) });
    }
    return { name: t.name, d: buildSvgPath(points) };
  });
  return { plotPath, xPx, yPx, xMin, xMax, yMin, yMax };
}

function gridLines(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  size: { w: number; h: number },
  logX: boolean,
  PAD_L: number,
  PAD_R: number,
  PAD_T: number,
  PAD_B: number,
) {
  const xs: { px: number; label: string }[] = [];
  const ys: { px: number; label: string }[] = [];
  if (logX) {
    const lmin = Math.floor(Math.log10(Math.max(xMin, 1e-30)));
    const lmax = Math.ceil(Math.log10(Math.max(xMax, 1e-30)));
    for (let l = lmin; l <= lmax; l++) {
      const x = Math.pow(10, l);
      const inner = size.w - PAD_L - PAD_R;
      const px =
        PAD_L +
        ((Math.log10(x) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) *
          inner;
      if (px >= PAD_L && px <= size.w - PAD_R) {
        xs.push({ px, label: formatSI(x) });
      }
    }
  } else {
    const ticks = niceTicks(xMin, xMax, 6);
    const inner = size.w - PAD_L - PAD_R;
    for (const t of ticks) {
      const px = PAD_L + ((t - xMin) / (xMax - xMin)) * inner;
      xs.push({ px, label: formatSI(t) });
    }
  }
  const yticks = niceTicks(yMin, yMax, 5);
  const yInner = size.h - PAD_T - PAD_B;
  for (const t of yticks) {
    const px = PAD_T + (1 - (t - yMin) / (yMax - yMin)) * yInner;
    ys.push({ px, label: formatSI(t) });
  }
  return { xs, ys };
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step: number;
  if (norm < 1.5) step = 1 * mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  if (!Number.isFinite(step) || step <= 0) return [min, max];
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001 && out.length < 1000; v += step) out.push(v);
  if (out.length === 0) return [min, max];
  return out;
}

function buildSvgPath(points: ({ x: number; y: number } | null)[]): string {
  let d = "";
  let needsMove = true;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      needsMove = true;
      continue;
    }
    d += `${needsMove ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
    needsMove = false;
  }
  return d;
}

function logTicks(min: number, max: number): number[] {
  const safeMin = Math.max(min, 1e-30);
  const safeMax = Math.max(max, safeMin);
  const lmin = Math.floor(Math.log10(safeMin));
  const lmax = Math.ceil(Math.log10(safeMax));
  const out = new Set<number>();
  for (let l = lmin; l <= lmax; l++) {
    const x = Math.pow(10, l);
    if (x >= safeMin && x <= safeMax) out.add(x);
  }
  out.add(safeMin);
  out.add(safeMax);
  return [...out].sort((a, b) => a - b);
}

function paddedRange(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return paddedNumericRange(min, max);
}

function paddedNumericRange(min: number, max: number): { min: number; max: number } {
  const center = (min + max) / 2;
  const span = max - min;
  const flatTolerance = Math.max(Math.abs(center) * 1e-9, 1e-12);
  if (!Number.isFinite(span) || span <= flatTolerance) {
    const pad = Math.max(Math.abs(center) * 0.05, 1);
    return { min: center - pad, max: center + pad };
  }
  const pad = span * 0.06;
  return { min: min - pad, max: max + pad };
}

function unwrapPhase(values: number[]): number[] {
  if (values.length === 0) return [];
  const out: number[] = [values[0]];
  let offset = 0;
  let previousRaw = values[0];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    const delta = raw - previousRaw;
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    out.push(raw + offset);
    previousRaw = raw;
  }
  return out;
}

function pxToX(
  px: number,
  w: number,
  logX: boolean,
  xMin: number,
  xMax: number,
  PAD_L: number,
  PAD_R: number,
): number {
  const inner = w - PAD_L - PAD_R;
  const t = Math.min(1, Math.max(0, (px - PAD_L) / inner));
  if (logX) {
    return Math.pow(10, Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin)));
  }
  return xMin + t * (xMax - xMin);
}

function sampleAt(xs: number[], ys: number[], x: number, logX: boolean): number {
  if (xs.length === 0) return NaN;
  // Find nearest sample by linear (or log) distance
  let lo = 0;
  let hi = xs.length - 1;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[hi]) return ys[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const x0 = logX ? Math.log10(Math.max(xs[lo], 1e-30)) : xs[lo];
  const x1 = logX ? Math.log10(Math.max(xs[hi], 1e-30)) : xs[hi];
  const xq = logX ? Math.log10(Math.max(x, 1e-30)) : x;
  const t = (xq - x0) / (x1 - x0);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

function acTraceSummary(freqs: number[], trace: SimVector): {
  startMagDb: number;
  startPhase: number;
  endMagDb: number;
  endPhase: number;
  peakMagDb: number;
  peakFreq: number;
} {
  const phase = trace.phase ? unwrapPhase(trace.phase) : [];
  let firstIdx = -1;
  let lastIdx = -1;
  let peakIdx = -1;
  let peakMag = -Infinity;
  const n = Math.min(freqs.length, trace.data.length);
  for (let i = 0; i < n; i++) {
    const mag = trace.data[i];
    if (!Number.isFinite(mag)) continue;
    if (firstIdx < 0) firstIdx = i;
    lastIdx = i;
    const absMag = Math.abs(mag);
    if (Number.isFinite(absMag) && absMag > peakMag) {
      peakMag = absMag;
      peakIdx = i;
    }
  }
  const phaseAt = (idx: number) =>
    idx >= 0 && idx < phase.length && Number.isFinite(phase[idx]) ? phase[idx] : NaN;
  return {
    startMagDb: firstIdx >= 0 ? magToDb(trace.data[firstIdx]) : NaN,
    startPhase: phaseAt(firstIdx),
    endMagDb: lastIdx >= 0 ? magToDb(trace.data[lastIdx]) : NaN,
    endPhase: phaseAt(lastIdx),
    peakMagDb: peakIdx >= 0 ? magToDb(trace.data[peakIdx]) : NaN,
    peakFreq: peakIdx >= 0 && peakIdx < freqs.length ? freqs[peakIdx] : NaN,
  };
}

function magToDb(v: number): number {
  const mag = Math.abs(v);
  if (!Number.isFinite(mag)) return NaN;
  if (mag === 0) return -200;
  return 20 * Math.log10(mag);
}

function formatDb(v: number): string {
  return Number.isFinite(v) ? `${cleanZero(v).toFixed(1)} dB` : "—";
}

function formatDeg(v: number): string {
  return Number.isFinite(v) ? `${cleanZero(v).toFixed(1)}°` : "—";
}

function formatBodeReadoutValue(v: number, unit: string): string {
  if (!Number.isFinite(v)) return "—";
  const cleaned = cleanZero(v);
  if (unit === "°") return `${cleaned.toFixed(1)}°`;
  if (unit === "dB") return `${cleaned.toFixed(2)} dB`;
  return `${formatSI(cleaned)}${unit}`;
}

function compactTraceLabel(label: string): string {
  return label.length <= 18 ? label : `${label.slice(0, 15)}...`;
}

function formatAxisValue(v: number, unit: string): string {
  if (!Number.isFinite(v)) return "—";
  const cleaned = cleanZero(v);
  return unit === "°" ? `${cleaned.toFixed(0)}°` : `${cleaned.toFixed(0)}`;
}

function cleanZero(v: number): number {
  return Math.abs(v) < 0.05 ? 0 : v;
}

function waveformSvgFromElement(svg: SVGSVGElement, title: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const width = svg.getAttribute("width") || `${Math.max(1, Math.round(rect.width))}`;
  const height = svg.getAttribute("height") || `${Math.max(1, Math.round(rect.height))}`;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);
  clone.setAttribute("role", "img");
  clone.setAttribute("aria-label", title);
  clone.style.removeProperty("cursor");

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = [
    "svg{--hairline:#d8dde8;--ink-muted:#667085;--bg-canvas:#ffffff;background:#ffffff}",
    "text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
  ].join("\n");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(style, clone.firstChild);
  clone.insertBefore(bg, style.nextSibling);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function formatSI(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  const exp = Math.floor(Math.log10(a) / 3) * 3;
  const suffixes: Record<number, string> = {
    [-15]: "f",
    [-12]: "p",
    [-9]: "n",
    [-6]: "µ",
    [-3]: "m",
    [0]: "",
    [3]: "k",
    [6]: "M",
    [9]: "G",
    [12]: "T",
  };
  const s = suffixes[exp];
  if (s === undefined) return v.toExponential(2);
  const scaled = v / Math.pow(10, exp);
  return `${Math.abs(scaled) < 10 ? scaled.toFixed(2) : scaled.toFixed(1)}${s}`;
}

function formatTraceValue(value: number, traceName: string): string {
  const unit = traceValueUnit(traceName);
  if (unit) return formatMeasurementAxisValue(value, unit);
  return formatSI(value);
}

function yAxisLabelForTraces(traces: SimVector[]): string {
  const units = new Set(traces.map((trace) => traceValueUnit(trace.name)).filter(Boolean));
  if (units.size === 1) {
    const unit = [...units][0];
    if (unit === "V") return "Voltage (V)";
    if (unit === "A") return "Current (A)";
    return `Value (${unit})`;
  }
  return "Value";
}

function inverseAxisUnit(unit: string): string {
  if (!unit) return "";
  if (unit === "s") return "Hz";
  return `/${unit}`;
}

function fallbackXAxisLabel(plot: string): string {
  if (plot.startsWith("tran")) return "Time (s)";
  if (plot.startsWith("ac") || plot.startsWith("noise")) return "Frequency (Hz)";
  if (plot.startsWith("dc")) return "Sweep";
  return "Sample";
}

// ---- FFT helpers ---------------------------------------------------------

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function resampleUniform(scale: number[], data: number[], N: number): { samples: Float64Array; dt: number } {
  const samples = new Float64Array(N);
  if (scale.length < 2 || N < 2) return { samples, dt: 1 };
  const xMin = scale[0];
  const xMax = scale[scale.length - 1];
  const dt = (xMax - xMin) / (N - 1);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const t = xMin + i * dt;
    while (j < scale.length - 2 && scale[j + 1] < t) j++;
    const x0 = scale[j];
    const x1 = scale[j + 1];
    const span = x1 - x0;
    const f = span > 0 ? (t - x0) / span : 0;
    samples[i] = data[j] * (1 - f) + data[j + 1] * f;
  }
  return { samples, dt };
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const x = i + k;
        const y = i + k + half;
        const er = re[y] * curRe - im[y] * curIm;
        const ei = re[y] * curIm + im[y] * curRe;
        re[y] = re[x] - er;
        im[y] = im[x] - ei;
        re[x] += er;
        im[x] += ei;
        const newRe = curRe * wRe - curIm * wIm;
        const newIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
        curIm = newIm;
      }
    }
  }
}

function computeFFT(scale: number[], data: number[], N: number): number[] {
  const { samples } = resampleUniform(scale, data, N);
  // Hann window
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    samples[i] *= w;
  }
  const im = new Float64Array(N);
  fftInPlace(samples, im);
  const mag: number[] = [];
  for (let i = 1; i < N / 2; i++) {
    mag.push((2 * Math.sqrt(samples[i] * samples[i] + im[i] * im[i])) / N);
  }
  return mag;
}
