// Left sidebar: Projects list (with active project's pages expanded),
// File actions, and the Examples demos. Pulled out of Editor.tsx as a
// prop-driven presenter.

import { DEMOS } from "./demos.ts";
import type { Workspace } from "./projects.ts";
import type { LegacySchematicPage as SchematicPage } from "./legacyModel.ts";
import { IconGlyph, SideNavIcon } from "./editorChrome.tsx";

interface EditorLeftSidebarProps {
  workspace: Workspace;
  pages: SchematicPage[];
  activePageId: string;
  pagesCollapsed: boolean;
  onCreateProject: () => void;
  onRenameProject: (projectId: string, name: string) => void;
  onSwitchProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onCreateSubcircuitPage: () => void;
  onSwitchPage: (pageId: string) => void;
  onRenameSubPage: (pageId: string, name: string) => void;
  onDeleteSubPage: (pageId: string) => void;
  onMenu: (action: string) => void;
  onExportSchematicSvg: () => void;
  onCopyShareLink: () => void;
  onLoadDemo: (demoId: string) => void;
}

export function EditorLeftSidebar({
  workspace,
  pages,
  activePageId,
  pagesCollapsed,
  onCreateProject,
  onRenameProject,
  onSwitchProject,
  onRemoveProject,
  onCreateSubcircuitPage,
  onSwitchPage,
  onRenameSubPage,
  onDeleteSubPage,
  onMenu,
  onExportSchematicSvg,
  onCopyShareLink,
  onLoadDemo,
}: EditorLeftSidebarProps) {
  return (
    <aside className="side-nav" aria-hidden={pagesCollapsed}>
      {/* Sidebar toggle lives in the app titlebar — see App.tsx. */}

      <div className="side-nav-section-head">
        <span>Projects</span>
        <button
          type="button"
          className="side-nav-add"
          onClick={onCreateProject}
          title="New project"
          aria-label="New project"
        >
          +
        </button>
      </div>

      <div className="side-nav-projects">
        {workspace.projects.map((proj) => {
          const isActive = proj.id === workspace.active;
          const projectPages = isActive ? pages : [];
          return (
            <div
              key={proj.id}
              className={`side-proj ${isActive ? "expanded" : ""}`}
            >
              {isActive ? (
                <div
                  className="side-proj-head active"
                  title={proj.name}
                  aria-current="true"
                >
                  <SideNavIcon kind="folder" />
                  <input
                    className="side-proj-name-input"
                    value={proj.name}
                    onChange={(e) => onRenameProject(proj.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Project name"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="side-proj-add"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSubcircuitPage();
                    }}
                    title="New schematic"
                    aria-label={`New schematic in ${proj.name}`}
                  >
                    +
                  </button>
                  {workspace.projects.length > 1 && (
                    <button
                      type="button"
                      className="side-proj-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveProject(proj.id);
                      }}
                      title="Delete this project"
                      aria-label={`Delete project ${proj.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ) : (
                <button
                  className="side-proj-head"
                  onClick={() => onSwitchProject(proj.id)}
                  title={`Open project: ${proj.name}`}
                  aria-label={`Open project ${proj.name}`}
                >
                  <SideNavIcon kind="folder" />
                  <span className="side-proj-name">{proj.name}</span>
                </button>
              )}
              {projectPages.map((p, i) => {
                const pageActive = p.id === activePageId;
                const isMain = i === 0;
                return (
                  <div
                    key={p.id}
                    className={`side-page ${pageActive ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-current={pageActive ? "page" : undefined}
                    aria-label={isMain ? "Open main schematic" : `Open subcircuit ${p.name}`}
                    onClick={() => onSwitchPage(p.id)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      onSwitchPage(p.id);
                    }}
                    title={
                      isMain
                        ? "Root schematic (emits main netlist)"
                        : `.subckt ${p.name}`
                    }
                  >
                    {pageActive && !isMain ? (
                      <input
                        className="side-page-input"
                        value={p.name}
                        onChange={(e) => {
                          const next = e.target.value.replace(
                            /[^A-Za-z0-9_]/g,
                            "_",
                          );
                          onRenameSubPage(p.id, next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        aria-label="Subcircuit name"
                      />
                    ) : (
                      <span className="side-page-name">
                        {isMain ? "Main schematic" : p.name}
                      </span>
                    )}
                    {i < 9 && (
                      <span className="side-page-shortcut">⌘{i + 1}</span>
                    )}
                    {!isMain && (
                      <button
                        type="button"
                        className="side-page-del"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete subcircuit "${p.name}"?`)) return;
                          onDeleteSubPage(p.id);
                        }}
                        title="Delete subcircuit"
                        aria-label={`Delete subcircuit ${p.name}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="side-nav-section-head side-nav-section-head-tight">
        <span>File</span>
      </div>
      <nav className="side-nav-actions side-nav-file-actions" aria-label="File actions">
        <button
          type="button"
          className="side-nav-action"
          onClick={() => onMenu("file:new")}
          title="New circuit (⌘N)"
          aria-label="New circuit"
        >
          <IconGlyph kind="new" />
          <span>New circuit</span>
        </button>
        <button
          type="button"
          className="side-nav-action"
          onClick={() => onMenu("file:open")}
          title="Open (⌘O)"
          aria-label="Open"
        >
          <IconGlyph kind="open" />
          <span>Open</span>
        </button>
        <button
          type="button"
          className="side-nav-action"
          onClick={() => onMenu("file:import_netlist")}
          title="Import a SPICE netlist as an approximate schematic"
          aria-label="Import netlist"
        >
          <IconGlyph kind="netlist" />
          <span>Import netlist</span>
        </button>
        <button
          type="button"
          className="side-nav-action"
          onClick={() => onMenu("file:save")}
          title="Save (⌘S)"
          aria-label="Save"
        >
          <IconGlyph kind="save" />
          <span>Save</span>
        </button>
        <button
          type="button"
          className="side-nav-action"
          onClick={onExportSchematicSvg}
          title="Export schematic SVG"
          aria-label="Export schematic SVG"
        >
          <IconGlyph kind="export" />
          <span>Export SVG</span>
        </button>
        <button
          type="button"
          className="side-nav-action"
          onClick={onCopyShareLink}
          title="Copy shareable circuit URL"
          aria-label="Copy shareable circuit URL"
        >
          <IconGlyph kind="share" />
          <span>Share</span>
        </button>
      </nav>

      <div className="side-nav-section-head side-nav-section-head-tight side-nav-examples-head">
        <span>Examples</span>
      </div>
      <div className="side-nav-examples">
        {DEMOS.map((d) => (
          <button
            key={d.id}
            type="button"
            className="side-nav-example"
            onClick={() => onLoadDemo(d.id)}
            title={d.description}
          >
            {d.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
