// Wires the documentation search dialog to each docs page, including pages swapped in
// by Astro's client router. The index is fetched once, on first open.
import {
  connectDocsSearch,
  isDocsSearchShortcut,
} from "../lib/docs-search-dialog.ts";
import type { DocsSearchController } from "../lib/docs-search-dialog.ts";
import {
  DOCS_SEARCH_INDEX_PATH,
  parseDocsSearchIndex,
} from "../lib/docs-search.ts";
import type { DocsSearchEntry } from "../lib/docs-search.ts";

let index: Promise<readonly DocsSearchEntry[]> | undefined;

function loadIndex(): Promise<readonly DocsSearchEntry[]> {
  index ??= fetch(DOCS_SEARCH_INDEX_PATH, {
    signal: AbortSignal.timeout(10_000),
  })
    .then((response) => {
      if (!response.ok) throw new Error("Search index unavailable.");
      return response.text();
    })
    .then(parseDocsSearchIndex)
    .catch((error: Error) => {
      // Let the next open retry instead of caching the failure.
      index = undefined;
      throw error;
    });
  return index;
}

let controller: DocsSearchController | undefined;
let pageScope: AbortController | undefined;

document.addEventListener("astro:page-load", () => {
  pageScope?.abort();
  pageScope = new AbortController();
  controller = connectDocsSearch(document, loadIndex, pageScope.signal);
});
document.addEventListener("astro:before-swap", () => {
  controller?.close();
  controller = undefined;
  pageScope?.abort();
});
document.addEventListener("keydown", (event) => {
  if (controller === undefined || !isDocsSearchShortcut(event)) return;
  event.preventDefault();
  controller.toggle();
});
