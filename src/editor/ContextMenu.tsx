// Lightweight right-click context menu. Positions itself at the click point,
// closes on Escape or outside-click, and supports desktop-menu keyboard
// navigation. Items are passed declaratively so the caller (Editor) can build
// context-aware actions.

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

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
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Defer the listener so the spawning click doesn't immediately close it.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDocDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const firstItem = ref.current?.querySelector<HTMLButtonElement>(
      ".ctx-item:not(:disabled)",
    );
    firstItem?.focus();
  }, [items]);

  // Clamp menu inside the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (r.right > window.innerWidth) nx = Math.max(4, window.innerWidth - r.width - 4);
    if (r.bottom > window.innerHeight) ny = Math.max(4, window.innerHeight - r.height - 4);
    if (nx !== x || ny !== y) {
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    }
  }, [x, y]);

  function enabledItems(): HTMLButtonElement[] {
    return Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(".ctx-item:not(:disabled)") ?? [],
    );
  }

  function focusItem(index: number) {
    const buttons = enabledItems();
    buttons[index]?.focus();
  }

  function focusByDelta(delta: number) {
    const buttons = enabledItems();
    if (buttons.length === 0) return;
    const active = document.activeElement;
    const index = buttons.findIndex((button) => button === active);
    const nextIndex =
      index < 0
        ? delta > 0 ? 0 : buttons.length - 1
        : (index + delta + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusByDelta(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusByDelta(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(enabledItems().length - 1);
    }
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if ("divider" in it && it.divider) {
          return <div key={i} className="ctx-divider" />;
        }
        const item = it as ContextMenuItem;
        return (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            aria-disabled={item.disabled ? "true" : undefined}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            <span className="ctx-label">{item.label}</span>
            {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
