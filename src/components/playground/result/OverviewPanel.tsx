import type { CSSProperties } from "preact";
import type { ReactNode } from "react";

import type { PlaygroundQueryResponse } from "../../../lib/playground-contracts.js";
import {
  milliseconds,
  minecraftSummary,
} from "../../../lib/playground-form.js";
import { motdHtmlSegments } from "../../../lib/minecraft-presentation.js";
import { minecraftEdition } from "../../../lib/minecraft-text.js";
import {
  formatPlayerCount,
  playerFillRatio,
} from "../../../lib/player-count.js";
import { queryPathItems } from "../../../lib/query-path.js";
import { displayServerText } from "../../../lib/server-text.js";
import { MinecraftSegments, MinecraftText } from "./MinecraftText.js";

interface OverviewRow {
  readonly fill?: number;
  readonly label: string;
  readonly value: string;
}

/** Headline facts, players first; the game itself is named in the result header. */
function overviewRows(result: PlaygroundQueryResponse): readonly OverviewRow[] {
  const rows: OverviewRow[] = [];
  if (!result.ok) {
    rows.push({ label: "Error", value: result.error.code });
    if (result.error.source !== undefined) {
      rows.push({ label: "Required source", value: result.error.source });
    }
    return rows;
  }

  const { server } = result;
  if (server.players !== undefined) {
    const fill = playerFillRatio(server.players);
    rows.push({
      label: "Players",
      value: formatPlayerCount(server.players),
      ...(fill === undefined ? {} : { fill }),
    });
  }
  if (server.map !== undefined) {
    rows.push({
      label: "Map",
      value: displayServerText(result.game, server.map),
    });
  }
  if (server.version !== undefined) {
    rows.push({
      label: "Version",
      value: displayServerText(result.game, server.version),
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
      <ol style={{ "--query-path-count": String(pathItems.length) }}>
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
  // The server icon belongs to the result header; this block is the MOTD alone.
  if (
    summary === undefined ||
    edition === undefined ||
    (summary.motdHtml === undefined && summary.motdPlain === undefined)
  ) {
    return <div className="query-game-summary" hidden />;
  }
  // The HTML MOTD is rebuilt from its allow-listed vocabulary with readable colors;
  // anything unexpected falls back to the plain MOTD.
  const motdSegments =
    summary.motdHtml === undefined || typeof document === "undefined"
      ? undefined
      : motdHtmlSegments(document, summary.motdHtml);
  return (
    <div className="query-game-summary">
      <div>
        <span>Message of the day</span>
        <p>
          {motdSegments === undefined ? (
            <MinecraftText edition={edition} text={summary.motdPlain ?? ""} />
          ) : (
            <MinecraftSegments segments={motdSegments} />
          )}
        </p>
      </div>
    </div>
  );
}

interface OverviewPanelProps {
  readonly result: PlaygroundQueryResponse;
}

/**
 * Top to bottom: what the server says (its MOTD), its headline facts and any
 * warnings, then how QueryHost reached it.
 */
export function OverviewPanel({ result }: OverviewPanelProps): ReactNode {
  return (
    <>
      <MinecraftSummaryView result={result} />
      <dl className="query-overview">
        {overviewRows(result).map((row) => (
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
      <QueryPath result={result} />
    </>
  );
}
