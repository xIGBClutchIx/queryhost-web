import type { ReactNode } from "react";
import { DocsSidebar } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so the sidebar sits on its docs column.
function Column({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <aside
      className="docs-sidebar"
      style={{
        background: "var(--background)",
        color: "var(--text)",
        width: 260,
        padding: 16,
      }}
    >
      {children}
    </aside>
  );
}

export function GettingStarted(): ReactNode {
  return (
    <Column>
      <DocsSidebar activeHref="/" hostname="docs.query.host" />
    </Column>
  );
}

/** Inside the API reference, the sidebar lists the current reference module's pages. */
export function ReferenceContext(): ReactNode {
  return (
    <Column>
      <DocsSidebar
        activeHref="/reference/query/"
        hostname="docs.query.host"
        reference={{
          label: "queryhost",
          items: [
            { href: "/reference/query/", label: "query()" },
            { href: "/reference/list-games/", label: "listGames()" },
            { href: "/reference/server-info/", label: "ServerInfo" },
            { href: "/reference/query-error/", label: "QueryError" },
          ],
        }}
      />
    </Column>
  );
}
