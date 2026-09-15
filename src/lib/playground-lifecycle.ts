import { initializePlayground } from "./playground-browser.js";

let current: HTMLElement | undefined;
let cleanup: (() => void) | undefined;

function dispose(): void {
  cleanup?.();
  cleanup = undefined;
  current = undefined;
}

function initialize(): void {
  const root = document.querySelector<HTMLElement>(".playground");
  if (root === current) return;
  dispose();
  if (root === null) return;
  current = root;
  cleanup = initializePlayground(root);
}

// Dispose at the swap boundary, so a failed navigation leaves the current UI usable.
document.addEventListener("astro:before-swap", dispose);
document.addEventListener("astro:page-load", initialize);
window.addEventListener("pagehide", dispose);
window.addEventListener("pageshow", initialize);
initialize();
