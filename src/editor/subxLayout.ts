export function subxPinLabelMaxWidth(bodyHalfW: number, fontSize: number): number {
  const centerGutter = 1.18;
  const sidePadding = 0.34;
  const widthCells = Math.max(0.9, bodyHalfW - centerGutter - sidePadding);
  return widthCells / fontSize;
}
