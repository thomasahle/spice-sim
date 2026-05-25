// Bridge to the Rust SPICE engine.
//
// Three runtime modes:
//   1. Inside Tauri  → call the engine via tauri::invoke (zero-RPC).
//   2. Outside Tauri but the dev Tauri's HTTP control endpoint is reachable
//      on 127.0.0.1:7890 → fetch that. Lets the dev browser drive the live
//      app's ngspice end-to-end (scope, FFT, all of it).
//   3. Browser-only site with bundled ngspice WASM → run in a Web Worker.
//   4. Nothing reachable → throw with an actionable message.

import { isWasmBackendAvailable, simulateWithWasm, wasmEngineProbe } from "./wasmBackend.ts";

export interface SimVector {
  name: string;
  is_scale: boolean;
  data: number[];
  phase?: number[];
}

export interface Measurement {
  name: string;
  value: number;
  at: number | null;
  raw: string;
}

export interface SimResult {
  plot: string;
  vectors: SimVector[];
  log: string;
  measurements: Measurement[];
}

export interface EngineInfo {
  name: string;
  version: string;
  library_path: string;
}

export type Analysis =
  | { kind: "op" }
  | { kind: "tran"; tstep: number; tstop: number; tstart?: number }
  | { kind: "dc"; src: string; start: number; stop: number; step: number }
  | { kind: "ac"; sweep: "dec" | "oct" | "lin"; npts: number; fstart: number; fstop: number }
  | {
      kind: "noise";
      out_node: string;
      src: string;
      sweep: "dec" | "oct" | "lin";
      npts: number;
      fstart: number;
      fstop: number;
    };

const HTTP_BASE = "http://127.0.0.1:7890";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Cache successful HTTP probes, but never cache failures. During development
// the browser can load before the Tauri HTTP bridge starts; a cached negative
// result would make the app stay offline until reload.
let httpAvailable = false;
export function nextHttpProbeCache(previous: boolean, ok: boolean): boolean {
  return previous || ok;
}

export function engineErrorMessage(payload: unknown, fallback: string): string {
  const message = messageFromUnknown(payload);
  return message || fallback;
}

function messageFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof Error) return value.message.trim();
  if (Array.isArray(value)) {
    return value.map(messageFromUnknown).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["error", "message", "details", "stderr", "stdout", "log"]) {
    const nested = messageFromUnknown(record[key]);
    if (nested) return nested;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function probeHttp(): Promise<boolean> {
  if (httpAvailable) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const r = await fetch(`${HTTP_BASE}/ping`, { signal: ctrl.signal });
    clearTimeout(t);
    httpAvailable = nextHttpProbeCache(httpAvailable, r.ok);
  } catch {
    return false;
  }
  return httpAvailable;
}

const UNAVAILABLE_MSG =
  "ngspice bridge unavailable. Either launch the Tauri app (`npx tauri dev`) for in-process simulation, or make sure its HTTP control endpoint at " +
  HTTP_BASE +
  " is reachable. For browser-only simulation, run `npm run build:ngspice-wasm` so the ngspice WASM artifacts are present under public/vendor/ngspice.";

export async function engineProbe(): Promise<EngineInfo> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineInfo>("engine_probe");
  }
  if (await probeHttp()) {
    const r = await fetch(`${HTTP_BASE}/engine_probe`);
    if (!r.ok) throw new Error(`engine_probe HTTP ${r.status}`);
    return (await r.json()) as EngineInfo;
  }
  if (await isWasmBackendAvailable()) {
    return wasmEngineProbe();
  }
  throw new Error(UNAVAILABLE_MSG);
}

export async function simulate(
  netlist: string,
  analysis: Analysis,
): Promise<SimResult> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SimResult>("simulate", { netlist, analysis });
  }
  if (await probeHttp()) {
    const r = await fetch(`${HTTP_BASE}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ netlist, analysis }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(engineErrorMessage(err, r.statusText));
    }
    return (await r.json()) as SimResult;
  }
  if (await isWasmBackendAvailable()) {
    return simulateWithWasm(netlist, analysis);
  }
  throw new Error(UNAVAILABLE_MSG);
}
