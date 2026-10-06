// Wires the progressive enhancements in ../lib/page-enhancements.ts to every page,
// including pages swapped in by Astro's client router.
import {
  copyCodeBlock,
  enhanceGameFilter,
  highlightTableOfContents,
  renderTableOfContents,
  revealCodeCopyButtons,
  tableOfContentsEntries,
} from "../lib/page-enhancements.ts";

function clipboard(): Clipboard | undefined {
  // `navigator.clipboard` is absent outside secure contexts despite its DOM type.
  return window.isSecureContext && "clipboard" in navigator
    ? navigator.clipboard
    : undefined;
}

function onCopyClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-code-copy]");
  const available = clipboard();
  if (button === null || available === undefined) return;
  void copyCodeBlock(button, available);
}

function headerOffset(): number {
  const header = document.querySelector(".topbar");
  return (header?.getBoundingClientRect().height ?? 0) + 24;
}

function enhanceTableOfContents(signal: AbortSignal): void {
  const toc = document.querySelector<HTMLElement>("[data-doc-toc]");
  const prose = document.querySelector<HTMLElement>(".doc-prose");
  if (toc === null || prose === null) return;
  const entries = tableOfContentsEntries(prose);
  renderTableOfContents(toc, entries);
  if (toc.hidden) return;

  const headings = entries
    .map((entry) => document.getElementById(entry.id))
    .filter((heading) => heading !== null);
  let frame = 0;
  const update = (): void => {
    frame = 0;
    const root = document.documentElement;
    const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
    highlightTableOfContents(toc, headings, headerOffset(), atEnd);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    },
    { passive: true, signal },
  );
  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
  });
  update();
}

let pageScope: AbortController | undefined;

function enhancePage(): void {
  pageScope?.abort();
  pageScope = new AbortController();
  revealCodeCopyButtons(document, clipboard());
  enhanceTableOfContents(pageScope.signal);
  enhanceGameFilter(document, pageScope.signal);
}

document.addEventListener("click", onCopyClick);
document.addEventListener("astro:page-load", enhancePage);
document.addEventListener("astro:before-swap", () => {
  pageScope?.abort();
});
