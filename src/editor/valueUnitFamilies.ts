// Mapping from semantic value types (component value, sim setting, source
// parameter) to the SI unit family the `<ValueWithUnit>` input should expose.

import type { ComponentKind } from "./model.ts";
import { UNIT_FAMILIES, type UnitFamily } from "./valueUnits.ts";

export function componentValueUnitFamily(kind: ComponentKind): UnitFamily | null {
  switch (kind) {
    case "R":
      return UNIT_FAMILIES.resistance;
    case "C":
      return UNIT_FAMILIES.capacitance;
    case "L":
      return UNIT_FAMILIES.inductance;
    case "V":
      return UNIT_FAMILIES.voltage;
    case "I":
      return UNIT_FAMILIES.current;
    default:
      return null;
  }
}

/** Source-spec parameters (SIN / PULSE / EXP / PWL / AC) — keyed by canonical name. */
export function sourceParamUnitFamily(
  source: "sin" | "pulse" | "exp" | "pwl" | "ac" | "noise" | "sffm",
  parent: "voltage" | "current",
  field: string,
): UnitFamily {
  const level = parent === "voltage" ? UNIT_FAMILIES.voltage : UNIT_FAMILIES.current;
  if (source === "sin") {
    if (field === "vo" || field === "va") return level;
    if (field === "freq") return UNIT_FAMILIES.frequency;
    if (field === "td") return UNIT_FAMILIES.time;
    if (field === "theta" || field === "phase") return UNIT_FAMILIES.dimensionless;
  }
  if (source === "pulse") {
    if (field === "v1" || field === "v2") return level;
    if (
      field === "td" ||
      field === "tr" ||
      field === "tf" ||
      field === "pw" ||
      field === "per"
    )
      return UNIT_FAMILIES.time;
  }
  if (source === "exp") {
    if (field === "v1" || field === "v2") return level;
    if (field === "td1" || field === "td2" || field === "tau1" || field === "tau2")
      return UNIT_FAMILIES.time;
  }
  if (source === "ac") {
    if (field === "mag") return level;
    if (field === "phase") return UNIT_FAMILIES.angle;
  }
  if (source === "sffm") {
    if (field === "vo" || field === "va") return level;
    if (field === "fc" || field === "fs") return UNIT_FAMILIES.frequency;
    if (field === "mdi") return UNIT_FAMILIES.dimensionless;
  }
  if (source === "noise") {
    return UNIT_FAMILIES.dimensionless;
  }
  return UNIT_FAMILIES.dimensionless;
}

/** Simulation-settings field → unit family. */
export function simSettingUnitFamily(field: SimSettingField): UnitFamily {
  switch (field) {
    case "tstop":
    case "tstep":
    case "tstart":
      return UNIT_FAMILIES.time;
    case "fstart":
    case "fstop":
      return UNIT_FAMILIES.frequency;
    case "temperature":
      return UNIT_FAMILIES.temperature;
    case "dc_start":
    case "dc_stop":
    case "dc_step":
    case "noise_pts":
    default:
      return UNIT_FAMILIES.dimensionless;
  }
}

export type SimSettingField =
  | "tstop"
  | "tstep"
  | "tstart"
  | "fstart"
  | "fstop"
  | "temperature"
  | "dc_start"
  | "dc_stop"
  | "dc_step"
  | "noise_pts";
