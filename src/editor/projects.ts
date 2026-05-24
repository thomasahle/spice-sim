// Lightweight workspace model: multiple projects, each holding a CircuitDoc.
// Persisted to localStorage so projects survive reloads without requiring
// disk save. Disk save (.spicesim) still works for export/share.

import type { CircuitDoc } from "./model";

export interface ProjectEntry {
  id: string;
  name: string;
}

export interface Workspace {
  active: string;
  projects: ProjectEntry[];
}

const WORKSPACE_KEY = "spicesim.workspace";
const PROJECT_PREFIX = "spicesim.project.";

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function loadWorkspace(): Workspace {
  try {
    const w = safeParse<Workspace | null>(localStorage.getItem(WORKSPACE_KEY), null);
    if (w && Array.isArray(w.projects) && w.projects.length > 0 && w.active) {
      // Validate active points at a real project
      if (w.projects.some((p) => p.id === w.active)) return w;
      return { ...w, active: w.projects[0].id };
    }
  } catch {
    /* localStorage unavailable */
  }
  return { active: "", projects: [] };
}

/**
 * Single global listener for storage failures. Editor wires this up so it
 * can render a banner / toast — projects.ts must not import React.
 */
let onQuotaFailure: ((kind: "workspace" | "project") => void) | null = null;
export function setStorageFailureHandler(
  fn: ((kind: "workspace" | "project") => void) | null,
) {
  onQuotaFailure = fn;
}

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // Spec name + Chrome/Firefox legacy code 22 + Safari "quota" string.
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(e.message)
  );
}

export function saveWorkspace(w: Workspace) {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(w));
  } catch (e) {
    if (isQuotaError(e) && onQuotaFailure) onQuotaFailure("workspace");
    console.warn("[Spice Sim] saveWorkspace failed", e);
  }
}

export function loadProject(id: string): CircuitDoc | null {
  try {
    return safeParse<CircuitDoc | null>(
      localStorage.getItem(PROJECT_PREFIX + id),
      null,
    );
  } catch {
    return null;
  }
}

export function saveProject(id: string, doc: CircuitDoc) {
  try {
    localStorage.setItem(PROJECT_PREFIX + id, JSON.stringify(doc));
  } catch (e) {
    if (isQuotaError(e) && onQuotaFailure) onQuotaFailure("project");
    console.warn("[Spice Sim] saveProject failed", e);
  }
}

export function deleteProject(id: string) {
  try {
    localStorage.removeItem(PROJECT_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export function newProjectId(): string {
  return `prj-${Math.random().toString(36).slice(2, 10)}`;
}
