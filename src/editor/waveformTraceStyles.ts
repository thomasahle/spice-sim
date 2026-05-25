export interface WaveformPlotPath {
  name: string;
  d: string;
}

export interface WaveformTraceRenderStyle {
  duplicateIndex: number;
  duplicateCount: number;
  strokeDasharray?: string;
  strokeDashoffset?: number;
}

const DUPLICATE_DASH_PATTERNS = [
  undefined,
  "7 4",
  "2 4",
  "10 3 2 3",
];

export function orderedPlotPathsForHighlight<T extends WaveformPlotPath>(
  paths: T[],
  highlightedName: string | null,
): T[] {
  if (!highlightedName) return paths;
  return [...paths].sort((a, b) => {
    if (a.name === highlightedName) return 1;
    if (b.name === highlightedName) return -1;
    return 0;
  });
}

export function tracePathRenderStyles(
  paths: WaveformPlotPath[],
  highlightedName: string | null,
): Map<string, WaveformTraceRenderStyle> {
  const groups = new Map<string, WaveformPlotPath[]>();
  for (const path of paths) {
    if (!path.d) continue;
    const group = groups.get(path.d) ?? [];
    group.push(path);
    groups.set(path.d, group);
  }

  const styles = new Map<string, WaveformTraceRenderStyle>();
  for (const path of paths) {
    const group = path.d ? (groups.get(path.d) ?? [path]) : [path];
    const duplicateIndex = Math.max(0, group.findIndex((p) => p.name === path.name));
    const duplicateCount = group.length;
    const isHighlighted = path.name === highlightedName;
    const dashPattern =
      duplicateCount > 1 && !isHighlighted
        ? DUPLICATE_DASH_PATTERNS[duplicateIndex % DUPLICATE_DASH_PATTERNS.length]
        : undefined;
    styles.set(path.name, {
      duplicateIndex,
      duplicateCount,
      strokeDasharray: dashPattern,
      strokeDashoffset: dashPattern ? duplicateIndex * 3 : undefined,
    });
  }
  return styles;
}
