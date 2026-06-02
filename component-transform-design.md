# Component Transform (Rotate / Mirror / Flip) — Design

Status: **T1 implemented** (Mirror ↔ on a 2-pin part swaps terminal polarity in
place). Documents what the inspector's **Rotate**, **Mirror ↔**, and **Flip ↕**
buttons do, why **Mirror ↔ was a no-op for 2-pin parts** (the reported bug), and
how they behave —

## Implemented (T1)

- `mirrorPinLayoutIfNeeded` (model.ts): for a **2-pin** part, `mirrored` now
  **reverses pin order** instead of `x→−x`. This swaps the +/− (V/I/B), A/K (D),
  1/2 (R/C/L) identity and the emitted netlist node order, while pin *positions*
  stay put. (For a horizontal R it equals the old x↔swap.) Multi-pin parts keep
  the geometric horizontal mirror.
- `ComponentGlyph` (symbols.tsx): vertical-pin parts (V/I/D/C/L/B) mirror with
  `scale(1 -1)` so the polarity marks visibly swap ends; others keep
  `scale(-1 1)`.
- `collectTransformedPinMoves` (dragMath.ts): a transform that only *permutes*
  pins among their existing positions (the polarity swap, and 180° rotation of a
  symmetric 2-pin part) no longer drags attached wires — previously the
  per-index "move" rerouted a wire to the opposite terminal.
- `flipVerticalSelected` (Editor.tsx): **Flip ↕ on a 2-pin part is also a
  terminal swap** (toggle `mirrored`), *not* the multi-pin `toggle-mirror +
  flipRotation` recipe. A 2-pin part lies on one axis, so its only meaningful
  reflection is swapping the two terminals; both Mirror ↔ and Flip ↕ therefore
  perform that swap (each is its own inverse — press twice to undo). The
  multi-pin recipe applied to a 2-pin part canceled out to a visual no-op (the
  second reported bug). Multi-pin parts keep `toggle-mirror + flipRotation` (a
  true geometric vertical reflection — e.g. an NPN's collector/emitter swap
  ends, base stays, rotation→180°).
- Verified (Playwright + units): Mirror **and** Flip on a V flip +/− and the
  netlist order, don't move the part, and leave an attached wire exactly in
  place; multi-pin mirror, multi-pin flip (geometric C/E swap), and
  rotate-attached behavior all unchanged. 515 unit tests green.

Original analysis follows.


especially for components already attached to wires.

## The bug report

A voltage source placed on a horizontal wire ends at **rotation 270°**.
Clicking **Mirror ↔** does nothing. Verified with Playwright (model-level):

| Action | rotation | pin world positions |
|--------|----------|---------------------|
| before | 270° | `(330,315)`, `(290,315)` |
| **Mirror ↔** | 270° | `(330,315)`, `(290,315)` — **unchanged** |
| Rotate | 0° | `(330,315)`, `(330,275)` — works |

So Mirror ↔ is a **complete no-op** here, not just a visual one.

## How the three transforms work today

From `model.ts` + `Editor.tsx`:

- **Rotate** (`rotateNext`): `rotation → (rotation + 90) % 360`. Pins are laid
  out in local space then `rotatePoint`-ed; `transformSelected` moves attached
  wire endpoints to the new pin positions, so **Rotate keeps wires connected**.
- **Mirror ↔** (`mirrorSelected`): toggles a `mirrored` flag. `mirrored` is
  applied by `mirrorPinLayoutIfNeeded` as **`x → -x` in the component's *local*
  frame** (reflection across the local vertical axis), *before* rotation.
- **Flip ↕** (`flipVerticalSelected`): toggles `mirrored` **and** sets
  `rotation → (180 − rotation)`. The comment proves `F = R₁₈₀ ∘ M`, i.e. Flip is
  a reflection across the local *horizontal* axis. **90°/270° are fixed points
  of `(180−r)`, so at those rotations Flip only toggles the mirror flag** — and
  for a 2-pin part that's also a no-op (see below).

### Root cause of the no-op

A 2-pin part's pin layout lies on **one local axis**:

- `V`, `I`, `B`, `C`, `L` (and a vertical `R`): pins at `(0,−2)`, `(0,+2)` — on
  the local **y-axis**.
- A horizontal `R`: pins at `(−2,0)`, `(+2,0)` — on the local **x-axis**.

`mirrored` does `x → −x`. For a part whose pins are on the **y-axis**
(`x = 0`), `x → −x` moves **neither pin** — and the symbol body (a circle for V,
a symmetric zig-zag for R) is itself left-right symmetric. So **Mirror ↔ changes
nothing in the model and nothing on screen**, at *any* rotation. (Rotation just
spins that y-axis around; the pins are still mirror-symmetric across it.)

Mirror ↔ therefore only ever does something for parts with **off-axis or
left/right-asymmetric geometry**: transistors (`NPN/PNP/NMOS/PMOS`, C/B/E or
D/G/S spread sideways), `OPAMP` (+/− input order, OUT side), `D` (anode/cathode),
4-pin MOS, `SUBX` (pin sides). For a plain 2-pin passive/source it's
geometrically meaningless.

## What the user almost certainly wants

For a 2-pin **source** (or diode), the meaningful "↔" operation isn't a
geometric reflection — it's **swap the two terminals' polarity in place**:
reverse +/− on a V/I source, swap anode/cathode on a diode, swap 1/2 on R/C/L
(rarely matters, but harmless). Visually: the **+ and − glyph swap ends** and the
part stays exactly where it is, wires undisturbed. That gives Mirror ↔ a useful,
predictable meaning for the components where it's currently dead.

## Design question — pick the model for Mirror ↔ / Flip ↕ on 2-pin parts

The pins sit on a line, so a true geometric mirror is degenerate. Options:

**T1 — Mirror = swap polarity (recommended).** For a 2-pin part, Mirror ↔ (and
Flip ↕, whichever axis is *along* the pins) **swaps the two pins' roles** —
reverse the +/− (V/I/B), anode/cathode (D), or 1/2 (R/C/L) — leaving position
and rotation untouched and wires attached. The glyph redraws with terminals
swapped. For multi-pin parts, Mirror/Flip keep their current geometric meaning.
*Pro:* makes the button do the one thing a user wants on a source; never a
no-op. *Con:* "Mirror" now means two different things by component class
(geometric reflection for multi-pin, polarity swap for 2-pin) — needs a tooltip.

**T2 — Mirror = reflect across the perpendicular (screen) axis.** Redefine
Mirror to reflect across the axis *perpendicular* to the pins, i.e. actually move
the pins (top pin ↔ bottom pin in world space) and re-attach wires. For a
symmetric body this *looks* like nothing changed but the pin **identities** swap
— effectively the same end result as T1 (polarity swap) but framed
geometrically. *Pro:* one consistent geometric rule. *Con:* for a symmetric
symbol the only visible change is the +/− labels swapping, which can read as "it
moved the pins but the body didn't move" — subtle.

**T3 — Disable Mirror ↔ when it's a no-op.** Detect that Mirror would do nothing
for the current selection and **grey out the button** (with a tooltip: "Mirror
has no effect on a symmetric 2-pin part — use Rotate, or Swap terminals").
Optionally add a separate **"Swap terminals"** action for polarity. *Pro:* honest
— no dead button, no overloaded meaning. *Con:* more UI; doesn't by itself give
the user the polarity-swap they probably want (needs the extra action).

## Wire-attached behavior (applies to all options)

Whatever the chosen semantics, when the component is **attached to wires** the
transform must keep it connected. The existing `transformSelected` already does
this for Rotate (moves wire endpoints to the new pin positions via
`moveWiresToRotatedPins` + `buildRotatedPinContactWires`). The doc's rules:

- **Pins that don't move** (polarity swap / symmetric mirror) → wires stay
  exactly as-is; only pin *identity* (+/−) changes. No wire edits.
- **Pins that move** (Rotate, or a geometric mirror that relocates pins) →
  attached wire endpoints follow the pins (current behavior); if that would
  collide/overlap, the move still applies (transform isn't refused), but this is
  where a future "rotate in place vs. keep-wires-straight" refinement could go.
- **Rotate of a wire-attached 2-pin part** spins it about its center; both wire
  stubs re-route to the rotated pins. (Already works.)

## Implementation sketch (for the chosen option)

- **T1/T2:** add `swapsTerminals`/effective-pin-order handling. The pin **label**
  map (`pinLabelForKind`) already defines +/−, A/K, 1/2; a `terminalsSwapped`
  flag (or reusing `mirrored` but making `mirrorPinLayoutIfNeeded` swap pin
  *order* for on-axis 2-pin parts) makes `getPinLayout` return the two pins in
  swapped order, so netlist emission and labels follow. Net result: a 2-pin
  Mirror reverses polarity.
- **T3:** add `mirrorIsNoOp(component)` (true for on-axis-symmetric 2-pin parts)
  and disable the button + tooltip; add a "Swap terminals" item for 2-pin parts.

## Tests / QA to add

- Unit: Mirror ↔ on a V source swaps + and − (pin-label order flips) and leaves
  `x/y/rotation` unchanged (T1/T2), OR `mirrorIsNoOp("V", …)===true` (T3).
- Unit: Mirror ↔ on an NPN still reflects geometrically (unchanged behavior).
- Pixel: place V on a horizontal wire (rotation 270°), Mirror ↔ → the + / −
  glyph ends swap, wires stay attached, component doesn't move.
- Pixel: Rotate a wire-attached part → stays connected (regression).
