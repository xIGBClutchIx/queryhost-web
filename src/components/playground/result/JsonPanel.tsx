import { useMemo } from "react";
import type { ReactNode } from "react";

import type { PlaygroundQueryResponse } from "../../../lib/playground-contracts.js";
import { CopyButton } from "./CopyButton.js";

/** The hosted response, pretty-printed from the already validated result. */
export function JsonPanel({
  badge,
  result,
}: {
  /** Markdown for this server's status badge, when the query input is known. */
  readonly badge?: string | undefined;
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const json = useMemo(() => JSON.stringify(result, null, 2), [result]);
  return (
    <>
      <div className="query-json-toolbar">
        <span>Hosted response</span>
        <div className="query-json-toolbar__actions">
          {badge !== undefined && (
            <CopyButton label="Copy badge" text={badge} />
          )}
          <CopyButton label="Copy JSON" text={json} />
        </div>
      </div>
      <pre>
        <code>{json}</code>
      </pre>
    </>
  );
}
