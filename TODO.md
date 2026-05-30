# Spice Sim TODO

## Canvas Interaction Polish

- [ ] Rewrite the remaining canvas interaction layer around explicit modes and consistent rules: select, drag, insert, wire, pan, resize, edit text.
- [x] Keep natural macOS panning as the only scroll-pan direction; remove any code paths that can invert trackpad pan behavior.
- [x] Make grid snapping optional everywhere and ensure freeform mode never forces right-angle wires or grid-aligned movement.
- [x] Keep wires and probes attached when components move, rotate, or are duplicated.
- [x] Improve wire dragging so freeform wires can be diagonal/direct when snap is off and orthogonal only when snap/orthogonal routing is on.
- [x] Route placement-generated connection stubs around existing component bodies instead of drawing through symbols.
- [x] Add bounded grid-search fallback for orthogonal wire routing so routes can navigate around staggered components and existing wires.
- [x] Route selected wire body movement around existing component bodies when endpoints remain anchored.
- [x] Keep probes on selected wire bodies attached to the actual detoured route after anchored wire movement.
- [x] Let freeform routing stay diagonal/direct when clear while still detouring around components when the direct segment is blocked.
- [x] Remove transient visual clutter during placement and movement: no diagonal insertion guide, no delta measurement box while dragging components.
- [x] Make selection, hover, pins, junctions, and handles visually quieter and more predictable.
- [x] Add resize handles for other resizable canvas objects if they become available, matching the note resize behavior. Subcircuit blocks now resize directly on the canvas and persist their symbol width/height.

## Component Insertion

- [x] Ensure every component inserts with the same click-drag endpoint behavior.
- [x] Keep one-pin components intuitive: drag from an existing net to place the component endpoint and create a short connected stub.
- [x] Keep multi-pin components predictable: drag sets orientation and aligns the most important pins where possible.
- [x] Improve inline insertion into existing wires so components cut the wire span cleanly and preserve probes.
- [x] Add stronger visual feedback for insert previews without adding extra guide lines or measurement badges.

## Labels, Notes, and Annotation

- [x] Make net labels easy to snap onto pins and wire segments even when grabbed by the label chip rather than the anchor point.
- [x] Keep net labels visually distinct when attached, floating, or near-missing a net.
- [x] Only show label boxes when a label value exists.
- [x] Continue reducing label/value overlap around dense components: value labels now have secondary escape lanes when the primary near/far positions are blocked, rendered KaTeX value labels reserve enough visual width at low zoom so labels like `5V step`, `2kΩ`, and `1uF` do not get clipped, and net-label KaTeX text boxes are inset inside their chips so glyph metrics cannot leak outside the rounded label background.
- [x] Make notes, net labels, component value labels, component user labels, and probe display labels editable directly in the canvas (double-click to edit in place), not only via the right panel. Browser coverage now clicks the rendered KaTeX/text glyphs themselves, not just the invisible hit targets, selected components can create a new user label directly from the canvas when the typed key is not a valid value-edit starter, and committed in-place text edits now have browser coverage for both undo and redo through the document history.
- [x] Replace the first-pass custom math renderer with KaTeX for visible canvas labels, value labels, notes, probe text, subcircuit pins, and waveform text. Edit mode should keep showing the raw TeX source.
- [x] Inspector action row: add a `Mirror` button alongside `Rotate` / `Duplicate` to horizontally flip the selected component. (`Delete` already dropped — see Editor.tsx.) Real implementation needs a `mirrored?: boolean` field on `CircuitComponent`, a flip step in `pinWorldPos`, and `transform="scale(-1, 1)"` (with text re-flipping) in the symbol renderer. Defer until the model/symbol work in flight settles to avoid merge conflicts.
- [x] Live flow shouldn't animate when the circuit can't simulate. With floating pins / unfinished nets the floating-pin banner appears but the dashed flow lines still keep moving — should freeze (and ideally dim) until the schematic is valid again.
- [x] When ngspice errors out, the "Simulation failed" banner shows the wrapper message ("Invalid ngspice RAW output: missing Variables or Values section") instead of ngspice's actual stderr. Surface the real diagnostic at the top of the panel — the underlying error (singular matrix, undefined source for `.dc`, missing model, etc.) is what tells the user what to fix.
- [x] Net-label sanitizer collapses distinct user labels into the same SPICE name. `W+` and `W-` both become `W_`, so two unrelated voltage sources end up shorted on the same node, producing a singular matrix with no obvious error. Map `+`/`-` to distinct sequences (e.g. `_p` / `_n`) so different inputs map to different node names, and warn when any sanitizer collision happens.
- [x] Unify the look of the single-tool tooltip (e.g. `Wire` hover card) and the grouped-tool hover-submenu (e.g. `Sources` popover). They now share the same glass panel shell, arrow, padding, border, shadow, z-index, typography scale, and shortcut key styling; native browser `title` tooltips were removed from tool buttons so only the custom UI appears.
- [x] Preserve note colors and sizes through share URLs, import/export, and SVG export.
- [x] Add optional colored section annotation presets for notes, matching engineering diagram usage.

## Toolbar and Menus

- [x] Keep the component toolbar visually consistent: matched line widths, compact padding, and balanced icons.
- [x] Keep essentials expanded, with grouped hover menus for sources, passives, op-amps, diodes, BJTs, MOSFETs, and subcircuits.
- [x] Keep tool submenus opening on hover, with a glass/blurred panel and pointer aligned to the hovered button.
- [x] Keep tooltip and submenu typography, shortcuts, spacing, and alignment unified.
- [x] Avoid search/header chrome in the component picker until the component catalog is large enough to need it.
- [x] Move project/file tools into the left panel and keep the top toolbar focused on simulation and canvas state.
- [x] Keep netlist, settings, models, and measurements integrated into side panels rather than floating toolbar buttons.

## Simulation and Waveforms

- [x] Always make it obvious why the scope/waveform pane is hidden, disabled, or empty.
- [x] Preserve waveform visibility after Run and after circuit edits where possible.
- [x] Improve overlapping trace readability: selected trace should lift above others, and identical traces should remain distinguishable.
- [x] Keep unprobed waveform runs readable by defaulting to non-internal voltage traces and exposing branch/device currents through a one-click `Currents` filter.
- [x] Keep the scope legend focused on user intent: after a run, probes and user-added net labels are visible by default, auto-generated node names stay behind `Internal nodes`, and branch/device current vectors stay behind `Currents`. Browser e2e now covers this behavior.
- [x] Keep stepped-run waveform vectors visible: `tran2.v(out)` / `tran2.i(@r1[i])` are user-facing traces, while genuinely internal device/subcircuit vectors remain behind the Internal toggle.
- [x] Add better cursor/marker UX and clearer disabled tab tooltips for unsupported plot modes.
- [x] Support X/Y plots as a first-class plotting mode.
- [x] Keep auto-run understandable: clear paused/running states and what edits trigger reruns.
- [x] Add native-style ASCII RAW fixtures for WASM operating point, DC sweep, AC, and noise parsing so scale detection does not hide plottable vectors, reject native complex frequency scales, or drop integrated-noise totals appended after the spectral-density plot.
- [ ] Continue validating browser/WASM ngspice results against native ngspice fixtures. Current coverage includes OP, transient, DC, AC, noise with integrated totals, exact ngspice current vectors for Live Flow including native wrapped passive currents such as `i(@r1[i])` / `i(@c1[i])` / `i(@l1[i])`, source current vectors such as `i(@v1[i])`, `i(@i1[current])`, and `i(@b1[i])`, active-device terminal currents such as `i(@d1[id])` / `i(@m1[ig])` / `i(@m1[is])` / `i(@m1[ib])`, and BJT `i(@q1[ic])` / `i(@q1[ib])` / `i(@q1[ie])`, native subcircuit pin sense-source currents such as `i(@vlfx1p1[i])` / `i(@vlfx1p2[i])`, native-ngspice RC/RL/current-source/behavioral-source/subcircuit/diode/3-pin-NMOS/3-pin-PMOS/4-pin-NMOS/4-pin-PMOS/NPN/PNP smoke tests that check current signs plus component-body dash motion for Live Flow, strict numeric parsing, and explicit rejection of unsupported extra RAW plots so stepped/multi-plot runs are not silently truncated.

## Netlist Import and Layout

- [x] Implement an explicit imported-netlist intermediate representation: parts, pins, nets, globals, subcircuits, and directives.
- [x] Classify nets before layout: globals/rails, high-fanout nets, local two-pin nets, multi-pin junction nets, and subcircuit ports.
- [x] Integrate ELK.js for first-pass automatic component placement with explicit ports.
- [x] Convert multi-pin local nets to junction nodes before layout.
- [x] Keep global nets and very high-fanout nets as labels/rails by default.
- [x] Route local nets as wires instead of label stubs.
- [x] Add obstacle-aware orthogonal routing so imported wires do not cross unrelated pins and create accidental shorts.
- [x] Add initial device-aware placement heuristics: grounded sources left of their driven net, VDD/VSS-style rails as labels, PMOS above NMOS in CMOS pairs, series NMOS devices as vertical stacks, and shunt passives vertical toward rails.
- [x] Broaden device-aware placement heuristics for op-amp signal flow, rectifiers, multi-transistor stacks, and explicit output/load regions.
- [x] Add an `Auto arrange schematic` command.
- [x] Add an `Auto arrange selection` command that preserves manually arranged parts outside the selection.
- [x] Add a `Re-route wires` command for already placed components.
- [x] Make wire auto-format remove cosmetic elbow points while preserving real junctions, branch taps, pins, and probes.
- [x] Make batch wire auto-format rip up selected wires before rerouting, so stale messy paths do not force unnecessary detours.
- [x] Let `Format wires` target selected probes/scopes attached to wire bodies, not only selected wires or selected components.
- [x] Make component-pin connectivity explicit: wires connect to pins at endpoints or explicit junction vertices, while plain wire pass-throughs across pins stay visually detectable but electrically unconnected. Auto-arrange and wire formatting preserve explicit junctions without promoting accidental pass-throughs into shorts.
- [x] Make `Auto arrange` retarget moved pins that were connected through explicit wire junctions, then batch-format touched wires so arranged schematics keep real connections and avoid stale reroute crossings.
- [x] Add golden layout fixtures for divider, RC filter, rectifier, op amp, MOS inverter, ReLU cell, subcircuits, rails, and transistor stacks. Current coverage includes import IR, divider, RC/shunt loads, rectifier, op-amp output loads, CMOS inverter, ReLU-like MOS/R/C cell, subcircuits, rails, NMOS/PMOS transistor stacks, and auto-arrange selection.

## Subcircuits and Reusable Blocks

- [x] Treat schematics as reusable subcircuits and populate the subcircuit insertion menu from schematic pages.
- [x] Use schematic metadata, especially description, in the subcircuit menu.
- [x] Keep placed subcircuit instances in sync when a schematic page is renamed.
- [x] Preserve explicit subcircuit ports and pin ordering.
- [x] Support recursive subcircuit references only when acyclic at netlist generation time; detect and report cycles clearly.
- [x] Add double-click-to-open for subcircuit instances.
- [x] Add first-pass symbol customization for subcircuits: selected SUBX instances can set body width/height, with pins and bounds following the customized symbol dimensions.
- [x] Preserve subcircuit pin-side grouping: placed blocks now support left/right/top/bottom pins, derive sides from schematic port geometry, infer common rail/output sides on netlist import, round-trip side metadata through generated layout annotations, and expose per-pin side controls in the inspector.

## Models and Shared Component Configuration

- [x] Add a first-class Models panel for shared `.model` definitions and presets.
- [x] Let model-backed components choose a preset/model from the inspector.
- [x] Let custom component parameter changes be saved as a new preset.
- [x] Let users set the default model/preset per component family.
- [x] Ensure `.model` directives are parsed, displayed, editable, and netlisted without being marked unrecognized.
- [x] Keep model presets distinct from per-instance geometry and value edits.
- [x] Surface missing or incompatible model names as actionable netlist warnings that can jump to the offending component.

## Real Circuit Authoring QA

- [ ] Keep building nontrivial circuits by hand in the UI, running simulations, and inspecting waveforms.
- [x] Maintain a list of real workflow frictions found while building circuits, not only code-level defects. See "Workflow Friction Log" below.
- [ ] Test increasingly complex circuits: filters, rectifiers, op-amps, MOS logic, transistor biasing, subcircuits, and analog learning cells.
- [ ] Verify every new circuit by hitting Run and inspecting the waveform/scope.
- [x] Add browser smoke coverage for non-demo real circuits. Current coverage includes a hand-authored half-wave rectifier with RC load, full-wave bridge rectifier with filter capacitor, RLC filter, CMOS inverter, reusable RC subcircuit, inverting op-amp amplifier, buffered two-pole RC ladder with op-amp output buffer, BJT bias stage, NMOS differential pair, NMOS common-source amplifier, and pure-device ReLU learning-cell subcircuit; each presses Run and asserts the scope stays focused on intentional traces instead of generated nodes or current vectors.
- [x] Add regression fixtures for the ReLU learning cell variants. Current coverage includes a pure MOS/R/C subcircuit export fixture and a root-schematic `SUBX` harness fixture that verifies all 12 public pins preserve their intended order, with no behavioral `B` sources or `max`/`tanh` expressions entering the generated netlist. The pure-device fixture also verifies the improved PMOS pull-up branch, NMOS pull-down branch, and NMOS source-follower activation topology.

## Workflow Friction Log

These are product-level frictions found while drawing, importing, simulating, and inspecting real circuits in the app. Keep this list current as QA uncovers new user-facing gaps.

- Dense imported MOS/R/C schematics can still look electrically correct but visually hard to parse when many labels stand in for long nets. Auto-layout now handles ReLU-like stacks better, but additional visual grouping and optional rail buses would help large analog blocks.
- Live Flow must only animate ngspice-owned current data. The previous resistor/capacitor voltage-derived fallback was removed; passive RAW vectors such as `i(@r1[i])` / `i(@c1[i])` / `i(@l1[i])`, source vectors such as `i(@v1[i])` / `i(@i1[current])` / `i(@b1[i])`, and active-device terminal vectors such as `i(@m1[id])` / `i(@m1[ig])` / `i(@m1[is])` / `i(@m1[ib])` / `i(@q1[ib])` are now matched per pin before any whole-component branch lookup. Readouts use an explicit `ngspice` token, including below-threshold sampled-wire chips and empty-coverage status messages, and sample normalization drops malformed or legacy non-ngspice provenance at runtime before it can scale or render. Browser e2e now covers RC, RL, diode, current source, behavioral source, subcircuit pins, op-amp pin-sense currents, 3-pin NMOS, 3-pin PMOS, 4-pin PMOS, NPN, and PNP with all visible overlays required to be `ngspice` sourced and active-device body overlays required to animate. Source body Live Flow now uses short internal streams clipped to the source body instead of circular perimeter paths, voltage sources force both visible streams downward so they read like power delivery rather than a spinning ring, source-body overlays disable glow filters so the streams cannot visually bleed outside the circle, and ground symbols animate downward only from attached ngspice-sampled wire currents. The OS/browser reduced-motion preference now slows Live Flow instead of disabling it, since otherwise valid ngspice-backed current streams look broken. The wire dash motion now uses CSS animation on the overlay polyline itself rather than SMIL child animations, which makes the motion inspectable and reliable in the in-app Chromium browser. Wire and component-body overlays now share the same validity gate, so invalid/floating/stale states cannot leave component animations visible after wire animations are suppressed.
- Active-device Live Flow is terminal-strict: MOSFET/BJT wires only animate from their matching ngspice terminal vector, so a missing source/body/base current cannot borrow another terminal's branch current and imply impossible flow.
- Live Flow no-flow states should avoid fake precision. Numerical noise near zero now appears as `No flow now`, below-threshold sampled wire hovers show the actual current plus `ngspice · low`, and sub-femtoamp wire hovers use `<1.00 fA`.
- Subcircuit blocks now preserve reusable symbol intent better: new placements derive pin sides from source schematic port geometry, imported subcircuit instances infer common output/rail sides, layout annotations round-trip `pinSides` with width/height, and the inspector exposes per-pin left/right/top/bottom side controls with an Auto rederive action. Remaining polish is richer symbol shape editing beyond rectangular blocks.
- Scope and waveform views need to stay coupled to the user's circuit-building loop: every new drawn circuit should be run, checked in the scope, and recorded with any missing trace, aliasing, cursor, or Live Flow issue.
- Real-circuit browser smoke tests now cover half-wave and full-wave bridge rectifiers, RLC filter, CMOS inverter, subcircuit, op-amp, buffered active RC ladder, BJT, NMOS differential pair, NMOS common-source amplifier, and ReLU learning-cell documents rather than the examples menu. The inverter fixture caught an accidental input/output short caused by a routing path through a MOS drain/output pin, the differential-pair fixture keeps explicit junction points at pass-through pins so the test mirrors how users should draw connected rails, and the bridge-rectifier fixture caught an accidental rail crossing through diode cathode pins before it became a passing QA circuit. The common-source fixture adds a single-transistor biased gain stage with labeled gate, drain, and source nodes. The buffered RC ladder adds a multi-node passive filter feeding an op-amp buffer and load, while preserving labeled-only scope defaults. The corrected fixtures now validate intended labeled traces while keeping generated nodes and current vectors hidden by default, and any visible Live Flow overlays must be sourced from ngspice current vectors; sampled instants with no above-threshold current are allowed to stay visually quiet instead of faking flow. These fixtures also caught a false floating-pin diagnostic on connected `SUBX` pins, which is now exempted from the single-root-terminal heuristic because the matching electrical terminals may live inside the referenced schematic page.
- Hidden shorts from wires passing under component pins are now blocked at netlist time: component pins only join wires at explicit junction points, labels/probes can still attach to wire bodies, and pass-through pins produce actionable warnings instead of silently changing circuit topology.

## Export, Sharing, and Persistence

- [x] Ensure SVG export removes editor chrome but keeps meaningful annotation styling.
- [x] Keep share URLs complete and robust for schematics, subcircuits, models, notes, simulation settings, and layout metadata.
- [x] Add import/reconstruct from SPICE netlists with approximate layout and layout annotations for round-tripping.
- [x] Add clear warnings when imported or edited netlists cannot be fully represented as a schematic.
