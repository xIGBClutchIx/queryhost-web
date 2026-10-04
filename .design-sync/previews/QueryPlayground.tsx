import type { ReactNode } from "react";
import { QueryPlayground } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({
  children,
  width = 1040,
  height,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        width,
        minHeight: height,
      }}
    >
      {children}
    </div>
  );
}

// Snapshot of the site's browser-safe registry projection (PLAYGROUND_GAMES) for six games.
const GAMES = [
  {
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "conditional",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
    defaultMode: "full",
    defaultPort: 27015,
    id: "counter-strike-2",
    name: "Counter-Strike 2",
  },
  {
    capabilities: {
      summary: "supported",
      players: "supported",
      rules: "unsupported",
      mods: "unsupported",
      plugins: "conditional",
      resources: "unsupported",
      srv: "conditional",
    },
    defaultMode: "summary",
    defaultPort: 25565,
    id: "minecraft-java",
    name: "Minecraft: Java Edition",
  },
  {
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "conditional",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
    defaultMode: "full",
    defaultPort: 8211,
    defaultQueryPort: 27015,
    queryPortStrategy: "fixed",
    id: "palworld",
    name: "Palworld",
  },
  {
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "conditional",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
    defaultMode: "full",
    defaultPort: 28015,
    defaultQueryPort: 28017,
    id: "rust",
    name: "Rust",
  },
  {
    capabilities: {
      summary: "supported",
      players: "unsupported",
      rules: "unsupported",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
    defaultMode: "full",
    defaultPort: 7777,
    id: "satisfactory",
    name: "Satisfactory",
  },
  {
    capabilities: {
      summary: "supported",
      players: "conditional",
      rules: "unsupported",
      mods: "unsupported",
      plugins: "unsupported",
      resources: "unsupported",
      srv: "unsupported",
    },
    defaultMode: "full",
    defaultPort: 2456,
    defaultQueryPort: 2457,
    id: "valheim",
    name: "Valheim",
  },
];

export const Empty = () => (
  <Page width={1100}>
    <QueryPlayground games={GAMES} search="" />
  </Page>
);

export const PrefilledFromLink = () => (
  <Page width={1100}>
    <QueryPlayground
      games={GAMES}
      search="?game=rust&host=play.rustopia.example&port=28015"
    />
  </Page>
);
