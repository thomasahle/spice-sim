import assert from "node:assert/strict";
import test from "node:test";

import {
  moveProbesWithPinMoves,
  moveUnmovedProbesWithChangedWirePaths,
  moveWirePointsToTargets,
  probeShouldMoveWithSelectedPin,
  wireConnectsMovedPins,
  wireEndpointMoveTargets,
} from "../src/editor/wireMotion.ts";

test("wire endpoint retargeting ignores interior bus vertices", () => {
  const targets = wireEndpointMoveTargets(
    [
      [-4, 0],
      [0, 0],
      [4, 0],
    ],
    [{ from: { x: 0, y: 0 }, to: { x: 0, y: 1 } }],
  );

  assert.deepEqual([...targets.entries()], []);
});

test("wire endpoint retargeting still moves absolute endpoints", () => {
  const targets = wireEndpointMoveTargets(
    [
      [-4, 0],
      [0, 0],
      [4, 0],
    ],
    [{ from: { x: -4, y: 0 }, to: { x: -4, y: 1 } }],
  );

  assert.deepEqual([...targets.entries()], [[0, [-4, 1]]]);
});

test("retargeted helper wires connecting moved pins are detected as self-shorts", () => {
  assert.equal(
    wireConnectsMovedPins(
      [
        [0, 0],
        [0, 4],
      ],
      [
        { from: { x: -2, y: 2 }, to: { x: 0, y: 0 } },
        { from: { x: 2, y: 2 }, to: { x: 0, y: 4 } },
      ],
    ),
    true,
  );
});

test("retargeted helper wires to stationary nodes are preserved", () => {
  assert.equal(
    wireConnectsMovedPins(
      [
        [0, 0],
        [2, 2],
      ],
      [
        { from: { x: -2, y: 2 }, to: { x: 0, y: 0 } },
        { from: { x: 2, y: 2 }, to: { x: 0, y: 4 } },
      ],
    ),
    false,
  );
});

test("retargeted wire endpoints use direct routes when orthogonal routing is off", () => {
  assert.deepEqual(
    moveWirePointsToTargets(
      [
        [0, 0],
        [2, 0],
      ],
      new Map([[1, [3.2, 1.4]]]),
      false,
    ),
    [
      [0, 0],
      [3.2, 1.4],
    ],
  );
});

test("retargeted wire endpoints keep elbows when orthogonal routing is on", () => {
  assert.deepEqual(
    moveWirePointsToTargets(
      [
        [0, 0],
        [2, 0],
      ],
      new Map([[1, [3, 1]]]),
      true,
    ),
    [
      [0, 0],
      [3, 0],
      [3, 1],
    ],
  );
});

test("probes on moving pins stay with stationary wire bodies", () => {
  assert.equal(
    probeShouldMoveWithSelectedPin(
      { x: 0, y: 0 },
      [{ x: 0, y: 0 }],
      [{ id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" }],
      [{ id: "bus", points: [[-4, 0], [0, 0], [4, 0]] }],
      new Set(["r1"]),
    ),
    false,
  );
});

test("probes on moving pins move when only the attached wire endpoint moves", () => {
  assert.equal(
    probeShouldMoveWithSelectedPin(
      { x: 0, y: 0 },
      [{ x: 0, y: 0 }],
      [{ id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" }],
      [{ id: "lead", points: [[0, 0], [4, 0]] }],
      new Set(["r1"]),
    ),
    true,
  );
});

test("probes on moving pins stay with a stationary component pin", () => {
  assert.equal(
    probeShouldMoveWithSelectedPin(
      { x: 0, y: 0 },
      [{ x: 0, y: 0 }],
      [
        { id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" },
        { id: "r2", kind: "R", x: 2, y: 0, rotation: 0, value: "1k" },
      ],
      [],
      new Set(["r1"]),
    ),
    false,
  );
});

test("pin move probe routing preserves probes on stationary bus bodies", () => {
  assert.deepEqual(
    moveProbesWithPinMoves(
      [{ id: "pin", x: 0, y: 0, color: "#0a84ff", label: "Vin" }],
      [{ from: { x: 0, y: 0 }, to: { x: 0, y: 2 } }],
      [{ id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" }],
      [{ id: "bus", points: [[-4, 0], [0, 0], [4, 0]] }],
      new Set(["r1"]),
    ),
    [{ id: "pin", x: 0, y: 0, color: "#0a84ff", label: "Vin" }],
  );
});

test("pin move probe routing moves probes on owned moving pins", () => {
  assert.deepEqual(
    moveProbesWithPinMoves(
      [{ id: "pin", x: 0, y: 0, color: "#0a84ff", label: "Vin" }],
      [{ from: { x: 0, y: 0 }, to: { x: 0, y: 2 } }],
      [{ id: "r1", kind: "R", x: -2, y: 0, rotation: 0, value: "1k" }],
      [{ id: "lead", points: [[0, 0], [4, 0]] }],
      new Set(["r1"]),
    ),
    [{ id: "pin", x: 0, y: 2, color: "#0a84ff", label: "Vin" }],
  );
});

test("probes on rerouted wire bodies follow the changed wire path", () => {
  assert.deepEqual(
    moveUnmovedProbesWithChangedWirePaths(
      [{ id: "pin", x: -6, y: 0.5, color: "#ff9f0a", label: "Vin" }],
      [{ id: "pin", x: -6, y: 0.5, color: "#ff9f0a", label: "Vin" }],
      [{ id: "w1", points: [[-7, 0.5], [-5, 0.5]] }],
      [{ id: "w1", points: [[-7, 0.5], [-3, -1.5]] }],
    ),
    [{ id: "pin", x: -5, y: -0.5, color: "#ff9f0a", label: "Vin" }],
  );
});

test("probes already moved by explicit pin or selection rules are not remapped again", () => {
  assert.deepEqual(
    moveUnmovedProbesWithChangedWirePaths(
      [{ id: "pin", x: -3, y: -1.5, color: "#ff9f0a", label: "Vin" }],
      [{ id: "pin", x: -5, y: 0.5, color: "#ff9f0a", label: "Vin" }],
      [{ id: "w1", points: [[-7, 0.5], [-5, 0.5]] }],
      [{ id: "w1", points: [[-7, 0.5], [-3, -1.5]] }],
    ),
    [{ id: "pin", x: -3, y: -1.5, color: "#ff9f0a", label: "Vin" }],
  );
});
