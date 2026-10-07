import type { ReactNode } from "react";

import { Callout } from "../../components/Callout.js";
import { CodeBlock } from "../../components/CodeBlock.js";
import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import { documentationHref } from "../../lib/site.js";

export const metadata = {
  activeHref: "/public-api/",
  contents: true,
  eyebrow: "HTTP API",
  title: "Public API",
  description:
    "Query game servers over HTTPS without installing the library. Version 1 needs no key and allows calls from any origin.",
} as const satisfies DocsPageMetadata;

const curlExample = `curl https://query.host/api/v1/query \\
  -H 'Content-Type: application/json' \\
  -d '{"game":"minecraft","host":"mc.example.com","mode":"summary"}'`;

const fetchExample = `const response = await fetch("https://query.host/api/v1/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ game: "rust", host: "203.0.113.5", port: 28015 }),
});

if (response.status === 429) {
  const seconds = Number(response.headers.get("Retry-After") ?? "1");
  // Wait before retrying; do not retry in a tight loop.
}

const result = await response.json();
if (result.ok) {
  console.log(result.data.players.online);
}`;

export function PublicApiPage(): ReactNode {
  return (
    <DocsLayout {...metadata}>
      <h2 id="base-url">Base URL</h2>
      <p>
        Every route lives under <code>https://query.host/api/v1</code>. Requests
        and responses are JSON. There are no API keys, and callers are limited
        by IP address.
      </p>
      <h2 id="query">Query a server</h2>
      <p>
        <code>POST /api/v1/query</code> runs one live query, using the hosted
        cache. It accepts the same input as the library&apos;s{" "}
        <code>query()</code> function, and no other fields.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>game</code>
            </td>
            <td>string</td>
            <td>Required. A supported game ID or alias.</td>
          </tr>
          <tr>
            <td>
              <code>host</code>
            </td>
            <td>string</td>
            <td>Required. A public hostname or IP address, not a URL.</td>
          </tr>
          <tr>
            <td>
              <code>port</code>
            </td>
            <td>integer</td>
            <td>
              Game port, 1 through 65,535. Required for generic <code>a2s</code>
              .
            </td>
          </tr>
          <tr>
            <td>
              <code>queryPort</code>
            </td>
            <td>integer</td>
            <td>Overrides the profile&apos;s query port.</td>
          </tr>
          <tr>
            <td>
              <code>mode</code>
            </td>
            <td>
              <code>summary</code> or <code>full</code>
            </td>
            <td>
              Defaults to <code>full</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>timeoutMs</code>
            </td>
            <td>integer</td>
            <td>1 through 5,000. Defaults to 5,000.</td>
          </tr>
        </tbody>
      </table>
      <CodeBlock code={curlExample} label="Query with curl" language="shell" />
      <CodeBlock
        code={fetchExample}
        label="Query from a browser or Node.js"
        language="TypeScript"
      />
      <p>
        A query that reaches a server returns HTTP <code>200</code> with the
        library result, even when the server is offline or times out. Check{" "}
        <code>ok</code> in the body, as described in{" "}
        <a href={documentationHref("/results/")}>Result semantics</a>. The added{" "}
        <code>cache</code> field and the <code>x-queryhost-cache</code> header
        say whether the result was live (<code>miss</code>), shared with an
        identical request (<code>coalesced</code>), or reused (<code>hit</code>
        ).
      </p>
      <h2 id="games">List games</h2>
      <p>
        <code>GET /api/v1/games</code> returns <code>{"{ games: [...] }"}</code>{" "}
        with every supported game&apos;s ID, aliases, default ports, and
        capabilities, straight from the library&apos;s registry.
      </p>
      <h2 id="limits">Limits</h2>
      <ul>
        <li>8 queries per IP address each minute.</li>
        <li>60 queries per minute across all public API callers.</li>
        <li>
          Results are cached for up to 10 seconds, so polling faster than that
          returns the same data.
        </li>
        <li>Request bodies are capped at 2 KiB.</li>
      </ul>
      <p>
        Past a limit the API returns <code>429</code> with a{" "}
        <code>Retry-After</code> header. The playground on query.host has its
        own budget, so API traffic never blocks it.
      </p>
      <h2 id="errors">HTTP errors</h2>
      <p>
        Request failures return <code>{"{ error: { code, message } }"}</code>.
        Codes are <code>BAD_REQUEST</code>, <code>BODY_TOO_LARGE</code>,{" "}
        <code>METHOD_NOT_ALLOWED</code>, <code>NOT_FOUND</code>,{" "}
        <code>RATE_LIMITED</code> (your IP or the API budget),{" "}
        <code>OVERLOADED</code> (the query service is at capacity),{" "}
        <code>UPSTREAM_INVALID</code>, and <code>UPSTREAM_UNAVAILABLE</code>.
      </p>
      <h2 id="cors">Browser use</h2>
      <p>
        Every route sends <code>Access-Control-Allow-Origin: *</code>, so web
        apps on any site can call the API directly. Requests never carry cookies
        or credentials.
      </p>
      <h2 id="versioning">Versioning</h2>
      <p>
        <code>v1</code> only changes in compatible ways: new games, new optional
        result fields, and new error codes. Treat unknown fields and codes as
        optional. A breaking change will ship as <code>v2</code> alongside{" "}
        <code>v1</code>.
      </p>
      <Callout title="Fair use">
        <p>
          The API is free and runs on a small budget. Cache results on your
          side, do not scan address ranges, and see the{" "}
          <a href="/terms">terms</a>. For heavy or private use, run the{" "}
          <code>queryhost</code> library yourself.
        </p>
      </Callout>
    </DocsLayout>
  );
}
