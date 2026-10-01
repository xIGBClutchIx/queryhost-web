import { describe, expect, it } from "vitest";
import {
  agentQueryResult,
  queryHostAgentTools,
} from "../src/lib/agent-tools.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import type {
  PlaygroundQueryInput,
  PlaygroundQuerySuccess,
} from "../src/lib/playground-contracts.js";

const SUCCESS: PlaygroundQuerySuccess = {
  ok: true,
  game: "minecraft-java",
  durationMs: 0,
  sources: [{ source: "minecraft-slp", status: "ok", rttMs: 0 }],
  warnings: [],
  partial: false,
  cache: { ageMs: 0, ttlMs: 0, status: "miss" },
  data: {},
  server: {
    name: "",
    password: false,
    players: { online: 0, max: 0 },
    queryRttMs: 0,
  },
};
const INPUT: PlaygroundQueryInput = {
  game: "minecraft-java",
  host: "play.example.com",
};

describe("shared agent tools", () => {
  it("preserves confirmed zero, empty and false values and provides an encoded share link", () => {
    const output = agentQueryResult(INPUT, SUCCESS);
    expect(output.result).toEqual(SUCCESS);
    expect(output.summary).toContain("players online: 0");
    expect(output.summary).toContain("query RTT: 0 ms");
    expect(new URL(output.playgroundUrl).searchParams.get("host")).toBe(
      INPUT.host,
    );
    const missing = agentQueryResult(INPUT, { ...SUCCESS, server: {} });
    expect(missing.summary).not.toContain("players");
    expect(missing.summary).not.toContain("RTT");
  });

  it("returns partial warnings and never calls a failed query offline", () => {
    expect(
      agentQueryResult(INPUT, {
        ...SUCCESS,
        partial: true,
        warnings: [{ code: "SOURCE_TIMEOUT", message: "Timed out." }],
      }).summary,
    ).toContain("partial result");
    const result = agentQueryResult(INPUT, {
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable." },
    });
    expect(result.summary).toContain("Query failed");
    expect(result.summary).not.toContain("offline");
  });

  it("validates all comparison inputs before work and preserves order with individual failures", async () => {
    const calls: PlaygroundQueryInput[] = [];
    let active = 0;
    const tools = queryHostAgentTools(PLAYGROUND_GAMES, {
      queryGameServer: async (input) => {
        expect(active++).toBe(0);
        calls.push(input);
        await Promise.resolve();
        active--;
        return input.host === "fail.example.com"
          ? { error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable." } }
          : SUCCESS;
      },
    });
    const compare = tools.find((tool) => tool.name === "compare_game_servers");
    if (compare === undefined) throw new Error("Missing comparison tool.");
    await expect(
      compare.execute({ servers: [INPUT, { ...INPUT, secret: "reject" }] }),
    ).rejects.toThrow();
    await expect(
      compare.execute({ servers: Array.from({ length: 5 }, () => INPUT) }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
    const output = await compare.execute({
      servers: [INPUT, { ...INPUT, host: "fail.example.com" }],
    });
    expect(output).toMatchObject({
      results: [
        { input: INPUT, result: { ok: true } },
        {
          input: { host: "fail.example.com" },
          result: { error: { code: "UPSTREAM_UNAVAILABLE" } },
        },
      ],
    });
    expect(calls.map((input) => input.host)).toEqual([
      INPUT.host,
      "fail.example.com",
    ]);
  });

  it("rejects invalid generic A2S ports, aliases, and URL-shaped hosts before querying", async () => {
    let calls = 0;
    const tool = queryHostAgentTools(PLAYGROUND_GAMES, {
      queryGameServer: () => {
        calls++;
        return Promise.resolve(SUCCESS);
      },
    }).find((candidate) => candidate.name === "query_game_server");
    if (tool === undefined) throw new Error("Missing query tool.");
    for (const input of [
      { game: "a2s", host: INPUT.host },
      { game: "a2s", host: INPUT.host, port: 27015, queryPort: 27016 },
      { ...INPUT, host: "https://example.com" },
      { ...INPUT, game: "minecraft" },
    ]) {
      await expect(tool.execute(input)).rejects.toThrow();
    }
    expect(calls).toBe(0);
    await tool.execute({ game: "a2s", host: INPUT.host, port: 27015 });
    expect(calls).toBe(1);
  });

  it("stops a comparison on cancellation before starting later queries", async () => {
    const controller = new AbortController();
    let calls = 0;
    const compare = queryHostAgentTools(PLAYGROUND_GAMES, {
      queryGameServer: () => {
        calls++;
        controller.abort();
        return Promise.resolve(SUCCESS);
      },
    }).find((tool) => tool.name === "compare_game_servers");
    if (compare === undefined) throw new Error("Missing comparison tool.");
    await expect(
      compare.execute(
        { servers: [INPUT, INPUT] },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
