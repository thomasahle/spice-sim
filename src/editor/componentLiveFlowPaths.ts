import type { CircuitComponent } from "./model.ts";
import {
  getPinLayout,
  subcircuitBodyHeight,
  subcircuitBodyWidth,
} from "./model.ts";

export function componentLiveFlowPaths(component: CircuitComponent): string[] {
  switch (component.kind) {
    case "R":
      return ["M -2 0 L -1.5 0 L -1.25 -0.45 L -0.75 0.45 L -0.25 -0.45 L 0.25 0.45 L 0.75 -0.45 L 1.25 0.45 L 1.5 0 L 2 0"];
    case "C":
      // Leads only — the plate bars run perpendicular to the current, so
      // animating dashes along them reads as scatter, not flow.
      return [
        "M 0 -2 L 0 -0.55",
        "M 0 0.55 L 0 2",
      ];
    case "L":
      return ["M 0 -2 L 0 -1.4 A 0.45 0.45 0 0 1 0 -0.5 A 0.45 0.45 0 0 1 0 0.4 A 0.45 0.45 0 0 1 0 1.3 L 0 2"];
    case "V":
    case "I":
    case "B":
      // Lead stubs only (pin → circle edge). Animating bars inside the body
      // interleaved with the +/− glyphs and read as stray dashes; the symbol
      // glyphs stay untouched and flow visibly enters/exits the source.
      return [
        "M 0 -2 L 0 -1.2",
        "M 0 1.2 L 0 2",
      ];
    case "GND":
      // Only the lead carries flow (pin at y=0, top bar at y=0.5 — see
      // symbols.tsx). Animating the three symbol bars made a dash
      // "starburst", and the old coordinates sat ABOVE the pin, painting a
      // stray dash over the wire instead of the lead.
      return ["M 0 0 L 0 0.5"];
    case "D":
      return [
        "M 0 -2 L 0 -0.7 L -0.6 -0.7 L 0 0.4 L 0.6 -0.7 L 0 -0.7",
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
