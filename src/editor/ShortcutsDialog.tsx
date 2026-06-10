import * as Dialog from "@radix-ui/react-dialog";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    rows: [
      { keys: ["S"], label: "Select" },
      { keys: ["W"], label: "Wire" },
      { keys: ["N"], label: "Edit nodes" },
      { keys: ["P"], label: "Probe" },
      { keys: ["G"], label: "Ground" },
      { keys: ["T"], label: "Note" },
      { keys: ["V"], label: "Voltage source" },
      { keys: ["I"], label: "Current source" },
      { keys: ["R"], label: "Resistor" },
      { keys: ["C"], label: "Capacitor" },
      { keys: ["L"], label: "Inductor" },
      { keys: ["D"], label: "Diode" },
      { keys: ["Q", "⇧Q"], label: "BJT (NPN / PNP)" },
      { keys: ["M", "⇧M"], label: "MOSFET (NMOS / PMOS)" },
      { keys: ["O"], label: "Op-amp" },
    ],
  },
  {
    title: "Wires",
    rows: [
      { keys: ["Click"], label: "Place wire point" },
      { keys: ["2×Click", "Enter"], label: "Finish wire" },
      { keys: ["Esc"], label: "Cancel wire" },
      { keys: ["⌫"], label: "Remove last wire point" },
      { keys: ["Drag pin"], label: "Quick-wire from a pin" },
    ],
  },
  {
    title: "Edit",
    rows: [
      { keys: [`${MOD}Z`], label: "Undo" },
      { keys: [`⇧${MOD}Z`, `${MOD}Y`], label: "Redo" },
      { keys: [`${MOD}A`], label: "Select all" },
      { keys: [`${MOD}C`, `${MOD}V`], label: "Copy / paste" },
      { keys: [`${MOD}D`], label: "Duplicate" },
      { keys: ["⌫"], label: "Delete selection" },
      { keys: ["⇧R"], label: "Rotate selection" },
      { keys: ["Arrows", "⇧Arrows"], label: "Nudge selection (×10)" },
      { keys: ["Enter", "F2"], label: "Edit selected value / text" },
    ],
  },
  {
    title: "View",
    rows: [
      { keys: ["Space", "H"], label: "Hold to pan" },
      { keys: [`${MOD}+`, `${MOD}−`], label: "Zoom in / out" },
      { keys: [`${MOD}0`], label: "Reset view" },
      { keys: ["⇧F"], label: "Fit schematic" },
      { keys: ["⇧2"], label: "Fit selection" },
      { keys: ["⇧G"], label: "Toggle grid" },
      { keys: ["⇧S"], label: "Toggle snap" },
      { keys: [`${MOD}\\`, `⇧${MOD}\\`], label: "Toggle sidebar / inspector" },
      { keys: [`${MOD}1…9`], label: "Switch schematic page" },
    ],
  },
  {
    title: "Simulate",
    rows: [{ keys: [`${MOD}R`], label: "Run simulation" }],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim" />
        <Dialog.Content className="modal-card shortcuts-modal" aria-label="Keyboard shortcuts">
          <div className="modal-header">
            <Dialog.Title className="modal-title">Keyboard shortcuts</Dialog.Title>
            <Dialog.Description className="sr-only">
              Reference list of the editor's keyboard shortcuts.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button className="icon-btn" title="Close" aria-label="Close dialog">
                <svg
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                >
                  <line x1={3.5} y1={3.5} x2={10.5} y2={10.5} />
                  <line x1={10.5} y1={3.5} x2={3.5} y2={10.5} />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          <div className="shortcuts-grid">
            {GROUPS.map((group) => (
              <section key={group.title} className="shortcuts-group">
                <h3>{group.title}</h3>
                <dl>
                  {group.rows.map((row) => (
                    <div key={row.label} className="shortcuts-row">
                      <dt>
                        {row.keys.map((key, i) => (
                          <span key={key}>
                            {i > 0 && <span className="shortcuts-or"> / </span>}
                            <kbd>{key}</kbd>
                          </span>
                        ))}
                      </dt>
                      <dd>{row.label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
