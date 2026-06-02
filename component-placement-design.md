# Component Placement — Design

Status: **agreed, not yet implemented.** This documents the placement
interaction: the problem, every scenario, the options considered, the choice,
and the implementation/test impact. Written before coding because the chosen
behavior *changes* existing, test-asserted behavior — see "Test impact".

## Decisions at a glance

We choose **P1** (placement geometry — fixed-size + outward-stub rule) and
**M-C** (touch gestures — one finger manipulates, two fingers navigate).

**Desktop** (chosen: fixed-size components + "outward-stub" rule):

| Gesture | Result |
|---------|--------|
| Tap / click / drag shorter than the part | **No-stub placement** (no synthesized wires) |
| Drag ≥ part length, open space (**expert mouse shortcut**) | Two **outward** endpoint stubs |
| Both pins on the same collinear wire (click *or* drag) | **Inline splice** — cut the between-pins segment |
| Multi-pin part (3+/SUBX), any gesture | **No-stub placement** (pins may still connect by contact) |
| Wire too short for the part | **No-stub placement** for now; *shove-to-fit* deferred |

The base placement primitive is the **no-stub fixed-size drop** (shared
desktop↔touch). Mouse long-drag→outward-stubs is an **expert shortcut** layered
on top; touch never synthesizes stubs. ("Bare" is split into precise terms — see
**Vocabulary**.)

**Mobile / touch (M-C)** — *one finger acts on content; two fingers navigate*
(pro-canvas model). A component tool creates a **fixed-size bare** part by tap or
press-drag-release; **touch drag never defines endpoints and never creates
stubs.** Wire creation supports tap-start → tap-end (drag-to-wire retained where
precise enough). Two-finger drag pans; two-finger pinch zooms. The **Hand tool**
remains an explicit one-finger pan mode.

| Gesture | Result |
|---------|--------|
| One-finger tap | **Drop part bare** (place tool) / **select** (select tool) |
| One-finger press-drag-release (place tool) | Reposition the ghost, then **drop bare** — never sizes |
| One-finger drag on an object | **Move / reshape / resize** it (same as desktop) |
| Wiring | **Tap-start → tap-end** (one-finger drag also wires) |
| **Two-finger drag** | **Pan** |
| **Two-finger pinch** | **Zoom** |
| One-finger drag, empty canvas | nothing → **hint:** two fingers / Hand tool |
| Rotate | Post-place: toolbar/inspector |

**Rejected:** variable-length / scale-to-fit components (Falstad-style) — too
visually inconsistent for dense schematics. **Deferred:** shove-to-fit on tight
splices. **Touch needs two new code changes beyond the placement fix:** **M5** —
implement **two-finger pan** (today the app pans with one finger); **M4** — a
second finger landing (starting pan/zoom) must cancel any in-progress one-finger
draft so it doesn't commit.

> **Scope note.** This doc bundles two related-but-separable projects: a narrow
> **placement-topology fix** (P1 + connection rules; the actual bug) and a
> broader **touch gesture model** (M-C). They could ship as two ADRs and two
> commits — the placement fix first. Kept in one doc by request; the
> "Detailed specifications" section keeps the two concerns clearly separated.

## Vocabulary

Used precisely throughout. "Bare drop" was overloaded (it meant both "no
synthesized stubs" *and* "electrically isolated"); it is split below.

- **Endpoint stub** — a wire that *placement* synthesizes from a pin to the
  gesture's start/end point. Only P1's outward (expert-mouse) case makes these.
- **No-stub placement** — placement creates **no endpoint stubs**. The
  click / short-drag / multi-pin / touch outcome. Does **not** imply isolated —
  pins may still connect by contact.
- **Pin-contact connection** — a pin that lands on an existing connectable object
  (wire body, vertex/junction, another pin) joins that net (`splitWiresAtPoint`
  + junctioning). Independent of stubs; applies to any pin count.
- **Inline splice (inline insertion)** — the existing wire segment *between* two
  collinear pins is **cut**, forcing current through the component. A topology
  mutation, not a placement convenience.
- **Bypass segment** — the wire left between two pins if you split *at* the pins
  but don't cut *between* them: it shorts across the component. The bypass-short
  guard prevents this by forcing an inline splice.
- **Bare isolated placement** — placed with **no pin connected to anything** (no
  stubs, no contact, no splice).
- **Intentional inline-splice gesture** — the exact geometric condition (see
  "Inline-splice gesture (formal)") that triggers a splice vs. a no-stub drop.
- **Expert mouse shortcut** — desktop-only mouse long-drag that synthesizes
  outward stubs. *Not* part of the base model; touch never does it.

So, precisely: *click placement creates **no endpoint stubs**, but may still
create **pin-contact connections** or an **inline splice**.*

## Background: the bug that started this

Selecting a 2-pin component (resistor, source, …) and **clicking** the canvas
(or dragging a very short distance) produces a component whose two pins are
**wired together behind the body** — the part is shorted to itself (the
straight line behind a resistor's zigzag).

### Root cause

On placement (`Editor.tsx` pointer-up → `placement.ts`), the editor routes a
connection stub from each pin to the drag's `start`/`end` points. For a click,
`start === end === the body center`, and `connectedPlacementWires`
(`placement.ts`, the `pins.length >= 2` branch) unconditionally wires
`firstPin → start` and `lastPin → end`. Both endpoints are the same center
point, so both outer pins get tied to it → self-short.

It is **not** resistor-specific. Any component with ≥2 pins shorts its first
and last pin on a click:
- 2-pin (R/C/L/V/I/D/B): the two terminals short.
- 3-pin (NPN/PNP/MOS/OPAMP): drain↔source (or +↔out) short; gate untouched —
  electrically real but visually hidden.
- 4-pin / SUBX: pin-0 ↔ pin-(N−1).

0-pin (NOTE) and 1-pin (GND/LABEL) are already correct (no stub, or the single
pin sits exactly on the placement point so the stub is suppressed).

The deeper framing (per the user): this is less a "bug" than a **UX/model
mismatch**. We use Falstad's "drag defines the two terminals" gesture but with
**fixed-size** components, so a click collapses both endpoints onto a fixed
body and the stub logic doubles back through it.

## The scenario space

Placement varies along four independent dimensions:

1. **Gesture magnitude** — drag length `L` vs the component's own pin span `S`
   (default resistor `S ≈ 4` cells): click (`L=0`) · sub-threshold (`L<0.35`) ·
   short (`0.35≤L<S`) · span (`L≈S`) · long (`L≫S`).
2. **Pin count** — 0 (NOTE) · 1 (GND/LABEL) · 2 (R/C/L/V/I/D/B) · 3
   (NPN/PNP/MOS/OPAMP) · 4 (MOS4) · N (SUBX).
3. **What's under `start`** — empty · wire body · wire vertex/junction · a pin ·
   component body · probe.
4. **What's under `end`** (drags) — same set.

Cross-cutting: connection-snap (on when pinCount>0), snap-to-grid on/off, the
live preview (must equal the commit — both call the same helper today), Esc
cancel, undo.

### Scenario matrix (current vs. chosen)

| # | Gesture | Pins | start / end | Current behavior | Chosen behavior |
|---|---------|------|-------------|------------------|-----------------|
| 1 | Click | 2 | empty | both pins → center → **self-short** ✗ | **drop bare** (no wires) |
| 2 | Click | 2 | on a wire, **collinear** (both pins on it) | centered, both-stubs → **short** ✗ | **auto-splice**: cut the between-pins segment (geometry trigger, not drag length) |
| 2b | Click | 2 | on a wire, **perpendicular** (no pin on it) | centered, both-stubs → **short** ✗ | **drop bare** (no pin touches the wire) |
| 3 | Click | 3+ | empty | pin0↔pin(N−1) **short** (hidden) ✗ | **drop bare** |
| 4 | Click | 1 (GND/LABEL) | empty | placed, no stub ✓ | unchanged |
| 5 | Click | 1 | on a wire | placed; junctions onto wire ✓ | unchanged |
| 6 | Click | 0 (NOTE) | anywhere | placed, no wires ✓ | unchanged |
| 7 | Short drag `0.35≤L<S` | 2 | empty | symmetric **inward** stubs (overlap/partial short) ✗ | **drop bare** |
| 8 | Span/long drag `L≥S` | 2 | empty→empty | two outward stubs ✓ | **unchanged** (keep) |
| 9 | Span/long drag | 2 | start on wire A, end on wire B | outward stubs + splits, bridges two nets ✓ | **unchanged** (keep) |
| 10 | Drag along a wire, collinear `L≥0.35` | 2 | on that wire | inline splice (cut at pins, outward-guarded) ✓ | unchanged |
| 11 | Drag | 3+ | anywhere | stubs from pin0 & pin(N−1) | **drop bare** (don't auto-stub) |
| 12 | Any | 2 | one pin on wire, other in space | one side splits, other floats ✓ | unchanged |
| 13 | Esc mid-placement | any | — | cancels ✓ | unchanged |
| 14 | Click, snap-off | 2 | empty | fractional coords, same short ✗ | drop bare |
| 15 | Click/short-drop **onto a wire**, gap < S | 2 | wire too short | would over-stub/short | **drop bare** (interim) → *shove-to-fit later* |

## How other tools do it (researched)

| Tool | Place gesture | Size | Drop on wire | Self-short? |
|------|---------------|------|--------------|-------------|
| **CircuitLab** | **click to drop** | fixed | **splices** ("D1 replaced the wire segment") | no — bare pins |
| **Multisim Live** | click-place / drag-from-palette | fixed | **splices** (inline pins onto wire) | no — bare pins |
| **EveryCircuit** | drag from toolbar, drop | fixed | wire afterward | no — bare pins |
| **Falstad CircuitJS** | **drag** first terminal → second | **variable** | n/a (draw onto empty) | no — drag = two distinct ends; zero-drag = nothing |
| KiCad / LTspice | click to drop | fixed | drop-on-wire splices | no — bare pins |

Takeaway: **4 of 5 are fixed-size, click-to-drop-bare, and splice on
drop-on-wire.** Only Falstad is variable-size; it avoids the short because the
component *is* the dragged span (and a zero-length drag makes nothing). Our app
is the unhappy hybrid: Falstad's gesture + fixed size + synthesized stubs.

## Placement-geometry options (P1–P4)

**P1. Fixed-size + outward-stub rule (CHOSEN).** Keep fixed components. Only
synthesize a stub for an endpoint that is *outward* of its pin (beyond the pin,
away from the other pin). Click & short-drag → endpoints fall between/at the
pins → no stubs → **bare drop**. Span/long drag → endpoints beyond the pins →
outward stubs. Drop-on-wire → inline splice (unchanged). One geometric rule
covers click, short-drag, and span-drag without a separate click/drag branch.
Matches the 4-of-5 majority.

> **Framing (per review):** the base placement primitive is the **no-stub
> fixed-size drop**. Long-drag→outward-stubs is an **expert mouse shortcut**, not
> part of the base model — touch never does it, and the dominant convention is
> *place fixed, then wire*. P1 keeps the shortcut because it already exists and
> the outward rule makes it safe (no self-short), but it must be **demoted in the
> UI**: only offered to the mouse, and **previewed loudly** (the stubs must be
> visible before commit).

> "Outward" = the mouse point is past the pin, not behind it (between the pins).
> A stub to a point *behind* a pin doubles back through the body — that is the
> short. The inline-splice path already uses this test
> (`pointIsOutwardFromTerminal`); P1 applies it to the normal path too.

**P2. Always drop bare; only `L≥S` drags wire.** Explicit branch, same outcome,
more code; loses nothing important but is less elegant than P1.

**P3. Variable-length / "scale to fit" (Falstad).** Component stretches between
start and end; stubs never exist; tight-gap splice just shrinks the part.
Elegant — and the *only* option that gracefully solves a too-tight splice.
**Rejected:** big change (new geometry field, length-aware `getPinLayout`,
stretchable symbols in `symbols.tsx`, bounds/label/resize/persistence), and —
decisively — **non-uniform component sizes make dense schematics uglier and
harder to read**, which is exactly why CircuitLab/Multisim/KiCad keep fixed
sizes. ("Maybe it's too ugly to have some components be smaller. Let's just
drop that option.")

**P4. Shove-to-fit on tight splice.** When splicing into a wire shorter than the
component, push downstream neighbors outward by the shortfall and re-route. PCB
"push-and-shove." Powerful but ~80% of the effort and the riskiest part (moves
things the user didn't touch, possible cascade). **Deferred** to a follow-up;
interim is bare-drop (scenario 15).

## Chosen design (summary)

Fixed-size components. One rule — **only synthesize a stub for an endpoint that
is outward of its pin** — plus the existing inline-splice path:

- **Click / drag shorter than the component → no-stub placement** (every pin
  count). Fixes scenarios 1–3, 7, 14. Pins may still connect by contact.
- **Drag ≥ component span in open space → outward stubs** to start/end
  (scenarios 8, 9 preserved) — **expert mouse shortcut, desktop only**.
- **Both pins land on the same collinear wire → inline splice**, cutting the
  between-pins segment — whether by drag (scenario 10) *or* by a click (scenario
  2, the bypass-short case). Trigger is **geometry, not gesture length**.
- **Multi-pin (3+/SUBX) → no-stub** (scenario 11); pins landing on a wire still
  connect by **contact** via the existing `splitWiresAtPoint`.
- **Tight splice (gap < S) → no-stub placement** for now; **shove-to-fit** is a
  separate future task (scenario 15 / P4).

## Mobile / touch

Touch changes the gesture model in ways desktop doesn't, and the placement
design has to hold up there too. **Current** touch handling (in
`onCanvasPointerDown`): two-finger **pinch-zoom**; single-finger drag on empty
canvas **pans** *only when the Select tool is active*; with a component tool
active, touch runs the same down→move→up placement path as the mouse. The
**chosen** model (M-C, below) changes this: pan/zoom become two-finger, one
finger always manipulates content, and placement never sizes via drag.

### Observed current behavior (Playwright, 390×844 phone viewport)

Verified live, not inferred:
- At phone width the **mobile layout already engages** — both side panels
  auto-collapse via `isNarrowViewport()` (< 900px), leaving the canvas + the
  vertical tool strip + status bar.
- A **single touch tap** (`pointerType: "touch"`, down+up at one point) with the
  Resistor tool **places a resistor and reproduces the self-short** — a straight
  segment through the body tying both terminals together — *identical* to the
  desktop click bug; the status bar even reads *"Added Resistor with connection
  stubs"* (screenshot saved under `.playwright-mcp/`). So the defect is not
  desktop-only; it is the **default
  outcome of the most common mobile gesture**, which is the strongest argument
  for the bare-drop fix.
- `setPointerCapture` is wrapped in try/catch, so the touch path runs cleanly.

Not yet verified *at runtime* (needs a touch-enabled context / real device):
two-finger **pan/pinch** interaction with an in-progress one-finger draft — the
code path is now analyzed and shows a gap (see **M4**) — and two-finger pan
ergonomics on a phone.

### What touch changes

1. **No hover / no preview before contact.** Desktop shows a cursor-following
   preview before you commit. On touch there is no cursor — the first feedback
   is when your finger is already down. The existing press→drag→lift model does
   show the preview *while the finger is down*, which is the right primitive.
2. **A tap is the dominant placement gesture — and a tap is the click case.**
   `start === end`, i.e. exactly scenario 1/3. Our chosen "tap → drop bare" is
   therefore not just a desktop nicety; it's the *primary* mobile interaction.
3. **Tap-vs-drag is fuzzy on touch.** A finger "tap" usually wobbles a few
   pixels, so an intended tap often registers as a tiny drag. **This is
   harmless under the chosen design**: tap and sub-span drag both produce a
   bare drop, so touch jitter can't create a stray stub or a short. (Worth
   stating explicitly — it's a real robustness win of P1 on mobile.)
4. **The finger occludes the target.** You can't see the cell you're dropping
   on. Drag-to-precise-endpoint and drag-along-a-wire (splice) are therefore
   much harder than on desktop.
5. **Poor drag precision.** Hitting a specific endpoint or staying collinear
   with a wire to trigger the inline splice is unreliable with a fingertip.
6. **No Shift+R, no right-click.** Rotation-during-placement and context menus
   need touch equivalents (on-screen control, or post-place rotate via the
   existing inspector/toolbar rotate actions).

### How the reference tools handle mobile

- **EveryCircuit** (mobile-first): drag a fixed-size component from the palette
  onto the canvas; it drops and snaps. No drag-to-size; wiring is a separate
  gesture. Effectively tap/drag-to-drop-bare.
- **Multisim Live**: documents an explicit **two-tap** flow — *"tap the desired
  object and then tap again in the desired schematic location to place it."*
  Drops bare; rotation while placing is Shift+R (desktop) with on-screen
  equivalents on touch.
- **CircuitLab**: click-to-drop, which is a tap on touch.

Takeaway: the mobile convention across these is **tap → drop a fixed-size part
bare**, then wire separately. That is exactly what P1 yields for a tap —
so desktop and touch share the **no-stub tap/click primitive** — but they are
**not identical**: desktop additionally offers the expert mouse long-drag stub
shortcut that touch omits. (Stated to avoid overclaiming full unity.)

### How general canvas apps handle touch (broader research)

Beyond EE tools, mainstream graphics/diagram canvases converge on two
near-universal touch conventions:

- **The gesture model splits by app type — "everyone pans with two fingers" is
  false.** *Mobile whiteboard / viewer apps often default to **one-finger pan***
  for casual browsing: **Figma mobile** Design files pan with one finger + a
  two-finger pinch to zoom (it's a viewer/comment/prototype companion, not a full
  editor); **Miro mobile** uses swipe-to-pan + long-tap-to-move-an-object.
  *Pro creative / stylus apps* more often reserve **one finger/pen for content
  and two fingers for viewport navigation**: **Photoshop** uses two-finger
  gestures for canvas location/rotation/scale; **Illustrator** Touch Workspace
  documents two-finger pan. We intentionally choose the **pro-canvas model
  (M-C)** because dense schematics have a high accidental-edit cost — and a
  **Hand tool** preserves a one-finger-pan escape hatch.
- **Insertion = "drop at default, then adjust" — not drag-to-define.** Google
  Slides ("insert → appears at a default size and position", then drag the
  selection handles), Figma, and Miro all drop a **default-size** object and let
  you move it / resize it via **handles** and rotate via a **rotation handle**
  as separate gestures. Nobody drags out an object's geometry on touch.

Connecting things is the one area tools split: **Lucidchart (touch)** uses
select-shape → tap-and-hold a connection dot → **drag** to the target;
tap-source-then-tap-target is also a recognized pattern but less standardized.

**This validates the chosen mobile model:** "tap → drop a fixed-size part bare,
then move/rotate/wire separately" is exactly the Slides/Figma/Miro
drop-at-default convention — so our desktop fix (P1) and the mobile model land on
the same primitive. The **gesture model** we adopt (M-C) is the *pro-canvas*
choice — one finger manipulates, two fingers pan + zoom (Photoshop /
Illustrator) — picked deliberately over the whiteboard one-finger-pan default
because schematics are edit-dense; the **Hand tool** keeps one-finger pan
available as an escape hatch.

> Figma mobile reference (one-finger pan in Design files):
> https://help.figma.com/hc/en-us/articles/1500007537281-Guide-to-the-Figma-mobile-app

### Decided mobile model

On touch (`pointerType === "touch"`):

**The governing rule: one finger manipulates (exactly like the desktop mouse
cursor), two fingers navigate.** This is the Figma / Photoshop / Illustrator
model. One finger does whatever the active tool + the thing under it dictate —
identical to a mouse press — and pan/zoom is *always* two fingers. This is the
"most professional and powerful" model and, critically, it **dissolves the
pan-vs-move disambiguation problem entirely**: a one-finger drag never has to be
guessed as "pan or move?" because pan is two-finger by definition.

1. **Create a component: tap, or press-drag-release to position — always
   fixed-size and bare.** A **tap** places the fixed-size part **bare** at the
   tapped (snapped) cell. A **press-drag-release** *may reposition the ghost*
   before release (a natural way to aim when there is no hover), but **drag
   distance never defines the part's endpoints and never synthesizes stubs.**
   What touch **removes** is **drag-to-create geometry**: a touch drag does not
   define a new part's endpoints and does not trigger inline splice. (Drag is
   *not* removed in general — it still moves / reshapes / resizes existing
   objects; see #3.) Desktop/mouse may still long-drag to create outward stubs
   (P1). A stray finger-wobble during a tap collapses to the same bare drop — no
   touch-specific placement failure.
2. **Create a wire: tap-start → tap-end** (a one-finger drag also wires). Tap a
   pin/point to start, tap the next to commit (tap mid-route to add a waypoint).
   **This already works in the code today** (verified by code-read):
   `onCanvasPointerDown` (`tool === "wire"`, ~3404) starts a draft on the first
   tap (`updateWireDraft([target])`); a later tap whose point **snaps to a
   connection** and yields a ≥2-point route calls `commitWireRoute` (~3428) — an
   unsnapped tap just appends a waypoint. Crucially, pointer-up (~3946)
   auto-commits *only* when the gesture **moved** past 0.35 cell; a stationary
   wire-tool tap takes neither commit branch, so `wireDraft` is **preserved**
   (only `wireGesture` is cleared) and the next tap continues the route. So both
   tap-tap *and* drag-to-wire work; nothing to build, just keep both.
3. **Manipulate existing objects: one-finger drag — and this is why drag
   stays.** Drag is the irreducible primitive for editing what already exists,
   and it already works on touch (no `pointerType` special-casing in these
   paths):
   - **Move a component** — press + drag (`drag` state, `onCanvasPointerDown`
     ~3517 → `applySelectionDragPreview` ~3843); `CANVAS_DRAG_START_THRESHOLD`
     0.08 cell.
   - **Reshape a wire** — drag a vertex handle (`wire-vertex-drag` intent ~3458,
     `hitWireVertex`, `wireDrag` state → `reshapeDraggedWirePointAvoiding`
     ~3803); selecting a whole wire moves all its points together.
   - **Resize a NOTE / SUBX** — drag a corner handle (`noteResize` ~3305 /
     `subxResize` ~3323).
   - **Rotate** — post-place via toolbar/inspector (a rotation handle is a
     possible later refinement).
4. **Navigate: two-finger drag pans, two-finger pinch zooms.** This is the
   **pro-canvas** convention — Photoshop's two-finger canvas gestures,
   Illustrator's Touch Workspace two-finger pan — where one finger/pen is for
   content and two fingers navigate. (Note it is *not* universal: Figma mobile
   and Miro mobile one-finger-pan; see the research section.) We pick it
   deliberately because it removes the accidental-move risk that one-finger pan
   carries on a dense phone schematic (NN/g and the Konva/Shapr3D threads
   document exactly that failure): one finger *always* manipulates the object
   under it, so pan never has to be guessed.
   **Code impact (bigger than the rest):** today the app pans with **one** finger
   on the empty canvas in select mode (`onCanvasPointerDown` ~3272) and uses two
   fingers only for **pinch** (~3245-3261). Moving to two-finger pan means: (a)
   remove/repurpose the one-finger empty-canvas pan branch (~3272); (b) extend
   the two-pointer handler to also **pan** by its midpoint delta — it already
   computes a midpoint/`centerWorld` (~3251-3255), so pan falls out of the same
   math as pinch; (c) a one-finger drag on empty canvas then does nothing today
   (reserved for a future marquee-select). The explicit **hand tool** stays as a
   one-finger-pan affordance for discoverability/accessibility.

### Implications & remaining checks

- **Tap-to-drop-bare is the shared primitive** on desktop and touch; the common
  path needs no separate mobile placement code.
- **Connection-snap matters more on touch** (fat-finger): the existing
  `pointerConnectionPoint` radius (1.0 cell) helps a tapped pin land on a nearby
  wire/pin so it connects via the post-place split. Re-check it's generous
  enough for touch.
- **M1 — thresholds (REFRAMED): stub-gating is moot, but slop thresholds still
  matter.** The 0.35-cell threshold no longer gates **stub creation** on touch
  (touch never drags-to-size). But touch still needs **screen-space slop
  thresholds** for: tap-vs-press-drag-to-position, tap-to-select vs object-move,
  wire-tap vs drag-to-wire, long-press / context actions, and ignoring finger
  jitter that crosses a grid boundary. (The 0.35 cell still governs desktop
  drag-vs-click.)
- **M2 — preview offset (RESOLVED): no offset.** Because touch never
  drags-to-size, there is no sustained aim-while-dragging to occlude — a tap
  drops the part **centered on the tap**, instantly visible. The occlusion literature finds offset-cursor / loupe
  mitigations "easily lead to loss of focus or context and disorient users"; the
  standard precision answers are **pinch-zoom** (then tap) and **post-place
  handles** — both of which we already have / plan. So no offset preview.
  Instead, address the real touch gap — **no hover** — with a **"pending wire"
  affordance** for tap-tap (a persistent start marker + a visible in-progress
  segment), plus a check that the touch snap radius is generous.
- **M3 — rotate on touch (RESOLVED): post-place rotate** via toolbar/inspector;
  optional rotation-handle later. No rotate-during-placement needed.
- **M4 — a second finger must neutralize a *transient* one-finger gesture, but
  preserve a *persistent* tap-to-tap wire route (real code gap).** When a second
  finger lands (starting pan/zoom), the two-pointer branch (`onCanvasPointerDown`
  ~3249-3261) clears `panning`/`drag`/`wireDrag`/`scopeDrag` but **not**
  `placementDraft` or `wireDraft`. **Fix:** on the second touch-down, abort any
  *transient* one-finger gesture and guarantee its pointer-up cannot commit —
  clear `placementDraft` and any active move `drag`. **For wiring, clear only the
  transient drag gesture; preserve `wireDraft` when it is a tap-to-tap route** so
  the user can two-finger pan/zoom mid-route to reach the destination, then
  re-show the pending-wire start marker after the viewport gesture ends. Cancel a
  persistent `wireDraft` only via Esc / tool change / explicit cancel. (Blanket-
  clearing `wireDraft` would make "pan to reach the far pin" feel hostile.)
- **M5 — implement two-finger pan (new code; the bigger touch change).** Today
  panning is **one** finger on the empty canvas in select mode (~3272); the
  chosen model makes pan **two-finger**. Add a midpoint-delta translate to the
  two-pointer handler (it already computes `centerWorld` at ~3251-3255, so pan
  rides the same math as pinch) and remove/repurpose the one-finger empty-canvas
  pan branch. Keep the explicit **hand tool** as a one-finger-pan affordance for
  discoverability/accessibility.
- **M6 — two-finger-pan discoverability (must add).** If a one-finger
  empty-canvas drag does *nothing* in Select mode, many phone users will assume
  the canvas is broken. Show a **one-time hint** — *"Use two fingers to
  pan/zoom, or pick the Hand tool for one-finger pan"* — triggered the first time
  a touch user one-finger-drags empty canvas and nothing happens. (The Hand tool
  is the durable affordance; the hint is the just-in-time teach.)
- **Bypass short on drop-on-wire → AUTO-SPLICE (decided).** If a 2-pin part is
  **bare-dropped so both pins land on the same continuous wire**, naively
  splitting that wire at each pin leaves the **original segment *between* the pins
  intact** — electrically **bypassing the component** (an invisible short across
  it). **Decision: treat it as an inline splice and cut the between-pins
  segment** — "I dropped it on the wire, so it's now *in* the wire" (matches
  CircuitLab/Multisim). **Code consequence (important):** inline-splice currently
  only fires on a drag — `placementCanInsertInline` requires `L ≥ 0.35`
  (`canvasInteraction.ts`), so a **click** (`L=0`) is excluded today. To honor
  auto-splice, the splice path must also trigger on a *zero-length* placement
  when both pins are collinear-on-wire. The trigger is **geometry (both pins land
  on one collinear segment), not gesture length.** Needs a dedicated test (Test
  impact #9).
- **Broader gesture map (decided):** the model is **two-finger pan + pinch-zoom,
  one-finger manipulation** (pro-canvas / Photoshop), with the Hand tool as a
  one-finger-pan escape hatch. Remaining larger-pass items — touch **context
  actions** (long-press or two-finger-tap menus) and a **selection-handle
  rotate** — are beyond this placement fix.

None of this blocks P1. The core decisions — **desktop:** tap/short-drag is a
no-stub placement, long-drag is the expert stub shortcut, both-pins-on-wire
splices; **touch (M-C):** one finger manipulates (tap-to-place / select / move /
reshape / wire), two fingers pan + zoom — are settled.

## Detailed specifications

Added per design review. Placement, connection, and navigation are **separate
concerns**; this section specifies each so implementation and tests have an
unambiguous target. (Terms are from **Vocabulary**.)

### Connection topology policy (when pins land on geometry)

Placement decides *where the symbol goes*; this policy decides *whether pins
connect*. Evaluated per pin at the snapped position, **after grid snap**.

Per pin, classify what it lands on (within the snap radius — see Thresholds):

1. **Nothing** → pin left unconnected (→ bare isolated, if all pins are).
2. **A wire body** → pin-contact: `splitWiresAtPoint` cuts that wire at the pin
   and junctions it.
3. **A wire vertex / existing junction** → pin-contact at the vertex (no new
   split; add the pin's net to the junction node).
4. **Another component pin** → pin-contact: the two pins share a node directly.
5. **Both pins of a 2-pin part on the *same continuous collinear* wire** →
   **inline splice** (cut the between-pins segment). This overrides 1–4 and is
   the geometry-triggered bypass-short guard.

Resolved edge cases:

- **Junction/branch *between* the pins:** if the between-pins span contains a
  vertex with a third wire (a tap), **do not delete the tap** — cut the two outer
  sub-segments so each pin connects but **keep the branch node**. Splice without
  orphaning the tap.
- **Polyline, pins on *different* segments of one wire object:** an inline splice
  **only** if the pin points and the intervening vertices are all collinear with
  the component axis (a straight run drawn as multiple points). Otherwise it is
  *not* a splice → per-pin contact (rule 2/3) for whichever pins touch, **no**
  between-cut.
- **Two overlapping wires at the spot:** splice/contact the **topmost**
  (last-drawn / selection-priority) wire only; leave the other intact, and the
  status message names which wire was used (ambiguous case).
- **One pin on a component pin, other on a wire:** each pin follows its own rule
  (4 and 2); **no** between-cut (not the same-wire case).
- **Near-but-not-exact after grid snap:** connection requires the pin within the
  snap radius **after** grid snap. If grid snap pushes it off the wire beyond the
  radius → **no** connection (no fragile "almost" joins).
- **Multi-pin (3+/SUBX):** **never** splice and **never** synthesize stubs —
  but each pin **may** still connect by **contact** (rules 1–4). "Never auto-wire
  pins" forbids *stubs/splice*, not contact joins.

### Inline-splice gesture (formal)

An inline splice fires **iff** *all* hold (independent of gesture length — a
click qualifies):

- the component has **exactly 2 pins**;
- **both** pin points lie on the **same continuous wire**;
- both pins are **collinear** with that wire's local axis within
  `SPLICE_COLLINEAR_TOL` (≈ 0.1 cell perpendicular);
- the component's pin axis is **parallel** to the wire axis within
  `SPLICE_ANGLE_TOL` (≈ 5°) — a perpendicular crossing is **not** a splice
  (scenario 2b);
- the between-pins span lies **within** the wire's extent (pins don't hang past
  both ends — that's the tight/over-hang case → P4-deferred / no-stub).

Notes: **diagonal wires** simply never satisfy parallelism if routing is
orthogonal-only → no splice; **vertices/junctions** in the span are allowed
(branch nodes preserved, above); **snap may promote** a near-wire gesture to a
splice **only** if post-snap both conditions hold — and the **preview must show
the cut** first, so promotion is never a surprise.

### Thresholds (screen-space + world-space)

| Name | Space | Initial | Purpose |
|------|-------|---------|---------|
| `TAP_SLOP` | screen | 6–10 CSS px | below → pointer-up is a *tap*, not a drag |
| `CANVAS_DRAG_START` | world | 0.08 cell | existing move/reshape commit threshold |
| stub gesture span | world | `S` (pin span) | mouse long-drag must reach `S` to make outward stubs |
| `SNAP_RADIUS_MOUSE` | world | 1.0 cell | pin/wire connection snap (mouse) |
| `SNAP_RADIUS_TOUCH` | screen-aware | ≥ ~11 mm-equiv | larger for fingers; convert via zoom, clamp |
| `SPLICE_COLLINEAR_TOL` | world | ~0.1 cell | perpendicular deviation for splice |
| `SPLICE_ANGLE_TOL` | angle | ~5° | parallelism for splice |

- **Tap-vs-drag is screen-space** (`TAP_SLOP`) — finger jitter/target
  acquisition are screen problems; don't gate it on a world threshold.
- **Stub generation is world-space** (`S`) — it's geometry relative to the part.
- **Clamp at extreme zoom:** convert screen thresholds through current zoom and
  clamp so they're never sub-pixel or whole-screen across ~0.05×–50×.

### Accessibility & hit targets

- **WCAG 2.2 SC 2.5.8 (Target Size, Minimum):** pointer targets ≥ **24×24 CSS
  px** unless an exception applies.
  (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **Android:** ≥ **48×48 dp** (~9 mm), ~8 dp spacing.
  (https://support.google.com/accessibility/android/answer/7101858)
- Dense schematics legitimately have sub-24px *visual* pins → use the
  spacing/enlarged-hit-area exception: keep the visual pin small but make the
  **hit area + touch snap radius** meet the minimum. Where pins are closer than
  the minimum, provide an equivalent affordance — **zoom-to-place**, a
  **magnifier / pending-target readout**, or **snap disambiguation** (cycle
  candidates) — rather than relying on raw fingertip precision.

### Preview semantics (preview == commit, and legible)

The preview shares the commit helper (good). It must **visually distinguish**
every outcome *before* commit — several look alike but mutate topology
differently:

| Preview state | Visual |
|---------------|--------|
| No-stub, isolated | ghost symbol only; no wires, no dots |
| Pin-contact | connection dot(s) on the touched wire/pin |
| Inline splice | between-pins segment shown **cut** + two contact dots |
| Outward stubs (mouse) | the synthesized stub wires drawn to the endpoints |
| Tight / over-hang fallback | ghost + a "won't connect" indicator (no false dots) |
| Touch pending-wire | persistent start marker + rubber-band to finger |

**Rule:** a topology mutation (splice/cut) **must** be visible in preview; never
cut a wire whose preview didn't show the cut.

### Status messages (exact)

The same visual placement can have different electrical consequences, so the
status line states which happened (replacing today's misleading *"Added Resistor
with connection stubs"*):

- `Placed Resistor` — bare isolated.
- `Placed Resistor connected to wire` — pin-contact, no splice.
- `Inserted Resistor into wire` — inline splice (between-pins cut).
- `Placed Resistor (no connection)` — pins near but not connected.
- `Too little room to insert — placed without connection` — tight fallback.
- `Use two fingers to pan/zoom, or pick the Hand tool` — M6 touch hint.

### Error recovery & reversibility

Splices are invisible-looking topology changes, so:

- **Distinct status text** per outcome (above) — splice is distinguishable from a
  plain drop.
- **Highlight the result:** the placed part and any created/cut wires are
  **selected** right after commit, making a splice visible.
- **Undo restores the original wire exactly** — one undo of a spliced placement
  must **re-join** the cut segment into its pre-cut polyline, not leave two
  stubs. (Explicit test.)
- **No auto-splice toggle.** Auto-splice is a deliberate decision; made *safe* by
  preview + status + undo, not a preference. (Revisit only if testing shows
  accidental splices.)

### Pointer events / browser interaction (touch correctness)

- **`touch-action: none` on the canvas** so the browser doesn't steal one/two-
  finger pan-zoom (we implement them). Per the Pointer Events spec, viewport
  manipulation can't be suppressed via `preventDefault()` — it must be declared
  with `touch-action`. (https://www.w3.org/TR/pointerevents3/)
- **`pointercancel` (ties into M4):** the browser fires it when it takes over a
  gesture, on orientation change, on palm rejection, or with too many pointers.
  Handle it like M4's second-finger rule — **abort transient one-finger
  gestures** (placement ghost, move drag), guarantee no commit, but **preserve a
  persistent tap-to-tap `wireDraft`**.
  (https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)
- **Orientation change / resize:** treat as `pointercancel` for in-flight
  gestures; recompute the viewport, keep persistent drafts.
- **Stylus / pen:** pen follows **mouse** rules (precise → may use the expert
  long-drag shortcut + hover-preview); finger follows **touch** rules (no-stub,
  two-finger navigate). Branch on `pointerType`.

### Discoverability (stronger than a one-time toast)

A one-time hint alone risks a discoverability cliff (Norman/Nielsen on hidden
gestures — https://jnd.org/gestural-interfaces-a-step-backwards-in-usability/).
So M6 is: (a) the **Hand tool is visually prominent** in the touch layout (a
persistent affordance, not just a toast); (b) a **short "two-finger pan" overlay
the first few** empty-canvas one-finger drags (not only once); (c) first-run
mobile onboarding. We keep two-finger pan (the expert-canvas bias) but
acknowledge it **needs** the affordance + onboarding, not silence.

## Implementation notes

- Primary change: `connectedPlacementWires` in `src/editor/placement.ts` — gate
  the 2-pin stub branch on `pointIsOutwardFromTerminal` (reuse the existing
  helper) and restrict synthesized stubs to exactly `pins.length === 2`.
- The live placement preview already calls the same helper
  (`placementConnectionWires`), so WYSIWYG is preserved automatically.
- Pin-on-wire / pin-on-pin connectivity is unchanged (handled by
  `splitWiresAtPoint` + junctioning after placement).
- **Bypass-short guard (auto-splice):** when a placement lands **both** pins of a
  2-pin part on the **same continuous collinear wire**, cut the between-pins
  segment (inline splice) rather than splitting at the pins and leaving that
  segment intact — otherwise the wire shorts across the component. This must fire
  **on a click too**, so the inline-splice trigger has to move from the
  drag-length gate (`placementCanInsertInline`, `L ≥ 0.35`) to a **geometry
  test** (both pins collinear-on-wire), independent of gesture length. See Test
  impact #9.

### Test impact (important — this changes asserted behavior)

The current behavior is encoded in `tests/placement.test.ts`. The chosen design
**intentionally changes** at least these, which must be updated alongside the
code (not silently broken):

- `"short two-terminal drags get symmetric endpoint stubs instead of one-sided
  overhangs"` — today asserts a short drag produces two inward stubs; under the
  new rule a short drag drops **bare** (no stubs). This test must be rewritten
  to assert the bare-drop outcome.
- `"placement preview uses inline insertion stubs when cutting an existing
  wire"` — the non-inline expectation in this test assumes inward stubs; needs
  re-baselining to outward-only.

New **desktop** tests to add: click 2-pin → 0 wires (no self-short); sub-span
drag → 0 wires; click NMOS/OPAMP → 0 wires; span drag → 2 outward stubs
unchanged; drop-on-wire → splice unchanged.

New **mobile / gesture** tests to add:

1. Touch component **tap** → fixed-size bare component, **0** synthesized wires.
2. Touch component **drag** → still fixed-size bare, **no endpoint stubs**.
3. Touch component **drag that ends with the part *off* any wire** → bare drop,
   no splice (a positioning drag that doesn't land pins on a wire never splices).
4. **Two-finger pan** changes viewport translation, **not** selection/object position.
5. **Second finger during placement** cancels the placement and prevents the
   pointer-up commit.
6. **Second finger during tap-to-tap wiring preserves `wireDraft`** (per M4), so
   pan/zoom mid-route doesn't abandon the wire.
7. **One-finger empty-canvas drag in Select** does **not** pan and shows the
   two-finger / Hand-tool hint (M6).
8. **Hand tool** still supports one-finger pan.
9. **Drop a 2-pin component (click *and* short-drag) with both pins on one
   collinear wire → auto-splice**: the between-pins segment is **cut** (no bypass
   short), and each pin connects to its outer wire half. Assert it fires even for
   a **zero-length click** (geometry trigger, not the old `L ≥ 0.35` gate).

### Verification

`tsc -b` clean · `npm test` green (with the two tests above updated) · lint 0 ·
Playwright: New circuit → Resistor tool → single click → assert the placed
resistor has **no** wire joining its two pins; click a transistor → bare; drag
a resistor across open space → two stubs; drag a resistor along a wire → splice.
