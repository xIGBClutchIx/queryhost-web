import type { ReactNode } from "react";
import { Callout } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        maxWidth: 720,
      }}
    >
      {children}
    </div>
  );
}

export const Info = () => (
  <Page>
    <Callout title="Missing is not empty">
      <p>
        An omitted player list means QueryHost could not confirm it. An empty
        player list means a source completed and confirmed no listed players.
      </p>
    </Callout>
  </Page>
);

export const Warning = () => (
  <Page>
    <Callout
      title="Do not infer offline from enrichment failure"
      tone="warning"
    >
      <p>
        A timed-out optional player or rules source does not make a server
        offline when its required status source succeeded.
      </p>
    </Callout>
  </Page>
);

export const WithInlineCode = () => (
  <Page>
    <Callout title="Minecraft Java discovery">
      <p>
        When the host is a DNS name and <code>port</code> is omitted, Minecraft
        Java may discover an SRV destination. Supplying an explicit port or IP
        literal bypasses SRV.
      </p>
    </Callout>
  </Page>
);
