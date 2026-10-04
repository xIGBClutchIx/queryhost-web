import type { ReactNode } from "react";
import { Header } from "@queryhost/web";

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

export const Site = () => (
  <Page>
    <Header active="site" hostname="query.host" />
  </Page>
);

export const Docs = () => (
  <Page>
    <Header active="docs" hostname="docs.query.host" />
  </Page>
);
