import { memo, useState } from "react";
import type { ReactNode } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import { cacheLabel, milliseconds } from "../../lib/playground-form.js";
import { TabPanel, Tabs } from "../Tabs.js";
import { DataPanel } from "./result/DataPanel.js";
import { JsonPanel } from "./result/JsonPanel.js";
import { OverviewPanel } from "./result/OverviewPanel.js";
import { SourcesPanel } from "./result/SourcesPanel.js";

const RESULT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "data", label: "Game data" },
  { id: "sources", label: "Sources" },
  { id: "json", label: "JSON" },
] as const;

type ResultTab = (typeof RESULT_TABS)[number]["id"];

const TAB_PREFIX = "query";

interface QueryResultProps {
  readonly games: readonly PlaygroundGameDefinition[];
  readonly result: PlaygroundQueryResponse;
}

/**
 * One rendered query result. It is memoized so typing in the form never re-renders
 * large player, rule, or JSON views.
 */
export const QueryResult = memo(function QueryResult({
  games,
  result,
}: QueryResultProps): ReactNode {
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");

  const status = result.ok
    ? result.partial
      ? "Online · partial"
      : "Online"
    : "Offline or unreachable";
  const name = result.ok
    ? (result.server.name ?? "Unnamed server")
    : result.error.message;
  const dot = result.ok
    ? result.partial
      ? "is-partial"
      : "is-online"
    : "is-offline";

  return (
    <div className="query-result" id="query-result">
      <header className="query-result__toolbar">
        <div className="query-result__state">
          <span id="query-result-dot" className={dot} aria-hidden="true" />
          <div>
            <p id="query-result-status">{status}</p>
            <h2 id="query-result-name">{name}</h2>
          </div>
        </div>

        <Tabs
          className="query-tabs"
          label="Query result views"
          idPrefix={TAB_PREFIX}
          tabs={RESULT_TABS}
          active={activeTab}
          onChange={setActiveTab}
        />

        <div className="query-result__timing">
          <span id="query-result-cache">{cacheLabel(result.cache)}</span>
          <strong id="query-result-duration">
            {milliseconds(result.durationMs)}
          </strong>
        </div>
      </header>

      <TabPanel
        className="query-panel"
        idPrefix={TAB_PREFIX}
        id="overview"
        active={activeTab}
      >
        <OverviewPanel games={games} result={result} />
      </TabPanel>
      <TabPanel
        className="query-panel"
        idPrefix={TAB_PREFIX}
        id="data"
        active={activeTab}
      >
        <DataPanel result={result} />
      </TabPanel>
      <TabPanel
        className="query-panel"
        idPrefix={TAB_PREFIX}
        id="sources"
        active={activeTab}
      >
        <SourcesPanel result={result} />
      </TabPanel>
      <TabPanel
        className="query-panel query-panel--json"
        idPrefix={TAB_PREFIX}
        id="json"
        active={activeTab}
      >
        <JsonPanel result={result} />
      </TabPanel>
    </div>
  );
});
