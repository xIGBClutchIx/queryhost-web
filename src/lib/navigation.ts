export interface NavigationItem {
  readonly href: string;
  readonly label: string;
}

export interface NavigationSection {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const DOCUMENTATION_NAVIGATION: readonly NavigationSection[] = [
  {
    label: "Start",
    items: [
      { href: "/", label: "Getting started" },
      { href: "/querying/", label: "Query a server" },
      { href: "/results/", label: "Result semantics" },
      { href: "/changelog/", label: "Changelog" },
    ],
  },
  {
    label: "Guide",
    items: [
      { href: "/games/", label: "Supported games" },
      { href: "/errors/", label: "Errors and warnings" },
      { href: "/public-api/", label: "Public API" },
      { href: "/hosted-service/", label: "Hosted service" },
      { href: "/webmcp/", label: "WebMCP tools" },
    ],
  },
  {
    label: "Reference",
    items: [{ href: "/reference/", label: "API reference" }],
  },
] as const;

export interface AdjacentPages {
  readonly next?: NavigationItem;
  readonly previous?: NavigationItem;
}

/** Neighbors of `href` in reading order; pages outside the main sequence have none. */
export function adjacentDocumentationPages(
  href: string,
  sections: readonly NavigationSection[] = DOCUMENTATION_NAVIGATION,
): AdjacentPages {
  const items = sections.flatMap((section) => section.items);
  const index = items.findIndex((item) => item.href === href);
  if (index === -1) return {};
  const previous = items[index - 1];
  const next = items[index + 1];
  return {
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  };
}
