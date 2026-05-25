import { parseInlineMathText } from "./mathText";

export function InlineMathText({ text }: { text: string }) {
  return (
    <>
      {parseInlineMathText(text).map((atom, idx) => (
        <span key={`${atom.text}-${atom.sub ?? ""}-${atom.sup ?? ""}-${idx}`}>
          {atom.text}
          {atom.sub && (
            <sub className="inline-math-sub">
              {atom.sub}
            </sub>
          )}
          {atom.sup && (
            <sup className="inline-math-sup">
              {atom.sup}
            </sup>
          )}
        </span>
      ))}
    </>
  );
}
