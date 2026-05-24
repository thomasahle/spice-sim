import type { Analysis as ApiAnalysis } from "../sim/api";
import type { AnalysisSpec } from "./model";
import { parseSpiceUnitStrict } from "./valueExpressions.ts";

export interface AnalysisValidationIssue {
  field: string;
  label: string;
  message: string;
}

export { parseSpiceUnitStrict } from "./valueExpressions.ts";

export function validateAnalysisSpec(a: AnalysisSpec): AnalysisValidationIssue[] {
  const issues: AnalysisValidationIssue[] = [];
  const positive = (field: string, label: string, value: string): number | null => {
    const parsed = parseSpiceUnitStrict(value);
    if (parsed === null || parsed <= 0) {
      issues.push({ field, label, message: `${label} must be a positive SPICE number.` });
      return null;
    }
    return parsed;
  };
  const nonNegative = (field: string, label: string, value: string): number | null => {
    const parsed = parseSpiceUnitStrict(value);
    if (parsed === null || parsed < 0) {
      issues.push({ field, label, message: `${label} must be zero or a positive SPICE number.` });
      return null;
    }
    return parsed;
  };

  switch (a.kind) {
    case "op":
      break;
    case "tran": {
      const tstep = positive("tstep", "Time step", a.tstep);
      const tstop = positive("tstop", "Stop time", a.tstop);
      if (a.tstart) {
        const tstart = nonNegative("tstart", "Start time", a.tstart);
        if (tstart !== null && tstop !== null && tstart >= tstop) {
          issues.push({ field: "tstart", label: "Start time", message: "Start time must be before stop time." });
        }
      }
      if (tstep !== null && tstop !== null && tstep > tstop) {
        issues.push({ field: "tstep", label: "Time step", message: "Time step must not be larger than stop time." });
      }
      break;
    }
    case "dc": {
      const start = parseSpiceUnitStrict(a.start);
      const stop = parseSpiceUnitStrict(a.stop);
      const step = parseSpiceUnitStrict(a.step);
      if (start === null) issues.push({ field: "start", label: "Start", message: "Start must be a SPICE number." });
      if (stop === null) issues.push({ field: "stop", label: "Stop", message: "Stop must be a SPICE number." });
      if (step === null || step === 0) issues.push({ field: "step", label: "Step", message: "Step must be a non-zero SPICE number." });
      if (start !== null && stop !== null && step !== null && step !== 0) {
        const span = stop - start;
        if (span !== 0 && Math.sign(span) !== Math.sign(step)) {
          issues.push({ field: "step", label: "Step", message: "Step sign must move from start toward stop." });
        }
      }
      break;
    }
    case "ac": {
      if (!Number.isInteger(a.npts) || a.npts <= 0) {
        issues.push({ field: "npts", label: "Points", message: "Points must be a positive integer." });
      }
      const fstart = positive("fstart", "F start", a.fstart);
      const fstop = positive("fstop", "F stop", a.fstop);
      if (fstart !== null && fstop !== null && fstart >= fstop) {
        issues.push({ field: "fstart", label: "F start", message: "F start must be below F stop." });
      }
      break;
    }
    case "noise": {
      if (!a.out_node.trim()) {
        issues.push({ field: "out_node", label: "Output node", message: "Output node is required." });
      }
      if (!Number.isInteger(a.npts) || a.npts <= 0) {
        issues.push({ field: "npts", label: "Points", message: "Points must be a positive integer." });
      }
      const fstart = positive("fstart", "F start", a.fstart);
      const fstop = positive("fstop", "F stop", a.fstop);
      if (fstart !== null && fstop !== null && fstart >= fstop) {
        issues.push({ field: "fstart", label: "F start", message: "F start must be below F stop." });
      }
      break;
    }
  }
  return issues;
}

function parseRequired(label: string, value: string): number {
  const parsed = parseSpiceUnitStrict(value);
  if (parsed === null) throw new Error(`${label} must be a valid SPICE number.`);
  return parsed;
}

export function analysisToApi(a: AnalysisSpec): ApiAnalysis {
  const issues = validateAnalysisSpec(a);
  if (issues.length > 0) throw new Error(issues[0].message);
  switch (a.kind) {
    case "op":
      return { kind: "op" };
    case "tran":
      return {
        kind: "tran",
        tstep: parseRequired("Time step", a.tstep),
        tstop: parseRequired("Stop time", a.tstop),
        tstart: a.tstart ? parseRequired("Start time", a.tstart) : undefined,
      };
    case "dc":
      return {
        kind: "dcsweep",
        src: a.src,
        start: parseRequired("Start", a.start),
        stop: parseRequired("Stop", a.stop),
        step: parseRequired("Step", a.step),
      };
    case "ac":
      return {
        kind: "ac",
        sweep: a.sweep,
        npts: a.npts,
        fstart: parseRequired("F start", a.fstart),
        fstop: parseRequired("F stop", a.fstop),
      };
    case "noise":
      return {
        kind: "noise",
        out_node: a.out_node,
        src: a.src,
        sweep: a.sweep,
        npts: a.npts,
        fstart: parseRequired("F start", a.fstart),
        fstop: parseRequired("F stop", a.fstop),
      };
  }
}

export function analysisWithSweepSource(a: AnalysisSpec, src: string): AnalysisSpec {
  if (a.kind !== "dc" && a.kind !== "noise") return a;
  if (a.src === src) return a;
  return { ...a, src };
}
