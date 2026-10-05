import type { ReactNode } from "react";
import { Callout } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page surface.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="doc-prose"
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}

export function Info(): ReactNode {
  return (
    <Page>
      <Callout title="Hosted queries are cached">
        <p>
          Identical queries within ten seconds share one upstream request, so
          refreshing the playground never floods a game server.
        </p>
      </Callout>
    </Page>
  );
}

export function Warning(): ReactNode {
  return (
    <Page>
      <Callout title="Query port must be reachable" tone="warning">
        <p>
          Rust answers status queries on its query port (usually{" "}
          <code>28017</code>), not the game port players connect to. Open both
          in your firewall.
        </p>
      </Callout>
    </Page>
  );
}

export function WithList(): ReactNode {
  return (
    <Page>
      <Callout title="Before you query">
        <ul>
          <li>Use the public hostname or IP address, not a LAN address.</li>
          <li>Leave the port empty to use the game&apos;s default.</li>
          <li>Pick Full details to request players and rules.</li>
        </ul>
      </Callout>
    </Page>
  );
}
