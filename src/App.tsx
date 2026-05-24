import { useEffect, useState } from "react";
import { Editor } from "./editor/Editor";
import "./styles.css";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const REPO_SLUG = "thomasahle/spice-sim";
const STARS_CACHE_KEY = `spicesim.github-stars.${REPO_SLUG}`;
const STARS_TTL_MS = 60 * 60 * 1000; // 1h

function formatStarCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k >= 10 ? k.toFixed(0) : k.toFixed(1)) + "k";
}

function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(STARS_CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw) as { count: number; ts: number };
      return typeof entry.count === "number" ? entry.count : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STARS_CACHE_KEY);
      if (raw) {
        const entry = JSON.parse(raw) as { count: number; ts: number };
        if (Date.now() - entry.ts < STARS_TTL_MS) return;
      }
    } catch {
      /* fall through to refetch */
    }
    fetch(`https://api.github.com/repos/${REPO_SLUG}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
          try {
            localStorage.setItem(
              STARS_CACHE_KEY,
              JSON.stringify({ count: data.stargazers_count, ts: Date.now() }),
            );
          } catch {
            /* ignore quota */
          }
        }
      })
      .catch(() => {
        /* offline or rate-limited — silently keep cached value */
      });
  }, []);
  return stars;
}

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

  const stars = useGithubStars();

  return (
    <div className={`app${IS_TAURI ? "" : " website"}`}>
      {!IS_TAURI && (
        <header className="app-header">
          <button
            className={`app-header-pane-toggle left ${sidebarCollapsed ? "collapsed" : ""}`}
            onClick={toggleSidebar}
            aria-pressed={!sidebarCollapsed}
            title={sidebarCollapsed ? "Show sidebar (⌘\\)" : "Hide sidebar (⌘\\)"}
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
          <a
            className="app-header-brand"
            href={`https://github.com/${REPO_SLUG}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Spice Sim on GitHub"
          >
            <svg
              className="app-header-logo"
              viewBox="0 0 32 32"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {/* Top horizontal bar. */}
              <line x1="5" y1="5" x2="27" y2="5" />
              {/* Central vertical: top bar → bottom terminal. */}
              <line x1="16" y1="5" x2="16" y2="28" />
              {/* Left and right mid arms — broken at the centre so the
                 horizontal wire reads as passing behind the T rather than
                 connecting to it. */}
              <line x1="6" y1="15" x2="13" y2="15" />
              <line x1="19" y1="15" x2="26" y2="15" />
              {/* Three hollow terminals. */}
              <circle cx="4" cy="15" r="2" />
              <circle cx="28" cy="15" r="2" />
              <circle cx="16" cy="29" r="2" />
            </svg>
            <span className="app-header-name">Spice Sim</span>
          </a>
          <div className="app-header-spacer" />
          <a
            className="app-header-stars"
            href={`https://github.com/${REPO_SLUG}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Star ${REPO_SLUG} on GitHub`}
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
              width={14}
              height={14}
            >
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
            </svg>
            <span className="app-header-stars-label">Star</span>
            {stars !== null && (
              <span className="app-header-stars-count">{formatStarCount(stars)}</span>
            )}
          </a>
          <button
            className={`app-header-pane-toggle right ${inspectorCollapsed ? "collapsed" : ""}`}
            onClick={toggleInspector}
            aria-pressed={!inspectorCollapsed}
            title={inspectorCollapsed ? "Show inspector (⇧⌘\\)" : "Hide inspector (⇧⌘\\)"}
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
        </header>
      )}
      {IS_TAURI && (
        /* Tauri 2 drag-region: empty string is the canonical "drag here"
           value. React's bare-prop shorthand renders as `"true"` which some
           versions of the drag-handler don't match — be explicit. */
        <div className="titlebar" data-tauri-drag-region="">
          <button
            className={`titlebar-pane-toggle left ${sidebarCollapsed ? "collapsed" : ""}`}
            data-tauri-drag-region="false"
            onClick={toggleSidebar}
            aria-pressed={!sidebarCollapsed}
            title={sidebarCollapsed ? "Show sidebar (⌘\\)" : "Hide sidebar (⌘\\)"}
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
              inspectorCollapsed ? "Show inspector (⇧⌘\\)" : "Hide inspector (⇧⌘\\)"
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
      )}
      <Editor />
    </div>
  );
}
