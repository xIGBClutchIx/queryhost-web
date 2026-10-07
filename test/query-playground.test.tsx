// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryPlayground } from "../src/components/playground/QueryPlayground.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import { MINECRAFT_ONLINE } from "./fixtures/playground.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

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
      Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
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
    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
    expect(element(".query-game-summary").textContent).toContain(
      "new season live!",
    );
    expect(element(".query-overview").textContent).toContain("37 / 120");
    expect(element("#query-panel-json code").textContent).toBe(
      JSON.stringify(MINECRAFT_ONLINE, null, 2),
    );
    expect(window.location.search).toBe(
      "?game=minecraft-java&host=play.example.com&port=25565&mode=summary",
    );
    expect(element<HTMLButtonElement>("#query-submit").disabled).toBe(false);
  });

  it("runs an example server from its chip and fills in the form", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
    );
    vi.stubGlobal("fetch", fetcher);
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });

    const chip = element<HTMLAnchorElement>(".playground-examples__chip");
    expect(chip.getAttribute("href")).toBe(
      "/?game=minecraft-java&host=mc.hypixel.net",
    );
    act(() => {
      chip.click();
    });
    await flush();

    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : body).toEqual({
      game: "minecraft-java",
      host: "mc.hypixel.net",
      mode: "summary",
      port: 25_565,
      timeoutMs: 5_000,
    });
    expect(element<HTMLInputElement>("#query-host").value).toBe(
      "mc.hypixel.net",
    );
    expect(container.querySelector(".playground-examples")).toBeNull();
  });

  it("focuses the host field on / unless another field is being edited", () => {
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const host = element<HTMLInputElement>("#query-host");
    expect(host.getAttribute("aria-keyshortcuts")).toBe("/");

    const fromPage = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "/",
    });
    document.body.dispatchEvent(fromPage);
    expect(document.activeElement).toBe(host);
    expect(fromPage.defaultPrevented).toBe(true);

    const port = element<HTMLInputElement>("#query-port");
    port.focus();
    const fromField = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "/",
    });
    port.dispatchEvent(fromField);
    expect(document.activeElement).toBe(port);
    expect(fromField.defaultPrevented).toBe(false);
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
        Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
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

  it("runs a complete shared link once when the page loads", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
    );
    vi.stubGlobal("fetch", fetcher);
    const search = "?game=minecraft-java&host=play.example.com&mode=summary";
    history.replaceState(null, "", `/${search}`);
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search={search} />);
    });
    await flush();
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search={search} />);
    });
    await flush();

    expect(fetcher).toHaveBeenCalledOnce();
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : body).toEqual({
      game: "minecraft-java",
      host: "play.example.com",
      mode: "summary",
      port: 25_565,
      timeoutMs: 5_000,
    });
    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
  });

  it.each([
    "?game=minecraft-java",
    "?game=unknown&host=play.example.com",
    "?game=rust&host=https://play.example.com",
    "?game=rust&host=play.example.com&port=99999",
  ])(
    "leaves the incomplete or invalid link %s for the person to submit",
    (search) => {
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      act(() => {
        root.render(
          <QueryPlayground games={PLAYGROUND_GAMES} search={search} />,
        );
      });

      expect(fetcher).not.toHaveBeenCalled();
      expect(container.querySelector(".playground-examples")).not.toBeNull();
    },
  );

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
  it("opens the game list scrolled to the selected game", () => {
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const list = element<HTMLElement>("#query-game-menu");
    const selected = element<HTMLElement>(
      "#query-game-menu [aria-selected='true']",
    );
    Object.defineProperties(list, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 900 },
    });
    Object.defineProperties(selected, {
      offsetHeight: { value: 36 },
      offsetTop: { value: 500 },
    });
    act(() => {
      element<HTMLButtonElement>("[aria-controls='query-game-menu']").click();
    });
    // Centred: 500 - (200 - 36) / 2.
    expect(list.scrollTop).toBe(418);
    expect(list.className).toBe(
      "custom-select__list has-more-above has-more-below",
    );
  });

  it("marks the game list edges that have more options past them", () => {
    act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const list = element<HTMLElement>("#query-game-menu");
    Object.defineProperties(list, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 900 },
    });
    act(() => {
      list.scrollTop = 0;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe("custom-select__list has-more-below");
    act(() => {
      list.scrollTop = 300;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe(
      "custom-select__list has-more-above has-more-below",
    );
    act(() => {
      list.scrollTop = 700;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe("custom-select__list has-more-above");
  });
});
