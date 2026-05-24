# Spice Sim TODO

## Canvas Interaction Polish

- [ ] Rewrite the remaining canvas interaction layer around explicit modes and consistent rules: select, drag, insert, wire, pan, resize, edit text.
- [ ] Keep natural macOS panning as the only scroll-pan direction; remove any code paths that can invert trackpad pan behavior.
- [ ] Make grid snapping optional everywhere and ensure freeform mode never forces right-angle wires or grid-aligned movement.
- [ ] Keep wires and probes attached when components move, rotate, or are duplicated.
- [ ] Improve wire dragging so freeform wires can be diagonal/direct when snap is off and orthogonal only when snap/orthogonal routing is on.
- [ ] Remove transient visual clutter during placement and movement: no diagonal insertion guide, no delta measurement box while dragging components.
- [ ] Make selection, hover, pins, junctions, and handles visually quieter and more predictable.
- [ ] Add resize handles for other resizable canvas objects if they become available, matching the note resize behavior.

## Component Insertion

- [ ] Ensure every component inserts with the same click-drag endpoint behavior.
- [ ] Keep one-pin components intuitive: drag from an existing net to place the component endpoint and create a short connected stub.
- [ ] Keep multi-pin components predictable: drag sets orientation and aligns the most important pins where possible.
- [ ] Improve inline insertion into existing wires so components cut the wire span cleanly and preserve probes.
- [ ] Add stronger visual feedback for insert previews without adding extra guide lines or measurement badges.

## Labels, Notes, and Annotation

- [ ] Make net labels easy to snap onto pins and wire segments even when grabbed by the label chip rather than the anchor point.
- [ ] Keep net labels visually distinct when attached, floating, or near-missing a net.
- [ ] Only show label boxes when a label value exists.
- [ ] Continue reducing label/value overlap around dense components.
- [ ] Make notes and labels editable directly in the canvas (double-click to edit in place), not only via the right panel.
- [ ] Render all label text (net labels, value labels, note bodies) through KaTeX so users can write `W_-`, `\Delta`, etc. — KaTeX is the fastest of the LaTeX-on-web options.
- [ ] Inspector action row: drop the destructive `Delete` button (already available via Delete/Backspace and right-click); add a `Mirror` button alongside `Rotate` / `Duplicate` to horizontally flip the selected component.
- [ ] Live flow shouldn't animate when the circuit can't simulate. With floating pins / unfinished nets the floating-pin banner appears but the dashed flow lines still keep moving — should freeze (and ideally dim) until the schematic is valid again.
- [ ] Preserve note colors and sizes through share URLs, import/export, and SVG export.
- [ ] Add optional colored section annotation presets for notes, matching engineering diagram usage.

## Toolbar and Menus

- [ ] Keep the component toolbar visually consistent: matched line widths, compact padding, and balanced icons.
- [ ] Keep essentials expanded, with grouped hover menus for sources, passives, op-amps, diodes, BJTs, MOSFETs, and subcircuits.
- [ ] Keep tool submenus opening on hover, with a glass/blurred panel and pointer aligned to the hovered button.
- [ ] Keep tooltip and submenu typography, shortcuts, spacing, and alignment unified.
- [ ] Avoid search/header chrome in the component picker until the component catalog is large enough to need it.
- [ ] Move project/file tools into the left panel and keep the top toolbar focused on simulation and canvas state.
- [ ] Keep netlist, settings, models, and measurements integrated into side panels rather than floating toolbar buttons.

## Simulation and Waveforms

- [ ] Always make it obvious why the scope/waveform pane is hidden, disabled, or empty.
- [ ] Preserve waveform visibility after Run and after circuit edits where possible.
- [ ] Improve overlapping trace readability: selected trace should lift above others, and identical traces should remain distinguishable.
- [ ] Add better cursor/marker UX and clearer disabled tab tooltips for unsupported plot modes.
- [ ] Support X/Y plots as a first-class plotting mode.
- [ ] Keep auto-run understandable: clear paused/running states and what edits trigger reruns.
- [ ] Continue validating browser/WASM ngspice results against native ngspice fixtures.

## Netlist Import and Layout

- [ ] Implement an explicit imported-netlist intermediate representation: parts, pins, nets, globals, subcircuits, and directives.
- [ ] Classify nets before layout: globals/rails, high-fanout nets, local two-pin nets, multi-pin junction nets, and subcircuit ports.
- [ ] Integrate ELK.js for first-pass automatic component placement with explicit ports.
- [ ] Convert multi-pin local nets to junction nodes before layout.
- [ ] Keep global nets and very high-fanout nets as labels/rails by default.
- [ ] Route local nets as wires instead of label stubs.
- [ ] Add obstacle-aware orthogonal routing so imported wires do not cross unrelated pins and create accidental shorts.
- [ ] Add device-aware placement heuristics: VDD up, VSS/GND down, inputs/control left, outputs right, PMOS above, NMOS below, shunt parts vertical.
- [ ] Add an `Auto arrange schematic` command.
- [ ] Add an `Auto arrange selection` command that preserves manually arranged parts outside the selection.
- [ ] Add a `Re-route wires` command for already placed components.
- [ ] Add golden layout fixtures for divider, RC filter, rectifier, op amp, MOS inverter, ReLU cell, subcircuits, rails, and transistor stacks.

## Subcircuits and Reusable Blocks

- [ ] Treat schematics as reusable subcircuits and populate the subcircuit insertion menu from schematic pages.
- [ ] Use schematic metadata, especially description, in the subcircuit menu.
- [ ] Preserve explicit subcircuit ports and pin ordering.
- [ ] Support recursive subcircuit references only when acyclic at netlist generation time; detect and report cycles clearly.
- [ ] Add double-click-to-open for subcircuit instances.
- [ ] Add symbol customization for subcircuits after basic insertion is reliable.

## Models and Shared Component Configuration

- [ ] Add a first-class Models panel for shared `.model` definitions and presets.
- [ ] Let model-backed components choose a preset/model from the inspector.
- [ ] Let custom component parameter changes be saved as a new preset.
- [ ] Let users set the default model/preset per component family.
- [ ] Ensure `.model` directives are parsed, displayed, editable, and netlisted without being marked unrecognized.
- [ ] Keep model presets distinct from per-instance geometry and value edits.

## Real Circuit Authoring QA

- [ ] Keep building nontrivial circuits by hand in the UI, running simulations, and inspecting waveforms.
- [ ] Maintain a list of real workflow frictions found while building circuits, not only code-level defects.
- [ ] Test increasingly complex circuits: filters, rectifiers, op-amps, MOS logic, transistor biasing, subcircuits, and analog learning cells.
- [ ] Verify every new circuit by hitting Run and inspecting the waveform/scope.
- [ ] Add regression fixtures for the ReLU learning cell variants, including pure device implementations without behavioral components.

## Export, Sharing, and Persistence

- [ ] Ensure SVG export removes editor chrome but keeps meaningful annotation styling.
- [ ] Keep share URLs complete and robust for schematics, subcircuits, models, notes, simulation settings, and layout metadata.
- [ ] Add import/reconstruct from SPICE netlists with approximate layout and optional layout annotations for round-tripping.
- [ ] Add clear warnings when imported or edited netlists cannot be fully represented as a schematic.

