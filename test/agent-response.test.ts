import { describe, expect, it } from "vitest";

import { parseAgentResponse } from "../src/server/agent-response.js";

const ecoResult = {
  ok: true,
  game: "eco",
  partial: false,
  server: { name: "Green Valley", players: { online: 2 }, queryRttMs: 12 },
  data: { players: ["Ada", "Linus"], totalPlayers: 41 },
  rawData: { description: "<b>Green Valley</b>" },
  sources: [{ source: "eco-frontpage", status: "ok", rttMs: 12 }],
  warnings: [],
  durationMs: 30,
  cache: { status: "miss", ageMs: 0, ttlMs: 10_000 },
};

describe("agent response validation", () => {
  it("accepts every source the library can report", () => {
    expect(parseAgentResponse(JSON.stringify(ecoResult), "eco")).toEqual(
      ecoResult,
    );
  });

  it("rejects source names outside the library contract", () => {
    const unknown = {
      ...ecoResult,
      sources: [{ source: "eco-unknown", status: "ok" }],
    };
    expect(() => parseAgentResponse(JSON.stringify(unknown), "eco")).toThrow();
  });
});
