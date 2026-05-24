// File I/O bridge: save/load .spicesim JSON documents, export .cir netlist.
// Falls back to gracefully no-op behaviour when not running inside Tauri.

import type { CircuitDoc } from "../editor/model";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveDoc(doc: CircuitDoc, path: string | null): Promise<string | null> {
  if (!isTauri()) {
    // Browser fallback: download a JSON file
    const blob = new Blob([JSON.stringify(doc, replaceSets, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circuit.spicesim";
    a.click();
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const target =
    path ??
    (await save({
      title: "Save circuit",
      defaultPath: "circuit.spicesim",
      filters: [
        { name: "Spice Sim Document", extensions: ["spicesim", "json"] },
      ],
    }));
  if (!target) return null;
  await writeTextFile(target, JSON.stringify(doc, replaceSets, 2));
  return target;
}

export async function openDoc(): Promise<{ path: string; doc: CircuitDoc } | null> {
  if (!isTauri()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".spicesim,.json,application/json";
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const text = await f.text();
        try {
          resolve({ path: f.name, doc: JSON.parse(text) });
        } catch {
          resolve(null);
        }
      };
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const sel = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Spice Sim Document", extensions: ["spicesim", "json"] }],
  });
  if (!sel || typeof sel !== "string") return null;
  const text = await readTextFile(sel);
  return { path: sel, doc: JSON.parse(text) };
}

export async function openNetlist(): Promise<{ path: string; text: string } | null> {
  if (!isTauri()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".cir,.net,.sp,.spice,.ckt,text/plain";
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        resolve({ path: f.name, text: await f.text() });
      };
      input.click();
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const sel = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "SPICE netlist", extensions: ["cir", "net", "sp", "spice", "ckt"] }],
  });
  if (!sel || typeof sel !== "string") return null;
  return { path: sel, text: await readTextFile(sel) };
}

export async function exportCsv(
  filename: string,
  vectors: CsvVector[],
): Promise<string | null> {
  const csv = vectorsToCsv(vectors);
  if (!isTauri()) {
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const target = await save({
    title: "Export waveform CSV",
    defaultPath: filename,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!target) return null;
  await writeTextFile(target, csv);
  return target;
}

export interface CsvVector {
  name: string;
  displayName?: string;
  data: number[];
  phase?: number[];
}

export function vectorsToCsv(vectors: CsvVector[]): string {
  if (vectors.length === 0) return "";
  const columns = vectors.flatMap((v) => [
    { name: v.displayName ?? v.name, data: v.data },
    ...(v.phase ? [{ name: `${v.displayName ?? v.name} phase(deg)`, data: v.phase }] : []),
  ]);
  const header = columns.map((v) => csvEscape(v.name)).join(",");
  const rows: string[] = [header];
  const len = Math.max(...columns.map((v) => v.data.length));
  for (let i = 0; i < len; i++) {
    const row = columns
      .map((v) => (i < v.data.length ? String(v.data[i]) : ""))
      .join(",");
    rows.push(row);
  }
  return rows.join("\n");
}

function csvEscape(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportNetlist(netlist: string): Promise<string | null> {
  if (!isTauri()) {
    const blob = new Blob([netlist], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circuit.cir";
    a.click();
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const target = await save({
    title: "Export SPICE netlist",
    defaultPath: "circuit.cir",
    filters: [{ name: "SPICE netlist", extensions: ["cir", "net", "sp"] }],
  });
  if (!target) return null;
  await writeTextFile(target, netlist);
  return target;
}

export async function exportSvg(filename: string, svg: string): Promise<string | null> {
  if (!isTauri()) {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    return null;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  const target = await save({
    title: "Export schematic SVG",
    defaultPath: filename,
    filters: [{ name: "SVG image", extensions: ["svg"] }],
  });
  if (!target) return null;
  await writeTextFile(target, svg);
  return target;
}

export async function onMenuEvent(handler: (id: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("menu", (e) => handler(e.payload));
  return unlisten;
}

// JSON.stringify replacer: Sets aren't serializable by default. We don't use
// them in the persisted doc shape, but defensive for future fields.
function replaceSets(_key: string, value: unknown): unknown {
  if (value instanceof Set) return Array.from(value);
  if (value instanceof Map) return Array.from(value.entries());
  return value;
}
