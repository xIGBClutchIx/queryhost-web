import { memo, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  apiCurlCommand,
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
  minecraftSummary,
  shareUrl,
} from "../../lib/playground-form.js";
import { TabPanel, Tabs } from "../Tabs.js";
import { useStuck } from "./use-stuck.js";
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

export type ResultTab = (typeof RESULT_TABS)[number]["id"];

const TAB_PREFIX = "query";

interface QueryResultProps {
  /** Whether Auto detection chose the game. */
  readonly detected?: boolean;
  readonly games: readonly PlaygroundGameDefinition[];
  /** The query that produced the result; enables the share link and badge. */
  readonly input?: PlaygroundQueryInput;
  /** Runs the result's query again; must be stable to keep the result memoized. */
  readonly onRefresh?: (input: PlaygroundQueryInput) => void;
  /**
   * Reports tab changes, so a caller holding `tab` can keep the view across a
   * refresh; must be stable to keep the result memoized.
   */
  readonly onTabChange?: (tab: ResultTab) => void;
  readonly result: PlaygroundQueryResponse;
  /** The active tab when the caller owns it; otherwise the result does. */
  readonly tab?: ResultTab;
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
  onTabChange,
  result,
  tab,
}: QueryResultProps): ReactNode {
  const [ownTab, setOwnTab] = useState<ResultTab>(tab ?? "overview");
  const activeTab = tab ?? ownTab;
  const setActiveTab = (next: ResultTab): void => {
    setOwnTab(next);
    onTabChange?.(next);
  };
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
      badgeImage: badge.href,
      badgeInput: target,
      badgeMarkdown: badgeMarkdown(gameName, badge, badgeTarget),
      badgeTarget: badgeTarget.href,
      gameName,
      origin,
      result: shareUrl(origin, input, games).href,
    };
    return share;
  }, [games, input]);

  const identityRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const pinned = useStuck(identityRef, barRef);

  const state = result.ok ? (result.partial ? "partial" : "online") : "offline";
  const status = result.ok
    ? result.partial
      ? "Online · partial"
      : "Online"
    : "Unreachable";
  const rawName = result.ok ? result.server.name : undefined;
  // Show names without game formatting codes; the JSON view keeps the raw value.
  const reportedName =
    rawName === undefined ? undefined : displayServerText(result.game, rawName);
  const named =
    result.ok && reportedName !== undefined && reportedName.trim() !== "";
  const address = input === undefined ? undefined : targetLabel(input, game);
  // A reported name is the title; otherwise, as for every Minecraft status ping
  // and every failure, the queried address is.
  const name = named
    ? reportedName
    : (address ?? (result.ok ? "Unnamed server" : "Unreachable server"));
  const icon = result.ok
    ? minecraftSummary(result.game, result.data)?.favicon
    : undefined;
  const refresh =
    input === undefined || onRefresh === undefined
      ? undefined
      : () => {
          onRefresh(input);
        };

  return (
    <div className="query-result" id="query-result">
      <header
        className={`query-result__identity is-${state}`}
        ref={identityRef}
      >
        {icon !== undefined && (
          <img
            className="query-result__icon"
            src={icon}
            alt=""
            width={64}
            height={64}
            decoding="async"
          />
        )}
        <div className="query-result__who">
          <p className="query-result__line">
            <span className="query-result__status" id="query-result-status">
              {status}
            </span>
            {detected && (
              <span
                className="query-result__detected"
                id="query-result-detected"
              >
                Detected
              </span>
            )}
            <span className="query-result__game">
              {game?.name ?? result.game}
            </span>
          </p>
          {/* A long name is cut short with an ellipsis; the title keeps it whole. */}
          <h2 id="query-result-name" title={name}>
            {name}
          </h2>
          {/* Only what the panels below do not show: the address behind a
              reported name, or why the query failed. */}
          <p className="query-result__subtitle" id="query-result-subtitle">
            {result.ok ? (named ? address : undefined) : result.error.message}
          </p>
        </div>
        <div className="query-result__actions">
          <FreshnessChip onRefresh={refresh} result={result} />
          {links !== undefined && <ShareMenu links={links} />}
        </div>
      </header>

      <div
        className={pinned ? "query-result__bar is-pinned" : "query-result__bar"}
        ref={barRef}
      >
        {/* Once the header scrolls away, the pinned bar repeats its essentials. */}
        {pinned && (
          <p className="query-result__pinned-name" aria-hidden="true">
            {icon !== undefined && <img src={icon} alt="" />}
            <span title={name}>{name}</span>
          </p>
        )}
        <Tabs
          className="query-tabs"
          label="Query result views"
          idPrefix={TAB_PREFIX}
          tabs={RESULT_TABS}
          active={activeTab}
          onChange={setActiveTab}
        />
        {pinned && (
          <div className="query-result__actions">
            <FreshnessChip compact onRefresh={refresh} result={result} />
            {links !== undefined && (
              <ShareMenu idSuffix="-pinned" links={links} />
            )}
          </div>
        )}
      </div>

      <TabPanel
        className="query-panel"
        idPrefix={TAB_PREFIX}
        id="overview"
        active={activeTab}
      >
        <OverviewPanel result={result} />
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

/**
 * How fresh the result is and how long it took. With `onRefresh`, the chip is
 * also the control that queries the server again.
 */
function FreshnessChip({
  compact = false,
  onRefresh,
  result,
}: {
  /** Shows only the duration, for the pinned bar. */
  readonly compact?: boolean;
  readonly onRefresh: (() => void) | undefined;
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const freshness = cacheLabel(result.cache);
  const duration = milliseconds(result.durationMs);
  const content = (
    <>
      {onRefresh !== undefined && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M19.5 4.5v4h-4" />
        </svg>
      )}
      {!compact && <span>{freshness} · </span>}
      <strong>{duration}</strong>
    </>
  );
  if (onRefresh === undefined) {
    return (
      <span className="query-freshness" title={freshness}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="query-freshness"
      id={compact ? "query-result-refresh-pinned" : "query-result-refresh"}
      aria-label={`Query again. ${freshness}, ${duration}.`}
      title="Query again"
      onClick={onRefresh}
    >
      {content}
    </button>
  );
}
