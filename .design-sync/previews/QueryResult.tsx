import type { ReactNode } from "react";
import { QueryResult } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page surface.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        borderRadius: 8,
      }}
    >
      <section className="query-output">{children}</section>
    </div>
  );
}

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
] as const;

const MINECRAFT = {
  ok: true,
  game: "minecraft-java",
  durationMs: 48.6,
  partial: false,
  cache: { status: "miss", ageMs: 0, ttlMs: 10000 },
  server: {
    name: "Blockhaven Survival",
    version: "1.21.4",
    players: { online: 37, max: 120 },
    queryRttMs: 21.4,
  },
  data: {
    motd: {
      plain: "Blockhaven Survival — new season live!",
      html: '<span style="color:#55ffff">Blockhaven Survival</span> — <b>new season live!</b>',
    },
    onlineMode: true,
    protocolVersion: 769,
  },
  sources: [
    { source: "minecraft-srv", status: "ok", rttMs: 3.2 },
    { source: "minecraft-slp", status: "ok", rttMs: 21.4 },
    { source: "minecraft-query", status: "not-requested" },
  ],
  warnings: [],
} as const;

const RUST_PARTIAL = {
  ok: true,
  game: "rust",
  durationMs: 312.9,
  partial: true,
  cache: { status: "hit", ageMs: 4200, ttlMs: 10000 },
  server: {
    name: "Rusty Moose |US Main|",
    map: "Procedural Map",
    version: "2589",
    players: { online: 184, max: 200 },
    password: false,
    queryRttMs: 38.1,
  },
  data: { gameType: "vanilla", worldSize: 4250, fps: 61 },
  sources: [
    { source: "a2s-info", status: "ok", rttMs: 38.1 },
    { source: "a2s-player", status: "ok", rttMs: 41.7 },
    { source: "a2s-rules", status: "timeout" },
  ],
  warnings: [
    {
      code: "SOURCE_TIMEOUT",
      message:
        "The server did not answer the rules request before the deadline.",
      source: "a2s-rules",
    },
  ],
} as const;

const RUST_OFFLINE = {
  ok: false,
  game: "rust",
  durationMs: 5003.2,
  cache: { status: "miss", ageMs: 0, ttlMs: 10000 },
  error: {
    code: "TIMEOUT",
    message: "The server did not respond before the 5 second deadline.",
  },
  sources: [{ source: "a2s-info", status: "timeout" }],
  warnings: [],
} as const;

export function Online(): ReactNode {
  return (
    <Page>
      <QueryResult games={GAMES} result={MINECRAFT} />
    </Page>
  );
}

export function PartialWithWarning(): ReactNode {
  return (
    <Page>
      <QueryResult games={GAMES} result={RUST_PARTIAL} />
    </Page>
  );
}

export function Offline(): ReactNode {
  return (
    <Page>
      <QueryResult games={GAMES} result={RUST_OFFLINE} />
    </Page>
  );
}
