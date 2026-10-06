import type { ReactNode } from "react";

import { highlightCode } from "../lib/highlight.js";
import "../styles/docs.css";

interface CodeBlockProps {
  readonly code: string;
  readonly label?: string;
  readonly language?: string;
}

/**
 * Server-highlighted code sample; Shiki never ships to the browser. The copy button
 * stays hidden until the shared page script confirms clipboard access.
 */
export function CodeBlock({
  code,
  label = "Code example",
  language = "text",
}: CodeBlockProps): ReactNode {
  return (
    <figure className="code-block">
      <figcaption>
        <span>{label}</span>
        <span className="code-block__meta">
          <span className="code-block__language">{language}</span>
          <button
            className="code-block__copy"
            type="button"
            data-code-copy=""
            aria-label={`Copy ${label} code`}
            hidden
          >
            Copy
          </button>
          <span
            className="sr-only"
            aria-live="polite"
            data-code-copy-status=""
          />
        </span>
      </figcaption>
      <div
        className="code-block__source"
        // Shiki escapes the trusted documentation source into token spans.
        dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
      />
    </figure>
  );
}
