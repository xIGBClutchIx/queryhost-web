import type { TargetedMouseEvent } from "preact";
import type { ReactNode } from "react";

import type { PlaygroundExample } from "../../lib/playground-examples.js";
import { shareUrl } from "../../lib/playground-form.js";

interface PlaygroundExamplesProps {
  readonly examples: readonly PlaygroundExample[];
  /** Runs the example in place; the link remains the no-script fallback. */
  readonly onSelect: (search: string) => void;
}

/** One-click queries against well-known public servers for first-time visitors. */
export function PlaygroundExamples({
  examples,
  onSelect,
}: PlaygroundExamplesProps): ReactNode {
  function onClick(
    event: TargetedMouseEvent<HTMLAnchorElement>,
    search: string,
  ): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onSelect(search);
  }

  return (
    <nav className="playground-examples" aria-label="Example servers">
      <span className="playground-examples__label">Try an example</span>
      <ul>
        {examples.map((example) => {
          const url = shareUrl("https://query.host/", example.input);
          const href = `/${url.search}`;
          return (
            <li key={href}>
              <a
                className="playground-examples__chip"
                href={href}
                onClick={(event) => {
                  onClick(event, url.search);
                }}
              >
                <span>{example.label}</span> <code>{example.input.host}</code>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
