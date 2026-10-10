import { describe, expect, it } from "vitest";

import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import {
  previewImagePath,
  resultPath,
  splitTarget,
  targetSegment,
} from "../src/lib/result-url.js";
import {
  legacyResultLocation,
  resolveResultPage,
} from "../src/server/result-page.js";

function resolve(path: string) {
  const url = new URL(path, "https://query.host");
  const [, game = "", target = ""] = url.pathname.split("/");
  return resolveResultPage(game, target, url, PLAYGROUND_GAMES);
}

const rust = PLAYGROUND_GAMES.find((game) => game.id === "rust");

describe("result URLs", () => {
  it("brackets IPv6 targets and splits every target form back", () => {
    expect(targetSegment("play.example.com")).toBe("play.example.com");
    expect(targetSegment("play.example.com", 28016)).toBe(
      "play.example.com:28016",
    );
    expect(targetSegment("2001:db8::1", 27015)).toBe("[2001:db8::1]:27015");
    expect(splitTarget("[2001:db8::1]:27015")).toEqual({
      host: "2001:db8::1",
      port: "27015",
    });
    expect(splitTarget("2001:db8::1")).toEqual({ host: "2001:db8::1" });
    expect(splitTarget("play.example.com:x")).toEqual({
      host: "play.example.com",
      port: "x",
    });
  });

  it("names the preview image after the result, without playground options", () => {
    const input = {
      game: "rust",
      host: "play.example.com",
      mode: "summary",
      port: 28016,
      queryPort: 28017,
      timeoutMs: 3_000,
    } as const;
    expect(resultPath(input, rust)).toBe(
      "/rust/play.example.com:28016?queryPort=28017&mode=summary&timeoutMs=3000",
    );
    expect(previewImagePath(input, rust)).toBe(
      "/preview/rust/play.example.com:28016.png?queryPort=28017",
    );
    expect(
      previewImagePath(
        { game: "rust", host: "play.example.com", port: 28015 },
        rust,
      ),
    ).toBe("/preview/rust/play.example.com.png");
  });
});

describe("result pages", () => {
  it("prefills the playground and names the server and its preview", () => {
    expect(resolve("/rust/play.example.com")).toEqual({
      description:
        "Live status of the Rust server at play.example.com, checked by QueryHost.",
      imageAlt: "Rust server play.example.com: its live status on QueryHost.",
      imagePath: "/preview/rust/play.example.com.png",
      kind: "page",
      search: "?game=rust&host=play.example.com",
      title: "play.example.com · Rust",
    });
  });

  it("carries a custom port and the playground options", () => {
    const page = resolve(
      "/rust/play.example.com:28016?queryPort=28017&mode=summary&utm=x",
    );
    expect(page).toMatchObject({
      imagePath: "/preview/rust/play.example.com:28016.png?queryPort=28017",
      search:
        "?game=rust&host=play.example.com&port=28016&queryPort=28017&mode=summary",
      title: "play.example.com:28016 · Rust",
    });
  });

  it("accepts bracketed IPv6 targets", () => {
    expect(resolve("/counter-strike-2/[2001:db8::1]:27016")).toMatchObject({
      kind: "page",
      title: "[2001:db8::1]:27016 · Counter-Strike 2",
    });
  });

  it("redirects a game alias to the game's ID", () => {
    expect(resolve("/mc/play.example.com?mode=full")).toEqual({
      kind: "redirect",
      location: "/minecraft-java/play.example.com?mode=full",
    });
  });

  it("is not a page for unknown games or invalid servers", () => {
    for (const path of [
      "/docs/unknown",
      "/rust/play.example.com:0",
      "/rust/play.example.com:abc",
      "/rust/play.example.com?queryPort=70000",
      "/rust/bad%20host",
      "/rust/%E0%A4%A",
      "/a2s/203.0.113.10",
    ]) {
      expect(resolve(path), path).toEqual({ kind: "not-found" });
    }
    expect(resolve("/a2s/203.0.113.10:27015")).toMatchObject({ kind: "page" });
  });
});

describe("query-string links", () => {
  it("move complete links to their result page", () => {
    expect(
      legacyResultLocation(
        "?game=rust&host=play.example.com&port=28016&mode=summary",
        PLAYGROUND_GAMES,
      ),
    ).toBe("/rust/play.example.com:28016?mode=summary");
    expect(
      legacyResultLocation(
        "?game=minecraft-java&host=mc.example.com",
        PLAYGROUND_GAMES,
      ),
    ).toBe("/minecraft-java/mc.example.com");
  });

  it("leave incomplete or invalid links prefilled on the homepage", () => {
    for (const search of [
      "",
      "?game=rust",
      "?game=rust&host=play.example.com&port=0",
      "?game=rust&host=https://play.example.com",
    ]) {
      expect(legacyResultLocation(search, PLAYGROUND_GAMES), search).toBe(
        undefined,
      );
    }
  });
});
