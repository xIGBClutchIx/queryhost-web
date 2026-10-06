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

const RESULT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "data", label: "Game data" },
  { id: "sources", label: "Sources" },
  { id: "json", label: "JSON" },
] as const;

type ResultTab = (typeof RESULT_TABS)[number]["id"];

/** The site's underlined tab style (`query-tabs`), as used by the query result. */
export function ResultViews(): ReactNode {
  const [active, setActive] = useState<ResultTab>("overview");
  return (
    <Page>
      <Tabs
        className="query-tabs"
        idPrefix="preview-result"
        label="Query result views"
        tabs={RESULT_TABS}
        active={active}
        onChange={setActive}
      />
    </Page>
  );
}

/** Tabs paired with panels; the selected panel shows, the rest stay mounted but hidden. */
export function WithPanels(): ReactNode {
  const [active, setActive] = useState<"install" | "query">("install");
  return (
    <Page>
      <Tabs
        className="query-tabs"
        idPrefix="preview-guide"
        label="Getting started steps"
        tabs={[
          { id: "install", label: "Install" },
          { id: "query", label: "First query" },
        ]}
        active={active}
        onChange={setActive}
      />
      <div style={{ paddingTop: 16, color: "var(--muted)" }}>
        <TabPanel id="install" active={active} idPrefix="preview-guide">
          <p style={{ margin: 0 }}>
            Add the <code>queryhost</code> package to a Node.js 24 project.
          </p>
        </TabPanel>
        <TabPanel id="query" active={active} idPrefix="preview-guide">
          <p style={{ margin: 0 }}>
            Call <code>query()</code> with a game, host, and optional port.
          </p>
        </TabPanel>
      </div>
    </Page>
  );
}
