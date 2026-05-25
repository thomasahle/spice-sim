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
  const branchMatch = lower.match(/^(.+)#branch$/);
  if (branchMatch) return `I(${formatRefdesPath(branchMatch[1])})`;
  if (/^n\d+$/.test(lower)) return `V(${lower})`;
  if (/^[a-z_][a-z0-9_:$.-]*$/i.test(name) && !name.includes("#")) return `V(${name})`;
  const deviceQuantity = lower.match(/^@([^\][\s]+)\[([a-z][a-z0-9_]*)\]$/);
  if (deviceQuantity) return deviceQuantityDisplayName(deviceQuantity[1], deviceQuantity[2]);
  return name;
}

function deviceQuantityDisplayName(refdes: string, quantity: string): string {
  const terminal = ({
    i: "",
    id: " drain",
    is: " source",
    ic: " collector",
    ie: " emitter",
    ib: " base",
  } as Record<string, string>)[quantity] ?? "";
  if (quantity in DEVICE_CURRENT_QUANTITIES) return `I(${formatRefdesPath(refdes)}${terminal})`;
  const symbol = DEVICE_QUANTITY_SYMBOLS[quantity] ?? quantity;
  return `${symbol}(${formatRefdesPath(refdes)})`;
}

const DEVICE_CURRENT_QUANTITIES: Record<string, true> = {
  i: true,
  id: true,
  is: true,
  ic: true,
  ie: true,
  ib: true,
};

const DEVICE_QUANTITY_SYMBOLS: Record<string, string> = {
  gm: "gm",
  gds: "gds",
  gmb: "gmb",
  gmbs: "gmbs",
  vgs: "Vgs",
  vgd: "Vgd",
  vds: "Vds",
  vbs: "Vbs",
  vbd: "Vbd",
  vbe: "Vbe",
  vbc: "Vbc",
  vce: "Vce",
  vth: "Vth",
  cgs: "Cgs",
  cgd: "Cgd",
  cgb: "Cgb",
  cbd: "Cbd",
  cbs: "Cbs",
  qg: "Qg",
  qd: "Qd",
  qs: "Qs",
  qb: "Qb",
};

function formatRefdesPath(refdes: string): string {
  return refdes
    .split(".")
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(".");
}

function splitRunQualifiedTrace(name: string): { runNumber: number; inner: string } | null {
  const match = name.match(/^(op|tran|dc|ac|noise)(\d+)\.(.+)$/i);
  if (!match) return null;
  return {
    runNumber: Number.parseInt(match[2], 10),
    inner: match[3],
  };
}
