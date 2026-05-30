// Lightweight right-click context menu. Items are passed declaratively so the
// caller (Editor) can build context-aware actions.

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: false;
}

export interface ContextMenuDivider {
  divider: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuDivider;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  return (
    <DropdownMenu.Root open onOpenChange={(open) => {
      if (!open) onClose();
    }} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          className="ctx-anchor"
          style={{ left: x, top: y }}
          aria-label="Canvas context menu anchor"
          tabIndex={-1}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="ctx-menu"
          align="start"
          side="bottom"
          sideOffset={0}
          collisionPadding={4}
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) => {
            if ("divider" in it && it.divider) {
              return <DropdownMenu.Separator key={i} className="ctx-divider" />;
            }
            const item = it as ContextMenuItem;
            return (
              <DropdownMenu.Item
                key={i}
                asChild
                disabled={item.disabled}
                onSelect={(event) => {
                  if (item.disabled) {
                    event.preventDefault();
                    return;
                  }
                  item.onSelect();
                }}
              >
                <button
                  className={`ctx-item ${item.danger ? "danger" : ""}`}
                  disabled={item.disabled}
                  aria-disabled={item.disabled ? "true" : undefined}
                >
                  <span className="ctx-label">{item.label}</span>
                  {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
                </button>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
