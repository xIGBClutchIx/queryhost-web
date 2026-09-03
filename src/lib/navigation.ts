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
    ],
  },
  {
    label: "Guide",
    items: [
      { href: "/games/", label: "Supported games" },
      { href: "/errors/", label: "Errors and warnings" },
      { href: "/hosted-service/", label: "Hosted service" },
      { href: "/webmcp/", label: "WebMCP tools" },
    ],
  },
  {
    label: "Reference",
    items: [{ href: "/reference/", label: "API reference" }],
  },
] as const;
