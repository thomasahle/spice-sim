// Live-flow current sampling at the current playback time: per-wire signed
// + normalized currents (drives the on-canvas flow arrows), per-component
// currents (drives the source-symbol glyphs), and the Live Flow UI status
// (the PlayBar badge). Pulled out of Editor.tsx as one cohesive hook; the
// three memos share heavy ngspice trace lookups and depend on the same
// handful of inputs.

import { useMemo } from "react";
import { findTimeIndex } from "./simSampleTime.ts";
import { getPinLayout, pinWorldPos } from "./model.ts";
import { pinNodeIndex, wirePolyline } from "./graphModel.ts";
import { findNamedTrace } from "./simVectorLookup.ts";
import { liveFlowSubcircuitPinSenseRef, type buildNetlist } from "./netlist.ts";
import {
  liveFlowCurrentTraceCandidates,
  liveFlowRequiresTerminalCurrent,
  liveFlowStatus,
  liveFlowTerminalCurrentTraceCandidates,
  liveFlowVisualFromSample,
  liveFlowWireHasVisibleLength,
  normalizeLiveFlowSamples,
  wireFlowAttachmentForPoint,
  wireFlowSampleFromCandidates,
  type LiveFlowSample,
  type LiveFlowSampleSource,
  type WireFlowCandidate,
} from "./liveFlow.ts";
import type { CircuitDoc, SchematicPage } from "./model.ts";
import type { SimResult } from "../sim/api.ts";

type PinAnnotations = ReturnType<typeof buildNetlist>;

interface UseLiveFlowSamplesInput {
  liveFlow: boolean;
  animateLiveFlow: boolean;
  simResult: SimResult | null;
  isTransient: boolean;
  playTime: number;
  page: SchematicPage;
  pinAnnotations: PinAnnotations;
  analysisKind: CircuitDoc["analysis"]["kind"];
  simulationStale: boolean;
  floatingPinCount: number;
}

export function useLiveFlowSamples({
  liveFlow,
  animateLiveFlow,
  simResult,
  isTransient,
  playTime,
  page,
  pinAnnotations,
  analysisKind,
  simulationStale,
  floatingPinCount,
}: UseLiveFlowSamplesInput): {
  wireFlowSamples: Map<string, LiveFlowSample>;
  componentFlowSamples: Map<string, LiveFlowSample>;
  liveFlowUiStatus: ReturnType<typeof liveFlowStatus>;
} {
  const wireFlowSamples = useMemo(() => {
    const out = new Map<string, { signedCurrent: number; normalizedCurrent: number; source: LiveFlowSampleSource }>();
    if (!animateLiveFlow || !simResult || !isTransient) return out;
    const scale = simResult.vectors.find((v) => v.is_scale);
    if (!scale) return out;
    const idx = findTimeIndex(scale.data, playTime);

    const componentCurrents = new Map<string, { current: number; source: LiveFlowSampleSource }>();
    const terminalCurrents = new Map<string, { current: number; source: LiveFlowSampleSource }>();
    const subcircuitPinCurrents = new Map<string, { current: number; source: LiveFlowSampleSource }>();
    for (const c of page.components) {
      const rd = pinAnnotations.refdes.get(c.id);
      if (rd) {
        const pins = getPinLayout(c);
        for (let pinIndex = 0; pinIndex < pins.length; pinIndex += 1) {
          const terminalCandidates = liveFlowTerminalCurrentTraceCandidates(c.kind, rd, pinIndex);
          for (const name of terminalCandidates) {
            const v = findNamedTrace(simResult.vectors, [name], simResult.plot);
            if (v && idx < v.data.length) {
              terminalCurrents.set(`${c.id}:${pinIndex}`, { current: v.data[idx], source: "ngspice" });
              break;
            }
          }
        }
        const candidates = liveFlowCurrentTraceCandidates(c.kind, rd);
        for (const name of candidates) {
          const v = findNamedTrace(simResult.vectors, [name], simResult.plot);
          if (v && idx < v.data.length) {
            componentCurrents.set(c.id, { current: v.data[idx], source: "ngspice" });
            break;
          }
        }
        if (c.kind === "SUBX" || c.kind === "OPAMP") {
          for (let pinIndex = 0; pinIndex < pins.length; pinIndex += 1) {
            const senseRef = liveFlowSubcircuitPinSenseRef(rd, pinIndex);
            const v = findNamedTrace(
              simResult.vectors,
              [`i(@${senseRef.toLowerCase()}[i])`, `@${senseRef.toLowerCase()}[i]`, `${senseRef.toLowerCase()}#branch`, `i(${senseRef.toLowerCase()})`],
              simResult.plot,
            );
            if (v && idx < v.data.length) {
              subcircuitPinCurrents.set(`${c.id}:${pinIndex}`, { current: v.data[idx], source: "ngspice" });
            }
          }
        }
      }
    }

    const raw = new Map<string, { current: number; source: LiveFlowSampleSource }>();
    const pinIdx = pinNodeIndex(page);
    for (const w of page.wires) {
      const poly = wirePolyline(page, w, pinIdx);
      if (!poly || !liveFlowWireHasVisibleLength(poly)) continue;
      const candidates: WireFlowCandidate[] = [];
      for (const c of page.components) {
        const componentCurrent = componentCurrents.get(c.id);
        const pins = getPinLayout(c);
        for (let i = 0; i < pins.length; i++) {
          const p = pinWorldPos(c, i);
          const attachment = wireFlowAttachmentForPoint(poly, p);
          if (!attachment) continue;
          if (c.kind === "SUBX" || c.kind === "OPAMP") {
            const pinCurrent = subcircuitPinCurrents.get(`${c.id}:${i}`);
            if (!pinCurrent) continue;
            candidates.push({
              componentCurrent: pinCurrent.current,
              source: pinCurrent.source,
              attachedPinIndex: 0,
              pinCount: 2,
              attachedAtStart: attachment.attachedAtStart,
              distance: attachment.distance,
            });
          } else if (terminalCurrents.has(`${c.id}:${i}`)) {
            const terminalCurrent = terminalCurrents.get(`${c.id}:${i}`)!;
            candidates.push({
              componentCurrent: terminalCurrent.current,
              source: terminalCurrent.source,
              attachedPinIndex: i,
              pinCount: pins.length,
              attachedAtStart: attachment.attachedAtStart,
              distance: attachment.distance,
              currentKind: "terminal",
            });
          } else if (componentCurrent && !liveFlowRequiresTerminalCurrent(c.kind)) {
            candidates.push({
              componentCurrent: componentCurrent.current,
              source: componentCurrent.source,
              attachedPinIndex: i,
              pinCount: pins.length,
              attachedAtStart: attachment.attachedAtStart,
              distance: attachment.distance,
            });
          }
        }
      }
      const sample = wireFlowSampleFromCandidates(candidates);
      if (!sample) continue;
      raw.set(w.id, { current: sample.signedCurrent, source: sample.source });
    }
    return normalizeLiveFlowSamples(raw);
  }, [animateLiveFlow, simResult, playTime, page, pinAnnotations, isTransient]);

  const componentFlowSamples = useMemo(() => {
    const raw = new Map<string, { current: number; source: LiveFlowSampleSource }>();
    if (!animateLiveFlow || !simResult || !isTransient) return new Map<string, LiveFlowSample>();
    const scale = simResult.vectors.find((v) => v.is_scale);
    if (!scale) return new Map<string, LiveFlowSample>();
    const idx = findTimeIndex(scale.data, playTime);
    const pinIdx = pinNodeIndex(page);

    for (const c of page.components) {
      if (c.kind === "GND") {
        const p = pinWorldPos(c, 0);
        // Signed current INTO the ground pin (positive = flowing into ground,
        // which the GND glyph animates downward toward the reference bars).
        // Current can also flow OUT of a ground, so don't force a sign.
        let strongestIntoGround: number | null = null;
        for (const w of page.wires) {
          const wireSample = wireFlowSamples.get(w.id);
          if (!wireSample || wireSample.source !== "ngspice") continue;
          const poly = wirePolyline(page, w, pinIdx);
          if (!poly) continue;
          const attachment = wireFlowAttachmentForPoint(poly, p);
          if (!attachment) continue;
          // Wire signedCurrent runs start→end; current toward the ground pin is
          // -signed when the pin is at the start, +signed when at the end.
          const intoGround = attachment.attachedAtStart
            ? -wireSample.signedCurrent
            : wireSample.signedCurrent;
          if (
            strongestIntoGround === null ||
            Math.abs(intoGround) > Math.abs(strongestIntoGround)
          ) {
            strongestIntoGround = intoGround;
          }
        }
        if (strongestIntoGround !== null) {
          raw.set(c.id, { current: strongestIntoGround, source: "ngspice" });
        }
        continue;
      }
      const rd = pinAnnotations.refdes.get(c.id);
      if (!rd) continue;
      if (c.kind === "SUBX" || c.kind === "OPAMP") {
        const pins = getPinLayout(c);
        let strongestPinCurrent: number | null = null;
        for (let pinIndex = 0; pinIndex < pins.length; pinIndex += 1) {
          const senseRef = liveFlowSubcircuitPinSenseRef(rd, pinIndex);
          const v = findNamedTrace(
            simResult.vectors,
            [`i(@${senseRef.toLowerCase()}[i])`, `@${senseRef.toLowerCase()}[i]`, `${senseRef.toLowerCase()}#branch`, `i(${senseRef.toLowerCase()})`],
            simResult.plot,
          );
          if (v && idx < v.data.length && Number.isFinite(v.data[idx])) {
            const current = v.data[idx];
            if (
              strongestPinCurrent === null ||
              Math.abs(current) > Math.abs(strongestPinCurrent)
            ) {
              strongestPinCurrent = current;
            }
          }
        }
        if (strongestPinCurrent !== null) {
          raw.set(c.id, { current: strongestPinCurrent, source: "ngspice" });
        }
        continue;
      }

      if (liveFlowRequiresTerminalCurrent(c.kind)) {
        const drainOrCollector = findNamedTrace(
          simResult.vectors,
          liveFlowTerminalCurrentTraceCandidates(c.kind, rd, 0),
          simResult.plot,
        );
        if (drainOrCollector && idx < drainOrCollector.data.length && Number.isFinite(drainOrCollector.data[idx])) {
          raw.set(c.id, { current: drainOrCollector.data[idx], source: "ngspice" });
          continue;
        }
        const sourceOrEmitter = findNamedTrace(
          simResult.vectors,
          liveFlowTerminalCurrentTraceCandidates(c.kind, rd, 2),
          simResult.plot,
        );
        if (sourceOrEmitter && idx < sourceOrEmitter.data.length && Number.isFinite(sourceOrEmitter.data[idx])) {
          raw.set(c.id, { current: -sourceOrEmitter.data[idx], source: "ngspice" });
        }
        continue;
      }

      const branch = findNamedTrace(
        simResult.vectors,
        liveFlowCurrentTraceCandidates(c.kind, rd),
        simResult.plot,
      );
      if (branch && idx < branch.data.length && Number.isFinite(branch.data[idx])) {
        raw.set(c.id, { current: branch.data[idx], source: "ngspice" });
      }
    }

    return normalizeLiveFlowSamples(
      raw,
      Array.from(wireFlowSamples.values(), (sample) => sample.signedCurrent),
    );
  }, [animateLiveFlow, simResult, playTime, page, pinAnnotations.refdes, isTransient, wireFlowSamples]);

  const liveFlowUiStatus = useMemo(() => {
    let activeWireCount = 0;
    let ngspiceWireCount = 0;
    let strongestCurrent = 0;
    const statusPinIdx = pinNodeIndex(page);
    const visibleWireCount = page.wires.filter((wire) => {
      const poly = wirePolyline(page, wire, statusPinIdx);
      return poly ? liveFlowWireHasVisibleLength(poly) : false;
    }).length;
    for (const sample of wireFlowSamples.values()) {
      const visual = liveFlowVisualFromSample(sample);
      if (visual.active) {
        activeWireCount += 1;
        ngspiceWireCount += 1;
      }
      if (Math.abs(sample.signedCurrent) > Math.abs(strongestCurrent)) {
        strongestCurrent = sample.signedCurrent;
      }
    }
    return liveFlowStatus({
      enabled: liveFlow,
      hasResult: Boolean(simResult),
      analysisKind,
      isTransient,
      simulationStale,
      floatingPinCount,
      visibleWireCount,
      activeWireCount,
      sampledWireCount: wireFlowSamples.size,
      ngspiceWireCount,
      strongestCurrent,
    });
  }, [analysisKind, isTransient, liveFlow, page, floatingPinCount, simResult, simulationStale, wireFlowSamples]);

  return { wireFlowSamples, componentFlowSamples, liveFlowUiStatus };
}
