export type AutoRunState =
  | "off"
  | "running"
  | "paused-tool"
  | "paused-interaction"
  | "engine-offline"
  | "empty"
  | "needs-ground"
  | "needs-source"
  | "needs-circuit"
  | "ready";

export interface AutoRunStatusInput {
  autoRun: boolean;
  running: boolean;
  engineOk: boolean | null;
  tool: string;
  interactionActive: boolean;
  componentCount: number;
  hasGround: boolean;
  hasStimulus: boolean;
}

export interface AutoRunStatus {
  state: AutoRunState;
  buttonLabel: string;
  statusLabel: string;
  title: string;
  paused: boolean;
  runnable: boolean;
}

export function describeAutoRunStatus(input: AutoRunStatusInput): AutoRunStatus {
  if (!input.autoRun) {
    return status("off", "Auto: Off", "off", "Auto-run is off. Click to rerun automatically after circuit edits.", false, false);
  }
  if (input.running) {
    return status("running", "Auto: Running", "running", "Auto-run is running the current circuit.", false, false);
  }
  if (input.engineOk === false) {
    return status("engine-offline", "Auto: Offline", "offline", "Auto-run is waiting for the simulation engine to reconnect.", false, false);
  }
  if (input.tool !== "select") {
    return status("paused-tool", "Auto: Paused", "paused", "Auto-run pauses while a drawing tool is active. Switch to Select or press Run manually.", true, false);
  }
  if (input.interactionActive) {
    return status("paused-interaction", "Auto: Paused", "paused", "Auto-run pauses while you are dragging, wiring, resizing, or editing the canvas.", true, false);
  }
  if (input.componentCount === 0) {
    return status("empty", "Auto: Waiting", "waiting", "Auto-run is waiting for a circuit. Place components, a source, and ground.", false, false);
  }
  if (input.componentCount < 2) {
    return status("needs-circuit", "Auto: Waiting", "waiting", "Auto-run needs at least two components before it runs.", false, false);
  }
  if (!input.hasGround) {
    return status("needs-ground", "Auto: Needs GND", "needs gnd", "Auto-run needs a ground reference before it can simulate.", false, false);
  }
  if (!input.hasStimulus) {
    return status("needs-source", "Auto: Needs Source", "needs source", "Auto-run needs an independent or behavioral source before it can simulate.", false, false);
  }
  return status("ready", "Auto: On", "on", "Auto-run will rerun automatically after circuit edits settle.", false, true);
}

function status(
  state: AutoRunState,
  buttonLabel: string,
  statusLabel: string,
  title: string,
  paused: boolean,
  runnable: boolean,
): AutoRunStatus {
  return { state, buttonLabel, statusLabel, title, paused, runnable };
}
