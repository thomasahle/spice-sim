export function traceValueUnit(name: string): string {
  const lower = stripRunPrefix(name.trim().toLowerCase());
  if (
    lower.includes("#branch") ||
    /^i\(/.test(lower) ||
    /^@[a-z]+\d+\[i\]$/.test(lower)
  ) {
    return "A";
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
