import type { ReactNode } from "react";
import { PLAYGROUND_GAMES, QueryPlayground } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so the page supplies its own background.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="home-page"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      {children}
    </div>
  );
}

/** First visit: Minecraft selected, default port filled in. */
export function Empty(): ReactNode {
  return (
    <Page>
      <QueryPlayground games={PLAYGROUND_GAMES} search="" />
    </Page>
  );
}

/** A shared link renders already filled in. */
export function SharedLink(): ReactNode {
  return (
    <Page>
      <QueryPlayground
        games={PLAYGROUND_GAMES}
        search="?game=rust&host=us-main.rustymoose.com&port=28015"
      />
    </Page>
  );
}

/** A query port in the link opens the advanced options. */
export function AdvancedOptions(): ReactNode {
  return (
    <Page>
      <QueryPlayground
        games={PLAYGROUND_GAMES}
        search="?game=palworld&host=pal.example.net&port=8211&queryPort=27015&timeoutMs=3000"
      />
    </Page>
  );
}
