// @vitest-environment jsdom
import { act } from "preact/test-utils";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryPlayground } from "../src/components/playground/QueryPlayground.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import { HOME_HEADLINE, HOME_SUMMARY } from "../src/lib/site.js";
import { MINECRAFT_ONLINE } from "./fixtures/playground.js";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function element<T extends Element>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
}

function setInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// A macrotask lets the stubbed fetch and its response body settle before
// Preact flushes the resulting updates.
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
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
  void act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("query playground island", () => {
  it("leads with the shared homepage headline and subline", () => {
    const html = renderToString(
      <QueryPlayground games={PLAYGROUND_GAMES} search="" />,
    );
    expect(html).toContain(`<h1 id="query-heading">${HOME_HEADLINE}</h1>`);
    expect(html).toContain(`<p>${HOME_SUMMARY}</p>`);
  });

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
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });

    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    void act(() => {
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
    // The default port and Minecraft's summary mode stay out of the link.
    expect(window.location.pathname).toBe("/minecraft-java/play.example.com");
    expect(window.location.search).toBe("");
    expect(element<HTMLButtonElement>("#query-submit").disabled).toBe(false);
  });

  it("shows each source's progress while a streamed query runs", async () => {
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                stream = controller;
              },
            }),
            { headers: { "Content-Type": "application/x-ndjson" } },
          ),
        ),
      ),
    );
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    void act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    await flush();
    expect(element(".query-loading").textContent).toContain(
      "Contacting the server",
    );

    stream?.enqueue(
      encoder.encode(
        '{"type":"started","source":"minecraft-srv"}\n{"type":"completed","report":{"source":"minecraft-srv","status":"ok","rttMs":4}}\n{"type":"started","source":"minecraft-slp"}\n',
      ),
    );
    await flush();
    const steps = [...container.querySelectorAll(".query-loading__source")].map(
      (step) => [step.className, step.textContent],
    );
    expect(steps).toEqual([
      ["query-loading__source query-loading__source--ok", "SRV4 ms"],
      ["query-loading__source query-loading__source--running", "Status…"],
    ]);

    stream?.enqueue(
      encoder.encode(
        `${JSON.stringify({ result: MINECRAFT_ONLINE, type: "result" })}\n`,
      ),
    );
    stream?.close();
    await flush();
    expect(element<HTMLElement>(".query-loading").hidden).toBe(true);
    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
  });

  it("runs an example server from its chip and fills in the form", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
    );
    vi.stubGlobal("fetch", fetcher);
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });

    const chip = element<HTMLAnchorElement>(".playground-examples__chip");
    expect(chip.getAttribute("href")).toBe("/minecraft-java/mc.hypixel.net");
    void act(() => {
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
    void act(() => {
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
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    void act(() => {
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
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    void act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    await flush();

    const overview = element<HTMLButtonElement>("#query-tab-overview");
    void act(() => {
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
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search={search} />);
    });
    await flush();
    void act(() => {
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
    "?game=rust&host=play.example.com&port=abc",
  ])(
    "leaves the incomplete or invalid link %s for the person to submit",
    (search) => {
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      void act(() => {
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
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    void act(() => {
      setInput(element("#query-host"), "https://play.example.com");
    });
    void act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(element<HTMLElement>("#query-form-error").hidden).toBe(false);
    expect(document.activeElement?.id).toBe("query-host");
  });

  it("picks a game from the keyboard listbox and applies its port rules", () => {
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const trigger = element<HTMLButtonElement>(
      "[aria-controls='query-game-menu']",
    );
    void act(() => {
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
    void act(() => {
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
    void act(() => {
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
    void act(() => {
      element<HTMLButtonElement>("[aria-controls='query-game-menu']").click();
    });
    // Centred: 500 - (200 - 36) / 2.
    expect(list.scrollTop).toBe(418);
    expect(list.className).toBe(
      "custom-select__list has-more-above has-more-below",
    );
  });

  it("marks the game list edges that have more options past them", () => {
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const list = element<HTMLElement>("#query-game-menu");
    Object.defineProperties(list, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 900 },
    });
    void act(() => {
      list.scrollTop = 0;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe("custom-select__list has-more-below");
    void act(() => {
      list.scrollTop = 300;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe(
      "custom-select__list has-more-above has-more-below",
    );
    void act(() => {
      list.scrollTop = 700;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(list.className).toBe("custom-select__list has-more-above");
  });
});

describe("revealing finished output", () => {
  let scrollIntoView: ReturnType<
    typeof vi.fn<(options?: ScrollIntoViewOptions) => void>
  >;
  let outputTop: number;
  let outputHeight: number;

  beforeEach(() => {
    // jsdom's viewport is 768px tall.
    outputTop = 900;
    outputHeight = 400;
    scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
    // jsdom has no layout or scrolling, so place the output and record scrolls.
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, outputTop, 800, outputHeight),
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.restoreAllMocks();
  });

  /** `scrollMargin` stands in for the stylesheet's sticky-chrome offset. */
  function submitHost(response: Response, scrollMargin = "0px"): void {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(response)),
    );
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    element<HTMLElement>("#query-output").style.scrollMarginTop = scrollMargin;
    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    element<HTMLButtonElement>("#query-submit").focus();
    void act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
  }

  it("scrolls a result below the fold up to the header without moving focus", async () => {
    submitHost(new Response(JSON.stringify(MINECRAFT_ONLINE)));
    expect(scrollIntoView).not.toHaveBeenCalled();
    await flush();

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(element("#query-output"));
    // No explicit behavior, so the page's smooth or reduced-motion CSS decides.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(document.activeElement).toBe(element("#query-submit"));
  });

  it("scrolls a request error below the fold into view", async () => {
    submitHost(new Response(JSON.stringify({ ok: true })));
    await flush();

    expect(element("#query-request-error").textContent).toContain(
      "NETWORK_ERROR",
    );
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it.each([
    ["runs past the bottom", 480, 900],
    ["fits on screen", 480, 200],
    ["starts above the viewport after a re-query", -600, 900],
  ])(
    "frames a result that %s below the sticky form on wider screens",
    async (_case, top, height) => {
      outputTop = top;
      outputHeight = height;
      submitHost(new Response(JSON.stringify(MINECRAFT_ONLINE)), "200px");
      await flush();

      expect(scrollIntoView).toHaveBeenCalledOnce();
    },
  );

  it("leaves a result that is already framed below the sticky form", async () => {
    outputTop = 230;
    submitHost(new Response(JSON.stringify(MINECRAFT_ONLINE)), "200px");
    await flush();

    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals the result of a shared link that runs on load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
      ),
    );
    const search = "?game=minecraft-java&host=play.example.com&mode=summary";
    history.replaceState(null, "", `/${search}`);
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search={search} />);
    });
    await flush();

    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});

describe("query playground viewport fit", () => {
  let contentBottom: number;

  beforeEach(() => {
    contentBottom = 600;
    // jsdom has no layout: the playground starts at 0 and its last child, the
    // output, ends at `contentBottom`.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const bottom = this.id === "query-output" ? contentBottom : 0;
        return new DOMRect(0, 0, 800, bottom);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPlayground(): HTMLElement {
    void act(() => {
      root.render(<QueryPlayground games={PLAYGROUND_GAMES} search="" />);
    });
    const playground = element<HTMLElement>(".playground");
    playground.style.minHeight = "700px";
    // Switching to a result swaps the examples for output, re-measuring the fit.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(MINECRAFT_ONLINE))),
      ),
    );
    void act(() => {
      setInput(element("#query-host"), "play.example.com");
    });
    void act(() => {
      element<HTMLFormElement>("#query-form").requestSubmit();
    });
    return playground;
  }

  it("marks content that fits the viewport-tall playground", async () => {
    const playground = renderPlayground();
    await flush();
    expect(playground.hasAttribute("data-fits")).toBe(true);
  });

  it("keeps the bottom room for content taller than the playground", async () => {
    contentBottom = 701;
    const playground = renderPlayground();
    await flush();
    expect(playground.hasAttribute("data-fits")).toBe(false);
  });

  it("re-measures when only the viewport grows", async () => {
    contentBottom = 701;
    const playground = renderPlayground();
    await flush();
    expect(playground.hasAttribute("data-fits")).toBe(false);

    // A taller window raises the minimum height without resizing anything an
    // overflowing playground's observers watch.
    playground.style.minHeight = "720px";
    window.dispatchEvent(new Event("resize"));
    expect(playground.hasAttribute("data-fits")).toBe(true);
  });
});
