import type { ReactNode } from "react";

import { adjacentDocumentationPages } from "../lib/navigation.js";
import { documentationHref } from "../lib/site.js";

interface DocsPagerProps {
  readonly activeHref: string;
  readonly hostname: string;
}

/** Previous and next links in the sidebar's reading order. */
export function DocsPager({ activeHref, hostname }: DocsPagerProps): ReactNode {
  const { next, previous } = adjacentDocumentationPages(activeHref);
  if (next === undefined && previous === undefined) return null;
  return (
    <nav className="doc-pager" aria-label="Previous and next pages">
      {previous !== undefined && (
        <a
          className="doc-pager__link doc-pager__link--previous"
          href={documentationHref(hostname, previous.href)}
          rel="prev"
        >
          <span>Previous</span> <strong>{previous.label}</strong>
        </a>
      )}
      {next !== undefined && (
        <a
          className="doc-pager__link doc-pager__link--next"
          href={documentationHref(hostname, next.href)}
          rel="next"
        >
          <span>Next</span> <strong>{next.label}</strong>
        </a>
      )}
    </nav>
  );
}
