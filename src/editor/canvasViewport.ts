import { normalizePoint } from "./geometry.ts";

export interface ViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
  cellPx: number;
}

export interface ViewportRect {
  width: number;
  height: number;
  left?: number;
  top?: number;
}

export function clientToViewportPoint(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
): { x: number; y: number } {
  return {
    x: clientX - (rect.left ?? 0),
    y: clientY - (rect.top ?? 0),
  };
}

export function screenToWorldPoint(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
  transform: ViewportTransform,
): { x: number; y: number } {
  const local = clientToViewportPoint(clientX, clientY, rect);
  return normalizePoint({
    x: (local.x - transform.pan.x) / (transform.cellPx * transform.zoom),
    y: (local.y - transform.pan.y) / (transform.cellPx * transform.zoom),
  });
}

export function snapWorldPoint(
  point: { x: number; y: number },
  snapToGrid: boolean,
): { x: number; y: number } {
  return snapToGrid
    ? normalizePoint({ x: Math.round(point.x), y: Math.round(point.y) })
    : normalizePoint(point);
}

export function zoomAtViewportPoint(
  pan: { x: number; y: number },
  zoom: number,
  viewportPoint: { x: number; y: number },
  factor: number,
  minZoom: number,
  maxZoom: number,
): { pan: { x: number; y: number }; zoom: number } {
  const nextZoom = Math.max(minZoom, Math.min(maxZoom, zoom * factor));
  if (nextZoom === zoom) return { pan, zoom };
  const scale = nextZoom / zoom;
  return {
    zoom: nextZoom,
    pan: {
      x: viewportPoint.x - (viewportPoint.x - pan.x) * scale,
      y: viewportPoint.y - (viewportPoint.y - pan.y) * scale,
    },
  };
}

export function fitBoundsToViewport(
  bounds: { xs: number[]; ys: number[] },
  rect: ViewportRect,
  cellPx: number,
  options: {
    emptyZoom?: number;
    minZoom?: number;
    maxZoom?: number;
    padX?: number;
    padY?: number;
    minContentCells?: number;
  } = {},
): { pan: { x: number; y: number }; zoom: number } {
  const { xs, ys } = bounds;
  const emptyZoom = options.emptyZoom ?? 1;
  if (xs.length === 0 || ys.length === 0) {
    return {
      zoom: emptyZoom,
      pan: { x: rect.width / 2, y: rect.height / 2 },
    };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minContentCells = options.minContentCells ?? 4;
  const contentW = Math.max(minContentCells, maxX - minX);
  const contentH = Math.max(minContentCells, maxY - minY);
  const fitZoom = Math.min(
    (rect.width - (options.padX ?? 170)) / (contentW * cellPx),
    (rect.height - (options.padY ?? 110)) / (contentH * cellPx),
  );
  const zoom = Math.max(options.minZoom ?? 0.45, Math.min(options.maxZoom ?? 2.2, fitZoom));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    zoom,
    pan: {
      x: rect.width / 2 - cx * cellPx * zoom,
      y: rect.height / 2 - cy * cellPx * zoom,
    },
  };
}
