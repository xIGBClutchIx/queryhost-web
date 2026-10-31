import {
  type CodeGuidance,
  DETECT_ERROR_GUIDANCE,
  QUERY_ERROR_GUIDANCE,
  QUERY_WARNING_GUIDANCE,
} from "queryhost/registry";
import type { ReactNode } from "react";

import { Callout } from "../../components/Callout.js";
import { CodeBlock } from "../../components/CodeBlock.js";
import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import { codeAnchor } from "../../lib/docs-search.js";

export const metadata = {
  activeHref: "/errors/",
  contents: true,
  eyebrow: "Failure handling",
  title: "Errors and warnings",
  description:
    "Failures use stable public codes; optional-source problems remain attached to successful partial results.",
} as const satisfies DocsPageMetadata;

const errorExample = `const result = await query(input);

if (!result.ok) {
  switch (result.error.code) {
    case "TIMEOUT":
      // The required source exceeded the query deadline.
      break;
    case "TARGET_BLOCKED":
      // The destination is not allowed by the public-address policy.
      break;
    default:
      // Handle other stable QueryErrorCode values.
  }
}`;

interface CodeTableProps {
  /** Prefix of each row's anchor, which docs search links to. */
  readonly anchor: string;
  readonly codes: Readonly<Record<string, CodeGuidance>>;
  readonly label: string;
}

function CodeTable({ anchor, codes, label }: CodeTableProps): ReactNode {
  return (
    <div className="table-scroll">
      <table className="data-table code-table">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Meaning</th>
            <th scope="col">Typical response</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(codes)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, { meaning, response }]) => (
              <tr key={code} id={codeAnchor(anchor, code)}>
                <th scope="row">
                  <code>{code}</code>
                </th>
                <td>{meaning}</td>
                <td>{response}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorsPage(): ReactNode {
  return (
    <DocsLayout {...metadata}>
      <h2 id="failures">Query failures</h2>
      <p>
        A failure means the profile's required source could not produce a usable
        result. The public error contains a stable code, safe message, and
        optional source name. Internal exceptions are never exposed through the
        contract.
      </p>
      <CodeBlock
        code={errorExample}
        label="Handle stable error codes"
        language="TypeScript"
      />
      <h2 id="codes">Error codes</h2>
      <p>
        <code>result.error.code</code> is always one of these{" "}
        <code>QueryErrorCode</code> values.
      </p>
      <CodeTable
        anchor="error"
        codes={QUERY_ERROR_GUIDANCE}
        label="Query error codes"
      />
      <h2 id="detect">Detection failures</h2>
      <p>
        A failed <code>detect()</code> reports a <code>DetectErrorCode</code>:
        the input and target codes above, or <code>NOT_DETECTED</code> when no
        game was identified. Once a game is detected, its own query can still
        fail with any query error code.
      </p>
      <CodeTable
        anchor="detect"
        codes={DETECT_ERROR_GUIDANCE}
        label="Detection error codes"
      />
      <h2 id="warnings">Warnings and provenance</h2>
      <p>
        Warnings are non-fatal. They explain why <code>partial</code> is true
        and can point at a specific source. The source report remains the
        authoritative outcome for every attempted, skipped, blocked, or
        unsupported source.
      </p>
      <CodeTable
        anchor="warning"
        codes={QUERY_WARNING_GUIDANCE}
        label="Warning codes"
      />
      <Callout
        title="Do not infer offline from enrichment failure"
        tone="warning"
      >
        <p>
          A timed-out optional player or rules source does not make a server
          offline when its required status source succeeded.
        </p>
      </Callout>
    </DocsLayout>
  );
}
