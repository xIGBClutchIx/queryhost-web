import { describe, expect, it } from "vitest";
import {
  compactMcpOutput,
  compactMcpResult,
  MCP_RESULT_BYTE_LIMIT,
} from "../src/server/mcp-projection.js";
import type { JsonObject } from "../src/lib/playground-contracts.js";

function envelope(data: JsonObject = {}): JsonObject {
  return {
    input: { game: "minecraft-java", host: "play.example.com" },
    summary: "Query succeeded; players online: 0; query RTT: 0 ms",
    playgroundUrl:
      "https://query.host/?game=minecraft-java&host=play.example.com",
    result: {
      ok: true,
      partial: false,
      game: "minecraft-java",
      durationMs: 0,
      sources: [{ source: "minecraft-slp", status: "ok", rttMs: 0 }],
      warnings: [
        {
          code: "PLAYER_LIST_UNAVAILABLE",
          message: "Player names unavailable.",
        },
      ],
      cache: { status: "hit", ageMs: 0, ttlMs: 0 },
      server: {
        name: "",
        password: false,
        players: { online: 0, max: 20 },
        queryRttMs: 0,
      },
      data,
      rawData: { bytes: "raw binary details" },
    },
  };
}

describe("remote MCP projection", () => {
  it("retains the first 20 players and 32 rule identifiers without inventing keys", () => {
    const output = compactMcpResult(
      envelope({
        players: Array.from({ length: 25 }, (_, index) => ({
          name: `Player ${index}`,
        })),
        rules: Object.fromEntries(
          Array.from({ length: 40 }, (_, index) => [`rule-${index}`, false]),
        ),
      }),
    );
    const result = output["result"] as JsonObject;
    const data = result["data"] as JsonObject;
    expect(data["players"]).toHaveLength(20);
    expect(Object.keys(data["rules"] as JsonObject)).toHaveLength(32);
    expect(output).toMatchObject({
      projection: {
        truncated: true,
        omittedFields: [
          "result.data.players",
          "result.data.rules",
          "result.rawData",
        ],
      },
    });
    const longKey = "x".repeat(200);
    const keyed = compactMcpResult(
      envelope({ rules: { [longKey]: 0, valid: false } }),
    );
    expect(JSON.stringify(keyed)).not.toContain(`"${"x".repeat(128)}":`);
    expect(keyed).toMatchObject({
      result: { data: { rules: { valid: false } } },
      projection: { truncated: true },
    });
  });
  it("removes binary assets, raw data and HTML without changing browser results", () => {
    const original = envelope({
      favicon: "data:image/png;base64,SECRET",
      motd: { plain: "", html: "<b>server</b>" },
    });
    const output = compactMcpResult(original);
    expect(output).toMatchObject({
      result: {
        ok: true,
        partial: false,
        server: {
          name: "",
          password: false,
          players: { online: 0, max: 20 },
          queryRttMs: 0,
        },
        data: { motd: { plain: "" } },
        sources: [{ rttMs: 0 }],
        cache: { ageMs: 0 },
      },
      projection: {
        truncated: true,
        omittedFields: [
          "result.data.favicon",
          "result.data.motd.html",
          "result.rawData",
        ],
      },
    });
    expect(JSON.stringify(output)).not.toContain("SECRET");
    expect(JSON.stringify(output)).not.toContain("raw binary details");
    expect(JSON.stringify(original)).toContain("SECRET");
  });

  it("bounds player lists, rule objects, nested data and UTF-8 strings explicitly", () => {
    const output = compactMcpResult(
      envelope({
        players: Array.from({ length: 100 }, (_, i) => ({
          name: `${i}: ${"🐈".repeat(500)}`,
        })),
        rules: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`rule${i}`, false]),
        ),
        nested: { a: { b: { c: { d: { e: "deep" } } } } },
        zero: 0,
        empty: [],
        confirmed: false,
      }),
    );
    expect(output).toMatchObject({
      projection: {
        truncated: true,
        limits: { arrayItems: 20, objectFields: 32, stringBytes: 512 },
      },
    });
    expect(
      new TextEncoder().encode(JSON.stringify(output)).byteLength,
    ).toBeLessThanOrEqual(MCP_RESULT_BYTE_LIMIT);
    expect(JSON.stringify(output)).not.toContain("🐈".repeat(129));
    expect(JSON.stringify(output)).not.toContain("deep");
  });

  it("retains missing and confirmed values, errors and ordered comparisons", () => {
    const success = envelope({ zero: 0, empty: [], confirmed: false });
    const failure = {
      ...success,
      result: {
        ok: false,
        error: { code: "TIMEOUT", message: "Timed out." },
        sources: [],
        warnings: [],
      },
    };
    const output = compactMcpOutput({ results: [success, failure] });
    expect(output).toMatchObject({
      results: [
        {
          result: {
            server: { players: { online: 0 } },
            data: { zero: 0, empty: [], confirmed: false },
          },
        },
        { result: { ok: false, error: { code: "TIMEOUT" } } },
      ],
    });
    expect(JSON.stringify(output)).not.toContain('"map"');
    const discovery = { games: [{ id: "minecraft-java" }] };
    expect(compactMcpOutput(discovery)).toBe(discovery);
  });

  it("enforces the byte ceiling for heavily escaped core fields and excessive warnings", () => {
    const output = compactMcpResult({
      ...envelope(),
      result: {
        ok: true,
        partial: false,
        server: {
          name: "\u0000".repeat(1000),
          map: "\u0000".repeat(1000),
          version: "\u0000".repeat(1000),
          players: { online: 0 },
        },
        warnings: Array.from({ length: 100 }, () => ({
          code: "SOURCE_TIMEOUT",
          message: "\u0000".repeat(1000),
        })),
        sources: [],
        data: {},
      },
    });
    expect(
      new TextEncoder().encode(JSON.stringify(output)).byteLength,
    ).toBeLessThanOrEqual(MCP_RESULT_BYTE_LIMIT);
    expect(output).toMatchObject({
      result: { ok: true, server: { players: { online: 0 } } },
      projection: { truncated: true },
    });
    const result = output["result"] as JsonObject;
    expect(result["warnings"]).toBeUndefined();
    expect(result["sources"]).toBeUndefined();
  });
});
