// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyCodeBlock,
  enhanceGameFilter,
  filterGameRows,
  highlightTableOfContents,
  renderTableOfContents,
  revealCodeCopyButtons,
  tableOfContentsEntries,
} from "../src/lib/page-enhancements.js";

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
}

function clipboard(writeText: Clipboard["writeText"]): Clipboard {
  return Object.assign(new EventTarget(), {
    read: vi.fn<Clipboard["read"]>(),
    readText: vi.fn<Clipboard["readText"]>(),
    write: vi.fn<Clipboard["write"]>(),
    writeText,
  });
}

const CODE_BLOCK = `
  <figure class="code-block">
    <figcaption>
      <span>Terminal</span>
      <button type="button" data-code-copy hidden>Copy</button>
      <span data-code-copy-status></span>
    </figcaption>
    <div class="code-block__source"><pre><code>npm install queryhost
</code></pre></div>
  </figure>`;

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("code copy buttons", () => {
  it("stay hidden without clipboard access", () => {
    document.body.innerHTML = CODE_BLOCK;
    revealCodeCopyButtons(document, undefined);
    expect(element<HTMLButtonElement>("[data-code-copy]").hidden).toBe(true);
  });

  it("copy the block's text, confirm it, and reset", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = CODE_BLOCK;
    const writeText = vi.fn<Clipboard["writeText"]>(() => Promise.resolve());
    const available = clipboard(writeText);
    revealCodeCopyButtons(document, available);
    const button = element<HTMLButtonElement>("[data-code-copy]");
    expect(button.hidden).toBe(false);

    await copyCodeBlock(button, available);
    expect(writeText).toHaveBeenCalledWith("npm install queryhost");
    expect(button.textContent).toBe("Copied");
    expect(button.hasAttribute("data-copied")).toBe(true);
    expect(element("[data-code-copy-status]").textContent).toBe(
      "Copied to clipboard",
    );

    vi.runAllTimers();
    expect(button.textContent).toBe("Copy");
    expect(button.hasAttribute("data-copied")).toBe(false);
    expect(element("[data-code-copy-status]").textContent).toBe("");
  });

  it("report a rejected clipboard write", async () => {
    document.body.innerHTML = CODE_BLOCK;
    const button = element<HTMLButtonElement>("[data-code-copy]");
    await copyCodeBlock(
      button,
      clipboard(() => Promise.reject(new Error("denied"))),
    );
    expect(button.textContent).toBe("Copy");
    expect(element("[data-code-copy-status]").textContent).toBe("Copy failed");
  });
});

describe("table of contents", () => {
  const PROSE = `
    <nav data-doc-toc hidden><ol></ol></nav>
    <div class="doc-prose">
      <section><h2 id="nested">Nested panel</h2></section>
      <h2 id="input">Query input</h2>
      <h2>No anchor</h2>
      <h2 id="ports">Game and query ports</h2>
      <h3 id="detail">Detail</h3>
      <h2 id="live">Live by default</h2>
    </div>`;

  it("lists the page's top-level anchored sections", () => {
    document.body.innerHTML = PROSE;
    const entries = tableOfContentsEntries(element(".doc-prose"));
    expect(entries).toEqual([
      { id: "input", label: "Query input" },
      { id: "ports", label: "Game and query ports" },
      { id: "live", label: "Live by default" },
    ]);

    const toc = element<HTMLElement>("[data-doc-toc]");
    renderTableOfContents(toc, entries);
    expect(toc.hidden).toBe(false);
    expect(
      [...toc.querySelectorAll("a")].map((link) => link.getAttribute("href")),
    ).toEqual(["#input", "#ports", "#live"]);
  });

  it("stays hidden on short pages", () => {
    document.body.innerHTML = PROSE;
    const toc = element<HTMLElement>("[data-doc-toc]");
    renderTableOfContents(toc, [{ id: "input", label: "Query input" }]);
    expect(toc.hidden).toBe(true);
    expect(toc.querySelectorAll("li")).toHaveLength(0);
  });

  it("marks the last section scrolled past the header", () => {
    document.body.innerHTML = PROSE;
    const entries = tableOfContentsEntries(element(".doc-prose"));
    const toc = element<HTMLElement>("[data-doc-toc]");
    renderTableOfContents(toc, entries);
    const tops = { input: -400, live: 600, ports: 40 } as const;
    const headings = entries.map((entry) => {
      const heading = element<HTMLElement>(`#${entry.id}`);
      const top = tops[entry.id as keyof typeof tops];
      heading.getBoundingClientRect = () => DOMRect.fromRect({ y: top });
      return heading;
    });

    highlightTableOfContents(toc, headings, 96);
    expect(
      toc.querySelector('[aria-current="location"]')?.getAttribute("href"),
    ).toBe("#ports");

    highlightTableOfContents(toc, headings, 96, true);
    expect(
      toc.querySelector('[aria-current="location"]')?.getAttribute("href"),
    ).toBe("#live");
  });
});

describe("games filter", () => {
  const TABLE = `
    <div data-game-filter-control hidden>
      <input type="search" />
      <span data-game-filter-status></span>
    </div>
    <p data-game-filter-empty hidden>No games match that filter.</p>
    <table class="capability-table"><tbody>
      <tr data-game-filter="rust rust"></tr>
      <tr data-game-filter="counter-strike 2 counter-strike-2 cs2"></tr>
      <tr data-game-filter="minecraft: java edition minecraft-java minecraft java"></tr>
    </tbody></table>`;

  it("matches every typed term against names, IDs, and aliases", () => {
    document.body.innerHTML = TABLE;
    const table = element(".capability-table");
    expect(filterGameRows(table, "CS2")).toBe(1);
    expect(filterGameRows(table, "minecraft java")).toBe(1);
    expect(filterGameRows(table, "  ")).toBe(3);
    expect(filterGameRows(table, "factorio")).toBe(0);
  });

  it("reveals the control and keeps its status and empty state in sync", () => {
    document.body.innerHTML = TABLE;
    const controller = new AbortController();
    enhanceGameFilter(document, controller.signal);
    const control = element<HTMLElement>("[data-game-filter-control]");
    const input = element<HTMLInputElement>("input");
    const status = element("[data-game-filter-status]");
    const empty = element<HTMLElement>("[data-game-filter-empty]");
    expect(control.hidden).toBe(false);
    expect(status.textContent).toBe("3 games");

    input.value = "rust";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toBe("1 of 3 games");
    expect(empty.hidden).toBe(true);

    input.value = "factorio";
    input.dispatchEvent(new Event("input"));
    expect(empty.hidden).toBe(false);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(input.value).toBe("");
    expect(status.textContent).toBe("3 games");

    controller.abort();
    input.value = "rust";
    input.dispatchEvent(new Event("input"));
    expect(status.textContent).toBe("3 games");
  });
});
