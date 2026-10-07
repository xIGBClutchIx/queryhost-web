import type { CSSProperties, ReactNode } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundQueryResponse,
} from "../../../lib/playground-contracts.js";
import {
  milliseconds,
  minecraftSummary,
} from "../../../lib/playground-form.js";
import { minecraftEdition } from "../../../lib/minecraft-text.js";
import {
  formatPlayerCount,
  playerFillRatio,
} from "../../../lib/player-count.js";
import { queryPathItems } from "../../../lib/query-path.js";
import { MinecraftText } from "./MinecraftText.js";

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

function QueryPath({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const pathItems = queryPathItems(result.sources);
  return (
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
  );
}

function MinecraftSummaryView({
  result,
}: {
  readonly result: PlaygroundQueryResponse;
}): ReactNode {
  const summary = result.ok
    ? minecraftSummary(result.game, result.data)
    : undefined;
  const edition = minecraftEdition(result.game);
  if (summary === undefined || edition === undefined) {
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
            <p>
              <MinecraftText edition={edition} text={summary.motdPlain ?? ""} />
            </p>
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

interface OverviewPanelProps {
  readonly games: readonly PlaygroundGameDefinition[];
  readonly result: PlaygroundQueryResponse;
}

/** Query path, Minecraft summary, headline server facts, and warnings. */
export function OverviewPanel({
  games,
  result,
}: OverviewPanelProps): ReactNode {
  return (
    <>
      <QueryPath result={result} />
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
    </>
  );
}
