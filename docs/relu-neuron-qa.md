# Analog ReLU Neuron QA

Date: 2026-05-24

## Circuit Under Test

Reusable schematic page: `relu_nmos4_cell`

Primitive ReLU stage:

```spice
.subckt relu_nmos4_cell vdd u h vss
M1 vdd u h vss NMOS_LEVEL1_FAST L=2u W=8u
R1 h vss 220k
C1 h vss 100p
.ends relu_nmos4_cell
```

The block is an NMOS source follower with passive pull-down/load. It approximates:

```text
h ~= max(0, u - Vth)
```

The block uses the explicit-bulk `NMOS4` symbol, so the source-follower bulk is intentionally wired to `vss` instead of being silently tied to source.

## Browser Tests

Tested in the app at `http://127.0.0.1:5175/` using the WASM `ngspice-46` engine.

### Transient

Input:

```spice
V1 u 0 SIN(0.8 1.2 1k)
```

Observed in the waveform viewer:

```text
u input:        2.400 V pp
h ReLU output: 935.259 mV pp
```

The output stayed near zero through the low half of the input and rose during the positive/high-input portion.

### DC Transfer

Sweep:

```text
V1: -0.5 V to 2.2 V, step 0.02 V
```

Observed in the waveform viewer:

```text
at u = 2.200 V, h = 1.095 V
```

### X/Y Plot

The X/Y plot used:

```text
X: u input
Y: h ReLU output
```

Observed:

```text
136 paired samples
last point: X 2.200 V, Y 1.095 V
```

## Frictions Found

1. Shared URL loading dropped `simSettings`, so a circuit with `method=gear` and solver tolerances lost those settings after reload.

   Fixed by moving document normalization into `src/editor/docNormalize.ts` and preserving `simSettings` for both current and legacy documents.

2. Net labels could silently attach when a wire was routed through the label anchor. This caused an early ReLU harness attempt to short `vdd` onto the input net.

   Fixed by adding connected/unconnected visual states for net label anchors. Connected labels now show a solid junction-style anchor; unconnected labels show a dashed/hollow anchor and dashed stem/chip styling.

3. The visual editor previously could build the first ReLU activation block, but not represent the full trainable ReLU cell cleanly because MOS bulk connections were implicit.

   Fixed by adding `NMOS4` and `PMOS4` variants. They share the existing MOS model/preset system, expose `D/G/S/B` pins, import from netlists with non-source body nodes, and netlist as four-terminal SPICE `M` devices.

4. The first four-terminal harness had a ground wire stopping short of the `vss` ground pin. The symptom was `V(vss)` appearing as a nonzero waveform. This was a good reminder that the app now exposes enough label connection state to catch these mistakes visually, but small off-grid-looking gaps are still easy to miss when generated or imported layouts are dense.

5. The first PMOS-pull-up neuron attempt looked physically wrong because several passive label anchors were visually near their pins, but not exactly snapped to them. The generated netlist warned that the pull-up gate resistor, integration capacitors, and load parts were floating. Once the label coordinates were corrected to the exact passive pin coordinates, the warnings disappeared and the waveform changed completely.

## PMOS Pull-Up Iteration

The next physical topology replaced the weak NMOS pull-up path with:

```text
x/wp NMOS stack -> pulls pctrl low
pctrl -> PMOS pull-up into u
x/wm NMOS stack -> pulls u down
u capacitor + vref bias -> continuous-time state
NMOS source follower -> h output
```

Balanced test settings:

```text
Vx  = SIN(1.0 1.0 1k)
wp  = 1.35 V
wm  = 1.05 V
vref = 0.45 V
```

Observed in the waveform viewer:

```text
x input:         2.000 V pp
u preactivation: 3.234 V pp
h output:        2.083 V pp
```

Weight contrast checks:

```text
wp = 2.0 V, wm = 0.7 V:
  u preactivation: 2.848 V pp, high-biased around 3.277 V
  h output:        2.135 V pp, active

wp = 0.7 V, wm = 2.0 V:
  u preactivation: 450.309 mV pp, below ReLU threshold
  h output:        0 V pp, off
```

Conclusion: the PMOS pull-up / NMOS pull-down structure is the better real-device neuron core. It has enough headroom to cross the ReLU threshold, and the split weight rails now visibly control whether the activation is active or suppressed.

## Verification Commands

```sh
npm run build
npm run lint
npm test
```

Last verified result: all three passed; test suite reported 232 passing tests.
