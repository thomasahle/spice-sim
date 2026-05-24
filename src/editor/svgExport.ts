export interface SchematicExportBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const CELL = 20;
const MARGIN = 32;

const STRIP_SELECTORS = [
  ".canvas-axis",
  ".component-hit-target",
  ".component-selection",
  ".component-hover",
  ".component-floating",
  ".component-selection-handle",
  ".group-selection-frame",
  ".group-selection-handle",
  ".group-selection-badge",
  ".pin-hint",
  ".floating-pin-marker",
  ".probe-scope",
  ".wire-hit-target",
  ".wire-vertex",
  ".draft-measure",
  ".placement-draft",
].join(",");

export function schematicSvgFromCanvas(
  svg: SVGSVGElement,
  bounds: SchematicExportBounds,
  title = "Schematic",
): string {
  const sourceGroup = svg.querySelector(":scope > g");
  if (!sourceGroup) throw new Error("Canvas export failed: schematic layer not found.");

  const layer = sourceGroup.cloneNode(true) as SVGGElement;
  sanitizeExportLayer(layer);

  const contentW = Math.max(1, bounds.x2 - bounds.x1);
  const contentH = Math.max(1, bounds.y2 - bounds.y1);
  const width = Math.ceil(contentW * CELL + MARGIN * 2);
  const height = Math.ceil(contentH * CELL + MARGIN * 2);
  const tx = MARGIN - bounds.x1 * CELL;
  const ty = MARGIN - bounds.y1 * CELL;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<style>${EXPORT_STYLE}</style>`,
    `<rect width="100%" height="100%" fill="var(--bg-canvas)"/>`,
    `<g transform="translate(${round(tx)} ${round(ty)}) scale(${CELL})">`,
    layer.innerHTML,
    "</g>",
    "</svg>",
  ].join("\n");
}

export function sanitizeExportLayer(layer: Element): void {
  layer.querySelectorAll(STRIP_SELECTORS).forEach((el) => el.remove());
  layer.querySelectorAll(".wire-live").forEach((el) => {
    el.classList.remove("wire-live");
    (el as SVGElement).style.removeProperty("opacity");
    (el as SVGElement).style.removeProperty("--flow-duration");
  });
  layer.querySelectorAll(".selected,.hovered,.floating").forEach((el) => {
    el.classList.remove("selected", "hovered", "floating");
  });
  layer.querySelectorAll(".component-group:not(.net-label-group) [stroke='var(--accent)']").forEach((el) => {
    el.setAttribute("stroke", "var(--ink)");
  });
  layer.querySelectorAll(".component-group:not(.net-label-group) [fill='var(--accent)']").forEach((el) => {
    el.setAttribute("fill", "var(--ink)");
  });
  layer.querySelectorAll(".wire-group polyline:not(.wire-hit-target)").forEach((el) => {
    el.setAttribute("stroke", "var(--ink)");
    el.setAttribute("stroke-width", "0.12");
  });
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EXPORT_STYLE = `
:root {
  --bg-canvas: #ffffff;
  --bg-window: #ffffff;
  --ink: #1d1d1f;
  --ink-muted: #6e6e73;
  --pin: #1d1d1f;
  --accent: #0a84ff;
  --hairline: #d9dbe2;
}
* {
  vector-effect: non-scaling-stroke;
}
text {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.wire-junction-dot {
  fill: var(--pin);
  stroke: var(--bg-canvas);
  stroke-width: 0.045;
}
.net-label-stem {
  stroke: var(--accent);
  stroke-width: 0.08;
  stroke-linecap: round;
}
.net-label-chip {
  fill: #eef6ff;
  stroke: #8fc2ff;
  stroke-width: 0.055;
}
.net-label-text {
  fill: var(--accent);
  font-weight: 650;
}
.component-value-text {
  fill: var(--ink-muted);
  stroke: var(--bg-canvas);
  stroke-width: 0.16px;
  stroke-linejoin: round;
  paint-order: stroke fill;
  font-size: 0.58px;
  font-weight: 560;
  dominant-baseline: alphabetic;
}
`.trim();
