// Left-side drawing tool strip + the hover/focus popovers for tool groups
// (Sources / MOSFETs / etc.) and Subcircuits. Pulled out of Editor.tsx as a
// single subcomponent — the popover is rendered as a sibling of the aside,
// but they share state (activeToolGroupId / activeToolGroupTop) so it makes
// sense to keep them together.

import * as Tooltip from "@radix-ui/react-tooltip";
import type { ComponentKind } from "./model.ts";
import type { LegacySchematicPage as SchematicPage } from "./legacyModel.ts";
import { subcircuitPortLabels } from "./legacyModel.ts";
import type { MosfetPreset } from "./modelPresets.ts";
import { PaletteGlyph } from "./symbols.tsx";
import { ToolIcon } from "./editorChrome.tsx";
import { defaultMosfetPresetId } from "./presetLibrary.ts";
import { toolDescriptionFor, type Tool } from "./toolPredicates.ts";

interface PaletteItem {
  tool: Tool;
  name: string;
  hint?: string;
  desc?: string;
  kind?: ComponentKind;
}

interface ToolGroupSpec {
  id: string;
  label: string;
  summary: string;
  primary: Tool;
  tools: Tool[];
}

interface EditorToolStripProps {
  tool: Tool;
  directItems: ReadonlyArray<PaletteItem>;
  toolGroups: ReadonlyArray<ToolGroupSpec>;
  activeToolGroupId: string | null;
  activeToolGroupTop: number;
  subcircuitMenuOpen: boolean;
  openToolGroup: ToolGroupSpec | null;
  openToolItems: ReadonlyArray<PaletteItem>;
  subcircuitPages: SchematicPage[];
  selectedSubcircuitPage: SchematicPage | null;
  selectedSubcircuitPageId: string | null;
  mosfetPresets: MosfetPreset[];
  selectedMosfetPresetId: Record<"NMOS" | "PMOS", string>;
  onSelectTool: (tool: Tool) => void;
  onSelectSubcircuitTool: (pageId: string) => void;
  onSetSelectedMosfetPresetId: (
    updater: (prev: Record<"NMOS" | "PMOS", string>) => Record<"NMOS" | "PMOS", string>,
  ) => void;
  onClearActiveToolGroup: () => void;
  onOpenToolGroupMenu: (groupId: string, top: number) => void;
  onScheduleToolGroupClose: () => void;
  onClearToolGroupCloseTimer: () => void;
  lookupPaletteItem: (tool: Tool) => PaletteItem | undefined;
}

export function EditorToolStrip({
  tool,
  directItems,
  toolGroups,
  activeToolGroupId,
  activeToolGroupTop,
  subcircuitMenuOpen,
  openToolGroup,
  openToolItems,
  subcircuitPages,
  selectedSubcircuitPage,
  selectedSubcircuitPageId,
  mosfetPresets,
  selectedMosfetPresetId,
  onSelectTool,
  onSelectSubcircuitTool,
  onSetSelectedMosfetPresetId,
  onClearActiveToolGroup,
  onOpenToolGroupMenu,
  onScheduleToolGroupClose,
  onClearToolGroupCloseTimer,
  lookupPaletteItem,
}: EditorToolStripProps) {
  return (
    <>
      <aside className="tool-strip" role="toolbar" aria-label="Drawing tools">
        <Tooltip.Provider delayDuration={260} skipDelayDuration={120}>
          {directItems.map((item) => {
            const itemKind = item.kind;
            return (
              <Tooltip.Root key={item.tool}>
                <Tooltip.Trigger asChild>
                  <button
                    className={`tool-icon ${tool === item.tool ? "active" : ""}`}
                    onClick={() => onSelectTool(item.tool)}
                    onMouseEnter={onClearActiveToolGroup}
                    onFocus={onClearActiveToolGroup}
                    aria-label={item.name}
                    aria-pressed={tool === item.tool}
                    aria-keyshortcuts={item.hint}
                  >
                    {itemKind ? <PaletteGlyph kind={itemKind} /> : <ToolIcon tool={item.tool} />}
                    {item.hint && <span className="tool-hint">{item.hint}</span>}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tool-tip" side="right" align="center" sideOffset={10}>
                    <span className="tool-tip-head">
                      <span className="tool-tip-name">{item.name}</span>
                      {item.hint && <kbd className="tool-tip-key">{item.hint}</kbd>}
                    </span>
                    {item.desc && (
                      <span className="tool-tip-desc">
                        {itemKind ? toolDescriptionFor(itemKind, item.desc) : item.desc}
                      </span>
                    )}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </Tooltip.Provider>
        <div className="tool-sep" />
        {toolGroups.map((group) => {
          const groupActive = group.tools.includes(tool);
          const displayTool = groupActive ? tool : group.primary;
          const displayItem = lookupPaletteItem(displayTool) ?? lookupPaletteItem(group.primary);
          const displayKind = displayItem?.kind ?? group.primary;
          return (
            <button
              key={group.id}
              type="button"
              className={`tool-icon tool-group-icon ${groupActive ? "active" : ""} ${activeToolGroupId === group.id ? "open" : ""}`}
              onClick={() => onSelectTool(displayTool)}
              onMouseEnter={(e) => onOpenToolGroupMenu(group.id, Math.max(0, e.currentTarget.offsetTop - 11))}
              onMouseLeave={onScheduleToolGroupClose}
              onFocus={(e) => onOpenToolGroupMenu(group.id, Math.max(0, e.currentTarget.offsetTop - 11))}
              onBlur={onScheduleToolGroupClose}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenToolGroupMenu(group.id, Math.max(0, e.currentTarget.offsetTop - 11));
              }}
              aria-label={group.label}
              aria-pressed={groupActive}
              aria-haspopup="dialog"
              aria-expanded={activeToolGroupId === group.id}
            >
              <PaletteGlyph kind={displayKind as ComponentKind} />
              <span className="tool-group-corner" />
            </button>
          );
        })}
        <button
          type="button"
          className={`tool-icon tool-group-icon ${tool === "SUBX" ? "active" : ""} ${subcircuitMenuOpen ? "open" : ""}`}
          onClick={(e) => {
            if (selectedSubcircuitPage) onSelectSubcircuitTool(selectedSubcircuitPage.id);
            else onOpenToolGroupMenu("subcircuits", Math.max(0, e.currentTarget.offsetTop - 11));
          }}
          onMouseEnter={(e) => onOpenToolGroupMenu("subcircuits", Math.max(0, e.currentTarget.offsetTop - 11))}
          onMouseLeave={onScheduleToolGroupClose}
          onFocus={(e) => onOpenToolGroupMenu("subcircuits", Math.max(0, e.currentTarget.offsetTop - 11))}
          onBlur={onScheduleToolGroupClose}
          aria-label="Subcircuits"
          aria-pressed={tool === "SUBX"}
          aria-haspopup="dialog"
          aria-expanded={subcircuitMenuOpen}
        >
          <PaletteGlyph kind="SUBX" />
          <span className="tool-group-corner" />
        </button>
      </aside>
      {(openToolGroup || subcircuitMenuOpen) && (
        <div
          className="tool-popover"
          role="dialog"
          aria-label={openToolGroup ? `${openToolGroup.label} tools` : "Subcircuit tools"}
          style={{ top: activeToolGroupTop + 14 }}
          onMouseEnter={onClearToolGroupCloseTimer}
          onMouseLeave={onScheduleToolGroupClose}
        >
          {openToolGroup ? (
            <>
              <div className="tool-popover-current">
                <div className="tool-popover-current-head">
                  <span className="tool-popover-name">{openToolGroup.label}</span>
                </div>
                <div className="tool-popover-desc">{openToolGroup.summary}</div>
              </div>
              {openToolGroup.id === "mosfets" ? (
                <div className="tool-popover-list">
                  {mosfetPresets.map((preset) => {
                    const active =
                      tool === preset.kind &&
                      selectedMosfetPresetId[preset.kind] === preset.id;
                    const defaultId = defaultMosfetPresetId(preset.kind);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`tool-popover-row ${active ? "active" : ""}`}
                        onClick={() => {
                          onSetSelectedMosfetPresetId((prev) => ({
                            ...prev,
                            [preset.kind]: preset.id,
                          }));
                          onSelectTool(preset.kind);
                        }}
                        aria-pressed={active}
                      >
                        <span className="tool-popover-icon">
                          <PaletteGlyph kind={preset.kind} />
                        </span>
                        <span className="tool-popover-copy">
                          <span className="tool-popover-name">{preset.name}</span>
                          <span className="tool-popover-desc">
                            {preset.description} Model {preset.model}; W={preset.W}, L={preset.L}
                          </span>
                        </span>
                        <span className="preset-row-meta">
                          {preset.id === defaultId && <span className="preset-default-chip">Default</span>}
                          <kbd>{preset.kind === "NMOS" ? "M" : "⇧M"}</kbd>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : openToolItems.length > 0 && (
                <div className="tool-popover-list">
                  {openToolItems.map((item) => {
                    const itemKind = item.kind;
                    const active = item.tool === tool;
                    return (
                      <button
                        key={item.tool}
                        type="button"
                        className={`tool-popover-row ${active ? "active" : ""}`}
                        onClick={() => onSelectTool(item.tool)}
                        aria-pressed={active}
                      >
                        <span className="tool-popover-icon">
                          {itemKind ? <PaletteGlyph kind={itemKind} /> : <ToolIcon tool={item.tool} />}
                        </span>
                        <span className="tool-popover-copy">
                          <span className="tool-popover-name">{item.name}</span>
                          <span className="tool-popover-desc">{itemKind ? toolDescriptionFor(itemKind, item.desc) : item.desc}</span>
                        </span>
                        {item.hint && <kbd>{item.hint}</kbd>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="tool-popover-current">
                <div className="tool-popover-current-head">
                  <span className="tool-popover-name">Subcircuits</span>
                </div>
                <div className="tool-popover-desc">
                  Place schematic pages as reusable blocks.
                </div>
              </div>
              <div className="tool-popover-list">
                {subcircuitPages.length === 0 ? (
                  <div className="tool-popover-empty">No subcircuit schematics yet.</div>
                ) : (
                  subcircuitPages.map((subPage) => {
                    const pins = subcircuitPortLabels(subPage);
                    const hasPorts = pins.length > 0;
                    const active = tool === "SUBX" && selectedSubcircuitPageId === subPage.id;
                    return (
                      <button
                        key={subPage.id}
                        type="button"
                        className={`tool-popover-row ${active ? "active" : ""}`}
                        onClick={() => onSelectSubcircuitTool(subPage.id)}
                        aria-pressed={active}
                        disabled={!hasPorts}
                        title={hasPorts ? undefined : "Add port labels in this schematic to expose subcircuit pins"}
                      >
                        <span className="tool-popover-icon">
                          <PaletteGlyph kind="SUBX" />
                        </span>
                        <span className="tool-popover-copy">
                          <span className="tool-popover-name">{subPage.name}</span>
                          <span className="tool-popover-desc">
                            {subPage.description?.trim() || (
                              hasPorts
                                ? `${pins.length} pin${pins.length === 1 ? "" : "s"} from net labels`
                                : "No exposed pins. Mark net labels as ports to place this schematic."
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
