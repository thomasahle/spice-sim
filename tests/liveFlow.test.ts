import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_FLOW_MIN_ABSOLUTE_CURRENT,
  LIVE_FLOW_MIN_MAGNITUDE,
  estimatePassiveLiveFlowCurrent,
  formatLiveFlowCurrent,
  liveFlowAbsoluteIntensity,
  liveFlowCurrentTraceCandidates,
  liveFlowReadoutArrow,
  liveFlowReadoutBounds,
  liveFlowPhaseForId,
  liveFlowReadoutPosition,
  liveFlowReadoutSourceClass,
  liveFlowReadoutText,
  liveFlowReadoutWidth,
  liveFlowStatus,
  liveFlowVisual,
  liveFlowVisualFromSignedCurrent,
  liveFlowVisualFromSample,
  liveFlowWireHasVisibleLength,
  wireFlowAttachmentForPoint,
  wireFlowSampleFromCandidates,
  wireFlowSignedCurrentAlongPolyline,
  wireFlowSignedCurrent,
} from "../src/editor/liveFlow.ts";

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
    }).active,
    false,
  );
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
    label: "Not sampled",
    detail: null,
    title: "No branch-current or passive-estimate sample is available for this wire at the selected transient time.",
    showArrow: false,
  });

  const inactive = liveFlowReadoutText({
    signedCurrent: 9e-9,
    normalizedCurrent: 0.9,
    source: "ngspice",
  }, false);
  assert.equal(inactive.label, "9.00 nA");
  assert.equal(inactive.detail, "below range");
  assert.equal(inactive.showArrow, false);
  assert.match(inactive.title, /below the 10\.0 nA display threshold/);
  assert.match(inactive.title, /measured from simulated branch current/);

  const activeEstimated = liveFlowReadoutText({
    signedCurrent: -2e-6,
    normalizedCurrent: -0.2,
    source: "estimated",
  }, true);
  assert.equal(activeEstimated.label, "-2.00 µA");
  assert.equal(activeEstimated.detail, null);
  assert.equal(activeEstimated.showArrow, true);
  assert.match(activeEstimated.title, /estimated from node voltages/);

  const activeMeasured = liveFlowReadoutText({
    signedCurrent: 1.5e-3,
    normalizedCurrent: 0.8,
    source: "ngspice",
  }, true);
  assert.equal(activeMeasured.label, "1.50 mA");
  assert.equal(activeMeasured.detail, null);
  assert.match(activeMeasured.title, /measured from simulated branch current/);
});

test("liveFlowReadoutSourceClass distinguishes missing, measured, and estimated data", () => {
  assert.equal(liveFlowReadoutSourceClass(undefined), "missing");
  assert.equal(liveFlowReadoutSourceClass({ source: "ngspice" }), "measured");
  assert.equal(liveFlowReadoutSourceClass({ source: "estimated" }), "estimated");
});

test("liveFlowReadoutWidth keeps active current chips compact", () => {
  const measured = liveFlowReadoutText({
    signedCurrent: 5e-3,
    normalizedCurrent: 1,
    source: "ngspice",
  }, true);
  const estimated = liveFlowReadoutText({
    signedCurrent: 5e-3,
    normalizedCurrent: 1,
    source: "estimated",
  }, true);
  const inactive = liveFlowReadoutText({
    signedCurrent: 9e-9,
    normalizedCurrent: 0.9,
    source: "ngspice",
  }, false);

  assert.ok(liveFlowReadoutWidth(measured) >= 2);
  assert.ok(liveFlowReadoutWidth(estimated) >= 2);
  assert.ok(liveFlowReadoutWidth(measured) <= 3);
  assert.ok(liveFlowReadoutWidth(estimated) <= 3);
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

test("wireFlowSampleFromCandidates ignores unusable pins and prefers measured ties", () => {
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
        source: "estimated",
        attachedPinIndex: 0,
        pinCount: 2,
        attachedAtStart: true,
        distance: 0.02,
      },
    ]),
    { signedCurrent: -2, source: "estimated", distance: 0.02 },
  );

  assert.deepEqual(
    wireFlowSampleFromCandidates([
      {
        componentCurrent: 2,
        source: "estimated",
        attachedPinIndex: 0,
        pinCount: 2,
        attachedAtStart: true,
        distance: 0,
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

test("liveFlowCurrentTraceCandidates includes device-specific ngspice currents first", () => {
  assert.deepEqual(liveFlowCurrentTraceCandidates("R", "R1"), [
    "@r1[i]",
    "r1#branch",
    "i(r1)",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("NMOS", "M1").slice(0, 2), [
    "@m1[id]",
    "@m1[is]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("NPN", "Q1").slice(0, 3), [
    "@q1[ic]",
    "@q1[ie]",
    "@q1[ib]",
  ]);
  assert.deepEqual(liveFlowCurrentTraceCandidates("D", "D1").slice(0, 1), [
    "@d1[id]",
  ]);
});

test("estimatePassiveLiveFlowCurrent derives resistor current from node voltages", () => {
  assert.equal(
    estimatePassiveLiveFlowCurrent({
      kind: "R",
      value: "1k",
      pin0Voltage: 1,
      pin1Voltage: 0,
    }),
    1e-3,
  );
  assert.equal(
    estimatePassiveLiveFlowCurrent({
      kind: "R",
      value: "1Meg",
      pin0Voltage: 1,
      pin1Voltage: 0,
    }),
    1e-6,
  );
});

test("estimatePassiveLiveFlowCurrent derives capacitor current from voltage slope", () => {
  assert.equal(
    estimatePassiveLiveFlowCurrent({
      kind: "C",
      value: "2u",
      pin0Voltage: 1,
      pin1Voltage: 0,
      previousPin0Voltage: 0.5,
      previousPin1Voltage: 0,
      deltaTime: 1e-3,
    }),
    1e-3,
  );
  assert.equal(
    estimatePassiveLiveFlowCurrent({
      kind: "C",
      value: "2u",
      pin0Voltage: 1,
      pin1Voltage: 0,
    }),
    null,
  );
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
    assert.equal(status.tone, "warning");
    assert.match(status.title, /Switch analysis to transient/);
  }

  assert.equal(
    liveFlowStatus({
      enabled: true,
      hasResult: true,
      isTransient: false,
      simulationStale: false,
      floatingPinCount: 0,
      activeWireCount: 0,
      sampledWireCount: 0,
    }).label,
    "Needs transient",
  );

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

  assert.equal(
    liveFlowStatus({
      enabled: true,
      isTransient: true,
      simulationStale: false,
      floatingPinCount: 0,
      visibleWireCount: 5,
      activeWireCount: 0,
      sampledWireCount: 0,
    }).title,
    "No wire-current samples were found for the visible wires. 0 of 5 visible wires are animating. 5 visible wires have no usable current sample.",
  );

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
      strongestCurrent: 2.5e-6,
    }).label,
    "2/4 wires · 2.50 µA",
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
        sampledMeasuredWireCount: 3,
        sampledEstimatedWireCount: 1,
        measuredWireCount: 1,
        estimatedWireCount: 1,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/4 wires · 2.50 µA");
    assert.equal(status.source, "mixed");
    return status;
  })().title,
    /2 of 4 visible wires are animating.*2 sampled wires are below.*2\.50 µA.*Animating streams: 1 measured, 1 estimated.*Sampled wires: 3 measured, 1 estimated.*Blue streams.*amber streams/,
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
        measuredWireCount: 2,
        estimatedWireCount: 0,
        sampledMeasuredWireCount: 3,
        sampledEstimatedWireCount: 1,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/4 wires · 2.50 µA");
    assert.equal(status.source, "measured");
    return status;
  })().title,
    /2 of 4 visible wires are animating.*2 sampled wires are below.*Animating streams: 2 measured, 0 estimated.*Sampled wires: 3 measured, 1 estimated.*Blue streams/,
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
        measuredWireCount: 0,
        estimatedWireCount: 2,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2 wires · 2.50 µA");
    assert.equal(status.source, "estimated");
    return status;
  })().title,
    /All 2 visible wires are animating.*Animating streams: 0 measured, 2 estimated.*Amber streams/,
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
        measuredWireCount: 2,
        estimatedWireCount: 0,
        strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2 wires · 2.50 µA");
    assert.equal(status.source, "measured");
    return status;
  })().title,
    /All 2 visible wires are animating.*Animating streams: 2 measured, 0 estimated.*Blue streams/,
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
      sampledMeasuredWireCount: 2,
      sampledEstimatedWireCount: 2,
      measuredWireCount: 2,
      estimatedWireCount: 0,
      strongestCurrent: 2.5e-6,
    });
    assert.equal(status.label, "2/6 wires · 2.50 µA");
    assert.equal(status.source, "measured");
    assert.match(status.title, /2 of 6 visible wires are animating/);
    assert.match(status.title, /2 visible wires have no usable current sample/);
    assert.match(status.title, /2 sampled wires are below the display threshold/);
    assert.match(status.title, /Animating streams: 2 measured, 0 estimated/);
    assert.match(status.title, /Sampled wires: 2 measured, 2 estimated/);
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
  assert.equal(tinyNoFlow.source, "measured");
  assert.match(tinyNoFlow.title, /below 1\.00 pA/);
  assert.match(tinyNoFlow.title, /Sampled wires: 4 measured, 0 estimated/);

  const estimatedNoFlow = liveFlowStatus({
    enabled: true,
    isTransient: true,
    simulationStale: false,
    floatingPinCount: 0,
    activeWireCount: 0,
    sampledWireCount: 2,
    sampledMeasuredWireCount: 0,
    sampledEstimatedWireCount: 2,
    strongestCurrent: 4e-9,
  });
  assert.equal(estimatedNoFlow.label, "Below range · 4.00 nA");
  assert.equal(estimatedNoFlow.source, "estimated");
  assert.match(estimatedNoFlow.title, /Sampled wires: 0 measured, 2 estimated/);
});
