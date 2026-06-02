// Wire up workspace + active-doc persistence: debounced saveProject on doc
// changes, immediate saveWorkspace on project-list changes, a best-effort
// flush on beforeunload / page-hide, and the window-title + custom event
// that App.tsx listens to for the titlebar. Pulled out of Editor.tsx so the
// editor doesn't carry the four useEffects directly.

import { useEffect, type RefObject } from "react";
import type { LegacyCircuitDoc as CircuitDoc } from "./legacyModel.ts";
import { saveProject, saveWorkspace, type Workspace } from "./projects.ts";

export function useWorkspacePersistence(
  workspace: Workspace,
  doc: CircuitDoc,
  workspaceRef: RefObject<Workspace>,
  docRef: RefObject<CircuitDoc>,
) {
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
  // even when the user closes the window within the 200 ms debounce window.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the active project name in the window title.
  useEffect(() => {
    const active = workspace.projects.find((p) => p.id === workspace.active);
    const name = active?.name ?? "Untitled";
    document.title = `${name} — Spice Sim`;
    window.dispatchEvent(new CustomEvent("spicesim:title", { detail: name }));
  }, [workspace]);
}
