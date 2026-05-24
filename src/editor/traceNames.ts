export function traceAliasKey(name: string): string {
  return name.trim().toLowerCase();
}

export function traceDisplayName(
  name: string,
  aliases?: Map<string, string>,
  runLabels?: Map<number, string>,
): string {
  const stepped = splitRunQualifiedTrace(name);
  if (stepped) {
    const alias = aliases?.get(traceAliasKey(name)) ?? aliases?.get(traceAliasKey(stepped.inner));
    const runLabel = runLabels?.get(stepped.runNumber) ?? `Run ${stepped.runNumber}`;
    return `${runLabel} · ${alias ?? traceDisplayName(stepped.inner, aliases, runLabels)}`;
  }

  const alias = aliases?.get(traceAliasKey(name));
  if (alias) return alias;
  const lower = name.toLowerCase();
  const voltageMatch = lower.match(/^v\((.+)\)$/);
  if (voltageMatch) return `V(${voltageMatch[1]})`;
  const branchMatch = lower.match(/^([a-z]+\d+)#branch$/);
  if (branchMatch) return `I(${branchMatch[1].toUpperCase()})`;
  if (/^n\d+$/.test(lower)) return `V(${lower})`;
  if (/^[a-z_][a-z0-9_:$.-]*$/i.test(name) && !name.includes("#")) return `V(${name})`;
  const deviceCurrent = lower.match(/^@([a-z]+\d+)\[i\]$/);
  if (deviceCurrent) return `I(${deviceCurrent[1].toUpperCase()})`;
  return name;
}

function splitRunQualifiedTrace(name: string): { runNumber: number; inner: string } | null {
  const match = name.match(/^(op|tran|dc|ac|noise)(\d+)\.(.+)$/i);
  if (!match) return null;
  return {
    runNumber: Number.parseInt(match[2], 10),
    inner: match[3],
  };
}
