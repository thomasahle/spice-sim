import type { Analysis, EngineInfo, SimResult, SimVector } from "./api";

interface RawVariable {
  name: string;
  unit: string;
}

interface WorkerSuccess {
  ok: true;
  raw: string;
  stdout: string;
  stderr: string;
}

interface WorkerFailure {
  ok: false;
  error: string;
  stdout?: string;
  stderr?: string;
}

type WorkerReply = WorkerSuccess | WorkerFailure;

const WASM_TIMEOUT_MS = 30_000;
export const WASM_SPINIT_COMMANDS = [
  "set noaskquit",
  "set filetype=ascii",
  "set savecurrents",
].join("\n") + "\n";
let wasmProbeCache: boolean | null = null;

export function analysisDirective(analysis: Analysis): string {
  switch (analysis.kind) {
    case "op":
      return ".op";
    case "tran":
      return analysis.tstart == null
        ? `.tran ${analysis.tstep} ${analysis.tstop}`
        : `.tran ${analysis.tstep} ${analysis.tstop} ${analysis.tstart}`;
    case "dcsweep":
      return `.dc ${analysis.src.toLowerCase()} ${analysis.start} ${analysis.stop} ${analysis.step}`;
    case "ac":
      return `.ac ${analysis.sweep} ${analysis.npts} ${analysis.fstart} ${analysis.fstop}`;
    case "noise":
      return `.noise v(${analysis.out_node.toLowerCase()}) ${analysis.src.toLowerCase()} ${analysis.sweep} ${analysis.npts} ${analysis.fstart} ${analysis.fstop}`;
  }
}

export function composeBatchNetlist(netlist: string, analysis: Analysis): string {
  const lines = netlist
    .split(/\r?\n/)
    .filter((line) => !/^\.end(?:\s|$)/i.test(line.trim()));
  if (lines.every((line) => line.trim() === "")) {
    lines.unshift("* Spice Sim circuit");
  }
  return [...lines, ".option filetype=ascii", analysisDirective(analysis), ".end", ""].join("\n");
}

function assetBaseUrl(): string {
  if (typeof document !== "undefined") {
    return new URL("./", document.baseURI).toString();
  }
  if (typeof location !== "undefined") {
    return new URL("./", location.href).toString();
  }
  return "/";
}

function wasmAssetUrl(file: string): string {
  return new URL(`vendor/ngspice/${file}`, assetBaseUrl()).toString();
}

export async function isWasmBackendAvailable(): Promise<boolean> {
  if (wasmProbeCache != null) return wasmProbeCache;
  if (typeof fetch === "undefined" || typeof Worker === "undefined") {
    wasmProbeCache = false;
    return false;
  }
  try {
    const response = await fetch(wasmAssetUrl("ngspice.wasm"), {
      method: "HEAD",
      cache: "no-store",
    });
    wasmProbeCache = response.ok;
  } catch {
    wasmProbeCache = false;
  }
  return wasmProbeCache;
}

export function wasmEngineProbe(): EngineInfo {
  return {
    name: "ngspice (wasm)",
    version: "ngspice-46",
    library_path: wasmAssetUrl("ngspice.wasm"),
  };
}

function parseHeaderValue(lines: string[], key: string): string {
  const prefix = `${key}:`;
  const line = lines.find((candidate) => candidate.toLowerCase().startsWith(prefix.toLowerCase()));
  return line == null ? "" : line.slice(prefix.length).trim();
}

function parseCount(lines: string[], key: string): number {
  const value = parseHeaderValue(lines, key);
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Invalid ngspice RAW header field: ${key}`);
  }
  return count;
}

function parseRawNumber(text: string): number {
  const value = text.trim();
  if (/^[+-]?nan$/i.test(value)) return Number.NaN;
  if (/^[+]?inf(?:inity)?$/i.test(value)) return Number.POSITIVE_INFINITY;
  if (/^-inf(?:inity)?$/i.test(value)) return Number.NEGATIVE_INFINITY;
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(value)) {
    throw new Error(`Invalid ngspice RAW numeric value: ${text}`);
  }
  return Number(value);
}

function parseRawValue(text: string, complex: boolean): { value: number; phase?: number } {
  const cleaned = text.trim().replace(/[()]/g, "");
  if (cleaned === "") {
    throw new Error("Invalid ngspice RAW numeric value: empty");
  }
  const parts = cleaned.includes(",") ? cleaned.split(",") : cleaned.split(/\s+/);
  if (complex) {
    if (parts.length !== 2) {
      throw new Error(`Invalid ngspice RAW complex value: ${text}`);
    }
    const real = parseRawNumber(parts[0]);
    const imag = parseRawNumber(parts[1]);
    return {
      value: Math.hypot(real, imag),
      phase: (Math.atan2(imag, real) * 180) / Math.PI,
    };
  }
  if (parts.length !== 1) {
    throw new Error(`Invalid ngspice RAW numeric value: ${text}`);
  }
  return { value: parseRawNumber(parts[0]) };
}

function parseRawScaleValue(text: string): number {
  const cleaned = text.trim().replace(/[()]/g, "");
  if (cleaned === "") {
    throw new Error("Invalid ngspice RAW numeric value: empty");
  }
  const parts = cleaned.includes(",") ? cleaned.split(",") : cleaned.split(/\s+/);
  if (parts.length === 1) return parseRawNumber(parts[0]);
  if (parts.length === 2) return parseRawNumber(parts[0]);
  throw new Error(`Invalid ngspice RAW numeric value: ${text}`);
}

function isScaleVector(name: string, unit: string): boolean {
  const normalized = name.toLowerCase();
  const normalizedUnit = unit.toLowerCase();
  return (
    normalized === "time" ||
    normalized === "frequency" ||
    normalized.endsWith("-sweep") ||
    normalizedUnit === "time" ||
    normalizedUnit === "frequency"
  );
}

export function parseAsciiRaw(raw: string): SimResult {
  const lines = raw.replace(/\f/g, "\n").split(/\r?\n/);
  const variableCount = parseCount(lines, "No. Variables");
  const pointCount = parseCount(lines, "No. Points");
  const flags = parseHeaderValue(lines, "Flags").toLowerCase();
  const complex = flags.includes("complex");
  const plot = parseHeaderValue(lines, "Plotname") || "ngspice-wasm";
  const variablesIndex = lines.findIndex((line) => line.trim().toLowerCase() === "variables:");
  const valuesIndex = lines.findIndex((line) => line.trim().toLowerCase() === "values:");
  if (variablesIndex < 0 || valuesIndex < 0 || valuesIndex <= variablesIndex) {
    throw new Error("Invalid ngspice RAW output: missing Variables or Values section");
  }

  const variables: RawVariable[] = [];
  for (let i = 0; i < variableCount; i += 1) {
    const line = lines[variablesIndex + 1 + i]?.trim() ?? "";
    const match = /^(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid ngspice RAW variable line: ${line}`);
    }
    variables.push({ name: match[2], unit: match[3].trim() });
  }

  const vectors: SimVector[] = variables.map((variable) => ({
    name: variable.name,
    is_scale: isScaleVector(variable.name, variable.unit),
    data: [],
    phase: complex && !isScaleVector(variable.name, variable.unit) ? [] : undefined,
  }));

  const valueLines = lines.slice(valuesIndex + 1).filter((line) => line.trim() !== "");
  let cursor = 0;
  for (let point = 0; point < pointCount; point += 1) {
    for (let variable = 0; variable < variableCount; variable += 1) {
      const line = valueLines[cursor++];
      if (line == null) {
        throw new Error("Invalid ngspice RAW output: not enough values");
      }
      const tokens = line.trim().split(/\s+/);
      const valueText = variable === 0 && tokens.length > 1 ? tokens.slice(1).join(" ") : tokens.join(" ");
      const vector = vectors[variable];
      if (vector == null) {
        throw new Error("Invalid ngspice RAW output: variable index out of range");
      }
      if (vector.is_scale) {
        vector.data.push(parseRawScaleValue(valueText));
      } else {
        const parsed = parseRawValue(valueText, complex);
        vector.data.push(parsed.value);
        if (vector.phase != null) {
          vector.phase.push(parsed.phase ?? 0);
        }
      }
    }
  }
  const trailingLines = valueLines.slice(cursor);
  let measurements: SimResult["measurements"] = [];
  if (trailingLines.length > 0) {
    if (!startsNextRawPlot(trailingLines)) {
      throw new Error("Invalid ngspice RAW output: too many values");
    }
    const trailingPlot = parseHeaderValue(trailingLines, "Plotname");
    if (trailingPlot.toLowerCase() !== "integrated noise") {
      throw new Error(`Unsupported ngspice RAW output: additional plot "${trailingPlot}"`);
    }
    measurements = measurementsFromTrailingRawPlot(trailingLines);
  }

  return {
    plot,
    vectors,
    log: "",
    measurements,
  };
}

function startsNextRawPlot(lines: string[]): boolean {
  if (!/^Title:/i.test(lines[0]?.trim() ?? "")) return false;
  return lines.some((line) => /^Plotname:/i.test(line.trim())) &&
    lines.some((line) => /^No\. Variables:/i.test(line.trim())) &&
    lines.some((line) => /^Variables:/i.test(line.trim())) &&
    lines.some((line) => /^Values:/i.test(line.trim()));
}

function measurementsFromTrailingRawPlot(lines: string[]): SimResult["measurements"] {
  if (lines.length === 0) return [];
  if (!startsNextRawPlot(lines)) return [];
  const plot = parseHeaderValue(lines, "Plotname").toLowerCase();
  if (plot !== "integrated noise") return [];
  const variableCount = parseCount(lines, "No. Variables");
  const pointCount = parseCount(lines, "No. Points");
  if (pointCount !== 1) return [];
  const variablesIndex = lines.findIndex((line) => line.trim().toLowerCase() === "variables:");
  const valuesIndex = lines.findIndex((line) => line.trim().toLowerCase() === "values:");
  if (variablesIndex < 0 || valuesIndex < 0 || valuesIndex <= variablesIndex) return [];

  const variables: RawVariable[] = [];
  for (let i = 0; i < variableCount; i += 1) {
    const line = lines[variablesIndex + 1 + i]?.trim() ?? "";
    const match = /^(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match) return [];
    variables.push({ name: match[2], unit: match[3].trim() });
  }

  const valueLines = lines.slice(valuesIndex + 1).filter((line) => line.trim() !== "");
  if (valueLines.length < variableCount) return [];
  return variables.map((variable, index) => {
    const line = valueLines[index];
    const tokens = line.trim().split(/\s+/);
    const valueText = index === 0 && tokens.length > 1 ? tokens.slice(1).join(" ") : tokens.join(" ");
    const value = parseRawValue(valueText, false).value;
    return {
      name: variable.name,
      value,
      at: null,
      raw: `${variable.name} = ${value}`,
    };
  });
}

function cleanNgspiceStartupLog(log: string | undefined): string {
  return (log ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "Warning: can't find the initialization file spinit.")
    .join("\n")
    .trim();
}

const WORKER_SOURCE = `
self.onmessage = function(event) {
  const id = event.data.id;
  const netlist = event.data.netlist;
  const baseUrl = event.data.baseUrl;
  const stdout = [];
  const stderr = [];
  let completed = false;
  function finish(message) {
    if (completed) return;
    completed = true;
    self.postMessage(Object.assign({ id: id }, message));
  }
  const timer = setTimeout(function() {
    finish({ ok: false, error: "ngspice WASM timed out", stdout: stdout.join("\\n"), stderr: stderr.join("\\n") });
  }, event.data.timeoutMs || 30000);
  function fail(error) {
    clearTimeout(timer);
    finish({
      ok: false,
      error: error && error.message ? error.message : String(error),
      stdout: stdout.join("\\n"),
      stderr: stderr.join("\\n")
    });
  }
  self.Module = {
    noInitialRun: true,
    locateFile: function(path) {
      return new URL("vendor/ngspice/" + path, baseUrl).toString();
    },
    print: function(text) {
      stdout.push(String(text));
    },
    printErr: function(text) {
      stderr.push(String(text));
    },
    onRuntimeInitialized: function() {
      try {
        self.FS.writeFile("/spinit", ${JSON.stringify(WASM_SPINIT_COMMANDS)});
        self.FS.writeFile("/input.cir", netlist);
        self.callMain(["-n", "-b", "-r", "/out.raw", "/input.cir"]);
      } catch (error) {
        if (!error || error.name !== "ExitStatus" || error.status !== 0) {
          fail(error);
          return;
        }
      }
      try {
        const raw = self.FS.readFile("/out.raw", { encoding: "utf8" });
        clearTimeout(timer);
        finish({ ok: true, raw: raw, stdout: stdout.join("\\n"), stderr: stderr.join("\\n") });
      } catch (error) {
        fail(error);
      }
    }
  };
  try {
    importScripts(new URL("vendor/ngspice/ngspice.js", baseUrl).toString());
  } catch (error) {
    fail(error);
  }
};
`;

async function runWorker(netlist: string): Promise<WorkerReply> {
  const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  try {
    return await new Promise<WorkerReply>((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timeout = setTimeout(() => {
        resolve({ ok: false, error: "ngspice WASM worker did not respond" });
      }, WASM_TIMEOUT_MS + 1000);
      worker.onmessage = (event: MessageEvent<WorkerReply & { id: string }>) => {
        if (event.data.id !== id) return;
        clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: event.message });
      };
      worker.postMessage({
        id,
        netlist,
        baseUrl: assetBaseUrl(),
        timeoutMs: WASM_TIMEOUT_MS,
      });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
}

export async function simulateWithWasm(netlist: string, analysis: Analysis): Promise<SimResult> {
  const reply = await runWorker(composeBatchNetlist(netlist, analysis));
  if (!reply.ok) {
    const log = [cleanNgspiceStartupLog(reply.stderr), cleanNgspiceStartupLog(reply.stdout)].filter(Boolean).join("\n");
    throw new Error(log ? `${reply.error}\n${log}` : reply.error);
  }
  try {
    const result = parseAsciiRaw(reply.raw);
    result.log = [cleanNgspiceStartupLog(reply.stdout), cleanNgspiceStartupLog(reply.stderr)].filter(Boolean).join("\n");
    return result;
  } catch (e) {
    // The worker reported success (ngspice exited 0) but the RAW file
    // didn't parse — almost always because ngspice printed an error and
    // refused to run the analysis (singular matrix, missing model,
    // undefined source in `.dc`, …). Surface ngspice's own stderr/stdout
    // as the primary message so the user sees the diagnostic that tells
    // them what to fix, not the parser's downstream complaint.
    const wrapper = e instanceof Error ? e.message : String(e);
    const ngspiceLog = [
      cleanNgspiceStartupLog(reply.stderr),
      cleanNgspiceStartupLog(reply.stdout),
    ]
      .filter(Boolean)
      .join("\n");
    const ngspiceError = extractNgspiceError(ngspiceLog);
    if (ngspiceError) {
      throw new Error(`${ngspiceError}\n\nEngine details:\n${wrapper}${ngspiceLog ? "\n" + ngspiceLog : ""}`, {
        cause: e,
      });
    }
    throw new Error(ngspiceLog ? `${wrapper}\n\n${ngspiceLog}` : wrapper, { cause: e });
  }
}

/**
 * Pull the first meaningful diagnostic line out of an ngspice log so the
 * failure banner can show "could not find model 'NCH'" or "singular matrix"
 * instead of the wrapper's "Invalid ngspice RAW output …" message. We
 * scan for the first line that looks like an error (matches `Error:` /
 * `Fatal:` / starts with `*` / contains `singular matrix` / …).
 */
function extractNgspiceError(log: string): string | null {
  if (!log) return null;
  const lines = log.split(/\r?\n/);
  const errorPattern =
    /(error|fatal|aborted|cannot|singular matrix|could not find|undefined|unknown|missing|no such|invalid|^\*\s*error)/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (errorPattern.test(line)) return line;
  }
  // Nothing obviously errory — return the last non-blank line as a hint.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line) return line;
  }
  return null;
}
