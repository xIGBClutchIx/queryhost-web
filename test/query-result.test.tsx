// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryResult } from "../src/components/playground/QueryResult.js";
import type {
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../src/lib/playground-contracts.js";
import { readableMinecraftColor } from "../src/lib/minecraft-text.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

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
  act(() => {
    root.render(
      <QueryResult
        games={PLAYGROUND_GAMES}
        result={result}
        {...(input === undefined ? {} : { input })}
      />,
    );
  });
  return () => {
    act(() => {
      root.unmount();
    });
  };
}

function click(selector: string): void {
  const tab = container.querySelector<HTMLElement>(selector);
  if (tab === null) throw new Error(`Missing ${selector}`);
  act(() => {
    tab.click();
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
      `[![Minecraft: Bedrock Edition server status](${origin}/api/v1/badge/minecraft-bedrock/play.example.com:19132.svg)](${origin}/?game=minecraft-bedrock&host=play.example.com&port=19132)`,
    );
    expect(buttons()[0]).toBe("Copied");
    unmount();
  });

  it("is absent when the query input is unknown", () => {
    const unmount = render(BEDROCK_ONLINE);
    click("#query-tab-json");
    expect(buttons()).toEqual(["Copy JSON"]);
    unmount();
  });
});
