export interface PanPoint {
  x: number;
  y: number;
}

export function wheelPanDelta(
  deltaX: number,
  deltaY: number,
  naturalPan: boolean,
): PanPoint {
  const direction = naturalPan ? 1 : -1;
  return {
    x: deltaX * direction,
    y: deltaY * direction,
  };
}

export function applyWheelPan(
  pan: PanPoint,
  deltaX: number,
  deltaY: number,
  naturalPan: boolean,
): PanPoint {
  const delta = wheelPanDelta(deltaX, deltaY, naturalPan);
  return {
    x: pan.x + delta.x,
    y: pan.y + delta.y,
  };
}
