import { renderKatexHtml } from "./katexRender";

export function InlineMathText({ text }: { text: string }) {
  return (
    <span
      className="katex-inline-text"
      dangerouslySetInnerHTML={{ __html: renderKatexHtml(text) }}
    />
  );
}
