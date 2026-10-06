import type { ReactNode } from "react";

import type { PlaygroundQueryResponse } from "../../../lib/playground-contracts.js";
import { milliseconds, readableKey } from "../../../lib/playground-form.js";

/** Every protocol source the query touched, with its status and round trip. */
export function SourcesPanel({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  return (
    <div className="query-source-list">
      {result.sources.map((source) => (
        <div key={source.source}>
          <div>
            <span
              className={`query-source-dot query-source-dot--${source.status}`}
            />
            <strong>{source.source}</strong>
            <span>{readableKey(source.status)}</span>
          </div>
          <code>
            {source.rttMs === undefined ? "—" : milliseconds(source.rttMs)}
          </code>
        </div>
      ))}
    </div>
  );
}
