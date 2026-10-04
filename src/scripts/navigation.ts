// Document-level navigation behavior shared by every server-rendered page. It is plain
// DOM code, so documentation pages stay free of a React runtime.

function preventRedundantNavigation(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (
    link === null ||
    link.hasAttribute("download") ||
    link.hasAttribute("data-astro-reload") ||
    new URL(link.href).hash !== "" ||
    (link.target !== "" && link.target !== "_self") ||
    new URL(link.href).href !== window.location.href
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

function closeMobileDocumentationMenu(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const menu = document.querySelector<HTMLDetailsElement>(
    ".docs-mobile-nav details[open]",
  );
  if (menu === null) return;
  menu.open = false;
  menu.querySelector<HTMLElement>("summary")?.focus();
}

let sidebarScroll = 0;

function rememberSidebarScroll(): void {
  sidebarScroll = document.querySelector(".docs-nav")?.scrollTop ?? 0;
}

function synchronizeActiveDocumentationLink(): void {
  const navigation = document.querySelector<HTMLElement>(".docs-nav");
  if (navigation === null) {
    return;
  }
  navigation.scrollTop = sidebarScroll;

  const currentPath = window.location.pathname;
  for (const link of navigation.querySelectorAll<HTMLAnchorElement>("a")) {
    const active = new URL(link.href).pathname === currentPath;
    link.classList.toggle("is-active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

window.addEventListener("click", preventRedundantNavigation, true);
document.addEventListener("keydown", closeMobileDocumentationMenu);
document.addEventListener("astro:before-swap", rememberSidebarScroll);
document.addEventListener(
  "astro:page-load",
  synchronizeActiveDocumentationLink,
);
document.addEventListener(
  "astro:after-swap",
  synchronizeActiveDocumentationLink,
);
