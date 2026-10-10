import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { badgeMarkdown, badgeUrl } from "../../lib/badge-url.js";
import type {
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import {
  minecraftEdition,
  stripMinecraftFormatting,
} from "../../lib/minecraft-text.js";
import {
  cacheLabel,
  milliseconds,
  shareUrl,
} from "../../lib/playground-form.js";
import { TabPanel, Tabs } from "../Tabs.js";
import { DataPanel } from "./result/DataPanel.js";
import { JsonPanel } from "./result/JsonPanel.js";
import { OverviewPanel } from "./result/OverviewPanel.js";
import { ShareLinkButton } from "./result/ShareLinkButton.js";
import { SourcesPanel } from "./result/SourcesPanel.js";
import "../../styles/playground.css";

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
  /** The query that produced the result; enables the share link and badge. */
  readonly input?: PlaygroundQueryInput;
  readonly result: PlaygroundQueryResponse;
}

/**
 * One rendered query result. It is memoized so typing in the form never re-renders
 * large player, rule, or JSON views.
 */
export const QueryResult = memo(function QueryResult({
  games,
  input,
  result,
}: QueryResultProps): ReactNode {
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const links = useMemo(() => {
    if (input === undefined) return undefined;
    const { origin } = window.location;
    const target = {
      game: input.game,
      host: input.host,
      ...(input.port === undefined ? {} : { port: input.port }),
      ...(input.queryPort === undefined ? {} : { queryPort: input.queryPort }),
    };
    const gameName =
      games.find((game) => game.id === input.game)?.name ?? input.game;
    return {
      badge: badgeMarkdown(
        gameName,
        badgeUrl(origin, target),
        shareUrl(origin, target, games),
      ),
      result: shareUrl(origin, input, games).href,
    };
  }, [games, input]);

  const status = result.ok
    ? result.partial
      ? "Online · partial"
      : "Online"
    : "Offline or unreachable";
  const edition = minecraftEdition(result.game);
  const rawName = result.ok ? result.server.name : undefined;
  // Show Minecraft names without their `§` codes; the JSON view keeps the raw value.
  const name = result.ok
    ? rawName === undefined
      ? "Unnamed server"
      : edition === undefined
        ? rawName
        : stripMinecraftFormatting(rawName, edition) || "Unnamed server"
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
          {links !== undefined && <ShareLinkButton url={links.result} />}
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
        <JsonPanel badge={links?.badge} result={result} />
      </TabPanel>
    </div>
  );
});
