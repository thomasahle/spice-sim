import type { CircuitComponent } from "./model.ts";
import {
  getPinLayout,
  subcircuitBodyHeight,
  subcircuitBodyWidth,
} from "./model.ts";

export const SOURCE_BODY_FLOW_CLIP_RADIUS = 1.2;

export function componentLiveFlowPaths(component: CircuitComponent): string[] {
  switch (component.kind) {
    case "R":
      return ["M -2 0 L -1.5 0 L -1.25 -0.45 L -0.75 0.45 L -0.25 -0.45 L 0.25 0.45 L 0.75 -0.45 L 1.25 0.45 L 1.5 0 L 2 0"];
    case "C":
      return [
        "M 0 -2 L 0 -0.55",
        "M -0.9 -0.55 L 0.9 -0.55",
        "M -0.9 0.55 L 0.9 0.55",
        "M 0 0.55 L 0 2",
      ];
    case "L":
      return ["M 0 -2 L 0 -1.4 A 0.45 0.45 0 0 1 0 -0.5 A 0.45 0.45 0 0 1 0 0.4 A 0.45 0.45 0 0 1 0 1.3 L 0 2"];
    case "V":
      return [
        "M -0.52 -0.62 L -0.52 0.62",
        "M 0.52 -0.62 L 0.52 0.62",
      ];
    case "I":
    case "B":
      return [
        "M -0.32 -0.6 L -0.32 0.6",
        "M 0.32 -0.6 L 0.32 0.6",
      ];
    case "GND":
      return [
        "M 0 -1.15 L 0 -0.42",
        "M -0.72 -0.42 L 0.72 -0.42",
        "M -0.46 0 L 0.46 0",
        "M -0.22 0.38 L 0.22 0.38",
      ];
    case "D":
      return [
        "M 0 -2 L 0 -0.7 L -0.6 -0.7 L 0 0.4 L 0.6 -0.7 L 0 -0.7",
        "M -0.65 0.4 L 0.65 0.4",
        "M 0 0.4 L 0 2",
      ];
    case "NPN":
    case "PNP":
      return ["M 0 -2 L 0 -0.85 L -0.7 -0.3 L -0.7 0.3 L 0 0.85 L 0 2"];
    case "NMOS":
    case "PMOS":
    case "NMOS4":
    case "PMOS4":
      return ["M 0 -2 L 0 -0.6 L -0.4 -0.6 L -0.4 0.6 L 0 0.6 L 0 2"];
    case "OPAMP":
      return ["M -3 -1 L -1.25 -0.45 L 3 0", "M -3 1 L -1.25 0.45 L 3 0"];
    case "SUBX":
      return subcircuitLiveFlowPaths(component);
    default:
      return [];
  }
}

function subcircuitLiveFlowPaths(component: CircuitComponent): string[] {
  const pins = getPinLayout(component);
  const bodyHalfW = subcircuitBodyWidth(component) / 2;
  const bodyHalfH = subcircuitBodyHeight(component) / 2;
  const paths: string[] = [];
  const hasLeft = pins.some((pin) => pin.x < -bodyHalfW);
  const hasRight = pins.some((pin) => pin.x > bodyHalfW);
  const hasTop = pins.some((pin) => pin.y < -bodyHalfH);
  const hasBottom = pins.some((pin) => pin.y > bodyHalfH);
  if (hasLeft || hasRight) paths.push(`M ${-bodyHalfW} 0 L ${bodyHalfW} 0`);
  if (hasTop || hasBottom) paths.push(`M 0 ${-bodyHalfH} L 0 ${bodyHalfH}`);
  if (paths.length === 0) paths.push(`M ${-bodyHalfW} 0 L ${bodyHalfW} 0`);
  return paths;
}
