// Progressive enhancements for server-rendered pages. Each function works on a DOM
// root, so pages stay complete without script and the behavior is testable in jsdom.

const COPIED_RESET_MS = 1_600;

/** Reveals copy buttons only where the asynchronous clipboard API exists. */
export function revealCodeCopyButtons(
  root: ParentNode,
  clipboard: Clipboard | undefined,
): void {
  if (clipboard === undefined) return;
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-code-copy]",
  )) {
    button.hidden = false;
  }
}

const copyResetTimers = new WeakMap<HTMLButtonElement, number>();

function showCopyState(
  button: HTMLButtonElement,
  status: Element | null,
  copied: boolean,
  message: string,
): void {
  button.textContent = copied ? "Copied" : "Copy";
  button.toggleAttribute("data-copied", copied);
  if (status !== null) status.textContent = message;
}

/** Copies the code block that owns `button` and reports the outcome to assistive tech. */
export async function copyCodeBlock(
  button: HTMLButtonElement,
  clipboard: Clipboard,
): Promise<void> {
  const block = button.closest(".code-block");
  const source = block?.querySelector(".code-block__source") ?? null;
  const status = block?.querySelector("[data-code-copy-status]") ?? null;
  if (source === null) return;

  try {
    await clipboard.writeText(source.textContent.replace(/\n$/u, ""));
    showCopyState(button, status, true, "Copied to clipboard");
  } catch {
    showCopyState(button, status, false, "Copy failed");
  }

  const view = button.ownerDocument.defaultView;
  if (view === null) return;
  view.clearTimeout(copyResetTimers.get(button));
  copyResetTimers.set(
    button,
    view.setTimeout(() => {
      showCopyState(button, status, false, "");
    }, COPIED_RESET_MS),
  );
}

export interface TableOfContentsEntry {
  readonly id: string;
  readonly label: string;
}

/** Top-level documentation sections, in order; nested panels keep their own headings. */
export function tableOfContentsEntries(
  prose: ParentNode,
): readonly TableOfContentsEntry[] {
  return [...prose.querySelectorAll<HTMLHeadingElement>(":scope > h2[id]")]
    .map((heading) => ({
      id: heading.id,
      label: heading.textContent.trim(),
    }))
    .filter((entry) => entry.label.length > 0);
}

/** Minimum number of sections before a page earns a contents list. */
export const TABLE_OF_CONTENTS_MINIMUM = 3;

/** Fills the server-rendered contents placeholder; short pages leave it hidden. */
export function renderTableOfContents(
  toc: HTMLElement,
  entries: readonly TableOfContentsEntry[],
): void {
  const list = toc.querySelector("ol");
  if (list === null) return;
  if (entries.length < TABLE_OF_CONTENTS_MINIMUM) {
    list.replaceChildren();
    toc.hidden = true;
    return;
  }
  const document = toc.ownerDocument;
  list.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${encodeURIComponent(entry.id)}`;
      link.textContent = entry.label;
      link.dataset["tocTarget"] = entry.id;
      item.append(link);
      return item;
    }),
  );
  toc.hidden = false;
}

/**
 * Marks the section whose heading most recently scrolled past `offset`. At the end of
 * the page the last section wins, since a short final section never reaches the top.
 */
export function highlightTableOfContents(
  toc: HTMLElement,
  headings: readonly HTMLElement[],
  offset: number,
  atEnd = false,
): void {
  let current = headings[0]?.id;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top - offset > 1) break;
    current = heading.id;
  }
  if (atEnd) current = headings.at(-1)?.id;
  for (const link of toc.querySelectorAll<HTMLAnchorElement>(
    "a[data-toc-target]",
  )) {
    if (link.dataset["tocTarget"] === current) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function filterTerms(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/u).filter(Boolean);
}

/**
 * Hides game rows that do not contain every typed term and returns how many remain.
 * Rows carry their searchable text in `data-game-filter`.
 */
export function filterGameRows(table: ParentNode, query: string): number {
  const terms = filterTerms(query);
  let visible = 0;
  for (const row of table.querySelectorAll<HTMLElement>(
    "tr[data-game-filter]",
  )) {
    const haystack = row.dataset["gameFilter"] ?? "";
    const match = terms.every((term) => haystack.includes(term));
    row.hidden = !match;
    if (match) visible += 1;
  }
  return visible;
}

/** Connects the games filter control to its table, status line, and empty state. */
export function enhanceGameFilter(root: ParentNode, signal: AbortSignal): void {
  const filter = root.querySelector<HTMLElement>("[data-game-filter-control]");
  const input = root.querySelector<HTMLInputElement>(
    "[data-game-filter-control] input",
  );
  const status = root.querySelector<HTMLElement>("[data-game-filter-status]");
  const empty = root.querySelector<HTMLElement>("[data-game-filter-empty]");
  const table = root.querySelector<HTMLElement>(".capability-table");
  if (filter === null || input === null || table === null) return;
  const total = table.querySelectorAll("tr[data-game-filter]").length;

  const update = (): void => {
    const visible = filterGameRows(table, input.value);
    const filtered = input.value.trim().length > 0;
    if (status !== null) {
      status.textContent = filtered
        ? `${visible} of ${total} games`
        : `${total} games`;
    }
    if (empty !== null) empty.hidden = visible > 0;
  };

  input.addEventListener("input", update, { signal });
  input.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || input.value.length === 0) return;
      event.preventDefault();
      input.value = "";
      update();
    },
    { signal },
  );
  filter.hidden = false;
  update();
}
