import { useMemo } from "react";
import type { ReactNode } from "react";

import type { PlaygroundQueryResponse } from "../../../lib/playground-contracts.js";
import { CopyJsonButton } from "./CopyJsonButton.js";

/** The hosted response, pretty-printed from the already validated result. */
export function JsonPanel({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const json = useMemo(() => JSON.stringify(result, null, 2), [result]);
  return (
    <>
      <div className="query-json-toolbar">
        <span>Hosted response</span>
        <CopyJsonButton text={json} />
      </div>
      <pre>
        <code>{json}</code>
      </pre>
    </>
  );
}
