import { describe, expect, it } from "vitest";

import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import {
  parseRecentChecks,
  RECENT_CHECKS_LIMIT,
  withoutRecentCheck,
  withRecentCheck,
} from "../src/lib/recent-checks.js";

describe("recent checks", () => {
  it("keeps only well-formed addresses for known games", () => {
    expect(
      parseRecentChecks(
        JSON.stringify([
          { game: "rust", host: "play.example.com", port: 28016 },
          { game: "unknown", host: "play.example.com" },
          { game: "rust", host: "https://evil.example/path" },
          { game: "rust", host: "play.example.com", port: 70_000 },
          { game: "rust", host: "play.example.com", players: ["kept out"] },
          { game: "rust", host: "." },
          "not an object",
        ]),
        PLAYGROUND_GAMES,
      ),
    ).toEqual([
      { game: "rust", host: "play.example.com", port: 28016 },
      { game: "rust", host: "play.example.com" },
    ]);
    expect(parseRecentChecks("{", PLAYGROUND_GAMES)).toEqual([]);
    expect(parseRecentChecks('{"game":"rust"}', PLAYGROUND_GAMES)).toEqual([]);
    expect(parseRecentChecks(null, PLAYGROUND_GAMES)).toEqual([]);
  });

  it("collapses stored spellings of one server into one check", () => {
    expect(
      parseRecentChecks(
        JSON.stringify([
          { game: "rust", host: "Play.Example.com.", port: 28015 },
          { game: "rust", host: "play.example.com" },
          { game: "rust", host: "play.example.com", port: 28015 },
        ]),
        PLAYGROUND_GAMES,
      ),
    ).toEqual([{ game: "rust", host: "play.example.com" }]);
  });

  it("moves a repeated server to the front without mode or timeout", () => {
    const first = withRecentCheck(
      [],
      {
        game: "rust",
        host: "a.example",
        port: 28016,
        mode: "full",
        timeoutMs: 3_000,
      },
      PLAYGROUND_GAMES,
    );
    expect(first).toEqual([{ game: "rust", host: "a.example", port: 28016 }]);
    const second = withRecentCheck(
      first,
      { game: "dayz", host: "b.example" },
      PLAYGROUND_GAMES,
    );
    const again = withRecentCheck(
      second,
      { game: "rust", host: "A.example", port: 28016 },
      PLAYGROUND_GAMES,
    );
    expect(again.map((check) => check.host)).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("treats the default port and a trailing dot as the same server", () => {
    const first = withRecentCheck(
      [],
      { game: "rust", host: "play.example.com" },
      PLAYGROUND_GAMES,
    );
    const again = withRecentCheck(
      first,
      { game: "rust", host: "PLAY.example.com.", port: 28015 },
      PLAYGROUND_GAMES,
    );
    expect(again).toEqual([{ game: "rust", host: "play.example.com" }]);
  });

  it("removes one check and keeps the rest in order", () => {
    let checks = withRecentCheck(
      [],
      { game: "rust", host: "a.example" },
      PLAYGROUND_GAMES,
    );
    checks = withRecentCheck(
      checks,
      { game: "rust", host: "b.example" },
      PLAYGROUND_GAMES,
    );
    checks = withRecentCheck(
      checks,
      { game: "rust", host: "c.example" },
      PLAYGROUND_GAMES,
    );
    expect(
      withoutRecentCheck(checks, { game: "rust", host: "b.example" }).map(
        (check) => check.host,
      ),
    ).toEqual(["c.example", "a.example"]);
  });

  it("holds at most the limit, newest first", () => {
    let checks = withRecentCheck(
      [],
      { game: "rust", host: "h0.example" },
      PLAYGROUND_GAMES,
    );
    for (let index = 1; index < RECENT_CHECKS_LIMIT + 3; index += 1) {
      checks = withRecentCheck(
        checks,
        { game: "rust", host: `h${String(index)}.example` },
        PLAYGROUND_GAMES,
      );
    }
    expect(checks).toHaveLength(RECENT_CHECKS_LIMIT);
    expect(checks[0]?.host).toBe(`h${String(RECENT_CHECKS_LIMIT + 2)}.example`);
  });
});
