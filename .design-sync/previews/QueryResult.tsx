import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { QueryResult } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({ children, tab }: { children: ReactNode; tab?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Result tabs switch only through interaction, so non-default tabs click the real tab.
    if (tab !== undefined)
      ref.current
        ?.querySelector<HTMLButtonElement>(`#query-tab-${tab}`)
        ?.click();
  }, [tab]);
  return (
    <div
      ref={ref}
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        width: 880,
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

const MINECRAFT = {
  ok: true,
  game: "minecraft-java",
  durationMs: 84,
  partial: false,
  server: {
    name: "Blocktopia Survival",
    version: "1.21.4",
    players: { online: 37, max: 120 },
    queryRttMs: 41,
  },
  data: {
    motd: "Blocktopia Survival | Season 6 is live",
    protocolVersion: 769,
    enforcesSecureChat: true,
  },
  sources: [
    { source: "minecraft-srv", status: "ok", rttMs: 12 },
    { source: "minecraft-slp", status: "ok", rttMs: 41 },
  ],
  warnings: [],
  cache: { status: "miss", ageMs: 0, ttlMs: 15000 },
} as const;

const RUST_PARTIAL = {
  ok: true,
  game: "rust",
  durationMs: 3012,
  partial: true,
  server: {
    name: "Rustopia EU Main | Monthly Wipe",
    map: "Procedural Map",
    password: false,
    players: { online: 184, max: 200 },
    queryRttMs: 28,
  },
  data: { gameType: "rust", vac: true, environment: "linux" },
  sources: [
    { source: "a2s-info", status: "ok", rttMs: 28 },
    { source: "a2s-player", status: "timeout" },
    { source: "a2s-rules", status: "ok", rttMs: 33 },
  ],
  warnings: [
    {
      code: "SOURCE_TIMEOUT",
      message: "The player list source did not answer before the deadline.",
      source: "a2s-player",
    },
  ],
  cache: { status: "hit", ageMs: 4200, ttlMs: 15000 },
} as const;

const VALHEIM_TIMEOUT = {
  ok: false,
  game: "valheim",
  durationMs: 5003,
  error: {
    code: "TIMEOUT",
    message: "The server did not respond before the deadline.",
    source: "a2s-info",
  },
  sources: [{ source: "a2s-info", status: "timeout" }],
  warnings: [],
  cache: { status: "miss", ageMs: 0, ttlMs: 5000 },
} as const;

export const Online = () => (
  <Page>
    <QueryResult
      games={GAMES}
      raw={JSON.stringify(MINECRAFT)}
      result={MINECRAFT}
    />
  </Page>
);

export const PartialWithWarning = () => (
  <Page>
    <QueryResult
      games={GAMES}
      raw={JSON.stringify(RUST_PARTIAL)}
      result={RUST_PARTIAL}
    />
  </Page>
);

export const Offline = () => (
  <Page>
    <QueryResult
      games={GAMES}
      raw={JSON.stringify(VALHEIM_TIMEOUT)}
      result={VALHEIM_TIMEOUT}
    />
  </Page>
);

export const SourcesTab = () => (
  <Page tab="sources">
    <QueryResult
      games={GAMES}
      raw={JSON.stringify(RUST_PARTIAL)}
      result={RUST_PARTIAL}
    />
  </Page>
);

export const JsonTab = () => (
  <Page tab="json">
    <QueryResult
      games={GAMES}
      raw={JSON.stringify(MINECRAFT)}
      result={MINECRAFT}
    />
  </Page>
);
