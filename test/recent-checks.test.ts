import { describe, expect, it } from "vitest";

import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import {
  parseRecentChecks,
  RECENT_CHECKS_LIMIT,
  withRecentCheck,
} from "../src/lib/recent-checks.js";

describe("recent checks", () => {
  it("keeps only well-formed addresses for known games", () => {
    expect(
      parseRecentChecks(
        JSON.stringify([
          { game: "rust", host: "play.example.com", port: 28015 },
          { game: "unknown", host: "play.example.com" },
          { game: "rust", host: "https://evil.example/path" },
          { game: "rust", host: "play.example.com", port: 70_000 },
          { game: "rust", host: "play.example.com", players: ["kept out"] },
          "not an object",
        ]),
        PLAYGROUND_GAMES,
      ),
    ).toEqual([
      { game: "rust", host: "play.example.com", port: 28015 },
      { game: "rust", host: "play.example.com" },
    ]);
    expect(parseRecentChecks("{", PLAYGROUND_GAMES)).toEqual([]);
    expect(parseRecentChecks('{"game":"rust"}', PLAYGROUND_GAMES)).toEqual([]);
    expect(parseRecentChecks(null, PLAYGROUND_GAMES)).toEqual([]);
  });

  it("moves a repeated server to the front without mode or timeout", () => {
    const first = withRecentCheck([], {
      game: "rust",
      host: "a.example",
      port: 28015,
      mode: "full",
      timeoutMs: 3_000,
    });
    expect(first).toEqual([{ game: "rust", host: "a.example", port: 28015 }]);
    const second = withRecentCheck(first, { game: "dayz", host: "b.example" });
    const again = withRecentCheck(second, {
      game: "rust",
      host: "A.example",
      port: 28015,
    });
    expect(again.map((check) => check.host)).toEqual([
      "A.example",
      "b.example",
    ]);
  });

  it("holds at most the limit, newest first", () => {
    let checks = withRecentCheck([], { game: "rust", host: "h0.example" });
    for (let index = 1; index < RECENT_CHECKS_LIMIT + 3; index += 1) {
      checks = withRecentCheck(checks, {
        game: "rust",
        host: `h${String(index)}.example`,
      });
    }
    expect(checks).toHaveLength(RECENT_CHECKS_LIMIT);
    expect(checks[0]?.host).toBe(`h${String(RECENT_CHECKS_LIMIT + 2)}.example`);
  });
});
