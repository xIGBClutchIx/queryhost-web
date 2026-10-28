// @vitest-environment jsdom
import { act } from "preact/test-utils";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryPlayground } from "../src/components/playground/QueryPlayground.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import { HOME_TITLE } from "../src/lib/site.js";
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

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A fetch whose responses the test releases one at a time. */
function deferredFetch(): {
  readonly fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  readonly respond: (response: Response) => void;
} {
  const pending: ((response: Response) => void)[] = [];
  const fetcher = vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((resolve, reject) => {
        pending.push(resolve);
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return {
    fetcher,
    respond: (response) => {
      pending.shift()?.(response);
    },
  };
}

function online(): Response {
  return new Response(JSON.stringify(MINECRAFT_ONLINE));
}

function renderPlayground(search = ""): void {
  void act(() => {
    root.render(<QueryPlayground games={PLAYGROUND_GAMES} search={search} />);
  });
}

function query(host: string): void {
  void act(() => {
    setInput(element("#query-host"), host);
  });
  void act(() => {
    element<HTMLFormElement>("#query-form").requestSubmit();
  });
}

function recentHosts(): string[] {
  return Array.from(
    container.querySelectorAll("#playground-recent a > span"),
    (span) => span.textContent ?? "",
  );
}

function removeControl(host: string): HTMLButtonElement {
  return element<HTMLButtonElement>(
    `[aria-label="Remove ${host} from recent checks"]`,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public observe(): void {}
      public disconnect(): void {}
    },
  );
  localStorage.clear();
  document.title = HOME_TITLE;
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

describe("query playground after a result", () => {
  it("keeps examples and recent checks below the result and removes one check", async () => {
    localStorage.setItem(
      "queryhost:recent-checks",
      JSON.stringify([
        { game: "rust", host: "a.example" },
        { game: "rust", host: "b.example" },
      ]),
    );
    const { respond } = deferredFetch();
    renderPlayground();
    query("play.example.com");
    // The loading view stands alone.
    expect(container.querySelector("#playground-discovery")).toBeNull();
    respond(online());
    await flush();

    const discovery = element("#playground-discovery");
    expect(discovery.previousElementSibling?.id).toBe("query-output");
    expect(
      discovery.querySelector(".playground-examples__chip"),
    ).not.toBeNull();
    expect(recentHosts()).toEqual([
      "play.example.com",
      "a.example",
      "b.example",
    ]);

    void act(() => {
      removeControl("a.example").click();
    });
    expect(recentHosts()).toEqual(["play.example.com", "b.example"]);
    // Focus stays in the list, on the check that moved into the removed one's place.
    expect(document.activeElement).toBe(removeControl("b.example"));
    for (const host of ["b.example", "play.example.com"]) {
      void act(() => {
        removeControl(host).click();
      });
    }
    expect(container.querySelector("#playground-recent")).toBeNull();
    expect(localStorage.getItem("queryhost:recent-checks")).toBeNull();
    expect(document.activeElement).toBe(element("#query-host"));
  });

  it("returns focus after a chip query and a refresh, keeping the chosen tab", async () => {
    const { respond } = deferredFetch();
    renderPlayground();
    const chip = element<HTMLAnchorElement>(".playground-examples__chip");
    chip.focus();
    void act(() => {
      chip.click();
    });
    // The chip gave way to the loading view; focus waits on Cancel.
    expect(document.activeElement).toBe(element("#query-cancel"));
    expect(element("#query-announcement").textContent).toBe(
      "Querying mc.hypixel.net…",
    );
    respond(online());
    await flush();
    expect(document.activeElement).toBe(element("#query-output"));

    void act(() => {
      element<HTMLButtonElement>("#query-tab-data").click();
    });
    const refresh = element<HTMLButtonElement>("#query-result-refresh");
    refresh.focus();
    void act(() => {
      refresh.click();
    });
    expect(document.activeElement).toBe(element("#query-cancel"));
    respond(online());
    await flush();
    expect(document.activeElement).toBe(element("#query-result-refresh"));
    expect(element("#query-tab-data").getAttribute("aria-selected")).toBe(
      "true",
    );

    // Another server starts on its overview.
    query("other.example");
    respond(online());
    await flush();
    expect(element("#query-tab-overview").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("names the page after the result and rolls a cancelled query back", async () => {
    const { respond } = deferredFetch();
    renderPlayground();
    query("play.example.com");
    respond(online());
    await flush();
    expect(window.location.pathname).toBe("/minecraft-java/play.example.com");
    expect(document.title).toBe(
      "play.example.com · Minecraft: Java Edition · QueryHost",
    );

    // A pasted port is split into its own field before the query.
    query("other.example:25570");
    expect(element<HTMLInputElement>("#query-host").value).toBe(
      "other.example",
    );
    expect(element<HTMLInputElement>("#query-port").value).toBe("25570");
    expect(window.location.pathname).toBe(
      "/minecraft-java/other.example:25570",
    );
    expect(document.title).toBe(
      "other.example:25570 · Minecraft: Java Edition · QueryHost",
    );

    // Escape abandons it, and a reload would show the earlier result again.
    void act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    await flush();
    expect(window.location.pathname).toBe("/minecraft-java/play.example.com");
    expect(document.title).toBe(
      "play.example.com · Minecraft: Java Edition · QueryHost",
    );
    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
    expect(document.activeElement).toBe(element("#query-host"));
  });

  it("returns a cancelled first query to the homepage address", async () => {
    deferredFetch();
    history.replaceState(null, "", "/minecraft-java/play.example.com");
    renderPlayground("?game=minecraft-java&host=play.example.com");
    await flush();
    expect(element<HTMLElement>(".query-loading").hidden).toBe(false);
    void act(() => {
      element<HTMLButtonElement>("#query-cancel").click();
    });
    await flush();
    expect(window.location.pathname).toBe("/");
    expect(document.title).toBe(HOME_TITLE);
    expect(element<HTMLElement>(".query-loading").hidden).toBe(true);
  });

  it("leaves Escape to an open listbox", async () => {
    const { fetcher } = deferredFetch();
    renderPlayground();
    query("play.example.com");
    const trigger = element<HTMLButtonElement>(
      "[aria-controls='query-game-menu']",
    );
    void act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    void act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });
    await flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(element<HTMLElement>(".query-loading").hidden).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("tries a failed request again", async () => {
    const { fetcher, respond } = deferredFetch();
    renderPlayground();
    query("play.example.com");
    respond(
      new Response("<html>502 Bad Gateway</html>", {
        headers: { "Content-Type": "text/html" },
        status: 502,
      }),
    );
    await flush();
    const error = element("#query-request-error").textContent;
    expect(error).toContain("UNEXPECTED_RESPONSE");
    expect(error).toContain("unexpected response");
    expect(error).not.toContain("Unexpected token");

    const retry = element<HTMLButtonElement>("#query-retry");
    retry.focus();
    void act(() => {
      retry.click();
    });
    respond(online());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      fetcher.mock.calls[0]?.[1]?.body,
    );
    expect(element("#query-result-name").textContent).toBe(
      "Blockhaven Survival",
    );
    expect(document.activeElement).toBe(element("#query-output"));
  });

  it("splits an address pasted over the host field", () => {
    renderPlayground();
    const host = element<HTMLInputElement>("#query-host");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "[2001:db8::1]:25570" },
    });
    host.setSelectionRange(0, 0);
    void act(() => {
      host.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(true);
    expect(host.value).toBe("2001:db8::1");
    expect(element<HTMLInputElement>("#query-port").value).toBe("25570");
  });

  it("explains an address whose port is not a number", () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    renderPlayground();
    query("play.example.com:port");
    expect(fetcher).not.toHaveBeenCalled();
    expect(element<HTMLElement>("#query-form-error").hidden).toBe(false);
  });
});

describe("custom select keyboard", () => {
  it("keeps options out of the Tab order and closes on Tab", () => {
    renderPlayground();
    const options = container.querySelectorAll<HTMLButtonElement>(
      "#query-game-menu [role='option']",
    );
    expect(options.length).toBeGreaterThan(10);
    expect(Array.from(options).every((option) => option.tabIndex === -1)).toBe(
      true,
    );

    const trigger = element<HTMLButtonElement>(
      "[aria-controls='query-game-menu']",
    );
    for (const shiftKey of [false, true]) {
      void act(() => {
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
        );
      });
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement?.getAttribute("role")).toBe("option");
      const tab = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
        shiftKey,
      });
      void act(() => {
        document.activeElement?.dispatchEvent(tab);
      });
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      // Tab moves on from the trigger; Shift+Tab stops on it.
      expect(document.activeElement).toBe(trigger);
      expect(tab.defaultPrevented).toBe(shiftKey);
    }
  });

  it("focuses its trigger when the label is clicked", () => {
    renderPlayground();
    void act(() => {
      element<HTMLElement>("#query-game-label").click();
    });
    expect(document.activeElement).toBe(
      element("[aria-controls='query-game-menu']"),
    );
  });
});
