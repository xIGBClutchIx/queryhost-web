import { describe, expect, it } from "vitest";

import type { PlaygroundGameDefinition } from "../src/lib/playground-contracts.js";
import {
  cacheLabel,
  findGame,
  formQueryInput,
  formStateFromQueryInput,
  formStateFromSearch,
  gameFields,
  initialFormState,
  minecraftSummary,
  selectGame,
  shareUrl,
} from "../src/lib/playground-form.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";

function game(id: string): PlaygroundGameDefinition {
  const definition = findGame(PLAYGROUND_GAMES, id);
  if (definition === undefined) throw new Error(`Missing game ${id}`);
  return definition;
}

const initial = initialFormState(PLAYGROUND_GAMES);

describe("playground form state", () => {
  it("renders Minecraft Java with its default port and summary mode", () => {
    expect(initial).toEqual({
      advancedOpen: false,
      game: "minecraft-java",
      host: "",
      mode: "summary",
      port: "25565",
      queryPort: "",
      timeoutMs: "5000",
    });
  });

  it("follows the new default port unless the person typed their own", () => {
    const rust = selectGame(initial, game("minecraft-java"), game("rust"));
    expect(rust).toMatchObject({ game: "rust", mode: "full", port: "28015" });

    const custom = selectGame(
      { ...rust, port: "30000" },
      game("rust"),
      game("valheim"),
    );
    expect(custom.port).toBe("30000");

    const cleared = selectGame(
      { ...rust, port: "" },
      game("rust"),
      game("dayz"),
    );
    expect(cleared.port).toBe("2302");
  });

  it("gives generic A2S a required query port and no separate query port", () => {
    const a2s = selectGame(
      { ...initial, queryPort: "27016" },
      game("minecraft-java"),
      game("a2s"),
    );
    expect(a2s).toMatchObject({ port: "", queryPort: "" });
    expect(gameFields(game("a2s"))).toMatchObject({
      portLabel: "Query port",
      portRequired: true,
      queryPortAvailable: false,
    });
    expect(gameFields(game("rust"))).toMatchObject({
      portLabel: "Game port",
      queryPortHelp:
        "Defaults to 28017; custom game ports preserve the offset.",
      queryPortPlaceholder: "28017",
    });
  });

  it("restores share links and ignores malformed values", () => {
    expect(
      formStateFromSearch(
        "?game=rust&host=play.example.com&port=28016&queryPort=28020&mode=summary&timeoutMs=3000",
        PLAYGROUND_GAMES,
        initial,
      ),
    ).toEqual({
      advancedOpen: true,
      game: "rust",
      host: "play.example.com",
      mode: "summary",
      port: "28016",
      queryPort: "28020",
      timeoutMs: "3000",
    });

    expect(
      formStateFromSearch(
        "?game=unknown&port=99999999&timeoutMs=1&mode=fast",
        PLAYGROUND_GAMES,
        initial,
      ),
    ).toEqual(initial);
    expect(formStateFromSearch("", PLAYGROUND_GAMES, initial)).toEqual(initial);
  });

  it("mirrors agent input without inventing omitted ports", () => {
    expect(
      formStateFromQueryInput({ game: "rust", host: "agent.example" }),
    ).toEqual({
      advancedOpen: false,
      game: "rust",
      host: "agent.example",
      mode: "summary",
      port: "",
      queryPort: "",
      timeoutMs: "5000",
    });
    expect(
      formStateFromQueryInput({
        game: "rust",
        host: "agent.example",
        mode: "full",
        port: 28015,
        queryPort: 28017,
        timeoutMs: 3_000,
      }),
    ).toMatchObject({ advancedOpen: true, port: "28015", queryPort: "28017" });
  });
});

describe("playground query input", () => {
  it("omits empty ports and rejects URL syntax", () => {
    expect(
      formQueryInput({ ...initial, host: " play.example.com ", port: "" }),
    ).toEqual({
      input: {
        game: "minecraft-java",
        host: "play.example.com",
        mode: "summary",
        timeoutMs: 5_000,
      },
      kind: "valid",
    });
    for (const host of ["http://a", "a b", "[::1]", "a%b", "user@a"]) {
      expect(formQueryInput({ ...initial, host }).kind).toBe("invalid");
    }
  });

  it("never sends a separate query port for generic A2S", () => {
    const result = formQueryInput({
      ...initial,
      game: "a2s",
      host: "a2s.example",
      port: "27015",
      queryPort: "27016",
    });
    expect(result).toMatchObject({
      input: { game: "a2s", port: 27_015 },
      kind: "valid",
    });
    expect(result.kind === "valid" && "queryPort" in result.input).toBe(false);
  });

  it("builds short share URLs from non-default values only", () => {
    expect(
      shareUrl("https://query.host/?stale=1#top", {
        game: "rust",
        host: "play.example.com",
        mode: "full",
        port: 28015,
        timeoutMs: 5_000,
      }).href,
    ).toBe(
      "https://query.host/?game=rust&host=play.example.com&port=28015#top",
    );
    expect(
      shareUrl("https://query.host/", {
        game: "minecraft-java",
        host: "mc.example",
        mode: "summary",
        queryPort: 25566,
        timeoutMs: 3_000,
      }).search,
    ).toBe(
      "?game=minecraft-java&host=mc.example&queryPort=25566&mode=summary&timeoutMs=3000",
    );
  });
});

describe("playground result helpers", () => {
  it("labels cache provenance", () => {
    expect(cacheLabel({ ageMs: 1234.56, status: "hit", ttlMs: 1 })).toBe(
      "Cache hit · 1234.6 ms old",
    );
    expect(cacheLabel({ ageMs: 0, status: "coalesced", ttlMs: 1 })).toBe(
      "Shared in-flight query",
    );
    expect(cacheLabel({ ageMs: 0, status: "miss", ttlMs: 1 })).toBe(
      "Live query",
    );
  });

  it("keeps only safe Minecraft favicons and optional MOTD forms", () => {
    const favicon = "data:image/png;base64,iVBORw0KGgo=";
    expect(
      minecraftSummary("minecraft-java", {
        favicon,
        motd: { html: "<b>Hi</b>", plain: "Hi" },
      }),
    ).toEqual({ favicon, motdHtml: "<b>Hi</b>", motdPlain: "Hi" });
    expect(
      minecraftSummary("minecraft-java", {
        favicon: "data:image/svg+xml;base64,PHN2Zz4=",
      }),
    ).toBeUndefined();
    expect(
      minecraftSummary("minecraft-bedrock", { favicon, motd: "Bedrock" }),
    ).toEqual({ motdPlain: "Bedrock" });
    expect(minecraftSummary("rust", { motd: "Ignored" })).toBeUndefined();
  });
});
