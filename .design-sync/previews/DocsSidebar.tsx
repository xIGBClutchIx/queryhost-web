import type { ReactNode } from "react";
import { DocsSidebar } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({
  children,
  width = 1040,
  height,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        width,
        minHeight: height,
      }}
    >
      {children}
    </div>
  );
}

export const Default = () => (
  <Page width={280}>
    <aside
      className="docs-sidebar"
      style={{ position: "static", height: "auto" }}
    >
      <DocsSidebar activeHref="/results/" hostname="docs.query.host" />
    </aside>
  </Page>
);

export const WithReferenceContext = () => (
  <Page width={280}>
    <aside
      className="docs-sidebar"
      style={{ position: "static", height: "auto" }}
    >
      <DocsSidebar
        activeHref="/reference/functions/query/"
        hostname="docs.query.host"
        reference={{
          label: "Functions",
          items: [
            { href: "/reference/functions/query/", label: "query" },
            { href: "/reference/functions/listGames/", label: "listGames" },
            {
              href: "/reference/functions/getGameDefinition/",
              label: "getGameDefinition",
            },
          ],
        }}
      />
    </aside>
  </Page>
);
