// Shared playground query results for tests and design-sync previews.
import type { PlaygroundQueryResponse } from "../../src/lib/playground-contracts.js";

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
