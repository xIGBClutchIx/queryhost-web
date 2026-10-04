import type { ReactNode } from "react";
import { Callout, DocsLayout } from "@queryhost/web";

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

export const ResultSemantics = () => (
  <Page width={1200}>
    <DocsLayout
      activeHref="/results/"
      eyebrow="Response contract"
      title="Result semantics"
      description="QueryHost separates normalized server facts, typed game data, untouched protocol data, and source provenance."
      hostname="docs.query.host"
    >
      <h2 id="server">Normalized server fields</h2>
      <p>
        <code>server</code> contains only concepts shared honestly across games:
        name, map, version, password state, player counts, and the primary query
        round-trip time. Every property is optional because a protocol may not
        confirm it.
      </p>
      <Callout title="Missing is not empty">
        <p>
          An omitted player list means QueryHost could not confirm it. An empty
          player list means a source completed and confirmed no listed players.
        </p>
      </Callout>
      <h2 id="data">Game-specific data</h2>
      <p>
        <code>data</code> is selected by the canonical game ID. Rust tags,
        Minecraft MOTDs and plugins, Project Zomboid mods, and FiveM resources
        stay in their game-specific types.
      </p>
    </DocsLayout>
  </Page>
);

export const FromHtml = () => (
  <Page width={1200}>
    <DocsLayout
      activeHref="/changelog/"
      eyebrow="Releases"
      title="Changelog"
      description="Every published QueryHost release, newest first."
      hostname="docs.query.host"
      html={
        "<h2>1.3.0</h2><ul><li>Add Vintage Story status queries.</li><li>Report source round-trip times in <code>sources</code>.</li></ul><h2>1.2.0</h2><ul><li>Add Satisfactory lightweight and health queries.</li></ul>"
      }
    />
  </Page>
);
