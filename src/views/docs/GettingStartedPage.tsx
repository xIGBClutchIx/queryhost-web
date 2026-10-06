import type { ReactNode } from "react";

import { CodeBlock } from "../../components/CodeBlock.js";
import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import type { PageProps } from "../page-props.js";
import { QUERYHOST_VERSION } from "../../lib/package-version.js";
import { GAMES } from "../../lib/queryhost.js";
import { documentationHref, GITHUB_REPOSITORY_URL } from "../../lib/site.js";

export const metadata = {
  activeHref: "/",
  contents: true,
  eyebrow: "Introduction",
  title: "Getting started",
  description:
    "Install QueryHost and make a typed game-server query from Node.js.",
} as const satisfies DocsPageMetadata;

const installSource = `npm install queryhost@${QUERYHOST_VERSION}`;
const namedGameCount = GAMES.filter((game) => game.id !== "a2s").length;
const firstQuery = `import { query } from "queryhost";

const result = await query({
  game: "rust",
  host: "play.example.com",
  port: 28015,
});

if (result.ok) {
  console.log(result.server.name);
  console.log(result.data.tags);
} else {
  console.error(result.error.code);
}`;

export function GettingStartedPage({ hostname }: PageProps): ReactNode {
  return (
    <DocsLayout {...metadata} hostname={hostname}>
      <section className="docs-start-panel" aria-labelledby="package-status">
        <div className="docs-start-panel__summary">
          <p className="docs-start-panel__label">Package status</p>
          <h2 id="package-status">QueryHost {QUERYHOST_VERSION}</h2>
          <p>
            The current release supports {namedGameCount} named game profiles
            plus generic A2S through one reviewed package-root contract.
          </p>
          <a className="docs-source-link" href={GITHUB_REPOSITORY_URL}>
            View QueryHost on GitHub
          </a>
        </div>
        <div
          className="docs-start-panel__requirements"
          aria-labelledby="requirements"
        >
          <h2 id="requirements">Before you start</h2>
          <dl>
            <div>
              <dt>Node.js</dt>
              <dd>24 or newer</dd>
            </div>
            <div>
              <dt>npm</dt>
              <dd>12</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>Server-side DNS, UDP, TCP, and HTTP</dd>
            </div>
          </dl>
        </div>
      </section>
      <h2 id="install">Install from npm</h2>
      <p>
        Install the exact current version with Node.js 24 or newer. Applications
        can relax the version range after choosing their own update policy.
      </p>
      <CodeBlock code={installSource} label="Terminal" language="shell" />
      <h2 id="first-query">Make a query</h2>
      <p>
        The literal <code>rust</code> game ID connects <code>result.data</code>{" "}
        to the <code>RustData</code> type. Always check <code>result.ok</code>{" "}
        before reading success or failure fields.
      </p>
      <CodeBlock code={firstQuery} label="query.ts" language="TypeScript" />
      <h2 id="next">Continue with the docs</h2>
      <nav
        className="docs-next-links"
        aria-label="Continue with the documentation"
      >
        <a href={documentationHref(hostname, "/querying/")}>
          <strong>Query a server</strong>{" "}
          <span>Ports, modes, deadlines, and accepted aliases.</span>
        </a>{" "}
        <a href={documentationHref(hostname, "/results/")}>
          <strong>Read a result</strong>{" "}
          <span>
            Normalized, game-specific, raw, and partial result semantics.
          </span>
        </a>{" "}
        <a href={documentationHref(hostname, "/games/")}>
          <strong>Compare supported games</strong>{" "}
          <span>
            Capabilities and conditional fields for every game profile.
          </span>
        </a>{" "}
        <a href={documentationHref(hostname, "/reference/")}>
          <strong>Open the API reference</strong>{" "}
          <span>Generated exports, signatures, and type contracts.</span>
        </a>
      </nav>
    </DocsLayout>
  );
}
