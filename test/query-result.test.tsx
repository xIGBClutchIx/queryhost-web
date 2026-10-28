// @vitest-environment jsdom
import { act } from "preact/test-utils";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryResult } from "../src/components/playground/QueryResult.js";
import type {
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../src/lib/playground-contracts.js";
import { readableMinecraftColor } from "../src/lib/minecraft-text.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";

const RAW_NAME = "§f§f§f§f§fHALLOWEEN EVENT, HUNT + MAPS";

const BEDROCK_ONLINE: PlaygroundQueryResponse = {
  ok: true,
  game: "minecraft-bedrock",
  durationMs: 31.2,
  partial: false,
  cache: { status: "miss", ageMs: 0, ttlMs: 10000 },
  server: {
    name: RAW_NAME,
    version: "1.21.111",
    players: { online: 8123, max: 55000 },
  },
  data: {
    edition: "MCPE",
    motd: "§6§lCubeCraft §r§0dark",
    gameMode: "Survival",
  },
  rawData: { motd: "§6§lCubeCraft" },
  sources: [{ source: "minecraft-bedrock-raknet", status: "ok", rttMs: 31.2 }],
  warnings: [],
};

let container: HTMLDivElement;

function render(
  result: PlaygroundQueryResponse,
  input?: PlaygroundQueryInput,
): () => void {
  const root = createRoot(container);
  void act(() => {
    root.render(
      <QueryResult
        games={PLAYGROUND_GAMES}
        result={result}
        {...(input === undefined ? {} : { input })}
      />,
    );
  });
  return () => {
    void act(() => {
      root.unmount();
    });
  };
}

function click(selector: string): void {
  const tab = container.querySelector<HTMLElement>(selector);
  if (tab === null) throw new Error(`Missing ${selector}`);
  void act(() => {
    tab.click();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

describe("Minecraft text in query results", () => {
  it("shows Bedrock names and MOTDs without § codes and styles the MOTD", () => {
    const unmount = render(BEDROCK_ONLINE);
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "HALLOWEEN EVENT, HUNT + MAPS",
    );
    const motd = container.querySelector(".query-game-summary p");
    expect(motd?.textContent).toBe("CubeCraft dark");
    const [title, dark] = motd?.querySelectorAll("span") ?? [];
    expect(title?.className).toBe("mc-bold");
    expect(title?.style.color).toBe("rgb(255, 170, 0)");
    // Black is lifted so it stays readable on the dark result card.
    expect(dark?.style.color).not.toBe("rgb(0, 0, 0)");
    expect(readableMinecraftColor("#000000")).not.toBe("#000000");
    unmount();
  });

  it("formats interpreted game data but keeps raw protocol data and JSON raw", () => {
    const unmount = render(BEDROCK_ONLINE);
    click("#query-tab-data");
    const sections = container.querySelectorAll(".query-data-section");
    expect(sections[0]?.textContent).toContain("CubeCraft dark");
    expect(sections[0]?.textContent).not.toContain("§");
    expect(sections[1]?.textContent).toContain("§6§lCubeCraft");
    click("#query-tab-json");
    expect(container.textContent).toContain(RAW_NAME);
    unmount();
  });

  it("leaves § in other games' names untouched", () => {
    const unmount = render({
      ok: true,
      game: "rust",
      durationMs: 12,
      partial: false,
      cache: { status: "miss", ageMs: 0, ttlMs: 10000 },
      server: { name: "Price §5 server" },
      data: {},
      sources: [],
      warnings: [],
    });
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "Price §5 server",
    );
    unmount();
  });
});

const JAVA_ONLINE: PlaygroundQueryResponse = {
  ok: true,
  game: "minecraft-java",
  durationMs: 40,
  partial: false,
  cache: { status: "miss", ageMs: 0, ttlMs: 10000 },
  server: { version: "§f§fWe support: 1.21", players: { online: 3, max: 20 } },
  data: {
    motd: {
      plain: "Dark Bold",
      html: '<span style="color:#000000">Dark</span><br><span style="color:#55ff55;font-weight:bold">Bold</span>',
    },
  },
  sources: [{ source: "minecraft-slp", status: "ok", rttMs: 40 }],
  warnings: [],
};

const JAVA_INPUT: PlaygroundQueryInput = {
  game: "minecraft-java",
  host: "play.example.com",
  port: 25565,
};

describe("result header", () => {
  it("titles a nameless server by its address and omits a default port", () => {
    let unmount = render(JAVA_ONLINE, JAVA_INPUT);
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "play.example.com",
    );
    // Server-reported text never shows its formatting codes.
    expect(container.querySelector(".query-overview")?.textContent).toContain(
      "VersionWe support: 1.21",
    );
    unmount();
    unmount = render(JAVA_ONLINE, { ...JAVA_INPUT, port: 25570 });
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "play.example.com:25570",
    );
    unmount();
    unmount = render(JAVA_ONLINE);
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "Unnamed server",
    );
    unmount();
  });

  it("strips FiveM color codes and bidi controls from names", () => {
    const unmount = render({
      ...JAVA_ONLINE,
      game: "fivem",
      server: { name: "^1Red ^7Server‮" },
      data: {},
    });
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "Red Server",
    );
    unmount();
  });

  it("names the game Auto detection chose and refreshes the same input", () => {
    const onRefresh = vi.fn();
    const root = createRoot(container);
    void act(() => {
      root.render(
        <QueryResult
          detected
          games={PLAYGROUND_GAMES}
          input={JAVA_INPUT}
          onRefresh={onRefresh}
          result={JAVA_ONLINE}
        />,
      );
    });
    expect(container.querySelector("#query-result-detected")?.textContent).toBe(
      "Detected",
    );
    expect(container.querySelector(".query-result__game")?.textContent).toBe(
      "Minecraft: Java Edition",
    );
    // The freshness chip is the refresh control and says how fresh the data is.
    const refresh = container.querySelector("#query-result-refresh");
    expect(refresh?.textContent).toBe("Live · 40 ms");
    expect(refresh?.getAttribute("aria-label")).toBe(
      "Query again. Live, 40 ms.",
    );
    click("#query-result-refresh");
    expect(onRefresh).toHaveBeenCalledWith(JAVA_INPUT);
    void act(() => {
      root.unmount();
    });
  });

  it("adds a subtitle only for what the panels do not show", () => {
    // The address is already the title, and version and players have tiles.
    let unmount = render(JAVA_ONLINE, JAVA_INPUT);
    expect(container.querySelector("#query-result-subtitle")?.textContent).toBe(
      "",
    );
    expect(container.querySelector(".query-result__icon")).toBeNull();
    unmount();

    // A reported name is the title, so the queried address becomes the subtitle.
    unmount = render(
      {
        ...JAVA_ONLINE,
        game: "rust",
        cache: { status: "hit", ageMs: 3_182, ttlMs: 10_000 },
        server: { name: "Main", map: "Procedural Map" },
        data: {},
      },
      { game: "rust", host: "rust.example.com", port: 28016 },
    );
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "Main",
    );
    expect(container.querySelector("#query-result-subtitle")?.textContent).toBe(
      "rust.example.com:28016",
    );
    expect(container.querySelector("#query-result-refresh")).toBeNull();
    expect(container.querySelector(".query-freshness")?.textContent).toBe(
      "Cached 3 s ago · 40 ms",
    );
    unmount();
  });

  it("titles a failed query by its address and explains it below", () => {
    const unmount = render(
      {
        ok: false,
        game: "minecraft-java",
        durationMs: 22.8,
        cache: { status: "miss", ageMs: 0, ttlMs: 2000 },
        error: {
          code: "DNS_FAILED",
          message: "The target could not be resolved.",
        },
        sources: [],
        warnings: [],
      },
      JAVA_INPUT,
    );
    expect(container.querySelector("#query-result-status")?.textContent).toBe(
      "Unreachable",
    );
    expect(container.querySelector("#query-result-name")?.textContent).toBe(
      "play.example.com",
    );
    expect(container.querySelector("#query-result-subtitle")?.textContent).toBe(
      "The target could not be resolved.",
    );
    unmount();
  });
});

describe("Java MOTD HTML", () => {
  it("rebuilds allow-listed formatting with readable colors", () => {
    const unmount = render(JAVA_ONLINE);
    const motd = container.querySelector(".query-game-summary p");
    expect(motd?.textContent).toBe("Dark\nBold");
    const [dark, bold] = motd?.querySelectorAll("span") ?? [];
    expect(dark?.style.color).not.toBe("rgb(0, 0, 0)");
    expect(bold?.className).toBe("mc-bold");
    unmount();
  });

  it("falls back to the plain MOTD for markup outside the vocabulary", () => {
    const unmount = render({
      ...JAVA_ONLINE,
      data: {
        motd: { plain: "Safe text", html: '<img src="x" onerror="alert(1)">' },
      },
    });
    const motd = container.querySelector(".query-game-summary p");
    expect(motd?.textContent).toBe("Safe text");
    expect(motd?.querySelector("img")).toBeNull();
    unmount();
  });
});

describe("Copy badge", () => {
  function buttons(): string[] {
    return Array.from(
      container.querySelectorAll(".query-json-toolbar button"),
      (button) => button.textContent ?? "",
    );
  }

  it("copies badge Markdown for the queried server", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const unmount = render(BEDROCK_ONLINE, {
      game: "minecraft-bedrock",
      host: "play.example.com",
      mode: "summary",
      port: 19132,
      timeoutMs: 2_000,
    });
    click("#query-tab-json");
    expect(buttons()).toEqual(["Copy badge", "Copy JSON"]);
    const origin = window.location.origin;
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".query-json-toolbar button")
        ?.click();
      await Promise.resolve();
    });
    // Mode and timeout are playground preferences, not part of the badge.
    expect(writeText).toHaveBeenCalledWith(
      `[![Minecraft: Bedrock Edition server status](${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19132.svg)](${origin}/minecraft-bedrock/play.example.com)`,
    );
    expect(buttons()[0]).toBe("Copied");
    unmount();
  });

  it("is absent when the query input is unknown", () => {
    const unmount = render(BEDROCK_ONLINE);
    click("#query-tab-json");
    expect(buttons()).toEqual(["Copy JSON"]);
    expect(container.querySelector("#query-result-share")).toBeNull();
    unmount();
  });
});

describe("Share and embed", () => {
  function panelCodes(): string[] {
    return Array.from(
      container.querySelectorAll("#query-share-panel code"),
      (code) => code.textContent ?? "",
    );
  }

  it("offers the link, badge formats, and API call for the result", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const unmount = render(BEDROCK_ONLINE, {
      game: "minecraft-bedrock",
      host: "play.example.com",
      mode: "summary",
      port: 19133,
      timeoutMs: 3_000,
    });
    const origin = window.location.origin;
    expect(container.querySelector("#query-share-panel")).toBeNull();
    click("#query-result-share");
    expect(
      container
        .querySelector("#query-result-share")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    // The badge image loads only once the menu is open.
    expect(
      container.querySelector("#query-share-panel img")?.getAttribute("src"),
    ).toBe(
      `${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19133.svg`,
    );
    const [link, badge, embed, endpoint, api] = panelCodes();
    expect(embed).toBe(
      `<iframe src="${origin}/embed/minecraft-bedrock/play.example.com:19133" title="Minecraft: Bedrock Edition server status" width="360" height="88" style="border:0" loading="lazy"></iframe>`,
    );
    expect(endpoint).toBe(
      `${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19133.json`,
    );
    expect(link).toBe(
      `${origin}/minecraft-bedrock/play.example.com:19133?mode=summary&timeoutMs=3000`,
    );
    expect(badge).toBe(
      `[![Minecraft: Bedrock Edition server status](${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19133.svg)](${origin}/minecraft-bedrock/play.example.com:19133)`,
    );
    expect(api).toBe(
      `curl ${origin}/api/v1/query -H 'Content-Type: application/json' -d '{"game":"minecraft-bedrock","host":"play.example.com","port":19133,"mode":"summary"}'`,
    );

    click('#query-share-panel [role="radio"]:nth-child(2)');
    expect(panelCodes()[1]).toBe(
      `<a href="${origin}/minecraft-bedrock/play.example.com:19133"><img src="${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19133.svg" alt="Minecraft: Bedrock Edition server status"></a>`,
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("#query-share-panel button")
        ?.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(link);

    void act(() => {
      container
        .querySelector("#query-share-panel")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    expect(container.querySelector("#query-share-panel")).toBeNull();
    expect(document.activeElement?.id).toBe("query-result-share");
    unmount();
  });

  it("builds a customised badge, embed, and endpoint", () => {
    const unmount = render(BEDROCK_ONLINE, {
      game: "minecraft-bedrock",
      host: "play.example.com",
      mode: "summary",
      port: 19133,
    });
    const origin = window.location.origin;
    const base = `${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19133`;
    click("#query-result-share");
    function change(selector: string, value: string, type: string): void {
      void act(() => {
        const field = container.querySelector<
          HTMLInputElement | HTMLSelectElement
        >(selector);
        if (field === null) throw new Error(`Missing ${selector}`);
        field.value = value;
        field.dispatchEvent(new Event(type, { bubbles: true }));
      });
    }
    change("#share-badge-style", "for-the-badge", "change");
    change("#share-badge-show", "status", "change");
    change("#share-badge-theme", "auto", "change");
    change("#share-badge-label", "My Server", "input");
    const query = "?style=for-the-badge&show=status&theme=auto&label=My+Server";
    expect(
      container.querySelector("#query-share-panel img")?.getAttribute("src"),
    ).toBe(`${base}.svg${query}`);
    const [, badge, embed, endpoint] = panelCodes();
    expect(badge).toContain(`(${base}.svg${query})`);
    expect(embed).toContain(
      `src="${origin}/embed/minecraft-bedrock/play.example.com:19133?theme=auto"`,
    );
    expect(endpoint).toBe(
      `${base}.json?style=for-the-badge&show=status&label=My+Server`,
    );

    change("#share-badge-label", "evil.example/login", "input");
    const label = container.querySelector("#share-badge-label");
    expect(label?.getAttribute("aria-invalid")).toBe("true");
    expect(label?.getAttribute("aria-describedby")).toBe(
      "share-badge-label-hint",
    );
    expect(panelCodes()[1]).not.toContain("label=");
    unmount();
  });
});
