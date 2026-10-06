import type { ReactNode } from "react";

import { highlightCode } from "../lib/highlight.js";
import "../styles/docs.css";

interface CodeBlockProps {
  readonly code: string;
  readonly label?: string;
  readonly language?: string;
}

/** Server-highlighted code sample; Shiki never ships to the browser. */
export function CodeBlock({
  code,
  label = "Code example",
  language = "text",
}: CodeBlockProps): ReactNode {
  return (
    <figure className="code-block">
      <figcaption>
        <span>{label}</span>
        <span className="code-block__language">{language}</span>
      </figcaption>
      <div
        className="code-block__source"
        // Shiki escapes the trusted documentation source into token spans.
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </figure>
  );
}
