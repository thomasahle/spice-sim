# Wires (Edges) — Design & Behavior Reference

Status: **descriptive, not a proposal.** This maps how wires/"edges" actually
behave today across every interaction — hover, click, drag, draw, delete, and as
a side effect of component operations — so the semantics can be reasoned about
(and, where inconsistent, redesigned). It is the wire counterpart to
[`component-placement-design.md`](component-placement-design.md) and
[`component-transform-design.md`](component-transform-design.md).

> **Decisions so far (living):**
> - ✅ **Node tool** — dedicated tool, shortcut **N**; **Pan tool removed** (pan stays on spacebar-hold / middle-drag / wheel). v1 ops: delete-node-with-heal + delete-segment/split. (§13)
> - ✅ **Rubber-banding** — keep it (move a part → its wires follow & reshape), but add an **escape hatch** to suppress it, and stop a following wire from silently **fusing** into whatever it crosses. (§14.5, §15 #4)
> - ✅ **(a) node-identity model = explicit node-graph (model C)** — re-confirmed after the §16.6 validation on **editor-ergonomics** grounds (exact rubber-band, stable node identity, never-surprising connectivity). EDA segment-format interop is a **non-goal**; the only external format kept is **SPICE netlist import/export** (which C makes *trivial* — the graph ≈ the netlist). Built as a **direct rewrite** (no phased rollout). (§16, §16.7)
> - ✅ **(b) connection rule** — connection is an explicit stored fact; geometry never auto-connects; auto-create a junction node on endpoint-drop; **Move** detaches / **Drag** rubber-bands. (§16)
> - ⬜ **Open: doc completeness** — 10 modules not yet documented (clipboard, net-labels, netlist-import, selection-topology, persistence, SVG export, live-flow, touch, subcircuit). (§ audit)

Every claim is anchored to `file:line` in the working tree. Coordinates are in
**grid-cell units** (1 cell = `CELL = 20px` at zoom 1; the renderer scales).
A "§" cross-reference points within this doc.

---

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **Wire** | `{ id, points: [number,number][] }` — an ordered polyline. No net name/color/style is stored; all of that is derived. (`model.ts:41`) |
| **Vertex** | Any entry in `points`. Endpoints are first/last; the rest are interior/bend vertices. |
| **Endpoint** | First or last vertex. The only vertices that "follow" a moving pin (§9) and that trigger junction insertion (§10). |
| **Junction (dot)** | *Visual* solder dot drawn where ≥3 wire-segment ends meet. Cosmetic only. (`wireGeometry.ts:98`) |
| **Node** | *Electrical* concept — a connected set of coincident coordinates, computed by a union-find for the netlist. (`netlist.ts:541`) |
| **Connection** | Two things are connected iff they share a coordinate (within tolerance). There is **no** explicit link object — connectivity is pure geometry, resolved at netlist-build time. |
| **Anchor** | During a move, an endpoint that touches *stationary* geometry (an unselected pin or unselected wire). Anchored ends stay put and the wire reroutes to them (§8a). |
| **Draft** | An in-progress, uncommitted wire run (`wireDraft`). |
| **Stub / contact wire** | A short wire synthesized automatically to keep a pin connected (during placement §9a, or when a contacting pin is moved §9b). |

The single most important rule, stated once: **a pin connects to a wire only at
an explicit wire vertex; a wire connects to another wire anywhere along a
segment.** (§2.3). Much of the machinery below exists to insert real vertices so
that rule produces the intended connectivity.

---

## 1. Data model

- `interface Wire { id: string; points: [number, number][] }` — `model.ts:41`. Lives on `SchematicPage.wires` (`model.ts:81`). IDs via `makeId("w")` (`model.ts:619`).
- Polylines may have **>2 points** (multi-bend). Orthogonality is a *routing convention*, not a model invariant.
- Wire points are **tuples** `[x,y]`; components/probes use `{x,y}` objects — hence the parallel `samePoint`/`sameTuple`, `normalizePoint`/`normalizeTuple` helper families (`geometry.ts:86–105`).

### 1.1 Coordinates, snapping, tolerances

- World→screen: one `<g transform="translate(pan) scale(CELL*zoom)">` wraps the schematic; children use raw cell coords (`Editor.tsx:4409`). Strokes/radii are sub-cell fractions.
- Cursor snapping: `snapWorldPoint` rounds to integer cells when **snap-to-grid** is on, else just normalizes (`canvasViewport.ts:40`). `snapToGrid` defaults `true`, persisted at `spicesim.snapToGrid`, toggled **Shift+S**.
- **Tolerance drift (flag):** rounding quantum is `1e-3` (`normalizeCoord`, `coordKey`), equality is `1e-6` (`samePoint`/`pointOnSegment`), topology collinearity is `1e-9` (`wireTopology.ts`). Three different constants; see §12.

### 1.2 Junction dots (visual) — `buildWireJunctionDots` (`wireGeometry.ts:98`)

Degree counting: each segment contributes +1 to each of its two endpoints; an endpoint landing mid-other-segment contributes +2. **A dot is drawn where degree ≥ 3.** Consequences: a corner (degree 2) and a straight pass-through vertex (degree 2) get **no dot**; a T-tap or 4-way cross gets a dot. Dots are **never stored** — recomputed each render, so they appear/vanish as geometry changes.

### 1.3 Netlist nodes (electrical) — `buildPageNetlist` (`netlist.ts:541`)

A disjoint-set union keyed by `coordKey(x,y)`:
1. Each wire unions its consecutive vertices (`netlist.ts:559`).
2. A wire vertex lying on *another* wire's segment unions with that segment (`unionWirePointsOnWireSegments`, `netlist.ts:1048`).
3. A component pin unions to a wire **only if the wire has an actual vertex at the pin** (`wireHasPoint`) — otherwise it's a "pin passes through wire" *warning*, **not** a connection (`netlist.ts:571`, `960`).
4. Probes/labels on a segment union onto it; GND pins union to node `"0"`.

`posToNode` ("x,y" → node name) is the bridge the renderer uses to label wires/probes with their resolved net.

---

## 2. The connection model (why the machinery exists)

### 2.1 Pins need a vertex; wires don't
Wire↔wire taps connect on any `pointOnSegment` hit (tolerant), but pin↔wire connects only at a coincident **vertex** (§1.3 step 3). So whenever a wire should attach to a pin, a real vertex must exist at the pin's coordinate. This drives:
- `addWireWithJunctions` splitting existing wires at a new wire's endpoints (§10),
- `splitWiresAtPoint` at dropped-component pins (§9a),
- the contact/stub wires (§9a, §9b).

### 2.2 Two hit-detection systems coexist
- **DOM**: the invisible fat `.wire-hit-target` polyline carries `data-wire-id` and gives `cursor:pointer` over a **0.72-wide** band (`Editor.tsx:1082`).
- **Geometric**: selection/hover actually re-derive the hit via `selectableItemAt` at a **0.3 radius** (0.6-wide band) (`canvasHitTest.ts:206`). The DOM id is only a priority-60 tie-break hint.
- **Flag:** the visible affordance (0.72) is wider than the real pickable width (0.6); the outer ring reads clickable but isn't (§12).

### 2.3 Junction (dot) vs node (electrical)
They usually coincide but are computed independently: dots from pure wire geometry (degree ≥3), nodes from the union-find that also includes pins/probes/labels/GND. A 4-way *visual* cross that shares no vertex produces **neither** a dot **nor** a connection (consistent).

---

## 3. Rendering & visual states

Each wire = `<g class="wire-group {selected}{hovered}">` (`Editor.tsx:1052–1155`) containing, stacked:
1. **Hit target** — invisible (`opacity 0.001`), `strokeWidth 0.72`, `pointerEvents:all`, `data-wire-id`.
2. **Visible stroke** — `--ink` normally, `--accent` when selected/hovered; width `clamp(2.6/(CELL·zoom), .055..12)`, ×1.45 selected, ×1.25 hovered (`Editor.tsx:5897`).
3. **Live-flow overlay** (sim running) — pale casing + animated dashed accent polyline (Falstad-style current) + optional current readout.

Vertex **handles** render in a *separate* `<g class="wire-handle-group">` (`Editor.tsx:8146`), only when `tool==="select" && (selected || hovered || dragging)`: endpoints r=0.18, interior r=0.13, `cursor:grab`.

Junction **dots**: `<circle class="wire-junction-dot" r=0.18>` per `buildWireJunctionDots` point (`Editor.tsx:7639`).

| State | Visible stroke | Vertex handles | Junction dot |
|---|---|---|---|
| Normal | `--ink`, base width | hidden | shown where degree ≥3 |
| Hover | `--accent`, ×1.25 | revealed (opacity→1) | unchanged |
| Selected | `--accent`, ×1.45 | revealed, accent-stroked | unchanged |
| Live (sim) | base + animated dashed overlay + readout | per select/hover | unchanged |

**Flag:** CSS selectors `.wire-group .wire-vertex` (`styles.css:3601, 3625`) appear **dead** — handles live in `.wire-handle-group`, not inside `.wire-group`. The active rules are the `.wire-handle-group` ones.

---

## 4. Hit-testing & snapping substrate

### 4.1 Geometric selection priorities — `selectableHitAt` (`canvasHitTest.ts:235`)
probe 100/80 > component-core 90 > **wire body 75** > DOM-wire hint 60 > **wire (incl. endpoints) 50**. Ties broken by distance then z. So a wire wins hover/click only when no probe/component-core is under the cursor; the wire *body* outranks its endpoints (endpoints are left to vertex-drag).

### 4.2 Connection snapping (while wiring) — radii
- `WIRING_SNAP` (`Editor.tsx:368`): pin **1.35**, wire vertex **0.95**, segment body **0.7**, segments included. Used at search radius 1.0. Nearest wins, but the per-kind radii bias toward pins.
- Snapping onto a segment prefers a **grid-aligned** point that still lies on the wire (`segmentSnapPoint`, `canvasHitTest.ts:94`).
- `QUICK_WIRE_START_SNAP` (`Editor.tsx:374`): pin/vertex **0.36** only, no segments — quick-wire starts only very near a terminal.

### 4.3 Snap-to-grid is coupled to routing style (flag)
`routeWireSegmentAvoiding(..., orthogonal = snapToGrid, ...)` everywhere. So **snap ON ⇒ orthogonal (Manhattan) wires; snap OFF ⇒ freeform diagonal wires.** One setting silently controls two behaviors (§12).

---

## 5. Routing engine (`placement.ts`)

- **Base elbow** `routeWireSegment(from,to,orthogonal)` (`placement.ts:441`): orthogonal default corner is **`[to.x, from.y]`** (horizontal-first L); diagonal is a straight segment.
- **Obstacle-aware** `routeWireSegmentAvoiding` (`placement.ts:478`): enumerate candidates, score, pick lowest.
  - `orthogonalRouteCandidates` (`:1036`): both elbows, mid-point Z-jogs (bend at the grid-rounded midpoint), and detour "lanes" just outside obstacle/wire bounding boxes (spacing 1, rounded to stay on-grid).
  - `gridRouteCandidate` (`:1175`): Dijkstra over a sparse lattice (interesting x's/y's), cost = Manhattan length + **2.5 per bend** + wire-conflict penalty; obstacle-crossing segments disallowed; bails if lattice > 1200 cells.
  - `scoreWireRoute` (`:1156`): length + **3 per bend** + **10000 per obstacle-body crossing** + wire-conflict (**+800 per cross**, **+80 per collinear overlap**, exempt at the route's own terminals).
- **Freeform** path uses Euclidean length + per-vertex penalty (`:503–584`).
- Obstacle rects = component visual bounds padded `0.3`; an endpoint inside a body drops that obstacle, an endpoint on the body edge (a pin) shrinks it by `0.001` so the pin escapes (`:1331`).

---

## 6. Creating wires

Two creation gestures share one draft/commit pipeline. Both end at
`commitWireRoute → addWireWithJunctions` (§10).

### 6.1 Wire tool (`tool === "wire"`, shortcut **w**)

Fundamentally **click-click multi-segment**, with **click-drag** also supported for a single segment. State: `wireDraft` (committed-so-far points) + `wireGesture` (drag-vs-click detection).

**Pointer DOWN** (`Editor.tsx:3449`) — behavior by target, and by whether a draft is already in progress:

| DOWN target | No draft (first point) | Draft in progress |
|---|---|---|
| **Empty canvas** (no snap) | start draft at grid point | append a routed segment; **draft continues** (a free corner) |
| **Pin** | start draft anchored at pin | append segment, then **commit + end run** |
| **Wire vertex/endpoint** | start draft there | append, **commit + end run** |
| **Wire segment body** | start draft on the wire | append, **commit + end run** (creates a junction, §10) |
| **Component body (not a pin)** | treated as empty canvas (bodies don't snap) | treated as empty canvas |

So clicking empty space **extends** the run; clicking a connection (pin/wire) **terminates** it. (`snap && route.length>=2` is the commit trigger.)

**Pointer MOVE** (`Editor.tsx:3662`): continuously recompute `snapTarget`; flip the gesture to `moved` once travel exceeds **0.35** cells (wire-tool) / **4** cells (quick-wire). The live route to `snapTarget ?? cursor` is rendered as a dashed ghost (§6.3).

**Pointer UP** (`Editor.tsx:4017`):
- **moved (drag style)** → route last-point→release-target, **commit** the run.
- **not moved + wire-tool (a click)** → nothing committed; **draft persists** (this is what enables click-click chaining).
- **not moved + quick-wire** → abandon draft, restore the click's selection.

**Run termination** (4 ways): click on a pin/wire; **double-click** (`commitWireRoute(activeDraft)` as-is, needs ≥2 points — `Editor.tsx:4378`); drag-release; **Escape** (cancel, no commit). **Backspace** removes the last draft point (per-segment undo).

**Gaps (flag):** a run that ends in mid-air can only be committed by double-click or a moved drag — a single click on empty canvas never finishes it; there is **no right-click-to-cancel** (only Esc/Backspace).

### 6.2 Quick-wire (drag from a pin, in the **select** tool)

`selectPointerIntent` returns `"quick-wire"` when pointer-down hits a component pin's connection handle (`data-connection-handle`), non-additive, non-probe (`canvasInteraction.ts:122`). Seeds a draft at the pin (strict 0.36 snap), threshold **4** cells; on release-with-movement it commits like the wire tool, on a non-move it just selects the component. Wire **vertices do not** start a quick-wire (they reshape, §8b).

### 6.3 Preview & feedback
- **Snap indicator**: accent ring+dot at `snapTarget` whenever a connection tool/gesture is active (`Editor.tsx:7674`). There is **no** red/invalid state for wire drawing (only component *placement* has a blocked ghost).
- **Ghost segment**: dashed accent polyline from the last draft point to `snapTarget ?? cursor`, routed with the *same* avoider — WYSIWYG with the commit (`Editor.tsx:7649`).
- **Pin targets**: component pins show target rings while a connection tool/gesture is live.

### 6.4 Connection on commit — see §10.

---

## 7. Selecting wires (select tool)

Selection is one shared `Set<string>` across components/wires/probes; hover is a single `hoverId`.

| Interaction | Result |
|---|---|
| **Hover** a wire body | computed geometrically each move (`hitWireBodyAt`, radius 0.3); sets `hoverId` → accent highlight + reveals vertex handles. Cursor is `pointer` (no dedicated "move" cursor). |
| **Click** (no modifier) | select **only** this wire (`new Set([id])`); arms a drag (a non-moving click is a no-op). |
| **Shift-click** | toggle this wire in/out of the selection; **never** starts a drag. |
| **Cmd/Ctrl-click** | **not implemented** — only `shiftKey` is consulted for additive selection. |
| **Click empty canvas** | clears selection (unless Shift), starts a marquee. |
| **Marquee** (drag from empty) | selects any wire with a vertex inside **or** a segment crossing the box — **crossing mode**, always (no window/enclose mode, no left-vs-right distinction). Shift unions. |

**Side effect (flag):** selecting a wire calls `addWireTraceToScope(id)` — if a sim result exists, the wire's node's trace is auto-added to the plotted waveforms. Plain selection mutates scope state (`Editor.tsx:3539`).

---

## 8. Editing existing wires

### 8a. Drag a wire **body** (translate / reshape)
Same `drag` machinery as components (`applySelectionDragPreview`). The result depends on per-endpoint **anchors** (does the end touch stationary geometry?) — `moveWirePointsWithAnchorsAvoiding` (`placement.ts:838`):

| Endpoints | Behavior on body-drag |
|---|---|
| neither anchored | rigid translate of the whole wire |
| one anchored | anchored end stays; rest moves; the joining segment **reroutes** (obstacle-avoiding) |
| both anchored | both ends stay; interior shifts; **both** ends reroute (the wire bows) |

Threshold to start = **0.08** cells (a click never nudges). Unselected wires whose endpoint coincides (<0.08) with a *selected component pin* follow via `attachedWirePoints`. Junctions pruned afterward (§10).

### 8b. Drag a wire **endpoint / vertex** (reshape + reconnect)
Vertex handles (§3) → intent `wire-vertex-drag` (non-additive only). `hitWireVertex` radius 0.45. During drag:
- The vertex snaps to nearby pins/vertices/segments (radius 1.0, excluding its own wire); `shouldSuppressOriginalConnectionSnap` lets you pull ≥0.55 off its current connection to detach.
- **Endpoint** drag → reroutes orthogonally to its neighbor, avoiding obstacles (`reshapeDraggedWirePointAvoiding`, `placement.ts:627`). **Interior vertex** → free move (non-avoiding).
- Probes sitting on the dragged vertex translate with it.
- On release: `splitWiresAtPoint(finalPoint)` creates a junction if the end landed on another wire; the wire stays selected.

### 8c. Delete (Delete/Backspace, or context-menu Delete)
`deleteSelected` (`Editor.tsx:4715`): selected wires are filtered out; probes that lose all connection are cascade-removed; selection cleared.
**Flag:** deletion does **not** run `pruneUnanchoredWireJunctions` (unlike every move/transform path). Deleting one wire of a crossing leaves a now-redundant collinear vertex on the survivor until it's next manipulated (the dot disappears, the vertex lingers). No collinear merge on delete.

### 8d. Context menu (right-click)
Right-click selects the hit wire if not already selected, then shows the generic selection menu. For a **wire-only** selection: **Fit Selection, Auto format wiring, Copy, Duplicate, Paste, Delete**. Rotate/Flip/Auto-arrange are component-gated and absent/disabled. There are **no wire-specific items** (no split / add-vertex / straighten).

### 8e. Keyboard nudge
Arrow keys → `nudgeSelection(dx,dy)`: step 1 cell (snap on) / 0.1 (off), ×10 with Shift. Routes wires through the *same* anchor-aware pipeline as a drag (§8a), one undo step per nudge.

---

## 9. Wires reacting to component operations

### 9a. Placing a component **on** a wire (splice / inline-cut)
- **Gate** `placementInlineCutSpan` (`placement.ts:203`): only 2-pin parts; both pins must be non-coincident; both pins **and** both gesture endpoints must be **collinear** (`pointsShareLine`). Geometry-gated, so a *click* drop on a collinear wire still splices.
- **Orientation** `placementDropOnWire` (`placement.ts:233`): rotates the part to lie **along** the wire (straddling the drop by half its pin-span).
- **Refusal** `placementOverlapsComponent` (`placement.ts:270`): refuses if the body overlaps another **component** (inset 0.6); **wires are ignored**, so splicing stays allowed. LABEL/NOTE don't block.
- **Commit** (`Editor.tsx:4056`): `cutWireSegmentBetweenPoints` removes the between-pins span (identity-compared to confirm a wire actually contained it → `insertedInline`); then synthesize **outward stubs** (`placementConnectionWires`) — a stub only for an endpoint *beyond* its pin, so a click (pins straddling center) makes no self-short; finally `splitWiresAtPoint` at each pin so a pin landing mid-wire joins by contact.
- **Preview** (`Editor.tsx:7700`) mirrors the commit exactly: a `placement-draft-cut` mask paints the gap over the still-intact wire, dashed stubs, footprint rect, and per-pin dots — **solid** `placement-draft-endpoint-connected` where a real connection will form, **hollow** otherwise. Blocked overlap → `-blocked` danger styling, no dots.

### 9b. Moving/translating a component with attached wires
One path for single & multi (`applySelectionDragPreview`). Selected wires stretch/reroute per anchors (§8a). Unselected wires whose endpoint sits on a moved pin follow (`attachedWirePoints`). A selected pin that *was* touching stationary geometry spawns a **contact/bridge wire** from its old to new position (`buildTranslatedPinContactWires`). Junctions pruned; probes on changed paths re-placed by arc-length (§9d).

### 9c. Rotating / flipping with attached wires — **single vs group differ**
Dispatch via `selectionIsGroup` (`Editor.tsx:4496`): single-element = exactly one component, no wires/probes selected; everything else is group.

| Aspect | **Single** (`transformSelected`) | **Group** (`transformGroupWires`) |
|---|---|---|
| Wire, one endpoint on a moved pin | endpoint follows (reroute) | endpoint follows (reroute) |
| Wire, **both** endpoints on moved pins | **DELETED** as degenerate (`wireConnectsMovedPins`→`[]`) | **PRESERVED**, rides rigidly ("internal" wire) |
| Selected wires | (single path forbids wires in selection) | ride rigidly (all points orbit the pivot) |
| Flip on a 2-pin part | `swapTwoPinTerminals` = rotation+180; pins stay put → **wires don't move** | full geometric reflection (`transformComponentInGroup`) |
| Contact bridging | yes (`buildRotatedPinContactWires`) | yes (same fn) |

The both-ends divergence is intentional (a group's internal wire must survive) but is a genuine behavioral split — see §12. The permutation guard in `collectTransformedPinMoves` (`dragMath.ts:152`) suppresses spurious moves when a transform only *relabels* pins among the same positions (the backbone of the "flip a 2-pin part doesn't drag its wire" behavior).

### 9d. Probes on wires
"Connected" = probe coincides with a pin/vertex or lies on a segment (`probeHasConnection`). Probes follow wires through: pin moves (`moveProbesWithPinMoves`), path reroutes (re-placed at the **same arc-length fraction**, `moveUnmovedProbesWithChangedWirePaths` / `movePointBetweenWirePaths`), wire deletion (snap to nearest surviving wire within **2.0** cells, else left behind → reads disconnected), and inline-splice (snap to the nearer inserted pin).

### 9e. Format wires / Auto arrange
- **Auto format wiring** (`autoFormatWiring`): scope = selected wires (+ wires through selected pins/probes), or **all** wires if nothing selected. Re-routes each wire between its **electrical stops** (endpoints, pins, probes, cross-wire vertices it must keep) with the avoider. **Connectivity is preserved**; only geometry changes; junctions pruned.
- **Auto arrange** (`autoArrangePage`, ELK): relocates components, **retargets** attached wire stops to the pins' new positions, then runs the same formatter. Connectivity preserved through stop-remapping.

---

## 10. Junction lifecycle

- **Add** `addWireWithJunctions` (`wireGeometry.ts:22`): normalize+compact; drop exact-duplicate paths; **split existing wires at the new wire's two endpoints** (`insertWireEndpointJunctions` — inserts a vertex where an endpoint lands mid-segment, forming a T); drop the new wire if its path is already fully covered. Only the **new wire's endpoints** split others — a new wire whose *middle* crosses an existing one makes no junction (the router avoids this via the +800 penalty).
- **Split at a point** `splitWiresAtPoint` (`wireGeometry.ts:43`) = single-point junction insertion; used at probe placement, vertex-drag finish, and dropped-component pins.
- **Prune** `pruneUnanchoredWireJunctions` (`topologyCleanup.ts:70`): keep endpoints, real corners, vertices on a pin/probe, and cross-wire junctions; drop redundant collinear unanchored midpoints. Runs after move/nudge/transform/format — **not after delete** (§8c) or placement.
- **Cut** `cutWireSegmentBetweenPoints` (`wireTopology.ts:59`): remove a straight subpath between two points (used by inline-splice); returns the input array unchanged (identity) when no single wire contains both — the gate for "did a splice actually happen."

---

## 11. End-to-end connectivity summary

1. Connectivity is geometry: coincident coordinates = same node. No link objects.
2. Pins attach to wires only at explicit **vertices**; wires attach to wires along any **segment**. The junction machinery (§10) exists to manufacture the vertices that make rule 1 produce the intended graph.
3. Visual junction **dots** (degree ≥3) and electrical **nodes** (union-find incl. pins/probes/GND) are computed separately but agree by construction in normal cases.
4. Every wire-touching mutation funnels new wires through `addWireWithJunctions` and (except delete/placement) cleans up via `pruneUnanchoredWireJunctions`.

---

## 12. Known inconsistencies & open questions (the semantics to settle)

These are the points where current behavior is surprising, asymmetric, or
under-specified — candidates for a redesign pass.

1. **Click width mismatch** — visible hit-target/`cursor:pointer` is 0.72 wide; real pick radius is 0.3 (0.6 wide). The outer ring looks clickable but isn't. (`Editor.tsx:1082` vs `canvasHitTest.ts:206`)
2. **No "move" cursor on wire bodies** — hovered wires show `pointer`, not `grab`/`move`, despite being drag-to-translate (components show `grab`). Affordance mismatch.
3. **Additive selection is Shift-only** — Cmd/Ctrl-click does nothing additive.
4. **Marquee is always crossing-mode** — partial touch selects; no window/enclose mode and no left-vs-right drag semantics.
5. **Delete skips junction pruning** — deleting one wire of a crossing leaves a redundant collinear vertex on the survivor; no collinear merge on delete. (§8c)
6. **Placement skips junction pruning** — relies on cut/split producing clean topology; a stray collinear midpoint would persist until the next prune-bearing edit.
7. **Selecting a wire mutates plotted traces** (`addWireTraceToScope`) — non-obvious coupling between selection and the scope.
8. **snap-to-grid ⇒ orthogonal coupling** — turning snap off silently switches to diagonal wires; there's no independent "diagonal wires" toggle. (§4.3)
9. **Mid-wire crossing ≠ junction** — only endpoints split wires; a committed route crossing a wire mid-span is a visual cross with no node merge (router avoids it, but it's reachable).
10. **Both-ends-on-moved-pins divergence** — single-element rotate *deletes* such a wire; group transform *preserves* it. Rotating a lone 2-pin part whose own wire bridges its two pins could delete that wire. (§9c)
11. **Attachment epsilon mismatch** — drag attaches a wire endpoint to a pin within **0.08**, but transform-time pin matching is exact (`samePoint`, 1e-6). A wire 0.05 off a pin follows a *drag* but not a *rotate*.
12. **Tolerance drift** — 1e-3 (rounding) vs 1e-6 (equality) vs 1e-9 (collinearity), used inconsistently. (§1.1)
13. **Shift disables vertex-drag and quick-wire** — both require an unmodified drag; only additive-selection survives under Shift.
14. **No wire-specific affordances** — no add-vertex / split-here / straighten in the context menu; no midpoint handle to insert a bend.
15. **Probe reanchor is bounded at 2.0 cells** — a probe whose wire is deleted with no wire within 2 cells is left dangling (reads disconnected).
16. **Dead/duplicate code** — `placementWireCutSpan` (no live callers), duplicated `sameLineAndDirection`/`sameWirePath`/`compactWire*` across `wireGeometry.ts`/`wireTopology.ts` with differing constants; likely-dead `.wire-group .wire-vertex` CSS; misleadingly-named `wireEndpointPositions` (returns *all* vertices).
17. **No right-click cancel / no single-click finish** for an in-progress draft (only Esc/Backspace/double-click/drag-release). (§6.1)

---

## 13. Node tool — design (in progress)

> **Status: drafting together.** Decided so far: a **dedicated Node tool**
> (Inkscape-style), shortcut **N**; the **Pan tool is removed** (replaced by it
> in the strip). v1 operations: **delete node(s) with heal** and **delete
> segment / split**. Everything marked **[open]** is still up for discussion.

### 13.0 Underlying data model — the deeper question

How wires are represented decides how clean the node tool can be.

| Model | What a "node" is | Pros | Cons |
|---|---|---|---|
| **A. Polyline wire (today)** `Wire={id,points[]}` | a vertex = an index into `points`; a junction = the same coordinate appearing in several wires | minimal change; matches Inkscape paths; serialization stable; netlist already derives the graph by coordinate | a node has no stable id (index churns on re-route); a junction isn't one object |
| **B. One object per segment** `Seg={id,a,b}` | a shared endpoint coordinate (still not an object) | delete-segment = delete one object | a 3-bend wire = 4 objects; breaks all polyline code (routing, auto-format, one-polyline stroke joins); nodes still have no identity; serialization change. **Strictly worse than A.** |
| **C. Explicit node-graph** `Node={id,x,y}`, `Edge={id,n1,n2,waypoints[]}` | a first-class object, stable id, shared by all incident edges | junctions are real single objects; moving a node moves all edges; netlist = graph traversal; node editing is natural | large migration: netlist, routing, hit-testing, drag, transforms, placement-splice, persistence + saved-circuit migration, SVG export. High risk mid-refactor |

**Key realization:** B is strictly worse than A. The real fork is **A (implicit graph, geometry = connectivity)** vs **C (explicit graph, connectivity = data)**.

**Recommended for the Node tool: stay on model A, but address nodes by COORDINATE, not index.**
- A "node" = a grid coordinate; node selection = a set of coordinates.
- This is already how the **netlist** defines a node (union-find keyed by `coordKey`, `netlist.ts:541`) — we surface that existing truth to the UI rather than invent a parallel index-based one.
- A junction renders as **one** handle (dedupe coincident vertices); selecting it selects the shared node; move/delete fans out to **every** wire (and pin/probe) at that coordinate → junctions act like single objects with **no** data-model change.
- Robust to index churn from re-route/compaction; forward-compatible with C (coords map onto node ids later).

**Why defer C:** a real model change must migrate every saved circuit (`localStorage` `spicesim.project.*`), the shared-circuit link format, and SVG/netlist export — a big-bang change on a mid-refactor branch. Ship the node tool on **A + coordinate-addressing**; keep C as its own track.

> **[decision needed]** A + coordinate-addressing (recommended) vs commit to C now.
> The rest of §13 assumes A + coordinate-addressing; if we pick C, §13.3–13.6 get re-expressed in node/edge terms.
>
> **Prior art reframes this (§15):** the auto-connect / tangle pain is a *separate*
> lever — the **connection rule** (today's loose vertex-on-segment vs
> endpoint-only/explicit-junction, as Falstad & Multisim do) — fixable cheaply on
> model A regardless of the identity-model choice above. So the node tool (a) and
> the tangle fix (b) are independent decisions.

### 13.1 Scope

| In v1 | Deferred |
|---|---|
| Dedicated Node tool + N shortcut | Insert node (double-click / Insert) |
| Select node(s): click, Shift-add, rubber-band | Join nodes / join-with-segment |
| Delete node(s) → **heal** | Break path at node (split but keep both ends coincident) |
| Delete segment → **split** | Multi-node drag, straighten, align H/V |
| Move a single node (reuse existing `wireDrag`) | Bezier handles (N/A — wires are orthogonal) |

### 13.2 Tool & palette changes

- Add `"node"` to `Tool` (`toolPredicates.ts:7`); palette button + glyph; **N** shortcut.
- **Remove the Pan tool**: drop its palette button, the **H** shortcut (`Editor.tsx:2518`), and the `tool === "pan"` branches. Panning is unaffected — it already works via **spacebar-hold** (`spacePanRef`), **Alt-drag**, **middle-mouse** (`button === 1`), and **wheel / two-finger** (`applyWheelPan`); the dedicated tool was redundant (`Editor.tsx:3308`).
- **[open]** Keep **H** as an alias for "hand/pan" (mapping to the spacebar-pan path) or drop it entirely?

### 13.3 Selection model (only while the Node tool is active)

- **Node selection** — a set of `(wireId, vertexIdx)`. Click a handle selects it; Shift-click toggles; rubber-band selects all handles in the box.
- **Segment selection** — click a wire *body* (between handles) selects that one segment `{wireId, segIdx}`.
- **Move** — drag a handle to move that node (reuses today's `wireDrag` reshape, §8b).
- Click empty canvas → clear.
- **[open]** Are node- and segment-selection **mutually exclusive** (selecting one clears the other), or combinable? Draft: mutually exclusive (simpler mental model).
- **[open]** Include **multi-node drag** in v1, or just single-node move (the existing mechanic)? Draft: single only.

### 13.4 Operation — delete node(s) → **heal**

Remove the selected vertices; for each gap left behind, re-route an orthogonal
segment between the survivors so the wire stays **one connected polyline**.
Segments between vertices that were already adjacent are kept verbatim (untouched
bends don't shift). An endpoint delete just trims; a wire left with < 2 vertices
is removed. (Sketch: `deleteWireNodes` in `wireNodeEditing.ts`.)

Examples (coords are cells):

- **Redundant midpoint** — `(0,0)→(1,0)→(3,0)`, delete `(1,0)` → re-route `(0,0)→(3,0)` (already aligned) → straight `(0,0)→(3,0)`. Clean.
- **A bend / L-corner** — `(0,0)→(0,2)→(3,2)`, delete the corner `(0,2)` → survivors aren't aligned, so heal routes `(0,0)→(3,0)→(3,2)`: **the corner flips to the opposite side**. ← this is the debatable bit.
- **[open]** Is "corner flips to the mirror elbow" the right heal for a bend, or should deleting a corner be **refused** (a corner carries real routing intent, unlike a redundant midpoint)? Options: **(a)** always re-route (draft); **(b)** refuse when removal isn't shape-preserving; **(c)** collapse only collinear/redundant nodes, refuse true corners.

### 13.5 Operation — delete segment → **split**

Click a segment, Delete → remove that edge, splitting the wire into the two
fragments on either side (`splitWireAtSegment`). An end-segment (or the only
segment of a 2-point wire) leaves a < 2-point fragment that is dropped. The two
halves become **separate nets** — that's the point — and the status bar reports
the new wire/net count so it's never silent.

Example: `(0,0)→(2,0)→(2,2)→(4,2)`, delete segment `(2,0)–(2,2)` → two wires `(0,0)→(2,0)` and `(2,2)→(4,2)`.

### 13.6 Connectivity safety (the schematic-specific part)

In Inkscape nodes are pure geometry; here **geometry is connectivity**, so a
delete can change the netlist. A node is *anchored* if it coincides with a
pin/probe or is a cross-wire junction (another wire taps it).

- **Endpoint on a pin** — deleting it detaches that end. Intended (it's trimming).
- **Anchored interior node, delete-heal** — healing removes that coordinate, which can drop the pin/junction connection. **[open]** choose:
  - **(A)** Refuse — skip anchored interior nodes, notice "kept N connected node(s)." *(draft)*
  - **(B)** Break — delete anyway, let connectivity change (pure Inkscape).
  - **(C)** Keep-coordinate — delete the *bend* but leave a pass-through vertex at the anchor.
- **Split** is always allowed (it's an explicit "cut here").

### 13.7 Rendering & affordances

- Node mode reveals vertex handles. **[open]** on **all** wires at once (discoverable but busy on dense schematics) or only the **hovered / active** wire (cleaner)? Draft: hovered + selected wires' handles, like today, plus any wire under the cursor.
- Selected node → filled accent; unselected → hollow. Selected segment → accent-thick highlight. Cursor: `default`, `grab` over a handle.

### 13.8 Interaction matrix (Node tool active)

| Target | Click | Shift-click | Drag | Delete/⌫ |
|---|---|---|---|---|
| Vertex handle | select that node | toggle in node set | move the node | heal-delete selected node(s) |
| Wire segment (body) | select that segment | — | — | split the wire there |
| Empty canvas | clear selection | (extend marquee) | rubber-band select nodes | — |

### 13.9 Open questions to resolve together

1. **Corner heal** (§13.4): re-route the mirror elbow, or refuse non-redundant corner deletes?
2. **Connectivity safety on delete-node** (§13.6): refuse anchored / break / keep-coordinate?
3. **Handle visibility** (§13.7): all wires vs only hovered/active?
4. **Node vs segment selection** (§13.3): mutually exclusive or combinable?
5. **Multi-node drag** in v1 (§13.3)?
6. **H key** — keep as pan alias or drop (§13.2)?
7. Should **split** also be reachable from two selected *adjacent nodes* (Inkscape's "delete segment between two nodes"), not just a clicked segment?

---

## 14. Implicit / automatic connectivity (the "magic")

Because connectivity is **derived from geometry on every netlist build** (model
A, §13.0), connections appear and vanish as a *side effect* of moving things.
There is no stored "these are connected" fact, and **no way to represent
"touching/crossing but intentionally not the same net."** This catalogs every
implicit connect/disconnect so we can decide which to keep, tame, or remove.

### 14.1 The precise rule (important nuance)

Two pieces of geometry are the same net iff they **share a coordinate** or a
**vertex of one lies on a segment of the other** (`pointOnSegment`, inclusive of
endpoints) — checked fresh each build by `unionWirePointsOnWireSegments`
(`netlist.ts:1048`) and the per-wire vertex union (`netlist.ts:559`).

- A **bare X-crossing** (two straight segments crossing mid-span where *neither*
  has a vertex at the intersection) does **NOT** connect.
- But the moment one wire has a **vertex** (endpoint or bend) sitting on the
  other's line, it connects. So "crossing connects" is really
  "*a vertex landing on a segment* connects" — which happens constantly while
  dragging, and depends on where bends happen to fall. (That position-dependence
  is itself a wart.)

### 14.2 Ways a connection forms

Two regimes: **materialized** (a shared vertex is inserted, persists in data) vs
**derived-only** (nothing stored; exists solely because the netlist re-unions
coincident geometry each build, with the dot recomputed each render).

| Trigger | Connects | Mechanism | Materialized? | Feedback | Surprising? |
|---|---|---|---|---|---|
| Draw a wire ending on another wire | wire→wire | `addWireWithJunctions` splits target at the endpoint | yes | dot | expected |
| Drag a wire **endpoint** onto a wire | wire→wire | vertex-drag finish `splitWiresAtPoint` (`Editor.tsx:4008`) | yes | dot | expected |
| **Move a wire so an endpoint/bend lands on another wire** | wire→wire | `unionWirePointsOnWireSegments` (`netlist.ts:1048`) | **no (derived-only)** | dot appears | **yes — the reported behavior** |
| Two wire vertices end at the **same coordinate** | wire→wire | DSU keyed by coordinate (`netlist.ts:559`) | no | dot if degree ≥3 | mild |
| Bare **X-cross** (no vertex at intersection) | **nothing** | no vertex on segment | — | none | **inconsistent** vs the row above |
| Move a component so a **pin meets a wire vertex** | pin→wire | contact wire / split at pin, or coordinate union | sometimes | dot | expected-ish |
| A wire **segment passes over a pin** (no vertex there) | **nothing** | pins need a vertex (`wireHasPoint`) → "pass-through" warning (`netlist.ts:571`) | — | warning | **asymmetric** vs wire→wire |
| Abut two **pins at the same coordinate** (no wire) | pin→pin | same coordinate ⇒ same node | n/a | **none (no dot)** | **yes — silent** |
| Two **net labels, same text** | label→label | `__LABEL:<value>` sentinel (`netlist.ts:615`) | n/a | shared node name | by-name, off-canvas |
| Any **GND** symbol | pin→node 0 | `__GND__` union (`netlist.ts:603`) | n/a | — | expected |

### 14.3 Ways a connection silently disappears

- **Move a wire away** so its vertex no longer sits on the other → not unioned next build → **silent disconnect** (mirror of the connect case).
- **Delete-heal / reroute** that lifts a wire off a junction/pin → disconnect (the §13.6 safety question).
- `pruneUnanchoredWireJunctions` drops only redundant collinear vertices; it **keeps** cross-wire junctions and pin/probe anchors, so it doesn't sever real connections.

### 14.4 The core issue & how each model handles it

The model can't express **"touch but not the same net."** Connectivity is a pure
function of geometry, recomputed continuously — so dragging silently rewires, and
a crossing's meaning depends on whether a vertex sits at the intersection.

- **Model A (today):** inherent. We can only *tame* it — e.g. require an explicit junction (materialized vertex + dot) for *any* wire-wire connection so a bare overlap never connects; and emit a status message whenever a move changes the net count.
- **Model C (explicit edges/nodes, §13.0):** connection becomes a stored fact — crossing/touching does nothing until you explicitly join, and dragging never silently rewires. Strongest argument for C, at the cost of migration.

> **[discuss]** Which of §14.2 are wanted vs surprising? Should a wire-wire connection ever form *without* a materialized junction dot (the derived-only row)? Should a bare crossing connect at all? Should pin-on-segment connect like wire-on-segment (remove the asymmetry)?

---

### 14.5 Worked example — dragging a connected component onto a wire (the "tangle")

The real-world case behind the report. Setup: component **K** has pin **P** wired
to net **N1** by wire **W1** (W1's endpoint sits on P). A separate wire **W2** is
net **N2**. You drag K so P (and W1's following end) land on/near W2.

1. **W1 follows the pin.** W1 isn't selected, but its endpoint coincides with P, so it's an *attached* wire — its endpoint tracks P and the wire re-routes with obstacle avoidance each frame (`collectDragWires`→`attachedWirePoints`; `moveWirePointsWithAnchorsAvoiding`, `placement.ts`). The winding avoidance paths are most of the visual **tangle**.
2. **W1's endpoint lands on W2 → silent merge.** Once P (= W1's endpoint, a *vertex*) sits on a W2 segment, the netlist unions them at build time (`unionWirePointsOnWireSegments`, `netlist.ts:1048`) → N1 and N2 become one net. Nothing is materialized into the data during the drag (derived-only), though a junction dot appears. **Asymmetry:** the *pin* P landing mid-W2 would be a non-connecting "pass-through" warning; it's W1's *wire vertex* (riding on P) that does the connecting.
3. **Contact bridges may spawn.** Any pin of K already touching *stationary* geometry at drag start is a "direct-contact" pin → a fresh bridge wire is routed old→new (`collectDirectContactPins`, `buildTranslatedPinContactWires`, `dragMath.ts`) and merged with `addWireWithJunctions`. Extra wires, more tangle.
4. **Cleanup keeps it messy.** `pruneUnanchoredWireJunctions` removes only redundant collinear vertices; the new cross-connections and rerouted paths survive.

Net effect: moving a connected part across a wire can **silently merge two nets**
and leave overlapping/rerouted wires. Dragging away reverses the *connection*
(step 2) but **not** the rerouted geometry — so it stays tangled either way.

**Taming options (model A):** (a) only connect where a junction is *materialized*
(a dot you can see/select), never derived-only; (b) don't let an attached wire's
endpoint auto-merge onto a wire it merely crosses mid-drag — require an explicit
drop; (c) status message whenever a move changes the net count. **Model C**
removes the whole class by construction (connection is a stored fact, not a
geometry side effect).

---

## 15. Prior art — how other simulators model wires/nodes

Researched Falstad CircuitJS, CircuitLab, Multisim/Multisim Live, EveryCircuit.

| Tool | Connectivity | Crossing connects? | Junction | Rubber-band on move | Node/wire editing |
|---|---|---|---|---|---|
| **Falstad CircuitJS** | geometry-derived: coincident endpoints (16px grid) → `CircuitNode`, recomputed each frame | **No** — endpoints only, never mid-span | computed dot when terminal count ≠ 2 | **No** for plain wires (rigid); opt-in "Routed Wire" A\* reroutes | wire = straight 2-pt segment; **Cmd-click split**; "Drag Post" moves an endpoint or a whole node; Routed Wire = multi-bend auto-route |
| **CircuitLab** | geometry-derived (no net objects) + "Smart Wires" heuristics | **Position-dependent**: at a terminal → connect (dot); on a bare wire → cross (auto hop/loop) | dot at endpoint coincidence; hop at bare crossing | **Yes**; **Alt** cancels auto-select, **Esc** allows disconnect | polyline w/ auto L-bend; drag endpoints; Name Node (**N**) connect-by-name; explicit split/insert uncertain |
| **Multisim / Live** | **hybrid**: geometry membership + first-class **named nets**; **merge-by-name** ("virtual wiring"); reserved GND/VCC/0 | **No** — explicit junction required | **explicit junction object**, auto-inserted at endpoint-on-wire (T) / pin-on-wire, never at a bare cross | **Yes** ("rubberbanding"), with a **pin-count cutoff** (default 12) + **Space** to invert | polyline; **Ctrl+click** add/remove bend; drag segment/vertex; re-terminate an endpoint; auto-route + click-to-lock vertices |
| **EveryCircuit** | **explicit** terminal→node; an **auto-router owns wire geometry** (no hand-drawn wires) | n/a (no insulated-crossover primitive) | "square node" dot; tap a node → **whole net highlights** | **Yes** (auto-route redraws); **no group move** | act on terminals, not wires; delete via trash; no documented wire split |
| **Ours (today)** | geometry-derived, recomputed each build (DSU by coord) | **vertex-on-segment connects** (looser than all above); bare cross does **not** | computed dot when degree ≥ 3 | **Yes** (attached wires follow + contact wires) — **no escape hatch, no net-count feedback** | polyline; vertex drag (reshape); split only on endpoint-drop; no node tool yet |

### Takeaways

1. **"Geometry = connectivity" is not the problem — our *rule* is.** Two of four (Falstad, CircuitLab) are *also* geometry-derived. They connect only at **coincident endpoints** (Falstad) or require an **explicit junction** (Multisim); we *additionally* connect when a vertex lands on another wire's **mid-segment**, and we allow **derived-only** merges with nothing materialized. That looseness causes the §14 silent-merge / tangle.
2. **Cheap, high-value fix (no model migration): adopt the Falstad/Multisim discipline** — connect only at coincident **endpoints** or an explicit/materialized **junction** (a dot you can see and select); never vertex-on-mid-segment, never derived-only. Eliminates most of §14 while staying on model A.
3. **CircuitLab is the cautionary tale.** Its position-dependent crossing is *exactly* our §14 wart and confuses users even in a polished product (forum threads + an open feature request). Prefer the unambiguous **explicit-junction** rule over "infer from where the crossing lands."
4. **Rubber-band-on-move is universal — but always with an escape hatch** (CircuitLab Alt/Esc; Multisim pin-count cutoff + Space; EveryCircuit auto-route). Ours has neither a suppress-modifier nor net-count feedback. Add both.
5. **Two *separate* decisions we'd been conflating:**
   - **(b) Connection rule** — loose (today) vs endpoint-only/explicit-junction (Falstad/Multisim). *This* fixes the reported tangle, and it's cheap. **Recommend doing it regardless of (a).**
   - **(a) Node-identity model** — index (today) vs coordinate-addressed (§13.0) vs explicit nodes (C). This is about the node *tool*, not the tangle.
6. **Other patterns:** merge-by-name (we have LABEL); an auto-router that *owns* geometry (EveryCircuit / Routed Wire) is the touch-friendly direction; **computed** junction dots (Falstad/us) avoid Multisim's "orphaned junction object" gotcha — so our computed-dot approach is the better of the two.

### Sources
- **Falstad CircuitJS**: `pfalstad/circuitjs1` source (`WireElm`, `CircuitNode`, `SimulationManager`, `RoutedWireElm`/`WireRouter`); falstad.com/circuit/directions.html; lushprojects.com/circuitjs
- **CircuitLab**: docs.circuitlab.com (the-basics, smart-wires, keyboard-shortcuts); circuitlab.com/blog (Smarter Wires); support forum (crossing/bridge threads)
- **Multisim**: NI Multisim User Manual (374483) ch.2 & ch.4; multisim.com/help/schematic/wiring; NI net-system tutorial
- **EveryCircuit**: everycircuit.com (square-nodes + crossing-workaround threads); App Store / Play descriptions; third-party tutorial (official docs sparse)

---

## 16. Model C — explicit node-graph (chosen)

> **Chosen & re-confirmed** (decision (a), after the §16.6 validation) on
> **editor-ergonomics** grounds. Connectivity becomes a **stored graph** instead
> of being re-derived from geometry — so crossing / touching / dragging can never
> silently rewire. EDA segment-format interop is a non-goal; the only external
> format kept is **SPICE netlist import/export**. Built as a **direct rewrite**
> (no phased/parallel rollout).

### 16.1 Data model (locked, build-ready)

```ts
type NodeId = string;  // "n-…"
type WireId = string;  // "w-…"

// A STANDALONE electrical node: a junction, a free wire end, or a named-net
// point. Pin connection points are NOT here — components own them, and a
// pin-node's position DERIVES from the component (see the resolver below).
interface CircuitNode { id: NodeId; x: number; y: number; name?: string }

// An EDGE between two nodes. a/b are node ids (standalone OR a component pin-node).
// bends = routing waypoints (pure geometry) between the two resolved endpoints.
interface Wire { id: WireId; a: NodeId; b: NodeId; bends: [number, number][] }

interface CircuitComponent {
  id; kind; x; y; rotation; mirrored?; value; label?;
  pins: NodeId[];   // pins[i] = this component's pin-node id; position = pinWorldPos(c, i)
}

interface Probe { id: string; node: NodeId }   // samples the net of `node`

interface SchematicPage {
  id; name; description;
  components: CircuitComponent[];
  nodes: CircuitNode[];   // STANDALONE nodes only (junctions / free ends / named)
  wires: Wire[];          // edges
  probes: Probe[];
  version: 2;             // v1 = legacy polyline docs, auto-migrated on load (§16.3)
}
```

**Position resolution** — `nodePos(page, id)`: a standalone node returns its own `x,y`; a pin-node returns `pinWorldPos(component, pinIndex)` of its owning component (O(1) via a `NodeId → {component, pinIndex}` index). A wire's drawn path is `nodePos(a) → bends → nodePos(b)`.

**Why this shape:**
- **Rubber-band is free, zero sync.** A pin-node's position is *derived*, so moving/rotating a component moves its pin-nodes → wire endpoints follow automatically. No coincidence-matching, no contact-wires.
- **Uniform node ids.** Wires, the node tool, selection, and rendering all deal in `NodeId`; the resolver hides pin-node vs standalone.
- **Coincidence ≠ connection (the key shift).** Two nodes/pins at the same coordinate are connected **only if an edge joins them** — never by mere overlap. The §14 silent merges become impossible. Connections form *only* via explicit edges (drawing, or drop-to-connect, which materializes an edge / shared node — see §16.8).

### 16.2 How operations map

| Operation | Model C behavior |
|---|---|
| Draw a wire pin→pin | add an Edge between the two pin-nodes |
| Draw onto a wire (T) | **split** the target edge at a new junction Node (explicit junction) |
| Bare crossing | nothing — no node, no connection |
| Move / rotate / flip a component | move its pin-nodes; incident edges follow by reference. Escape hatch = drop the references (detach) |
| Move a junction node | move the Node once; all incident edges follow |
| Node tool — delete node (heal) | remove a junction Node, merge its two incident edges; endpoint node → trim |
| Node tool — delete segment / split | remove an Edge → graph splits; prune orphaned nodes |
| Node tool — bends | edit an edge's `bends` (pure geometry) |
| Netlist | connected components of the graph — no coordinate-DSU, no pin pass-through heuristic |

### 16.3 Migration (saved circuits)

- **On load** (`docNormalize.ts`): convert old polyline docs → graph deterministically with the *existing* coordinate-DSU (the logic the netlist already runs): a Node at every junction/endpoint/pin coordinate, each polyline → edges between consecutive nodes with `bends`. Lossless for connectivity; bump a doc `version`.
- **Save / share** in the new format; old docs auto-upgrade on load.
- **SVG export**: render `pos(a) → bends → pos(b)` per edge (visual parity).

### 16.4 Phased rollout (de-risk)

1. **Types + converter** — graph types + geometry↔graph converter; unit-test round-trips on every demo circuit.
2. **Netlist from graph** — switch `buildPageNetlist` to traversal; assert identical nets across all demos/tests.
3. **Rendering + hit-testing** from edges (pixel parity).
4. **Editing** — move/rotate/flip/drag via node references (rubber-band), then the node tool (delete/heal/split).
5. **Persistence + on-load migration**; shared-circuit format; SVG export.
6. Retire the geometry-derived connectivity paths (the §14 machinery) once parity holds.

Gate every phase on `tsc` + unit tests + e2e.

### 16.5 Sub-decisions

1. ✅ **Bends = geometry** (not nodes) — only junctions, wire endpoints, and pins are nodes.
2. 🟡 **Pin/port representation (the one remaining detail):**
   - *Pins are nodes* (uniform) — components hold `pins: NodeId[]`; a pin-node's position syncs to the component; the node tool/rendering/rubber-band treat every connection point alike. **Leaning this.**
   - *Ports* — wires reference either a standalone node or a `(componentId, pinIndex)`; `nodes[]` holds only junctions/free-ends; no pin-node sync, but endpoints are a non-uniform union.
3. ✅ **Auto-junction on endpoint-drop** onto an edge (Multisim-style); never on a bare crossing.
4. ✅ **Direct rewrite** (no phased/parallel rollout).

### 16.6 Validation — how the model matches other programs

Researched the actual *data models* (not just behavior). A clean split emerged:

**Circuit / SPICE schematic editors — all geometry-derived, none stores a node-graph:**
- **KiCad** (open-source EDA gold standard): `.kicad_sch` has *"no net IDs, node objects, or connectivity graphs"* — wires are `SCH_LINE` coordinate **segments**; nets recomputed on demand by `CONNECTION_GRAPH`. Junctions are explicit `SCH_JUNCTION` objects, auto-added where a wire endpoint lands on a wire (T), **never at a bare crossing**. **Drag (G)** rubber-bands; **Move (M)** leaves wires (built-in escape hatch).
- **LTspice** (`WIRE x1 y1 x2 y2`), **gEDA/Lepton** (`N x1 y1 x2 y2`), **Qucs** (`<x1 y1 x2 y2…>`): wires as segments; nets derived from coincident endpoints (+ endpoint-on-midpoint T in gEDA); crossing ≠ connected; connect-by-name via labels.

**General graph / diagram editors — all explicit node-graph (model C):**
- mxGraph/draw.io, GraphML/yEd, Eclipse ELK, Unreal Blueprints, Blender, node-RED: explicit Node objects (stable id) + Edges referencing node/**port** ids; edges auto-follow on move; *diagram* editors store edge **waypoints** (mxGraph control points, yEd `y:Path`, ELK bend points), *dataflow* editors auto-route.

**What it means for us:**
1. **C is the standard for graph editors, but no circuit editor uses it.** Choosing C makes us unique among circuit tools and diverges from segment-based formats (`.asc`/`.kicad_sch`) → harder interop.
2. **Circuit tools avoid our tangle without C** — via a *strict geometry rule*: connect only at coincident **endpoints + explicit junctions**, crossing never connects, plus a **Move-vs-Drag** escape hatch. That is our decision (b), and it is exactly KiCad's model.
3. So **A + strict connection rule + coordinate-addressed nodes ≈ the KiCad model** — proven for circuits, supports the node tool, at a fraction of C's migration (we already derive nets via the coordinate DSU; tighten the rule rather than rebuild netlist/persistence/export).

**Reconsidered recommendation:** unless we specifically want C's internal cleanliness (free/exact rubber-band, trivial netlist, stable node ids) and accept the big migration + format divergence, the EDA-proven choice is **A-strict (KiCad-style) + coordinate-addressed node identity**. C is valid, but it's the *graph-editor* model, not the *circuit-editor* one.

> **[decision re-open]** (a): **C** (graph-editor model; big migration; unique among circuit tools) vs **A-strict / coordinate-addressed** (the KiCad / circuit-editor standard; much less work; same tangle fix). Validation leans **A-strict**.

---

### 16.9 Flip cost — empirical

Measured by actually flipping `model.ts`'s `Wire`/`CircuitComponent`/`Probe`/
`SchematicPage` to the graph types and running `tsc`:

- **512 type errors across 28 files.** Top: `Editor.tsx` (133), `demos.ts` (97), `placement.ts` (31), `wireFormatting` (21), `wireMotion`/`netlist` (19), `wireTopology`/`canvasHitTest` (18), `wireGeometry`/`dragMath` (16), `scopeLayout` (15), `topologyCleanup`/`probeValidation`/`labelPlacement` (13)…
- Most of the wire-subsystem errors aren't type-fixes — those files' polyline-editing logic is *replaced* by `graphEdit`, so it's a rewrite, not a patch.
- There is **no incremental-green path**: the flip is red until the whole wire subsystem + `Editor.tsx` editing + every component/wire/probe construction site (incl. `demos.ts`) is migrated and pin-node/`nodes` population is threaded through.

**Conclusion:** the flip is a dedicated, multi-session refactor (do it behind a commit checkpoint), not an autonomous-loop increment. The engine + bridge + Node tool (all green) are the milestone reached without it. The flip was attempted and reverted to keep the editor working.

---

## 17. File map

| Concern | File |
|---|---|
| `Wire` type, page model, ids | `src/editor/model.ts` |
| coords, equality, segment predicates | `src/editor/geometry.ts` |
| wire commit, junction dots, path tests | `src/editor/wireGeometry.ts` |
| split / cut / dedupe / cover | `src/editor/wireTopology.ts` |
| junction prune, post-delete trim | `src/editor/topologyCleanup.ts` |
| routing (elbow, avoider, Dijkstra, scoring) | `src/editor/placement.ts` |
| pin-move tracking, group-wire transform, anchors | `src/editor/dragMath.ts` |
| wire/probe motion under pin moves & reroutes | `src/editor/wireMotion.ts` |
| auto-format / stops | `src/editor/wireFormatting.ts` |
| auto-arrange (ELK) | `src/editor/autoLayout.ts` |
| netlist node union-find | `src/editor/netlist.ts` |
| hit priorities, snap options | `src/editor/canvasHitTest.ts` |
| pointer-intent, thresholds | `src/editor/canvasInteraction.ts` |
| screen↔world, snap | `src/editor/canvasViewport.ts` |
| probe connection/validation | `src/editor/probeValidation.ts` |
| all pointer handlers, rendering, state | `src/editor/Editor.tsx` |
| wire CSS (`.wire-*`, live-flow) | `src/styles.css` |
