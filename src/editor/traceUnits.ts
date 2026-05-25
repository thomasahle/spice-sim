export function traceValueUnit(name: string): string {
  const lower = stripRunPrefix(name.trim().toLowerCase());
  const deviceQuantity = lower.match(/^@[^\][\s]+\[([a-z][a-z0-9_]*)\]$/)?.[1];
  if (deviceQuantity) return deviceQuantityUnit(deviceQuantity);
  if (
    lower.includes("#branch") ||
    /^i\(/.test(lower)
  ) {
    return "A";
  }
  if (lower === "onoise_spectrum" || lower === "inoise_spectrum") {
    return "V/sqrt(Hz)";
  }
  if (
    /^v\(/.test(lower) ||
    /^n\d+$/.test(lower) ||
    /^[a-z_][a-z0-9_:$.-]*$/i.test(lower)
  ) {
    return "V";
  }
  return "";
}

export function traceAxisLabel(displayName: string, rawName: string): string {
  const unit = traceValueUnit(rawName);
  return unit ? `${displayName} (${unit})` : displayName;
}

function stripRunPrefix(name: string): string {
  return name.replace(/^(op|tran|dc|ac|noise)\d+\./i, "");
}

function deviceQuantityUnit(quantity: string): string {
  if (/^(i|id|is|ic|ie|ib)$/.test(quantity)) return "A";
  if (/^(gm|gds|gmb|gmbs)$/.test(quantity)) return "S";
  if (/^v/.test(quantity)) return "V";
  if (/^c/.test(quantity)) return "F";
  if (/^q/.test(quantity)) return "C";
  return "";
}
