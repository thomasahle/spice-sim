import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_FLOW_SAMPLE_SOURCES,
  LIVE_FLOW_MIN_ABSOLUTE_CURRENT,
  LIVE_FLOW_MIN_MAGNITUDE,
  formatLiveFlowCurrent,
  liveFlowAbsoluteIntensity,
  liveFlowAnimationStyle,
  liveFlowCurrentTraceCandidates,
  isLiveFlowSampleSource,
  liveFlowReadoutArrow,
  liveFlowReadoutBounds,
  liveFlowPhaseForId,
  liveFlowReadoutPosition,
  liveFlowReadoutSourceClass,
  liveFlowReadoutText,
  liveFlowReadoutWidth,
  liveFlowRequiresTerminalCurrent,
  liveFlowStatus,
  liveFlowTerminalCurrentTraceCandidates,
  liveFlowVisual,
  liveFlowVisualFromSignedCurrent,
  liveFlowVisualFromSample,
  liveFlowWireHasVisibleLength,
  liveFlowWireObstacleBounds,
  normalizeLiveFlowSamples,
  wireFlowAttachmentForPoint,
  wireFlowSampleFromCandidates,
  wireFlowSignedCurrentAlongPolyline,
  wireFlowSignedCurrent,
} from "../src/editor/liveFlow.ts";
import { componentLiveFlowPaths } from "../src/editor/componentLiveFlowPaths.ts";

function nearlyEqual(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} !== ${expected}`);
}

test("liveFlowVisual keeps unknown and zero-current wires inactive", () => {
  assert.equal(liveFlowVisual(undefined).active, false);
  assert.equal(liveFlowVisual(Number.NaN).active, false);
  assert.equal(liveFlowVisual(0).active, false);
  assert.equal(liveFlowVisual(LIVE_FLOW_MIN_MAGNITUDE / 2).active, false);
});

test("liveFlowVisual activates meaningful current samples", () => {
  const visual = liveFlowVisual(0.5);

  assert.equal(visual.active, true);
  assert.equal(visual.magnitude, 0.5);
  nearlyEqual(visual.opacity, 0.22 + 0.62 * Math.sqrt(0.5));
  nearlyEqual(visual.durationSeconds, 0.95 - 0.68 * Math.sqrt(0.5));
  nearlyEqual(visual.strokeMultiplier, 1.332842712474619);
  nearlyEqual(visual.dash, 0.1965685424949238);
  nearlyEqual(visual.gap, 0.4292893218813453);
});

test("liveFlowVisual clamps bad magnitudes into the display range", () => {
  assert.equal(liveFlowVisual(-5).magnitude, 0);

  const visual = liveFlowVisual(5);
  assert.equal(visual.active, true);
  assert.equal(visual.magnitude, 1);
  assert.equal(visual.opacity, 0.84);
  nearlyEqual(visual.durationSeconds, 0.27);
});

test("liveFlowVisual suppresses numerical-noise currents", () => {
  assert.equal(liveFlowVisual(1, LIVE_FLOW_MIN_ABSOLUTE_CURRENT / 2).active, false);
  assert.equal(liveFlowVisual(1, LIVE_FLOW_MIN_ABSOLUTE_CURRENT * 2).active, true);
  assert.equal(
    liveFlowVisualFromSample({
      signedCurrent: LIVE_FLOW_MIN_ABSOLUTE_CURRENT / 2,
      normalizedCurrent: 1,
      source: "ngspice",
    }).active,
    false,
  );
});

test("liveFlowVisualFromSample requires explicit ngspice provenance", () => {
  assert.equal(
    liveFlowVisualFromSample({
      signedCurrent: 1e-3,
      normalizedCurrent: 1,
    }).active,
    false,
  );
  assert.equal(
    liveFlowVisualFromSample({
      signedCurrent: 1e-3,
      normalizedCurrent: 1,
      source: "ngspice",
    }).active,
    true,
  );
});

test("Live Flow exposes ngspice as the only animating current provenance", () => {
  assert.deepEqual(LIVE_FLOW_SAMPLE_SOURCES, ["ngspice"]);
  assert.equal(isLiveFlowSampleSource("ngspice"), true);
  assert.equal(isLiveFlowSampleSource("estimated"), false);
  assert.equal(isLiveFlowSampleSource(undefined), false);
});

test("source flow animates only the lead stubs, leaving the body glyphs untouched", () => {
  for (const kind of ["V", "I", "B"] as const) {
    const paths = componentLiveFlowPaths({
      id: kind.toLowerCase(),
      kind,
      x: 0,
      y: 0,
      rotation: 0,
      value: kind === "V" ? "PULSE(0 5)" : "",
    });

    // Pin (±2) to circle edge (±1.2) — nothing inside the body, so dashes
    // never interleave with the +/− glyphs, and nothing follows the outline.
    assert.deepEqual(paths, [
      "M 0 -2 L 0 -1.2",
      "M 0 1.2 L 0 2",
    ]);
    assert.ok(paths.every((path) => !/[ACQ]/.test(path)), `${kind} flow should not animate around the circle`);
  }
});

test("ground flow animates only the lead between pin and top bar", () => {
  const paths = componentLiveFlowPaths({
    id: "g1",
    kind: "GND",
    x: 0,
    y: 0,
    rotation: 0,
    value: "",
  });
  // Pin at y=0, top bar at y=0.5 (symbols.tsx) — no bars, no marks above
  // the pin.
  assert.deepEqual(paths, ["M 0 0 L 0 0.5"]);
});

test("liveFlowVisual damps tiny visible currents instead of rendering them full strength", () => {
  const low = liveFlowVisual(1, LIVE_FLOW_MIN_ABSOLUTE_CURRENT * 2);
  const strong = liveFlowVisual(1, 1e-3);

  assert.equal(low.active, true);
  assert.equal(strong.active, true);
  assert.ok(low.opacity < strong.opacity, `${low.opacity} should be lower than ${strong.opacity}`);
  assert.ok(low.durationSeconds > strong.durationSeconds);
  assert.ok(low.strokeMultiplier < strong.strokeMultiplier);
});

test("liveFlowVisual keeps meaningful absolute currents visible beside larger branches", () => {
  const oneMicroampBesideLargeBranch = liveFlowVisual(0.001, 1e-6);
  const onePicoampBesideLargeBranch = liveFlowVisual(0.001, 1e-12);

  assert.equal(oneMicroampBesideLargeBranch.active, true);
  assert.ok(oneMicroampBesideLargeBranch.magnitude > LIVE_FLOW_MIN_MAGNITUDE);
  assert.equal(onePicoampBesideLargeBranch.active, false);
});

test("normalizeLiveFlowSamples can share a scale with existing wire samples", () => {
  const normalized = normalizeLiveFlowSamples(
    new Map([
      ["component-body", { current: 2e-6, source: "ngspice" }],
    ]),
    [10e-6],
  );

  assert.equal(normalized.get("component-body")?.signedCurrent, 2e-6);
  assert.equal(normalized.get("component-body")?.source, "ngspice");
  nearlyEqual(normalized.get("component-body")?.normalizedCurrent ?? Number.NaN, 0.2);
});

test("normalizeLiveFlowSamples ignores non-finite raw currents when scaling", () => {
  const normalized = normalizeLiveFlowSamples(
    new Map([
      ["bad", { current: Number.NaN, source: "ngspice" }],
      ["good", { current: -4e-6, source: "ngspice" }],
    ]),
    [Number.POSITIVE_INFINITY, 8e-6],
  );

  assert.equal(normalized.has("bad"), false);
  assert.equal(normalized.get("good")?.signedCurrent, -4e-6);
  nearlyEqual(normalized.get("good")?.normalizedCurrent ?? Number.NaN, -0.5);
});

test("normalizeLiveFlowSamples rejects non-ngspice provenance at runtime", () => {
  const normalized = normalizeLiveFlowSamples(
    new Map([
      ["fallback", { current: 1e-3, source: "estimated" }],
      ["missing", { current: 2e-3 }],
      ["good", { current: 4e-3, source: "ngspice" }],
    ]),
  );

  assert.equal(normalized.has("fallback"), false);
  assert.equal(normalized.has("missing"), false);
  assert.equal(normalized.get("good")?.source, "ngspice");
  assert.equal(normalized.get("good")?.signedCurrent, 4e-3);
  nearlyEqual(normalized.get("good")?.normalizedCurrent ?? Number.NaN, 1);
});

test("liveFlowAbsoluteIntensity maps current magnitude logarithmically", () => {
  assert.equal(liveFlowAbsoluteIntensity(0), 0);
  assert.equal(liveFlowAbsoluteIntensity(LIVE_FLOW_MIN_ABSOLUTE_CURRENT), 0);
  assert.equal(liveFlowAbsoluteIntensity(1e-3), 1);
  nearlyEqual(liveFlowAbsoluteIntensity(1e-6), 0.4);
});

test("liveFlowVisualFromSignedCurrent preserves direction while using magnitude", () => {
  const positive = liveFlowVisualFromSignedCurrent(0.4);
  assert.equal(positive.active, true);
  assert.equal(positive.direction, 1);
  assert.equal(positive.magnitude, 0.4);

  const negative = liveFlowVisualFromSignedCurrent(-0.4);
  assert.equal(negative.active, true);
  assert.equal(negative.direction, -1);
  assert.equal(negative.magnitude, 0.4);
});

test("liveFlowPhaseForId gives stable per-wire animation offsets", () => {
  assert.equal(liveFlowPhaseForId("w1"), liveFlowPhaseForId("w1"));
  assert.notEqual(liveFlowPhaseForId("w1"), liveFlowPhaseForId("w2"));
  assert.ok(liveFlowPhaseForId("w1") >= 0);
  assert.ok(liveFlowPhaseForId("w1") < 0.72);
});

test("liveFlowAnimationStyle emits unitless SVG lengths for animatable dash offsets", () => {
  const flow = liveFlowVisualFromSignedCurrent(0.75, 1e-3);
  const style = liveFlowAnimationStyle(flow, 0.238);

  assert.match(style["--flow-duration"], /s$/);
  assert.doesNotMatch(style["--flow-cycle"], /px$/);
  assert.doesNotMatch(style["--flow-dash"], /px$/);
  assert.doesNotMatch(style["--flow-gap"], /px$/);
  assert.doesNotMatch(style["--flow-offset"], /px$/);
  assert.ok(parseFloat(style["--flow-duration"]) > 0);
  assert.ok(parseFloat(style["--flow-cycle"]) > 0);
  assert.ok(parseFloat(style["--flow-dash"]) > 0);
  assert.ok(parseFloat(style["--flow-gap"]) > 0);
  assert.equal(parseFloat(style["--flow-offset"]), 0.238);
  assert.ok(parseFloat(style["--flow-cycle"]) > parseFloat(style["--flow-dash"]));
  assert.equal(style.opacity, flow.opacity);
});

test("formatLiveFlowCurrent keeps hover and status readouts compact", () => {
  assert.equal(formatLiveFlowCurrent(undefined), "unknown current");
  assert.equal(formatLiveFlowCurrent(0), "0 A");
  assert.equal(formatLiveFlowCurrent(1.25e-3), "1.25 mA");
  assert.equal(formatLiveFlowCurrent(1.25e-6), "1.25 µA");
  assert.equal(formatLiveFlowCurrent(-4.2e-9), "-4.20 nA");
  assert.equal(formatLiveFlowCurrent(4.89e-22), "<1.00 fA");
  assert.equal(formatLiveFlowCurrent(-4.89e-22), "<1.00 fA");
});

test("liveFlowReadoutText avoids directional arrows when flow is below threshold", () => {
  assert.deepEqual(liveFlowReadoutText(undefined, false), {
    label: "No ngspice sample",
    detail: null,
    title: "No ngspice current-vector sample is available for this wire at the selected transient time.",
    showArrow: false,
  });
  assert.deepEqual(liveFlowReadoutText({
    signedCurrent: 1e-3,
    normalizedCurrent: 1,
  }, true), {
    label: "No ngspice sample",
    detail: null,
    title: "No ngspice current-vector sample is available for this wire at the selected transient time.",
    showArrow: false,
  });

  const inactive = liveFlowReadoutText({
    signedCurrent: 9e-9,
    normalizedCurrent: 0.9,
    source: "ngspice",
  }, false);
  assert.equal(inactive.label, "9.00 nA");
  assert.equal(inactive.detail, "ngspice · low");
  assert.equal(inactive.showArrow, false);
  assert.match(inactive.title, /below the 10\.0 nA display threshold/);
  assert.match(inactive.title, /sampled from ngspice current vectors/);

  const activeNgspice = liveFlowReadoutText({
    signedCurrent: 1.5e-3,
    normalizedCurrent: 0.8,
    source: "ngspice",
  }, true);
  assert.equal(activeNgspice.label, "1.50 mA");
  assert.equal(activeNgspice.detail, "ngspice");
  assert.match(activeNgspice.title, /sampled from ngspice current vectors/);
});

test("liveFlowReadoutSourceClass distinguishes unsampled and ngspice current vectors", () => {
  assert.equal(liveFlowReadoutSourceClass(undefined), "unsampled");
  assert.equal(liveFlowReadoutSourceClass({ source: "ngspice" }), "ngspice");
});

test("liveFlowReadoutWidth keeps active current chips compact", () => {
  const ngspice = liveFlowReadoutText({
    signedCurrent: 5e-3,
    normalizedCurrent: 1,
    source: "ngspice",
  }, true);
  const inactive = liveFlowReadoutText({
    signedCurrent: 9e-9,
    normalizedCurrent: 0.9,
    source: "ngspice",
  }, false);

  assert.ok(liveFlowReadoutWidth(ngspice) >= 2);
  assert.ok(liveFlowReadoutWidth(ngspice) <= 3.8);
  assert.ok(liveFlowReadoutWidth(inactive) >= 3);
  assert.ok(liveFlowReadoutWidth({
    label: "123456789012345678901234567890",
    detail: "· ngspice",
    title: "",
    showArrow: true,
  }) <= 4.8);
});

test("liveFlowWireHasVisibleLength ignores degenerate wire artifacts", () => {
  assert.equal(liveFlowWireHasVisibleLength([]), false);
  assert.equal(liveFlowWireHasVisibleLength([[1, 2]]), false);
  assert.equal(liveFlowWireHasVisibleLength([[1, 2], [1, 2]]), false);
  assert.equal(liveFlowWireHasVisibleLength([[1, 2], [1, 2], [1.0000001, 2]]), false);
  assert.equal(liveFlowWireHasVisibleLength([[1, 2], [1.01, 2]]), true);
});

test("wireFlowSignedCurrent maps two-terminal branch current onto lead direction", () => {
  assert.equal(wireFlowSignedCurrent(2, 0, 2), -2);
  assert.equal(wireFlowSignedCurrent(2, 1, 2), 2);
  assert.equal(wireFlowSignedCurrent(-2, 0, 2), 2);
});

test("wireFlowSignedCurrent keeps transistor control pins quiet", () => {
  assert.equal(wireFlowSignedCurrent(2, 0, 3), -2);
  assert.equal(wireFlowSignedCurrent(2, 1, 3), null);
  assert.equal(wireFlowSignedCurrent(2, 2, 3), 2);
  assert.equal(wireFlowSignedCurrent(2, 3, 4), null);
});

test("wireFlowSignedCurrentAlongPolyline is independent of wire point order", () => {
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 0, 2, true), -2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 0, 2, false), 2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 1, 2, true), 2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 1, 2, false), -2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 1, 3, true), null);
});

test("wireFlowSignedCurrentAlongPolyline maps terminal currents into wire direction", () => {
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 0, 3, true, "terminal"), -2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(2, 0, 3, false, "terminal"), 2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(-2, 2, 3, true, "terminal"), 2);
  assert.equal(wireFlowSignedCurrentAlongPolyline(Number.NaN, 0, 3, true, "terminal"), null);
});

test("wireFlowSampleFromCandidates ignores unusable pins and uses nearest simulator current", () => {
  assert.deepEqual(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 4,
        source: "ngspice",
        attachedPinIndex: 1,
        pinCount: 3,
        attachedAtStart: true,
        distance: 0,
      },
      {
        componentCurrent: 2,
        source: "ngspice",
        attachedPinIndex: 0,
        pinCount: 2,
        attachedAtStart: true,
        distance: 0.02,
      },
    ]),
    { signedCurrent: -2, source: "ngspice", distance: 0.02 },
  );

  assert.deepEqual(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 2,
        source: "ngspice",
        attachedPinIndex: 0,
        pinCount: 2,
        attachedAtStart: true,
        distance: 0.02,
      },
      {
        componentCurrent: 3,
        source: "ngspice",
        attachedPinIndex: 1,
        pinCount: 2,
        attachedAtStart: true,
        distance: 0,
      },
    ]),
    { signedCurrent: 3, source: "ngspice", distance: 0 },
  );
});

test("wireFlowSampleFromCandidates prefers real terminal current on active-device pins", () => {
  assert.deepEqual(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 5,
        source: "ngspice",
        attachedPinIndex: 2,
        pinCount: 3,
        attachedAtStart: true,
        distance: 0.02,
      },
      {
        componentCurrent: -4.8,
        source: "ngspice",
        attachedPinIndex: 2,
        pinCount: 3,
        attachedAtStart: true,
        distance: 0,
        currentKind: "terminal",
      },
    ]),
    { signedCurrent: 4.8, source: "ngspice", distance: 0 },
  );
});

test("wireFlowSampleFromCandidates allows explicit ngspice gate terminal currents", () => {
  assert.deepEqual(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 0.25,
        source: "ngspice",
        attachedPinIndex: 1,
        pinCount: 3,
        attachedAtStart: false,
        distance: 0,
        currentKind: "terminal",
      },
    ]),
    { signedCurrent: 0.25, source: "ngspice", distance: 0 },
  );

  assert.equal(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 0.25,
        source: "ngspice",
        attachedPinIndex: 1,
        pinCount: 3,
        attachedAtStart: false,
        distance: 0,
      },
    ]),
    null,
  );
});

test("liveFlowCurrentTraceCandidates includes device-specific ngspice currents first", () => {
  assert.deepEqual(liveFlowCurrentTraceCandidates("R", "R1"), [
    "i(@r1[i])",
    "@r1[i]",
    "r1#branch",
    "i(r1)",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("I", "I1").slice(0, 2), [
    "i(@i1[current])",
    "@i1[current]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("NMOS", "M1").slice(0, 2), [
    "i(@m1[id])",
    "@m1[id]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("NMOS", "M1").slice(2, 4), [
    "i(@m1[is])",
    "@m1[is]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("NPN", "Q1").slice(0, 6), [
    "i(@q1[ic])",
    "@q1[ic]",
    "i(@q1[ie])",
    "@q1[ie]",
    "i(@q1[ib])",
    "@q1[ib]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("D", "D1").slice(0, 2), [
    "i(@d1[id])",
    "@d1[id]",
  ]);
});

test("liveFlowTerminalCurrentTraceCandidates maps active-device pins to ngspice terminal vectors", () => {
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("NMOS", "M1", 0), [
    "i(@m1[id])",
    "@m1[id]",
  ]);
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("NMOS", "M1", 1), [
    "i(@m1[ig])",
    "@m1[ig]",
  ]);
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("NMOS", "M1", 2), [
    "i(@m1[is])",
    "@m1[is]",
  ]);
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("NPN", "Q1", 1), [
    "i(@q1[ib])",
    "@q1[ib]",
  ]);
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("PMOS4", "M2", 3), [
    "i(@m2[ib])",
    "@m2[ib]",
  ]);
  assert.deepEqual(liveFlowTerminalCurrentTraceCandidates("R", "R1", 0), []);
});

test("Live Flow requires terminal-specific currents for active devices", () => {
  for (const kind of ["NPN", "PNP", "NMOS", "PMOS", "NMOS4", "PMOS4", "OPAMP"]) {
    assert.equal(liveFlowRequiresTerminalCurrent(kind), true, kind);
  }
  for (const kind of ["R", "C", "L", "D", "V", "I", "B", "SUBX"]) {
    assert.equal(liveFlowRequiresTerminalCurrent(kind), false, kind);
  }
});

test("wireFlowAttachmentForPoint detects pins on wire endpoints and bodies", () => {
  const horizontal: [number, number][] = [[0, 0], [10, 0]];

  assert.equal(
    wireFlowAttachmentForPoint(horizontal, { x: 0.2, y: 0 })?.attachedAtStart,
    true,
  );
  assert.equal(
    wireFlowAttachmentForPoint(horizontal, { x: 9.8, y: 0 })?.attachedAtStart,
    false,
  );
  assert.equal(
    wireFlowAttachmentForPoint(horizontal, { x: 2, y: 0 })?.attachedAtStart,
    true,
  );
  assert.equal(
    wireFlowAttachmentForPoint(horizontal, { x: 8, y: 0 })?.attachedAtStart,
    false,
  );
});

test("wireFlowAttachmentForPoint rejects near misses on wire bodies", () => {
  const horizontal: [number, number][] = [[0, 0], [10, 0]];

  assert.equal(wireFlowAttachmentForPoint(horizontal, { x: 5, y: 0.2 }), null);
});

test("wireFlowAttachmentForPoint uses path distance on bent wires", () => {
  const bent: [number, number][] = [[0, 0], [0, 5], [5, 5]];

  assert.equal(wireFlowAttachmentForPoint(bent, { x: 0, y: 4 })?.attachedAtStart, true);
  assert.equal(wireFlowAttachmentForPoint(bent, { x: 4, y: 5 })?.attachedAtStart, false);
});

test("liveFlowReadoutPosition places labels on stable straight segments", () => {
  assert.deepEqual(liveFlowReadoutPosition([[0, 0], [10, 0]]), {
    x: 5,
    y: -0.38,
    dx: 1,
    dy: 0,
  });
  assert.deepEqual(liveFlowReadoutPosition([[0, 0], [0, 10]]), {
    x: 0.38,
    y: 5,
    dx: 0,
    dy: 1,
  });
  {
    const diagonal = liveFlowReadoutPosition([[0, 0], [4, 4]]);
    assert.ok(diagonal);
    assert.ok(diagonal.x > 2, `expected diagonal readout to shift off the wire: ${diagonal.x}`);
    assert.ok(diagonal.y < 2, `expected diagonal readout to shift off the wire: ${diagonal.y}`);
    assert.ok(
      Math.abs((diagonal.x - 2) + (diagonal.y - 2)) < 1e-8,
      "diagonal readout should move along the segment normal",
    );
  }
  assert.deepEqual(liveFlowReadoutPosition([[0, 0], [0, 4], [4, 4]]), {
    x: 0.38,
    y: 2,
    dx: 0,
    dy: 1,
  });
  assert.deepEqual(liveFlowReadoutPosition([[0, 0], [0, 2], [8, 2], [8, 5]]), {
    x: 4,
    y: 1.62,
    dx: 1,
    dy: 0,
  });
  assert.equal(liveFlowReadoutPosition([]), null);
  assert.equal(liveFlowReadoutPosition([[2, 3], [2, 3]]), null);
});

test("liveFlowReadoutPosition avoids component obstacles when possible", () => {
  assert.deepEqual(
    liveFlowReadoutPosition([[0, 0], [10, 0]], 0.38, {
      width: 2,
      height: 0.64,
      obstacles: [{ x1: 4, y1: -0.8, x2: 6, y2: -0.1 }],
    }),
    {
      x: 5,
      y: 0.38,
      dx: 1,
      dy: 0,
    },
  );

  const shifted = liveFlowReadoutPosition([[0, 0], [10, 0]], 0.38, {
    width: 2,
    height: 0.64,
    obstacles: [
      { x1: 4, y1: -0.8, x2: 6, y2: 0.1 },
      { x1: 4, y1: 0, x2: 6, y2: 0.8 },
    ],
  });
  assert.ok(shifted);
  assert.equal(shifted.y, -0.38);
  assert.notEqual(shifted.x, 5);
});

test("liveFlowReadoutPosition can use previous readouts as obstacles", () => {
  const first = liveFlowReadoutPosition([[0, 0], [10, 0]], 0.38, {
    width: 2.2,
    height: 0.64,
  });
  assert.ok(first);
  const second = liveFlowReadoutPosition([[0, 0], [10, 0]], 0.38, {
    width: 2.2,
    height: 0.64,
    obstacles: [liveFlowReadoutBounds(first.x, first.y, 2.2, 0.64)],
  });
  assert.ok(second);
  assert.notDeepEqual(second, first);
});

test("liveFlowWireObstacleBounds creates padded bounds for visible wire segments", () => {
  assert.deepEqual(liveFlowWireObstacleBounds([[0, 0], [0, 0], [2, 0]], 0.1), [
    { x1: -0.1, y1: -0.1, x2: 2.1, y2: 0.1 },
  ]);
  assert.deepEqual(liveFlowWireObstacleBounds([[1, 1]], 0.1), []);
});

test("liveFlowReadoutPosition avoids unrelated wire segment obstacles", () => {
  assert.deepEqual(
    liveFlowReadoutPosition([[0, 0], [10, 0]], 0.38, {
      width: 2,
      height: 0.64,
      obstacles: liveFlowWireObstacleBounds([[3, -0.38], [7, -0.38]], 0.14),
    }),
    {
      x: 5,
      y: 0.38,
      dx: 1,
      dy: 0,
    },
  );
});

test("liveFlowReadoutArrow follows the actual wire tangent and flow direction", () => {
  assert.equal(liveFlowReadoutArrow({ dx: 1, dy: 0 }, 1), "→");
  assert.equal(liveFlowReadoutArrow({ dx: 1, dy: 0 }, -1), "←");
  assert.equal(liveFlowReadoutArrow({ dx: 0, dy: 1 }, 1), "↓");
  assert.equal(liveFlowReadoutArrow({ dx: 0, dy: 1 }, -1), "↑");
  assert.equal(liveFlowReadoutArrow({ dx: -0.2, dy: -0.8 }, 1), "↑");
});

test("liveFlowStatus explains unavailable and active states", () => {
  assert.equal(
    liveFlowStatus({
      enabled: false,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 2,
      sampledWireCount: 2,
    }).show,
    false,
  );

  assert.equal(
    liveFlowStatus({
      enabled: true,
      hasResult: false,
      analysisKind: "tran",
      isTransient: false,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    }).label,
    "Run transient",
  );

  assert.equal(
    liveFlowStatus({
      enabled: true,
      hasResult: false,
      analysisKind: "tran",
      isTransient: false,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    }).show,
    true,
  );

  {
    const status = liveFlowStatus({
      enabled: true,
      hasResult: false,
      analysisKind: "op",
      isTransient: false,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    });
    assert.equal(status.label, "Needs transient");
    assert.equal(status.show, false);
    assert.equal(status.tone, "muted");
    assert.match(status.title, /Switch analysis to transient/);
  }

  {
    const status = liveFlowStatus({
      enabled: true,
      hasResult: true,
      isTransient: false,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    });
    assert.equal(status.label, "Needs transient");
    assert.equal(status.show, false);
    assert.equal(status.tone, "muted");
  }

  assert.equal(
    liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: true,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    }).label,
    "Run needed",
  );

  {
    const status = liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      visibleWireCount: 5,
      activeWireCount: 0,
      sampledWireCount: 0,
    });
    assert.equal(status.label, "No ngspice");
    assert.equal(status.title, "No ngspice current-vector samples were found for the visible wires. 0 of 5 visible wires are animating. 5 visible wires have no ngspice current-vector sample. Live Flow only animates wires with ngspice current vectors.");
  }

  {
    const status = liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      visibleWireCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    });
    assert.equal(status.label, "No wires");
    assert.equal(status.tone, "muted");
    assert.equal(status.title, "The transient result is ready, but there are no visible wires to animate. Draw or connect wires, then run again.");
  }

  assert.equal(
    liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 2,
      sampledWireCount: 4,
      ngspiceWireCount: 2,
      strongestCurrent: 2.5e-6,
    }).label,
    "2/4 ngspice · 2.50 µA",
  );

  assert.match(
    (function () {
      const status = liveFlowStatus({
        enabled: true,
        isTransient: true,
        simulationStale: false,
        floatingPinCount: 0,
        activeWireCount: 2,
        sampledWireCount: 4,
        ngspiceWireCount: 2,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/4 ngspice · 2.50 µA");
    assert.equal(status.source, "ngspice");
    return status;
  })().title,
    /2 of 4 visible wires are animating.*2 sampled wires are below.*2\.50 µA.*Animating streams: 2 ngspice current vectors.*Sampled wires: 4 ngspice current vectors.*only animates wires with ngspice current vectors/,
  );

  assert.match(
    (function () {
      const status = liveFlowStatus({
        enabled: true,
        isTransient: true,
        simulationStale: false,
        floatingPinCount: 0,
        activeWireCount: 2,
        sampledWireCount: 4,
        ngspiceWireCount: 2,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/4 ngspice · 2.50 µA");
    assert.equal(status.source, "ngspice");
    return status;
  })().title,
    /2 of 4 visible wires are animating.*2 sampled wires are below.*Animating streams: 2 ngspice current vectors.*Sampled wires: 4 ngspice current vectors.*ngspice current vectors/,
  );

  assert.match(
    (function () {
      const status = liveFlowStatus({
        enabled: true,
        isTransient: true,
        simulationStale: false,
        floatingPinCount: 0,
        activeWireCount: 2,
        sampledWireCount: 2,
        ngspiceWireCount: 2,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2 ngspice · 2.50 µA");
    assert.equal(status.source, "ngspice");
    return status;
  })().title,
    /All 2 visible wires are animating.*Animating streams: 2 ngspice current vectors.*ngspice current vectors/,
  );

  {
    const status = liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      visibleWireCount: 6,
      activeWireCount: 2,
      sampledWireCount: 4,
      ngspiceWireCount: 2,
      strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/6 ngspice · 2.50 µA");
    assert.equal(status.source, "ngspice");
    assert.match(status.title, /2 of 6 visible wires are animating/);
    assert.match(status.title, /2 visible wires have no ngspice current-vector sample/);
    assert.match(status.title, /2 sampled wires are below the display threshold/);
    assert.match(status.title, /Animating streams: 2 ngspice current vectors/);
  }

  assert.match(
    liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 4,
      strongestCurrent: -9e-9,
    }).title,
    /10\.0 nA display threshold/,
  );

  assert.equal(
    liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 4,
      strongestCurrent: -9e-9,
    }).label,
    "Below range · 9.00 nA",
  );

  const tinyNoFlow = liveFlowStatus({
    enabled: true,
    isTransient: true,
    simulationStale: false,
    floatingPinCount: 0,
    activeWireCount: 0,
    sampledWireCount: 4,
    strongestCurrent: 4.89e-22,
  });
  assert.equal(tinyNoFlow.label, "No flow now");
  assert.equal(tinyNoFlow.source, "ngspice");
  assert.match(tinyNoFlow.title, /below 1\.00 pA/);
  assert.match(tinyNoFlow.title, /Sampled wires: 4 ngspice current vectors/);

  {
    const status = liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      visibleWireCount: 4,
      activeWireCount: 2,
      sampledWireCount: 4,
      strongestCurrent: 2.5e-6,
    });
    assert.equal(status.source, "ngspice");
    assert.match(status.title, /Animating streams: 2 ngspice current vectors/);
    assert.doesNotMatch(status.title, /No ngspice current-vector coverage is available/);
  }
});
