import type {
  DetectErrorCode,
  QueryErrorCode,
  QueryWarningCode,
} from "queryhost";
import type { ReactNode } from "react";

import { Callout } from "../../components/Callout.js";
import { CodeBlock } from "../../components/CodeBlock.js";
import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";

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

// Typed against the package's code unions, so a code added or removed upstream fails the build
// until this page lists it.
const QUERY_ERROR_CODES = {
  ABORTED: [
    "The caller's signal cancelled the query.",
    "Respect the cancellation; do not retry on the caller's behalf.",
  ],
  CONNECTION_FAILED: [
    "The server refused or closed the connection, or answered with an error status.",
    "Retry later; the server may be down or the port closed.",
  ],
  DNS_FAILED: [
    "The hostname did not resolve to a usable address.",
    "Check the hostname; retry only if DNS may be briefly unavailable.",
  ],
  INTERNAL_ERROR: [
    "An unexpected implementation failure, kept out of the result's details.",
    "Log it outside the result and report it.",
  ],
  INVALID_INPUT: [
    "The game, host, port, mode, or deadline is not valid.",
    "Correct the request; do not retry unchanged.",
  ],
  MALFORMED_RESPONSE: [
    "The server answered with data that does not match its protocol.",
    "Treat the source as unusable; check the game and port.",
  ],
  RESPONSE_TOO_LARGE: [
    "The response exceeded the protocol's size limits.",
    "Treat the source as unusable; limits are not negotiable.",
  ],
  TARGET_BLOCKED: [
    "The destination is not a public address the safety policy allows.",
    "Use a public host; do not retry unchanged.",
  ],
  TIMEOUT: [
    "The required source did not answer before the query deadline.",
    "Retry with backoff, or raise timeoutMs.",
  ],
} as const satisfies Record<QueryErrorCode, readonly [string, string]>;

const DETECT_ERROR_CODES = {
  ABORTED: QUERY_ERROR_CODES.ABORTED,
  DNS_FAILED: QUERY_ERROR_CODES.DNS_FAILED,
  INVALID_INPUT: QUERY_ERROR_CODES.INVALID_INPUT,
  NOT_DETECTED: [
    "No planned probe identified a supported game.",
    "Pass the port players connect to, or raise maxProbes.",
  ],
  TARGET_BLOCKED: QUERY_ERROR_CODES.TARGET_BLOCKED,
} as const satisfies Record<DetectErrorCode, readonly [string, string]>;

const QUERY_WARNING_CODES = {
  PARTIAL_RESULT: [
    "One or more optional sources did not complete.",
    "Use the result; check sources for what is missing.",
  ],
  PLAYER_LIST_UNAVAILABLE: [
    "The player list could not be read; counts may still be present.",
    "Show the count without names.",
  ],
  SOURCE_BLOCKED: [
    "An optional source's destination was not allowed.",
    "Use the result without that source.",
  ],
  SOURCE_FAILED: [
    "An optional source failed to connect or answer.",
    "Use the result without that source.",
  ],
  SOURCE_MALFORMED: [
    "An optional source answered with data that does not match its protocol.",
    "Use the result without that source.",
  ],
  SOURCE_TIMEOUT: [
    "An optional source did not answer before the deadline.",
    "Use the result, or retry with a longer timeoutMs.",
  ],
} as const satisfies Record<QueryWarningCode, readonly [string, string]>;

interface CodeTableProps {
  readonly codes: Readonly<Record<string, readonly [string, string]>>;
  readonly label: string;
}

function CodeTable({ codes, label }: CodeTableProps): ReactNode {
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
          {Object.entries(codes).map(([code, [meaning, response]]) => (
            <tr key={code}>
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
      <CodeTable codes={QUERY_ERROR_CODES} label="Query error codes" />
      <h2 id="detect">Detection failures</h2>
      <p>
        A failed <code>detect()</code> reports a <code>DetectErrorCode</code>:
        the input and target codes above, or <code>NOT_DETECTED</code> when no
        game was identified. Once a game is detected, its own query can still
        fail with any query error code.
      </p>
      <CodeTable codes={DETECT_ERROR_CODES} label="Detection error codes" />
      <h2 id="warnings">Warnings and provenance</h2>
      <p>
        Warnings are non-fatal. They explain why <code>partial</code> is true
        and can point at a specific source. The source report remains the
        authoritative outcome for every attempted, skipped, blocked, or
        unsupported source.
      </p>
      <CodeTable codes={QUERY_WARNING_CODES} label="Warning codes" />
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
