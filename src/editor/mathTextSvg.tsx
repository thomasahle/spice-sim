import type { CSSProperties } from "react";

import { displayMathTextLines, estimateDisplayMathTextWidth } from "./mathText";
import { renderKatexHtml } from "./katexRender";

interface SvgInlineMathTextProps {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  className?: string;
  textAnchor?: "start" | "middle" | "end";
  style?: CSSProperties;
  transform?: string;
  maxWidth?: number;
  boxHeight?: number;
  verticalAnchor?: "baseline" | "middle";
  overflow?: CSSProperties["overflow"];
  pointerEvents?: CSSProperties["pointerEvents"];
  paddingX?: number;
  paddingY?: number;
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
  maxWidth,
  boxHeight,
  verticalAnchor = "baseline",
  overflow = "visible",
  pointerEvents = "none",
  paddingX = 0,
  paddingY = 0,
}: SvgInlineMathTextProps) {
  const isDisplayMath = /\\begin\{/.test(text);
  const estimatedWidth = Math.max(
    fontSize * 1.4,
    estimateDisplayMathTextWidth(text) * fontSize * 0.92 + fontSize * 1.1,
  );
  const width = maxWidth ?? estimatedWidth;
  const displayRows = isDisplayMath ? displayMathTextLines(text).length : 1;
  const height = boxHeight ?? fontSize * (displayRows > 1 ? displayRows * 1.72 + 0.9 : 2.65);
  const anchoredX = textAnchor === "middle" ? x - width / 2 : textAnchor === "end" ? x - width : x;
  const topY = verticalAnchor === "middle" ? y - height / 2 : y - fontSize * (isDisplayMath ? 1.72 : 1.22);
  const color = typeof style?.fill === "string" ? style.fill : undefined;
  const fontWeight = style?.fontWeight;

  return (
    <foreignObject
      x={anchoredX}
      y={topY}
      width={width}
      height={height}
      className={className}
      transform={transform}
      style={{ overflow, pointerEvents }}
    >
      <span
        className={`svg-katex-text ${isDisplayMath ? "svg-katex-display-math" : ""} svg-katex-anchor-${textAnchor}`}
        style={{
          color,
          boxSizing: "border-box",
          fontSize: `${fontSize}px`,
          fontWeight,
          width: "100%",
          height: "100%",
          padding: `${paddingY}px ${paddingX}px`,
          overflow,
          display: "flex",
          lineHeight: 1,
          alignItems: verticalAnchor === "middle" ? "center" : undefined,
          justifyContent:
            textAnchor === "middle"
              ? "center"
              : textAnchor === "end"
                ? "flex-end"
                : "flex-start",
        }}
        dangerouslySetInnerHTML={{ __html: renderKatexHtml(text, { displayMode: isDisplayMath }) }}
      />
    </foreignObject>
  );
}
