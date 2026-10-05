import type { ReactNode } from "react";
import { QueryPlayground } from "@queryhost/web";

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

// A slice of the browser-safe registry projection the server serializes into the page.
const GAMES = [
  {
    id: "minecraft-java",
    name: "Minecraft: Java Edition",
    defaultMode: "summary",
    defaultPort: 25565,
    capabilities: {
      summary: "supported",
      players: "supported",
      rules: "unsupported",
      mods: "unsupported",
      plugins: "conditional",
      resources: "unsupported",
      srv: "conditional",
    },
  },
  {
    id: "rust",
    name: "Rust",
    defaultMode: "full",
    defaultPort: 28015,
    defaultQueryPort: 28017,
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "conditional",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
  },
  {
    id: "palworld",
    name: "Palworld",
    defaultMode: "full",
    defaultPort: 8211,
    defaultQueryPort: 27015,
    queryPortStrategy: "fixed",
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "conditional",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
  },
  {
    id: "valheim",
    name: "Valheim",
    defaultMode: "full",
    defaultPort: 2456,
    defaultQueryPort: 2457,
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "unsupported",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
  },
] as const;

/** First visit: Minecraft selected, default port filled in. */
export function Empty(): ReactNode {
  return (
    <Page>
      <QueryPlayground games={GAMES} search="" />
    </Page>
  );
}

/** A shared link renders already filled in. */
export function SharedLink(): ReactNode {
  return (
    <Page>
      <QueryPlayground
        games={GAMES}
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
        games={GAMES}
        search="?game=palworld&host=pal.example.net&port=8211&queryPort=27015&timeoutMs=3000"
      />
    </Page>
  );
}
