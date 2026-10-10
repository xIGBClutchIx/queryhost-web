// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GAMES } from "../src/lib/queryhost.js";
import {
  connectDocsSearch,
  isDocsSearchShortcut,
} from "../src/lib/docs-search-dialog.js";
import { buildDocsSearchIndex } from "../src/lib/docs-search-index.js";
import {
  gameAnchor,
  highlightSegments,
  parseDocsSearchIndex,
  searchDocs,
} from "../src/lib/docs-search.js";
import type { DocsSearchEntry } from "../src/lib/docs-search.js";
import { GET } from "../src/pages/docs/search-index.json.js";
import { GamesPage } from "../src/views/docs/GamesPage.js";
import { QueryingPage } from "../src/views/docs/QueryingPage.js";

function entry(
  kind: DocsSearchEntry["kind"],
  title: string,
  context = "Docs",
  aliases?: string,
): DocsSearchEntry {
  return {
    context,
    href: `/docs/${title.toLowerCase().replaceAll(/\W+/g, "-")}/`,
    kind,
    title,
    ...(aliases === undefined ? {} : { aliases }),
  };
}

const ENTRIES: readonly DocsSearchEntry[] = [
  entry("page", "Getting started"),
  entry("page", "Query a server"),
  entry("section", "Game and query ports", "Query a server"),
  entry(
    "game",
    "Minecraft: Java Edition",
    "Supported games",
    "minecraft-java mc",
  ),
  entry("symbol", "QueryOptions", "Interface"),
  entry("member", "queryPort", "QueryInput"),
  entry("member", "port", "QueryInput"),
  entry("symbol", "query()", "Function"),
  entry("page", "WebMCP tools"),
  {
    ...entry("section", "Caching", "Hosted service"),
    keywords: "successful results are reused for a short ttl",
  },
];

function titles(results: readonly DocsSearchEntry[]): readonly string[] {
  return results.map((result) => result.title);
}

describe("searchDocs", () => {
  it("lists the documentation pages for an empty query", () => {
    expect(titles(searchDocs(ENTRIES, "  "))).toEqual([
      "Getting started",
      "Query a server",
      "WebMCP tools",
    ]);
  });

  it("ranks guides above members and exact titles above word matches", () => {
    expect(titles(searchDocs(ENTRIES, "port"))).toEqual([
      "Game and query ports",
      "port",
      "queryPort",
    ]);
    expect(titles(searchDocs(ENTRIES, "queryoptions"))).toEqual([
      "QueryOptions",
    ]);
  });

  it("requires every term and matches aliases and hidden keywords", () => {
    expect(titles(searchDocs(ENTRIES, "query ports"))).toEqual([
      "Game and query ports",
    ]);
    // An exact alias beats the same letters inside another title.
    expect(titles(searchDocs(ENTRIES, "mc"))).toEqual([
      "Minecraft: Java Edition",
      "WebMCP tools",
    ]);
    expect(titles(searchDocs(ENTRIES, "ttl"))).toEqual(["Caching"]);
    expect(searchDocs(ENTRIES, "factorio")).toEqual([]);
  });

  it("caps the number of results", () => {
    expect(searchDocs(ENTRIES, "e", 3)).toHaveLength(3);
  });
});

describe("parseDocsSearchIndex", () => {
  it("keeps valid documentation entries and drops the rest", () => {
    const text = JSON.stringify([
      ENTRIES[0],
      { ...ENTRIES[0], href: "https://example.com/" },
      { ...ENTRIES[0], kind: "video" },
      { title: "Missing fields" },
      "text",
    ]);
    expect(parseDocsSearchIndex(text)).toEqual([ENTRIES[0]]);
    expect(parseDocsSearchIndex("{")).toEqual([]);
    expect(parseDocsSearchIndex("{}")).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("marks every occurrence of each term without changing the text", () => {
    expect(highlightSegments("Game and query ports", ["que", "port"])).toEqual([
      { match: false, text: "Game and " },
      { match: true, text: "que" },
      { match: false, text: "ry " },
      { match: true, text: "port" },
      { match: false, text: "s" },
    ]);
  });
});

describe("documentation search index", () => {
  it("indexes pages, anchored sections, games, and the API reference", async () => {
    const index = parseDocsSearchIndex(await GET().text());
    const kinds = new Set(index.map((item) => item.kind));
    expect([...kinds].sort()).toEqual([
      "game",
      "member",
      "page",
      "section",
      "symbol",
    ]);
    expect(index).toContainEqual(
      expect.objectContaining({
        context: "Query a server",
        href: "/docs/querying/#ports",
        kind: "section",
        title: "Game and query ports",
      }),
    );
    expect(index).toContainEqual(
      expect.objectContaining({
        href: "/docs/reference/interfaces/QuerySuccess/#durationms",
        kind: "member",
        title: "durationMs",
      }),
    );
    // Type parameters are too generic to index as members.
    expect(
      index.filter((item) => item.kind === "member" && item.title === "G"),
    ).toEqual([]);
    expect(index.filter((item) => item.kind === "game")).toHaveLength(
      GAMES.length,
    );
    expect(new Set(index.map((item) => item.href)).size).toBe(index.length);
  });

  it("links sections and games to ids the rendered pages carry", async () => {
    const index = parseDocsSearchIndex(await GET().text());
    const pages = new Map([
      ["/docs/querying/", renderToStaticMarkup(<QueryingPage />)],
      ["/docs/games/", renderToStaticMarkup(<GamesPage />)],
    ]);
    for (const item of index) {
      const [path = "", id] = item.href.split("#");
      const html = pages.get(path);
      if (html === undefined || id === undefined) continue;
      expect(html, item.href).toContain(`id="${id}"`);
    }
    for (const game of GAMES) {
      expect(pages.get("/docs/games/")).toContain(
        `id="${gameAnchor(game.id)}"`,
      );
    }
  });

  it("fails the build when a navigation page was not rendered", () => {
    expect(() => buildDocsSearchIndex([])).toThrow(/was not rendered/);
  });
});

function keydown(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("isDocsSearchShortcut", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("accepts / outside fields and Ctrl or Cmd+K anywhere", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const seen: boolean[] = [];
    document.addEventListener("keydown", (event) => {
      seen.push(isDocsSearchShortcut(event));
    });
    keydown({ key: "/" });
    keydown({ key: "/" }, input);
    keydown({ key: "k", ctrlKey: true }, input);
    keydown({ key: "K", metaKey: true });
    keydown({ key: "k" });
    keydown({ key: "k", ctrlKey: true, metaKey: true });
    keydown({ key: "/", ctrlKey: true });
    expect(seen).toEqual([true, false, true, true, false, false, false]);
  });
});

describe("connectDocsSearch", () => {
  beforeAll(() => {
    // jsdom has no modal dialog support; model the open state it toggles.
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
    };
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mount(): HTMLDialogElement {
    document.body.innerHTML = renderToStaticMarkup(<QueryingPage />);
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    if (dialog === null) throw new Error("Missing search dialog");
    return dialog;
  }

  function query(selector: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`Missing ${selector}`);
    return found;
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  it("reveals the trigger and opens with the page list once the index loads", async () => {
    const dialog = mount();
    const trigger = query("[data-docs-search-open]");
    expect(trigger.hidden).toBe(true);
    const load = vi.fn(() => Promise.resolve(ENTRIES));
    connectDocsSearch(document, load, new AbortController().signal);
    expect(trigger.hidden).toBe(false);

    trigger.click();
    expect(dialog.open).toBe(true);
    expect(query("[data-docs-search-status]").textContent).toBe(
      "Loading search…",
    );
    await vi.waitFor(() => {
      expect(document.querySelectorAll("[role=option]")).toHaveLength(3);
    });
    expect(document.activeElement).toBe(query("[data-docs-search-input]"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("filters, moves the selection, and follows the selected result", async () => {
    const dialog = mount();
    const controller = connectDocsSearch(
      document,
      () => Promise.resolve(ENTRIES),
      new AbortController().signal,
    );
    controller?.open();
    const input = query("[data-docs-search-input]") as HTMLInputElement;
    await vi.waitFor(() => {
      expect(document.querySelectorAll("[role=option]")).not.toHaveLength(0);
    });

    type(input, "port");
    const options = [...document.querySelectorAll("[role=option]")];
    expect(
      options.map((option) => option.getAttribute("aria-selected")),
    ).toEqual(["true", "false", "false"]);
    expect(query("[data-docs-search-status]").textContent).toBe("3 results");
    expect(options[1]?.querySelector("mark")?.textContent).toBe("port");

    keydown({ key: "ArrowDown" }, input);
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    keydown({ key: "ArrowUp" }, input);
    keydown({ key: "ArrowUp" }, input);
    expect(input.getAttribute("aria-activedescendant")).toBe(options[2]?.id);

    const followed = vi.fn((event: Event) => {
      event.preventDefault();
    });
    options[2]?.querySelector("a")?.addEventListener("click", followed);
    keydown({ key: "Enter" }, input);
    expect(followed).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);

    controller?.open();
    type(input, "factorio");
    expect(query("[data-docs-search-status]").textContent).toBe(
      "No results for “factorio”.",
    );
    expect(input.getAttribute("aria-expanded")).toBe("false");
    keydown({ key: "Escape" }, input);
    expect(dialog.open).toBe(false);
  });

  it("reports a failed index load and retries on the next open", async () => {
    mount();
    const load = vi
      .fn<() => Promise<readonly DocsSearchEntry[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(ENTRIES);
    const controller = connectDocsSearch(
      document,
      load,
      new AbortController().signal,
    );
    controller?.open();
    await vi.waitFor(() => {
      expect(query("[data-docs-search-status]").textContent).toBe(
        "Search is unavailable right now.",
      );
    });
    controller?.toggle();
    controller?.toggle();
    await vi.waitFor(() => {
      expect(document.querySelectorAll("[role=option]")).toHaveLength(3);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does nothing on pages without the dialog", () => {
    expect(
      connectDocsSearch(
        document,
        () => Promise.resolve(ENTRIES),
        new AbortController().signal,
      ),
    ).toBeUndefined();
  });
});
