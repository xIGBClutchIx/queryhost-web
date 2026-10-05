// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryPlayground } from "../src/components/playground/QueryPlayground.js";
import type { PlaygroundQueryResponse } from "../src/lib/playground-contracts.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const SUCCESS: PlaygroundQueryResponse = {
  cache: { ageMs: 0, status: "miss", ttlMs: 10_000 },
  data: { motd: { plain: "Welcome" }, onlineMode: true },
  durationMs: 42,
  game: "minecraft-java",
  ok: true,
  partial: false,
  server: { name: "Example", players: { max: 20, online: 5 } },
  sources: [{ rttMs: 12, source: "minecraft-slp", status: "ok" }],
  warnings: [],
};

let container: HTMLDivElement;
let root: Root;

function element<T extends Element>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
}

function setInput(input: HTMLInputElement, value: string): void {
  // React tracks the instance value, so update through the native prototype setter.
  Reflect.set(HTMLInputElement.prototype, "value", value, input);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public observe(): void {}
      public disconnect(): void {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("query playground island", () => {
  it("server-renders a shared link already filled in", () => {
    const html = renderToString(
      <QueryPlayground
        games={PLAYGROUND_GAMES}
        search="?game=rust&host=play.example.com&port=28016"
      />,
    );
    expect(html).toContain('value="play.example.com"');
    expect(html).toContain('value="28016"');
    expect(html).toContain(">Rust</span>");
  });

  it("queries through the same-origin route and renders the result", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(SUCCESS))),
    );
    vi.stubGlobal("fetch", fetcher);
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });

    act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    expect(element("#query-submit").textContent).toBe("Querying…");
    await flush();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/query");
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : body).toEqual({
      game: "minecraft-java",
      host: "play.example.com",
      mode: "summary",
      port: 25_565,
      timeoutMs: 5_000,
    });
    expect(element("#query-result-name").textContent).toBe("Example");
    expect(element(".query-game-summary").textContent).toContain("Welcome");
    expect(element(".query-overview").textContent).toContain("5 / 20");
    expect(element("#query-panel-json code").textContent).toBe(
      JSON.stringify(SUCCESS, null, 2),
    );
    expect(window.location.search).toBe(
      "?game=minecraft-java&host=play.example.com&port=25565&mode=summary",
    );
    expect(element<HTMLButtonElement>("#query-submit").disabled).toBe(false);
  });

  it("reports a malformed successful response instead of failing to render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true, game: "minecraft-java" })),
        ),
      ),
    );
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    await flush();

    expect(container.querySelector("#query-result")).toBeNull();
    expect(element("#query-request-error").textContent).toContain(
      "NETWORK_ERROR",
    );
    expect(element("#query-request-error").textContent).toContain(
      "unexpected response",
    );
  });

  it("switches result tabs with the arrow keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(SUCCESS))),
      ),
    );
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    await flush();

    const overview = element<HTMLButtonElement>("#query-tab-overview");
    act(() => {
      overview.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }),
      );
    });
    expect(element("#query-tab-json").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(document.activeElement?.id).toBe("query-tab-json");
    expect(element<HTMLElement>("#query-panel-json").hidden).toBe(false);
    expect(element<HTMLElement>("#query-panel-overview").hidden).toBe(true);
  });

  it("explains a URL-shaped host without sending a request", () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    act(() => {
      setInput(element("#query-host"), "https://play.example.com");
    });
    act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(element<HTMLElement>("#query-form-error").hidden).toBe(false);
    expect(document.activeElement?.id).toBe("query-host");
  });

  it("picks a game from the keyboard listbox and applies its port rules", () => {
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const trigger = element<HTMLButtonElement>(
      "[aria-controls='query-game-menu']",
    );
    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }),
      );
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Vintage Story");

    const a2s = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "#query-game-menu [role='option']",
      ),
    ).find((option) => option.textContent === "Generic A2S");
    act(() => {
      a2s?.click();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(element("#query-port-label").textContent).toBe("Query port");
    expect(element<HTMLInputElement>("#query-port").required).toBe(true);
    expect(element<HTMLElement>("#query-query-port-field").hidden).toBe(true);
    expect(element("#query-mode-value").textContent).toBe("Full details");
  });
});
