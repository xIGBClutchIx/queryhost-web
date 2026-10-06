// Shared playground fixtures for tests and design-sync previews. Previews bundle for the
// browser, so this module may only import types: `queryhost` itself is Node-only.
import type {
  PlaygroundGameDefinition,
  PlaygroundQueryResponse,
} from "../../src/lib/playground-contracts.js";

/** A slice of the registry projection; a test keeps it equal to `PLAYGROUND_GAMES`. */
export const PREVIEW_GAMES: readonly PlaygroundGameDefinition[] = [
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
];

export const MINECRAFT_ONLINE: PlaygroundQueryResponse = {
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
};

export const RUST_PARTIAL: PlaygroundQueryResponse = {
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
};

export const RUST_OFFLINE: PlaygroundQueryResponse = {
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
};
