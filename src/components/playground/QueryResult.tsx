import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  apiCurlCommand,
  badgeHtml,
  badgeMarkdown,
  badgeUrl,
} from "../../lib/badge-url.js";
import type {
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import { displayServerText } from "../../lib/server-text.js";
import {
  cacheLabel,
  milliseconds,
  shareUrl,
} from "../../lib/playground-form.js";
import { TabPanel, Tabs } from "../Tabs.js";
import { DataPanel } from "./result/DataPanel.js";
import { JsonPanel } from "./result/JsonPanel.js";
import { OverviewPanel } from "./result/OverviewPanel.js";
import { ShareMenu, type ShareLinks } from "./result/ShareMenu.js";
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
  /** Whether Auto detection chose the game. */
  readonly detected?: boolean;
  readonly games: readonly PlaygroundGameDefinition[];
  /** The query that produced the result; enables the share link and badge. */
  readonly input?: PlaygroundQueryInput;
  /** Runs the result's query again; must be stable to keep the result memoized. */
  readonly onRefresh?: (input: PlaygroundQueryInput) => void;
  readonly result: PlaygroundQueryResponse;
}

/** The queried address, with its port only when it differs from the profile default. */
function targetLabel(
  input: PlaygroundQueryInput,
  game: PlaygroundGameDefinition | undefined,
): string {
  const host = input.host.includes(":") ? `[${input.host}]` : input.host;
  return input.port === undefined || input.port === game?.defaultPort
    ? input.host
    : `${host}:${String(input.port)}`;
}

/**
 * One rendered query result. It is memoized so typing in the form never re-renders
 * large player, rule, or JSON views.
 */
export const QueryResult = memo(function QueryResult({
  detected = false,
  games,
  input,
  onRefresh,
  result,
}: QueryResultProps): ReactNode {
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const game = games.find((candidate) => candidate.id === result.game);
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
      games.find((candidate) => candidate.id === input.game)?.name ??
      input.game;
    const badge = badgeUrl(origin, target);
    const badgeTarget = shareUrl(origin, target, games);
    const share: ShareLinks = {
      apiCommand: apiCurlCommand(origin, input),
      badgeHtml: badgeHtml(gameName, badge, badgeTarget),
      badgeImage: badge.href,
      badgeLabel: `${gameName} server status`,
      badgeMarkdown: badgeMarkdown(gameName, badge, badgeTarget),
      result: shareUrl(origin, input, games).href,
    };
    return share;
  }, [games, input]);

  const status = result.ok
    ? result.partial
      ? "Online · partial"
      : "Online"
    : "Offline or unreachable";
  const rawName = result.ok ? result.server.name : undefined;
  // Show names without game formatting codes; the JSON view keeps the raw value.
  const reportedName =
    rawName === undefined ? undefined : displayServerText(result.game, rawName);
  // Servers that report no name, such as every Minecraft status ping, are titled
  // by the address that was queried.
  const name = result.ok
    ? reportedName !== undefined && reportedName.trim() !== ""
      ? reportedName
      : input === undefined
        ? "Unnamed server"
        : targetLabel(input, game)
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
            <p id="query-result-status">
              {status}
              {detected && (
                <span
                  className="query-result__detected"
                  id="query-result-detected"
                >
                  Detected: {game?.name ?? result.game}
                </span>
              )}
            </p>
            <h2 id="query-result-name">{name}</h2>
          </div>
          <div className="query-result__actions">
            {links !== undefined && <ShareMenu links={links} />}
            {input !== undefined && onRefresh !== undefined && (
              <RefreshButton
                onClick={() => {
                  onRefresh(input);
                }}
              />
            )}
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
        <JsonPanel badge={links?.badgeMarkdown} result={result} />
      </TabPanel>
    </div>
  );
});

/** A quiet icon beside the share link that runs the same query again. */
function RefreshButton({
  onClick,
}: {
  readonly onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="query-result__share"
      id="query-result-refresh"
      aria-label="Query this server again"
      title="Query this server again"
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
        <path d="M19.5 4.5v4h-4" />
      </svg>
    </button>
  );
}
