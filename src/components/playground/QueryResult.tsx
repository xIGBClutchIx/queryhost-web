import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import type {
  JsonObject,
  PlaygroundGameDefinition,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import {
  cacheLabel,
  milliseconds,
  minecraftSummary,
  readableKey,
  scalarText,
} from "../../lib/playground-form.js";
import { formatPlayerCount, playerFillRatio } from "../../lib/player-count.js";
import { queryPathItems } from "../../lib/query-path.js";

const RESULT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "data", label: "Game data" },
  { id: "sources", label: "Sources" },
  { id: "json", label: "JSON" },
] as const;

type ResultTab = (typeof RESULT_TABS)[number]["id"];

interface QueryResultProps {
  readonly games: readonly PlaygroundGameDefinition[];
  readonly result: PlaygroundQueryResponse;
}

interface OverviewRow {
  readonly fill?: number;
  readonly label: string;
  readonly value: string;
}

function overviewRows(
  result: PlaygroundQueryResponse,
  games: readonly PlaygroundGameDefinition[],
): readonly OverviewRow[] {
  const rows: OverviewRow[] = [
    {
      label: "Game",
      value:
        games.find((candidate) => candidate.id === result.game)?.name ??
        result.game,
    },
  ];
  if (!result.ok) {
    rows.push({ label: "Error", value: result.error.code });
    if (result.error.source !== undefined) {
      rows.push({ label: "Required source", value: result.error.source });
    }
    return rows;
  }

  const { server } = result;
  if (server.map !== undefined) rows.push({ label: "Map", value: server.map });
  if (server.version !== undefined) {
    rows.push({ label: "Version", value: server.version });
  }
  if (server.players !== undefined) {
    const fill = playerFillRatio(server.players);
    rows.push({
      label: "Players",
      value: formatPlayerCount(server.players),
      ...(fill === undefined ? {} : { fill }),
    });
  }
  if (server.password !== undefined) {
    rows.push({
      label: "Password",
      value: server.password ? "Required" : "Not required",
    });
  }
  if (server.queryRttMs !== undefined) {
    rows.push({ label: "Query RTT", value: milliseconds(server.queryRttMs) });
  }
  return rows;
}

function DataList({ data }: { readonly data: JsonObject }): ReactNode {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="query-data-empty">
        This server did not return game-specific fields.
      </p>
    );
  }
  return entries.map(([key, value]) => {
    const scalar = scalarText(value);
    return (
      <div key={key}>
        <span>{readableKey(key)}</span>
        <div>
          {scalar ?? (
            <pre>
              <code>{JSON.stringify(value, null, 2)}</code>
            </pre>
          )}
        </div>
      </div>
    );
  });
}

function MinecraftSummaryView({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const summary = result.ok
    ? minecraftSummary(result.game, result.data)
    : undefined;
  if (summary === undefined) {
    return <div className="query-game-summary" hidden />;
  }
  const hasMotd =
    summary.motdHtml !== undefined || summary.motdPlain !== undefined;
  return (
    <div className="query-game-summary">
      {summary.favicon !== undefined && (
        <img
          src={summary.favicon}
          alt="Minecraft server favicon"
          width={64}
          height={64}
          decoding="async"
        />
      )}
      {hasMotd && (
        <div>
          <span>Message of the day</span>
          {summary.motdHtml === undefined ? (
            <p>{summary.motdPlain}</p>
          ) : (
            <p
              // QueryHost emits only escaped text and allow-listed formatting here.
              dangerouslySetInnerHTML={{ __html: summary.motdHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CopyJsonButton({ text }: { readonly text: string }): ReactNode {
  const [label, setLabel] = useState("Copy JSON");
  const resetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            if (!mounted.current) return;
            setLabel("Copied");
            window.clearTimeout(resetTimer.current);
            resetTimer.current = window.setTimeout(() => {
              setLabel("Copy JSON");
            }, 1_500);
          },
          () => {
            if (mounted.current) setLabel("Copy failed");
          },
        );
      }}
    >
      {label}
    </button>
  );
}

/**
 * One rendered query result. It is memoized so typing in the form never re-renders
 * large player, rule, or JSON views.
 */
export const QueryResult = memo(function QueryResult({
  games,
  result,
}: QueryResultProps): ReactNode {
  const json = useMemo(() => JSON.stringify(result, null, 2), [result]);
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pathItems = queryPathItems(result.sources);

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (index + direction + RESULT_TABS.length) % RESULT_TABS.length;
    const next = RESULT_TABS[nextIndex];
    if (next === undefined) return;
    event.preventDefault();
    setActiveTab(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

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

        <div
          className="query-tabs"
          role="tablist"
          aria-label="Query result views"
        >
          {RESULT_TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`query-tab-${tab.id}`}
              aria-controls={`query-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="query-result__timing">
          <span id="query-result-cache">{cacheLabel(result.cache)}</span>
          <strong id="query-result-duration">
            {milliseconds(result.durationMs)}
          </strong>
        </div>
      </header>

      <div
        className="query-panel"
        id="query-panel-overview"
        role="tabpanel"
        aria-labelledby="query-tab-overview"
        hidden={activeTab !== "overview"}
      >
        <div
          className="query-path"
          id="query-path"
          aria-labelledby="query-path-label"
          hidden={pathItems.length === 0}
        >
          <span className="query-path__label" id="query-path-label">
            Query path
          </span>
          <ol
            style={
              {
                "--query-path-count": String(pathItems.length),
              } as CSSProperties
            }
          >
            {pathItems.map((item) => (
              <li
                key={item.source}
                className={`query-path__step query-path__step--${item.status}`}
                title={item.source}
              >
                <span className="query-path__node" aria-hidden="true" />
                <div>
                  <strong>{item.label}</strong>
                  <code>{item.detail}</code>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <MinecraftSummaryView result={result} />
        <dl className="query-overview">
          {overviewRows(result, games).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
              {row.fill !== undefined && (
                <span
                  className="query-overview__meter"
                  aria-hidden="true"
                  style={{ "--fill": `${row.fill * 100}%` } as CSSProperties}
                />
              )}
            </div>
          ))}
        </dl>
        <div className="query-warnings" hidden={result.warnings.length === 0}>
          <h3>Warnings</h3>
          <ul>
            {result.warnings.map((warning, index) => (
              <li key={`${warning.code}-${String(index)}`}>
                <code>{warning.code}</code>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="query-panel"
        id="query-panel-data"
        role="tabpanel"
        aria-labelledby="query-tab-data"
        hidden={activeTab !== "data"}
      >
        <div className="query-data-section">
          <h3>Game-specific data</h3>
          <div className="query-data-list">
            <DataList data={result.ok ? result.data : {}} />
          </div>
        </div>
        {result.ok && result.rawData !== undefined && (
          <div className="query-data-section">
            <h3>Raw protocol data</h3>
            <div className="query-data-list">
              <DataList data={result.rawData} />
            </div>
          </div>
        )}
      </div>

      <div
        className="query-panel"
        id="query-panel-sources"
        role="tabpanel"
        aria-labelledby="query-tab-sources"
        hidden={activeTab !== "sources"}
      >
        <div className="query-source-list">
          {result.sources.map((source) => (
            <div key={source.source}>
              <div>
                <span
                  className={`query-source-dot query-source-dot--${source.status}`}
                />
                <strong>{source.source}</strong>
                <span>{readableKey(source.status)}</span>
              </div>
              <code>
                {source.rttMs === undefined ? "—" : milliseconds(source.rttMs)}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div
        className="query-panel query-panel--json"
        id="query-panel-json"
        role="tabpanel"
        aria-labelledby="query-tab-json"
        hidden={activeTab !== "json"}
      >
        <div className="query-json-toolbar">
          <span>Hosted response</span>
          <CopyJsonButton text={json} />
        </div>
        <pre>
          <code>{json}</code>
        </pre>
      </div>
    </div>
  );
});
