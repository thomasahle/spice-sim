import { useEffect, useState } from "react";
import { Editor } from "./editor/Editor";
import "./styles.css";

export default function App() {
  // Editor dispatches "spicesim:title" whenever the active project name
  // changes; we mirror that into the title bar without coupling state.
  const [title, setTitle] = useState<string>("Spice Sim");
  // Editor owns `pagesCollapsed`; it broadcasts the current state on every
  // change so the titlebar toggle can render its pressed/aria state without
  // having to lift state up.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("spicesim.pagesCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("spicesim.inspectorCollapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const titleHandler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === "string" && ce.detail.trim()) {
        setTitle(ce.detail);
      }
    };
    const sidebarHandler = (e: Event) => {
      const ce = e as CustomEvent<{ collapsed: boolean }>;
      if (ce.detail && typeof ce.detail.collapsed === "boolean") {
        setSidebarCollapsed(ce.detail.collapsed);
      }
    };
    const inspectorHandler = (e: Event) => {
      const ce = e as CustomEvent<{ collapsed: boolean }>;
      if (ce.detail && typeof ce.detail.collapsed === "boolean") {
        setInspectorCollapsed(ce.detail.collapsed);
      }
    };
    window.addEventListener("spicesim:title", titleHandler as EventListener);
    window.addEventListener(
      "spicesim:sidebar-state",
      sidebarHandler as EventListener,
    );
    window.addEventListener(
      "spicesim:inspector-state",
      inspectorHandler as EventListener,
    );
    return () => {
      window.removeEventListener("spicesim:title", titleHandler as EventListener);
      window.removeEventListener(
        "spicesim:sidebar-state",
        sidebarHandler as EventListener,
      );
      window.removeEventListener(
        "spicesim:inspector-state",
        inspectorHandler as EventListener,
      );
    };
  }, []);

  function toggleSidebar() {
    window.dispatchEvent(new CustomEvent("spicesim:toggle-sidebar"));
  }
  function toggleInspector() {
    window.dispatchEvent(new CustomEvent("spicesim:toggle-inspector"));
  }

  return (
    <div className="app">
      {/* Tauri 2 drag-region: empty string is the canonical "drag here"
         value. React's bare-prop shorthand renders as `"true"` which some
         versions of the drag-handler don't match — be explicit. */}
      <div className="titlebar" data-tauri-drag-region="">
        <button
          className={`titlebar-pane-toggle left ${sidebarCollapsed ? "collapsed" : ""}`}
          data-tauri-drag-region="false"
          onClick={toggleSidebar}
          aria-pressed={!sidebarCollapsed}
          title={
            sidebarCollapsed ? "Show sidebar (⌘\\)" : "Hide sidebar (⌘\\)"
          }
          aria-label="Toggle sidebar"
        >
          <svg
            width={17}
            height={17}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1.5" y="2.75" width="13" height="10.5" rx="1.5" />
            <path d="M5.75 2.75v10.5" />
          </svg>
        </button>
        <div className="titlebar-title">{title}</div>
        <button
          className={`titlebar-pane-toggle right ${inspectorCollapsed ? "collapsed" : ""}`}
          data-tauri-drag-region="false"
          onClick={toggleInspector}
          aria-pressed={!inspectorCollapsed}
          title={
            inspectorCollapsed
              ? "Show inspector (⇧⌘\\)"
              : "Hide inspector (⇧⌘\\)"
          }
          aria-label="Toggle inspector"
        >
          <svg
            width={17}
            height={17}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1.5" y="2.75" width="13" height="10.5" rx="1.5" />
            <path d="M10.25 2.75v10.5" />
          </svg>
        </button>
      </div>
      <Editor />
    </div>
  );
}
