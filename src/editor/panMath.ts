export interface PanPoint {
  x: number;
  y: number;
}

export function wheelPanDelta(
  deltaX: number,
  deltaY: number,
): PanPoint {
  return {
    x: -deltaX,
    y: -deltaY,
  };
}

export function applyWheelPan(
  pan: PanPoint,
  deltaX: number,
  deltaY: number,
): PanPoint {
  const delta = wheelPanDelta(deltaX, deltaY);
  return {
    x: pan.x + delta.x,
    y: pan.y + delta.y,
  };
}
