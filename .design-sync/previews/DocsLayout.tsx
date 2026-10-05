import type { ReactNode } from "react";
import { Callout, DocsLayout } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so the page supplies its own background.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="docs-page"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      {children}
    </div>
  );
}

export function QueryingGuide(): ReactNode {
  return (
    <Page>
      <DocsLayout
        activeHref="/querying/"
        eyebrow="Core library"
        title="Query a server"
        description="Choose a game profile and let QueryHost apply its protocol, discovery, port, and safety rules."
        hostname="docs.query.host"
      >
        <h2 id="input">Query input</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Required</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>game</code>
              </td>
              <td>Yes</td>
              <td>The game profile, such as rust or minecraft-java.</td>
            </tr>
            <tr>
              <td>
                <code>host</code>
              </td>
              <td>Yes</td>
              <td>A public hostname or IP address.</td>
            </tr>
            <tr>
              <td>
                <code>port</code>
              </td>
              <td>No</td>
              <td>Defaults to the game&apos;s standard port.</td>
            </tr>
          </tbody>
        </table>
        <Callout title="Private addresses are blocked">
          <p>
            Loopback, link-local, and private network targets are rejected
            before any packet is sent.
          </p>
        </Callout>
      </DocsLayout>
    </Page>
  );
}
