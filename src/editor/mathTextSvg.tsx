import type { CSSProperties, ReactNode } from "react";

import { parseInlineMathText, type MathTextAtom } from "./mathText";

interface SvgInlineMathTextProps {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  className?: string;
  textAnchor?: "start" | "middle" | "end";
  style?: CSSProperties;
  transform?: string;
}

export function SvgInlineMathText({
  x,
  y,
  text,
  fontSize,
  className,
  textAnchor = "start",
  style,
  transform,
}: SvgInlineMathTextProps) {
  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize}
      textAnchor={textAnchor}
      className={className}
      style={style}
      transform={transform}
    >
      {inlineMathTspans(parseInlineMathText(text), fontSize)}
    </text>
  );
}

export function inlineMathTspans(atoms: MathTextAtom[], fontSize: number): ReactNode {
  return atoms.map((atom, idx) => (
    <tspan key={idx}>
      {atom.text}
      {atom.sub && (
        <tspan fontSize={fontSize * 0.68} baselineShift="-28%">
          {atom.sub}
        </tspan>
      )}
      {atom.sup && (
        <tspan fontSize={fontSize * 0.68} baselineShift="42%">
          {atom.sup}
        </tspan>
      )}
    </tspan>
  ));
}
