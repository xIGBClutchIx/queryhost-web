import type { ReactNode } from "react";

import type {
  JsonObject,
  PlaygroundQueryResponse,
} from "../../../lib/playground-contracts.js";
import { readableKey, scalarText } from "../../../lib/playground-form.js";

function DataList({ data }: { readonly data: JsonObject }): ReactNode {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="query-data-empty">
        This server did not return game-specific fields.
      </p>
    );
  }
  return entries.map(([key, value]) => {
    const scalar = scalarText(value);
    return (
      <div key={key}>
        <span>{readableKey(key)}</span>
        <div>
          {scalar ?? (
            <pre>
              <code>{JSON.stringify(value, null, 2)}</code>
            </pre>
          )}
        </div>
      </div>
    );
  });
}

/** Interpreted game data, plus untouched protocol data when the result has it. */
export function DataPanel({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  return (
    <>
      <div className="query-data-section">
        <h3>Game-specific data</h3>
        <div className="query-data-list">
          <DataList data={result.ok ? result.data : {}} />
        </div>
      </div>
      {result.ok && result.rawData !== undefined && (
        <div className="query-data-section">
          <h3>Raw protocol data</h3>
          <div className="query-data-list">
            <DataList data={result.rawData} />
          </div>
        </div>
      )}
    </>
  );
}
