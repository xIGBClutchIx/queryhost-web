// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QueryResult } from "../src/components/playground/QueryResult.js";
import type { PlaygroundQueryResponse } from "../src/lib/playground-contracts.js";
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

function render(result: PlaygroundQueryResponse): () => void {
  const root = createRoot(container);
  act(() => {
    root.render(<QueryResult games={PLAYGROUND_GAMES} result={result} />);
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
