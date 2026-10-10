// Behavior for the server-rendered documentation search dialog. It works on a DOM root
// with an injected index loader, so the page script stays thin and jsdom can test it.
import {
  DOCS_SEARCH_KIND_LABELS,
  highlightSegments,
  searchDocs,
  searchTerms,
} from "./docs-search.js";
import type { DocsSearchEntry } from "./docs-search.js";

export type DocsSearchIndexLoader = () => Promise<readonly DocsSearchEntry[]>;

export interface DocsSearchController {
  close(): void;
  open(): void;
  /** Opens the dialog, or closes it when it is already open. */
  toggle(): void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest("input, select, textarea") !== null
  );
}

/**
 * True for `/` outside editable controls and for Ctrl/Cmd+K anywhere, the usual
 * documentation search shortcuts. Shift stays allowed for layouts that need it for `/`.
 */
export function isDocsSearchShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.isComposing) return false;
  if (event.key.toLowerCase() === "k") {
    return event.ctrlKey !== event.metaKey && !event.shiftKey;
  }
  return (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isEditable(event.target)
  );
}

function resultOption(
  document: Document,
  entry: DocsSearchEntry,
  index: number,
  terms: readonly string[],
): HTMLLIElement {
  const option = document.createElement("li");
  option.id = `docs-search-option-${index}`;
  option.className = "docs-search__option";
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", "false");
  option.dataset["index"] = String(index);

  const link = document.createElement("a");
  link.className = "docs-search__link";
  link.href = entry.href;
  link.tabIndex = -1;

  const title = document.createElement("span");
  title.className = "docs-search__title";
  title.append(
    ...highlightSegments(entry.title, terms).map((segment) => {
      if (!segment.match) return document.createTextNode(segment.text);
      const mark = document.createElement("mark");
      mark.textContent = segment.text;
      return mark;
    }),
  );

  const meta = document.createElement("span");
  meta.className = "docs-search__meta";
  const kind = document.createElement("span");
  kind.className = "docs-search__kind";
  kind.textContent = DOCS_SEARCH_KIND_LABELS[entry.kind];
  meta.append(kind, document.createTextNode(entry.context));

  link.append(title, meta);
  option.append(link);
  return option;
}

/**
 * A result on the current page can point at a games table row the page filter hid; a
 * fragment change neither re-renders the page nor resets that filter, so clear it first.
 */
function revealTarget(document: Document, link: HTMLAnchorElement): void {
  if (link.pathname !== document.location.pathname || link.hash === "") return;
  const target = document.getElementById(
    decodeURIComponent(link.hash.slice(1)),
  );
  if (target === null || target.closest("[hidden]") === null) return;
  const filter = document.querySelector<HTMLInputElement>(
    "[data-game-filter-control] input",
  );
  if (filter === null || filter.value === "") return;
  filter.value = "";
  filter.dispatchEvent(new Event("input"));
}

/**
 * Connects the search dialog, its header trigger, and its results list. Returns
 * undefined on pages without the dialog. Listeners end when `signal` aborts.
 */
export function connectDocsSearch(
  document: Document,
  loadIndex: DocsSearchIndexLoader,
  signal: AbortSignal,
): DocsSearchController | undefined {
  const dialog = document.querySelector<HTMLDialogElement>(
    "dialog[data-docs-search]",
  );
  const input = dialog?.querySelector<HTMLInputElement>(
    "[data-docs-search-input]",
  );
  const list = dialog?.querySelector<HTMLElement>("[data-docs-search-results]");
  const status = dialog?.querySelector<HTMLElement>(
    "[data-docs-search-status]",
  );
  if (
    dialog === null ||
    dialog === undefined ||
    input === null ||
    input === undefined ||
    list === null ||
    list === undefined ||
    status === null ||
    status === undefined
  ) {
    return undefined;
  }

  let entries: readonly DocsSearchEntry[] | undefined;
  let failed = false;
  let active = -1;

  const options = (): HTMLElement[] => [
    ...list.querySelectorAll<HTMLElement>("[role=option]"),
  ];

  const setActive = (index: number, scroll: boolean): void => {
    const all = options();
    active = all.length === 0 ? -1 : (index + all.length) % all.length;
    for (const [position, option] of all.entries()) {
      option.setAttribute("aria-selected", String(position === active));
    }
    const current = all[active];
    if (current === undefined) {
      input.removeAttribute("aria-activedescendant");
      return;
    }
    input.setAttribute("aria-activedescendant", current.id);
    if (scroll) current.scrollIntoView?.({ block: "nearest" });
  };

  const render = (): void => {
    if (entries === undefined) {
      list.replaceChildren();
      input.setAttribute("aria-expanded", "false");
      status.textContent = failed
        ? "Search is unavailable right now."
        : "Loading search…";
      setActive(-1, false);
      return;
    }
    const query = input.value;
    const terms = searchTerms(query);
    const results = searchDocs(entries, query);
    list.replaceChildren(
      ...results.map((entry, index) =>
        resultOption(document, entry, index, terms),
      ),
    );
    input.setAttribute("aria-expanded", String(results.length > 0));
    status.textContent =
      terms.length === 0
        ? "Type to search pages, games, and the API reference."
        : results.length === 0
          ? `No results for “${query.trim()}”.`
          : `${results.length} ${results.length === 1 ? "result" : "results"}`;
    setActive(0, false);
  };

  const load = (): void => {
    if (entries !== undefined) return;
    failed = false;
    render();
    loadIndex().then(
      (loaded) => {
        if (signal.aborted) return;
        entries = loaded;
        render();
      },
      () => {
        if (signal.aborted) return;
        failed = true;
        render();
      },
    );
  };

  const close = (): void => {
    if (dialog.open) dialog.close();
  };

  const open = (): void => {
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
    if (entries === undefined) load();
    else render();
  };

  const follow = (index: number): void => {
    const link = options()[index]?.querySelector<HTMLAnchorElement>("a");
    if (link === undefined || link === null) return;
    close();
    // A real click lets the client router handle the navigation like any link.
    link.click();
  };

  for (const trigger of document.querySelectorAll<HTMLButtonElement>(
    "[data-docs-search-open]",
  )) {
    trigger.addEventListener("click", open, { signal });
    trigger.hidden = false;
  }

  input.addEventListener("input", render, { signal });
  input.addEventListener(
    "keydown",
    (event) => {
      // A search field would spend the first Escape clearing itself; close at once.
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(active + (event.key === "ArrowDown" ? 1 : -1), true);
      } else if (event.key === "Enter" && !event.isComposing && active >= 0) {
        event.preventDefault();
        follow(active);
      }
    },
    { signal },
  );
  list.addEventListener(
    "click",
    (event) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a")
          : null;
      if (link === null) return;
      revealTarget(document, link);
      close();
    },
    { signal },
  );
  list.addEventListener(
    "pointermove",
    (event) => {
      const option =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[role=option]")
          : null;
      const index = Number(option?.dataset["index"] ?? Number.NaN);
      if (Number.isInteger(index) && index !== active) setActive(index, false);
    },
    { signal },
  );
  // A click on the backdrop targets the dialog itself, outside its box.
  dialog.addEventListener(
    "click",
    (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside || box.width === 0) close();
    },
    { signal },
  );

  return {
    close,
    open,
    toggle: () => {
      if (dialog.open) close();
      else open();
    },
  };
}
