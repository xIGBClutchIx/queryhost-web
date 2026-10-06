import { useState } from "react";
import type { ReactNode } from "react";
import { TabPanel, Tabs } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page surface.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}

/** A TabPanel only renders inside a Tabs composition that shares its idPrefix. */
export function SelectedPanel(): ReactNode {
  const [active, setActive] = useState<"summary" | "players">("players");
  return (
    <Page>
      <Tabs
        className="query-tabs"
        idPrefix="preview-panel"
        label="Server details"
        tabs={[
          { id: "summary", label: "Summary" },
          { id: "players", label: "Players" },
        ]}
        active={active}
        onChange={setActive}
      />
      <div style={{ paddingTop: 16 }}>
        <TabPanel id="summary" active={active} idPrefix="preview-panel">
          <p style={{ margin: 0 }}>Rusty Moose |US Main| · Procedural Map</p>
        </TabPanel>
        <TabPanel id="players" active={active} idPrefix="preview-panel">
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
            <li>184 of 200 players online</li>
            <li>Player list returned by A2S</li>
          </ul>
        </TabPanel>
      </div>
    </Page>
  );
}
